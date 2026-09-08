# City comparison data

The gallery uses all eight locally available complete city fields: Singapore, Mexico City, London, New York, Buenos Aires, Dubai, Lagos and Melbourne. These are rectangular regional fields, not downtown crops or functional urban area masks. Field widths range from 50.95 to 266.28 km and are labelled in the gallery and map captions.

The underlying catalogue contains 1,000 cities, 162 countries and 1,000 city-years in 2024. Pixel-level interaction requires the cached 192 × 192 fields, which are available for eight cities, eight countries and eight city-years in 2024. Every available field is included. Melbourne was fetched to extend the display collection; it is also present in the original catalogue. This is a prototype display collection, not an analytical eight-city sample. No city or pixel is removed for incomplete DoU or building-volume coverage.

There are 294,912 lattice locations and 277,326 valid embeddings. All valid embeddings, including water and pixels without WorldCover coverage, enter the spheres. Locations without embeddings are grey on the maps and fade away during the transition. Other missing measurements are grey while their valid embedding locations stay fixed.

| City | Valid embeddings | NDVI values on valid embeddings | Building-volume values on valid embeddings |
| --- | ---: | ---: | ---: |
| Singapore | 36,864 | 36,864 | 10,463 |
| Mexico City | 36,864 | 36,864 | 9,885 |
| London | 36,836 | 36,836 | 7,802 |
| New York | 26,592 | 26,592 | 7,081 |
| Buenos Aires | 36,864 | 36,864 | 6,117 |
| Dubai | 32,258 | 32,258 | 3,596 |
| Lagos | 34,915 | 34,915 | 6,219 |
| Melbourne | 36,133 | 36,133 | 3,305 |

## Sources and display scales

- Embeddings: the existing 2024 annual AlphaEarth fields in `bakeoff_20260831/site/data/*_2024_grid192.csv.gz`. Components are analysis-ready and normalised to 64-D unit vectors; no signed-square inverse is applied.
- False colour: A39, A62 and A08, with one 2nd–98th percentile stretch over valid land in all eight fields. Pale blue masks permanent water in both the maps and the false-colour spheres. All gallery tiles have the same square dimensions and display the complete 192 × 192 thumbnail.
- Land cover: ESA WorldCover 2021, sampled at 10 m on the existing lattice. Missing class is zero. Land cover is not inferred from colour.
- DoU: GHSL GHS-SMOD 2020, sampled on the same locations. Its settlement categories describe context and are coarser than individual buildings or pixels.
- NDVI: 2024 `COPERNICUS/S2_SR_HARMONIZED`, annual median cloud-masked reflectance, (B8−B4)/(B8+B4), sampled at 100 m on the identical lattice. All eight city fields have measured values. Stored as Int16 × 10,000 with −32768 for missing; common display range −0.2 to 0.9.
- Building volume: `projects/ee-asrenninger/assets/WSF3D_V02_BuildingVolume`, sampled at 100 m. Values are square-root-scaled using one cap, 84,989.76 in the source asset's units, the pooled 98th percentile of valid WorldCover built cells across all eight fields. Stored as Uint16 0–1,000 with 65,535 for missing. Missing WSF3D coverage is not treated as zero volume. No per-city rescaling is used.

The Singapore supplement is copied from the existing source. The other original six supplements are fetched with the same existing sampling code into the newest bakeoff working directory. `fetch_layers.py` records that workflow. `fetch_added_city.py` fetches Melbourne's full field and all measurement layers using the same source stacks and spatial sampling; the smaller request batches have checkpoints and a timeout. The CSVs retain measured values before display quantisation. These preparation paths refer to the research workspace; this repository contains the complete static browser export. Original source data are unchanged.

## Shared geometry and loading

Each pair's PCA uses every valid, recognised WorldCover land cell in both fields. Land defines the display axes; all valid embeddings are then projected. Both city spheres use the same centring, axes, fixed camera and radius. Normalising the projected vectors to a sphere is a display operation, not a preservation of 64-D angular distance. There are no quantitative distance claims in this comparison.

There are 28 precomputed pair projections, each 442,368 bytes. The original 21 pair geometries remain unchanged. Each city's RGB and four measured layers plus validity mask occupy 368,640 bytes. Opening a pair requests two city buffers and one projection: 1,179,648 uncompressed bytes, plus the small manifest and thumbnails. It does not fetch the full 64-dimensional vectors or every city at startup. Caches are bounded to four city payloads and three pair projections.

`LIVE_BASELINE.json` records the original live files. The comparison manifest records generated-file hashes, layer counts, field extents and the sample ledger. Preparation scripts remain in the research workspace's `counterbakeoff_20260908/site_work/comparison_assets/`. Release validation reports and a portable interaction harness are included in this repository's `validation/` directory. The interaction harness covers both selection orders for every pair, all colour modes, scroll reversal, missing data, asynchronous selection races, retry and reduced motion. It does not substitute for a browser visual review.
