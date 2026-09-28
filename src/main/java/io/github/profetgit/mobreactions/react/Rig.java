package io.github.profetgit.mobreactions.react;

import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.animal.cow.AbstractCow;
import net.minecraft.world.entity.animal.goat.Goat;
import net.minecraft.world.entity.animal.panda.Panda;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.animal.polarbear.PolarBear;
import net.minecraft.world.entity.animal.sheep.Sheep;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.Witch;
import net.minecraft.world.entity.monster.illager.AbstractIllager;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.skeleton.AbstractSkeleton;
import net.minecraft.world.entity.monster.spider.Spider;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.npc.villager.AbstractVillager;

/**
 * A body type with its own clip set (reactions/&lt;id&gt;/, keyed in dev/anim/hits.js). Every adult of a supported rig
 * plays the same clips; variety comes from mirroring, the swing side and the attack's charge.
 */
public enum Rig {
    /** Zombies, skeletons and piglins (HumanoidModel). */
    HUMANOID("humanoid", new String[] {"hit_front", "hit_light", "hit_twist", "hit_heavy", "hit_back", "hit_side_r", "hit_side_l", "hit_crit",
        "hit_launch", "death_front", "death_twist", "death_heavy", "death_back", "death_side_r", "death_side_l", "death_crit", "death_launch",
        "death_collapse", "death_slump"}),
    /** Illagers (IllagerModel: crossed arms plus separate arms), the witch and villagers (WitchModel, VillagerModel: crossed arms only). */
    VILLAGER("villager", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Cows, mooshrooms, pigs, sheep, goats, pandas and polar bears (QuadrupedModel). Same clip names as the villager rig. */
    QUADRUPED("quadruped", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Spiders and cave spiders (SpiderModel), keyed on the spider. Same clip names as the villager rig. */
    SPIDER("spider", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Creepers (CreeperModel; charged ones too, whose glow is a second CreeperModel posed by the same hook). Same clip names. */
    CREEPER("creeper", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Endermen (EndermanModel, a HumanoidModel on 30 px stilts), keyed on the enderman itself. Same clip names. */
    ENDERMAN("enderman", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Wolves, foxes, cats and ocelots (WolfModel, FoxModel, the feline models), keyed on the wolf and measured like the
     * quadruped rig ({@link Quad}), with a tail. Same clip names. */
    PET("pet", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse"}),
    /** Iron golems (IronGolemModel), which never leave the ground: no flight, no landing key, dust events on steps and slams.
     * Same clip names; every death topples back, so it also has a slump for when there's no room behind it. */
    GOLEM("golem", new String[] {"hit_front", "hit_light", "hit_side", "hit_back", "hit_big", "death_front", "death_big", "death_collapse",
        "death_slump"});

    public final String id;
    public final String[] clips;

    Rig(String id, String[] clips) {
        this.id = id;
        this.clips = clips;
    }

    /** The rig an entity plays reactions on, or null when it has none. Babies play their rig's clips on their own models. */
    public static Rig of(LivingEntity e) {
        if (e instanceof Zombie || e instanceof AbstractSkeleton || e instanceof AbstractPiglin) return HUMANOID;
        if (e instanceof AbstractIllager || e instanceof Witch || e instanceof AbstractVillager) return VILLAGER;
        if (e instanceof AbstractCow || e instanceof Pig || e instanceof Sheep || e instanceof Goat || e instanceof Panda || e instanceof PolarBear) return QUADRUPED;
        if (e instanceof Spider) return SPIDER;
        if (e instanceof Creeper) return CREEPER;
        // the class is Enderman on 26.3 and EnderMan on 26.2
        if (e.getType() == EntityTypes.ENDERMAN) return ENDERMAN;
        if (e.getType() == EntityTypes.IRON_GOLEM) return GOLEM;
        if (e.getType() == EntityTypes.WOLF || e.getType() == EntityTypes.FOX || e.getType() == EntityTypes.CAT || e.getType() == EntityTypes.OCELOT) return PET;
        return null;
    }

    /** Big hits get the bigger shake. */
    boolean big(String clip) {
        return clip.endsWith("_crit") || clip.endsWith("_heavy") || clip.endsWith("_big");
    }

    /** The death twin a killing blow grows out of. */
    String death(String hit) {
        if (this == HUMANOID) return hit.equals("hit_light") ? "death_front" : "death_" + hit.substring(4);
        return hit.equals("hit_front") || hit.equals("hit_light") ? "death_front" : "death_big";
    }

    /** The death that stays in its own footprint, for a killing blow with no room to fall. */
    String heap() {
        return this == HUMANOID ? "death_crit" : this == GOLEM ? "death_slump" : "death_big";
    }

    /** A death without a hit, and the one for when there's no room for it to fall over. */
    String collapse(boolean room) {
        return (this == HUMANOID || this == GOLEM) && !room ? "death_slump" : "death_collapse";
    }
}
