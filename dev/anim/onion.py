#!/usr/bin/env python3
"""Onion skin and arcs from ZH.trail(name, t0, t1): dev/anim/hits/onion/<name>/ -> dev/anim/hits/onion/<name>.png.
Every tick's pose is drawn faded (the latest on top, key ticks given with --keys stronger) over the empty scene, with
the head, chest and hand tip paths: a dot per preview frame (50 fps), a ring and label per tick, so spacing shows as dot gaps.
Usage: onion.py <name> [--keys 0,3,10]"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --rig villager: the villager-like rig's previews (dev/anim/villager/) instead of the humanoid ones (dev/anim/hits/)
if "--rig" in sys.argv:
    _i = sys.argv.index("--rig")
    RIG_DIR = "hits" if sys.argv[_i + 1] == "humanoid" else sys.argv[_i + 1]
    del sys.argv[_i:_i + 2]
else:
    RIG_DIR = "hits"
DIR = Path(__file__).parent / RIG_DIR / "onion"
COLORS = {"head": (255, 216, 58), "chest": (120, 220, 255), "hand_r": (255, 90, 90), "hand_l": (120, 255, 120)}
FONT = "/usr/share/fonts/TTF/FiraSans-SemiBold.ttf"


def main() -> None:
    name = sys.argv[1]
    keys = set(int(k) for k in sys.argv[sys.argv.index("--keys") + 1].split(",")) if "--keys" in sys.argv else set()
    d = DIR / name
    meta = json.loads((d / "paths.json").read_text())
    im = Image.open(d / "bg.png").convert("RGBA")
    ticks = meta["ticks"]
    box = None
    for t in ticks:
        b = Image.open(d / f"o{str(t).zfill(3).replace('-', 'm')}.png").getchannel("A").getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    for i, t in enumerate(ticks):
        layer = Image.open(d / f"o{str(t).zfill(3).replace('-', 'm')}.png").convert("RGBA")
        a = (0.85 if t in keys else 0.1) if keys else 0.22 + 0.3 * i / max(1, len(ticks) - 1)
        alpha = layer.getchannel("A").point(lambda v, a=a: int(v * a))
        layer.putalpha(alpha)
        im.alpha_composite(layer)
    dr = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype(FONT, 12)
    except OSError:
        f = ImageFont.load_default()
    for k, pts in meta["paths"].items():
        c = COLORS[k]
        dr.line([(x, y) for x, y, t in pts], fill=c + (160,), width=1)
        for x, y, t in pts:
            if abs(t - round(t)) < 1e-6:
                dr.ellipse((x - 3.5, y - 3.5, x + 3.5, y + 3.5), outline=c, width=2)
                if k in ("head", "hand_r"):
                    dr.text((x + 5, y - 7), str(round(t)), font=f, fill=c, stroke_width=2, stroke_fill=(0, 0, 0))
            else:
                dr.ellipse((x - 1.2, y - 1.2, x + 1.2, y + 1.2), fill=c)
    out = DIR / f"{name}.png"
    cx, cy, side = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, max(box[2] - box[0], box[3] - box[1]) + 60
    im = im.crop((int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2)))
    im.convert("RGB").resize((720, 720), Image.LANCZOS).save(out)
    print(out)


if __name__ == "__main__":
    main()
