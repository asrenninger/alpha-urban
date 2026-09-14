# The website

This folder is the complete static site at <https://asrenninger.github.io/alpha-urban/>. Nothing here is built or installed. The repository [README](../README.md) explains the inquiry.

The page is one continuous handoff. The opening walk follows one field, then two cities, then 1,000, and ends on the sphere of city means. That same sphere becomes an interactive fingerprint atlas, anchored on Singapore by default, with native 64-dimensional neighbour angles and repeated split-half checks. The same 1,000 cities then collapse to their own 2017 origins and move through all eight annual layers. The temporal canvas continues into eight centred urban-centre clouds, then the unadjusted HDI scatter of 977 cities in 157 countries. Scrolling introduces context controls, makes the switch to a common 942-city sample explicit, and adds the remaining controls one block at a time. All 1,000 identities persist; missing-input cities stay in a grey row. [DISPERSION_DATA.md](DISPERSION_DATA.md) documents the geometry, model adjustments and largest-sample sensitivities.

The global adapter experiment follows, moving the embeddings toward vegetation, building volume and land cover in whatever balance the reader sets and scoring them against original AlphaEarth. The ending comparison lets the reader choose two of eight cities and follow their pixels from maps into paired spheres, with two native 64-dimensional measures and distribution curves for the values behind each colour.

The data notes live beside the code. [COMPARISON_DATA.md](COMPARISON_DATA.md) covers the eight fields, their sources and file sizes. [JOINT_ADAPTER_DATA.md](JOINT_ADAPTER_DATA.md) covers the experiment's samples, scores and limits. The experiment uses the run held in `joint_adapter_v2_20260909/robust_v3`; the eight-city site that preceded it is tagged `website-2026-09-08-eight-cities`, and `LIVE_BASELINE.json` records the files that were live before that.

One caveat carried forward. The final scene of the walk reports 273,410 non-city pixels, and a later audit of the source found 241,841 with valid support. The scene is preserved as published. Any correction has to change the text and the assets together.

The code is `app.js` for the walk and shared globe; `city-evolution.js`, `city-evolution-data.mjs`, `city-evolution.css`, `split-half-view.mjs` and `dispersion-story.mjs` for fingerprints, time and dispersion; `joint-adapter.js`, `joint-adapter-view.mjs`, `joint-adapter-data.mjs` and `joint-adapter.css` for the experiment; and `comparison.js`, `comparison-statistics.js` and `comparison.css` for the final comparison. Everything is wired together in `index.html`. Model training and checkpoints stay outside this folder.

To publish the current website from the repository root on `main`, check the prospective files and stage only the website, documentation and validation paths:

```sh
python3 validation/verify_publish_scope.py --worktree
git add -- docs README.md .gitignore validation
git diff --cached --stat
git diff --cached --check
```

Review the staged list, then commit and push:

```sh
git commit -m "Polish city dispersion and HDI scroll story"
git push origin main
```

This publishes all current website changes, including the adapter updates already in the working tree. The explicit allowlist generates `.gitignore`, so research datasets and offline exports remain excluded. With `core.hooksPath` set to `.githooks`, the pre-push hook checks every outgoing commit against that allowlist and the file-size limit. A push sends committed history; it does not include uncommitted edits.
