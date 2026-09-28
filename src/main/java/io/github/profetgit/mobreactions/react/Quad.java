package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import org.joml.Matrix3f;
import org.joml.Vector3f;

/**
 * The quadruped and pet rigs' per-model proportions, measured once from the model's rest geometry (the renderer's current
 * model: cows and pigs switch models per variant). The quadruped clips are keyed on the cow, the pet clips on the wolf;
 * these move their pivots and scale their positions to the pig, sheep, goat, panda and polar bear, and to the fox, the
 * cat, the ocelot and every baby.
 * All values are px in Blockbench space (y up from the feet, z toward the tail).
 */
record Quad(float belly, float halfWidth, float zc) {
    /** The cow the clips are keyed on: belly 12 px above the ground, flanks at ±6, legs centred on z = 1. */
    static final Quad COW = new Quad(12, 6, 1);
    /** The wolf the pet clips are keyed on: its body's lowest point is 7 px up. */
    private static final float WOLF_BELLY = 7;
    static final String[] LEGS = {"right_hind_leg", "left_hind_leg", "right_front_leg", "left_front_leg"};
    private static final Map<Model<?>, Quad> CACHE = new WeakHashMap<>();

    static Quad of(Model<?> model) {
        if (model == null) return COW;
        return CACHE.computeIfAbsent(model, Quad::measure);
    }

    /**
     * belly: the lowest point of the body part; halfWidth: the widest point of body and legs (the edge it tips over on
     * lying down, which then rests the flank on the ground); zc: halfway between the front and hind leg pivots.
     */
    private static Quad measure(Model<?> model) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) model.root()).mobreactions$children();
        ModelPart body = kids.get("body");
        if (body == null) return COW;
        float[] b = bounds(body);
        if (b == null) return COW;
        float halfWidth = Math.max(Math.abs(b[0]), Math.abs(b[1])), zFront = 0, zHind = 0;
        int legs = 0;
        for (String name : LEGS) {
            ModelPart leg = kids.get(name);
            if (leg == null) continue;
            float[] l = bounds(leg);
            if (l != null) halfWidth = Math.max(halfWidth, Math.max(Math.abs(l[0]), Math.abs(l[1])));
            if (name.contains("front")) zFront += leg.getInitialPose().z();
            else zHind += leg.getInitialPose().z();
            legs++;
        }
        float belly = 24 - b[3];
        float zc = legs == 4 ? (zFront + zHind) / 4 : COW.zc;
        return belly > 0.5F ? new Quad(belly, halfWidth, zc) : COW;
    }

    /** Belly height over the belly of the model the rig's clips were keyed on. */
    float scale(Rig rig) {
        return belly / (rig == Rig.PET ? WOLF_BELLY : COW.belly);
    }

    /** The part's cubes at its rest pose in model space (px): {minX, maxX, minY, maxY}, or null without cubes. */
    private static float[] bounds(ModelPart p) {
        java.util.List<ModelPart.Cube> cubes = ((ModelPartAccessor) (Object) p).mobreactions$cubes();
        if (cubes.isEmpty()) return null;
        PartPose pose = p.getInitialPose();
        Matrix3f rot = new Matrix3f().rotationZYX(pose.zRot(), pose.yRot(), pose.xRot());
        Vector3f v = new Vector3f();
        float[] out = {Float.MAX_VALUE, -Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE};
        for (ModelPart.Cube c : cubes) {
            for (int i = 0; i < 8; i++) {
                v.set((i & 1) == 0 ? c.minX : c.maxX, (i & 2) == 0 ? c.minY : c.maxY, (i & 4) == 0 ? c.minZ : c.maxZ);
                v.mul(pose.xScale(), pose.yScale(), pose.zScale());
                rot.transform(v);
                float x = v.x + pose.x(), y = v.y + pose.y();
                out[0] = Math.min(out[0], x);
                out[1] = Math.max(out[1], x);
                out[2] = Math.min(out[2], y);
                out[3] = Math.max(out[3], y);
            }
        }
        return out;
    }
}
