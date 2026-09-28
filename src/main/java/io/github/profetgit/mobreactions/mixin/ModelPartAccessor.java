package io.github.profetgit.mobreactions.mixin;

import java.util.List;
import java.util.Map;
import net.minecraft.client.model.geom.ModelPart;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(ModelPart.class)
public interface ModelPartAccessor {
    @Accessor("children")
    Map<String, ModelPart> mobreactions$children();

    @Accessor("cubes")
    List<ModelPart.Cube> mobreactions$cubes();
}
