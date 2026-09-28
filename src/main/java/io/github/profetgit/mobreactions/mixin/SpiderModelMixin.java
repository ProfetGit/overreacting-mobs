package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import net.minecraft.client.model.monster.spider.SpiderModel;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Spiders and cave spiders (see Pose.applySpider). */
@Mixin(SpiderModel.class)
public abstract class SpiderModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;)V", at = @At("TAIL"))
    private void mobreactions$pose(LivingEntityRenderState state, CallbackInfo ci) {
        Pose.fromModelHook((SpiderModel) (Object) this, state);
    }
}
