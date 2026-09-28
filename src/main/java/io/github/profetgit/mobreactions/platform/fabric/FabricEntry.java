package io.github.profetgit.mobreactions.platform.fabric;

//? fabric {
import io.github.profetgit.mobreactions.MobReactions;
import net.fabricmc.api.ClientModInitializer;

public final class FabricEntry implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        MobReactions.init("fabric");
    }
}
//?}
