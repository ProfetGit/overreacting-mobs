package io.github.profetgit.mobreactions.react;

/** Added to LivingEntityRenderState: the reaction pose for this frame, or null. */
public interface PoseHolder {
    Pose mobreactions$pose();

    void mobreactions$setPose(Pose pose);
}
