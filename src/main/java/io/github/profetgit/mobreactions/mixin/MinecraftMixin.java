package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.demo.Director;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Drives the dev demo (dev/demo/run.sh); inert unless the game runs with -Dmobreactions.demo. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void mobreactions$demoTick(CallbackInfo ci) {
        if (Director.ACTIVE) Director.onTick((Minecraft) (Object) this);
    }

    @Inject(method = "runTick", at = @At("TAIL"))
    private void mobreactions$demoFrame(boolean advanceGameTime, CallbackInfo ci) {
        if (Director.ACTIVE) Director.onFrame((Minecraft) (Object) this);
    }
}
