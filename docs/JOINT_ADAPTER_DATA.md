# Country-robust joint-adapter v3 experiment

The website uses `joint_adapter_v2_20260909/robust_v3`. It does not read the
older parent-level `models` or `scores` directories. This is a global
experiment and does not inherit the pair of city rasters selected in the
preceding comparison.

## Model, selection and objective surface

One shared residual adapter maps each existing 64-dimensional AlphaEarth
embedding through a 64 → 128 → 64 tanh network and unit-normalizes the result.
The three weights in the equilateral control allocate normalized losses for
NDVI, log1p building volume and non-water WorldCover. The adapter does not
retrain AlphaEarth and has no native-geometry preservation penalty.

The architecture, learning rate and training horizon were selected jointly at
the three pure corners and equal-weight centre using three country-held-out
development folds. The selected configuration uses Adam at 0.0003 for a fixed
24 epochs. Training gives each country equal total weight within each task.
The selected fixed-horizon score is 0.9408 relative to the native score of 1.0.
The original test countries are absent from fitting and selection.

The completed display design contains 81 trained weight settings and three
optimizer seeds (1103, 2207 and 3301) per setting:

- 66 points form the regular resolution-10 ternary lattice.
- One additional fit is exactly equal-priority (1/3, 1/3, 1/3).
- 12 separately trained off-grid fits audit interpolation.
- Two 5%-spaced pure-volume-adjacent knots refine the display surface after
  the original audit identified local nonlinearity on that edge.

At a fitted dot, the sphere uses the exact mean of the three 64-dimensional
unit embeddings. Between surface anchors, it barycentrically blends the
neighbouring mean representations and then applies one fixed linear display
projection. This makes every displayed point follow a continuous path.

The 12 off-grid fits are independent checks, not surface anchors. With the two
explicitly post-audit refinement knots, all 12 representation blends are
within 5% of the corresponding trained objective; the median objective ratio
is 1.000 and mean cosine similarity to the trained ensemble is 0.995. The
original unrefined lattice placed 11 of 12 within 5%, with a maximum objective
ratio of 1.101. The refined audit is descriptive rather than a new independent
validation.

Metric values between the 79 evaluated settings are barycentric estimates.
Exact ensemble scores appear at the 66 lattice points, equal-priority fit and
12 off-grid audit fits. The two post-audit knots have exact trained geometry
but use a score estimate from the original metric lattice.

## Largest valid analytical samples

Every task uses its largest valid support. No balanced or complete-case city
panel is imposed. All rows are from 2024 embeddings.

| Task | Full retained rows | Cities | Countries | City-years |
|---|---:|---:|---:|---:|
| NDVI | 840,776 | 1,000 | 162 | 1,000 |
| Building volume | 501,969 | 998 | 162 | 998 |
| Land cover | 3,758,388 | 1,000 attributed | 200 | 1,000 |

Land cover begins with 3,982,891 rows. WorldCover class 80 (permanent water)
is the only task-specific exclusion: 224,503 rows are removed. The retained
land-cover support includes 1,585,546 pixels without a city attribution; they
remain in the analysis and are excluded only from city counts.

The development pool combines the original training and validation countries.
It contains 624,272 NDVI rows and 363,496 building-volume rows from 121
countries, and 2,721,732 land-cover rows from 151 countries. Final models fit
this full development support after country-fold selection.

Confirmatory held-out support is:

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
the visual rows from native AlphaEarth, the v3 equal-priority ensemble and the
three v3 single-task corners. The same basis and scale are used for every
fitted model and every interpolated position. Screen-space distance is not a
64-dimensional metric and is not a prediction score.

## Score interpretation

NDVI and building volume are shown as standardized mean square error. Land
cover is mean negative log likelihood in nats. Lower is better for all three.
The control switches between pixel-weighted loss and the mean of per-country
losses on the same held-out countries.

At equal weights, the exact three-seed ensemble changes:

| Pixel-weighted diagnostic | Original | Equal-priority v3 | Change |
|---|---:|---:|---:|
| NDVI standardized MSE | 0.07646 | 0.06194 | −19.0% |
| Building-volume standardized MSE | 0.67138 | 0.64371 | −4.1% |
| Land-cover NLL | 0.67500 | 0.63040 | −6.6% |

| Country-weighted diagnostic | Original | Equal-priority v3 | Change |
|---|---:|---:|---:|
| NDVI MSE | 0.07090 | 0.05422 | −23.5% |
| Building-volume MSE | 0.62617 | 0.59018 | −5.7% |
| Land-cover NLL | 0.53976 | 0.49335 | −8.6% |

At equal weights, NDVI-decile η² rises from 0.08598 to 0.26729,
building-volume-decile η² from 0.02853 to 0.08266, and conditional land-cover
η² from 0.03445 to 0.04353. City η² falls from 0.66233 to 0.60314; every
regular lattice model is below the native city value.

The original geographic test countries were excluded from every v3 fitting,
configuration-selection and epoch-selection decision. They had already been
inspected during v2, so v3 test results are confirmatory rather than a new
pristine sealed evaluation. Any best lattice location is descriptive, not a
test-selected recommendation.

## Published browser payload

For URL compatibility the static assets remain under
`data/joint-adapter-v2/`, but their manifest identifies
`joint_adapter_v2_20260909/robust_v3` as the source. The directory contains
only:

- aggregate confirmatory pixel- and country-weighted score summaries;
- the deterministic visual sample's three observed outcomes;
- gzip-compressed, quantized 3D display coordinates for native AlphaEarth and
  the 81 v3 trained settings;
- sample, projection, selection and interpolation-audit metadata.

Native 64-dimensional embeddings, row identifiers, frozen heads, adapter
parameters, checkpoints and training inputs are not included in the website.
The browser payload can reproduce the display but cannot reconstruct the
training data or fitted adapter.
