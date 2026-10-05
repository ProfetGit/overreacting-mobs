package io.github.profetgit.mobreactions.react;

import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;

// The root part of a model. Models have had root() since 1.21.2; before that only the hierarchical ones do, and the
// others' root is kept when they are built (ModelRootMixin).
public final class Roots {
    private Roots() {
    }

    //? if >=1.21.2 {
    public static ModelPart of(Model<?> m) {
        return m.root();
    }
    //?} else {
    /*// the root the last model layer was baked as, waiting for the model built from it
    public static ModelPart lastBaked;

    // Added to every Model (ModelRootMixin).
    public interface Holder {
        ModelPart mobreactions$root();

        void mobreactions$setRoot(ModelPart root);
    }

    public static ModelPart of(Model m) {
        if (m instanceof net.minecraft.client.model.HierarchicalModel<?> h) return h.root();
        return ((Holder) m).mobreactions$root();
    }
    *///?}
}
