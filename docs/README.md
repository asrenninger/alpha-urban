# Website: eight-city baseline

This directory is the complete static export published at <https://asrenninger.github.io/alpha-urban/>. The release tag is `website-2026-09-08-eight-cities`; see the repository [README](../README.md) for preview and validation commands.

`LIVE_BASELINE.json` records the 19 files of the preceding live release. Its guided-scene script, styles and data remain unchanged.

## Current flow

The original walk ends on the sphere of city means. The reader then selects two city tiles. Those fields open as side-by-side false-colour maps; scrolling carries the same pixels into side-by-side spheres. A selector stays with the spheres and applies false colour, Urbanisation, NDVI, land cover or building volume to both. Scrolling back restores the maps. Choosing another pair returns to the tiles.

Only the selected pair's pixel buffers and shared projection load. All eight available city fields and all 28 pairs work, including the requested measured layers. Melbourne completes the square tile grid. Every valid embedding is retained; missing covariates are grey. Read `COMPARISON_DATA.md` for support, sources and payload sizes.

Implementation: `comparison.js`, `comparison.css` and the ending of `index.html`. Release validation reports and a portable interaction harness are included in the repository's `validation/` directory. Asset preparation and the previous pixel laboratory are preserved in the research workspace.

The guided walk retains its existing content and limitations. A source audit in the research workspace found valid non-city terrestrial support of 241,841, rather than the existing global density caption's 273,410. This locked release preserves that scene; any future correction must update its text and assets together.
