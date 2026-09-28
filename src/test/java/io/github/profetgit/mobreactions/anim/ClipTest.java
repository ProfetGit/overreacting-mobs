package io.github.profetgit.mobreactions.anim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The Java evaluator must match Blockbench's own interpolation (dev/anim/hits/reference and dev/anim/villager/reference,
 * written by ZH.exportClips and VH.exportClips), for every clip of every rig.
 */
class ClipTest {
    static final Path ROOT = Path.of(System.getProperty("mr.root", "."));
    /** Rig id (clip folder) to its preview folder under dev/anim. */
    static final Map<String, String> RIGS = Map.of("humanoid", "hits", "villager", "villager", "quadruped", "quadruped", "spider", "spider", "creeper", "creeper", "enderman", "enderman", "pet", "pet", "golem", "golem");

    static Stream<String> clips() throws Exception {
        return RIGS.entrySet().stream().flatMap(r -> {
            try {
                return Files.list(ROOT.resolve("dev/anim/" + r.getValue() + "/reference")).map(p -> r.getKey() + "/" + p.getFileName().toString().replace(".json", ""));
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }).sorted();
    }

    @Test
    void everyRigHasReferences() throws Exception {
        for (String rig : RIGS.keySet()) {
            try (Stream<Path> refs = Files.list(ROOT.resolve("dev/anim/" + RIGS.get(rig) + "/reference"));
                 Stream<Path> clips = Files.list(ROOT.resolve("src/main/resources/assets/mobreactions/reactions/" + rig))) {
                assertEquals(clips.count(), refs.count(), rig + ": every exported clip has a Blockbench reference");
            }
        }
    }

    @ParameterizedTest
    @MethodSource("clips")
    void matchesBlockbench(String id) throws Exception {
        String rig = id.substring(0, id.indexOf('/')), name = id.substring(id.indexOf('/') + 1);
        Clip clip;
        try (Reader r = Files.newBufferedReader(ROOT.resolve("src/main/resources/assets/mobreactions/reactions/" + rig + "/" + name + ".json"))) {
            clip = Clip.parse(r);
        }
        JsonArray samples = JsonParser.parseString(Files.readString(ROOT.resolve("dev/anim/" + RIGS.get(rig) + "/reference/" + name + ".json")))
            .getAsJsonObject().getAsJsonArray("samples");
        assertFalse(samples.isEmpty());
        float[] out = new float[3];
        int checked = 0;
        for (JsonElement el : samples) {
            JsonObject s = el.getAsJsonObject();
            float t = s.get("t").getAsFloat();
            for (Map.Entry<String, JsonElement> e : s.entrySet()) {
                if (e.getKey().equals("t")) continue;
                String[] bc = e.getKey().split("\\.");
                Clip.Channel ch = switch (bc[1]) {
                    case "rot" -> Clip.Channel.ROT;
                    case "pos" -> Clip.Channel.POS;
                    default -> Clip.Channel.SCALE;
                };
                clip.sample(bc[0], ch, t, out);
                JsonArray want = e.getValue().getAsJsonArray();
                for (int a = 0; a < 3; a++) {
                    assertEquals(want.get(a).getAsFloat(), out[a], 2e-3f, id + " " + e.getKey() + "[" + a + "] at t=" + t);
                    checked++;
                }
            }
        }
        System.out.println(id + ": " + checked + " values match Blockbench");
    }
}
