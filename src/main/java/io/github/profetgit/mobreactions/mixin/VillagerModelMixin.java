package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.compat.Emf;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.model.npc.VillagerModel;
import net.minecraft.client.renderer.entity.state.VillagerRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Villagers and wandering traders; also the villager's hatless copy the profession layer draws its clothes with. */
@Mixin(VillagerModel.class)
public abstract class VillagerModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/VillagerRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(VillagerRenderState state, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        VillagerModel model = (VillagerModel) (Object) this;
        if (Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }
}
