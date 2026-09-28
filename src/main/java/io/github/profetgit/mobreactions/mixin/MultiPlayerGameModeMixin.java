package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Hits;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The local player's sprint attacks, read before vanilla stops the sprint. */
@Mixin(MultiPlayerGameMode.class)
public abstract class MultiPlayerGameModeMixin {
    @Inject(method = "attack", at = @At("HEAD"))
    private void mobreactions$attack(Player player, Entity target, CallbackInfo ci) {
        if (target instanceof LivingEntity living) Hits.onLocalAttack(living, player);
    }
}
