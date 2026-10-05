package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.feline.AdultFelineModel;
import net.minecraft.client.renderer.entity.state.FelineRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Adult cats and ocelots, and the cat collar (a model of its own with the same state): see Pose.applyPet.
@Mixin(AdultFelineModel.class)
public abstract class AdultFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/FelineRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(FelineRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((AdultFelineModel<?>) (Object) this, state);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.CatModel;
import net.minecraft.client.model.OcelotModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Ocelots (a cat's own hook, CatModelMixin, runs after its super call): see Pose.applyPet.
@Mixin(OcelotModel.class)
public abstract class AdultFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/Entity;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.Entity entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Object self = this;
        if (self instanceof CatModel<?>) return;
        Pose.fromModelHook((OcelotModel<?>) self);
    }
}
*///?}
