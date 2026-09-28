package io.github.profetgit.mobreactions.react;

import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;

/**
 * The biped rigs' per-model proportions, measured once from the model's rest pose. The humanoid and villager-like clips
 * are keyed on the adults (hips 12 px up), the enderman's on the enderman (29 px); babies have models of their own (a
 * baby zombie's hips are 4 px up, a baby villager's 2.5), so the pelvis pivot, the waist the torso bends at and the keyed
 * positions follow the legs.
 * hips: the legs' pivot in model space (px, y down from 24 px above the feet).
 */
record Biped(float hips) {
    static final Biped ADULT = new Biped(12);
    private static final Map<Model<?>, Biped> CACHE = new WeakHashMap<>();

    static Biped of(Model<?> model) {
        if (model == null) return ADULT;
        return CACHE.computeIfAbsent(model, Biped::measure);
    }

    /** Hip height over the height of the model the rig's clips were keyed on. */
    float scale(Rig rig) {
        return (24 - hips) / (rig == Rig.ENDERMAN ? 29 : 12);
    }

    private static Biped measure(Model<?> model) {
        Map<String, ModelPart> kids = ((ModelPartAccessor) (Object) model.root()).mobreactions$children();
        ModelPart leg = kids.get("right_leg");
        if (leg == null) return ADULT;
        float height = 24 - leg.getInitialPose().y();
        return height > 0.5F && height < 40 ? new Biped(leg.getInitialPose().y()) : ADULT;
    }
}
