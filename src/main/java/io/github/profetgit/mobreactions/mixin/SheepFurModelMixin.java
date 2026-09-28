package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.sheep.SheepFurModel;
import net.minecraft.client.renderer.entity.state.SheepRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** See QuadrupedModelMixin: this model changes its pose after QuadrupedModel.setupAnim, so the reaction goes on last. */
@Mixin(SheepFurModel.class)
public abstract class SheepFurModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/SheepRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(SheepRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((SheepFurModel) (Object) this, state);
    }
}
