#!/usr/bin/env bash
# Dev-only: film and check Mob Reactions in the real client, off-screen. A thin wrapper over the shared launcher
# ModTest/client.py (headless KWin, every loader, machine-wide client slots, mixin audit); for test tiers use
# `python3 ModTest/mt.py MobReactions quick|full|release` instead. The mod's demo director (demo/Director, active with
# -Dmobreactions.demo) plays every scene in the flat world .work/world-<ver>, saves each scene's frames to <out>/<scene>/
# and the checks to <out>/results.json.
# Usage: run.sh <mc-version> <out-dir> [scenes, comma separated]
# Env: LOADER=fabric|neoforge|forge (default fabric; Forge and NeoForge come from the installs Tidy Pockets' self-test
#      made, TidyPockets/dev/selftest/install_loaders.sh), MOB=<any supported mob, e.g. skeleton, piglin_brute, cow>, MODS="a.jar:b.jar" adds mods
#      (e.g. EMF + ETF), PACKS="x.zip:y.zip" adds resource packs and enables them, FRAMES=0 (checks only, no
#      screenshots; a full run with frames is about 5 GB), CAM=face (look the mob in the face), WORK_TAG=x (own game dir, so runs of one loader can go in
#      parallel), SKIP_BUILD=1, CLIPS=<dir> (clip JSONs there replace the bundled ones; <dir>/villager/ for the villager rig),
#      FX=<name> (-Dmobreactions.fx, runtime effect variant under review), CALM=1 (the player stays in creative, so
#      illagers aren't aggressive and keep their arms crossed), POWERED=1 (creepers are charged), CAMPOS=x,z (the side camera's position), BABY=1 (the mob is a baby).
set -euo pipefail
VER=${1:?usage: run.sh <mc-version> <out-dir> [scenes]}
OUT=${2:?out dir}
SCENES=${3:-front,crit,launch,side_r,side_l,back}
LOADER=${LOADER:-fabric}
MOB=${MOB:-zombie}
SHOTS=true
[ "${FRAMES:-1}" = 0 ] && SHOTS=false
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
TARGET="$VER-$LOADER"
GAME="$HERE/.work/game-$TARGET${WORK_TAG:+-$WORK_TAG}"

[ -n "${SKIP_BUILD:-}" ] || (cd "$ROOT" && ./gradlew --console=plain -q ":$TARGET:build" -x test)
JAR=$(ls "$ROOT"/versions/"$TARGET"/build/libs/mobreactions-*+"$TARGET".jar | head -1)
WORLD="$HERE/.work/world-$VER"
[ -d "$WORLD" ] || WORLD="$HERE/.work/world"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
EXTRA=()
IFS=: read -r -a M <<< "${MODS:-}"
for m in "${M[@]}"; do [ -n "$m" ] && EXTRA+=(--mod "$m"); done
IFS=: read -r -a P <<< "${PACKS:-}"
for p in "${P[@]}"; do [ -n "$p" ] && EXTRA+=(--pack "$p"); done
set +e
python3 "$ROOT/../ModTest/client.py" "$VER" "$LOADER" "$OUT" --game "$GAME" --jar "$JAR" --world "$WORLD" "${EXTRA[@]}" \
    --user ReactCam --opt fps=120 --opt volume=0.0 --opt render_distance=6 \
    --log-errors 'ERROR\]: mobreactions\.mixins\.json|Mob Reactions: .*(failed|cannot)' \
    -D "mobreactions.demo=$OUT" -D "mobreactions.demo.scenes=$SCENES" -D "mobreactions.demo.mob=$MOB" \
    -D "mobreactions.demo.frames=$SHOTS" -D "mobreactions.demo.cam=${CAM:-side}" -D "mobreactions.demo.calm=${CALM:-}" \
    -D "mobreactions.demo.powered=${POWERED:-}" -D "mobreactions.demo.carry=${CARRY:-}" -D "mobreactions.demo.campos=${CAMPOS:-}" -D "mobreactions.demo.baby=${BABY:-}" \
    -D "mobreactions.joints=${JOINTS:-false}" -D "mobreactions.clips=${CLIPS:-}" -D "mobreactions.fx=${FX:-}" -D modtest.audit=1 -D "modtest.tickrate=${TICKRATE:-}" \
    --label "MobReactions $TARGET $MOB"
STATUS=$?
set -e
if [ "$SHOTS" = true ]; then
    for d in "$OUT"/*/; do [ -d "$d" ] && echo "  $(basename "$d"): $(ls "$d" | grep -c png) frames"; done
fi
exit $STATUS
