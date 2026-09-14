# Dispersion and development

The temporal canvas continues into the dispersion story. Eight city means move into a grid, observed urban-centre clouds appear, and the means join the full eligible HDI scatter. Control blocks then enter cumulatively. The eight cities are Singapore (Singapore), Mexico City, London, New York, Buenos Aires, Dubai, Lagos and Melbourne. The eight-city selection is a visual illustration only.

All transitions follow scroll position continuously and reverse along the same path. The eight centres first gather, then separate into the grid; the observed clouds expand radially from their centres, fold back into them, and move into the scatter while the remaining cities appear. Caption or layout changes cannot complete the transition. Narration occupies a separate stationary area beside the plot, or below it on phones, so the original scroll articles never pass behind the chart. Browser checks cover intermediate frames, reverse scrolling and widths of 390, 691 and 1,440 pixels; see `validation/dispersion_browser_audit.json`.

The control labels occupy fixed positions, and the plot starts below the measured heading. Adding a control does not reflow the axes. Smaller, translucent scatter marks reduce overlap while retaining every eligible city and the eight example-city rings.

## Outcomes and clouds

The outcome is the canonical 2024 `DEG_UC_30` `var_intrinsic`: mean squared angular distance from the city mean, measured in radians squared over every valid urban-centre reduction cell. The regression uses its natural logarithm.

The clouds contain all 250 cached urban-centre observations for each of the eight cities, or 2,000 observations. Their vectors are mapped to their own mean's tangent plane and parallel-transported to a common reference. Two shared principal directions of the pooled tangent second moment carry 30.03% of their variation. All clouds use one display scale and none is normalised to unit variance. The sample clouds illustrate the geometry, while the regression uses the population-reduction outcome in all 64 dimensions. The later city picker's rectangular fields are different footprints and do not enter these models.

## Sample accounting

All counts below are for 2024, so city and city-year counts coincide.

| Required inputs | Cities / city-years | Countries | Why this restriction is needed |
| --- | ---: | ---: | --- |
| Starting atlas | 1,000 | 162 | All available cities |
| Valid urban-centre dispersion | 992 | 162 | The outcome must be defined |
| Dispersion and national HDI | 977 | 157 | Both variables are needed for the raw association |
| Baseline context controls | 977 | 157 | All raw-model cities also have these inputs |
| Common sequence sample | 942 | 155 | All control inputs are needed to compare coefficient changes on identical cities |
| Illustrative clouds | 8 | 8 | Same cities as the later picker; no global estimate is fitted on this subset |

The sample change from 977 to 942 has its own step. It refits the context model before further controls enter. All 1,000 city identities persist; cities without required inputs are grey points outside the axes. No complete four-class DoU requirement or balanced temporal panel is imposed on these cross-sectional models.

The payload and on-page methods include the largest-valid-sample sensitivity for every rung: 977 cities / 157 countries for context and population; 975 / 157 after built form, settlement age, climate and vegetation; and 942 / 155 with radar. These broader fits do not inherit the final model's complete-case restriction.

## Models and display

The unadjusted model fits log dispersion to national HDI alone. The context model adds log10 total population and log10 land area plus continent and collection-stage indicators. The additional blocks are:

1. Population distribution: mean and standard deviation of the population field.
2. Built form: means and standard deviations of building fraction and height, plus mean building volume.
3. Settlement age: mean and standard deviation.
4. Climate: the eight climate-zone shares in the canonical specification.
5. Vegetation: NDVI mean and standard deviation.
6. Radar: mean and standard deviation of both the median VH field and its temporal-variation field.

Each model is equal-city OLS with country-clustered, small-sample-corrected confidence intervals using a t reference. The order is the published sequence; attribution to individual blocks is order dependent and is not causal.

For model slope `b` expressed per HDI unit, the plotted log value is:

`mean(log D_raw) + b * (HDI - mean(HDI_raw)) + full_model_residual`

This is a component-plus-residual plot anchored at the same reference for every model. Raw-model points reproduce observed log dispersion exactly. Adjusted points include the HDI component, so their fitted slope equals the full model's HDI slope. They are exponentiated for labels on a logarithmic axis. They are model-adjusted values, not newly observed outcomes. Both axes remain fixed across the model sequence, retaining the full plotted range.

Readouts use `100 * (exp(0.1 * b) - 1)` and corresponding transformed coefficient limits: the percentage difference per +0.1 national HDI. This fixes the exposure contrast across samples rather than allowing its standard deviation to change. The raw result is +15.0% (10.8% to 19.3%), baseline context is +9.8% (4.6% to 15.4%), and the fully adjusted result on 942 cities is +1.0% (−2.7% to 4.8%).

## Reproduction and verification

Run `.venv/bin/python validation/export_dispersion_story.py` from the repository root. It uses the canonical atlas reader, geometry functions and model definitions, without modifying research outputs. `data/narrative/dispersion.json` contains source hashes, all 1,000 ordered identities, all plotted values, the observed clouds, model specifications and sample ledgers.

The exporter verifies raw outcomes, independently recovers every plotted HDI slope and reproduces all seven published 942-city coefficients. `validation/dispersion_data_audit.json` records the results. `validation/validate_dispersion_story.mjs` exercises the actual temporal/dispersion controller, both scroll directions, fixed axes, seven viewport layouts, all missing-input rows, selection, keyboard access, motion, reduced motion, loading failures and stale-request recovery. It is a portable interaction audit, not a browser visual review.
