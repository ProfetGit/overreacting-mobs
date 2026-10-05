package io.github.profetgit.mobreactions.mixin;

//? if >=26.2 {
import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.animal.feline.BabyFelineModel;
import net.minecraft.client.renderer.entity.state.FelineRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Kittens and baby ocelots (BabyFelineModel has a setupAnim of its own): see Pose.applyPet.
@Mixin(BabyFelineModel.class)
public abstract class BabyFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/FelineRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(FelineRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((BabyFelineModel<?>) (Object) this, state);
    }
}
//?}
//? if >=1.21.2 <26.2 {
/*import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;

// Before 26.2 a kitten is the adult's FelineModel with a baby transform (AdultFelineModelMixin targets it): nothing to do.
@Mixin(Minecraft.class)
public abstract class BabyFelineModelMixin {
}
*///?}
//? if <1.21.2 {
/*import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.CatModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Cats: CatModel sets its pose after its super call (the ocelot's), so the reaction goes on last (see AdultFelineModelMixin).
@Mixin(CatModel.class)
public abstract class BabyFelineModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/animal/Cat;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(net.minecraft.world.entity.animal.Cat entity, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose.fromModelHook((CatModel<?>) (Object) this);
    }
}
*///?}
