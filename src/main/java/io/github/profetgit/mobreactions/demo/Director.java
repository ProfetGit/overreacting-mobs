package io.github.profetgit.mobreactions.demo;

import com.mojang.blaze3d.platform.NativeImage;
import io.github.profetgit.mobreactions.MobReactions;
import io.github.profetgit.mobreactions.face.Faces;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.Reaction;
import io.github.profetgit.mobreactions.react.ReactionHolder;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only showcase director and check runner; does nothing unless the JVM is started with -Dmobreactions.demo=<dir>
 * (dev/demo/run.sh). In a flat singleplayer world it stages a zombie walking down a lane toward a villager (or any
 * other supported humanoid, -Dmobreactions.demo.mob=<entity id path>; see WALKER), makes the real player attack it (normal, jump crit, sprint, from its sides and back,
 * combos, killing blows and deaths without a hit), films it from a fixed armor-stand camera, saves every rendered frame
 * of each scene to <dir>/<scene>/, checks that the reaction really ran, writes <dir>/results.json and quits.
 */
public final class Director {
    private static final String DIR = System.getProperty("mobreactions.demo");
    public static final boolean ACTIVE = DIR != null;
    static final Path OUT = Path.of(ACTIVE ? DIR : ".");
    static final String[] SCENES = System.getProperty("mobreactions.demo.scenes", "front,crit,launch,side_r,side_l,back").split(",");
    static final String MOB = System.getProperty("mobreactions.demo.mob", "zombie");
    /** -Dmobreactions.demo.frames=false: checks only, no screenshots. */
    static final boolean FRAMES = !"false".equals(System.getProperty("mobreactions.demo.frames"));
    /** -Dmobreactions.demo.cam=face: film from beside the attacker, looking the mob in the face (for expressions). */
    static final boolean FACE_CAM = "face".equals(System.getProperty("mobreactions.demo.cam"));
    /** -Dmobreactions.demo.calm=1: the player stays in creative, so illagers never turn aggressive and keep their arms crossed. */
    static final boolean CALM = !System.getProperty("mobreactions.demo.calm", "").isEmpty();
    /** -Dmobreactions.demo.powered=1: creepers are charged (the glow layer is a second model that must follow the pose). */
    static final boolean POWERED = !System.getProperty("mobreactions.demo.powered", "").isEmpty();
    /** -Dmobreactions.demo.carry=1: endermen carry a grass block (it must follow the arms, and vanish on a death). */
    static final boolean CARRY = !System.getProperty("mobreactions.demo.carry", "").isEmpty();
    static final String CAMPOS = System.getProperty("mobreactions.demo.campos", "");
    /** -Dmobreactions.demo.baby=1: the mob is a baby (IsBaby for zombies and piglins, Age for animals and villagers). */
    static final boolean BABY = !System.getProperty("mobreactions.demo.baby", "").isEmpty();
    static final ExecutorService WRITER = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "mobreactions-demo-writer");
        t.setDaemon(true);
        return t;
    });
    static final double LANE_X = 0.5, START_Z = 9.5, PLAYER_Z = 0.5, Y = -60;

    static final int COMBO_HITS = 5;
    static int tick = -1, scene = -1, sceneTick, hitTick = -1, jumpTick = -1, tpTick = -1, recordFrom = -1, frame;
    static int hits, firstHit = -1, lastAttack = -100, appliedAtHit, rootedAtHit, facesAtHit;
    static Mob victim;
    /** The attacker's direction from the mob's body at the last swing (degrees, 0 = in front, + = its right), as Hits.pick sees it. */
    static double swingAngle;
    static String swingYaws = "";
    /**
     * The zombie family walks down the lane toward the villager at its end. Skeletons and piglins don't go for
     * villagers, so they stand on the lane where a walker would get hit (no speed until the first blow), aggressive
     * toward the player, who is in survival for them, and carry their usual weapon.
     */
    /** Mobs of the scene's type that existed when it started: the last scene's mob (killed by this scene's setup) is
     * still on the client for a tick or two and must not become the victim. */
    static final java.util.Set<Integer> stale = new java.util.HashSet<>();
    static final boolean WALKER = java.util.Set.of("zombie", "husk", "drowned", "zombie_villager").contains(MOB);
    /** The villager-like rig (illagers, the witch, villagers and wandering traders) plays its own clip set. */
    static final boolean VILLAGER_RIG = java.util.Set.of("vindicator", "pillager", "evoker", "illusioner", "witch", "villager", "wandering_trader").contains(MOB);
    /** The quadruped rig (cow, mooshroom, pig, sheep, goat, panda, polar bear) has the villager rig's clip names. */
    static final boolean QUADRUPED_RIG = java.util.Set.of("cow", "mooshroom", "pig", "sheep", "goat", "panda", "polar_bear").contains(MOB);
    /** The spider rig (spider, cave spider) has the villager rig's clip names too; its deaths never need room (it flips over in place). */
    static final boolean SPIDER_RIG = java.util.Set.of("spider", "cave_spider").contains(MOB);
    /** The creeper rig: same clip names. It must never explode in a scene (a fuse it never reaches, and no blast). */
    static final boolean CREEPER_RIG = MOB.equals("creeper");
    /**
     * The enderman rig: same clip names. It must never teleport away mid-scene: the player wears a carved pumpkin (without
     * its screen overlay), so looking at it never angers it, mob griefing is off (it would pick up the floor), and a fire
     * death burns it only after the killing damage (every burn tick without an attacker teleports it).
     */
    static final boolean ENDERMAN_RIG = MOB.equals("enderman");
    /**
     * The pet rig (wolf, fox, cat, ocelot): same clip names; its front death curls up in its own footprint, so death_wall
     * expects it. Cats and ocelots take no fall damage: death_fall kills them once they land.
     */
    static final boolean PET_RIG = java.util.Set.of("wolf", "fox", "cat", "ocelot").contains(MOB);
    static final boolean FALL_IMMUNE = java.util.Set.of("cat", "ocelot", "iron_golem").contains(MOB);
    /**
     * The iron golem: same clip names, never knocked back. Summoned as player-made, so it never attacks the player (its
     * swing throws the player into the air). Fall-immune like the cats.
     */
    static final boolean GOLEM_RIG = MOB.equals("iron_golem");
    static boolean fallKilled;
    static final double STAND_Z = 2.75;
    static boolean recording, done, stopped, hudHidden;
    /** Screenshots taken but not written yet; the client quits only once they are all on disk. */
    static final java.util.concurrent.atomic.AtomicInteger pending = new java.util.concurrent.atomic.AtomicInteger();
    static long drainUntil;
    static final List<String> timing = new ArrayList<>();
    /** Frames that first drew a new reaction on the victim (the hit arriving), for aligning captures in gif.py. */
    static final List<Integer> reacts = new ArrayList<>();
    static Reaction seen;
    static final List<String> results = new ArrayList<>();

    private Director() {
    }

    public static void onTick(Minecraft mc) {
        if (done) {
            if (!stopped && (pending.get() == 0 || System.currentTimeMillis() > drainUntil)) {
                stopped = true;
                System.out.println("[mrdemo] done" + (pending.get() > 0 ? ", " + pending.get() + " frames not written" : ""));
                mc.stop();
            }
            return;
        }
        if (mc.level == null || mc.player == null || mc.getSingleplayerServer() == null) return;
        tick++;
        if (!hudHidden) hideHud(mc);
        if (tick == 10) setup(mc);
        if (tick < 60) return;
        if (scene < 0 || sceneTick > (hitTick >= 0 ? hitTick + after() + 8 : 400)) {
            if (recording) stopRecording();
            if (scene >= 0 && hitTick < 0) check("hit", false, "the scene never reached its hit");
            if (++scene >= SCENES.length) {
                finish(mc);
                return;
            }
            startScene(mc);
        }
        sceneTick++;
        direct(mc);
    }

    static int after() {
        if (SCENES[scene].startsWith("death_")) return 60;
        return SCENES[scene].equals("crit") ? 44 : SCENES[scene].equals("launch") ? 40 : SCENES[scene].equals("combo") ? 40 : 34;
    }

    /**
     * Death scenes play the hit scene they grow out of with a zombie that has just enough health for the blow that
     * should kill it (an iron sword does 5.9 through a zombie's armour): the slash is combo hit 2, the finisher hit 4.
     * death_fire (burning, then /damage by fire), death_fall (dropped from 12 blocks through a hole in the barrier
     * roof) and death_wall (a wall behind it leaves no room to fall back) are the no-hit and no-room cases.
     */
    static String base(String s) {
        return switch (s) {
            case "death_twist", "death_heavy" -> "combo";
            case "death_fire", "death_fall", "death_wall", "light" -> "front";
            default -> s.startsWith("death_") ? s.substring(6) : s;
        };
    }

    static int hitsFor(String s) {
        return switch (s) {
            case "combo" -> COMBO_HITS;
            case "death_twist" -> 2;
            case "death_heavy" -> 4;
            default -> 1;
        };
    }

    static float health(String s) {
        return switch (s) {
            case "death_twist" -> 11;
            case "death_heavy" -> 23;
            default -> s.startsWith("death_") ? 5 : 100;
        };
    }

    /** The clip the scene's last blow (or death) must be playing. Combo hit 5 is the first slash again (the villager rig:
     * the front hit again); the villager rig's crits and sprint hits share the big hit, and every kill but a front one
     * grows into the big hit's heap. */
    static String expected(String s) {
        // the spider flips over in place and a pet curls up in its own footprint: no room needed
        if ((SPIDER_RIG || PET_RIG) && s.equals("death_wall")) return "death_front";
        // every golem death topples back; with the wall behind it, it slumps in place
        if (GOLEM_RIG && s.equals("death_wall")) return "death_slump";
        if (VILLAGER_RIG || QUADRUPED_RIG || SPIDER_RIG || CREEPER_RIG || ENDERMAN_RIG || PET_RIG || GOLEM_RIG) {
            return switch (s) {
                case "combo", "front" -> "hit_front";
                case "light" -> "hit_light";
                case "crit", "launch" -> "hit_big";
                case "side_r", "side_l" -> "hit_side";
                case "back" -> "hit_back";
                case "death_front", "death_twist" -> "death_front";
                case "death_fire", "death_fall" -> "death_collapse";
                default -> "death_big";
            };
        }
        return switch (s) {
            case "combo" -> "hit_twist";
            case "light" -> "hit_light";
            case "death_fire", "death_fall" -> "death_collapse";
            case "death_wall" -> "death_crit";
            default -> s.startsWith("death_") ? s : "hit_" + s;
        };
    }

    static void setup(Minecraft mc) {
        ModTestHook.audit();
        cmd(mc, ModTestHook.commands().toArray(String[]::new));
        String p = mc.player.getGameProfile().name();
        // drowned only go after targets on land at night; night vision on the player lights the camera's view too
        boolean night = MOB.equals("drowned");
        cmd(mc, "gamerule advance_time false", "gamerule advance_weather false", "gamerule spawn_mobs false", "gamerule spawn_monsters false",
            "time set " + (night ? 18000 : 6000), "weather clear", "difficulty easy", "gamemode creative " + p,
            night ? "effect give " + p + " minecraft:night_vision infinite 0 true" : "effect clear " + p + " minecraft:night_vision",
            "fill -14 -55 -14 14 -55 18 minecraft:barrier", "kill @e[type=!player]", "clear " + p, "give " + p + " minecraft:iron_sword",
            // a killed illager captain would give Bad Omen and start a raid
            "gamerule disable_raids true", "gamerule mob_griefing " + !ENDERMAN_RIG,
            WALKER ? "summon villager 0.5 -60 -9.5 {NoAI:1b,PersistenceRequired:1b,Silent:1b,active_effects:[{id:\"minecraft:resistance\",amplifier:4,duration:-1,show_particles:0b}]}" : "gamerule advance_weather false",
            "summon armor_stand -5.5 -58.4 2.5 {Invisible:1b,Marker:1b,NoGravity:1b,CustomName:\"cam\",Rotation:[-90f,14f]}");
    }

    static void startScene(Minecraft mc) {
        String full = SCENES[scene], s = base(full);
        sceneTick = 0;
        hitTick = jumpTick = tpTick = recordFrom = firstHit = -1;
        hits = 0;
        fallKilled = false;
        lastAttack = -100;
        victim = null;
        stale.clear();
        for (Entity e : mc.level.entitiesForRendering()) if (BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath().equals(MOB)) stale.add(e.getId());
        float hp = health(full);
        // goats take 10 less fall damage: 12 blocks don't hurt them
        double zombieY = full.equals("death_fall") ? Y + (MOB.equals("goat") ? 24 : 12) : Y;
        double zombieZ = full.equals("death_fall") ? 3.5 : !WALKER ? STAND_Z : full.equals("death_wall") ? 4.5 : START_Z;
        String p = mc.player.getGameProfile().name();
        boolean fromSide = s.startsWith("side") || s.equals("back");
        // Side hits knock the zombie across the lane, so the camera sits on the attacker's side and watches it fly
        // away (a detached camera doesn't draw the local player anyway). Launch flies furthest: step back, aim down the lane.
        double camX = full.equals("death_fall") ? -4.2 : s.equals("side_r") ? 5.6 : s.equals("side_l") ? -4.6 : s.equals("launch") ? -4.8 : s.equals("combo") ? -4.8 : -3.6;
        double camZ = s.equals("launch") ? 4.0 : s.startsWith("side") ? 4.0 : s.equals("combo") ? 4.4 : 2.8;
        float camYaw = s.equals("side_r") ? 90f : -90f;
        // -Dmobreactions.demo.campos=x,z[,y]: the side camera somewhere else (a tall mob that falls far needs a wider view)
        double camY = -58.5;
        if (!CAMPOS.isEmpty()) {
            String[] c = CAMPOS.split(",");
            camX = Double.parseDouble(c[0]);
            camZ = Double.parseDouble(c[1]);
            if (c.length > 2) camY = Double.parseDouble(c[2]);
        }
        cmd(mc, "gamemode " + ((s.equals("crit") || !WALKER) && !CALM ? "survival " : "creative ") + p, "effect give " + p + " minecraft:resistance infinite 4 true",
            "effect give " + p + " minecraft:fire_resistance infinite 0 true", "attribute " + p + " minecraft:knockback_resistance base set 1",
            "effect clear " + p + " minecraft:slowness", "effect clear " + p + " minecraft:poison",
            // the last scene's mob plays its own death (and then its poof) where it is killed: below the floor, out of the shot
            "effect give " + p + " minecraft:saturation infinite 0 true",
            ENDERMAN_RIG ? "item replace entity " + p + " armor.head with minecraft:carved_pumpkin[minecraft:equippable={slot:\"head\"}]" : "effect clear " + p + " minecraft:nausea", "execute as @e[type=" + MOB + "] at @s run tp @s ~ -120 ~", "kill @e[type=" + MOB + "]",
            "kill @e[type=item]", "kill @e[type=experience_orb]",
            // a stray arrow from the last skeleton would hit the new mob and count as a combo hit
            "kill @e[type=arrow]", "kill @e[type=spectral_arrow]",
            full.equals("death_wall") ? "fill -5 -60 5 6 -58 5 minecraft:stone" : "fill -5 -60 5 6 -58 5 minecraft:air",
            // a quadruped's front death rolls it onto a flank: low walls on both sides of the lane leave it no room
            full.equals("death_wall") && QUADRUPED_RIG ? "fill -1 -60 1 -1 -60 7 minecraft:stone" : "fill -1 -60 1 -1 -60 7 minecraft:air",
            full.equals("death_wall") && QUADRUPED_RIG ? "fill 2 -60 1 2 -60 7 minecraft:stone" : "fill 2 -60 1 2 -60 7 minecraft:air",
            // the hole in the barrier roof: 3x3, so a panda or a polar bear fits through it too
            "fill -1 -55 2 1 -55 4 minecraft:" + (full.equals("death_fall") ? "air" : "barrier"),
            "summon " + MOB + " " + LANE_X + " " + zombieY + " " + zombieZ + " {Rotation:[180f,0f],PersistenceRequired:1b,CanPickUpLoot:0b,IsBaby:" + (BABY ? "1b,Age:-24000" : "0b") + ",IsImmuneToZombification:1b" + extraData(full) + ",attributes:[{id:\"minecraft:max_health\",base:" + Math.max(20, hp) + "d}" + (WALKER ? "" : ",{id:\"minecraft:movement_speed\",base:0d}") + "],Health:" + hp + "f,equipment:{head:{id:\"minecraft:stick\",count:1,components:{\"minecraft:item_model\":\"minecraft:air\"}}" + weapon() + "},drop_chances:{head:0f,mainhand:0f}}",
            // a wolf's max health is reset to 8 when its tame state loads (Wolf.applyTamingSideEffects): set it again
            MOB.equals("wolf") ? "attribute @e[type=wolf,limit=1] minecraft:max_health base set " + Math.max(20, hp) : "gamerule advance_weather false",
            MOB.equals("wolf") ? "data merge entity @e[type=wolf,limit=1] {Health:" + hp + "f}" : "gamerule advance_weather false",
            fromSide ? "tp " + p + " " + (s.equals("side_l") ? -3.5 : 4.5) + " " + Y + " 4.5 0 0" : "tp " + p + " " + LANE_X + " " + Y + " " + PLAYER_Z + " 0 0",
            // pets are small: the face camera sits closer, low and to the side
            FACE_CAM && PET_RIG ? "tp @e[type=armor_stand,limit=1] 1.3 -59.5 1.1 24 6"
            : FACE_CAM ? "tp @e[type=armor_stand,limit=1] 1.6 " + (SPIDER_RIG || PET_RIG ? -59.1 : ENDERMAN_RIG || GOLEM_RIG ? -57.5 : -58.3) + " -0.4 12 " + (SPIDER_RIG || PET_RIG ? 10 : 6)
                : "tp @e[type=armor_stand,limit=1] " + camX + " " + camY + " " + camZ + " " + camYaw + " 1");
        System.out.println("[mrdemo] scene " + full + " (" + MOB + ")");
    }

    static void direct(Minecraft mc) {
        Entity cam = find(mc, ArmorStand.class);
        if (cam != null && mc.getCameraEntity() != cam) mc.setCameraEntity(cam);
        Mob z = findMob(mc);
        if (z != null) victim = z;
        String full = SCENES[scene], s = base(full);
        if (hitTick < 0 && victim != null && victim.isDeadOrDying()) {
            // no-hit deaths: the death is the event the clip is timed from
            markHit();
            System.out.println("[mrdemo] " + full + " died at scene tick " + sceneTick);
        }
        if (hitTick >= 0) checks(mc, full);
        if (sceneTick % 20 == 1) {
            Entity c = mc.getCameraEntity();
            System.out.println("[mrdemo] t" + sceneTick + " cam " + (c == null ? "-" : c.getClass().getSimpleName() + " " + fmt(c.position()))
                + " player " + fmt(mc.player.position()) + " mob " + (z == null ? "-" : fmt(z.position())));
        }
        if (full.equals("death_fall") && sceneTick >= 4) record();
        if (full.equals("death_fall") && FALL_IMMUNE && !fallKilled && z != null && sceneTick > 20 && z.onGround()) {
            fallKilled = true;
            cmd(mc, "damage @e[type=" + MOB + ",limit=1] 100 minecraft:generic");
        }
        cleanup(mc);
        if (z == null || hitTick >= 0 || sceneTick < 20 || full.equals("death_fall")) return;
        // keep it walking down its lane until the first blow, so every capture frames the scene the same way
        if (hits == 0 && WALKER && Math.abs(z.getX() - LANE_X) > 0.05) cmd(mc, "execute as @e[type=" + MOB + ",limit=1] at @s run tp @s " + LANE_X + " ~ ~");
        // a small, fast walker (a baby zombie) can slip round the end of death_wall's wall and get stuck behind it
        if (hits == 0 && WALKER && full.equals("death_wall") && z.getZ() > 4.8) cmd(mc, "execute as @e[type=" + MOB + ",limit=1] run tp @s " + LANE_X + " " + Y + " 4.5 180 0");
        // a standing mob keeps facing down the lane until the first blow: an aggressive one would turn to the player
        // stepping in at its side, and the side and back scenes would film front hits
        if (hits == 0 && !WALKER) {
            cmd(mc, "execute as @e[type=" + MOB + ",limit=1] run tp @s " + LANE_X + " " + Y + " " + STAND_Z + " 180 0");
            // /tp sets the yaw only; a mob without AI (the goat) keeps the head and body yaw it spawned with
            MinecraftServer server = mc.getSingleplayerServer();
            java.util.UUID id = z.getUUID();
            server.execute(() -> {
                if (server.overworld().getEntity(id) instanceof Mob m && m.isNoAi()) {
                    m.setYHeadRot(180);
                    m.setYBodyRot(180);
                }
            });
        }
        var pl = mc.player;
        // the player stays on its spot until it swings: a released mob from the scene before walks up and shoves the
        // survival player, and the client keeps it drifting (the detached camera sends no movement to correct it)
        if (!WALKER && hits == 0 && tpTick < 0 && Math.hypot(pl.getX() - LANE_X, pl.getZ() - PLAYER_Z) > 0.02) {
            pl.setPos(LANE_X, pl.getY(), PLAYER_Z);
            pl.setDeltaMovement(0, pl.getDeltaMovement().y, 0);
        }
        // a standing mob gets a moment to notice the player and draw its weapon; filming starts half a second before
        // the earliest blow, so every capture has a lead-in
        if (!WALKER && sceneTick >= 35) record();
        if (!WALKER && sceneTick < 45) return;
        double dz = z.getZ() - pl.getZ();
        if (full.equals("death_fire")) {
            if (dz < 3.6) record();
            if (tpTick < 0 && dz <= 4.2) {
                if (!ENDERMAN_RIG) cmd(mc, "data merge entity @e[type=" + MOB + ",limit=1] {Fire:100s}");
                tpTick = sceneTick;
            }
            // the wither skeleton and the zombified piglin can't burn: a plain no-hit death instead
            String cause = z.fireImmune() ? "minecraft:generic" : "minecraft:on_fire";
            if (tpTick >= 0 && sceneTick == tpTick + 8) cmd(mc, "damage @e[type=" + MOB + ",limit=1] 100 " + cause);
            if (ENDERMAN_RIG && tpTick >= 0 && sceneTick == tpTick + 8) cmd(mc, "data merge entity @e[type=" + MOB + ",limit=1] {Fire:100s}");
            return;
        }
        switch (s) {
            case "front", "launch" -> {
                if (dz < 3.6) record();
                if (dz <= 2.3) attack(mc, z, s.equals("launch"));
            }
            case "combo" -> {
                // hit, and after each knockback step in in front of it (a standing mob turns toward the player between
                // blows) and hit again as soon as the sword is charged and the player stands on the ground (a swing
                // while it still falls from the teleport would be a crit)
                if (dz < 3.6) record();
                if (hits == 0) {
                    if (dz <= 2.3) attack(mc, z, false);
                } else if (!WALKER) {
                    // a standing mob doesn't walk back in, so after each reaction it is put back on its spot and hit
                    // from the start again (29 ticks apart, still inside the 40-tick combo window)
                    if (hits < hitsFor(full) && sceneTick - lastAttack == 28) {
                        cmd(mc, "execute as @e[type=" + MOB + ",limit=1] run tp @s " + LANE_X + " " + Y + " " + STAND_Z + " 180 0",
                            "tp " + pl.getGameProfile().name() + " " + LANE_X + " " + Y + " " + PLAYER_Z + " 0 0");
                        // /tp sets the yaw only: a golem's body stayed turned from the last blow
                        MinecraftServer srv = mc.getSingleplayerServer();
                        java.util.UUID mid = z.getUUID();
                        srv.execute(() -> {
                            if (srv.overworld().getEntity(mid) instanceof Mob m) {
                                m.setYHeadRot(180);
                                m.setYBodyRot(180);
                            }
                        });
                        pl.setPos(LANE_X, Y, PLAYER_Z);
                    } else if (hits < hitsFor(full) && sceneTick - lastAttack >= 31 && pl.onGround()) {
                        attack(mc, z, false);
                    }
                } else if (hits < hitsFor(full) && sceneTick - lastAttack >= 14 && z.onGround()) {
                    if (tpTick < 0) {
                        double yaw = Math.toRadians(z.yBodyRot), fx = -Math.sin(yaw), fz = Math.cos(yaw);
                        cmd(mc, String.format(java.util.Locale.ROOT, "tp %s %.3f %s %.3f %.1f 0", pl.getGameProfile().name(), z.getX() + fx * 2.2, Y,
                            z.getZ() + fz * 2.2, z.yBodyRot + 180));
                        tpTick = sceneTick;
                    } else if (sceneTick >= tpTick + 3 && pl.onGround()) {
                        attack(mc, z, false);
                        tpTick = -1;
                    }
                }
            }
            case "crit" -> {
                if (dz < 3.9) record();
                if (jumpTick < 0 && dz <= 3.1 && pl.onGround()) {
                    pl.jumpFromGround();
                    jumpTick = sceneTick;
                }
                if (jumpTick >= 0 && !pl.onGround() && pl.fallDistance > 0.1) attack(mc, z, false);
            }
            default -> {
                if (z.getZ() < 6.2) record();
                if (tpTick < 0 && z.getZ() < 4.6) {
                    double x = z.getX(), zz = z.getZ();
                    String where = switch (s) {
                        case "side_r" -> (x + 1.7) + " " + Y + " " + zz + " 90 0";
                        case "side_l" -> (x - 1.7) + " " + Y + " " + zz + " -90 0";
                        default -> x + " " + Y + " " + (zz + 1.7) + " 180 0";
                    };
                    cmd(mc, "tp " + mc.player.getGameProfile().name() + " " + where);
                    tpTick = sceneTick;
                }
                if (tpTick >= 0 && sceneTick >= tpTick + 3) attack(mc, z, false);
            }
        }
    }

    /**
     * What the villager-like mobs throw around: evokers' vexes (sent into the void, out of the shot, so no death puff)
     * and fangs, pillagers' and illusioners' arrows, the illusioner's mirror images (its invisibility would draw four
     * copies) and blindness on the player, witches' splash potions.
     */
    static void cleanup(Minecraft mc) {
        String p = mc.player.getGameProfile().name();
        switch (MOB) {
            case "evoker" -> cmd(mc, "execute as @e[type=vex] run tp @s 0.5 -130 0.5", "kill @e[type=evoker_fangs]");
            case "pillager" -> cmd(mc, "kill @e[type=arrow]");
            case "illusioner" -> cmd(mc, "kill @e[type=arrow]", "effect clear @e[type=illusioner] minecraft:invisibility", "effect clear " + p + " minecraft:blindness");
            case "witch" -> cmd(mc, "kill @e[type=splash_potion]", "kill @e[type=lingering_potion]", "effect clear " + p + " minecraft:slowness");
            default -> {
            }
        }
    }

    static void markHit() {
        hitTick = sceneTick;
        if (firstHit < 0) firstHit = sceneTick;
        appliedAtHit = Pose.applied;
        rootedAtHit = Pose.rooted;
        facesAtHit = Faces.swapped;
    }

    /**
     * The reaction (or death) must be the expected clip a few ticks after the blow, its pose must have reached the
     * model parts, the root and the face, and a death must keep the body past the server's removal and then poof.
     */
    static void checks(Minecraft mc, String full) {
        int since = sceneTick - hitTick;
        if (since == 3) {
            Reaction r = victim == null ? null : ((ReactionHolder) victim).mobreactions$reaction();
            String want = expected(full);
            ReactionHolder h = victim == null ? null : (ReactionHolder) victim;
            String hints = h == null ? "" : String.format(java.util.Locale.ROOT, " (hints, ticks ago: crit %s, sprint %s, weak %s; attacker at %.0f° from its front)",
                ago(h.mobreactions$critTick()), ago(h.mobreactions$sprintTick()), ago(h.mobreactions$weakTick()), swingAngle) + " [" + swingYaws + "]";
            check("clip", r != null && r.clip.name.equals(want), "want " + want + ", got " + (r == null ? "no reaction" : r.clip.name) + hints);
        } else if (since == 12) {
            check("pose", Pose.applied > appliedAtHit && Pose.rooted > rootedAtHit,
                "parts " + (Pose.applied - appliedAtHit) + ", root " + (Pose.rooted - rootedAtHit) + " frames");
            check("face", Faces.swapped > facesAtHit, (Faces.swapped - facesAtHit) + " face frames");
        } else if (full.startsWith("death_") && since == 30) {
            check("held", victim != null && !victim.isRemoved() && mc.level.getEntity(victim.getId()) == victim, "body still in the level 1.5 s after the death");
        } else if (full.startsWith("death_") && since == 62) {
            check("poof", victim != null && victim.isRemoved(), "body removed after the death clip");
        }
    }

    static String ago(int tick) {
        return tick == Integer.MIN_VALUE ? "-" : String.valueOf(victim.tickCount - tick);
    }

    static void check(String name, boolean pass, String detail) {
        String id = SCENES[scene] + "/" + name;
        results.add(String.format("{\"name\":\"%s\",\"pass\":%b,\"detail\":\"%s\"}", id, pass, detail.replace("\"", "'")));
        System.out.println("[mrdemo] " + (pass ? "PASS " : "FAIL ") + id + "  " + detail);
    }

    /** A villager gets a profession (its clothes and hat come from the profession layer); illagers never lead a patrol. */
    static String extraData(String scene) {
        return switch (MOB) {
            // a goat's brain turns its body to the player whatever the per-tick facing lock does; no AI until the first blow
            // (except for the fall: a mob without AI doesn't fall)
            case "goat" -> scene.equals("death_fall") ? "" : ",NoAI:1b";
            case "villager" -> ",VillagerData:{level:2,profession:\"minecraft:farmer\",type:\"minecraft:plains\"}";
            case "creeper" -> ",Fuse:32767s,ExplosionRadius:0b" + (POWERED ? ",powered:1b" : "");
            case "iron_golem" -> ",PlayerCreated:1b";
            case "enderman" -> CARRY ? ",carriedBlockState:{Name:\"minecraft:grass_block\",id:\"minecraft:grass_block\"}" : "";
            case "vindicator", "pillager", "evoker", "illusioner", "witch" -> ",PatrolLeader:0b,Patrolling:0b";
            default -> "";
        };
    }

    /** /summon with data skips the spawn equipment, so each mob gets its usual weapon here. */
    static String weapon() {
        String item = switch (MOB) {
            case "skeleton", "stray", "bogged", "parched" -> "bow";
            case "wither_skeleton" -> "stone_sword";
            case "piglin" -> "crossbow";
            case "piglin_brute" -> "golden_axe";
            case "zombified_piglin" -> "golden_sword";
            case "vindicator" -> "iron_axe";
            case "pillager" -> "crossbow";
            case "illusioner" -> "bow";
            default -> null;
        };
        return item == null ? "" : ",mainhand:{id:\"minecraft:" + item + "\",count:1}";
    }

    static void attack(Minecraft mc, Mob z, boolean sprint) {
        var pl = mc.player;
        Vec3 d = z.position().add(0, 1.2, 0).subtract(pl.getEyePosition());
        float yaw = (float) Math.toDegrees(Math.atan2(-d.x, d.z)), pitch = (float) -Math.toDegrees(Math.atan2(d.y, Math.hypot(d.x, d.z)));
        pl.setYRot(yaw);
        pl.setYHeadRot(yaw);
        pl.setYBodyRot(yaw);
        pl.setXRot(pitch);
        if (sprint) pl.setSprinting(true);
        // light: an uncharged swing, as if the attack button was spammed
        if (SCENES[scene].equals("light")) pl.resetAttackStrengthTicker();
        // With the camera on the armor stand the client sends no movement, so the server never sees the jump or
        // the sprint. Mirror them onto the server player; the queued task runs before the attack packet.
        boolean airborne = !pl.onGround();
        double fall = pl.fallDistance;
        boolean killing = SCENES[scene].startsWith("death_") && hits + 1 >= hitsFor(SCENES[scene]);
        java.util.UUID targetId = z.getUUID();
        MinecraftServer server = mc.getSingleplayerServer();
        java.util.UUID id = pl.getUUID();
        server.execute(() -> {
            var sp = server.getPlayerList().getPlayer(id);
            if (sp == null) return;
            if (airborne) {
                sp.setOnGround(false);
                sp.fallDistance = fall;
            }
            if (sprint) sp.setSprinting(true);
            // a parched's arrow or a witch's potion weakens the player (-4 melee damage), and the death scenes count on the full blow
            sp.removeEffect(net.minecraft.world.effect.MobEffects.WEAKNESS);
            // a cave spider's bite poisons the player
            sp.removeEffect(net.minecraft.world.effect.MobEffects.POISON);
            var target = server.overworld().getEntity(targetId);
            if (target instanceof net.minecraft.world.entity.Mob m && m.isNoAi()) m.setNoAi(false);
            // a witch drinks healing potions between combo hits: the scene's killing blow still has to kill
            if (killing) {
                var victim = server.overworld().getEntity(targetId);
                if (victim instanceof net.minecraft.world.entity.LivingEntity l && l.getHealth() > 5) l.setHealth(5);
            }
        });
        swingYaws = String.format(java.util.Locale.ROOT, "body %.0f, yaw %.0f, head %.0f", z.yBodyRot, z.getYRot(), z.getYHeadRot());
        double by = Math.toRadians(z.yBodyRot), ax = pl.getX() - z.getX(), az = pl.getZ() - z.getZ();
        swingAngle = Math.toDegrees(Math.atan2(ax * -Math.cos(by) + az * -Math.sin(by), ax * -Math.sin(by) + az * Math.cos(by)));
        mc.gameMode.attack(pl, z);
        //? if >=26.3 {
        pl.swing(InteractionHand.MAIN_HAND, net.minecraft.world.item.component.SwingAnimation.DEFAULT, false);
        //?} else {
        /*pl.swing(InteractionHand.MAIN_HAND);
        *///?}
        hits++;
        lastAttack = sceneTick;
        // a standing mob walks again after the scene's last blow (in a combo it has to stay in front of the camera)
        if (!WALKER && hits == hitsFor(SCENES[scene])) cmd(mc, "attribute @e[type=" + MOB + ",limit=1] minecraft:movement_speed base reset");
        if (hits >= hitsFor(SCENES[scene])) markHit();
        System.out.println("[mrdemo] " + SCENES[scene] + " hit " + hits + " at scene tick " + sceneTick);
    }

    static void record() {
        if (recording) return;
        recording = true;
        recordFrom = sceneTick;
        frame = 0;
        timing.clear();
        reacts.clear();
        seen = null;
    }

    static void stopRecording() {
        recording = false;
        Path dir = OUT.resolve(SCENES[scene]);
        List<String> lines = new ArrayList<>(timing);
        lines.add(0, "# frame nanos scene_tick partial clip clip_t y z first_hit " + firstHit + " last_hit " + hitTick + " reacts "
            + (reacts.isEmpty() ? "-" : String.join(",", reacts.stream().map(String::valueOf).toList())));
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve("timing.txt"), lines);
        } catch (IOException e) {
            System.out.println("[mrdemo] timing write failed: " + e);
        }
    }

    /** Called after every rendered frame. */
    public static void onFrame(Minecraft mc) {
        if (!recording || done) return;
        Path dir = OUT.resolve(SCENES[scene]);
        int n = frame++;
        float partial = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
        Reaction r = victim == null ? null : ((ReactionHolder) victim).mobreactions$reaction();
        Vec3 at = victim == null ? Vec3.ZERO : victim.getPosition(partial);
        timing.add(n + " " + System.nanoTime() + " " + sceneTick + " " + partial + " " + (r == null ? "- -1" : r.clip.name + " " + r.time(partial))
            + String.format(" %.4f %.4f", at.y, at.z));
        if (r != null && r != seen) reacts.add(n);
        seen = r;
        if (!FRAMES) return;
        Path out = dir.resolve(String.format("f%05d.png", n));
        pending.incrementAndGet();
        Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), (NativeImage img) -> WRITER.execute(() -> {
            try (img) {
                Files.createDirectories(dir);
                img.writeToFile(out);
            } catch (Exception e) {
                System.out.println("[mrdemo] write failed " + out + ": " + e);
            } finally {
                pending.decrementAndGet();
            }
        }));
    }

    static void finish(Minecraft mc) {
        done = true;
        try {
            Files.createDirectories(OUT);
            Files.writeString(OUT.resolve("results.json"), "{\"loader\":\"" + MobReactions.loader() + "\",\"mob\":\"" + MOB + "\",\"results\":[\n"
                + String.join(",\n", results) + "\n]}\n");
        } catch (IOException e) {
            System.out.println("[mrdemo] results write failed: " + e);
        }
        // onTick quits once the frames still being written are on disk
        drainUntil = System.currentTimeMillis() + 120_000;
    }

    static String fmt(Vec3 v) {
        return String.format("(%.2f %.2f %.2f)", v.x, v.y, v.z);
    }

    static Mob findMob(Minecraft mc) {
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e instanceof Mob m && e.isAlive() && !stale.contains(e.getId()) && BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath().equals(MOB)) return m;
        }
        return null;
    }

    static <T extends Entity> T find(Minecraft mc, Class<T> type) {
        for (Entity e : mc.level.entitiesForRendering()) {
            if (type.isInstance(e) && e.isAlive()) return type.cast(e);
        }
        return null;
    }

    static void cmd(Minecraft mc, String... commands) {
        MinecraftServer server = mc.getSingleplayerServer();
        server.execute(() -> {
            for (String c : commands) server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), c);
        });
    }

    static void hideHud(Minecraft mc) {
        try {
            Field f = mc.gui.hud.getClass().getDeclaredField("isHidden");
            f.setAccessible(true);
            f.setBoolean(mc.gui.hud, true);
        } catch (ReflectiveOperationException e) {
            System.out.println("[mrdemo] cannot hide HUD: " + e);
        }
        hudHidden = true;
    }
}
