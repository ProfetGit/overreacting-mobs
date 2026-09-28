#!/usr/bin/env bash
# Dev-only: film the hit_front review scenes in the real client for each review setup, one run at a time (parallel
# clients drop frames). Setups: side / face camera, -fa adds EMF + ETF + Fresh Animations from the "Fabric 26.3" profile.
# -> .work/polish/<tag>/<setup>/<scene>/ (frames + timing.txt), then gif.py --slow / --cmp.
# Usage: polish.sh <tag> [setups, default side,face,side-fa,face-fa] [scenes, default front,combo,death_front]
set -uo pipefail
TAG=${1:?usage: polish.sh <tag> [setups] [scenes]}
SETUPS=${2:-side,face,side-fa,face-fa}
SCENES=${3:-front,combo,death_front}
HERE=$(cd "$(dirname "$0")" && pwd)
PROF="$HOME/.local/share/ModrinthApp/profiles/Fabric 26.3"
FA_MODS="$(ls "$PROF"/mods/entity_model_features-*.jar | head -1):$(ls "$PROF"/mods/entity_texture_features-*.jar | head -1)"
FA_PACKS="$(ls "$PROF"/resourcepacks/FreshAnimations_*.zip | head -1)"
(cd "$HERE/../.." && ./gradlew --console=plain -q :26.3-fabric:build -x test) || exit 1
FAIL=0
for s in ${SETUPS//,/ }; do
    cam=${s%-fa}
    mods="" packs=""
    [ "$s" != "$cam" ] && mods=$FA_MODS && packs=$FA_PACKS
    SKIP_BUILD=1 CAM=$cam MODS="$mods" PACKS="$packs" WORK_TAG=polish bash "$HERE/run.sh" 26.3 "$HERE/.work/polish/$TAG/$s" "$SCENES" \
        < /dev/null > "$HERE/.work/polish/$TAG-$s.txt" 2>&1 || FAIL=1
    echo "$TAG/$s: $(grep -E 'checks passed' "$HERE/.work/polish/$TAG-$s.txt" | sed 's/^ *//')"
done
exit $FAIL
