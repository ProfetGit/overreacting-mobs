package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Hits;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * After the whole render state is extracted (subclass renderers fill their fields after LivingEntityRenderer's extract,
 * and the texture is picked before the model's setupAnim): a reacting pet drops its sitting, sleeping or crouching
 * pose (Hits.standUp).
 */
@Mixin(EntityRenderer.class)
public abstract class EntityRendererMixin {
    @Inject(method = "createRenderState(Lnet/minecraft/world/entity/Entity;F)Lnet/minecraft/client/renderer/entity/state/EntityRenderState;", at = @At("RETURN"))
    private void mobreactions$standUp(Entity entity, float partialTicks, CallbackInfoReturnable<EntityRenderState> cir) {
        Hits.standUp(cir.getReturnValue());
    }
}
