package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.MobReactions;
import io.github.profetgit.mobreactions.anim.Clip;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Starts, picks, syncs and samples reactions and deaths. Client side only. */
public final class Hits {
    /** Hints (crit particles, a local sprint attack) count when they come at most this many ticks before the hit. */
    private static final int HINT_WINDOW = 20;
    /** A hit this many ticks or less after the previous one continues the combo. */
    private static final int COMBO_WINDOW = 40;
    /** Horizontal knockback speed (blocks/tick) above which a hit counts as a launch; a normal hit gives about 0.4. */
    private static final double LAUNCH_SPEED = 0.55;
    /** Clip speed while the mob, as drawn, hasn't left the ground yet. Clips hold their impact pose from tick 0
     * to tick 1 and the clock stops at 1, so this is the hit-stop: the pose freezes until the knockback shows (about 3
     * ticks after the hit). */
    static final float IMPACT_RATE = 0.4F;
    /** Shake length and size (px), in ticks after the first frame of the hit. */
    private static final float SHAKE = 3.5F, SHAKE_PX = 0.7F, CRIT_SHAKE_PX = 1.1F;
    /** An attack by the local player weaker than this (vanilla's own line for crits and sweeps) gets the light hit. */
    private static final float CHARGED = 0.9F;
    /** Ticks the client draws a knockback hop's touchdown after the server's (measured 3-5 on 26.2/26.3, all loaders). */
    private static final float TOUCHDOWN_LAG = 3.5F;
    /** Ticks past the expected touchdown after which a hop counts as landed anyway. */
    private static final int LATE_LANDING = 8;
    /** Ticks without any rise before the clip gives up waiting for a hop (knockback resistance, water, walls). */
    private static final int NO_HOP_TICKS = 4;
    /** A death this many ticks or less after a hit grows out of that hit's reaction. */
    private static final int KILLING_BLOW = 2;
    /** A death without a hit cross-fades from the pose that was showing over this many ticks. */
    static final float FADE = 4;
    /** Ticks over which a death takes over vanilla's head look and arm motion. */
    private static final float CALM = 3;
    /** Ticks at the end of a hit over which the arms blend back from the rig's pose into vanilla's. */
    private static final float ARM_RETURN = 5;
    /** Vanilla's red tint on a death without a landing key lasts this long. */
    private static final float RED = 10;
    /** Width (blocks) of the box the fire overlay is drawn in once the body is down, and ticks it takes to get there. */
    private static final float DOWN_WIDTH = 1.0F, GOING_DOWN = 5;
    /** A death without a hit waits this many ticks at most for a falling body to reach the ground, as drawn. */
    private static final int FALL_WAIT = 10;
    /** Predicted knockback distance (blocks) of a killing blow, for the room check; a sprint hit flies further. */
    private static final double KNOCK = 1.3, LAUNCH_KNOCK = 2.2;
    /** The white flash: full white this many ticks, then fading over FLASH_FADE; below FLASH_MIN the red shows. */
    private static final float FLASH_PEAK = 0.35F, FLASH_FADE = 1.6F, FLASH_MIN = 0.2F;
    /** Hold: after the release the hold offset shrinks by this much per block the drawn body moves, so the
     * body travels a bit less far than the drawn one and ends up where it really is; what is left at touchdown fades
     * over SETTLE ticks. */
    private static final double BLEED = 0.35;
    private static final float SETTLE = 4;
    /** Arc: apex of a knockback hop (blocks; vanilla's 0.4 knockback lifts a grounded mob about 0.96), and the
     * most the drawn height is ever moved. */
    private static final double ARC_H = 0.95, ARC_MAX = 0.3;
    /** A mob that moves further than this (blocks) in one tick teleported (an enderman): its hit reaction ends there. */
    private static final double TELEPORT = 4;
    /** Block crumbs kicked up at touchdown. */
    private static final int DUST = 5;

    private Hits() {
    }

    /** Adults of a supported rig (see {@link Rig#of}). */
    public static boolean supported(LivingEntity e) {
        return Rig.of(e) != null;
    }

    public static void onDamage(LivingEntity e, DamageSource source) {
        Rig rig = e.level().isClientSide() && !e.isDeadOrDying() ? Rig.of(e) : null;
        if (rig == null) return;
        Vec3 src = source.getSourcePosition();
        if (src == null) return;
        float partial = partial();
        ReactionHolder h = (ReactionHolder) e;
        int last = h.mobreactions$lastHitTick(), since = e.tickCount - last;
        int combo = last != Integer.MIN_VALUE && since >= 0 && since <= COMBO_WINDOW ? h.mobreactions$combo() + 1 : 1;
        h.mobreactions$setCombo(combo);
        h.mobreactions$setLastHitTick(e.tickCount);
        Reaction r = new Reaction(rig, MobReactions.clip(rig, "hit_front"), src, e.yBodyRot, e.tickCount, e.getY(), partial, combo);
        if (source.getEntity() instanceof LivingEntity attacker) r.rightHanded = attacker.getMainArm() == HumanoidArm.RIGHT;
        h.mobreactions$setReaction(r);
    }

    /**
     * Entity event 3 on the client. The server sends it right after the killing blow's damage event (and before the
     * knockback), so a fresh hit becomes its death twin before its first frame. Anything else collapses.
     */
    public static void onDeath(LivingEntity e) {
        Rig rig = e.level().isClientSide() ? Rig.of(e) : null;
        if (rig == null) return;
        ReactionHolder h = (ReactionHolder) e;
        Reaction r = h.mobreactions$reaction();
        if (r != null && r.dying) return;
        if (r != null && r.source != null && e.tickCount - r.hitTick <= KILLING_BLOW) {
            r.dying = true;
            if (r.resolved) apply(e, r, pick(e, r));
            return;
        }
        float partial = partial();
        Pose from = null;
        if (r != null && r.resolved && r.time(partial) < r.clip.length) {
            from = new Pose();
            from.sample(r.clip, r.time(partial), r.mirror);
        }
        Clip c = MobReactions.clip(rig, rig.collapse(true));
        boolean mirror = (e.getId() & 1) == 0;
        if (!room(e, c, mirror, e.yBodyRot, null, 0)) c = MobReactions.clip(rig, rig.collapse(false));
        Reaction d = Reaction.collapse(rig, c, e.yBodyRot, e.tickCount, e.getY(), partial, from);
        d.mirror = mirror;
        // the client draws the mob a few ticks behind the server: a fall death arrives while it still looks airborne
        if (e.getY() - e.yo < -0.03) d.tPrev = d.tNext = 0;
        h.mobreactions$setReaction(d);
    }

    public static void onCrit(LivingEntity e) {
        ((ReactionHolder) e).mobreactions$setCritTick(e.tickCount);
    }

    /** The local player's attack, before vanilla resets the charge: sprint attacks launch, uncharged ones hit light. */
    public static void onLocalAttack(LivingEntity target, Player player) {
        float charge = player.getAttackStrengthScale(0.5F);
        ReactionHolder h = (ReactionHolder) target;
        if (player.isSprinting() && charge > CHARGED) h.mobreactions$setSprintTick(target.tickCount);
        h.mobreactions$setWeakTick(charge < CHARGED ? target.tickCount : Integer.MIN_VALUE);
    }

    /** A playing death keeps the body: the removal waits until the clip is over. */
    public static boolean holdRemoval(Entity entity, Entity.RemovalReason reason) {
        if (!(entity instanceof LivingEntity e) || !(entity instanceof ReactionHolder h)) return false;
        Reaction r = h.mobreactions$reaction();
        if (r == null || !r.dying || r.done || !e.isDeadOrDying()) return false;
        r.removal = reason;
        return true;
    }

    /** The vanilla death poof (entity event 60) waits for the end of the death clip too. */
    public static boolean holdPoof(LivingEntity e) {
        return dying(e) && !((ReactionHolder) e).mobreactions$reaction().done;
    }

    /** A death is playing: the body can't be targeted, so clicks reach whatever is behind it. */
    public static boolean dying(LivingEntity e) {
        Reaction r = ((ReactionHolder) e).mobreactions$reaction();
        return r != null && r.dying;
    }

    public static void tick(LivingEntity e) {
        ReactionHolder h = (ReactionHolder) e;
        Reaction r = h.mobreactions$reaction();
        if (r == null || !e.level().isClientSide()) return;
        if (e.isRemoved() || (e.isDeadOrDying() && !r.dying)) {
            h.mobreactions$setReaction(null);
            return;
        }
        boolean jumped = !Double.isNaN(r.tickX) && Math.hypot(e.getX() - r.tickX, e.getZ() - r.tickZ) > TELEPORT;
        r.tickX = e.getX();
        r.tickZ = e.getZ();
        if (jumped && !r.dying) {
            // the held spot, the hop and the landing all belong to where it was
            h.mobreactions$setReaction(null);
            return;
        }
        resolve(e, r);
        if (r.source != null && e.tickCount - r.hitTick <= 2) refine(e, r);
        double y = e.getY();
        r.vy = y - r.lastY;
        r.lastY = y;
        if (!r.seenUp && y - r.yHit > 0.1) r.seenUp = true;
        if (!r.seenUp) r.groundedTicks++;
        r.tPrev = r.tNext;
        if (r.source == null && r.tPrev <= 0 && r.vy < -0.03 && e.tickCount - r.hitTick < FALL_WAIT) return;
        float land = r.clip.land;
        // down where it was hit, or down on something higher (a step, a slab, a wall it was knocked onto: on the ground and
        // no longer falling as drawn), or, whatever happened, long after the hop should have ended
        boolean touchdown = !r.landed && r.seenUp && r.vy <= 0
            && (y <= r.yHit + 0.02 || (e.onGround() && r.vy > -0.005) || e.tickCount - r.hitTick > land + TOUCHDOWN_LAG + LATE_LANDING);
        if (touchdown) r.landed = true;
        if (!r.seenUp && r.groundedTicks > NO_HOP_TICKS) r.noHop = true;
        if (!r.released && (r.seenUp || r.noHop || r.source == null)) {
            r.released = true;
            r.tRel = r.tPrev;
        }
        // the touchdown is seen at the tick; the drawn feet reach the ground by the end of the next interval
        if (touchdown) r.dustTick = e.tickCount + 1;
        if (e.tickCount == r.dustTick) dust(e, r);
        if (land <= 0 || r.tPrev >= land || r.noHop || (r.landed && !touchdown)) {
            r.tNext = r.tPrev + 1;
        } else if (touchdown) {
            // drawn at the ground by the end of this tick interval: the landing key goes there
            r.tNext = land;
        } else if (!r.seenUp) {
            r.tNext = Math.min(1, r.tPrev + IMPACT_RATE);
        } else {
            // spread what is left of the airborne part over the time until the drawn touchdown is due. The drawn hop
            // itself is no guide: it arrives in steps (a standing mob's first update can come 2 ticks early and then
            // sit still for 2), but it lands about as many ticks after the hit as the server's hop lasts (the clip's
            // landing key) plus the client's lag. The real touchdown still snaps the landing key into place.
            float due = r.hitTick + land + TOUCHDOWN_LAG - e.tickCount;
            r.tNext = r.tPrev + Math.clamp((land - r.tPrev) / Math.max(1, due), 0.25F, 2F);
            if (r.tNext > land - 0.05F) r.tNext = land - 0.05F;
        }
        dustEvents(e, r);
        if (r.tPrev < r.clip.length) return;
        if (!r.dying) {
            h.mobreactions$setReaction(null);
        } else if (!r.done) {
            r.done = true;
            if (r.removal != null) poof(e, h, r);
        }
    }

    /** The death is over and the server already removed the mob: the vanilla poof, then the removal it held back. */
    private static void poof(LivingEntity e, ReactionHolder h, Reaction r) {
        h.mobreactions$setReaction(null);
        e.makePoofParticles();
        if (e.level() instanceof ClientLevel level) level.removeEntity(e.getId(), r.removal);
    }

    public static void extract(LivingEntity e, LivingEntityRenderState state, float partial) {
        PoseHolder ph = (PoseHolder) state;
        Reaction r = ((ReactionHolder) e).mobreactions$reaction();
        if (r == null || (e.isDeadOrDying() && !r.dying)) {
            ph.mobreactions$setPose(null);
            return;
        }
        resolve(e, r);
        float t = r.time(partial);
        if (t >= r.clip.length) {
            if (!r.dying) {
                ph.mobreactions$setPose(null);
                return;
            }
            t = r.clip.length;
        }
        Pose p = new Pose();
        p.rig = r.rig;
        p.sample(r.clip, t, r.mirror);
        if (r.from != null && t < FADE) {
            float u = t / FADE;
            p.blend(r.from, 1 - u * u * (3 - 2 * u));
        }
        // flash and shake run in real time from the first frame that draws the hit (the damage packet is handled
        // before the mob's tick count moves on, so the packet's own time would lose most of a tick)
        if (r.firstAge < 0) r.firstAge = e.tickCount + partial;
        float since = e.tickCount + partial - r.firstAge;
        if (r.source != null) offset(r, state, t);
        // a hit stays red until it lands, like a death, instead of vanilla's fixed 10 ticks that end mid-air
        if (r.source != null && !r.dying && r.clip.land > 0 && t < r.clip.land) state.hasRedOverlay = true;
        if (r.impact) {
            float w = since < FLASH_PEAK ? 1 : 1 - (since - FLASH_PEAK) / FLASH_FADE;
            p.flash = w >= FLASH_MIN ? w : 0;
            if (since < SHAKE) {
                boolean big = r.rig.big(r.clip.name);
                float amp = (big ? CRIT_SHAKE_PX : SHAKE_PX) * Math.min(1.4F, 1 + 0.1F * (r.combo - 1)) * (1 - since / SHAKE);
                float wave = amp * (float) Math.sin(since * Math.PI * 3);
                p.shakeX = r.knockX * wave;
                p.shakeZ = r.knockZ * wave;
            }
        }
        if (!r.dying) {
            // the arms stay in the rig's space for the whole hit and hand back to vanilla's pose over its last ticks
            float u = Math.clamp((r.clip.length - t) / ARM_RETURN, 0F, 1F);
            p.armCalm = u * u * (3 - 2 * u);
        } else {
            p.calm = Math.min(1, t / CALM);
            p.dead = true;
            // no vanilla tip-over, the body keeps the heading it died with, and the red tint ends when it hits the ground
            state.deathTime = 0;
            state.bodyRot = r.bodyYaw;
            state.hasRedOverlay = t < (r.clip.land > 0 ? r.clip.land : RED);
            if (state instanceof HumanoidRenderState hs) hs.swimAmount = 0;
            if (r.clip.down > 0) {
                // a burning body: the flames follow it down instead of standing over it as a column
                float u = Math.clamp((t - r.clip.down + GOING_DOWN) / GOING_DOWN, 0F, 1F);
                state.boundingBoxHeight += (r.clip.rest - state.boundingBoxHeight) * u;
                state.boundingBoxWidth += (DOWN_WIDTH - state.boundingBoxWidth) * u;
            }
        }
        ph.mobreactions$setPose(p);
    }

    /**
     * Moves the drawn body (and its shadow, which vanilla places from these coordinates afterwards). Hold: until the
     * release the body stays where the hit landed, although the client still draws the walk for about three ticks,
     * then the offset bleeds off as the drawn knockback carries it away. Arc: the flight height follows a parabola on
     * the clip clock, which reaches the landing key exactly at touchdown, instead of vanilla's straight segments.
     */
    private static void offset(Reaction r, LivingEntityRenderState s, float t) {
        if (!r.anchored) {
            r.anchored = true;
            r.hx = s.x;
            r.hy = s.y;
            r.hz = s.z;
            r.lastX = s.x;
            r.lastZ = s.z;
        }
        float land = r.clip.land;
        if (!r.released) {
            r.ox = r.hx - s.x;
            r.oz = r.hz - s.z;
        } else {
            double m = Math.hypot(r.ox, r.oz);
            if (m > 1e-5) {
                double left = Math.max(0, m - BLEED * Math.hypot(s.x - r.lastX, s.z - r.lastZ));
                // no hop to ride on (knockback resistance, water): it fades out from the release instead
                boolean hop = land > 0 && !r.noHop;
                if (!hop || t >= land) {
                    if (r.landOff < 0) r.landOff = left;
                    left = Math.min(left, r.landOff * Math.max(0, 1 - (t - (hop ? land : r.tRel)) / SETTLE));
                }
                r.ox *= left / m;
                r.oz *= left / m;
            }
        }
        r.lastX = s.x;
        r.lastZ = s.z;
        s.x += r.ox;
        s.z += r.oz;
        if (r.released && !r.noHop && land > 0 && t < land && r.tRel < land && s.y > r.hy - 0.05) {
            float u = Math.clamp((t - r.tRel) / (land - r.tRel), 0F, 1F);
            double want = r.hy + ARC_H * 4 * u * (1 - u);
            s.y += Math.clamp(want - s.y, -ARC_MAX, ARC_MAX);
        }
    }

    /**
     * A reacting pet stands up for the hit: a sitting wolf or cat, a sleeping, sitting, crouching or pouncing fox (awake:
     * the sleeping texture has its eyes shut) and a lying or loafing cat play the reaction from the standing pose. The
     * server stands most of them up on a hit anyway.
     */
    public static void standUp(net.minecraft.client.renderer.entity.state.EntityRenderState s) {
        if (!(s instanceof LivingEntityRenderState l) || ((PoseHolder) l).mobreactions$pose() == null) return;
        if (s instanceof net.minecraft.client.renderer.entity.state.WolfRenderState w) {
            w.isSitting = false;
        } else if (s instanceof net.minecraft.client.renderer.entity.state.FoxRenderState f) {
            f.isSleeping = f.isSitting = f.isCrouching = f.isPouncing = f.isFaceplanted = false;
            f.crouchAmount = 0;
        } else if (s instanceof net.minecraft.client.renderer.entity.state.FelineRenderState c) {
            c.isSitting = c.isCrouching = false;
            c.lieDownAmount = c.lieDownAmountTail = c.relaxStateOneAmount = 0;
            if (c instanceof net.minecraft.client.renderer.entity.state.CatRenderState cat) cat.isLyingOnTopOfSleepingPlayer = false;
        }
    }

    /**
     * The clip's dust events that fall in this tick (the iron golem's steps and slams, see Clip.events): 1 = both feet,
     * 2 = both fists on the ground in front, 3 = the whole body landing (a wide ring round it).
     */
    private static void dustEvents(LivingEntity e, Reaction r) {
        for (float[] k : r.clip.events("dust")) {
            if (k[1] < 0.5F || k[0] <= r.tPrev || k[0] > r.tNext) continue;
            double yaw = Math.toRadians(r.bodyYaw), fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
            double x = e.getX() + r.ox, y = e.getY(), z = e.getZ() + r.oz;
            RandomSource rnd = e.getRandom();
            switch (Math.round(k[1])) {
                case 1 -> {
                    ring(e.level(), rnd, x + rx * 0.3, y, z + rz * 0.3, 0.25, 5);
                    ring(e.level(), rnd, x - rx * 0.3, y, z - rz * 0.3, 0.25, 5);
                }
                case 2 -> {
                    ring(e.level(), rnd, x + fx * 0.9 + rx * 0.5, y, z + fz * 0.9 + rz * 0.5, 0.25, 6);
                    ring(e.level(), rnd, x + fx * 0.9 - rx * 0.5, y, z + fz * 0.9 - rz * 0.5, 0.25, 6);
                }
                default -> {
                    // a body that lies down lands centred on its position (the golem slides as it topples)
                    ring(e.level(), rnd, x, y, z, 0.9, 14);
                    ring(e.level(), rnd, x, y, z, 0.4, 6);
                }
            }
        }
    }

    /** n block crumbs from the block under a point, thrown up and out in a ring of the given radius. */
    private static void ring(Level level, RandomSource rnd, double x, double y, double z, double radius, int n) {
        BlockPos below = BlockPos.containing(x, y - 0.2, z);
        BlockState block = level.getBlockState(below);
        if (block.isAir() || block.getRenderShape() == RenderShape.INVISIBLE) return;
        BlockParticleOption crumb = new BlockParticleOption(ParticleTypes.BLOCK, block);
        for (int i = 0; i < n; i++) {
            double a = (i + rnd.nextDouble() * 0.7) * Math.PI * 2 / n, cx = Math.cos(a), cz = Math.sin(a);
            level.addParticle(crumb, x + cx * radius, y + 0.06, z + cz * radius, cx, 0.7, cz);
        }
    }

    /** Block crumbs from under the feet, thrown up and out in a ring, like vanilla's sprint dust. */
    private static void dust(LivingEntity e, Reaction r) {
        Level level = e.level();
        double x = e.getX() + r.ox, y = e.getY(), z = e.getZ() + r.oz;
        BlockPos below = BlockPos.containing(x, y - 0.2, z);
        BlockState block = level.getBlockState(below);
        if (block.isAir() || block.getRenderShape() == RenderShape.INVISIBLE) return;
        BlockParticleOption crumb = new BlockParticleOption(ParticleTypes.BLOCK, block);
        RandomSource rnd = e.getRandom();
        for (int i = 0; i < DUST; i++) {
            double a = (i + rnd.nextDouble() * 0.7) * Math.PI * 2 / DUST, cx = Math.cos(a), cz = Math.sin(a);
            level.addParticle(crumb, x + cx * 0.28, y + 0.06, z + cz * 0.28, cx, 0.7, cz);
        }
    }

    private static void resolve(LivingEntity e, Reaction r) {
        if (r.resolved) return;
        r.resolved = true;
        apply(e, r, pick(e, r));
    }

    /** A crit or launch hint that arrives a moment after the hit still upgrades the reaction. */
    private static void refine(LivingEntity e, Reaction r) {
        Choice c = pick(e, r);
        String name = r.clip.name.substring(r.clip.name.indexOf('_') + 1);
        if (!c.name.equals("hit_" + name) && (c.name.equals("hit_crit") || c.name.equals("hit_launch") || c.name.equals("hit_big"))) apply(e, r, c);
    }

    /** Sets the clip for a choice: the hit, or its death twin, or the heap when there's no room to fall. */
    private static void apply(LivingEntity e, Reaction r, Choice c) {
        r.mirror = c.mirror;
        if (!r.dying) {
            r.clip = MobReactions.clip(r.rig, c.name);
            return;
        }
        // a light hit that kills dies like the full front hit
        Clip d = MobReactions.clip(r.rig, r.rig.death(c.name));
        double knock = d.land > 0 ? (d.name.equals("death_launch") ? LAUNCH_KNOCK : KNOCK) : 0;
        if (!room(e, d, c.mirror, r.bodyYaw, r.source, knock)) d = MobReactions.clip(r.rig, r.rig.heap());
        r.clip = d;
    }

    /**
     * Whether the body can lie down: from where the knockback should put it, the cells along the direction its
     * head ends up in, as far as its height reaches, are free at body height and have ground under them. Walls, trees and ledges get the heap.
     */
    private static boolean room(LivingEntity e, Clip c, boolean mirror, float bodyYaw, Vec3 source, double knock) {
        if (c.lie == null) return true;
        Level level = e.level();
        double x = e.getX(), z = e.getZ(), y = ground(level, x, e.getY(), z);
        if (source != null && knock > 0) {
            double dx = x - source.x, dz = z - source.z, n = Math.hypot(dx, dz);
            if (n > 1e-4) {
                x += dx / n * knock;
                z += dz / n * knock;
            }
        }
        // rig frame: x = the mob's right, z = its back; yaw 0 faces +z, and its right is then -x
        double yaw = Math.toRadians(bodyYaw), lx = mirror ? -c.lie[0] : c.lie[0], lz = c.lie[1];
        double wx = lx * -Math.cos(yaw) - lz * -Math.sin(yaw), wz = lx * -Math.sin(yaw) - lz * Math.cos(yaw);
        // as far as the body will reach: 1.5 blocks for most mobs, an enderman's or a golem's 2.5
        double reach = Math.max(1.5, e.getBbHeight() - 0.2);
        for (double k = 0.5; k <= reach + 0.01; k += 0.5) {
            double px = x + wx * k, pz = z + wz * k;
            BlockPos body = BlockPos.containing(px, y + 0.3, pz);
            if (!level.getBlockState(body).getCollisionShape(level, body).isEmpty()) return false;
            BlockPos ground = BlockPos.containing(px, y - 0.2, pz);
            if (k > 0.6 && level.getBlockState(ground).getCollisionShape(level, ground).isEmpty() && !e.isInWater()) return false;
        }
        return true;
    }

    /**
     * The floor under a point, up to 12 blocks down: a fall death arrives while the client still draws the mob several
     * blocks up (it draws mobs a few ticks behind the server, and a long fall is fast by then).
     */
    private static double ground(Level level, double x, double y, double z) {
        BlockPos.MutableBlockPos pos = BlockPos.containing(x, y - 0.01, z).mutable();
        for (int i = 0; i < 13; i++, pos.move(0, -1, 0)) {
            VoxelShape shape = level.getBlockState(pos).getCollisionShape(level, pos);
            if (!shape.isEmpty()) return Math.min(y, pos.getY() + shape.max(Direction.Axis.Y));
        }
        return y;
    }

    private record Choice(String name, boolean mirror) {
    }

    private static Choice pick(LivingEntity e, Reaction r) {
        ReactionHolder h = (ReactionHolder) e;
        boolean crit = within(h.mobreactions$critTick(), r.hitTick, e.tickCount);
        Vec3 v = e.getDeltaMovement();
        boolean launch = within(h.mobreactions$sprintTick(), r.hitTick, e.tickCount) || Math.hypot(v.x, v.z) >= LAUNCH_SPEED;
        double dx = r.source.x - e.getX(), dz = r.source.z - e.getZ();
        double yaw = Math.toRadians(r.bodyYaw);
        double fwd = dx * -Math.sin(yaw) + dz * Math.cos(yaw);
        double right = dx * -Math.cos(yaw) + dz * -Math.sin(yaw);
        double a = Math.abs(dx) + Math.abs(dz) < 1e-4 ? 0 : Math.toDegrees(Math.atan2(right, fwd));
        // pushed away from the attacker: in the rig frame the front is -z and the right is +x
        double rad = Math.toRadians(a);
        r.knockX = (float) -Math.sin(rad);
        r.knockZ = (float) Math.cos(rad);
        // the villager and quadruped rigs have one big hit for crits and sprint hits, and one side hit, mirrored for the left
        boolean villager = r.rig != Rig.HUMANOID;
        if (crit) return new Choice(villager ? "hit_big" : "hit_crit", false);
        if (Math.abs(a) >= 125) return new Choice("hit_back", false);
        if (launch) return new Choice(villager ? "hit_big" : "hit_launch", false);
        if (Math.abs(a) <= 55) return combo(e, r);
        if (villager) return new Choice("hit_side", a < 0);
        return new Choice(a > 0 ? "hit_side_r" : "hit_side_l", false);
    }

    /**
     * Front hits in a row (humanoid rig): a shove, then a slash from the right, one from the left and a finisher to the gut,
     * then slash, slash, finisher again. The shove comes from the attacker's swing side, the finisher flips sides at
     * random. An uncharged swing by the local player is a light hit wherever it falls in the combo.
     */
    private static Choice combo(LivingEntity e, Reaction r) {
        boolean coin = ((e.getId() * 31 + r.hitTick) & 1) == 0;
        // the clips' blow comes from the mob's right; a right-handed swing arrives on its left
        boolean swing = r.rightHanded != null ? r.rightHanded : coin;
        if (within(((ReactionHolder) e).mobreactions$weakTick(), r.hitTick, e.tickCount)) return new Choice("hit_light", swing);
        if (r.rig != Rig.HUMANOID) {
            // the villager and quadruped rigs: the front hit from alternating sides, every fourth hit in a row the big one
            int k = (r.combo - 1) % 4;
            return k == 3 ? new Choice("hit_big", coin) : new Choice("hit_front", swing ^ (k == 1));
        }
        if (r.combo <= 1) return new Choice("hit_front", swing);
        return switch ((r.combo - 2) % 3) {
            case 0 -> new Choice("hit_twist", false);
            case 1 -> new Choice("hit_twist", true);
            default -> new Choice("hit_heavy", coin);
        };
    }

    private static boolean within(int hint, int hitTick, int now) {
        return hint != Integer.MIN_VALUE && hint >= hitTick - HINT_WINDOW && hint <= now;
    }

    private static float partial() {
        return Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
    }
}
