package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.fox.FoxModel;
import net.minecraft.client.renderer.entity.state.FoxRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Foxes, adult and baby: see Pose.applyPet. */
@Mixin(FoxModel.class)
public abstract class FoxModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/FoxRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(FoxRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((FoxModel) (Object) this, state);
    }
}
