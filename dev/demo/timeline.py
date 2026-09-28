#!/usr/bin/env python3
"""What the real client drew around the hit, from a capture's timing.txt (the Director logs each frame's clip, clip
time and the victim's drawn y/z): one row per rendered frame sample every `step` ticks from the first frame that drew
the hit. Shows the hit-stop length, the drawn hop (lagging the server) and how the clip clock follows it.
Usage: timeline.py <capture>/<scene> [--step 0.5] [--to 24] [--hit N]"""
import sys
from pathlib import Path

TICK = 50_000_000


def main() -> None:
    d = Path(sys.argv[1])
    arg = lambda k, v: type(v)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else v
    step, to, which = arg("--step", 0.5), arg("--to", 24.0), arg("--hit", 0)
    lines = (d / "timing.txt").read_text().splitlines()
    head = lines[0].split()
    reacts = [int(x) for x in head[head.index("reacts") + 1].split(",")]
    rows = [l.split() for l in lines[1:]]
    zero_row = next(r for r in rows if int(r[0]) == reacts[which])
    zero, y0, z0 = int(zero_row[1]), float(zero_row[6]), float(zero_row[7])
    print(f"{'t':>6} {'frame':>6} {'clip':>12} {'clip_t':>7} {'dy':>7} {'dz':>7}")
    want, i = -2.0, 0
    while want <= to:
        target = zero + int(want * TICK)
        while i + 1 < len(rows) and int(rows[i + 1][1]) <= target:
            i += 1
        r = rows[i]
        t = (int(r[1]) - zero) / TICK
        print(f"{t:6.2f} {r[0]:>6} {r[4]:>12} {float(r[5]):7.2f} {float(r[6]) - y0:7.3f} {float(r[7]) - z0:7.3f}")
        want += step


if __name__ == "__main__":
    main()
