"""Export the exact city identity behind each point in the story globe.

The scrollytelling globe is ordered by ``analysis_rank`` while the narrative
city records retain the prototype catalogue order.  This bridge lets the
browser reuse the original globe geometry without guessing identities from
display coordinates.
"""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROTOTYPES = (
    ROOT
    / "bakeoff_20260831/analysis/prototypes/"
    "city_prototypes_pooled_wide_1000_2024.csv.gz"
)
EXPOSURE = (
    ROOT
    / "bakeoff_20260831/inputs/rebuild_1000/"
    "s1b_current_figure_c_inference_20260827_v2/source_data/"
    "city_exposure_panel_1000.csv"
)
NARRATIVE = ROOT / "docs/data/narrative/cities.json"
OUTPUT = ROOT / "docs/data/narrative/globe-order.json"


def main() -> None:
    with gzip.open(PROTOTYPES, "rt") as handle:
        prototype_ids = [row["system_index"] for row in csv.DictReader(handle)]
    with EXPOSURE.open() as handle:
        ranks = {
            row["system_index"]: int(row["analysis_rank"])
            for row in csv.DictReader(handle)
        }
    narrative_ids = {
        city["id"] for city in json.loads(NARRATIVE.read_text())["cities"]
    }

    assert len(prototype_ids) == len(set(prototype_ids)) == 1000
    assert set(prototype_ids) == set(ranks) == narrative_ids
    assert set(ranks.values()) == set(range(1, 1001))
    ids = sorted(prototype_ids, key=lambda city_id: ranks[city_id])

    payload = {
        "schemaVersion": 1,
        "year": 2024,
        "support": "FUA_CITY_SMOD21PLUS",
        "order": "Ascending analysis_rank; array index equals story_v2.globe index.",
        "ids": ids,
    }
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(ids)} city identities.")


if __name__ == "__main__":
    main()
