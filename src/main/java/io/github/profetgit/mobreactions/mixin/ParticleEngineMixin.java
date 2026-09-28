package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Hits;
import net.minecraft.client.particle.ParticleEngine;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Crit particles on a mob mean the hit was critical: from the local player's own prediction or the server's packet. */
@Mixin(ParticleEngine.class)
public abstract class ParticleEngineMixin {
    @Inject(method = "createTrackingEmitter(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/core/particles/ParticleOptions;)V", at = @At("HEAD"))
    private void mobreactions$crit(Entity entity, ParticleOptions options, CallbackInfo ci) {
        if (options == ParticleTypes.CRIT && entity instanceof LivingEntity living) Hits.onCrit(living);
    }
}
