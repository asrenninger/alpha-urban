#!/usr/bin/env python3
"""Load the AlphaUrban dataset and join pixels to their cities.

The city tables live in this repository. The pixel files are attached to the
GitHub Release named in dataset/README.md; download them into dataset_assets/
(or pass another directory as the first argument).

    python3 dataset/scripts/load_example.py [assets_dir]
"""
import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

root = Path(__file__).resolve().parents[1]
assets = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / "dataset_assets"

cities = pq.read_table(root / "cities.parquet").to_pandas().set_index("system_index")
print(f"{len(cities)} cities in {cities['Cntry_ISO'].nunique()} countries")

axes = [f"A{i:02d}" for i in range(64)]

# City-level: mean direction of every city in 2024 over the whole functional urban area.
sph = pq.read_table(root / "city_year" / "spherical_2024.parquet").to_pandas()
fua = sph[sph["support"] == "FUA_LAND"].set_index("system_index")
mu = fua[[f"mu_{a}" for a in axes]].to_numpy()
print("mean-direction matrix", mu.shape, "unit norm:", np.allclose(np.linalg.norm(mu, axis=1), 1, atol=1e-3))

# Pixel-level: read only the embedding and the city key for one year.
pixels_path = assets / "pixels_2024.parquet"
if pixels_path.exists():
    px = pq.read_table(pixels_path, columns=["system_index", "degree_ix"] + axes).to_pandas()
    px = px.join(cities[["city_label", "continent", "combined_design_weight"]], on="system_index")
    print(f"{len(px):,} pixels in 2024;", px["system_index"].nunique(), "cities")
    tokyo = px[px["city_label"] == "Tokyo (JPN)"]
    print("Tokyo pixels by degree of urbanisation:", tokyo["degree_ix"].value_counts().sort_index().to_dict())
else:
    print(f"pixel file not found at {pixels_path}; download it from the release first")
