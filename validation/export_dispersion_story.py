"""Export the website's centred clouds and country-clustered HDI models.

Run with .venv/bin/python validation/export_dispersion_story.py. All analysis
reads use the canonical atlas reader; source research outputs are not modified.
The matched sequence estimates changes in the coefficient on identical rows.
Each rung also has its largest-valid-sample sensitivity in the payload.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bakeoff_20260831/scripts/wp4"))
import wp4_panel_ab as canonical
from lib import geometry, read_atlas

OUT = ROOT / "docs/data/narrative/dispersion.json"
NAMES = ("Singapore", "Mexico City", "London", "New York", "Buenos Aires", "Dubai", "Lagos", "Melbourne")
CONTROL_BLOCKS = [
    "Total population · land area · collection stage · continent",
    "Population field: mean and variation",
    "Building coverage and height: mean and variation; mean volume",
    "Settlement age: mean and variation",
    "Climate-zone shares",
    "Vegetation (NDVI): mean and variation",
    "Radar structure: level and variation summaries",
]


def main():
    story = json.loads((ROOT / "docs/data/narrative/cities.json").read_text())
    ids = [city["id"] for city in story["cities"]]
    source = canonical.build_frame()
    raw = source.dropna(subset=[canonical.OUTCOME, "national_hdi_2023", "Cntry_ISO"])
    raw = raw[raw[canonical.OUTCOME] > 0].copy()
    final_terms = canonical.CUMULATIVE[-1][1]
    matched = canonical.model_rows(source, final_terms)
    hdi_reference = float(raw.national_hdi_2023.mean())
    log_reference = float(np.log(raw[canonical.OUTCOME]).mean())
    common_sd = float(raw.national_hdi_2023.std(ddof=0))
    checks = []

    def model(rows, terms, fixed_effects=True, include_points=True):
        x = canonical.design_matrix(rows, terms) if fixed_effects else sm.add_constant(
            pd.DataFrame({"z_national_hdi_2023":
                (rows.national_hdi_2023 - rows.national_hdi_2023.mean()) /
                rows.national_hdi_2023.std(ddof=0)}, index=rows.index))
        y = np.log(rows[canonical.OUTCOME])
        result = sm.OLS(y, x).fit(cov_type="cluster", cov_kwds={
            "groups": rows.Cntry_ISO, "use_correction": True}, use_t=True)
        key = "z_national_hdi_2023"
        scale = float(rows.national_hdi_2023.std(ddof=0))
        slope = float(result.params[key]) / scale
        ci = result.conf_int().loc[key].to_numpy() / scale
        # Component plus residual, vertically anchored at the full raw sample's
        # mean log outcome and HDI. For raw OLS this reproduces observed log D.
        adjusted = log_reference + slope * (rows.national_hdi_2023 - hdi_reference) + result.resid
        reconstructed_slope = float(np.polyfit(rows.national_hdi_2023, adjusted, 1)[0])
        checks.append(abs(reconstructed_slope - slope))
        payload = {
            "cities": len(rows), "countries": int(rows.Cntry_ISO.nunique()),
            "cityYears": len(rows), "year": 2024,
            "slope": slope, "slopeCI": ci.tolist(),
            "effectPer01": float(100 * np.expm1(slope * .1)),
            "intervalPer01": (100 * np.expm1(ci * .1)).tolist(),
            "effectPerCommonSD": float(100 * np.expm1(slope * common_sd)),
            "sampleHDISD": scale,
            "canonicalEffectPerSD": float(100 * np.expm1(result.params[key])),
            "countryClustering": True,
        }
        if include_points:
            by_id = dict(zip(rows.system_index, adjusted))
            payload["logValues"] = [float(by_id[key]) if key in by_id else None for key in ids]
        return payload

    stages = {"raw": model(raw, [], False)}
    stages["raw"]["controls"] = []
    stages["context"] = model(canonical.model_rows(source, canonical.BASE_TERMS), canonical.BASE_TERMS)
    stages["context"]["controls"] = CONTROL_BLOCKS[:1]
    canonical_values = pd.read_csv(ROOT / "bakeoff_20260831/analysis/fig4/panel_b_ladder_942.csv")
    for index, ((_, terms), key) in enumerate(zip(canonical.CUMULATIVE, canonical.MODEL_KEYS)):
        scene = "matched" if key == "context" else key
        stages[scene] = model(matched, terms)
        stages[scene]["controls"] = CONTROL_BLOCKS[:index + 1]
        stages[scene]["largestSample"] = model(canonical.model_rows(source, terms), terms, include_points=False)
        row = canonical_values.loc[(canonical_values.model == key) & (canonical_values.estimand == "equal_city")].iloc[0]
        assert abs(stages[scene]["canonicalEffectPerSD"] - row.hdi_effect_pct_per_sd) < 1e-8
    assert max(checks) < 1e-10
    assert len(raw) == 977 and len(matched) == 942
    raw_points = dict(zip(ids, stages["raw"]["logValues"]))
    assert max(abs(raw_points[row.system_index] - np.log(row.urban_centre_dispersion))
               for row in raw.itertuples()) < 1e-12

    # All available UC observations for the eight display cities. Their source
    # support is the analytical UC mask, not the later rectangular city fields.
    display = []
    for name in NAMES:
        rows = source[source.eFUA_name.eq(name)]
        if name == "Singapore":
            rows = rows[rows.Cntry_ISO.eq("SGP")]
        assert len(rows) == 1
        display.append(rows.iloc[0])
    axes = [f"A{i:02d}" for i in range(64)]
    pixels = read_atlas.read_samples(year=2024, frame=1000,
        usecols=["system_index", "smod", "sample_id", *axes], supports=[30])
    means, vectors = [], []
    for city in display:
        x = geometry.unit_rows(pixels.loc[pixels.system_index.eq(city.system_index), axes].to_numpy(dtype=float))
        assert len(x) > 0
        vectors.append(x)
        means.append(geometry.normalised_resultant(x))
    reference = geometry.normalised_resultant(np.array(means))
    tangents = [geometry.parallel_transport(mu, reference, geometry.logmap(mu, x))
                for x, mu in zip(vectors, means)]
    pooled = np.concatenate(tangents)
    # Shared uncentred tangent second-moment axes preserve each mean origin.
    moment = np.einsum('ni,nj->ij', pooled, pooled, optimize=False) / len(pooled)
    eigenvalues, eigenvectors = np.linalg.eigh(moment)
    basis = eigenvectors[:, -2:][:, ::-1]
    for column in range(2):
        if basis[np.argmax(abs(basis[:, column])), column] < 0:
            basis[:, column] *= -1
    clouds = []
    for city, x, mu, tangent in zip(display, vectors, means, tangents):
        points = np.einsum('ni,ij->nj', tangent, basis, optimize=False)
        native = float(np.mean(np.sum(tangent * tangent, axis=1)))
        assert abs(native - float(geometry.dispersion(x, mu))) < 1e-10
        clouds.append({"id": city.system_index, "name": city.eFUA_name,
            "country": city.country_name, "count": len(points),
            "sampleDispersion": native, "dispersion": float(city.urban_centre_dispersion),
            "points": np.round(points, 7).tolist()})

    source_files = [
        ROOT / "data/atlas_v2_integrated_1000/city_catalog_1000.csv",
        ROOT / "data/atlas_v2_integrated_1000/spherical/atlas_v2_spherical_1000_2024.csv.gz",
        ROOT / "data/atlas_v2_integrated_1000/covariates/atlas_v2_covariates_1000_2024.csv.gz",
        *read_atlas._annual_paths("samples", 1000, [2024]),
        ROOT / "bakeoff_20260831/analysis/fig4/panel_b_ladder_942.csv",
    ]
    payload = {
        "schemaVersion": 1, "ids": ids, "year": 2024,
        "hdi": [float(source.set_index("system_index").loc[key, "national_hdi_2023"])
            if key in set(raw.system_index) else None for key in ids],
        "hdiReference": hdi_reference, "logReference": log_reference, "commonHDISD": common_sd,
        "stages": stages, "clouds": clouds,
        "cloudAxesShare": float(eigenvalues[-2:].sum() / eigenvalues.sum()),
        "cloudExtent": float(np.max(np.abs(np.einsum('ni,ij->nj', pooled, basis, optimize=False)))),
        "cloudSupport": "All cached 2024 DEG_UC_30 observations for eight illustrative cities; no further pixel sampling or per-city rescaling.",
        "outcome": "Mean squared angular distance (rad²), reduced over every valid urban-centre cell; modelled as natural log dispersion.",
        "adjustment": "Component plus residual from each full model, anchored at the raw 977-city mean log dispersion and mean HDI. Exponentiated only for display. Raw stage exactly reproduces the observed outcome.",
        "sampleLedger": [
            {"analysis": "2024 atlas", "cities": 1000, "countries": 162, "cityYears": 1000},
            {"analysis": "Valid urban-centre outcomes", "cities": len(source), "countries": int(source.Cntry_ISO.nunique()), "cityYears": len(source), "rule": "Positive valid UC outcome required; no all-DoU restriction."},
            {"analysis": "Unadjusted and context HDI models", "cities": len(raw), "countries": int(raw.Cntry_ISO.nunique()), "cityYears": len(raw), "rule": "HDI and outcome required. All these rows also have context controls."},
            {"analysis": "Changes across the control sequence", "cities": len(matched), "countries": int(matched.Cntry_ISO.nunique()), "cityYears": len(matched), "rule": "All control inputs required to isolate coefficient changes on identical cities. Each rung includes a largest-valid-sample sensitivity."},
            {"analysis": "Illustrative clouds", "cities": len(clouds), "countries": 8, "cityYears": 8, "pixels": len(pooled), "rule": "The same eight cities as the later picker, for illustration only; no global model is estimated on these eight."},
        ],
        "sources": {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files},
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
    report = {"passed": True, "maxPartialResidualSlopeError": max(checks),
        "canonicalLadderReproduced": True, "rawValuesReproduced": True,
        "allEightCloudsUseObservedUCPoints": True, "cloudPixels": len(pooled),
        "stages": {key: {k: v for k, v in stage.items() if k in ("cities", "countries", "effectPer01", "intervalPer01")}
                   for key, stage in stages.items()},
        "sha256": hashlib.sha256(OUT.read_bytes()).hexdigest()}
    (ROOT / "validation/dispersion_data_audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
