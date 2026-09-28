package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.wolf.WolfModel;
import net.minecraft.client.renderer.entity.state.WolfRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Wolves, adult and baby, and the wolf armour (its own AdultWolfModel with the same state): see Pose.applyPet. */
@Mixin(WolfModel.class)
public abstract class WolfModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/WolfRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(WolfRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((WolfModel) (Object) this, state);
    }
}
