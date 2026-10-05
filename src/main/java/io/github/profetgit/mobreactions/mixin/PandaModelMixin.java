package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.panda.PandaModel;
import net.minecraft.client.renderer.entity.state.PandaRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// See QuadrupedModelMixin: this model changes its pose after QuadrupedModel.setupAnim, so the reaction goes on last.
@Mixin(PandaModel.class)
public abstract class PandaModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/PandaRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(PandaRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((PandaModel) (Object) this, state);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.model.PandaModel;

// See QuadrupedModelMixin.
@Mixin(PandaModel.class)
public abstract class PandaModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/animal/Panda;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.animal.Panda entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose.fromModelHook((net.minecraft.client.model.Model) (Object) this);
    }
}
*///?}
