package io.github.profetgit.mobreactions.mixin;

import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;

@Mixin(LivingEntityRenderState.class)
public abstract class LivingEntityRenderStateMixin implements PoseHolder {
    @Unique
    private Pose mobreactions$pose;

    @Override
    public Pose mobreactions$pose() {
        return mobreactions$pose;
    }

    @Override
    public void mobreactions$setPose(Pose pose) {
        mobreactions$pose = pose;
    }
}
