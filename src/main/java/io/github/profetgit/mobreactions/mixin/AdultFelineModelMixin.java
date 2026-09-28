package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.feline.AdultFelineModel;
import net.minecraft.client.renderer.entity.state.FelineRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Adult cats and ocelots, and the cat collar (a model of its own with the same state): see Pose.applyPet. */
@Mixin(AdultFelineModel.class)
public abstract class AdultFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/FelineRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(FelineRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((AdultFelineModel<?>) (Object) this, state);
    }
}
