package io.github.profetgit.mobreactions.compat;

import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.LivingEntity;
import traben.entity_model_features.EMFAnimationApi;
import traben.entity_model_features.models.parts.EMFModelPartRoot;

/** The only class that touches Entity Model Features; loaded only when EMF is (see {@link Emf}). */
final class EmfHook extends EMFAnimationApi.EMFAnimationHook {
    static void register() throws Exception {
        EMFAnimationApi.registerAnimationHook(new EmfHook());
    }

    static boolean animates(ModelPart root) {
        return (Object) root instanceof EMFModelPartRoot emf && emf.hasAnimation();
    }

    @Override
    public boolean onAnimationStart(AnimationContext context, boolean wasCancelledByHook) {
        Object entity = context.activeState() == null ? null : context.activeState().emfEntity();
        Emf.animating(entity instanceof LivingEntity e ? e : null);
        return true;
    }

    @Override
    public void onAnimationEnd(AnimationContext context, boolean wasCancelledByHook) {
        Emf.animating(null);
        Object root = context.animatingModelRoot();
        if (root instanceof ModelPart part) Emf.animated(part);
    }
}
