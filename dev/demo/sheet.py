#!/usr/bin/env python3
"""Review sheet from a capture: frames every `step` ticks around the hit (t = 0 is the first frame that drew it),
cropped and labelled with t, clip time and drawn height. Usage: sheet.py <capture>/<scene> <out.png>
[--from -1 --to 16 --step 1 --crop x0,y0,x1,y1 --cols 6 --width 300 --hit 0]"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TICK = 50_000_000


def main() -> None:
    d, out = Path(sys.argv[1]), Path(sys.argv[2])
    arg = lambda k, v: type(v)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else v
    t0, t1, step, cols, width, which = arg("--from", -1.0), arg("--to", 16.0), arg("--step", 1.0), arg("--cols", 6), arg("--width", 300), arg("--hit", 0)
    crop = tuple(int(v) for v in arg("--crop", "230,60,790,540").split(","))
    lines = (d / "timing.txt").read_text().splitlines()
    head = lines[0].split()
    reacts = [int(x) for x in head[head.index("reacts") + 1].split(",")]
    rows = [l.split() for l in lines[1:]]
    z = next(r for r in rows if int(r[0]) == reacts[which])
    zero, y0 = int(z[1]), float(z[6])
    font = ImageFont.truetype("/usr/share/fonts/TTF/FiraSans-SemiBold.ttf", 14)
    tiles, want, i = [], t0, 0
    while want <= t1 + 1e-9:
        target = zero + int(want * TICK)
        while i + 1 < len(rows) and int(rows[i + 1][1]) <= target:
            i += 1
        r = rows[i]
        im = Image.open(d / f"f{int(r[0]):05d}.png").convert("RGB").crop(crop)
        im = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
        dr = ImageDraw.Draw(im)
        dr.text((5, 3), f"t{(int(r[1]) - zero) / TICK:+.1f}  clip {float(r[5]):.2f}  y{float(r[6]) - y0:+.2f}", font=font, fill=(255, 255, 255),
                stroke_width=2, stroke_fill=(0, 0, 0))
        tiles.append(im)
        want += step
    w, h = tiles[0].size
    sheet = Image.new("RGB", (cols * w, ((len(tiles) + cols - 1) // cols) * h), (16, 16, 16))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * w, (k // cols) * h))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
