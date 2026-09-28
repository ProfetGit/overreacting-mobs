#!/usr/bin/env python3
"""Real-client GIFs from run.sh captures: <capture>/<scene>/fNNNNN.png + timing.txt -> <out>/<scene>.gif.

Each GIF runs from `before` ticks before the (first) hit to `after` ticks after the (last) hit, resampled at 50 fps
(the long combo: 33 fps, narrower) from the frames' real timestamps (the client renders at ~120 fps), cropped to
`crop` (x0,y0,x1,y1 of the 960x540 capture) and scaled to `width`. Also writes <scene>-sheet.png: one frame per game tick, for review.
Usage: gif.py <capture-dir> <out-dir> [scene ...]   (env TAG="Fresh Animations" adds a note to the subtitle)

Review tools (panels cropped by --crop x0,y0,x1,y1, default CROP; t = 0 is the first frame that drew the hit):
  gif.py --slow <capture-dir> <out-dir> <scene> [--from -2 --to 14 --crop ...]
      <scene>-slow.gif: the impact window at 4x slower (real time sampled every 10 ms, shown 40 ms per frame).
  gif.py --cmp <cap1>,<cap2>[,...] <out-dir> <scene> [--labels A,B,...] [--slow] [--name x] [--width 360]
      <name or scene>-cmp[-slow].gif: the captures side by side, frame-aligned on the hit, each with its label.
      A capture written as <dir>@x0:y0:x1:y1 gets its own crop. A capture written as <dir>%<scene> shows that scene instead. --cols n lays the panels out n per row. Env FPS (default 50) sets the normal-speed frame rate."""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FPS = 50
SCENE_FPS = {"combo": 33, "death_heavy": 33, "death_twist": 33}  # long clip: 30 ms frames and a narrower GIF keep its size down
SCENE_WIDTH = {"combo": 440, "death_heavy": 440, "death_twist": 440}
BEFORE = 6
AFTER = {"crit": 40, "launch": 36, "combo": 36}
DEATH_AFTER = 46  # death clip (about 40 ticks from the blow), the poof, a moment of empty ground
CROP = (60, 0, 900, 540)
WIDTH = 520
FONT = "/usr/share/fonts/TTF/FiraSans-SemiBold.ttf"
VERSION = next((l.split("=", 1)[1].strip() for l in (Path(__file__).resolve().parents[2] / "gradle.properties").read_text().splitlines()
                if l.startswith("mod.version=")), "?")
TITLES = {
    "front": ("FRONT HIT", "normal hit, facing you"),
    "light": ("LIGHT HIT", "uncharged swing, facing you"),
    "crit": ("CRITICAL HIT", "falling attack"),
    "launch": ("SPRINT HIT", "sprint attack, extra knockback"),
    "side_r": ("SIDE HIT", "hit on its right side"),
    "side_l": ("SIDE HIT", "hit on its left side"),
    "back": ("BACK HIT", "hit from behind"),
    "combo": ("COMBO", "5 sword hits in a row"),
    "death_front": ("DEATH: FRONT HIT", "killed facing you: flat on its back"),
    "death_crit": ("DEATH: CRITICAL HIT", "falling attack: crumples into a heap"),
    "death_launch": ("DEATH: SPRINT HIT", "on its back, skids"),
    "death_side_r": ("DEATH: SIDE HIT", "hit on its right side: falls on its side"),
    "death_side_l": ("DEATH: SIDE HIT", "hit on its left side: falls on its side"),
    "death_back": ("DEATH: BACK HIT", "hit from behind: falls on its face"),
    "death_twist": ("DEATH: COMBO SLASH", "killed by combo hit 2: half spin, face down"),
    "death_heavy": ("DEATH: COMBO FINISHER", "killed by combo hit 4: knees, then face-plant"),
    "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: collapses"),
    "death_fall": ("DEATH: NO HIT (FALL)", "dropped from 12 blocks: collapses"),
    "death_wall": ("DEATH: NO ROOM", "wall behind it: heap instead of lying down"),
}
# env RIG=creeper: the creeper's deaths
if os.environ.get("RIG") == "creeper":
    TITLES.update({
        "death_front": ("DEATH: FRONT HIT", "killed facing you: topples back stiff as a plank"),
        "death_crit": ("DEATH: CRITICAL HIT", "falling attack: crumples in place"),
        "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: fizzles and folds up"),
        "death_fall": ("DEATH: NO HIT (FALL)", "dropped from 12 blocks: fizzles and folds up"),
        "death_wall": ("DEATH: NO ROOM", "wall behind it: crumples in place"),
    })
# env RIG=enderman: the enderman's deaths
if os.environ.get("RIG") == "enderman":
    TITLES.update({
        "death_front": ("DEATH: FRONT HIT", "killed facing you: topples back like a felled tree"),
        "death_crit": ("DEATH: CRITICAL HIT", "falling attack: legs skid into the splits, folds over"),
        "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: sways, sinks into the splits"),
        "death_fall": ("DEATH: NO HIT (FALL)", "dropped from 12 blocks: sinks into the splits"),
        "death_wall": ("DEATH: NO ROOM", "wall behind it: splits in place"),
    })
# env RIG=pet: the pets' deaths
if os.environ.get("RIG") == "pet":
    TITLES.update({
        "death_crit": ("DEATH: CRITICAL HIT", "falling attack: splats flat on its belly"),
        "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: lies down and curls up"),
        "death_fall": ("DEATH: NO HIT (FALL)", "dropped from 12 blocks: lies down and curls up"),
        "death_wall": ("DEATH: NO ROOM", "walls at its sides: splat instead of lying on its side"),
    })
# env RIG=spider: the spider's deaths
if os.environ.get("RIG") == "spider":
    TITLES.update({
        "death_front": ("DEATH: FRONT HIT", "killed facing you: flips onto its back, legs curl up"),
        "death_crit": ("DEATH: CRITICAL HIT", "falling attack: splats flat on its belly"),
        "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: legs give, rolls onto its back"),
        "death_fall": ("DEATH: NO HIT (FALL)", "dropped from 12 blocks: rolls onto its back"),
        "death_wall": ("DEATH: NO ROOM", "wall behind it: flips over in place"),
    })
# env RIG=quadruped: the four-legged deaths
if os.environ.get("RIG") == "quadruped":
    TITLES.update({
        "death_front": ("DEATH: FRONT HIT", "killed facing you: rolls onto its side"),
        "death_crit": ("DEATH: CRITICAL HIT", "falling attack: splats flat on its belly"),
        "death_fire": ("DEATH: NO HIT (FIRE)", "no attacker: kneels, sinks, rolls over"),
        "death_wall": ("DEATH: NO ROOM", "walls at its sides: splat instead of rolling over"),
    })


def read(scene_dir: Path):
    """-> (first hit tick, last hit tick, rows). Older captures have only `hit_tick N` in the header."""
    lines = (scene_dir / "timing.txt").read_text().splitlines()
    head = lines[0].split()
    last = int(head[head.index("last_hit") + 1]) if "last_hit" in head else int(head[-1])
    first = int(head[head.index("first_hit") + 1]) if "first_hit" in head else last
    rows = []
    for l in lines[1:]:
        n, ns, tick, partial = l.split()[:4]
        rows.append((int(n), int(ns), int(tick), float(partial)))
    return first, last, rows


def label(im: Image.Image, scene: str) -> None:
    d = ImageDraw.Draw(im)
    title, sub = TITLES.get(scene, (scene, ""))
    try:
        big, small = ImageFont.truetype(FONT, 20), ImageFont.truetype(FONT, 13)
    except OSError:
        big = small = ImageFont.load_default()
    d.rectangle((0, 0, im.width, 44), fill=(24, 28, 40))
    d.text((12, 4), title, font=big, fill=(255, 216, 58))
    tag = os.environ.get("TAG")
    d.text((12, 26), sub + f"  ·  in-game, Mob Reactions {VERSION}" + (f" + {tag}" if tag else ""), font=small, fill=(210, 214, 224))


def build(cap: Path, out: Path, scene: str) -> None:
    d = cap / scene
    hit, last, rows = read(d)
    after = AFTER.get(scene, DEATH_AFTER if scene.startswith("death_") else 30)
    fps = SCENE_FPS.get(scene, FPS)
    width = SCENE_WIDTH.get(scene, WIDTH)
    # the hit tick starts at the first frame rendered in it; game time runs on real time
    t0 = next(ns for n, ns, tick, p in rows if tick >= hit - BEFORE)
    t1 = next((ns for n, ns, tick, p in rows if tick >= last + after), rows[-1][1])
    picks, i, t = [], 0, t0
    while t <= t1:
        while i + 1 < len(rows) and rows[i + 1][1] <= t:
            i += 1
        picks.append(rows[i][0])
        t += int(1e9 / fps)
    h = round(width * (CROP[3] - CROP[1]) / (CROP[2] - CROP[0]))
    frames = []
    for n in picks:
        im = Image.open(d / f"f{n:05d}.png").convert("RGB").crop(CROP).resize((width, h), Image.LANCZOS)
        canvas = Image.new("RGB", (width, h + 44))
        canvas.paste(im, (0, 44))
        label(canvas, scene)
        frames.append(canvas)
    durations = [round(1000 / fps / 10) * 10] * len(frames)
    durations[-1] = 500
    out.mkdir(parents=True, exist_ok=True)
    frames[0].save(out / f"{scene}.gif", save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    first = {}
    for n, ns, tick, p in rows:
        first.setdefault(tick, n)
    ticks = [k for k in range(hit - 2, last + after + 1) if k in first]
    cols, cw = 8, 320
    ch = round(cw * (CROP[3] - CROP[1]) / (CROP[2] - CROP[0]))
    sheet = Image.new("RGB", (cols * cw, ((len(ticks) + cols - 1) // cols) * ch), (20, 20, 20))
    for j, k in enumerate(ticks):
        im = Image.open(d / f"f{first[k]:05d}.png").convert("RGB").crop(CROP).resize((cw, ch))
        ImageDraw.Draw(im).text((4, 2), f"t{k - hit}", fill=(255, 255, 255))
        sheet.paste(im, ((j % cols) * cw, (j // cols) * ch))
    sheet.save(out / f"{scene}-sheet.png")
    print(f"{scene}: {len(frames)} frames, {(out / f'{scene}.gif').stat().st_size // 1024} KiB")


def reacts(scene_dir: Path) -> list[int]:
    """Frames that first drew a new reaction (the Director logs them), or [] for older captures."""
    head = (scene_dir / "timing.txt").read_text().splitlines()[0].split()
    if "reacts" not in head or head[head.index("reacts") + 1] == "-":
        return []
    return [int(x) for x in head[head.index("reacts") + 1].split(",")]


TICK_NS = 50_000_000


def window(scene_dir: Path, t_from: float, t_to: float, step_ns: int, which: int = 0):
    """Frame numbers sampled every step_ns from t_from to t_to ticks around the hit, and their times in ticks."""
    _, _, rows = read(scene_dir)
    r = reacts(scene_dir)
    if r:
        zero = next(ns for n, ns, tick, p in rows if n == r[min(which, len(r) - 1)])
    else:
        hit = read(scene_dir)[0]
        zero = next(ns for n, ns, tick, p in rows if tick >= hit + 1)
    picks, i, t = [], 0, zero + int(t_from * TICK_NS)
    end = zero + int(t_to * TICK_NS)
    while t <= end:
        while i + 1 < len(rows) and rows[i + 1][1] <= t:
            i += 1
        picks.append((rows[i][0], (rows[i][1] - zero) / TICK_NS))
        t += step_ns
    return picks


def panel(scene_dir: Path, n: int, crop, width: int, tag: str, t: float) -> Image.Image:
    im = Image.open(scene_dir / f"f{n:05d}.png").convert("RGB").crop(crop)
    im = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype(FONT, 15)
    except OSError:
        f = ImageFont.load_default()
    if tag:
        d.rectangle((0, 0, d.textlength(tag, font=f) + 12, 22), fill=(24, 28, 40))
        d.text((6, 2), tag, font=f, fill=(255, 216, 58))
    txt = f"t{t:+.1f}"
    d.text((width - d.textlength(txt, font=f) - 6, im.height - 20), txt, font=f, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    return im


def compare(caps: list[Path], labels: list[str], out: Path, scene: str, slow: bool, crop, width: int, name: str,
            t_from: float, t_to: float, which: int, cols: int = 0) -> None:
    fps = int(os.environ.get("FPS", 50))
    step = 10_000_000 if slow else 1_000_000_000 // fps
    shown = 40 if slow else round(1000 / fps / 10) * 10
    # a capture given as <dir>@x0:y0:x1:y1 gets its own crop (the mob doesn't always walk in on the same line)
    crops = [tuple(int(v) for v in str(c).split("@")[1].split(":")) if "@" in str(c) else crop for c in caps]
    # <dir>%<scene> shows another scene of that capture in the panel (e.g. the light hit next to the full one)
    scenes = [str(c).split("@")[0].split("%")[1] if "%" in str(c).split("@")[0] else scene for c in caps]
    caps = [Path(str(c).split("@")[0].split("%")[0]) for c in caps]
    wins = [window(c / sc, t_from, t_to, step, which) for c, sc in zip(caps, scenes)]
    count = min(len(w) for w in wins)
    frames = []
    for k in range(count):
        tiles = [panel(c / scenes[j], wins[j][k][0], crops[j], width, labels[j], wins[j][k][1]) for j, c in enumerate(caps)]
        n = cols or len(tiles)
        w, h = tiles[0].size
        rows = (len(tiles) + n - 1) // n
        im = Image.new("RGB", (n * w + 4 * (n - 1), rows * h + 4 * (rows - 1)), (10, 10, 14))
        for j, t in enumerate(tiles):
            im.paste(t, ((j % n) * (w + 4), (j // n) * (h + 4)))
        frames.append(im)
    durations = [shown] * len(frames)
    durations[-1] = 700
    out.mkdir(parents=True, exist_ok=True)
    f = out / f"{name}{'-slow' if slow else ''}.gif"
    frames[0].save(f, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    print(f"{f.name}: {len(frames)} frames, {f.stat().st_size // 1024} KiB")


def opts(args: list[str]) -> tuple[list[str], dict]:
    pos, kw, i = [], {}, 0
    while i < len(args):
        if args[i].startswith("--"):
            key = args[i][2:]
            if key == "slow":
                kw[key] = True
                i += 1
                continue
            kw[key] = args[i + 1]
            i += 2
        else:
            pos.append(args[i])
            i += 1
    return pos, kw


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] in ("--slow", "--cmp"):
        mode = sys.argv[1]
        pos, kw = opts(sys.argv[2:])
        crop = tuple(int(v) for v in kw["crop"].split(",")) if "crop" in kw else CROP
        t_from, t_to = float(kw.get("from", -2)), float(kw.get("to", 14 if mode == "--slow" or "slow" in kw else 30))
        which = int(kw.get("hit", 0))
        if mode == "--slow":
            cap, out, scene = Path(pos[0]), Path(pos[1]), pos[2]
            compare([cap], [kw.get("labels", "")], out, scene, True, crop, int(kw.get("width", 480)), kw.get("name", scene), t_from, t_to, which)
        else:
            caps = [Path(c) for c in pos[0].split(",")]
            labels = kw["labels"].split(",") if "labels" in kw else [c.name for c in caps]
            compare(caps, labels, Path(pos[1]), pos[2], "slow" in kw, crop, int(kw.get("width", 360)), kw.get("name", pos[2] + "-cmp"),
                    t_from, t_to, which, int(kw.get("cols", 0)))
        return
    cap, out = Path(sys.argv[1]), Path(sys.argv[2])
    scenes = sys.argv[3:] or sorted(p.name for p in cap.iterdir() if (p / "timing.txt").exists())
    for s in scenes:
        build(cap, out, s)


if __name__ == "__main__":
    main()
