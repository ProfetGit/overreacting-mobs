#!/usr/bin/env bash
# Make the flat demo world for one Minecraft version: dev/demo/.work/world-<ver>. A world saved by a newer version
# doesn't load (26.2 can't read 26.3 chunks and the client stops at the downgrade warning), so every version gets
# its own. Boots that version's dedicated server (the client jar contains it) once, flat and offline, then stops it.
# Usage: make_world.sh <mc-version>
set -euo pipefail
VER=${1:?usage: make_world.sh <mc-version>}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
META=${MODRINTH_META:-$HOME/.local/share/ModrinthApp/meta}
VDIR=$(ls -d "$META"/versions/"$VER"-* | sort -V | tail -1)
case "$VER" in 1.*) JV=21 ;; *) JV=25 ;; esac
JAVA=$(ls -d "$META"/java_versions/zulu${JV}*/bin | head -1)/java
CP="$(python3 "$ROOT/../../tools/ClientCapture/classpath.py" "$VDIR/$(basename "$VDIR").json" "$META/libraries"):$VDIR/$(basename "$VDIR").jar"
SRV="$HERE/.work/server-$VER"
rm -rf "$SRV" && mkdir -p "$SRV"
echo "eula=true" > "$SRV/eula.txt"
cat > "$SRV/server.properties" <<'PROPS'
online-mode=false
server-ip=127.0.0.1
server-port=0
level-name=world
level-type=minecraft\:flat
generate-structures=false
spawn-protection=0
view-distance=4
simulation-distance=4
PROPS
mkfifo "$SRV/stdin"
(cd "$SRV" && tail -f "$SRV/stdin" | "$JAVA" -Xmx2G -cp "$CP" net.minecraft.server.Main --nogui > "$SRV/server.log" 2>&1) &
exec 9> "$SRV/stdin"
for i in $(seq 1 120); do grep -q 'Done (' "$SRV/server.log" 2>/dev/null && break; sleep 1; done
grep -q 'Done (' "$SRV/server.log" || { echo "FAIL server did not start"; tail -5 "$SRV/server.log"; exit 1; }
echo stop >&9
exec 9>&-
for i in $(seq 1 60); do pgrep -f -- "[t]ail -f $SRV/stdin" > /dev/null || break; grep -q 'ThreadedAnvilChunkStorage: All dimensions are saved\|All dimensions are saved' "$SRV/server.log" && break; sleep 1; done
sleep 2
pkill -f -- "[t]ail -f $SRV/stdin" || true
rm -rf "$HERE/.work/world-$VER" && cp -r "$SRV/world" "$HERE/.work/world-$VER"
echo "made $HERE/.work/world-$VER"
