package traben.entity_model_features;

import traben.entity_model_features.models.animation.state.EMFEntityRenderState;
import traben.entity_model_features.models.parts.EMFModelPartRoot;

/**
 * Compile-time stand-in for the part of Entity Model Features' animation API (API version 11) that Mob Reactions
 * calls. Only the signatures matter; it is never shipped, and at runtime the real EMF classes answer.
 */
public interface EMFAnimationApi {
    static boolean registerAnimationHook(EMFAnimationHook hook) throws Exception {
        throw new UnsupportedOperationException("stub");
    }

    abstract class EMFAnimationHook {
        public boolean onAnimationStart(AnimationContext context, boolean wasCancelledByHook) {
            return true;
        }

        public void onAnimationEnd(AnimationContext context, boolean wasCancelledByHook) {
        }

        public record AnimationContext(EMFEntityRenderState activeState, EMFModelPartRoot animatingModelRoot, Throwable error,
            Object[] partsRequestedToPauseThisAnimation, Object animationHandler) {
        }
    }
}
