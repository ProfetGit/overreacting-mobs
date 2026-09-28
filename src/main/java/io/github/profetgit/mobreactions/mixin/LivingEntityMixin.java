package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Hits;
import io.github.profetgit.mobreactions.react.Reaction;
import io.github.profetgit.mobreactions.react.ReactionHolder;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin implements ReactionHolder {
    @Unique
    private Reaction mobreactions$reaction;
    @Unique
    private int mobreactions$critTick = Integer.MIN_VALUE;
    @Unique
    private int mobreactions$sprintTick = Integer.MIN_VALUE;
    @Unique
    private int mobreactions$weakTick = Integer.MIN_VALUE;
    @Unique
    private int mobreactions$combo;
    @Unique
    private int mobreactions$lastHitTick = Integer.MIN_VALUE;

    @Override
    public Reaction mobreactions$reaction() {
        return mobreactions$reaction;
    }

    @Override
    public void mobreactions$setReaction(Reaction reaction) {
        mobreactions$reaction = reaction;
    }

    @Override
    public int mobreactions$critTick() {
        return mobreactions$critTick;
    }

    @Override
    public void mobreactions$setCritTick(int tick) {
        mobreactions$critTick = tick;
    }

    @Override
    public int mobreactions$sprintTick() {
        return mobreactions$sprintTick;
    }

    @Override
    public void mobreactions$setSprintTick(int tick) {
        mobreactions$sprintTick = tick;
    }

    @Override
    public int mobreactions$weakTick() {
        return mobreactions$weakTick;
    }

    @Override
    public void mobreactions$setWeakTick(int tick) {
        mobreactions$weakTick = tick;
    }

    @Override
    public int mobreactions$combo() {
        return mobreactions$combo;
    }

    @Override
    public void mobreactions$setCombo(int combo) {
        mobreactions$combo = combo;
    }

    @Override
    public int mobreactions$lastHitTick() {
        return mobreactions$lastHitTick;
    }

    @Override
    public void mobreactions$setLastHitTick(int tick) {
        mobreactions$lastHitTick = tick;
    }

    @Inject(method = "handleDamageEvent", at = @At("TAIL"))
    private void mobreactions$onDamage(DamageSource source, CallbackInfo ci) {
        Hits.onDamage((LivingEntity) (Object) this, source);
    }

    /** Event 3 is the death (the client sets health 0 and calls die); event 60 is the poof the server sends before removing the body. */
    @Inject(method = "handleEntityEvent", at = @At("HEAD"), cancellable = true)
    private void mobreactions$holdPoof(byte id, CallbackInfo ci) {
        if (id == 60 && Hits.holdPoof((LivingEntity) (Object) this)) ci.cancel();
    }

    @Inject(method = "handleEntityEvent", at = @At("TAIL"))
    private void mobreactions$onDeath(byte id, CallbackInfo ci) {
        if (id == 3) Hits.onDeath((LivingEntity) (Object) this);
    }

    @Inject(method = "isPickable", at = @At("HEAD"), cancellable = true)
    private void mobreactions$pickable(CallbackInfoReturnable<Boolean> cir) {
        if (mobreactions$reaction != null && Hits.dying((LivingEntity) (Object) this)) cir.setReturnValue(false);
    }

    @Inject(method = "tick", at = @At("TAIL"))
    private void mobreactions$tick(CallbackInfo ci) {
        if (mobreactions$reaction != null) Hits.tick((LivingEntity) (Object) this);
    }

    /** While EMF animates a mob that plays its death clip, it counts as alive, so a pack's own death pose stays off (see compat.Emf). */
    @Inject(method = "isAlive", at = @At("HEAD"), cancellable = true)
    private void mobreactions$aliveForEmf(CallbackInfoReturnable<Boolean> cir) {
        if (io.github.profetgit.mobreactions.compat.Emf.keepsAlive((LivingEntity) (Object) this)) cir.setReturnValue(true);
    }
}
