package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.golem.IronGolemModel;
import net.minecraft.client.renderer.entity.state.IronGolemRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Iron golems (see Pose.applyGolem); the crack layer draws the same model, and the poppy follows the right arm.
@Mixin(IronGolemModel.class)
public abstract class IronGolemModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/IronGolemRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(IronGolemRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((IronGolemModel) (Object) this, state);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.model.IronGolemModel;

// Iron golems (see Pose.applyGolem); the crack layer draws the same model.
@Mixin(IronGolemModel.class)
public abstract class IronGolemModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/animal/IronGolem;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.animal.IronGolem entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose.fromModelHook((net.minecraft.client.model.Model) (Object) this);
    }
}
*///?}
