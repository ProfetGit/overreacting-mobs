package io.github.profetgit.mobreactions.mixin;

//? if <1.21.2 {
/*import io.github.profetgit.mobreactions.react.Roots;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Keeps the root part each model was built from: renderers build a model from the root they just baked, so the last
// baked root (EntityModelSetMixin) is the one that belongs to the model being constructed.
@Mixin(Model.class)
public abstract class ModelRootMixin implements Roots.Holder {
    @Unique
    private ModelPart mobreactions$root;

    @Inject(method = "<init>", at = @At("TAIL"))
    private void mobreactions$init(CallbackInfo ci) {
        mobreactions$root = Roots.lastBaked;
    }

    @Override
    public ModelPart mobreactions$root() {
        return mobreactions$root;
    }

    @Override
    public void mobreactions$setRoot(ModelPart root) {
        mobreactions$root = root;
    }
}
*///?}
//? if >=1.21.2 {
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;

// Models have root() since 1.21.2: nothing to add.
@Mixin(Minecraft.class)
public abstract class ModelRootMixin {
}
//?}
