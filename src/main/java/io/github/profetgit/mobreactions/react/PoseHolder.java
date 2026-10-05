package io.github.profetgit.mobreactions.react;

/** Added to LivingEntityRenderState: the reaction pose for this frame, or null. */
public interface PoseHolder {
    Pose mobreactions$pose();

    void mobreactions$setPose(Pose pose);

    /** The entity type the state was extracted from (the state has no entityType field before 1.21.5). */
    net.minecraft.world.entity.EntityType<?> mobreactions$type();

    void mobreactions$setType(net.minecraft.world.entity.EntityType<?> type);
}
