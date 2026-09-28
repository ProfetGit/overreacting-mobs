package io.github.profetgit.mobreactions.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.CarriedBlockLayer;
import net.minecraft.client.renderer.entity.state.EndermanRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * An enderman's carried block goes with its arms during a reaction (Pose.carry). A dying enderman's isn't drawn: the
 * server drops the block as loot the moment it dies, and vanilla keeps drawing it in its hands as well.
 */
@Mixin(CarriedBlockLayer.class)
public abstract class CarriedBlockLayerMixin {
    @Unique
    private boolean mobreactions$pushed;

    @Inject(method = "submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/client/renderer/entity/state/EndermanRenderState;FF)V",
        at = @At("HEAD"), cancellable = true)
    private void mobreactions$follow(PoseStack poseStack, SubmitNodeCollector collector, int light, EndermanRenderState state, float yRot, float xRot, CallbackInfo ci) {
        mobreactions$pushed = false;
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (p == null || state.carriedBlock.isEmpty()) return;
        if (p.dead) {
            ci.cancel();
            return;
        }
        poseStack.pushPose();
        mobreactions$pushed = true;
        p.carry(poseStack, ((CarriedBlockLayer) (Object) this).getParentModel());
    }

    @Inject(method = "submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/client/renderer/entity/state/EndermanRenderState;FF)V",
        at = @At("RETURN"))
    private void mobreactions$restore(PoseStack poseStack, SubmitNodeCollector collector, int light, EndermanRenderState state, float yRot, float xRot, CallbackInfo ci) {
        if (mobreactions$pushed) poseStack.popPose();
        mobreactions$pushed = false;
    }
}
