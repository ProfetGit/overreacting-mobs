package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.anim.Clip;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/**
 * A reaction playing on one mob. The clip clock advances once per client tick by a rate and is interpolated with
 * the partial tick, so the pose moves at the render frame rate. The rate follows the real knockback as the client
 * draws it (about three ticks behind the server): the impact holds while the mob is still on the ground, the airborne
 * part stretches or shrinks to the predicted flight time, and the landing key lands exactly on touchdown.
 * A death is a reaction too: the killing blow's hit upgraded to its death twin, or a collapse that cross-fades from
 * whatever was showing. It holds its last pose until the client has seen the server remove the mob, then poofs.
 */
public final class Reaction {
    public final Rig rig;
    public Clip clip;
    /** Play the clip mirrored left to right. */
    boolean mirror;
    /** Position in the combo: 1 for a fresh hit, 2 for a hit soon after it, and so on. */
    final int combo;
    boolean resolved;
    /** Where the hit came from; null for a death without a hit (fire, fall, drowning). */
    final Vec3 source;
    final float bodyYaw;
    final int hitTick;
    final double yHit;
    /** Knockback direction in the rig frame (x = the mob's right, z = its back), for the shake. */
    float knockX, knockZ = 1;
    double lastY, vy;
    /** The mob's position last tick (NaN before the first), to notice a teleport. */
    double tickX = Double.NaN, tickZ;
    boolean seenUp, landed, noHop;
    int groundedTicks;
    /** Clip time at the start of the current tick interval and at its end. */
    float tPrev, tNext;

    /** The mob died: the clip is a death clip and the body stays until {@link #done}. */
    boolean dying;
    /** Hit flash and shake (not for a death without a hit). */
    boolean impact = true;
    /** Pose the death cross-fades from during its first {@link Hits#FADE} ticks, or null. */
    Pose from;
    /** The death clip has played to its end. */
    boolean done;
    /** Removal the server asked for while the death was still playing, or null. */
    Entity.RemovalReason removal;

    /** The attacker swung with its right hand (the blow arrives on the mob's left); null when unknown. */
    Boolean rightHanded;
    /** The hit-stop is over: the drawn knockback has started (or never will), and the clip plays the flight. */
    boolean released;
    /** Clip time at the release. */
    float tRel;
    /** Drawn spot of the first frame of the hit, where the hit-stop holds the body; the hold's offset from the drawn
     * position (world blocks), which bleeds off after the release; the drawn position it was last measured at. */
    boolean anchored;
    double hx, hy, hz, ox, oz, lastX, lastZ;
    /** Hold offset left at touchdown, which then fades out; -1 before the touchdown. */
    double landOff = -1;
    int dustTick = Integer.MIN_VALUE;
    /** Mob age (tick count + partial) at the first frame that drew the hit, which times the flash and the shake; -1
     * before it. */
    float firstAge = -1;

    Reaction(Rig rig, Clip clip, Vec3 source, float bodyYaw, int hitTick, double y, float partial, int combo) {
        this.rig = rig;
        this.clip = clip;
        this.combo = combo;
        this.source = source;
        this.bodyYaw = bodyYaw;
        this.hitTick = hitTick;
        this.yHit = y;
        this.lastY = y;
        // the hit arrives part way through a tick interval: clip time 0 at that partial tick
        this.tPrev = -partial * Hits.IMPACT_RATE;
        this.tNext = (1 - partial) * Hits.IMPACT_RATE;
    }

    /** A death without a hit: plays at normal speed from the partial tick it started at. */
    static Reaction collapse(Rig rig, Clip clip, float bodyYaw, int tick, double y, float partial, Pose from) {
        Reaction r = new Reaction(rig, clip, null, bodyYaw, tick, y, partial, 1);
        r.resolved = true;
        r.dying = true;
        r.impact = false;
        r.from = from;
        r.tPrev = -partial;
        r.tNext = 1 - partial;
        return r;
    }

    /** Clip time in ticks at the given partial tick. */
    public float time(float partial) {
        return Math.max(0, tPrev + (tNext - tPrev) * partial);
    }
}
