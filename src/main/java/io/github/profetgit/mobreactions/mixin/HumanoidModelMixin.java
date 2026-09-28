package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.compat.Emf;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.monster.enderman.EndermanModel;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Also runs for the armour models, which get the same render state, so armour moves with the body. With Entity Model
 * Features animating the model, the pose is applied after EMF's animation instead (see Emf). */
@Mixin(HumanoidModel.class)
public abstract class HumanoidModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/HumanoidRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(HumanoidRenderState state, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        HumanoidModel<?> model = (HumanoidModel<?>) (Object) this;
        // EndermanModel re-poses the limbs after this: its own hook applies the reaction (EndermanModelMixin)
        if (model instanceof EndermanModel<?>) return;
        if (Emf.defer(model, p)) return;
        if (p != null) p.apply(model);
    }
}
