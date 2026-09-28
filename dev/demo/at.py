#!/usr/bin/env python3
"""Full-resolution frames of a capture at given ticks after the first frame that drew the hit, side by side.
Usage: at.py <capture>/<scene> <out.png> <t1,t2,...> [crop x0,y0,x1,y1] [scale] [cols]"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

d, out = Path(sys.argv[1]), sys.argv[2]
ts = [float(x) for x in sys.argv[3].split(",")]
crop = tuple(int(v) for v in (sys.argv[4] if len(sys.argv) > 4 else "0,0,960,540").split(","))
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
lines = (d / "timing.txt").read_text().splitlines()
head = lines[0].split()
r = int(head[head.index("reacts") + 1].split(",")[0])
rows = [l.split() for l in lines[1:]]
t0 = int(rows[r][1])
ims = []
for t in ts:
    best = min(rows, key=lambda q: abs(int(q[1]) - t0 - t * 50_000_000))
    im = Image.open(d / f"f{int(best[0]):05d}.png").convert("RGB").crop(crop)
    if scale != 1:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST)
    ImageDraw.Draw(im).text((4, 4), f"t+{t:g} {best[4]} {float(best[5]):.2f}", fill=(255, 255, 0))
    ims.append(im)
cols = min(len(ims), int(sys.argv[6]) if len(sys.argv) > 6 else 4)
w, h = ims[0].size
sheet = Image.new("RGB", (w * cols, h * ((len(ims) + cols - 1) // cols)))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
print(out, sheet.size)
