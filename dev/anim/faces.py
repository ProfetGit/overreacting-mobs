#!/usr/bin/env python3
"""Preview copies of the runtime face expressions: dev/anim/textures/<mob>.png -> <mob>_<face>.png.
Same rules as the mod's Faces class, read from src/main/resources/assets/mobreactions/faces.json (the mob's spec
from "types", "humanoid" otherwise). The source textures are vanilla (extracted from the local jar) and stay out of git.
Usage: faces.py [mob ...] (default zombie)"""
import json
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
FACES = json.loads((HERE.parents[1] / "src/main/resources/assets/mobreactions/faces.json").read_text())


def dist(a, b):
    return sum(abs(a[i] - b[i]) for i in range(3))


def paint(src: Image.Image, spec: dict, face: str) -> Image.Image:
    im = src.convert("RGBA").copy()
    s = im.width // spec.get("uv_width", 64)
    ox, oy = spec["face_origin"]
    px = lambda x, y: ((ox + x) * s, (oy + y) * s)
    erase = spec["erase"]
    if "ink_sample" in spec:
        ink = im.getpixel(px(*spec["ink_sample"]))
        e = erase[0]
        under = im.getpixel(px(e[2], e[3]) if len(e) > 2 else px(e[0], e[1] - 1))
        if dist(ink, under) < 40:
            ink = tuple(round(c * 0.35) for c in ink[:3]) + (ink[3],)
    else:
        ink = im.getpixel(px(*spec["eye_sample"]))
    f = spec["faces"][face]
    f = f if isinstance(f, dict) else {"ink": f}
    srcim = im.copy()
    for e in ([] if f.get("eyes") else erase) + f.get("erase", []):
        fill = srcim.getpixel(px(e[2], e[3]) if len(e) > 2 else px(e[0], e[1] - 1))
        X, Y = px(e[0], e[1])
        for dx in range(s):
            for dy in range(s):
                im.putpixel((X + dx, Y + dy), fill)
    for x, y in f.get("ink", []):
        X, Y = px(x, y)
        for dx in range(s):
            for dy in range(s):
                im.putpixel((X + dx, Y + dy), ink)
    return im


def glow(src: Image.Image, spec: dict, face: str | None) -> Image.Image:
    """The eyes layer (spec "glow"): erased texels turn transparent, the ink is the layer's own colour at ink_sample."""
    im = src.convert("RGBA").copy()
    if face is None:
        return im
    ox, oy = spec["face_origin"]
    ink = im.getpixel((ox + spec["ink_sample"][0], oy + spec["ink_sample"][1]))
    for e in spec["erase"]:
        im.putpixel((ox + e[0], oy + e[1]), (0, 0, 0, 0))
    for x, y in spec["faces"][face]:
        im.putpixel((ox + x, oy + y), ink)
    return im


# a spec with "glow" (an eyes layer glowing over the face): the previews get <mob>_glow[_<face>].png, the base with the
# layer on top (textures.py extracts the layer as textures/<its file name>)


def main() -> None:
    for mob in sys.argv[1:] or ["zombie"]:
        spec = FACES["specs"][FACES["types"].get("minecraft:" + mob, "humanoid")]
        src = Image.open(HERE / "textures" / f"{mob}.png")
        for face in spec["faces"]:
            paint(src, spec, face).save(HERE / "textures" / f"{mob}_{face}.png")
            print(f"{mob}_{face}.png")
        if spec.get("glow"):
            eyes = Image.open(HERE / "textures" / spec["glow"].rsplit("/", 1)[1])
            for face in [None, *spec["faces"]]:
                base = (src.convert("RGBA") if face is None else paint(src, spec, face)).copy()
                base.alpha_composite(glow(eyes, spec, face))
                name = f"{mob}_glow" + ("" if face is None else "_" + face) + ".png"
                base.save(HERE / "textures" / name)
                print(name)


if __name__ == "__main__":
    main()
