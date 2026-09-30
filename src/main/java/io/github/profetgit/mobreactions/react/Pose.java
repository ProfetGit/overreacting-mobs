package io.github.profetgit.mobreactions.react;

import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.anim.Clip;
import io.github.profetgit.mobreactions.anim.Clip.Channel;
import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import java.util.List;
import java.util.Map;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Matrix3f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * One frame of a reaction, sampled from a {@link Clip}, applied on top of the pose vanilla already computed.
 * Clip values are Blockbench units in Blockbench space (y up, facing -z, x = the mob's right). The renderer's
 * entity frame right after setupRotations is that same space in blocks, so root and pelvis go straight onto the
 * PoseStack. Model parts live in vanilla model space (x and y flipped, y down, px), where a Blockbench rotation
 * (x, y, z) is (-x, -y, z) and a position (x, y, z) is (-x, -y, z); both use Z-Y-X Euler order.
 * Three rigs: the humanoid one (HumanoidModel), the villager-like one (IllagerModel, VillagerModel, WitchModel), whose
 * parts all hang off the root at the same pivots (neck 24 px, hips 12 px) plus a crossed-arms part (illagers also have
 * separate arms, shown while they attack or cast and, during a reaction, until the clip crosses them again), and the
 * quadruped one (QuadrupedModel), keyed on the cow: its whole-body motion (root, the tip-over bones and the pelvis) goes
 * onto the PoseStack about pivots measured from each model ({@link Quad}), so layers drawn in the entity frame (a
 * mooshroom's mushrooms) follow it; the head and legs are model parts. The spider rig (SpiderModel) works the same way: the
 * whole body on the PoseStack about pivots measured from the model ({@link Arachnid}), the head, the abdomen (hinged at
 * its joint with the neck) and the eight legs as model parts, the legs keyed as offsets from vanilla's splayed rest.
 */
public final class Pose {
    private static final float DEG = (float) (Math.PI / 180);
    private static final float CREEPER_HIPS = 6f / 16f, CREEPER_WAIST = 18f; // creeper hips: blocks above the feet / model y
    /** Vanilla's chasing-zombie arms (AnimationUtils.animateZombieArms, aggressive), the rest pose the clips are keyed on. */
    private static final float ARM_X = (float) (-Math.PI / 1.5), ARM_Y = 0.1F;
    /** Enderman: vanilla's carrying arms (EndermanModel), the shoulders' model y, and how far the surprised face drops the
     * jaw (px; an angry enderman's is already open, by 5). */
    private static final float CARRY_X = -0.5F, CARRY_Z = 0.05F, ENDER_SHOULDER = -12, JAW = 3, CREEPY_LIFT = 5;
    /** Iron golem: hips (blocks above the feet), the waist the torso bends at, and the shoulders the arms turn about (model px). */
    private static final float GOLEM_HIPS = 13f / 16f, GOLEM_WAIST = 8, GOLEM_SHOULDER_X = 11, GOLEM_SHOULDER_Y = -7;

    final float[] rootPos = new float[3], rootRot = new float[3], rootScale = new float[3];
    final float[] pelvisRot = new float[3], torsoRot = new float[3];
    final float[] headRot = new float[3], headPos = new float[3];
    final float[] armR = new float[3], armL = new float[3], legR = new float[3], legL = new float[3];
    /** Villager rig: the crossed-arms part (offsets from vanilla's pose), moved as one piece. */
    final float[] armsRot = new float[3], armsPos = new float[3];
    /** Quadruped rig: rolls about the right and the left flank's edge on the ground (lying down on that side), the
     * pelvis's position (lowering the body in the tipped frame) and the four legs. */
    final float[] tipR = new float[3], tipL = new float[3], pelvisPos = new float[3];
    final float[] legFR = new float[3], legFL = new float[3], legHR = new float[3], legHL = new float[3];
    /** Pet rig: the tail ([lift, wag] as a Blockbench turn of the backward-hanging tail). */
    final float[] tail = new float[3];
    /** Spider rig: the abdomen and the eight legs, front to hind, right then left (Arachnid.LEGS). */
    final float[] abdomen = new float[3];
    final float[][] legs8 = new float[8][3];
    /** Spider legs' scale; x shortens a leg along its length (a single bar without a knee "curls" by folding in and shortening). */
    final float[][] legScale8 = new float[8][3];
    private static final String[] LEGS8 = {"leg_r1", "leg_r2", "leg_r3", "leg_r4", "leg_l1", "leg_l2", "leg_l3", "leg_l4"};
    /** The rig the clip was keyed on (set by Hits.extract). */
    Rig rig = Rig.HUMANOID;
    private final float[] tmp = new float[3];
    /** Villager rig, illagers: the arms are crossed again (the "cross" track, 1 = crossed, 0 = the separate arms). */
    float cross;
    /** Illagers only: vanilla draws the crossed arms this frame (set by the model hook). */
    public boolean crossedVanilla;
    /** The separate arms were shown instead of vanilla's crossed ones this frame (Fresh Animations' own crossed arms are
     * hidden then, see compat.Emf). */
    public boolean armsApart;
    public float walk = 1;
    public int face;
    /** White hit flash this frame, 0 (none) to 1 (vanilla's full white overlay). */
    public float flash;
    /** Hit shake along the knockback, px in the rig frame. */
    float shakeX, shakeZ;
    /**
     * How far vanilla's own part motion is replaced by the rig's rest pose (0..1): a dead body stops looking around,
     * bobbing its arms and swinging at things, and a zombie that wasn't chasing anything (arms held 40° lower) still
     * ends up in the keyed pose.
     */
    float calm;
    /**
     * How far vanilla's arm pose is replaced by the rig's rest pose during a hit (0..1). The clips key the arms as absolute
     * poses in the rig, so a skeleton drawing its bow or a piglin holding a crossbow flings its arms the same way a
     * zombie does, and they blend back into whatever vanilla wants at the end of the clip.
     */
    float armCalm;
    /** Applied after Entity Model Features animated the model (see compat.Emf): the pack drives the walk, so it isn't scaled. */
    public boolean emf;
    /** A death is playing (an enderman's carried block isn't drawn: the server drops it as loot). */
    public boolean dead;
    /** Enderman, set by its model hook: it carries a block (the arms hold it and move as one pair, and the block goes with
     * them, see carry()), and it's angry (vanilla already lifts its head off the jaw). */
    public boolean carrying, creepy;
    /** Frames that posed model parts / the root; the dev demo checks that a reaction reached the model. */
    public static int applied, rooted;

    private final Matrix3f torso = new Matrix3f(), part = new Matrix3f();
    private final Vector3f vec = new Vector3f();

    /** Samples the clip at tick t; mirrored swaps left and right (Blockbench x is the mob's right). */
    public void sample(Clip clip, float t, boolean mirrored) {
        clip.sample("root", Channel.POS, t, rootPos);
        clip.sample("root", Channel.ROT, t, rootRot);
        clip.sample("root", Channel.SCALE, t, rootScale);
        clip.sample("pelvis", Channel.ROT, t, pelvisRot);
        clip.sample("torso", Channel.ROT, t, torsoRot);
        clip.sample("head", Channel.ROT, t, headRot);
        clip.sample("head", Channel.POS, t, headPos);
        clip.sample(mirrored ? "arm_l" : "arm_r", Channel.ROT, t, armR);
        clip.sample(mirrored ? "arm_r" : "arm_l", Channel.ROT, t, armL);
        clip.sample(mirrored ? "leg_l" : "leg_r", Channel.ROT, t, legR);
        clip.sample(mirrored ? "leg_r" : "leg_l", Channel.ROT, t, legL);
        clip.sample("arms", Channel.ROT, t, armsRot);
        clip.sample("arms", Channel.POS, t, armsPos);
        clip.sample("pelvis", Channel.POS, t, pelvisPos);
        clip.sample(mirrored ? "tip_l" : "tip_r", Channel.ROT, t, tipR);
        clip.sample(mirrored ? "tip_r" : "tip_l", Channel.ROT, t, tipL);
        clip.sample(mirrored ? "leg_fl" : "leg_fr", Channel.ROT, t, legFR);
        clip.sample(mirrored ? "leg_fr" : "leg_fl", Channel.ROT, t, legFL);
        clip.sample(mirrored ? "leg_hl" : "leg_hr", Channel.ROT, t, legHR);
        clip.sample(mirrored ? "leg_hr" : "leg_hl", Channel.ROT, t, legHL);
        clip.sample("abdomen", Channel.ROT, t, abdomen);
        clip.sample("tail", Channel.ROT, t, tail);
        for (int i = 0; i < 8; i++) {
            clip.sample(LEGS8[mirrored ? (i + 4) % 8 : i], Channel.ROT, t, legs8[i]);
            clip.sample(LEGS8[mirrored ? (i + 4) % 8 : i], Channel.SCALE, t, legScale8[i]);
        }
        clip.sample("cross", Channel.POS, t, tmp);
        cross = clip.has("cross", Channel.POS) ? tmp[0] : 0;
        clip.sample("walk", Channel.SCALE, t, tmp);
        walk = clip.has("walk", Channel.SCALE) ? Math.max(0, tmp[0]) : 1;
        clip.sample("face", Channel.POS, t, tmp);
        face = clip.has("face", Channel.POS) ? Math.round(tmp[0]) : 0;
        if (mirrored) {
            for (float[] r : new float[][] {rootRot, pelvisRot, torsoRot, headRot, armR, armL, legR, legL, armsRot, tipR, tipL, legFR, legFL, legHR, legHL, abdomen, tail}) {
                r[1] = -r[1];
                r[2] = -r[2];
            }
            for (float[] r : legs8) {
                r[1] = -r[1];
                r[2] = -r[2];
            }
            rootPos[0] = -rootPos[0];
            headPos[0] = -headPos[0];
            armsPos[0] = -armsPos[0];
            pelvisPos[0] = -pelvisPos[0];
        }
    }

    /** Moves this pose toward {@code other}: w = 0 keeps this pose, 1 gives the other one. */
    void blend(Pose other, float w) {
        float[][] a = {rootPos, rootRot, rootScale, pelvisRot, torsoRot, headRot, headPos, armR, armL, legR, legL, armsRot, armsPos, tipR, tipL, pelvisPos,
            legFR, legFL, legHR, legHL, tail};
        float[][] b = {other.rootPos, other.rootRot, other.rootScale, other.pelvisRot, other.torsoRot, other.headRot, other.headPos, other.armR,
            other.armL, other.legR, other.legL, other.armsRot, other.armsPos, other.tipR, other.tipL, other.pelvisPos, other.legFR, other.legFL, other.legHR,
            other.legHL, other.tail};
        for (int i = 0; i < a.length; i++) for (int k = 0; k < 3; k++) a[i][k] += (b[i][k] - a[i][k]) * w;
        for (int k = 0; k < 3; k++) abdomen[k] += (other.abdomen[k] - abdomen[k]) * w;
        for (int i = 0; i < 8; i++) {
            for (int k = 0; k < 3; k++) {
                legs8[i][k] += (other.legs8[i][k] - legs8[i][k]) * w;
                legScale8[i][k] += (other.legScale8[i][k] - legScale8[i][k]) * w;
            }
        }
        walk += (other.walk - walk) * w;
        if (w > 0.5F) {
            face = other.face;
            cross = other.cross;
        }
    }

    /**
     * Root (about the feet) and pelvis (about the hips), in the entity frame after LivingEntityRenderer.setupRotations.
     * {@code model} is the renderer's model, which the quadruped rig measures its pivots on.
     */
    public void applyRoot(PoseStack ps, Model<?> model) {
        if (rig == Rig.QUADRUPED || rig == Rig.PET) {
            applyRootQuadruped(ps, Quad.of(model));
            return;
        }
        if (rig == Rig.SPIDER) {
            applyRootSpider(ps, Arachnid.of(model));
            return;
        }
        if (rig == Rig.CREEPER) {
            applyRootCreeper(ps);
            return;
        }
        if (rig == Rig.GOLEM) {
            applyRootGolem(ps);
            return;
        }
        // humanoid and villager-like rigs: positions scale with the hip height, the pelvis turns about the hips
        rooted++;
        Biped b = Biped.of(model);
        float s = b.scale(rig) / 16f;
        ps.translate((rootPos[0] + shakeX) * s, rootPos[1] * s, (rootPos[2] + shakeZ) * s);
        if (nonZero(rootRot)) ps.rotateAround(new Quaternionf().rotationZYX(rootRot[2] * DEG, rootRot[1] * DEG, rootRot[0] * DEG), 0, 0, 0);
        ps.scale(rootScale[0], rootScale[1], rootScale[2]);
        if (nonZero(pelvisRot)) ps.rotateAround(new Quaternionf().rotationZYX(pelvisRot[2] * DEG, pelvisRot[1] * DEG, pelvisRot[0] * DEG), 0, (24 - b.hips()) / 16f, 0);
    }

    /**
     * Quadrupeds: root about the feet (positions scaled to the model's size), then the roll onto one flank about that
     * flank's edge on the ground, then the pelvis: lowered, and tilted about the middle of the belly.
     */
    private void applyRootQuadruped(PoseStack ps, Quad q) {
        rooted++;
        float s = q.scale(rig) / 16f, zc = q.zc() / 16f, w = q.halfWidth() / 16f;
        ps.translate((rootPos[0] + shakeX) * s, rootPos[1] * s, (rootPos[2] + shakeZ) * s);
        if (nonZero(rootRot)) ps.rotateAround(new Quaternionf().rotationZYX(rootRot[2] * DEG, rootRot[1] * DEG, rootRot[0] * DEG), 0, 0, 0);
        ps.scale(rootScale[0], rootScale[1], rootScale[2]);
        if (nonZero(tipR)) ps.rotateAround(new Quaternionf().rotationZYX(tipR[2] * DEG, tipR[1] * DEG, tipR[0] * DEG), w, 0, zc);
        if (nonZero(tipL)) ps.rotateAround(new Quaternionf().rotationZYX(tipL[2] * DEG, tipL[1] * DEG, tipL[0] * DEG), -w, 0, zc);
        ps.translate(pelvisPos[0] * s, pelvisPos[1] * s, pelvisPos[2] * s);
        if (nonZero(pelvisRot)) ps.rotateAround(new Quaternionf().rotationZYX(pelvisRot[2] * DEG, pelvisRot[1] * DEG, pelvisRot[0] * DEG), 0, q.belly() / 16f, zc);
    }

    /** Spiders: root about the feet, then the pelvis: moved, and turned about the middle of the body (positions scaled to the model's size). */
    private void applyRootSpider(PoseStack ps, Arachnid a) {
        rooted++;
        float s = a.scale() / 16f;
        ps.translate((rootPos[0] + shakeX) * s, rootPos[1] * s, (rootPos[2] + shakeZ) * s);
        if (nonZero(rootRot)) ps.rotateAround(new Quaternionf().rotationZYX(rootRot[2] * DEG, rootRot[1] * DEG, rootRot[0] * DEG), 0, 0, 0);
        ps.scale(rootScale[0], rootScale[1], rootScale[2]);
        ps.translate(pelvisPos[0] * s, pelvisPos[1] * s, pelvisPos[2] * s);
        if (nonZero(pelvisRot)) ps.rotateAround(new Quaternionf().rotationZYX(pelvisRot[2] * DEG, pelvisRot[1] * DEG, pelvisRot[0] * DEG), 0, a.centre() / 16f, a.zc() / 16f);
    }

    /** Creepers: root about the feet, then the pelvis, moved and turned about the hips (the legs go with it). */
    private void applyRootCreeper(PoseStack ps) {
        rooted++;
        ps.translate((rootPos[0] + shakeX) / 16f, rootPos[1] / 16f, (rootPos[2] + shakeZ) / 16f);
        if (nonZero(rootRot)) ps.rotateAround(new Quaternionf().rotationZYX(rootRot[2] * DEG, rootRot[1] * DEG, rootRot[0] * DEG), 0, 0, 0);
        ps.scale(rootScale[0], rootScale[1], rootScale[2]);
        ps.translate(pelvisPos[0] / 16f, pelvisPos[1] / 16f, pelvisPos[2] / 16f);
        if (nonZero(pelvisRot)) ps.rotateAround(new Quaternionf().rotationZYX(pelvisRot[2] * DEG, pelvisRot[1] * DEG, pelvisRot[0] * DEG), 0, CREEPER_HIPS, 0);
    }

    /** Iron golems: root about the feet, then the pelvis, moved and turned about the hips (13 px up; the legs go with it). */
    private void applyRootGolem(PoseStack ps) {
        rooted++;
        ps.translate((rootPos[0] + shakeX) / 16f, rootPos[1] / 16f, (rootPos[2] + shakeZ) / 16f);
        if (nonZero(rootRot)) ps.rotateAround(new Quaternionf().rotationZYX(rootRot[2] * DEG, rootRot[1] * DEG, rootRot[0] * DEG), 0, 0, 0);
        ps.scale(rootScale[0], rootScale[1], rootScale[2]);
        ps.translate(pelvisPos[0] / 16f, pelvisPos[1] / 16f, pelvisPos[2] / 16f);
        if (nonZero(pelvisRot)) ps.rotateAround(new Quaternionf().rotationZYX(pelvisRot[2] * DEG, pelvisRot[1] * DEG, pelvisRot[0] * DEG), 0, GOLEM_HIPS, 0);
    }

    /** The quadruped model hooks: the reaction pose now, or after Entity Model Features' animation of the model. */
    public static void fromModelHook(Model<?> model, net.minecraft.client.renderer.entity.state.LivingEntityRenderState state) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (io.github.profetgit.mobreactions.compat.Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }

    /** Applies the pose to a model of any rig (the model hooks, and compat.Emf after an EMF animation). */
    public void apply(Model<?> model) {
        if (model instanceof HumanoidModel<?> h) applyParts(h);
        else if (rig == Rig.QUADRUPED) applyQuadruped(model);
        else if (rig == Rig.PET) applyPet(model);
        else if (rig == Rig.GOLEM) applyGolem(model);
        else if (rig == Rig.SPIDER) applySpider(model);
        else if (rig == Rig.CREEPER) applyCreeper(model);
        else applyVillager(model);
    }

    /** Quadrupeds: head and legs on top of vanilla's pose (its walk scaled by the walk track); the body moves with the root. */
    void applyQuadruped(Model<?> m) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart head = kids.get("head");
        ModelPart[] legs = {kids.get("right_hind_leg"), kids.get("left_hind_leg"), kids.get("right_front_leg"), kids.get("left_front_leg")};
        float[][] keys = {legHR, legHL, legFR, legFL};
        applied++;
        if (head != null) {
            if (calm > 0) {
                float keep = 1 - calm;
                head.xRot *= keep;
                head.yRot *= keep;
                head.zRot *= keep;
            }
            add(head, headRot);
            head.x -= headPos[0];
            head.y -= headPos[1];
            head.z += headPos[2];
        }
        if (emf) {
            applyQuadrupedPack(m, kids, legs, keys);
            return;
        }
        for (int i = 0; i < 4; i++) {
            if (legs[i] == null) continue;
            legs[i].xRot *= walk;
            add(legs[i], keys[i]);
        }
    }

    /**
     * Quadrupeds under a model pack (see Neutral): body and legs eased from the pack's pose (its own jump, fall and hurt
     * poses included) to its calm standing pose by the walk track, then the keyed leg turns about each leg's real hip
     * (the top of its boxes; Fresh Animations pivots a cow's legs at the hoof).
     */
    private void applyQuadrupedPack(Model<?> m, Map<String, ModelPart> kids, ModelPart[] legs, float[][] keys) {
        float[][] calmPose = Neutral.of(m.root());
        float k = 1 - Math.min(1, walk);
        if (calmPose != null && k > 0) {
            for (int i = 0; i < Neutral.PARTS.length; i++) {
                ModelPart p = kids.get(Neutral.PARTS[i]);
                if (p == null) continue;
                float[] n = calmPose[i];
                p.x += (n[0] - p.x) * k;
                p.y += (n[1] - p.y) * k;
                p.z += (n[2] - p.z) * k;
                p.xRot += (n[3] - p.xRot) * k;
                p.yRot += (n[4] - p.yRot) * k;
                p.zRot += (n[5] - p.zRot) * k;
            }
        }
        for (int i = 0; i < 4; i++) {
            ModelPart leg = legs[i];
            if (leg == null) continue;
            if (calmPose == null) leg.xRot *= walk;
            joint(leg, jointR);
            inModel(leg, jointR, pinA);
            add(leg, keys[i]);
            inModel(leg, jointR, pinB);
            leg.x += pinA.x - pinB.x;
            leg.y += pinA.y - pinB.y;
            leg.z += pinA.z - pinB.z;
        }
        if (PROBE) probeQuad(kids, legs);
    }

    /**
     * Iron golems: legs (vanilla's walk scaled by the walk track) and head on top of vanilla's pose; the arms rest hanging
     * during a reaction (vanilla swings them when it walks and throws them up when it attacks) and turn about the shoulders
     * (vanilla pivots them at the body's centre, which is only right for xRot); the torso then bends body, head and arms at
     * the waist.
     */
    void applyGolem(Model<?> m) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart head = kids.get("head"), body = kids.get("body"), rightArm = kids.get("right_arm"), leftArm = kids.get("left_arm");
        ModelPart rightLeg = kids.get("right_leg"), leftLeg = kids.get("left_leg");
        if (head == null || body == null || rightArm == null || leftArm == null || rightLeg == null || leftLeg == null) return;
        applied++;
        if (calm > 0) {
            float keep = 1 - calm;
            head.xRot *= keep;
            head.yRot *= keep;
            head.zRot *= keep;
        }
        float arms = Math.max(calm, armCalm);
        if (arms > 0) {
            rest(rightArm, 0, 0, arms);
            rest(leftArm, 0, 0, arms);
        }
        // Fresh Animations puts both legs under the right_leg part (right_leg2, left_leg2) and leaves left_leg empty, so the
        // leg keys go to the two lower parts, which hang from the hips
        ModelPart rightLeg2 = emf ? io.github.profetgit.mobreactions.compat.Emf.part(m.root(), "right_leg2") : null;
        ModelPart leftLeg2 = emf ? io.github.profetgit.mobreactions.compat.Emf.part(m.root(), "left_leg2") : null;
        float waistY = GOLEM_WAIST;
        if (rightLeg2 != null && leftLeg2 != null) {
            // these pivot at the foot with the box 16 px above it, so they turn about their hip joints; the torso bends
            // about the hips (Fresh Animations' body sits at hip height, not at vanilla's waist)
            joint(rightLeg2, jointR);
            inModel(rightLeg2, jointR, pinA);
            waistY = pinA.y;
            legAbout(rightLeg2, legR);
            legAbout(leftLeg2, legL);
        } else {
            rightLeg.xRot *= walk;
            leftLeg.xRot *= walk;
            add(rightLeg, legR);
            add(leftLeg, legL);
        }
        add(head, headRot);
        head.x -= headPos[0];
        head.y -= headPos[1];
        head.z += headPos[2];
        // Fresh Animations draws the golem's head and arms as parts of its own under the body (head2, right_arm2,
        // left_arm2), which the vanilla parts' keys don't reach: they get the same turns about their own pivots
        ModelPart head2 = emf ? io.github.profetgit.mobreactions.compat.Emf.part(m.root(), "head2") : null;
        if (head2 != null) add(head2, headRot);
        ModelPart arm2 = emf ? io.github.profetgit.mobreactions.compat.Emf.part(m.root(), "right_arm2") : null;
        // its arms carry the pack's own pose (driven from the vanilla arms): they hang like the vanilla ones first
        if (arm2 != null && arms > 0) rest(arm2, 0, 0, arms);
        if (arm2 != null && nonZero(armR)) {
            torso.rotationZYX(armR[2] * DEG, -armR[1] * DEG, -armR[0] * DEG);
            about(arm2, arm2.x, arm2.y, arm2.z);
        }
        arm2 = emf ? io.github.profetgit.mobreactions.compat.Emf.part(m.root(), "left_arm2") : null;
        if (arm2 != null && arms > 0) rest(arm2, 0, 0, arms);
        if (arm2 != null && nonZero(armL)) {
            torso.rotationZYX(armL[2] * DEG, -armL[1] * DEG, -armL[0] * DEG);
            about(arm2, arm2.x, arm2.y, arm2.z);
        }
        if (nonZero(armR)) {
            torso.rotationZYX(armR[2] * DEG, -armR[1] * DEG, -armR[0] * DEG);
            about(rightArm, -GOLEM_SHOULDER_X, GOLEM_SHOULDER_Y, 0);
        }
        if (nonZero(armL)) {
            torso.rotationZYX(armL[2] * DEG, -armL[1] * DEG, -armL[0] * DEG);
            about(leftArm, GOLEM_SHOULDER_X, GOLEM_SHOULDER_Y, 0);
        }
        if (nonZero(torsoRot)) {
            torso.rotationZYX(torsoRot[2] * DEG, -torsoRot[1] * DEG, -torsoRot[0] * DEG);
            about(body, 0, waistY, 0);
            about(head, 0, waistY, 0);
            about(rightArm, 0, waistY, 0);
            about(leftArm, 0, waistY, 0);
        }
    }

    /** Turns a leg part about its hip joint (the top of its box) by the clip's leg units. */
    private void legAbout(ModelPart leg, float[] deg) {
        if (!nonZero(deg)) return;
        joint(leg, jointL);
        inModel(leg, jointL, pinB);
        torso.rotationZYX(deg[2] * DEG, -deg[1] * DEG, -deg[0] * DEG);
        about(leg, pinB.x, pinB.y, pinB.z);
    }

    /**
     * Pets: head and legs as the quadrupeds', plus the tail. The wolf's tail hangs off the root, the fox's off its body
     * (turned 90° about x, so a wag is a turn about the body's z), and a cat's is two root parts that vanilla places one
     * after the other: both turn together about the first one's pivot.
     */
    void applyPet(Model<?> m) {
        applyQuadruped(m);
        if (!nonZero(tail)) return;
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart t1 = kids.get("tail1"), t2 = kids.get("tail2");
        if (t1 != null) {
            torso.rotationZYX(tail[2] * DEG, -tail[1] * DEG, -tail[0] * DEG);
            float x = t1.x, y = t1.y, z = t1.z;
            about(t1, x, y, z);
            if (t2 != null) about(t2, x, y, z);
            return;
        }
        ModelPart t = kids.get("tail");
        if (t != null) {
            add(t, tail);
            return;
        }
        ModelPart body = kids.get("body");
        ModelPart fox = body == null ? null : ((ModelPartAccessor) (Object) body).mobreactions$children().get("tail");
        if (fox != null) {
            fox.xRot -= tail[0] * DEG;
            fox.zRot += tail[1] * DEG;
        }
    }

    /**
     * Spiders: head, abdomen and legs on top of vanilla's pose. The legs' walk (vanilla swings and steps them around their
     * splayed rest) is scaled by the walk track; the abdomen turns about its joint with the neck.
     */
    void applySpider(Model<?> m) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart head = kids.get("head"), body1 = kids.get("body1");
        applied++;
        if (head != null) {
            if (calm > 0) {
                float keep = 1 - calm;
                head.xRot *= keep;
                head.yRot *= keep;
                head.zRot *= keep;
            }
            add(head, headRot);
            head.x -= headPos[0];
            head.y -= headPos[1];
            head.z += headPos[2];
        }
        if (body1 != null && nonZero(abdomen)) {
            Arachnid a = Arachnid.of(m);
            torso.rotationZYX(abdomen[2] * DEG, -abdomen[1] * DEG, -abdomen[0] * DEG);
            about(body1, 0, 24 - a.centre(), a.joint());
        }
        for (int i = 0; i < 8; i++) {
            ModelPart leg = kids.get(Arachnid.LEGS[i]);
            if (leg == null) continue;
            if (!emf && walk != 1) {
                net.minecraft.client.model.geom.PartPose rest = leg.getInitialPose();
                leg.yRot = rest.yRot() + (leg.yRot - rest.yRot()) * walk;
                leg.zRot = rest.zRot() + (leg.zRot - rest.zRot()) * walk;
            }
            // Fresh Animations pivots a leg part at the leg's outer tip (the box hangs off it by 16 px toward the body), so the
            // turns and the curl's shrink go about the leg's inner joint, which is pinned in place
            boolean joint = emf && legJoint(leg, i < 4, jointR);
            if (joint) inScaled(leg, jointR, pinA);
            add(leg, legs8[i]);
            leg.xScale *= legScale8[i][0];
            leg.yScale *= legScale8[i][1];
            leg.zScale *= legScale8[i][2];
            if (joint) {
                inScaled(leg, jointR, pinB);
                leg.x += pinA.x - pinB.x;
                leg.y += pinA.y - pinB.y;
                leg.z += pinA.z - pinB.z;
            }
        }
    }

    /**
     * A spider leg's inner joint in its own frame, from its visible boxes: the box end nearest the body (a right leg's boxes
     * lie along -x from the joint, a left leg's along +x). False when the part has no box, or its box already starts at the
     * pivot (vanilla's legs: the origin is the joint).
     */
    private static boolean legJoint(ModelPart leg, boolean right, Vector3f out) {
        float[] b = {Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE};
        extents(leg, 0, 0, 0, b);
        if (b[0] > b[1]) return false;
        float x = right ? b[1] : b[0];
        if (Math.abs(x) < 2.5F) return false;
        out.set(x, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2);
        return true;
    }

    /** Grows {minX, maxX, minY, maxY, minZ, maxZ} by the visible boxes under p, offset by (ox, oy, oz). */
    private static void extents(ModelPart p, float ox, float oy, float oz, float[] b) {
        if (!p.visible) return;
        if (!p.skipDraw) {
            for (ModelPart.Cube c : ((ModelPartAccessor) (Object) p).mobreactions$cubes()) {
                b[0] = Math.min(b[0], ox + c.minX);
                b[1] = Math.max(b[1], ox + c.maxX);
                b[2] = Math.min(b[2], oy + c.minY);
                b[3] = Math.max(b[3], oy + c.maxY);
                b[4] = Math.min(b[4], oz + c.minZ);
                b[5] = Math.max(b[5], oz + c.maxZ);
            }
        }
        for (ModelPart c : ((ModelPartAccessor) (Object) p).mobreactions$children().values()) extents(c, ox + c.x, oy + c.y, oz + c.z, b);
    }

    /** A point in a part's frame (px) in its parent's frame: scaled, turned and moved like the part is drawn. */
    private void inScaled(ModelPart p, Vector3f local, Vector3f out) {
        pinM.rotationZYX(p.zRot, p.yRot, p.xRot).transform(local.x * p.xScale, local.y * p.yScale, local.z * p.zScale, out);
        out.add(p.x, p.y, p.z);
    }

    /**
     * Creepers: legs (vanilla's walk scaled by the walk track) and head on top of vanilla's pose; the torso then bends body
     * and head at the hips, the legs staying planted. Parts by name: the model's fields swap left and right.
     */
    void applyCreeper(Model<?> m) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart head = kids.get("head"), body = kids.get("body");
        ModelPart[] legs = {kids.get("right_hind_leg"), kids.get("left_hind_leg"), kids.get("right_front_leg"), kids.get("left_front_leg")};
        float[][] keys = {legHR, legHL, legFR, legFL};
        applied++;
        for (int i = 0; i < 4; i++) {
            if (legs[i] == null) continue;
            legs[i].xRot *= walk;
            add(legs[i], keys[i]);
        }
        if (head != null) {
            if (calm > 0) {
                float keep = 1 - calm;
                head.xRot *= keep;
                head.yRot *= keep;
                head.zRot *= keep;
            }
            add(head, headRot);
            head.x -= headPos[0];
            head.y -= headPos[1];
            head.z += headPos[2];
        }
        if (nonZero(torsoRot)) {
            torso.rotationZYX(torsoRot[2] * DEG, -torsoRot[1] * DEG, -torsoRot[0] * DEG);
            if (body != null) about(body, 0, CREEPER_WAIST, 0);
            if (head != null) about(head, 0, CREEPER_WAIST, 0);
        }
    }

    /** Turns a part by {@link #torso} about a point in model space (px), on top of its own rotation. */
    private void about(ModelPart p, float jx, float jy, float jz) {
        vec.set(p.x - jx, p.y - jy, p.z - jz);
        torso.transform(vec);
        p.x = vec.x + jx;
        p.y = vec.y + jy;
        p.z = vec.z + jz;
        part.rotationZYX(p.zRot, p.yRot, p.xRot);
        torso.mul(part, part);
        part.getEulerAnglesZYX(vec);
        p.xRot = vec.x;
        p.yRot = vec.y;
        p.zRot = vec.z;
    }

    /** Adds the reaction to the parts vanilla posed; the torso then carries body, head and arms about the waist. */
    public void applyParts(HumanoidModel<?> m) {
        applied++;
        Biped b = Biped.of(m);
        if (emf) holdLegs(m.body, m.rightLeg, m.leftLeg);
        if (calm > 0) {
            float keep = 1 - calm;
            m.head.xRot *= keep;
            m.head.yRot *= keep;
            m.head.zRot *= keep;
            m.body.yRot *= keep;
        }
        float arms = Math.max(calm, armCalm);
        boolean ender = rig == Rig.ENDERMAN, hold = ender && carrying && !dead;
        if (ender && dead) closeJaw(m);
        if (arms > 0) {
            if (ender) {
                // its arms hang; a carrying enderman's hold the block out in front
                rest(m.rightArm, hold ? CARRY_X : 0, 0, arms);
                rest(m.leftArm, hold ? CARRY_X : 0, 0, arms);
                if (hold) {
                    m.rightArm.zRot += CARRY_Z * arms;
                    m.leftArm.zRot -= CARRY_Z * arms;
                }
            } else {
                rest(m.rightArm, ARM_X, -ARM_Y, arms);
                rest(m.leftArm, ARM_X, ARM_Y, arms);
            }
        }
        m.rightLeg.xRot *= walk;
        m.leftLeg.xRot *= walk;
        if (emf && walk < 1) {
            relax(m.rightLeg, walk);
            relax(m.leftLeg, walk);
        }
        add(m.rightLeg, legR);
        add(m.leftLeg, legL);
        add(m.head, headRot);
        m.head.x -= headPos[0] * b.scale(rig);
        m.head.y -= headPos[1] * b.scale(rig);
        m.head.z += headPos[2] * b.scale(rig);
        if (hold) {
            // both hands stay on the block: the pair only swings forward and back, by the arms' mean raise
            float raise = carryRaise();
            m.rightArm.xRot -= raise * DEG;
            m.leftArm.xRot -= raise * DEG;
        } else {
            add(m.rightArm, armR);
            add(m.leftArm, armL);
        }
        // surprised: the head lifts off its jaw, like an angry enderman's (Fresh Animations has a jaw part of its own)
        if (ender && face == 3 && !creepy && !emf) {
            m.head.y -= JAW;
            m.hat.y += JAW;
        }
        if (nonZero(torsoRot)) {
            torso.rotationZYX(torsoRot[2] * DEG, -torsoRot[1] * DEG, -torsoRot[0] * DEG);
            about(m.body, 0, b.hips(), 0);
            about(m.head, 0, b.hips(), 0);
            about(m.rightArm, 0, b.hips(), 0);
            about(m.leftArm, 0, b.hips(), 0);
        }
        if (emf) {
            pinLeg(m.body, m.rightLeg, hipR, jointR);
            pinLeg(m.body, m.leftLeg, hipL, jointL);
        }
        if (PROBE) probe(m.body, m.rightLeg, m.leftLeg, b);
    }

    /**
     * A dying enderman closes its mouth. Angry, it lifts its head off the jaw (vanilla 5 px; Fresh Animations' scream
     * moves its head2 part up to ~6 px off its jaw part): standing that reads as a scream, but lying on its back the gap
     * points away from the neck and the head looked detached. Vanilla's lift is undone (the jaw, `hat`, is a child of the
     * head and was pushed back down by as much); the pack's own head parts go back to their rest pose, which EMF reports
     * correctly for a pack's own parts.
     */
    private void closeJaw(HumanoidModel<?> m) {
        if (!emf) {
            if (creepy) {
                m.head.y += CREEPY_LIFT;
                m.hat.y -= CREEPY_LIFT;
            }
            return;
        }
        for (String id : new String[] {"head2", "jaw"}) {
            ModelPart p = io.github.profetgit.mobreactions.compat.Emf.part(m.hat, id);
            if (p == null) p = io.github.profetgit.mobreactions.compat.Emf.part(m.head, id);
            if (p != null) p.resetPose();
        }
    }

    private float carryRaise() {
        return (armR[0] + armL[0]) / 2;
    }

    /**
     * An enderman's carried block (CarriedBlockLayer draws it in the model's space, in front of the hands) follows the arms:
     * turned about the shoulders by their raise, then with the torso about the hips.
     */
    public void carry(PoseStack ps, Model<?> model) {
        float hips = Biped.of(model).hips();
        if (nonZero(torsoRot)) {
            ps.rotateAround(new Quaternionf().rotationZYX(torsoRot[2] * DEG, -torsoRot[1] * DEG, -torsoRot[0] * DEG), 0, hips / 16f, 0);
        }
        float raise = carryRaise();
        if (raise != 0) ps.rotateAround(new Quaternionf().rotationX(-raise * DEG), 0, ENDER_SHOULDER / 16f, 0);
    }

    /**
     * The villager-like rig: parts found by name under the root (vanilla's, or Entity Model Features' parts of the same
     * names). Illagers' separate arms are keyed as absolute poses from hanging straight down; while vanilla wants its
     * crossed arms they're shown instead until the clip's cross key. The crossed-arms part moves as one piece.
     */
    void applyVillager(Model<?> m) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) m.root()).mobreactions$children();
        ModelPart head = kids.get("head"), body = kids.get("body"), arms = kids.get("arms"), rightLeg = kids.get("right_leg"), leftLeg = kids.get("left_leg");
        ModelPart rightArm = kids.get("right_arm"), leftArm = kids.get("left_arm");
        if (head == null || body == null || rightLeg == null || leftLeg == null) return;
        applied++;
        Biped b = Biped.of(m);
        if (emf) holdLegs(body, rightLeg, leftLeg);
        // the baby villager's jacket is a part of its own at the root (the adult's hangs off the body)
        ModelPart jacket = kids.get("bb_main");
        if (calm > 0) {
            float keep = 1 - calm;
            head.xRot *= keep;
            head.yRot *= keep;
            head.zRot *= keep;
            body.yRot *= keep;
        }
        armsApart = false;
        if (rightArm != null && leftArm != null && (!crossedVanilla || cross < 0.5F)) {
            float w = crossedVanilla ? 1 : Math.max(calm, armCalm);
            if (w > 0) {
                rest(rightArm, 0, 0, w);
                rest(leftArm, 0, 0, w);
            }
            add(rightArm, armR);
            add(leftArm, armL);
            if (crossedVanilla) {
                rightArm.visible = true;
                leftArm.visible = true;
                if (arms != null) arms.visible = false;
                armsApart = true;
            }
        }
        if (arms != null && arms.visible) {
            add(arms, armsRot);
            arms.x -= armsPos[0] * b.scale(rig);
            arms.y -= armsPos[1] * b.scale(rig);
            arms.z += armsPos[2] * b.scale(rig);
        }
        rightLeg.xRot *= walk;
        leftLeg.xRot *= walk;
        if (emf && walk < 1) {
            relax(rightLeg, walk);
            relax(leftLeg, walk);
        }
        add(rightLeg, legR);
        add(leftLeg, legL);
        add(head, headRot);
        head.x -= headPos[0] * b.scale(rig);
        head.y -= headPos[1] * b.scale(rig);
        head.z += headPos[2] * b.scale(rig);
        if (nonZero(torsoRot)) {
            torso.rotationZYX(torsoRot[2] * DEG, -torsoRot[1] * DEG, -torsoRot[0] * DEG);
            about(body, 0, b.hips(), 0);
            about(head, 0, b.hips(), 0);
            if (jacket != null) about(jacket, 0, b.hips(), 0);
            if (arms != null) about(arms, 0, b.hips(), 0);
            if (rightArm != null) about(rightArm, 0, b.hips(), 0);
            if (leftArm != null) about(leftArm, 0, b.hips(), 0);
        }
        if (emf) {
            pinLeg(body, rightLeg, hipR, jointR);
            pinLeg(body, leftLeg, hipL, jointL);
        }
        if (PROBE) probe(body, rightLeg, leftLeg, b);
    }

    private final Matrix3f pinM = new Matrix3f();
    private final Vector3f pinA = new Vector3f(), pinB = new Vector3f(), anat = new Vector3f();
    /** Each leg's hip joint in its own part's frame, and the point in the body's frame it's pinned to this frame. */
    private final Vector3f jointR = new Vector3f(), jointL = new Vector3f(), hipR = new Vector3f(), hipL = new Vector3f();

    /**
     * Under Entity Model Features the pack owns the rig, and Fresh Animations' differs from vanilla's: an illager's leg
     * part pivots at the foot with its box on a grandchild 12 px up, EMF still reports vanilla's rest pose for the part
     * (hip height), and the pack moves body and legs itself every frame, its own hurt animation letting the hips drift
     * up to 6 px off the body. The reaction turns the leg part about its pivot and bends the torso about the hips,
     * which pulled the legs off the body mid-air. So before the reaction touches anything, find each leg's real hip
     * joint from its boxes and the anatomical hip on the body (vanilla's rest pose: the leg's pivot in the body's
     * frame), eased toward where the pack holds it as the walk track comes back; pinLeg puts the joint there afterwards.
     */
    private void holdLegs(ModelPart body, ModelPart rightLeg, ModelPart leftLeg) {
        holdLeg(body, rightLeg, jointR, hipR);
        holdLeg(body, leftLeg, jointL, hipL);
    }

    private void holdLeg(ModelPart body, ModelPart leg, Vector3f joint, Vector3f hip) {
        joint(leg, joint);
        inModel(leg, joint, hip);
        hip.sub(body.x, body.y, body.z);
        pinM.rotationZYX(body.zRot, body.yRot, body.xRot).transpose().transform(hip);
        var br = body.getInitialPose();
        var lr = leg.getInitialPose();
        anat.set(lr.x() - br.x(), lr.y() - br.y(), lr.z() - br.z());
        pinM.rotationZYX(br.zRot(), br.yRot(), br.xRot()).transpose().transform(anat);
        anat.lerp(hip, Math.min(1, walk), hip);
    }

    /** Moves the leg so its hip joint is back where the body (as posed now) holds it. */
    private void pinLeg(ModelPart body, ModelPart leg, Vector3f hip, Vector3f joint) {
        pinM.rotationZYX(body.zRot, body.yRot, body.xRot).transform(hip, pinA);
        pinA.add(body.x, body.y, body.z);
        inModel(leg, joint, pinB);
        leg.x += pinA.x - pinB.x;
        leg.y += pinA.y - pinB.y;
        leg.z += pinA.z - pinB.z;
    }

    /**
     * The pack's own parts under a leg (Fresh Animations' lower leg, which kicks up to ~40° in its hurt animation, on
     * top of the reaction's keys) are scaled back to rest by the walk track, like the leg part's own swing.
     */
    private static void relax(ModelPart leg, float w) {
        for (ModelPart c : ((ModelPartAccessor) (Object) leg).mobreactions$children().values()) {
            c.xRot *= w;
            c.yRot *= w;
            c.zRot *= w;
            relax(c, w);
        }
    }

    /** A point in a part's frame (px), in the model's frame. */
    private void inModel(ModelPart p, Vector3f local, Vector3f out) {
        pinM.rotationZYX(p.zRot, p.yRot, p.xRot).transform(local, out);
        out.add(p.x, p.y, p.z);
    }

    /**
     * A leg's hip joint in its own frame: the top centre of every visible box under it, placed by the parts' positions
     * (their turns are left out: a part such as Fresh Animations' lower leg turns about this very point). Vanilla legs
     * give their own pivot.
     */
    static void joint(ModelPart leg, Vector3f out) {
        float[] box = {Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE};
        bounds(leg, 0, 0, 0, box, true);
        if (box[0] > box[1]) out.zero();
        else out.set((box[0] + box[1]) / 2, box[2], (box[3] + box[4]) / 2);
    }

    /** Grows {minX, maxX, minY, minZ, maxZ} by the visible boxes under p, offset by (ox, oy, oz). */
    private static void bounds(ModelPart p, float ox, float oy, float oz, float[] box, boolean root) {
        if (!p.visible) return;
        if (!p.skipDraw) {
            for (ModelPart.Cube c : ((ModelPartAccessor) (Object) p).mobreactions$cubes()) {
                box[0] = Math.min(box[0], ox + c.minX);
                box[1] = Math.max(box[1], ox + c.maxX);
                box[2] = Math.min(box[2], oy + c.minY);
                box[3] = Math.min(box[3], oz + c.minZ);
                box[4] = Math.max(box[4], oz + c.maxZ);
            }
        }
        for (ModelPart c : ((ModelPartAccessor) (Object) p).mobreactions$children().values()) bounds(c, ox + c.x, oy + c.y, oz + c.z, box, false);
    }

    /** Dev probe (-Dmobreactions.joints=true): each leg's hip joint in the body's frame, per frame. Attached = constant. */
    private static final boolean PROBE = Boolean.getBoolean("mobreactions.joints");
    private static int probed;

    /** Dev probe for quadrupeds: each leg's hip joint in the body's frame (attached = constant). */
    private void probeQuad(Map<String, ModelPart> kids, ModelPart[] legs) {
        ModelPart body = kids.get("body");
        StringBuilder sb = new StringBuilder("[mrjoint-quad] ").append(System.nanoTime()).append(" walk=").append(walk);
        Matrix3f inv = new Matrix3f().rotationZYX(body.zRot, body.yRot, body.xRot).transpose();
        Vector3f j = new Vector3f(), w = new Vector3f();
        for (ModelPart leg : legs) {
            if (leg == null) continue;
            joint(leg, j);
            inModel(leg, j, w);
            inv.transform(w.sub(body.x, body.y, body.z));
            sb.append(String.format(java.util.Locale.ROOT, " %.2f,%.2f,%.2f", w.x, w.y, w.z));
        }
        sb.append(String.format(java.util.Locale.ROOT, " body=%.2f,%.2f,%.2f r=%.1f,%.1f,%.1f", body.x, body.y, body.z,
            Math.toDegrees(body.xRot), Math.toDegrees(body.yRot), Math.toDegrees(body.zRot)));
        System.out.println(sb);
    }

    private static void dump(String name, ModelPart p, int depth) {
        StringBuilder c = new StringBuilder();
        for (ModelPart.Cube q : ((ModelPartAccessor) (Object) p).mobreactions$cubes())
            c.append(String.format(java.util.Locale.ROOT, " [%.1f..%.1f %.1f..%.1f %.1f..%.1f]", q.minX, q.maxX, q.minY, q.maxY, q.minZ, q.maxZ));
        System.out.printf(java.util.Locale.ROOT, "[mrjoint-init] %s%s at %.2f,%.2f,%.2f rot %.1f,%.1f,%.1f vis=%b skip=%b%s%n", "  ".repeat(depth), name, p.x, p.y, p.z,
            Math.toDegrees(p.xRot), Math.toDegrees(p.yRot), Math.toDegrees(p.zRot), p.visible, p.skipDraw, c);
        if (depth < 3) for (var e : ((ModelPartAccessor) (Object) p).mobreactions$children().entrySet()) dump(e.getKey(), e.getValue(), depth + 1);
    }

    private void probe(ModelPart body, ModelPart rightLeg, ModelPart leftLeg, Biped b) {
        Vector3f jr = new Vector3f(), jl = new Vector3f(), r = new Vector3f(), l = new Vector3f();
        joint(rightLeg, jr);
        joint(leftLeg, jl);
        inModel(rightLeg, jr, r);
        inModel(leftLeg, jl, l);
        Matrix3f inv = new Matrix3f().rotationZYX(body.zRot, body.yRot, body.xRot).transpose();
        inv.transform(r.sub(body.x, body.y, body.z));
        inv.transform(l.sub(body.x, body.y, body.z));
        System.out.printf(java.util.Locale.ROOT, "[mrjoint] %d emf=%b hips=%.2f legY=%.2f jointR=%.2f,%.2f,%.2f R=%.2f,%.2f,%.2f L=%.2f,%.2f,%.2f legR=%.1f,%.1f,%.1f held=%.2f,%.2f,%.2f%n",
            System.nanoTime(), emf, b.hips(), rightLeg.y, jr.x, jr.y, jr.z, r.x, r.y, r.z, l.x, l.y, l.z,
            Math.toDegrees(rightLeg.xRot), Math.toDegrees(rightLeg.yRot), Math.toDegrees(rightLeg.zRot), hipR.x, hipR.y, hipR.z);
        if (probed++ % 60 == 0) {
            var bi = body.getInitialPose();
            var li = rightLeg.getInitialPose();
            System.out.printf(java.util.Locale.ROOT, "[mrjoint-init] body=%.2f,%.2f,%.2f r=%.1f,%.1f,%.1f leg=%.2f,%.2f,%.2f cubes=%d kids=%s%n", bi.x(), bi.y(), bi.z(),
                Math.toDegrees(bi.xRot()), Math.toDegrees(bi.yRot()), Math.toDegrees(bi.zRot()), li.x(), li.y(), li.z(),
                ((ModelPartAccessor) (Object) body).mobreactions$cubes().size(), ((ModelPartAccessor) (Object) rightLeg).mobreactions$children().keySet());
            for (ModelPart.Cube c : ((ModelPartAccessor) (Object) body).mobreactions$cubes())
                System.out.printf(java.util.Locale.ROOT, "[mrjoint-init]   body cube %.1f..%.1f %.1f..%.1f %.1f..%.1f%n", c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ);
            dump("leg", rightLeg, 0);
            dump("body", body, 0);
        }
    }

    private static void rest(ModelPart p, float xRot, float yRot, float w) {
        p.xRot += (xRot - p.xRot) * w;
        p.yRot += (yRot - p.yRot) * w;
        p.zRot -= p.zRot * w;
    }

    private static void add(ModelPart p, float[] deg) {
        p.xRot -= deg[0] * DEG;
        p.yRot -= deg[1] * DEG;
        p.zRot += deg[2] * DEG;
    }

    private static boolean nonZero(float[] v) {
        return v[0] != 0 || v[1] != 0 || v[2] != 0;
    }
}
