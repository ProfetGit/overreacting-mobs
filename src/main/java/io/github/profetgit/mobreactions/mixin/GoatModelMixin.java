package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.goat.GoatModel;
import net.minecraft.client.renderer.entity.state.GoatRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** See QuadrupedModelMixin: this model changes its pose after QuadrupedModel.setupAnim, so the reaction goes on last. */
@Mixin(GoatModel.class)
public abstract class GoatModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/GoatRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(GoatRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((GoatModel) (Object) this, state);
    }
}
