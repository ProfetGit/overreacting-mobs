package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.QuadrupedModel;
import net.minecraft.client.model.animal.goat.GoatModel;
import net.minecraft.client.model.animal.panda.PandaModel;
import net.minecraft.client.model.animal.polarbear.PolarBearModel;
import net.minecraft.client.model.animal.sheep.SheepFurModel;
import net.minecraft.client.model.animal.sheep.SheepModel;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Cows, mooshrooms and pigs (see Pose.applyQuadruped). Sheep (and their wool), goats, pandas and polar bears change
 * their pose after this in their own setupAnim, so they get the pose at the end of that instead (their own mixins).
 */
@Mixin(QuadrupedModel.class)
public abstract class QuadrupedModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(LivingEntityRenderState state, CallbackInfo ci) {
        Object self = this;
        if (self instanceof SheepModel || self instanceof SheepFurModel || self instanceof GoatModel || self instanceof PandaModel || self instanceof PolarBearModel) return;
        Pose.fromModelHook((QuadrupedModel<?>) self, state);
    }
}
