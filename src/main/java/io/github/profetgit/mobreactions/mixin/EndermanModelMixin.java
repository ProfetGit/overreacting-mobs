package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.model.monster.enderman.EndermanModel;
import net.minecraft.client.renderer.entity.state.EndermanRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Endermen: EndermanModel halves and clamps HumanoidModel's limb swing and holds a carried block out in front after
 * HumanoidModel.setupAnim, so the reaction goes on here instead (HumanoidModelMixin skips endermen).
 */
@Mixin(EndermanModel.class)
public abstract class EndermanModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/EndermanRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(EndermanRenderState state, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (p != null) {
            p.carrying = !state.carriedBlock.isEmpty();
            p.creepy = state.isCreepy;
        }
        Pose.fromModelHook((EndermanModel<?>) (Object) this, state);
    }
}
