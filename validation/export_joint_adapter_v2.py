#!/usr/bin/env python3
"""Export the completed country-robust v3 joint-adapter run for the static site.

Only a deterministic, visual-only global sample, its observed outcomes, frozen
3D display projections, and aggregate score summaries are published. Native
64D embeddings, fitted parameters, heads, and row identifiers stay outside the
website.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
from pathlib import Path

os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT / "joint_adapter_v2_20260909"
RUN = EXPERIMENT / "robust_v3"
DESIGN = EXPERIMENT / "design.json"
SOURCE = ROOT / "counterbakeoff_20260908/site_work/embedding_adapter/data"
DESTINATION = Path(os.environ.get(
    "JOINT_ADAPTER_EXPORT", ROOT / "docs/data/joint-adapter-v2"
))
TASKS = ("ndvi", "volume", "landcover")
SEEDS = (1103, 2207, 3301)
SAMPLE_SEED = 20260909
ROWS_PER_CITY = 16
PCA_MODELS = ("baseline", "center", "g10_00", "g00_10", "g00_00")
CLASS_NAMES = {
    10: "Trees", 20: "Shrubland", 30: "Grassland", 40: "Cropland",
    50: "Built-up", 60: "Bare ground", 70: "Snow and ice",
    90: "Wetland", 95: "Mangrove", 100: "Moss and lichen",
}


def read(path: Path):
    return json.loads(path.read_text())


def compact_json(value) -> bytes:
    return (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_bytes(data: bytes) -> bytes:
    """Create byte-stable gzip across Python and operating-system versions."""
    compressed = bytearray(gzip.compress(data, compresslevel=9, mtime=0))
    compressed[9] = 255  # RFC 1952: unknown operating system.
    return bytes(compressed)


def load_npz(path: Path) -> dict[str, np.ndarray]:
    with np.load(path) as stored:
        return {key: stored[key] for key in stored.files}


def mm(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Contain known Accelerate status-flag noise and verify the result."""
    with np.errstate(over="ignore", invalid="ignore", divide="ignore", under="ignore"):
        value = np.matmul(a, b)
    if not np.isfinite(value).all():
        raise FloatingPointError("non-finite matrix product")
    return value


def forward(x: np.ndarray, params: dict[str, np.ndarray]) -> np.ndarray:
    hidden = np.tanh(mm(x * 8, params["w1"]) + params["b1"])
    residual = x + mm(hidden, params["w2"]) + params["b2"]
    return residual / np.linalg.norm(residual, axis=1, keepdims=True)


def ensemble_mean(x: np.ndarray, model_id: str) -> np.ndarray:
    values = []
    model_root = RUN / ("refinement/models" if model_id.startswith("refine_") else "models")
    for seed in SEEDS:
        stored = load_npz(model_root / model_id / f"seed_{seed}" / "model.npz")
        values.append(forward(x, {key: stored[key] for key in ("w1", "b1", "w2", "b2")}))
    return np.mean(values, axis=0, dtype=np.float32)


def visual_sample() -> tuple[np.ndarray, dict, dict[str, np.ndarray]]:
    atlas = load_npz(SOURCE / "atlas.npz")
    cover = load_npz(SOURCE / "landcover/dataset.npz")
    source_zero = cover["source"] == 0
    source_rows = cover["source_row_id"][source_zero]
    if len(source_rows) != len(atlas["x"]) or not np.array_equal(
        np.sort(source_rows), np.arange(len(atlas["x"]))
    ):
        raise AssertionError("source-0 WorldCover rows no longer map one-to-one onto the atlas")
    worldcover = np.empty(len(atlas["x"]), dtype=np.uint8)
    worldcover[source_rows] = cover["worldcover"][source_zero]
    valid = (
        np.isfinite(atlas["ndvi"]) & np.isfinite(atlas["volume"])
        & (atlas["volume"] >= 0) & (worldcover != 80)
    )
    eligible = np.flatnonzero(valid)
    rng = np.random.default_rng(SAMPLE_SEED)
    selected = []
    for city in np.unique(atlas["city"][eligible]):
        rows = eligible[atlas["city"][eligible] == city]
        selected.extend(rng.choice(rows, min(ROWS_PER_CITY, len(rows)), replace=False))
    # Preserve any rare non-water class that the per-city draw happened to miss.
    selected = set(map(int, selected))
    present = set(map(int, worldcover[list(selected)]))
    for code in np.unique(worldcover[eligible]):
        if int(code) not in present:
            selected.update(map(int, eligible[worldcover[eligible] == code]))
    index = np.asarray(sorted(selected), dtype=np.int64)
    if len(np.unique(atlas["city"][index])) != len(np.unique(atlas["city"][eligible])):
        raise AssertionError("visual sample lost an eligible city")
    if len(np.unique(atlas["country"][index])) != len(np.unique(atlas["country"][eligible])):
        raise AssertionError("visual sample lost an eligible country")
    support = {
        "selectionRule": (
            "visual-only: up to 16 deterministic common-support rows per eligible city, "
            "plus any otherwise omitted non-water WorldCover class"
        ),
        "startingRows": int(len(eligible)),
        "retainedRows": int(len(index)),
        "startingCities": int(len(np.unique(atlas["city"][eligible]))),
        "retainedCities": int(len(np.unique(atlas["city"][index]))),
        "startingCountries": int(len(np.unique(atlas["country"][eligible]))),
        "retainedCountries": int(len(np.unique(atlas["country"][index]))),
        "startingCityYears": int(len(np.unique(atlas["city"][eligible]))),
        "retainedCityYears": int(len(np.unique(atlas["city"][index]))),
        "year": 2024,
        "commonSupport": "finite NDVI, nonnegative finite volume, and non-water WorldCover",
        "sampleSeed": SAMPLE_SEED,
    }
    observations = {
        "landcover": worldcover[index].astype(np.uint8),
        "ndvi": atlas["ndvi"][index].astype("<f4"),
        "volume": np.log1p(atlas["volume"][index]).astype("<f4"),
    }
    return atlas["x"][index].astype(np.float32), support, observations


def pca_basis(representations: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    stacked = np.concatenate([representations[name] for name in PCA_MODELS])
    center = np.mean(stacked, axis=0, dtype=np.float64)
    centered = stacked.astype(np.float64) - center
    covariance = mm(centered.T, centered) / len(centered)
    values, vectors = np.linalg.eigh(covariance)
    basis = vectors[:, np.argsort(values)[-3:][::-1]]
    for column in range(3):
        largest = np.argmax(np.abs(basis[:, column]))
        if basis[largest, column] < 0:
            basis[:, column] *= -1
    return center.astype(np.float32), basis.astype(np.float32)


def metric_record(scope: str, task: str, result: dict) -> dict:
    if scope == "pixel":
        exact = result["pixel_and_geometry"][task]
        mean = exact["loss"]
    else:
        exact = result["country_robust"][task]
        mean = exact["country_macro_loss"]
    return {"n": int(exact["n"]), "mean": float(mean), "values": [float(mean)]}


def score_payload(design: dict) -> dict:
    baseline = read(RUN / "scores/baseline.json")
    models = {
        "baseline": {
            scope: {task: metric_record(scope, task, baseline) for task in TASKS}
            for scope in ("pixel", "country")
        }
    }
    for number, vertex in enumerate(design["vertices"], start=1):
        ensemble = read(RUN / "scores/ensemble" / f"{vertex['id']}.json")
        models[vertex["id"]] = {
            scope: {task: metric_record(scope, task, ensemble) for task in TASKS}
            for scope in ("pixel", "country")
        }
        if number % 10 == 0:
            print(f"Collected scores {number}/{len(design['vertices'])}", flush=True)
    extents = {}
    for scope in ("pixel", "country"):
        extents[scope] = {}
        for task in TASKS:
            values = [model[scope][task]["mean"] for model in models.values()]
            low, high = min(values), max(values)
            pad = (high - low) * 0.06
            extents[scope][task] = [low - pad, high + pad]
    return {
        "metricDefinition": {
            "ndvi": "standardized mean square error",
            "volume": "standardized mean square error",
            "landcover": "negative log likelihood in nats",
        },
        "models": models,
        "extents": extents,
        "support": read(EXPERIMENT / "audit/support.json"),
        "conditionalLandcover": read(RUN / "audit/conditional_landcover.json"),
        "testRole": read(RUN / "audit/final_summary.json")["test_role"],
    }


def main() -> None:
    design = read(DESIGN)
    refinements = read(RUN / "refinement/training.json")["vertices"]
    display_design = {**design, "vertices": design["vertices"] + refinements}
    x, sample_support, observations = visual_sample()
    if DESTINATION.exists() and any(DESTINATION.iterdir()):
        raise FileExistsError(f"Refusing to overwrite non-empty export: {DESTINATION}")
    (DESTINATION / "projections").mkdir(parents=True, exist_ok=True)

    fitted: dict[str, np.ndarray] = {"baseline": x}
    for model_id in PCA_MODELS[1:]:
        fitted[model_id] = ensemble_mean(x, model_id)
        print("Prepared PCA model", model_id, flush=True)
    pca_center, basis = pca_basis(fitted)

    projected: dict[str, np.ndarray] = {}
    for number, vertex in enumerate(display_design["vertices"], start=1):
        representation = fitted.get(vertex["id"])
        if representation is None:
            representation = ensemble_mean(x, vertex["id"])
        projected[vertex["id"]] = mm(representation - pca_center, basis)
        if number % 5 == 0:
            print(f"Projected models {number}/{len(display_design['vertices'])}", flush=True)
    projected["baseline"] = mm(x - pca_center, basis)
    maximum_radius = max(float(np.max(np.linalg.norm(value, axis=1))) for value in projected.values())
    coordinate_scale = maximum_radius / 32760

    published: list[Path] = []

    def save(relative: str, data: bytes) -> dict:
        path = DESTINATION / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        published.append(path)
        return {"file": relative, "bytes": len(data), "sha256": digest(data)}

    chunks = {}
    maximum_quantization_error = 0.0
    for model_id, coordinates in projected.items():
        quantized = np.rint(coordinates / coordinate_scale).clip(-32760, 32760).astype("<i2")
        maximum_quantization_error = max(
            maximum_quantization_error,
            float(np.max(np.abs(quantized.astype(np.float32) * coordinate_scale - coordinates))),
        )
        raw = quantized.tobytes()
        compressed = gzip_bytes(raw)
        chunks[model_id] = {
            **save(f"projections/{model_id}.bin.gz", compressed),
            "rawBytes": len(raw),
            "rawSha256": digest(raw),
        }

    observation_raw = b"".join(
        [observations["landcover"].tobytes(), observations["ndvi"].tobytes(), observations["volume"].tobytes()]
    )
    observation_file = gzip_bytes(observation_raw)
    observation_record = {
        **save("observations.bin.gz", observation_file),
        "rawBytes": len(observation_raw),
        "rawSha256": digest(observation_raw),
        "layout": ["uint8 landcover", "float32-le NDVI", "float32-le log1p(volume m3)"],
    }

    vertex_records = []
    for vertex in display_design["vertices"]:
        role = ("post_audit_refinement" if vertex["id"].startswith("refine_") else
                "offgrid_check" if vertex["id"].startswith("offgrid") else
                "equal_priority" if vertex["id"] == "center" else "lattice")
        vertex_records.append({**vertex, "role": role})
    interpolation_ids = [
        vertex["id"] for vertex in vertex_records
        if vertex["role"] in ("lattice", "equal_priority", "post_audit_refinement")
    ]
    metric_interpolation_ids = [
        vertex["id"] for vertex in vertex_records
        if vertex["role"] in ("lattice", "equal_priority")
    ]
    interpolation = read(RUN / "audit/refined_representation_interpolation.json")
    surface = read(RUN / "audit/surface_interpolation.json")
    classes = [
        {"code": int(code), "name": CLASS_NAMES[int(code)]}
        for code in np.unique(observations["landcover"])
    ]
    manifest = {
        "schema": 3,
        "run": "joint_adapter_v2_20260909/robust_v3",
        "seeds": list(SEEDS),
        "vertices": vertex_records,
        "interpolationVertexIds": interpolation_ids,
        "metricInterpolationVertexIds": metric_interpolation_ids,
        "chunks": chunks,
        "coordinateScale": coordinate_scale,
        "coordinateEncoding": "gzip-interleaved-int16-le-xyz",
        "projection": {
            "definition": "fixed centered 3D PCA of native, equal-priority, and three corner ensemble means",
            "sourceDimensions": 64,
            "displayDimensions": 3,
            "maximumRadiusBeforeScaling": maximum_radius,
            "maximumQuantizationError": maximum_quantization_error,
        },
        "sample": sample_support,
        "observations": observation_record,
        "classes": classes,
        "ndviExtent": [-0.6, 1.0],
        "volumeExtent": [0.0, float(np.quantile(observations["volume"], 0.98))],
        "interpolationAudit": {
            "definition": interpolation["definition"],
            "summary": interpolation["summary"],
            "metricSurfaceDefinition": surface["definition"],
            "metricSurface": surface["metrics"],
            "postAuditRefinement": True,
            "refinementDisclosure": (
                "two systematic 5%-spaced pure-volume-adjacent knots added after the original audit"
            ),
        },
    }
    scores = score_payload(design)
    save("scores.json", compact_json(scores))
    save("manifest.json", compact_json(manifest))

    audit = {
        "sourceRun": "joint_adapter_v2_20260909/robust_v3",
        "sourceDesignSha256": digest(DESIGN.read_bytes()),
        "refinementTrainingSha256": digest((RUN / "refinement/training.json").read_bytes()),
        "trainedSettings": len(display_design["vertices"]),
        "scoredSettings": len(design["vertices"]),
        "interpolationAnchors": len(interpolation_ids),
        "metricInterpolationAnchors": len(metric_interpolation_ids),
        "offgridAuditModels": sum(v["role"] == "offgrid_check" for v in vertex_records),
        "postAuditRefinementModels": sum(
            v["role"] == "post_audit_refinement" for v in vertex_records
        ),
        "visualSample": sample_support,
        "projectionChunks": len(chunks),
        "projectionEncoding": manifest["coordinateEncoding"],
        "maximumQuantizationError": maximum_quantization_error,
        "files": len(published),
        "totalBytes": sum(path.stat().st_size for path in published),
        "trainingInputsPublished": False,
        "checkpointsPublished": False,
        "passed": True,
    }
    (ROOT / "validation/joint_v2_asset_audit.json").write_bytes(compact_json(audit))
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    main()
