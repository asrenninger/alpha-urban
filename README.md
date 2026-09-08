# AlphaUrban

An interactive walk through AlphaEarth embeddings, from individual pixels to cities, followed by an eight-city pixel comparison.

[Visit the website](https://asrenninger.github.io/alpha-urban/).

## Current website checkpoint

The comparison includes eight square city tiles, paired map-to-sphere scrolling, and shared colouring by false colour, Urbanisation, NDVI, land cover and building volume. The spheres show native 64-D mean-direction distance and covariance-direction overlap. A following distribution section uses the same city selection and synchronized measurement controls: translucent density curves for continuous measurements and exact class-share bars for categories. City A and B use the site's crimson and navy palette.

This checkpoint precedes the final model-weighting interactive. Trained adapter assets remain in the research workspace and are not loaded by this website. The earlier `website-2026-09-08-eight-cities` tag remains the previous baseline. Current file hashes are recorded in `releases/2026-09-08-comparison-statistics.json`.

The complete static website lives in `docs/`. GitHub Pages publishes that directory from `main`; no build or dependency installation is required.

## Publication scope

The project-root checkout uses a deny-by-default `.gitignore`: only files named in `validation/publish_allowlist.json` are eligible for normal Git additions. Research folders, local experiments, datasets, credentials and offline neural-model exports stay ignored. New website files require an explicit allowlist update followed by `python3 validation/verify_publish_scope.py --write-ignore`.

The pre-push guard also checks committed paths, file types and size, including every new commit in pushed history. This catches files force-added past `.gitignore`, even if removed in a later commit. Enable it in a new checkout with `git config core.hooksPath .githooks`; it is configured in the local project-root checkout. Deliberately bypassing hooks or changing the allowlist can override these protections.

Run `python3 validation/verify_publish_scope.py` to check the current commit, or `python3 validation/test_publish_scope.py` to exercise the guard. The user controls the final push to `origin main`.

## Preview and validation

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs
```

Open <http://127.0.0.1:8766/> or jump to <http://127.0.0.1:8766/#city-atlas>.

```sh
node validation/validate_comparison.cjs
```

The portable interaction harness runs the repository's actual application and payloads. It covers all 28 pairs in both selection orders, all five variables, synchronized controls, fixed geometry and native metrics across colour changes, missing observations, city replacement, asynchronous selection races, retries and reduced motion. It does not perform browser visual review. Reports are in `validation/`, including independent native-metric and observed-distribution audits.

See [comparison data and provenance](docs/COMPARISON_DATA.md) for field coverage, measurement sources, missing values and projection limitations. Research preparation paths refer to the source workspace; all browser payloads are bundled here.

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
