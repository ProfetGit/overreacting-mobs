#!/usr/bin/env bash
# Check runs (no frames) of dev/demo/run.sh in a continuous pool (JOBS at a time, default 4; the machine-wide client
# slots of ModTest/slots.py cap what really runs): each line of the spec is "<ver> <loader> <mob> [fa]"; a mob
# written baby:<mob> runs as a baby (BABY=1).
# fa adds EMF + ETF + Fresh Animations from the ModrinthApp profile of that version ("Fabric 26.3" / "DH 26.2").
# For the standard tiers use `python3 ModTest/mt.py MobReactions quick|full|release` (it also retries flakes).
# Usage: matrix.sh <out-dir> < spec      Prints one summary line per run; exit 1 if any failed.
set -uo pipefail
OUT=${1:?usage: matrix.sh <out-dir> < spec}
HERE=$(cd "$(dirname "$0")" && pwd)
PROFILES=$HOME/.local/share/ModrinthApp/profiles
ALL=front,light,crit,launch,side_r,side_l,back,combo,death_front,death_crit,death_launch,death_side_r,death_side_l,death_back,death_twist,death_heavy,death_fire,death_fall,death_wall
mkdir -p "$OUT"
one() {
    local ver=$1 loader=$2 mob=${3#baby:} fa=${4:-} name="$1-$2-${3/:/_}${4:+-fa}" mods="" packs="" prof="" baby=""
    [ "$mob" != "$3" ] && baby=1
    if [ -n "$fa" ]; then
        [ "$ver" = 26.2 ] && prof="$PROFILES/DH 26.2" || prof="$PROFILES/Fabric 26.3"
        mods="$(ls "$prof"/mods/entity_model_features-*.jar | head -1):$(ls "$prof"/mods/entity_texture_features-*.jar | head -1)"
        packs="$(ls "$prof"/resourcepacks/FreshAnimations_*.zip | head -1)"
    fi
    FRAMES=0 SKIP_BUILD=1 LOADER=$loader MOB=$mob BABY=$baby MODS="$mods" PACKS="$packs" WORK_TAG="${3/:/_}${fa:+-fa}" \
        bash "$HERE/run.sh" "$ver" "$OUT/$name" "$ALL" < /dev/null > "$OUT/$name.txt" 2>&1
    echo "$name: $(grep -E ' passed, ' "$OUT/$name.txt" | sed 's/^ *//')"
}
while read -r ver loader mob fa; do
    [ -z "${ver:-}" ] && continue
    while [ "$(jobs -rp | wc -l)" -ge "${JOBS:-4}" ]; do wait -n; done
    one "$ver" "$loader" "$mob" "${fa:-}" &
done
wait
FAIL=0
grep -l FAIL "$OUT"/*.txt 2>/dev/null && FAIL=1
exit $FAIL
