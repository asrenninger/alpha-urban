# Website: city comparisons and joint objectives

This is the complete static website for <https://asrenninger.github.io/alpha-urban/>. See the repository [README](../README.md) for preview and validation commands. Current file hashes are in `../releases/2026-09-09-joint-objectives.json`; the preceding eight-city baseline remains tagged `website-2026-09-08-eight-cities`.

## Current flow

The original walk ends on the sphere of city means. The reader selects two city tiles and follows their fields from false-colour maps into paired spheres. Colour controls apply false colour, Urbanisation, NDVI, land cover or building volume to both. Clicking selected A lets the reader replace it while preserving B; any unselected tile can replace B.

Two native AlphaEarth measures sit with the fields: mean-direction angular distance and covariance-direction overlap. The next section compares observed distributions, with translucent density curves for NDVI and building volume, native angular spread for the false-colour selection, and exact class shares for Urbanisation and land cover. Its controls and the sphere controls stay synchronized. City A is crimson and B navy, using the existing site palette.

All eight fields, all 28 pairs and every valid embedding remain available. Missing measurements are identified separately. Only the selected pixel buffers and projection load, followed by one small shared statistics file. Read [COMPARISON_DATA.md](COMPARISON_DATA.md) for support, sources and payload sizes.

The next section asks what happens when the representation serves three objectives. It now uses the completed global `joint_adapter_v2_20260909` run rather than the selected city pair. The 79 fitted settings include a 66-point regular lattice, the exact equal-priority fit and 12 off-grid interpolation checks. The equilateral control blends neighbouring three-seed mean representations continuously; the sphere uses a documented visual-only sample retaining all 998 eligible cities, while score cards use every task-valid row. Original AlphaEarth remains a separate reference. See [JOINT_ADAPTER_DATA.md](JOINT_ADAPTER_DATA.md) for data, methods and scientific limits.

Implementation: `comparison.js`, `comparison-statistics.js`, `comparison.css`, `joint-adapter.js`, `joint-adapter-view.mjs`, `joint-adapter-data.mjs`, `joint-adapter.css` and the ending of `index.html`. Portable interaction checks and independent data-audit reports are in `../validation/`. Model training and checkpoints remain outside the website. Joint release hashes are in `../releases/2026-09-09-joint-objectives.json`.

`LIVE_BASELINE.json` records the preceding live files. The guided walk retains its existing content and limitations. A source audit found valid non-city terrestrial support of 241,841 rather than the existing density caption's 273,410. This checkpoint preserves that scene; any future correction must update its text and assets together.
