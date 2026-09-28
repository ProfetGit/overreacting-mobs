package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.LivingEntity;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * A quadruped's standing pose as a model pack (Entity Model Features, e.g. Fresh Animations) draws it, per model root.
 * The pack re-rigs the animal (Fresh Animations' cow legs pivot at the hoof, its body is a part of its own with the box
 * on a turned child) and layers its own jump, fall and hurt poses on top of a reaction: the body tipped up to 45° in
 * the air and the legs swung about their hooves, off the body. So while an animal stands calm and unhurt, the pack's
 * pose of body and legs is kept here; a reaction eases body and legs to it (Pose.applyQuadruped) and turns the legs about
 * their real hips. The drawn proportions measured from it replace the rest-pose measurement, which can't see the
 * pack's parts (Quad).
 */
public final class Neutral {
    static final String[] PARTS = {"body", "right_hind_leg", "left_hind_leg", "right_front_leg", "left_front_leg"};
    private static final Map<ModelPart, float[][]> POSES = new WeakHashMap<>();
    private static final Map<ModelPart, Quad> MEASURED = new WeakHashMap<>();

    private Neutral() {
    }

    /** The pack finished animating this root for e, with no reaction playing. */
    public static void record(ModelPart root, LivingEntity e) {
        if (Rig.of(e) != Rig.QUADRUPED || !e.onGround() || e.hurtTime > 0 || e.walkAnimation.speed() > 0.02F || !e.isAlive()) return;
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) root).mobreactions$children();
        float[][] pose = new float[PARTS.length][];
        for (int i = 0; i < PARTS.length; i++) {
            ModelPart p = kids.get(PARTS[i]);
            if (p == null) return;
            pose[i] = new float[] {p.x, p.y, p.z, p.xRot, p.yRot, p.zRot};
        }
        boolean first = !POSES.containsKey(root);
        POSES.put(root, pose);
        if (first) MEASURED.put(root, measure(kids));
    }

    static float[][] of(ModelPart root) {
        return POSES.get(root);
    }

    static Quad quad(ModelPart root) {
        return MEASURED.get(root);
    }

    /** Belly, flank and leg centre as drawn now (the same values Quad measures from vanilla's rest pose). */
    private static Quad measure(Map<String, ModelPart> kids) {
        float[] body = new float[] {Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE};
        bounds(kids.get("body"), new Matrix4f(), body);
        if (body[0] > body[1]) return null;
        float halfWidth = Math.max(Math.abs(body[0]), Math.abs(body[1])), zFront = 0, zHind = 0;
        Vector3f j = new Vector3f();
        for (int i = 1; i < PARTS.length; i++) {
            ModelPart leg = kids.get(PARTS[i]);
            float[] l = new float[] {Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE};
            bounds(leg, new Matrix4f(), l);
            if (l[0] <= l[1]) halfWidth = Math.max(halfWidth, Math.max(Math.abs(l[0]), Math.abs(l[1])));
            Pose.joint(leg, j);
            new Matrix4f().translate(leg.x, leg.y, leg.z).rotateZYX(leg.zRot, leg.yRot, leg.xRot).transformPosition(j);
            if (PARTS[i].contains("front")) zFront += j.z;
            else zHind += j.z;
        }
        float belly = 24 - body[3];
        return belly > 0.5F ? new Quad(belly, halfWidth, (zFront + zHind) / 4) : null;
    }

    /** Grows {minX, maxX, minY, maxY} (model px) by the visible boxes under p, drawn with p's current transforms. */
    private static void bounds(ModelPart p, Matrix4f parent, float[] out) {
        if (p == null || !p.visible) return;
        Matrix4f m = new Matrix4f(parent).translate(p.x, p.y, p.z).rotateZYX(p.zRot, p.yRot, p.xRot).scale(p.xScale, p.yScale, p.zScale);
        Vector3f v = new Vector3f();
        if (!p.skipDraw) {
            for (ModelPart.Cube c : ((ModelPartAccessor) (Object) p).mobreactions$cubes()) {
                for (int i = 0; i < 8; i++) {
                    v.set((i & 1) == 0 ? c.minX : c.maxX, (i & 2) == 0 ? c.minY : c.maxY, (i & 4) == 0 ? c.minZ : c.maxZ);
                    m.transformPosition(v);
                    out[0] = Math.min(out[0], v.x);
                    out[1] = Math.max(out[1], v.x);
                    out[2] = Math.min(out[2], v.y);
                    out[3] = Math.max(out[3], v.y);
                }
            }
        }
        for (ModelPart c : ((ModelPartAccessor) (Object) p).mobreactions$children().values()) bounds(c, m, out);
    }
}
