package io.github.profetgit.mobreactions.demo;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.platform.NativeImage;
import java.util.function.Consumer;

// Screenshot.takeScreenshot returned the image before 1.21.5 and takes a callback since.
final class DemoCompat {
    private DemoCompat() {
    }

    static void screenshot(RenderTarget target, Consumer<NativeImage> then) {
        //? if >=1.21.5 {
        net.minecraft.client.Screenshot.takeScreenshot(target, then);
        //?} else {
        /*then.accept(net.minecraft.client.Screenshot.takeScreenshot(target));
        *///?}
    }
}
