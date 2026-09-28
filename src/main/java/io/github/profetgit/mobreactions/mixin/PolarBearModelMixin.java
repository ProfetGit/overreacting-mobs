package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.polarbear.PolarBearModel;
import net.minecraft.client.renderer.entity.state.PolarBearRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** See QuadrupedModelMixin: this model changes its pose after QuadrupedModel.setupAnim, so the reaction goes on last. */
@Mixin(PolarBearModel.class)
public abstract class PolarBearModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/PolarBearRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(PolarBearRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((PolarBearModel) (Object) this, state);
    }
}
