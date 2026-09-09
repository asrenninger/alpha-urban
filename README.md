# AlphaUrban

An interactive walk through AlphaEarth embeddings, from individual pixels to cities, followed by an eight-city pixel comparison.

[Visit the website](https://asrenninger.github.io/alpha-urban/).

## Current website checkpoint

The comparison includes eight square city tiles, paired map-to-sphere scrolling, and shared colouring by false colour, Urbanisation, NDVI, land cover and building volume. The spheres show native 64-D mean-direction distance and covariance-direction overlap. A following distribution section uses the same city selection and synchronized measurement controls: translucent density curves for continuous measurements and exact class-share bars for categories. City A and B use the site's crimson and navy palette.

The joint-objective experiment follows the distributions and uses the completed global `joint_adapter_v2_20260909` run. Its equilateral triangle exposes 79 fitted weight settings and continuously blends neighbouring three-seed mean representations. The sphere is a visual-only global layer retaining every eligible city, coloured by observed land cover, NDVI or building volume; score cards use the full task-valid held-out or validation support. Original AlphaEarth remains a separate reference.

Only frozen display projections, observations and measured score summaries are published. Checkpoints, training data and native embeddings remain in the research workspace. The previous checkpoints and tags are preserved. The joint integration's file hashes are recorded in `releases/2026-09-09-joint-objectives.json`; the preceding comparison checkpoint is `releases/2026-09-08-comparison-statistics.json`.

The complete static website lives in `docs/`. GitHub Pages publishes that directory from `main`; no build or dependency installation is required.

## Publication scope

The project-root checkout uses a deny-by-default `.gitignore`: only files named in `validation/publish_allowlist.json` are eligible for normal Git additions. Research folders, local experiments, datasets, credentials and offline neural-model exports stay ignored. New website files require an explicit allowlist update followed by `python3 validation/verify_publish_scope.py --write-ignore`.

The pre-push guard also checks committed paths, file types and size, including every new commit in pushed history. This catches files force-added past `.gitignore`, even if removed in a later commit. Enable it in a new checkout with `git config core.hooksPath .githooks`; it is configured in the local project-root checkout. Deliberately bypassing hooks or changing the allowlist can override these protections.

Run `python3 validation/verify_publish_scope.py` to check the current commit, `python3 validation/verify_publish_scope.py --worktree` to check an uncommitted replacement, or `python3 validation/test_publish_scope.py` to exercise the guard. The user controls the final push to `origin main`.

## Preview and validation

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs
```

Open <http://127.0.0.1:8766/> or jump to <http://127.0.0.1:8766/#city-atlas>.

```sh
node validation/validate_comparison.cjs
node validation/validate_joint_adapter.mjs
node validation/validate_joint_interface.mjs
```

The portable interaction harness runs the repository's actual application and payloads. It covers all 28 pairs in both selection orders, all five variables, synchronized controls, fixed geometry and native metrics across colour changes, missing observations, city replacement, asynchronous selection races, retries and reduced motion. It does not perform browser visual review. Reports are in `validation/`, including independent native-metric and observed-distribution audits.

See [comparison data and provenance](docs/COMPARISON_DATA.md) for field coverage, measurement sources, missing values and projection limitations. Research preparation paths refer to the source workspace; all browser payloads are bundled here.

See [joint-objective data and limits](docs/JOINT_ADAPTER_DATA.md) for full task support, the visual-only global sample, score definitions and interpolation audit. The v2 browser payload is approximately 7.7 MB across 80 independently loaded gzip projection chunks plus observations and aggregate scores. Lossless gzip is decoded in the browser using `DecompressionStream`. No build step or hosted service is required. `validation/export_joint_adapter_v2.py` reproduces the publication assets from the completed local run when its research inputs are available; it is not required to serve the website.

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
