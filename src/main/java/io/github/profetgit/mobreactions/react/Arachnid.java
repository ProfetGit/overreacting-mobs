package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;

/**
 * The spider rig's per-model proportions, measured once from the model's rest geometry (the cave spider's model is the
 * spider's baked at 0.7). The clips are keyed on the spider; these move the pivots and scale the positions.
 * All values are px in Blockbench space (y up from the feet, z toward the tail).
 */
record Arachnid(float centre, float zc, float joint, float scale) {
    /** The spider the clips are keyed on: body 9 px up, legs centred on z = 0.5, abdomen hinged at z = 3. */
    static final Arachnid SPIDER = new Arachnid(9, 0.5F, 3, 1);
    /** Front to hind, right then left: the clips' leg_r1..leg_r4, leg_l1..leg_l4. */
    static final String[] LEGS = {"right_front_leg", "right_middle_front_leg", "right_middle_hind_leg", "right_hind_leg", "left_front_leg",
        "left_middle_front_leg", "left_middle_hind_leg", "left_hind_leg"};
    private static final Map<Model<?>, Arachnid> CACHE = new WeakHashMap<>();

    static Arachnid of(Model<?> model) {
        if (model == null) return SPIDER;
        return CACHE.computeIfAbsent(model, Arachnid::measure);
    }

    /**
     * centre: the height of the neck's pivot, the middle of the body; zc: the mean of the leg pivots; joint: the front of the
     * abdomen, where it hinges on the neck.
     */
    private static Arachnid measure(Model<?> model) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) model.root()).mobreactions$children();
        ModelPart neck = kids.get("body0"), abdomen = kids.get("body1");
        if (neck == null || abdomen == null) return SPIDER;
        float centre = 24 - neck.getInitialPose().y();
        if (centre < 0.5F) return SPIDER;
        float z = 0;
        int legs = 0;
        for (String name : LEGS) {
            ModelPart leg = kids.get(name);
            if (leg == null) continue;
            z += leg.getInitialPose().z();
            legs++;
        }
        PartPose a = abdomen.getInitialPose();
        List<ModelPart.Cube> cubes = ((ModelPartAccessor) (Object) abdomen).mobreactions$cubes();
        float joint = cubes.isEmpty() ? a.z() : a.z() + cubes.getFirst().minZ * a.zScale();
        return new Arachnid(centre, legs > 0 ? z / legs : SPIDER.zc, joint, centre / SPIDER.centre);
    }
}
