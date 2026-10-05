package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import com.mojang.blaze3d.vertex.PoseStack;
import io.github.profetgit.mobreactions.face.Faces;
import net.minecraft.client.model.Model;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

// Layers drawn over the model with its own UVs (the drowned's outer layer, the stray's and the bogged's clothing) carry the expression too (see Faces.layer).
@Mixin(RenderLayer.class)
public abstract class RenderLayerMixin {
    @ModifyVariable(method = "coloredCutoutModelCopyLayerRender", at = @At("HEAD"), argsOnly = true, ordinal = 0)
    private static Identifier mobreactions$faceLayer(Identifier texture, Model<?> model, Identifier same, PoseStack poseStack, SubmitNodeCollector collector,
                                                     int light, LivingEntityRenderState state, int color, int order) {
        return Faces.layer(state, texture);
    }
}
//?} else {
/*import io.github.profetgit.mobreactions.face.Faces;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.MultiBufferSource;

// Layers drawn over the model with its own UVs (the drowned's outer layer, the stray's and the bogged's clothing) carry the expression too (see Faces.layer).
@Mixin(RenderLayer.class)
public abstract class RenderLayerMixin {
    @ModifyVariable(method = "coloredCutoutModelCopyLayerRender", at = @At("HEAD"), argsOnly = true, ordinal = 0)
    private static ResourceLocation mobreactions$faceLayer(ResourceLocation texture, EntityModel<?> parent, EntityModel<?> child, ResourceLocation same, PoseStack poseStack,
                                                           MultiBufferSource buffer, int light, LivingEntity entity, float a, float b, float c, float d, float e, float f, int color) {
        return Faces.layer(entity, texture);
    }
}
*///?}
