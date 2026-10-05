package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Hits;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

// After the whole render state is extracted (subclass renderers fill their fields after LivingEntityRenderer's extract,

// and the texture is picked before the model's setupAnim): a reacting pet drops its sitting, sleeping or crouching

// pose (Hits.standUp).
@Mixin(EntityRenderer.class)
public abstract class EntityRendererMixin {
    @Inject(method = "createRenderState(Lnet/minecraft/world/entity/Entity;F)Lnet/minecraft/client/renderer/entity/state/EntityRenderState;", at = @At("RETURN"))
    private void mobreactions$standUp(Entity entity, float partialTicks, CallbackInfoReturnable<EntityRenderState> cir) {
        //? if <1.21.5 {
        /*if (cir.getReturnValue() instanceof io.github.profetgit.mobreactions.react.PoseHolder h) h.mobreactions$setType(entity.getType());
        *///?}
        Hits.standUp(cir.getReturnValue());
    }
}
//?} else {
/*import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;

// There is no render state before 1.21.2 to finish off: nothing to do.
@Mixin(Minecraft.class)
public abstract class EntityRendererMixin {
}
*///?}
