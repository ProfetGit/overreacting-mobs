#!/usr/bin/env python3
"""Variant grid: one row per capture, one column per tick after the hit (t = 0 is the first frame that drew it).
Usage: grid.py <out.png> <scene> <crop x0,y0,x1,y1> <ticks comma> <label=capture> ...   [env WIDTH=200, HIT=n (align on the nth reaction, -1 = last)]"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TICK = 50_000_000


def frame_at(d: Path, t: float):
    lines = (d / "timing.txt").read_text().splitlines()
    head = lines[0].split()
    react = int(head[head.index("reacts") + 1].split(",")[int(os.environ.get("HIT", 0))])
    rows = [l.split() for l in lines[1:]]
    zero = int(next(r for r in rows if int(r[0]) == react)[1])
    best = min(rows, key=lambda r: abs(int(r[1]) - (zero + t * TICK)))
    return int(best[0])


def main() -> None:
    out, scene, crop, ticks = Path(sys.argv[1]), sys.argv[2], tuple(int(v) for v in sys.argv[3].split(",")), [float(v) for v in sys.argv[4].split(",")]
    caps = [a.split("=", 1) for a in sys.argv[5:]]
    w = int(os.environ.get("WIDTH", 200))
    h = round(w * (crop[3] - crop[1]) / (crop[2] - crop[0]))
    font = ImageFont.truetype("/usr/share/fonts/TTF/FiraSans-SemiBold.ttf", 15)
    lw, th = 70, 22
    im = Image.new("RGB", (lw + len(ticks) * w, th + len(caps) * h), (16, 16, 20))
    dr = ImageDraw.Draw(im)
    for j, t in enumerate(ticks):
        dr.text((lw + j * w + 6, 3), f"t{t:+g}", font=font, fill=(255, 216, 58))
    for i, (label, cap) in enumerate(caps):
        d = Path(cap) / scene
        dr.text((6, th + i * h + h // 2 - 8), label, font=font, fill=(255, 255, 255))
        for j, t in enumerate(ticks):
            tile = Image.open(d / f"f{frame_at(d, t):05d}.png").convert("RGB").crop(crop).resize((w, h), Image.LANCZOS)
            im.paste(tile, (lw + j * w, th + i * h))
    im.save(out)
    print(out, im.size)


if __name__ == "__main__":
    main()
