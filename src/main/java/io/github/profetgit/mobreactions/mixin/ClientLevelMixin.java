package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Hits;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The server removes a dead mob after 20 ticks; a longer death clip keeps the body until it has played out. */
@Mixin(ClientLevel.class)
public abstract class ClientLevelMixin {
    @Inject(method = "removeEntity", at = @At("HEAD"), cancellable = true)
    private void mobreactions$holdBody(int id, Entity.RemovalReason reason, CallbackInfo ci) {
        if (Hits.holdRemoval(((ClientLevel) (Object) this).getEntity(id), reason)) ci.cancel();
    }
}
