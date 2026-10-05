package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
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

    // The model's texture, with the expression painted on while one shows (see Faces.base).
    @ModifyVariable(method = "getRenderType", at = @At("STORE"), ordinal = 0)
    private Identifier mobreactions$face(Identifier texture, LivingEntityRenderState state, boolean visible, boolean translucent, boolean glowing) {
        return Faces.base(state, texture);
    }

    // The hit flash: vanilla's white overlay (the creeper's), shown instead of the red one for the first frames.
    @Inject(method = "getOverlayCoords", at = @At("HEAD"), cancellable = true)
    private static void mobreactions$flash(LivingEntityRenderState state, float whiteOverlayProgress, CallbackInfoReturnable<Integer> cir) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        if (p != null && p.flash > 0) cir.setReturnValue(OverlayTexture.pack(p.flash, false));
    }
}
//?} else {
/*import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.face.Faces;
import io.github.profetgit.mobreactions.react.Hits;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.Rig;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

// Before 1.21.2 the renderer draws the entity itself, with no render state in between: the pose is worked out when the
// render starts and stays in Pose.current (and Hits.FRAME) until it ends, for the model hooks and the changes below.
@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
    @Inject(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", at = @At("HEAD"))
    private void mobreactions$begin(LivingEntity entity, float yaw, float partial, PoseStack ps, MultiBufferSource buffer, int light, CallbackInfo ci) {
        Pose p = Rig.of(entity) == null ? null : Hits.extractLegacy(entity, partial);
        Pose.current = p;
        // the body is drawn held at the hit's spot or riding its arc (the shadow follows: it is drawn from the same stack)
        if (p != null) ps.translate(Hits.FRAME.dx, Hits.FRAME.dy, Hits.FRAME.dz);
    }

    @Inject(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", at = @At("RETURN"))
    private void mobreactions$end(LivingEntity entity, float yaw, float partial, PoseStack ps, MultiBufferSource buffer, int light, CallbackInfo ci) {
        Pose.current = null;
        Pose.resetTouched();
    }

    @Inject(method = "setupRotations", at = @At("TAIL"))
    private void mobreactions$root(LivingEntity entity, PoseStack poseStack, float bob, float bodyRot, float partial, float scale, CallbackInfo ci) {
        Pose p = Pose.current;
        if (p != null) p.applyRoot(poseStack, ((LivingEntityRenderer<?, ?>) (Object) this).getModel());
    }

    // no vanilla tip-over while a death clip plays, and the body keeps the heading it died with
    @Redirect(method = "setupRotations", at = @At(value = "FIELD", target = "Lnet/minecraft/world/entity/LivingEntity;deathTime:I", opcode = 180))
    private int mobreactions$deathTime(LivingEntity entity) {
        return Pose.current != null && Hits.FRAME.noTip ? 0 : entity.deathTime;
    }

    @ModifyVariable(method = "setupRotations", at = @At("HEAD"), argsOnly = true, ordinal = 1)
    private float mobreactions$bodyRot(float bodyRot) {
        return Pose.current != null && Hits.FRAME.noTip ? Hits.FRAME.bodyRot : bodyRot;
    }

    // The model's texture, with the expression painted on while one shows (see Faces.base).
    @ModifyVariable(method = "getRenderType", at = @At("STORE"), ordinal = 0)
    private ResourceLocation mobreactions$face(ResourceLocation texture, LivingEntity entity, boolean visible, boolean translucent, boolean glowing) {
        return Faces.base(entity, texture);
    }

    // The hit flash: vanilla's white overlay (the creeper's), shown instead of the red one for the first frames; the red
    // overlay itself follows the reaction while one plays.
    @Inject(method = "getOverlayCoords", at = @At("HEAD"), cancellable = true)
    private static void mobreactions$flash(LivingEntity entity, float whiteOverlayProgress, CallbackInfoReturnable<Integer> cir) {
        Pose p = Pose.current;
        if (p == null) return;
        if (p.flash > 0) cir.setReturnValue(OverlayTexture.pack(p.flash, false));
        else if (Hits.FRAME.red != null) cir.setReturnValue(OverlayTexture.pack(OverlayTexture.u(whiteOverlayProgress), OverlayTexture.v(Hits.FRAME.red)));
    }
}
*///?}
