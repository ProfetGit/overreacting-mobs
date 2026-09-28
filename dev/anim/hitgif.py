#!/usr/bin/env python3
"""Preview GIFs of the zombie hit reactions rendered by hits.js (ZH.render), at the render's frame rate (sub-tick).

Usage: hitgif.py <name> [<name> ...] | all
Reads dev/anim/hits/frames/<name>/ (fNNN.png full scene, mNNN.png zombie-only mask for the hurt ticks listed in
meta.json) and writes dev/anim/hits/<name>.gif (50 fps) and dev/anim/hits/<name>-sheet.png (one frame per game tick, for review).
Hurt ticks get vanilla's red overlay on the zombie pixels: mix(red, texel, 0.7) (OverlayTexture, alpha 0xB2)."""
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
ROOT = Path(__file__).resolve().parent / RIG_DIR
FONT = "/usr/share/fonts/TTF/FiraSans-SemiBold.ttf"
TITLES = {
    "hit_front": ("FRONT HIT", "normal hit, zombie facing you"),
    "hit_crit": ("CRITICAL HIT", "falling attack"),
    "hit_side_r": ("SIDE HIT", "hit on its right side (left side = mirror)"),
    "hit_side_l": ("SIDE HIT (MIRROR)", "hit on its left side"),
    "hit_back": ("BACK HIT", "hit from behind"),
    "hit_launch": ("SPRINT HIT", "sprint / knockback attack"),
    "hit_twist": ("COMBO SLASH", "combo hit 2/3"),
    "hit_heavy": ("COMBO FINISHER", "combo hit 4"),
    "death_front": ("DEATH: FRONT", "flat on its back"),
    "death_twist": ("DEATH: SLASH", "half spin, face down"),
    "death_heavy": ("DEATH: FINISHER", "knees, then face-plant"),
    "death_crit": ("DEATH: CRIT", "crumples into a heap"),
    "death_launch": ("DEATH: SPRINT", "on its back, skids"),
    "death_side_r": ("DEATH: SIDE", "falls on its side"),
    "hit_side": ("SIDE HIT", "hit on its right side (left side = mirror)"),
    "hit_big": ("BIG HIT", "crit or sprint hit"),
    "death_big": ("DEATH: BIG", "crumples into a heap"),
    "death_side_l": ("DEATH: SIDE (MIRROR)", "falls on its side"),
    "death_back": ("DEATH: BACK", "falls forward, face down"),
    "death_collapse": ("DEATH: COLLAPSE", "no hit: fire, fall, drowning"),
    "death_slump": ("DEATH: SLUMP", "no hit, no room to fall"),
}


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def tint(frame: Image.Image, mask: Image.Image) -> Image.Image:
    red = Image.new("RGBA", frame.size, (255, 0, 0, 255))
    hurt = Image.blend(red, frame, 0.7)
    out = frame.copy()
    out.paste(hurt, (0, 0), mask.getchannel("A").point(lambda a: 255 if a > 0 else 0))
    return out


def label(im: Image.Image, name: str, tick: int | None) -> None:
    d = ImageDraw.Draw(im)
    title, sub = TITLES.get(name, (name, ""))
    d.rectangle((0, 0, im.width, 44), fill=(24, 28, 40))
    d.text((12, 4), title, font=font(20), fill=(255, 216, 58))
    d.text((12, 26), sub, font=font(13), fill=(210, 214, 224))
    if tick is not None:
        d.text((im.width - 12, 8), f"tick {tick}", font=font(14), fill=(160, 170, 190), anchor="ra")


def build(name: str) -> None:
    src = ROOT / "frames" / name
    meta = json.loads((src / "meta.json").read_text())
    out = []
    for i in range(meta["n"]):
        f = Image.open(src / f"f{i:03d}.png").convert("RGBA")
        if i in meta["hurt"]:
            f = tint(f, Image.open(src / f"m{i:03d}.png").convert("RGBA"))
        t = meta["ticks"][i]
        label(f, name, int(t) if 0 <= t < meta["len"] else None)
        out.append(f.convert("RGB"))
    step = round(1000 / (20 * meta["sub"]))
    durations = [step] * len(out)
    durations[-1] = 450
    out[0].save(ROOT / f"{name}.gif", save_all=True, append_images=out[1:], duration=durations, loop=0, optimize=True)
    cols, cell = 8, 240
    picks = [f for f, t in zip(out, meta["ticks"]) if abs(t - round(t)) < 1e-6]
    rows = (len(picks) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (20, 20, 20))
    for i, f in enumerate(picks):
        sheet.paste(f.resize((cell, cell), Image.NEAREST), ((i % cols) * cell, (i // cols) * cell))
    sheet.save(ROOT / f"{name}-sheet.png")
    kb = (ROOT / f"{name}.gif").stat().st_size // 1024
    print(f"{name}: {len(out)} frames, {kb} KiB")


def main() -> None:
    names = sys.argv[1:]
    if names == ["all"]:
        names = sorted(p.name for p in (ROOT / "frames").iterdir() if p.is_dir())
    for n in names:
        build(n)


if __name__ == "__main__":
    main()
