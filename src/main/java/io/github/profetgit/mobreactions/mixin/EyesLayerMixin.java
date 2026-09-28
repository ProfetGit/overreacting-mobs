package io.github.profetgit.mobreactions.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.face.Faces;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.EyesLayer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Glowing eyes drawn over the face (the spider's) show the expression too (see Faces.glow). */
@Mixin(EyesLayer.class)
public abstract class EyesLayerMixin {
    @Redirect(method = "submit", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/layers/EyesLayer;renderType()Lnet/minecraft/client/renderer/rendertype/RenderType;"))
    private RenderType mobreactions$glow(EyesLayer<?, ?> layer, PoseStack poseStack, SubmitNodeCollector collector, int light, EntityRenderState state, float yRot, float xRot) {
        RenderType type = layer.renderType();
        return state instanceof LivingEntityRenderState s ? Faces.glow(s, type) : type;
    }
}
