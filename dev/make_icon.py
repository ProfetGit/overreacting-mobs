#!/usr/bin/env python3
"""Compose the Overreacting Mobs icon from Blockbench renders in dev/icon/frames/ (transparent 1600px PNGs, one per frame).

Outputs go to dev/icon/out/ (./gradlew dist wipes dist/): icon-animated.gif (Modrinth, <= 256 KiB), icon-512.png,
plus src/main/resources/assets/mobreactions/icon.png (the mod icon in the jars) and dev/icon/contact.png.
Scene + animation: dev/icon/build_scene.js -> dev/icon/overreacting_mobs_icon.bbmodel (sprites in dev/icon/sprites).
Background: dev/icon/sprites/bg_flat.png (64px flat colour). The zombie's floor shadow is rendered in the key #00FFFF and
painted SHADOW_RGB here, underneath the outline (split()).

  python3 dev/make_icon.py             # the icon
  python3 dev/make_icon.py --options   # dev/icon/bg_options.png: candidate backgrounds with their GIF sizes
"""
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "dev" / "icon"
OUT = ICON / "out"
BACKGROUND = ICON / "sprites" / "bg_flat.png"
MOD_ICON = ROOT / "src/main/resources/assets/mobreactions/icon.png"
S = 512
FPS = 25
STILL_FRAME = 20   # mid-flight: red, wide-eyed, arms flung
START_FRAME = 0
GIF_SIZE = 256
GIF_LIMIT = 256 * 1024
PALETTE = 255
# fixed crop of the 1600px renders: the zombie's whole path and the sword; the smear tail (frame 13) and a sweat drop may leave it
CROP = (482, 404, 1066, 988)
OUTLINE = 19
MOD_ICON_BOX = (0, 0, 512, 512)
# static variants: name -> (source: animation frame index or static_src name, square crop box in 1600px render space)
STATICS = {}

# candidate backgrounds for --options: (name, flat, shadow)
OPTIONS = [("sunset orange", "#E07A3F", "#C2622C"), ("berry", "#B8457A", "#963363"),
           ("sunny yellow", "#E9B949", "#CC9A33"), ("grape", "#5B3C99", "#482E7E")]
SHADOW = None   # the zombie casts its own shadow in the art


def flat_bg(flat: str, shadow: str) -> Image.Image:
    im = Image.new("RGBA", (64, 64), flat)
    return im.resize((S, S), Image.NEAREST)


def split(art: Image.Image) -> tuple:
    """(shadows, solid art): the shadows go under the outline, the outline hugs only the solid art."""
    a = np.array(art)
    sh = a[..., 3] == SHADOW_ALPHA
    shadows, solid = a.copy(), a.copy()
    shadows[~sh] = 0
    shadows[sh, 3] = 255
    solid[sh] = 0
    return Image.fromarray(shadows), Image.fromarray(solid)


def compose(art: Image.Image, bg: Image.Image, outline: int = OUTLINE, shadow_rgb=None) -> Image.Image:
    shadows, solid = split(art)
    if shadow_rgb:
        a = np.array(shadows)
        a[a[..., 3] > 0, :3] = shadow_rgb
        shadows = Image.fromarray(a)
    outline_layer = Image.new("RGBA", solid.size, (10, 12, 18, 0))
    outline_layer.putalpha(solid.getchannel("A").filter(ImageFilter.MaxFilter(outline)))
    out = Image.alpha_composite(bg, shadows)
    return Image.alpha_composite(Image.alpha_composite(out, outline_layer), solid)


def gif_bytes(frames: list) -> bytes:
    small = [f.convert("RGB").resize((GIF_SIZE, GIF_SIZE), Image.NEAREST) for f in frames]
    sheet = Image.new("RGB", (GIF_SIZE * len(small), GIF_SIZE))
    for i, f in enumerate(small):
        sheet.paste(f, (i * GIF_SIZE, 0))
    palette = sheet.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT)
    gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in small]
    buf = io.BytesIO()
    gif[0].save(buf, "GIF", save_all=True, append_images=gif[1:], duration=1000 // FPS, loop=0, optimize=True, disposal=1)
    return buf.getvalue()


SHADOW_RGB = (150, 51, 99)   # #963363, berry's shadow
SHADOW_ALPHA = 254           # marks shadow pixels until compose(), so the outline skips them


def clean(im: Image.Image) -> Image.Image:
    """Key colour -> transparent, shadow key -> shadow blue, then drop stray specks (a group scaled to 0 can still
    rasterise a pixel, and the outline would blow it up into a dot)."""
    a = np.array(im.convert("RGBA"))
    a[(a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)] = 0
    a[(a[..., 0] == 0) & (a[..., 1] == 255) & (a[..., 2] == 255)] = SHADOW_RGB + (SHADOW_ALPHA,)
    solid = a[..., 3] > 0
    p = np.pad(solid, 2).astype(np.int16)
    n = sum(p[2 + dy:2 + dy + solid.shape[0], 2 + dx:2 + dx + solid.shape[1]] for dy in range(-2, 3) for dx in range(-2, 3))
    a[solid & (n <= 3)] = 0
    return Image.fromarray(a)


def arts() -> list:
    files = sorted((ICON / "frames").glob("frame_*.png"))
    if not files:
        sys.exit("no frames in dev/icon/frames - render them from Blockbench first")
    return [clean(Image.open(f).crop(CROP)).resize((S, S), Image.NEAREST) for f in files]


def options(art: list) -> None:
    picks = [0, 14, 20, 27, 40]
    cell = 200
    sheet = Image.new("RGB", (len(picks) * cell + 260, len(OPTIONS) * (cell + 24)), (24, 24, 30))
    d = ImageDraw.Draw(sheet)
    for r, (name, flat, shadow) in enumerate(OPTIONS):
        rgb = tuple(int(shadow[i:i + 2], 16) for i in (1, 3, 5))
        frames = [compose(a, flat_bg(flat, shadow), shadow_rgb=rgb) for a in art]
        kib = len(gif_bytes(frames)) / 1024
        y = r * (cell + 24)
        for c, i in enumerate(picks):
            sheet.paste(frames[i].convert("RGB").resize((cell, cell), Image.LANCZOS), (c * cell, y))
        for k, back in enumerate(((20, 20, 24), (240, 240, 240))):
            x0 = len(picks) * cell + 20 + k * 120
            d.rectangle((x0, y, x0 + 110, y + 110), fill=back)
            sheet.paste(frames[picks[1]].convert("RGB").resize((96, 96), Image.LANCZOS), (x0 + 7, y + 7))
        d.text((6, y + cell + 4), f"{name}  {flat}  GIF {kib:.0f} KiB", fill=(230, 230, 235))
    out = ICON / "bg_options.png"
    sheet.save(out)
    print(out)


def main() -> None:
    art = arts()
    if "--options" in sys.argv:
        options(art)
        return
    bg = Image.open(BACKGROUND).convert("RGBA").resize((S, S), Image.NEAREST)
    frames = [compose(a, bg) for a in art]
    OUT.mkdir(exist_ok=True)
    still = frames[STILL_FRAME].convert("RGB")
    still.save(OUT / "icon-512.png", optimize=True)
    still.crop(MOD_ICON_BOX).resize((128, 128), Image.LANCZOS).save(MOD_ICON, optimize=True)
    frame_files = sorted((ICON / "frames").glob("frame_*.png"))
    for name, (src, box) in STATICS.items():
        path = frame_files[src] if isinstance(src, int) else ICON / "out" / "static_src" / f"{src}.png"
        if not path.exists():
            print(f"static '{name}': no {path.name} (run HB.stills() in Blockbench)")
            continue
        art = clean(Image.open(path).crop(box)).resize((S, S), Image.NEAREST)
        compose(art, bg).convert("RGB").save(OUT / f"icon-static-{name}.png", optimize=True)
    data = gif_bytes(frames[START_FRAME:] + frames[:START_FRAME])
    out = OUT / "icon-animated.gif"
    out.write_bytes(data)

    cols = 10
    rows = (len(frames) + cols - 1) // cols
    contact = Image.new("RGB", (cols * 128, rows * 128))
    for i, f in enumerate(frames):
        contact.paste(f.convert("RGB").resize((128, 128), Image.LANCZOS), ((i % cols) * 128, (i // cols) * 128))
    contact.save(ICON / "contact.png")

    size = len(data)
    print(f"{len(frames)} frames @ {FPS} fps -> {out.relative_to(ROOT)} {size / 1024:.0f} KiB "
          f"({'OK' if size <= GIF_LIMIT else 'OVER'} Modrinth 256 KiB limit); still = frame {STILL_FRAME}")
    if size > GIF_LIMIT:
        sys.exit(1)


if __name__ == "__main__":
    main()
