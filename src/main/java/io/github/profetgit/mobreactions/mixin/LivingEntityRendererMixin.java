package io.github.profetgit.mobreactions.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.face.Faces;
import io.github.profetgit.mobreactions.react.Hits;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
    @Inject(method = "extractRenderState(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;F)V", at = @At("TAIL"))
    private void mobreactions$extract(LivingEntity entity, LivingEntityRenderState state, float partialTick, CallbackInfo ci) {
        Hits.extract(entity, state, partialTick);
    }

    @Inject(method = "setupRotations", at = @At("TAIL"))
    private void mobreactions$root(LivingEntityRenderState state, PoseStack poseStack, float bodyRot, float scale, CallbackInfo ci) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (p != null) p.applyRoot(poseStack, ((LivingEntityRenderer<?, ?, ?>) (Object) this).getModel());
    }

    /** The model's texture, with the expression painted on while one shows (see Faces.base). */
    @ModifyVariable(method = "getRenderType", at = @At("STORE"), ordinal = 0)
    private Identifier mobreactions$face(Identifier texture, LivingEntityRenderState state, boolean visible, boolean translucent, boolean glowing) {
        return Faces.base(state, texture);
    }

    /** The hit flash: vanilla's white overlay (the creeper's), shown instead of the red one for the first frames. */
    @Inject(method = "getOverlayCoords", at = @At("HEAD"), cancellable = true)
    private static void mobreactions$flash(LivingEntityRenderState state, float whiteOverlayProgress, CallbackInfoReturnable<Integer> cir) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (p != null && p.flash > 0) cir.setReturnValue(OverlayTexture.pack(p.flash, false));
    }
}
