package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.compat.Emf;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.model.monster.witch.WitchModel;
import net.minecraft.client.renderer.entity.state.WitchRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(WitchModel.class)
public abstract class WitchModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/WitchRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(WitchRenderState state, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        WitchModel model = (WitchModel) (Object) this;
        if (Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }
}
