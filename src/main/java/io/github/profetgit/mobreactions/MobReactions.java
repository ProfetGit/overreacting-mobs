package io.github.profetgit.mobreactions;

import io.github.profetgit.mobreactions.anim.Clip;
import io.github.profetgit.mobreactions.compat.Emf;
import io.github.profetgit.mobreactions.face.Faces;
import io.github.profetgit.mobreactions.react.Rig;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MobReactions {
    public static final String MOD_ID = "mobreactions";
    public static final Logger LOG = LoggerFactory.getLogger("Mob Reactions");
    private static final Map<String, Clip> CLIPS_BY_NAME = new HashMap<>();
    private static String loader = "?";

    private MobReactions() {
    }

    public static void init(String loaderName) {
        loader = loaderName;
        for (Rig rig : Rig.values()) {
            for (String name : rig.clips) CLIPS_BY_NAME.put(rig.id + "/" + name, load("reactions/" + rig.id + "/" + name + ".json"));
        }
        Faces.loadSpec();
        Emf.init();
        LOG.info("Mob Reactions loaded on {}: {} clips for {} rigs", loader, CLIPS_BY_NAME.size(), Rig.values().length);
    }

    public static String loader() {
        return loader;
    }

    public static Clip clip(Rig rig, String name) {
        return CLIPS_BY_NAME.get(rig.id + "/" + name);
    }

    /** Dev only (dev/demo/polish.sh): clips in the folder -Dmobreactions.clips=<dir> replace the bundled ones of the same
     * rig and name (<dir>/<name>.json for the humanoid rig, <dir>/<rig>/<name>.json for the others). */
    private static Clip load(String path) {
        String dir = System.getProperty("mobreactions.clips");
        String rel = path.substring("reactions/".length()).replaceFirst("^humanoid/", "");
        Path file = dir == null || dir.isEmpty() ? null : Path.of(dir, rel);
        if (file != null && Files.isRegularFile(file)) {
            try (Reader r = Files.newBufferedReader(file)) {
                LOG.info("Mob Reactions: clip {} from {}", path, file);
                return Clip.parse(r);
            } catch (Exception e) {
                throw new IllegalStateException("Mob Reactions: cannot load " + file, e);
            }
        }
        try (InputStream in = MobReactions.class.getResourceAsStream("/assets/" + MOD_ID + "/" + path)) {
            if (in == null) throw new IllegalStateException("missing " + path);
            return Clip.parse(new InputStreamReader(in, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Mob Reactions: cannot load " + path, e);
        }
    }
}
