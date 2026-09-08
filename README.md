# AlphaUrban

An interactive walk through AlphaEarth embeddings, from individual pixels to cities, followed by an eight-city pixel comparison.

[Visit the website](https://asrenninger.github.io/alpha-urban/).

## Locked website baseline

`website-2026-09-08-eight-cities` preserves the reviewed website before further interactive experiments. It extends the existing guided walk with eight square city tiles, two-city map-to-sphere scrolling, and shared colouring by false colour, Urbanisation, NDVI, land cover and building volume. The original guided walk's JavaScript, CSS and data are unchanged.

The complete static website lives in `docs/`. GitHub Pages publishes that directory from `main`; no build or dependency installation is required. Release hashes are recorded in `releases/2026-09-08-eight-cities.json`.

## Preview and validation

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs
```

Open <http://127.0.0.1:8766/> or jump to <http://127.0.0.1:8766/#city-atlas>.

```sh
node validation/validate_comparison.cjs
```

The interaction harness runs the actual comparison JavaScript against the bundled payloads. It covers all 28 pairs in both selection orders, five colour modes, scroll reversal, missing data, asynchronous selection races, retries and reduced motion. It does not perform browser visual review. `validation/asset_validation_result.json` records the separate pre-release checks against the research source arrays.

See [comparison data and provenance](docs/COMPARISON_DATA.md) for field coverage, measurement sources, missing values and projection limitations. Research preparation paths in that document refer to the source workspace; the complete browser payloads are included here.

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
