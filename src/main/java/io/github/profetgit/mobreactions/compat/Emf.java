package io.github.profetgit.mobreactions.compat;

import io.github.profetgit.mobreactions.MobReactions;
import io.github.profetgit.mobreactions.mixin.ModelPartAccessor;
import io.github.profetgit.mobreactions.react.Hits;
import io.github.profetgit.mobreactions.react.Pose;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.LivingEntity;

/**
 * Entity Model Features (the mod behind Fresh Animations and other CEM packs) re-poses a model after vanilla's
 * setupAnim, when the model renders, and would overwrite a reaction. So when EMF animates a model, the reaction pose
 * waits and is applied from EMF's animation hook instead, on top of the pack's pose. Fresh Animations also draws the
 * eyes as separate parts in front of the face ("eyes" on zombies, "r_eye_white", "r_pupil" and so on for the
 * villager-like mobs); they're hidden while an expression shows. Its illagers cross their arms with a part of their
 * own ("arms_rotation"), hidden while a reaction shows the separate arms. EMF swaps a part's children when it switches
 * model states, so those parts are looked up in the current tree each time, not kept (EMF names them "EMF_" + id).
 * Everything that touches EMF's classes is in {@link EmfHook}, which is only loaded when EMF is.
 */
public final class Emf {
    private static final Set<String> EYE_PARTS = Set.of("eyes", "r_eye_white", "r_pupil", "l_eye_white", "l_pupil", "r_eyelid", "l_eyelid",
        // Fresh Animations' wolf and fox draw a second layer of eye parts
        "r_eye_white2", "l_eye_white2", "r_pupil2", "l_pupil2");
    private static final Set<String> CROSSED_PARTS = Set.of("arms_rotation");
    private static boolean loaded;
    /** Per model root: the pose waiting for EMF's animation of that model to finish. */
    private static final Map<ModelPart, Pending> PENDING = new WeakHashMap<>();
    /** Per model root: what the last reaction drawn with it hid (eyes, crossed arms), to show again once it ends. */
    private static final Map<ModelPart, Hidden> HIDDEN = new WeakHashMap<>();

    private record Pending(Model<?> model, Pose pose) {
    }

    private record Hidden(boolean eyes, boolean crossed) {
    }

    /** The mob EMF is animating right now (render thread, between its animation hooks), or null. */
    private static LivingEntity animating;

    private Emf() {
    }

    static void animating(LivingEntity e) {
        animating = e;
    }

    /**
     * A pack's own death pose (Fresh Animations lowers and folds a dead spider, from EMF's is_alive) would stack on the
     * death clip, so while EMF animates a mob that plays one, the mob counts as alive (LivingEntity.isAlive).
     */
    public static boolean keepsAlive(LivingEntity e) {
        return loaded && e == animating && Hits.dying(e);
    }

    public static void init() {
        try {
            Class.forName("traben.entity_model_features.EMFAnimationApi", false, Emf.class.getClassLoader());
        } catch (ClassNotFoundException | LinkageError e) {
            return;
        }
        try {
            EmfHook.register();
            loaded = true;
            MobReactions.LOG.info("Mob Reactions: Entity Model Features found, reactions play on top of its animations");
        } catch (Throwable t) {
            MobReactions.LOG.warn("Mob Reactions: Entity Model Features found but its animation hook failed: {}", t.toString());
        }
    }

    /** End of setupAnim. True when EMF animates this model: the pose (or null) is applied after EMF's animation. */
    public static boolean defer(Model<?> model, Pose pose) {
        if (!loaded) return false;
        ModelPart root = model.root();
        if (!EmfHook.animates(root)) return false;
        if (pose == null) PENDING.remove(root);
        else PENDING.put(root, new Pending(model, pose));
        return true;
    }

    /** EMF finished animating the model with this root (every model it animates, reacting or not). */
    static void animated(ModelPart root) {
        Pending p = PENDING.remove(root);
        if (p != null) {
            p.pose().emf = true;
            p.pose().apply(p.model());
        }
        // hidden parts are shown again once, when the expression (or the separate arms) end; the pack's own animation
        // takes over their visibility from the next frame
        boolean eyes = p != null && p.pose().face != 0, crossed = p != null && p.pose().armsApart;
        Hidden was = HIDDEN.get(root);
        if (!eyes && !crossed && was == null) return;
        boolean showEyes = !eyes && was != null && was.eyes(), showCrossed = !crossed && was != null && was.crossed();
        if (eyes || crossed || showEyes || showCrossed) set(root, eyes, crossed, showEyes, showCrossed);
        if (eyes || crossed) HIDDEN.put(root, new Hidden(eyes, crossed));
        else HIDDEN.remove(root);
    }

    private static void set(ModelPart part, boolean hideEyes, boolean hideCrossed, boolean showEyes, boolean showCrossed) {
        for (Map.Entry<String, ModelPart> e : ((ModelPartAccessor) (Object) part).mobreactions$children().entrySet()) {
            String name = packName(e.getKey());
            if (EYE_PARTS.contains(name) && (hideEyes || showEyes)) e.getValue().visible = showEyes;
            if (CROSSED_PARTS.contains(name) && (hideCrossed || showCrossed)) e.getValue().visible = showCrossed;
            set(e.getValue(), hideEyes, hideCrossed, showEyes, showCrossed);
        }
    }

    /** EMF files a pack's own part under "EMF_" + its id, with a "#" added for each earlier part of the same id. */
    private static String packName(String key) {
        int end = key.length();
        while (end > 0 && key.charAt(end - 1) == '#') end--;
        return key.startsWith("EMF_") ? key.substring(4, end) : key.substring(0, end);
    }
}
