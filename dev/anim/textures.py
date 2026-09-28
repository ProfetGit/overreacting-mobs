#!/usr/bin/env python3
"""Extract the vanilla mob textures the Blockbench previews need from the local 26.3 client jar into
dev/anim/textures/ (not committed: they are Mojang's). Then run faces.py for the expression previews."""
import zipfile
from pathlib import Path

JAR = Path.home() / ".local/share/ModrinthApp/meta/versions/26.3-0.19.5/26.3-0.19.5.jar"
OUT = Path(__file__).resolve().parent / "textures"
MOBS = {"zombie": "zombie/zombie", "husk": "zombie/husk", "drowned": "zombie/drowned",
        "vindicator": "illager/vindicator", "villager": "villager/villager", "cow": "cow/cow_temperate",
        "spider": "spider/spider", "cave_spider": "spider/cave_spider", "spider_eyes": "spider/spider_eyes",
        "creeper": "creeper/creeper",
        "enderman": "enderman/enderman", "enderman_eyes": "enderman/enderman_eyes",
        "wolf": "wolf/wolf", "fox": "fox/fox", "cat": "cat/cat_tabby", "ocelot": "cat/ocelot",
        "iron_golem": "iron_golem/iron_golem"}

OUT.mkdir(exist_ok=True)
with zipfile.ZipFile(JAR) as z:
    for mob, path in MOBS.items():
        (OUT / f"{mob}.png").write_bytes(z.read(f"assets/minecraft/textures/entity/{path}.png"))
        print(f"{mob}.png")
