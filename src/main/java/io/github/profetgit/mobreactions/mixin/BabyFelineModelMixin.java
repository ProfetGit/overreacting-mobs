package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.feline.BabyFelineModel;
import net.minecraft.client.renderer.entity.state.FelineRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Kittens and baby ocelots (BabyFelineModel has a setupAnim of its own): see Pose.applyPet. */
@Mixin(BabyFelineModel.class)
public abstract class BabyFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/FelineRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(FelineRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((BabyFelineModel<?>) (Object) this, state);
    }
}
