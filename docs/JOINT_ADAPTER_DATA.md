# Joint-adapter v2 experiment

The website uses the completed `joint_adapter_v2_20260909` run. This is a
global experiment and no longer inherits the pair of city rasters selected in
the preceding comparison.

## Model and objective surface

One shared residual adapter maps each existing 64-dimensional AlphaEarth
embedding through a 64 → 24 → 64 tanh network and unit-normalizes the result.
The three weights in the equilateral control allocate normalized losses for
NDVI, log1p building volume and non-water WorldCover. The adapter does not
retrain AlphaEarth. Unlike the preceding experiment, v2 has no
geometry-preservation penalty.

The completed design has 79 fitted weight settings and three optimizer seeds
(1103, 2207 and 3301) per setting:

- 66 points form the regular resolution-10 ternary lattice.
- One additional fit is exactly equal-priority (1/3, 1/3, 1/3).
- 12 separately trained off-grid fits audit interpolation.

At a fitted dot, the sphere uses the exact mean of the three 64-dimensional
unit embeddings. Between surface anchors, it barycentrically blends those
neighbouring mean representations and then applies one fixed linear display
projection. This makes every displayed point follow a continuous path.

The 12 off-grid fits are independent checks, not surface anchors. Eleven of
12 representation blends were within 5% of the corresponding trained
validation objective; the median objective ratio was 0.996 and mean cosine
similarity to the trained ensemble was 0.970. The one miss was near the
pure-volume boundary and was 10.1% high. Metric-surface interpolation was less
reliable than representation interpolation, so score values between dots are
explicitly labelled lattice estimates. Exact scores appear at all 79 fitted
dots.

## Largest valid analytical samples

Every task is trained and evaluated on its largest valid support. No balanced
or complete-case city panel is imposed. All rows are from 2024 embeddings.

| Task | Full retained rows | Cities | Countries | City-years |
|---|---:|---:|---:|---:|
| NDVI | 840,776 | 1,000 | 162 | 1,000 |
| Building volume | 501,969 | 998 | 162 | 998 |
| Land cover | 3,758,388 | 1,000 attributed | 200 | 1,000 |

Land cover begins with 3,982,891 rows. WorldCover class 80 (permanent water)
is the only task-specific exclusion: 224,503 rows are removed. The retained
land-cover support includes 1,585,546 pixels without a city attribution; they
remain in the analysis and are excluded only from city counts.

Country-disjoint test support is:

| Task | Test rows | Cities | Countries | City-years |
|---|---:|---:|---:|---:|
| NDVI | 216,504 | 244 | 41 | 244 |
| Building volume | 138,473 | 242 | 41 | 242 |
| Land cover | 1,036,656 | 252 attributed | 49 | 252 |

The land-cover test includes 499,192 pixels without city attribution. The
conditional land-cover structure diagnostic uses the largest exact common
test support: 138,473 rows from 242 cities and 41 countries with NDVI,
nonnegative finite volume and non-water WorldCover.

## Global visual layer

Rendering millions of overlapping points would obscure the geometry, so the
sphere is a clearly separated visual-only layer. It begins with all 501,969
common-support rows and selects up to 16 deterministic rows per eligible city,
then adds any non-water class omitted by that draw. The retained 15,970 points
cover all 998 eligible cities, all 162 countries and all 998 city-years. This
sample never replaces the full task-specific samples used by the score cards.

Observed NDVI, log1p building volume and non-water WorldCover travel with each
visual point and do not change when weights move. They are observations, not
model predictions.

The fixed three-dimensional display basis is a centered PCA fitted jointly to
the visual rows from native AlphaEarth, the equal-priority ensemble and the
three single-task corners. The same basis and scale are used for every fitted
model and every interpolated position. Screen-space distance is not a
64-dimensional metric and is not a prediction score.

## Score interpretation

NDVI is shown as RMSE in native NDVI units. Building volume is RMSE of
log1p(m³). Land cover is mean negative log likelihood in nats. Lower is better
for all three.

At equal weights on the sealed test, the exact three-seed ensemble changes:

| Metric | Original | Equal-priority v2 | Change |
|---|---:|---:|---:|
| NDVI RMSE | 0.06107 | 0.05413 | −11.4% |
| log1p volume RMSE | 2.01022 | 1.96244 | −2.4% |
| Land-cover NLL | 0.67500 | 0.65396 | −3.1% |

The standardized losses used in the research report improve by 21.4%, 4.7%
and 3.1%, respectively. The distinction matters because RMSE is the square
root of standardized MSE for the two regression tasks.

The sphere’s target alignment also changes at equal weights: NDVI decile η²
rises from 0.08636 to 0.32283, volume decile η² from 0.02851 to 0.10159, and
conditional land-cover η² from 0.03438 to 0.05007. City η² falls from 0.66233
to 0.54775; every regular lattice model is below the native city value.

The sealed test was evaluated once. Any best lattice location reported by the
research run is descriptive and is not a test-selected recommendation.

## Published browser payload

`data/joint-adapter-v2/` contains only:

- aggregate validation and held-out score summaries;
- the deterministic visual sample’s three observed outcomes;
- gzip-compressed, quantized 3D display coordinates for native AlphaEarth and
  the 79 fitted models;
- sample, projection and interpolation-audit metadata.

Native 64-dimensional embeddings, row identifiers, frozen heads, adapter
parameters, checkpoints and training inputs are not included in the website.
The browser payload can reproduce the display but cannot reconstruct the
training data or fitted adapter.
