#!/usr/bin/env python3
"""Build the public AlphaUrban dataset from the research workspace.

Small city-level tables land in dataset/ (committed to git). The pixel-level
panel and the placebo cities are written to dataset_assets/ (never committed)
and attached to a GitHub Release. Every output is hashed into
dataset/MANIFEST.json together with the hash of the workspace file it came from.

Run from the project root:
    .venv/bin/python dataset/scripts/build_dataset.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.csv as pcsv
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
PANEL = ROOT / "data" / "atlas_v2_integrated_1000"
OUT = ROOT / "dataset"
ASSETS = ROOT / "dataset_assets"
YEARS = range(2017, 2025)
ZSTD = dict(compression="zstd", compression_level=9)
ROW_GROUP = 250_000
MAX_TREE_BYTES = 90_000_000  # validation/publish_allowlist.json max_file_bytes

manifest: dict = {
    "schema": "alphaurban-dataset/1",
    "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "built_by": "dataset/scripts/build_dataset.py",
    "attribution": "The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.",
    "licence": "CC-BY 4.0",
    "join_key": "system_index",
    "tree": {},
    "release_assets": {},
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def log(*a):
    print(*a, flush=True)


def read_csv(path: Path) -> pa.Table:
    return pcsv.read_csv(path, read_options=pcsv.ReadOptions(block_size=1 << 26))


def tighten(table: pa.Table, axes_f32=True) -> pa.Table:
    cols = {}
    for name in table.column_names:
        c = table[name]
        if name.startswith("valid_"):
            c = c.cast(pa.uint8())
        elif pa.types.is_floating(c.type) and axes_f32:
            c = c.cast(pa.float32())
        cols[name] = c
    return pa.table(cols)


def harmonise(parts: list[pa.Table]) -> list[pa.Table]:
    """Cast columns so chunked exports with int/float disagreements concatenate."""
    wanted: dict[str, pa.DataType] = {}
    for t in parts:
        for f in t.schema:
            cur = wanted.get(f.name)
            if cur is None or (pa.types.is_integer(cur) and pa.types.is_floating(f.type)) \
                    or (pa.types.is_null(cur)):
                wanted[f.name] = f.type
            elif pa.types.is_string(f.type) and not pa.types.is_string(cur):
                wanted[f.name] = pa.string()
    out = []
    for t in parts:
        out.append(pa.table({n: t[n].cast(wanted[n]) if t[n].type != wanted[n] else t[n]
                             for n in t.column_names}))
    return out


def write(table: pa.Table, path: Path, source: Path | None, where: str, note: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Dictionary encoding inflates float columns; byte stream split lets zstd
    # compress them instead. Strings and integers keep dictionary encoding.
    floats = [f.name for f in table.schema if pa.types.is_floating(f.type)]
    dictionary = [f.name for f in table.schema
                  if not pa.types.is_floating(f.type) and not pa.types.is_boolean(f.type)]
    pq.write_table(table, path, row_group_size=ROW_GROUP, use_dictionary=dictionary,
                   column_encoding={n: "BYTE_STREAM_SPLIT" for n in floats}, **ZSTD)
    entry = {
        "rows": table.num_rows,
        "columns": table.num_columns,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "note": note,
    }
    if source is not None:
        entry["source"] = {"path": str(source.relative_to(ROOT)), "sha256": sha256(source)}
    key = str(path.relative_to(ROOT if where == "tree" else ASSETS))
    manifest[where][key] = entry
    if where == "tree" and entry["bytes"] > MAX_TREE_BYTES:
        log(f"  !! {key} is {entry['bytes']/1e6:.0f} MB, over the {MAX_TREE_BYTES/1e6:.0f} MB tree limit")
    log(f"  {key}: {table.num_rows:,} rows x {table.num_columns} cols, {entry['bytes']/1e6:.1f} MB")


def city_columns(names: list[str]) -> list[str]:
    """Columns that belong to the city catalogue, repeated on every row of a panel."""
    catalog = pcsv.read_csv(PANEL / "city_catalog_1000.csv").column_names
    return [n for n in names if n in catalog and n != "system_index"]


# ---------------------------------------------------------------- cities
def build_cities():
    log("cities")
    src = PANEL / "city_catalog_1000.csv"
    t = read_csv(src)
    write(t, OUT / "cities.parquet", src, "tree",
          "One row per city: sampling design, inclusion probabilities and design weights, "
          "GHS-FUA identity, country, continent, climate, HDI tertile, centroid, area.")
    (OUT / "cities.csv").write_bytes(src.read_bytes())
    manifest["tree"]["dataset/cities.csv"] = {"rows": t.num_rows, "columns": t.num_columns,
        "bytes": src.stat().st_size, "sha256": sha256(src),
        "note": "Same table as cities.parquet, as plain CSV.",
        "source": {"path": str(src.relative_to(ROOT)), "sha256": sha256(src)}}


# ---------------------------------------------------------------- city x year
def build_spherical():
    log("city_year/spherical")
    json_dupes = {"mean_components", "mu", "std_components", "var_tangent_per_axis", "top_vars", "top_bands"}
    for y in YEARS:
        src = PANEL / "spherical" / f"atlas_v2_spherical_1000_{y}.csv.gz"
        t = read_csv(src)
        drop = set(city_columns(t.column_names)) | json_dupes | {"system:index", "city_key"}
        t = tighten(t.drop_columns([c for c in t.column_names if c in drop]))
        write(t, OUT / "city_year" / f"spherical_{y}.parquet", src, "tree",
              "Spherical summary of the embedding within each city and support: N, mean "
              "resultant length Rbar, mean direction mu_A00..mu_A63, per-axis mean and "
              "standard deviation, tangent variance. 13 supports per city.")


def build_covariates():
    log("city_year/covariates")
    parts = []
    for y in YEARS:
        src = PANEL / "covariates" / f"atlas_v2_covariates_1000_{y}.csv.gz"
        t = read_csv(src)
        drop = set(city_columns(t.column_names)) | {"system:index", "city_key"}
        parts.append(tighten(t.drop_columns([c for c in t.column_names if c in drop])))
    t = pa.concat_tables(parts, promote_options="default")
    write(t, OUT / "city_year" / "covariates_2017_2024.parquet",
          PANEL / "covariates" / "atlas_v2_covariates_1000_2017_2024.csv.gz", "tree",
          "Aggregate covariates (mean, p10, p50, p90, sd; class fractions) within each "
          "city and support and year. 11 supports per city.")


# ---------------------------------------------------------------- pixels
def build_pixels():
    log("pixels (release assets)")
    drop_extra = {"source_file", "integration_source", "source_sampling_schema", "sampling_schema",
                  "covariate_sentinel", "system:index", "city_ix", "city_key"}
    for y in YEARS:
        src = PANEL / "samples" / f"atlas_v2_samples_1000_{y}.csv.gz"
        t = read_csv(src)
        drop = set(city_columns(t.column_names)) | drop_extra
        t = t.drop_columns([c for c in t.column_names if c in drop])
        axes = [n for n in t.column_names if len(n) == 3 and n[0] == "A" and n[1:].isdigit()]
        assert len(axes) == 64, axes
        arr = np.column_stack([t[a].to_numpy(zero_copy_only=False) for a in axes]).astype(np.float32)
        assert np.isfinite(arr).all()
        norms = np.linalg.norm(arr, axis=1)
        assert np.abs(norms - 1).max() < 1e-3, norms
        front = ["system_index", "sample_id", "year", "degree_ix", "smod", "sample_scale"]
        rest = [n for n in t.column_names if n not in front and n not in axes]
        t = tighten(t.select(front + axes + rest))
        write(t, ASSETS / f"pixels_{y}.parquet", src, "release_assets",
              "Pixel samples: up to 250 per city per degree-of-urbanisation support. "
              "A00..A63 are the unit-norm AlphaEarth embedding (float32); the remaining "
              "columns are pixel covariates with valid_* flags.")


def build_placebo():
    log("placebo cities 2024 (release assets)")
    d = ROOT / "data" / "derived" / "placebo_cities_canonical_v1_exports"
    for kind in ("native", "pseudo"):
        files = sorted(d.glob(f"pcb_canonical_v1_samples_{kind}_2024_ranks*.csv"))
        parts = [read_csv(f) for f in files if f.stat().st_size > 2]
        t = tighten(pa.concat_tables(harmonise(parts), promote_options="default"))
        write(t, ASSETS / f"placebo_samples_{kind}_2024.parquet", None, "release_assets",
              f"Placebo city pixel samples, {kind} placement, 2024. Concatenated from "
              f"{len(parts)} rank-chunk exports.")
    for name in ("spherical_native_pseudo_2024", "covariates_native_pseudo_2024"):
        src = d / f"pcb_canonical_v1_{name}.csv"
        write(tighten(read_csv(src)), OUT / "placebo" / f"{name}.parquet", src, "tree",
              "Placebo city summaries, native and pseudo placements, 2024.")


# ---------------------------------------------------------------- reference and S1B
def build_reference():
    log("reference")
    d = ROOT / "bakeoff_20260831" / "inputs" / "reference_land_2024"
    mass = np.load(d / "ae_global_2024_mass_land.npz")
    ctx = np.load(d / "ae_global_2024_context_labels_land.npz")
    n = mass["embeddings"].shape[0]
    cols = {"cell_id": mass["cell_id"], "sampling_design": mass["sampling_design"],
            "longitude": mass["longitude"], "latitude": mass["latitude"]}
    for k in ("continent", "koppen_code", "climate", "worldcover", "ghs_smod",
              "population_count", "population_density", "population_decile", "terrestrial"):
        cols[k] = ctx[k] if k in ctx.files else mass[k]
    pixel_id = np.arange(n, dtype=np.int32)
    ctx_table = pa.table({"pixel_id": pixel_id, **{
        k: pa.array(np.asarray(v).tolist() if v.dtype.kind == "U" else v) for k, v in cols.items()}})
    emb_table = pa.table({"pixel_id": pixel_id, **{
        f"A{i:02d}": mass["embeddings"][:, i] for i in range(64)}})
    assert np.abs(np.linalg.norm(mass["embeddings"], axis=1) - 1).max() < 1e-3
    write(ctx_table, OUT / "reference" / "global_land_2024_context.parquet",
          d / "ae_global_2024_context_labels_land.npz", "tree",
          "Global land reference, context: 247,565 equal-area-sampled land pixels for 2024 "
          "with coordinates, WorldCover, GHS-SMOD, climate and population. Join on pixel_id.")
    manifest["tree"]["dataset/reference/global_land_2024_context.parquet"]["population_decile_cuts"] = \
        ctx["population_decile_cuts"].tolist()
    write(emb_table, OUT / "reference" / "global_land_2024_embeddings.parquet",
          d / "ae_global_2024_mass_land.npz", "tree",
          "Global land reference, embeddings: unit-norm AlphaEarth vectors A00..A63 (float32) "
          "for the same 247,565 pixels, in the same row order. Join on pixel_id.")


def build_s1b():
    log("sentinel1b")
    d = ROOT / "data" / "derived"
    for src, name, note in (
        (d / "sentinel1b_outage" / "paired_global_sample_n4800_seed20211223.csv.gz",
         "paired_global_sample_n4800.parquet",
         "Global paired sample used for the Sentinel-1B outage test."),
        (d / "sentinel1b_city_support" / "s1_city_support_points_730_n8_seed20211223.csv.gz",
         "city_support_points_730.parquet",
         "Sentinel-1 support points per city (730-city cohort, 8 per city)."),
    ):
        write(tighten(read_csv(src)), OUT / "sentinel1b" / name, src, "tree", note)


if __name__ == "__main__":
    t0 = time.time()
    OUT.mkdir(exist_ok=True)
    ASSETS.mkdir(exist_ok=True)
    build_cities()
    build_spherical()
    build_covariates()
    build_reference()
    build_s1b()
    build_placebo()
    build_pixels()
    manifest["tree_bytes"] = sum(e["bytes"] for e in manifest["tree"].values())
    manifest["release_asset_bytes"] = sum(e["bytes"] for e in manifest["release_assets"].values())
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    log(f"tree {manifest['tree_bytes']/1e6:.0f} MB, release assets "
        f"{manifest['release_asset_bytes']/1e6:.0f} MB, {time.time()-t0:.0f}s")
