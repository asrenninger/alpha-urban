# AlphaUrban dataset

The data behind the paper: AlphaEarth embeddings sampled in 1,000 urban areas across 162 countries, in every annual layer from 2017 to 2024, with the covariates measured at the same places. The city tables are in this folder. The pixel tables are too large for a git tree and are attached to the GitHub Release named below. Everything joins on one key, `system_index`, the GHS functional urban area identifier.

Attribution: the AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind and is released under CC-BY 4.0. Sampled values are redistributed here under the same licence. Cite Brown et al. (2025), arXiv:2507.22291, for the embeddings and the AlphaUrban paper for the sample.

## Layout

```
dataset/
  README.md                      this file
  MANIFEST.json                  rows, columns, bytes and sha256 for every file, with the workspace source and its hash
  cities.parquet, cities.csv     1,000 rows: the sampling design and the city catalogue
  city_year/
    spherical_YYYY.parquet       1,000 cities x 13 supports, one file per year (10 MB each)
    covariates_2017_2024.parquet 1,000 cities x 11 supports x 8 years (25 MB)
  reference/
    global_land_2024_context.parquet     247,565 land pixels sampled worldwide: coordinates and context
    global_land_2024_embeddings.parquet  the same pixels: A00..A63 (51 MB)
  sentinel1b/
    paired_global_sample_n4800.parquet   the global paired sample for the Sentinel-1B outage test
    city_support_points_730.parquet      Sentinel-1 orbit support per city
  placebo/
    spherical_native_pseudo_2024.parquet placebo city summaries, 2024
    covariates_native_pseudo_2024.parquet
  scripts/
    build_dataset.py             rebuilds every file from the research workspace
    load_example.py              joins pixels to cities in a few lines

GitHub Release `dataset-v1` (not in the tree, 1.9 GB in all):
  pixels_YYYY.parquet            840,776 pixels x 140 columns per year, 2017 to 2024 (235 MB each)
  placebo_samples_native_2024.parquet  (4 MB)
  placebo_samples_pseudo_2024.parquet  (25 MB)
```

The tree holds 171 MB across 17 files, the largest 51 MB.

All tables are Apache Parquet, zstd compressed with byte stream split encoding on floating point columns, which is lossless. Any recent pandas, polars, pyarrow, DuckDB, R arrow or Julia reader opens them, and column projection means a reader can pull the 64 embedding axes without touching the covariates.

## The sample

Cities are the GHS functional urban areas of 2015. The 1,000 come from three draws that the tables already merge: a certainty core of 530 large cities (ranks 1 to 530), a first probability extension of 200 (ranks 531 to 730) and a second of 270 (ranks 731 to 1,000). Each probability city carries its inclusion probability and inverse probability weight for its own phase, and the columns `combined_inclusion_probability` and `combined_design_weight` harmonise the two phases within design strata. Use the combined weight for any estimate that speaks about cities in general. The certainty cities have weight 1.

Within each city, up to 250 pixels were drawn at 30 m in each of four degree of urbanisation supports, coded in `degree_ix`:

| degree_ix | GHS-SMOD | support |
|---|---|---|
| 1 | 21 | suburban or peri-urban |
| 2 | 22 | semi-dense urban cluster |
| 3 | 23 | dense urban cluster |
| 4 | 30 | urban centre |

The same pixel identifiers, `sample_id`, recur in every year, so a pixel can be followed through the eight annual layers. The pixels carry no coordinates. They were drawn without geometry from Earth Engine, so a row is a location inside its city and support, and nothing finer. The city tables carry the centroid and area of every functional urban area.

## Tables

### cities

One row per city. Identity (`system_index`, `eFUA_name`, `Cntry_ISO`, `continent`), design (`cohort`, `analysis_rank`, `stratum`, the inclusion probabilities and weights, `selection_design`), context (`population_quintile`, `climate_family`, `koppen_zone`, `hdi_tertile`, `national_hdi_2023`, `latitude_band`), geometry (`latitude`, `longitude`, `fua_area_km2`). City names are labels only. Join on `system_index`.

### city_year/spherical

One row per city, support and year. `N` is the number of pixels in the support, `Rbar` the mean resultant length of the unit vectors, `mu_A00` to `mu_A63` the mean direction, `m_A00` to `m_A63` the per axis mean, `std_A00` to `std_A63` the per axis standard deviation, with tangent variance and the leading variance axes alongside. The 13 supports are the whole urban area (`FUA_LAND`), its urban centre and non centre halves, the four degree of urbanisation classes (`DEG_SUB_21`, `DEG_SD_22`, `DEG_DU_23`, `DEG_UC_30`), and settlement age bands from the World Settlement Footprint. Rows where the support is empty or too small are kept and marked `spherical_summary_valid = false`.

### city_year/covariates

One row per city, support and year, with mean, p10, p50, p90 and standard deviation of each pixel covariate (vegetation indices, radar backscatter, terrain, night lights, building height and volume, population) and class fractions for land cover, climate zone and settlement class.

### pixels (release asset)

One row per pixel and year. `system_index` and `sample_id` identify the pixel, `degree_ix` its support, `year` its annual layer. `A00` to `A63` are the AlphaEarth embedding, unit norm, stored as float32 (the precision Earth Engine serves). The remaining columns are the covariates at that pixel, each paired with a `valid_*` flag; when the flag is 0 the value is missing. The covariates: `ndvi`, `evi2`, `msavi`, `ndre`, `nirv`, `ndwi`, `mndwi`, `ndmi`, `ndbi`, `bsi` (Sentinel-2 indices), `s1_vv_med`, `s1_vh_med`, `s1_vv_std`, `s1_vh_std`, `s1_vv_plus_vh`, `s1_vv_minus_vh` (Sentinel-1), `elevation_m`, `slope_deg`, `tpi_1km`, `local_relief_500m` (terrain), `viirs_med`, `viirs_p90`, `viirs_change_from_2017` (night lights), `wsf3d_height_m`, `wsf3d_volume_m3`, `wsf3d_area_m2`, `wsf3d_fraction_pct`, `wsf2019_settlement`, `wsf_evo_year`, `wsf_evo_age_2019`, `wsf_2016_2019_proxy` (World Settlement Footprint), `worldcover`, `smod`, `ghsl_pop_2020`, `deprivation`.

### reference

A global land sample for 2024, drawn on an equal area grid, with coordinates. The context file holds `longitude`, `latitude`, `worldcover`, `ghs_smod`, `continent`, `climate`, `koppen_code`, population count, density and decile, and the sampling design; the embeddings file holds `A00` to `A63`. The two share `pixel_id` and row order. This is the reference against which the paper measures how far cities sit from land in general.

### sentinel1b

The paired global sample used to test whether the loss of Sentinel-1B in December 2021 moved the embeddings: for each of 4,629 locations, the embedding in every year from 2019 to 2024 and the Sentinel-1 orbit support before and after. The city support table records, for 730 cities, how many ascending and descending Sentinel-1A and 1B scenes covered eight points in 2021 and 2022.

### placebo

Placebo cities for 2024: the sampling frame of a real city translated to a location with no city, in a native placement and a pseudo placement, so that the city sampling itself can be tested against empty ground. Summaries are in the tree; the pixel draws are release assets.

## Loading

```python
import pyarrow.parquet as pq
cities = pq.read_table("dataset/cities.parquet").to_pandas()
axes = [f"A{i:02d}" for i in range(64)]
px = pq.read_table("dataset_assets/pixels_2024.parquet", columns=["system_index", "degree_ix"] + axes)
```

`scripts/load_example.py` does this end to end. DuckDB reads the release assets in place without loading them:

```sql
SELECT c.continent, count(*) FROM 'pixels_2024.parquet' p JOIN 'dataset/cities.parquet' c USING (system_index) GROUP BY 1;
```

## Provenance

Every file in `MANIFEST.json` names the workspace file it was built from and the sha256 of both. The builder drops the city catalogue columns that Earth Engine repeated on every pixel row, casts floating point columns to float32 and validity flags to small integers, and changes no values. The 64 embedding axes are checked for finiteness and unit norm before writing.

The workspace files are the outputs of the atlas integration of 25 August 2026, documented in the paper's supplementary information. Checkpoints, adapter training data and the raw Earth Engine exports stay in the research workspace.
