package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.golem.IronGolemModel;
import net.minecraft.client.renderer.entity.state.IronGolemRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Iron golems (see Pose.applyGolem); the crack layer draws the same model, and the poppy follows the right arm. */
@Mixin(IronGolemModel.class)
public abstract class IronGolemModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/IronGolemRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(IronGolemRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((IronGolemModel) (Object) this, state);
    }
}
