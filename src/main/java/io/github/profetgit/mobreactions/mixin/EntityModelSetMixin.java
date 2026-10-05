package io.github.profetgit.mobreactions.mixin;

//? if <1.21.2 {
/*import io.github.profetgit.mobreactions.react.Roots;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

// See ModelRootMixin.
@Mixin(EntityModelSet.class)
public abstract class EntityModelSetMixin {
    @Inject(method = "bakeLayer", at = @At("RETURN"))
    private void mobreactions$baked(ModelLayerLocation layer, CallbackInfoReturnable<ModelPart> cir) {
        Roots.lastBaked = cir.getReturnValue();
    }
}
*///?}
//? if >=1.21.2 {
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;

// Models have root() since 1.21.2: nothing to do.
@Mixin(Minecraft.class)
public abstract class EntityModelSetMixin {
}
//?}
