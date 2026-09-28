#!/usr/bin/env python3
"""Review sheets from dev/icon/preview/ (800px renders): sheet.png (all frames) and zoom.png (picked frames, large)."""
import glob
import sys
from PIL import Image, ImageDraw

BG = (61, 49, 121)
fs = sorted(glob.glob('preview/frame_*.png'))
ims = [Image.open(f) for f in fs]
bb = [im.getchannel('A').getbbox() for im in ims]
box = (min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb))
print('bbox', box)


def cell(im, size):
    c = im.crop(box)
    c.thumbnail((size, size), Image.NEAREST)
    bg = Image.new('RGBA', (size, size), BG + (255,))
    bg.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return bg.convert('RGB')


cols, size = 10, 160
sheet = Image.new('RGB', (cols * size, ((len(ims) + cols - 1) // cols) * size), BG)
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    sheet.paste(cell(im, size), ((i % cols) * size, (i // cols) * size))
    d.text(((i % cols) * size + 3, (i // cols) * size + 2), str(i), fill=(255, 255, 255))
sheet.save('preview/sheet.png')
pick = [int(a) for a in sys.argv[1].split(',')] if len(sys.argv) > 1 else [12, 13, 14, 15, 17, 21, 31, 40]
size = 360
z = Image.new('RGB', (4 * size, ((len(pick) + 3) // 4) * size), BG)
d = ImageDraw.Draw(z)
for i, f in enumerate(pick):
    z.paste(cell(ims[f], size), ((i % 4) * size, (i // 4) * size))
    d.text(((i % 4) * size + 4, (i // 4) * size + 4), str(f), fill=(255, 255, 255))
z.save('preview/zoom.png')
