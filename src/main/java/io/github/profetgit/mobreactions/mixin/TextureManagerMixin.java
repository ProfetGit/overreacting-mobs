package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.face.Faces;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.renderer.texture.TextureManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Resource packs changed: rebuild the face textures from the new mob textures on next use. */
@Mixin(TextureManager.class)
public abstract class TextureManagerMixin {
    @Inject(method = "reload", at = @At("HEAD"))
    private void mobreactions$reload(CallbackInfoReturnable<CompletableFuture<Void>> cir) {
        Faces.invalidate();
    }
}
