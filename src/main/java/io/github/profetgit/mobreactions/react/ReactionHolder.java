package io.github.profetgit.mobreactions.react;

/** Added to LivingEntity: the running reaction plus the hints that pick one. */
public interface ReactionHolder {
    Reaction mobreactions$reaction();

    void mobreactions$setReaction(Reaction reaction);

    /** Client tick count when a crit particle emitter was last attached to this entity. */
    int mobreactions$critTick();

    void mobreactions$setCritTick(int tick);

    /** Client tick count when the local player last hit this entity with a charged sprint attack. */
    int mobreactions$sprintTick();

    void mobreactions$setSprintTick(int tick);

    /** Client tick count when the local player last hit this entity with an uncharged attack. */
    int mobreactions$weakTick();

    void mobreactions$setWeakTick(int tick);

    /** Hits in the current combo (1 = a fresh hit). */
    int mobreactions$combo();

    void mobreactions$setCombo(int combo);

    /** Client tick count of the last hit, or Integer.MIN_VALUE. */
    int mobreactions$lastHitTick();

    void mobreactions$setLastHitTick(int tick);
}
