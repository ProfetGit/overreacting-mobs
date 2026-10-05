package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.monster.creeper.CreeperModel;
import net.minecraft.client.renderer.entity.state.CreeperRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Creepers (see Pose.applyCreeper); a charged creeper's glow is a second CreeperModel with the same state, posed here too.
@Mixin(CreeperModel.class)
public abstract class CreeperModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/CreeperRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(CreeperRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((CreeperModel) (Object) this, state);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.model.CreeperModel;

// Creepers (see Pose.applyCreeper); a charged creeper's glow is a second CreeperModel, posed here too.
@Mixin(CreeperModel.class)
public abstract class CreeperModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/Entity;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.Entity entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose.fromModelHook((net.minecraft.client.model.Model) (Object) this);
    }
}
*///?}
