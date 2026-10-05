package io.github.profetgit.mobreactions.mixin;

//? if >=1.21.2 {
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;

@Mixin(LivingEntityRenderState.class)
public abstract class LivingEntityRenderStateMixin implements PoseHolder {
    @Unique
    private Pose mobreactions$pose;
    @Unique
    private net.minecraft.world.entity.EntityType<?> mobreactions$type;

    @Override
    public Pose mobreactions$pose() {
        return mobreactions$pose;
    }

    @Override
    public void mobreactions$setPose(Pose pose) {
        mobreactions$pose = pose;
    }

    @Override
    public net.minecraft.world.entity.EntityType<?> mobreactions$type() {
        return mobreactions$type;
    }

    @Override
    public void mobreactions$setType(net.minecraft.world.entity.EntityType<?> type) {
        mobreactions$type = type;
    }
}
//?} else {
/*import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;

// There is no render state before 1.21.2 (Pose.current stands in for it): nothing to add.
@Mixin(Minecraft.class)
public abstract class LivingEntityRenderStateMixin {
}
*///?}
