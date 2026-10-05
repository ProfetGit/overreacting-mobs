package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.compat.Emf;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.model.monster.illager.IllagerModel;
import net.minecraft.client.renderer.entity.state.IllagerRenderState;
import net.minecraft.world.entity.monster.illager.AbstractIllager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Vindicators, pillagers, evokers and illusioners (see Pose.applyVillager).
@Mixin(IllagerModel.class)
public abstract class IllagerModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/IllagerRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(IllagerRenderState state, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        IllagerModel<?> model = (IllagerModel<?>) (Object) this;
        if (p != null) p.crossedVanilla = state.armPose == AbstractIllager.IllagerArmPose.CROSSED;
        if (Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.react.Pose;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import io.github.profetgit.mobreactions.compat.Emf;
import net.minecraft.client.model.IllagerModel;
import net.minecraft.world.entity.monster.AbstractIllager;

// Vindicators, pillagers, evokers and illusioners (see Pose.applyVillager).
@Mixin(IllagerModel.class)
public abstract class IllagerModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/monster/AbstractIllager;FFFFF)V", at = @At("TAIL"))
    private void mobreactions$pose(AbstractIllager illager, float a, float b, float c, float d, float e, CallbackInfo ci) {
        Pose p = Pose.current;
        IllagerModel<?> model = (IllagerModel<?>) (Object) this;
        if (p != null) p.crossedVanilla = illager.getArmPose() == AbstractIllager.IllagerArmPose.CROSSED;
        if (Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }
}
*///?}
