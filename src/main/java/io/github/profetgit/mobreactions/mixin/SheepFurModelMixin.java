package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.sheep.SheepFurModel;
import net.minecraft.client.renderer.entity.state.SheepRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// See QuadrupedModelMixin: this model changes its pose after QuadrupedModel.setupAnim, so the reaction goes on last.
@Mixin(SheepFurModel.class)
public abstract class SheepFurModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/SheepRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(SheepRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((SheepFurModel) (Object) this, state);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.model.SheepFurModel;

// See QuadrupedModelMixin: the wool model sets its pose after QuadrupedModel.setupAnim too.
@Mixin(SheepFurModel.class)
public abstract class SheepFurModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/animal/Sheep;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.animal.Sheep entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose.fromModelHook((net.minecraft.client.model.Model) (Object) this);
    }
}
*///?}
