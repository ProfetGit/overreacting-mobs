#!/usr/bin/env python3
"""Contact sheet of ZH.stills() renders: dev/anim/hits/stills/<name>_<view>_<tick>.png -> dev/anim/hits/stills/<name>.png
(one row per view, one column per tick). Usage: stills.py <name>"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# --rig villager: the villager-like rig's previews (dev/anim/villager/) instead of the humanoid ones (dev/anim/hits/)
if "--rig" in sys.argv:
    _i = sys.argv.index("--rig")
    RIG_DIR = "hits" if sys.argv[_i + 1] == "humanoid" else sys.argv[_i + 1]
    del sys.argv[_i:_i + 2]
else:
    RIG_DIR = "hits"
DIR = Path(__file__).resolve().parent / RIG_DIR / "stills"


def main() -> None:
    name = sys.argv[1]
    shots = {}
    for p in DIR.glob(f"{name}_*_*.png"):
        m = re.fullmatch(re.escape(name) + r"_(\w+?)_(-?[\d.]+)\.png", p.name)
        if m:
            shots[(m.group(1), float(m.group(2)))] = p
    views = sorted({v for v, _ in shots}, key=lambda v: list(shots).index(next(k for k in shots if k[0] == v)))
    ticks = sorted({t for _, t in shots})
    cell = 320
    sheet = Image.new("RGB", (len(ticks) * cell, len(views) * cell), (20, 20, 20))
    for r, v in enumerate(views):
        for c, t in enumerate(ticks):
            if (v, t) in shots:
                im = Image.open(shots[(v, t)]).convert("RGB")
                ImageDraw.Draw(im).text((4, 4), f"{v} t{t:g}", fill=(255, 255, 255))
                sheet.paste(im, (c * cell, r * cell))
    sheet.save(DIR / f"{name}.png")
    print(DIR / f"{name}.png")


if __name__ == "__main__":
    main()
