package io.github.profetgit.mobreactions.face;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import io.github.profetgit.mobreactions.MobReactions;
import io.github.profetgit.mobreactions.react.Pose;
import io.github.profetgit.mobreactions.react.PoseHolder;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;

/**
 * Face expressions (squint, dizzy, surprised) painted onto copies of the mob's current texture, so resource packs
 * stay in charge of the look. Rules come from assets/mobreactions/faces.json, one spec per head layout (zombies and
 * skeletons share one; piglins and zombified piglins have their own, and so do the villager-style heads: zombie
 * villagers, villagers, wandering traders, witches and illagers; spiders, whose glowing eyes layer gets the expression
 * too). Built on first use, rebuilt after a resource reload. A texture with a transparent eye texel keeps its normal face.
 */
public final class Faces {
    private static final String[] NAMES = {null, "squint", "dizzy", "surprised"};

    /**
     * One head layout: texel coordinates relative to the face's top-left corner. Per expression: the ink pixels, extra
     * erase entries applied after the eyes are erased, and whether the eyes are kept (a raised brow keeps them).
     */
    private record Spec(String name, int[] origin, int[] eyeSample, int[] inkSample, int[][] erase, int[][][] ink, int[][][] extra, boolean[] keepEyes,
                        int uvWidth, boolean layers, Identifier glow) {
    }

    private record Key(Identifier texture, String spec) {
    }

    private static final Map<String, Spec> SPECS = new HashMap<>();
    private static final Map<String, String> TYPES = new HashMap<>();
    /** Babies have models and textures of their own, so their faces sit elsewhere (falls back to TYPES). */
    private static final Map<String, String> BABY_TYPES = new HashMap<>();
    private static final Map<Key, Identifier[]> CACHE = new HashMap<>();
    /** Layers drawn over the face (the drowned's outer layer, the stray's and the bogged's clothing), per expression. */
    private static final Map<Key, Identifier[]> LAYERS = new HashMap<>();
    /** Glowing eyes layers (the spider's), per expression. */
    private static final Map<Key, Identifier[]> GLOWS = new HashMap<>();

    /** What a copy of a texture is built for: the model's own texture, a layer over it, or a glowing eyes layer. */
    private enum Use { BASE, LAYER, GLOW }
    private static volatile boolean dirty;
    /** Frames drawn with an expression; the dev demo checks it. */
    public static int swapped;

    private Faces() {
    }

    public static void loadSpec() {
        try (InputStream in = Faces.class.getResourceAsStream("/assets/" + MobReactions.MOD_ID + "/faces.json")) {
            JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
            for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("types").entrySet()) TYPES.put(e.getKey(), e.getValue().getAsString());
            if (root.has("baby_types")) {
                for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("baby_types").entrySet()) BABY_TYPES.put(e.getKey(), e.getValue().getAsString());
            }
            for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("specs").entrySet()) {
                JsonObject s = e.getValue().getAsJsonObject();
                int[][][] ink = new int[NAMES.length][][], extra = new int[NAMES.length][][];
                boolean[] keep = new boolean[NAMES.length];
                JsonObject faces = s.getAsJsonObject("faces");
                for (int f = 1; f < NAMES.length; f++) {
                    JsonElement face = faces.get(NAMES[f]);
                    if (face.isJsonArray()) {
                        ink[f] = pairs(face.getAsJsonArray());
                        extra[f] = new int[0][];
                    } else {
                        JsonObject o = face.getAsJsonObject();
                        ink[f] = o.has("ink") ? pairs(o.getAsJsonArray("ink")) : new int[0][];
                        extra[f] = o.has("erase") ? pairs(o.getAsJsonArray("erase")) : new int[0][];
                        keep[f] = o.has("eyes") && o.get("eyes").getAsBoolean();
                    }
                }
                SPECS.put(e.getKey(), new Spec(e.getKey(), pair(s.getAsJsonArray("face_origin")), pair(s.getAsJsonArray("eye_sample")),
                    s.has("ink_sample") ? pair(s.getAsJsonArray("ink_sample")) : null, pairs(s.getAsJsonArray("erase")), ink, extra, keep,
                    s.has("uv_width") ? s.get("uv_width").getAsInt() : 64, !s.has("layers") || s.get("layers").getAsBoolean(),
                    s.has("glow") ? Identifier.parse(s.get("glow").getAsString()) : null));
            }
            if (!SPECS.containsKey("humanoid")) throw new IllegalStateException("no humanoid spec");
        } catch (Exception e) {
            throw new IllegalStateException("Mob Reactions: cannot load faces.json", e);
        }
    }

    public static void invalidate() {
        dirty = true;
    }

    /** The texture a mob's model is drawn with (LivingEntityRenderer.getRenderType): its expression, if one shows. */
    public static Identifier base(LivingEntityRenderState state, Identifier texture) {
        int face = face(state);
        if (face == 0 || texture == null) return texture;
        Identifier id = variants(CACHE, texture, spec(state), Use.BASE)[face];
        if (id == null) return texture;
        swapped++;
        return id;
    }

    /**
     * A layer drawn over the model with the same UVs (RenderLayer.coloredCutoutModelCopyLayerRender). A layer that
     * draws its own eyes (the bogged's) gets the expression painted on; one with holes where the eyes are (the
     * drowned's outer layer) gets the expression's pixels cleared, so the face underneath shows through.
     */
    public static Identifier layer(LivingEntityRenderState state, Identifier texture) {
        int face = face(state);
        if (face == 0 || texture == null) return texture;
        Spec spec = spec(state);
        if (!spec.layers()) return texture;
        Identifier id = variants(LAYERS, texture, spec, Use.LAYER)[face];
        return id != null ? id : texture;
    }

    /**
     * A glowing eyes layer (EyesLayer.submit): for a mob whose spec names its eyes texture, the expression's copy of it, so
     * the eyes that glow over the face (the spider's) squint and cross with it: erased eyes turn transparent, the ink glows.
     */
    public static RenderType glow(LivingEntityRenderState state, RenderType type) {
        int face = face(state);
        if (face == 0) return type;
        Spec spec = spec(state);
        if (spec.glow() == null) return type;
        Identifier id = variants(GLOWS, spec.glow(), spec, Use.GLOW)[face];
        return id != null ? RenderTypes.eyes(id) : type;
    }

    private static int face(LivingEntityRenderState state) {
        Pose p = ((PoseHolder) state).mobreactions$pose();
        return p == null || p.face <= 0 || p.face >= NAMES.length ? 0 : p.face;
    }

    private static Spec spec(LivingEntityRenderState state) {
        String type = state.entityType == null ? "" : BuiltInRegistries.ENTITY_TYPE.getKey(state.entityType).toString();
        String name = state.isBaby && BABY_TYPES.containsKey(type) ? BABY_TYPES.get(type) : TYPES.getOrDefault(type, "humanoid");
        return SPECS.getOrDefault(name, SPECS.get("humanoid"));
    }

    private static Identifier[] variants(Map<Key, Identifier[]> cache, Identifier texture, Spec spec, Use use) {
        if (dirty) {
            dirty = false;
            for (Map<Key, Identifier[]> m : List.of(CACHE, LAYERS, GLOWS)) {
                for (Identifier[] ids : m.values()) {
                    for (Identifier id : ids) if (id != null) Minecraft.getInstance().getTextureManager().release(id);
                }
                m.clear();
            }
        }
        return cache.computeIfAbsent(new Key(texture, spec.name()), k -> build(texture, spec, use));
    }

    private static Identifier[] build(Identifier base, Spec spec, Use use) {
        boolean layer = use != Use.BASE, glow = use == Use.GLOW;
        Identifier[] out = new Identifier[NAMES.length];
        Minecraft mc = Minecraft.getInstance();
        Optional<Resource> res = mc.getResourceManager().getResource(base);
        if (res.isEmpty()) return out;
        try (InputStream in = res.get().open(); NativeImage src = NativeImage.read(in)) {
            int s = src.getWidth() / spec.uvWidth();
            if (s < 1 || src.getHeight() < 32 * s) return out;
            int eye = src.getPixel(x(spec, spec.eyeSample()[0], s), y(spec, spec.eyeSample()[1], s));
            // a glowing layer is see-through except for the eyes: erased eyes turn transparent, the ink is its own glow
            boolean holes = glow || (eye >>> 24) < 128;
            if (holes && !layer) {
                MobReactions.LOG.info("Mob Reactions: {} has a transparent eye texel, keeping its face", base);
                return out;
            }
            int ink = glow ? glowInk(src, spec, s) : holes ? 0 : ink(src, spec, s, eye);
            String stem = base.getPath().replace(".png", "") + (glow ? "_glow" : layer ? "_layer" : "");
            for (int f = 1; f < NAMES.length; f++) {
                NativeImage img = new NativeImage(src.getWidth(), src.getHeight(), true);
                img.copyFrom(src);
                if (!spec.keepEyes()[f]) for (int[] e : spec.erase()) erase(img, src, spec, e, s, holes);
                for (int[] e : spec.extra()[f]) erase(img, src, spec, e, s, holes);
                for (int[] k : spec.ink()[f]) fill(img, spec, k[0], k[1], s, ink);
                Identifier id = Identifier.fromNamespaceAndPath(MobReactions.MOD_ID, "face/" + base.getNamespace() + "/" + stem + "_" + NAMES[f]);
                mc.getTextureManager().register(id, new DynamicTexture(() -> "Mob Reactions " + id, img));
                out[f] = id;
            }
        } catch (Exception e) {
            MobReactions.LOG.warn("Mob Reactions: no face textures for {}: {}", base, e.toString());
        }
        return out;
    }

    /**
     * The expression's colour. A spec can name a texel (a piglin's dark mouth, a zombie villager's brow). Otherwise dark
     * eyes (zombie, skeleton) and bright ones (the drowned's glowing cyan) ink the expression as they are; Fresh
     * Animations paints only a shallow socket there and draws the eyes as separate parts (hidden while an expression
     * shows, see compat.Emf), and ink that close to the skin would vanish, so it's darkened.
     */
    private static int ink(NativeImage src, Spec spec, int s, int eye) {
        if (spec.inkSample() != null) {
            // Fresh Animations' villager-like textures have no brow (it's a part of its own), so the sample is skin there
            int ink = src.getPixel(x(spec, spec.inkSample()[0], s), y(spec, spec.inkSample()[1], s));
            int[] e = spec.erase()[0];
            int under = e.length > 2 ? src.getPixel(x(spec, e[2], s), y(spec, e[3], s)) : src.getPixel(x(spec, e[0], s), y(spec, e[1] - 1, s));
            return distance(ink, under) < 40 ? darken(ink, 0.35F) : ink;
        }
        int skin = src.getPixel(x(spec, spec.eyeSample()[0], s), y(spec, spec.eyeSample()[1] - 1, s));
        boolean socket = luma(eye) > 50 && luma(eye) < luma(skin);
        return socket || distance(eye, skin) < 40 ? darken(eye, 0.35F) : eye;
    }

    /**
     * A glowing layer's ink: its texel at the eyes. Fresh Animations' enderman has no eyes on its face (they're parts
     * textured from a spare corner, hidden while an expression shows, see compat.Emf), so its eyes layer is see-through
     * there: then the layer's most common glowing colour, so the expression still glows on the face.
     */
    private static int glowInk(NativeImage src, Spec spec, int s) {
        int ink = src.getPixel(x(spec, spec.inkSample()[0], s), y(spec, spec.inkSample()[1], s));
        if ((ink >>> 24) >= 128) return ink;
        Map<Integer, Integer> count = new HashMap<>();
        for (int y = 0; y < src.getHeight(); y++) {
            for (int x = 0; x < src.getWidth(); x++) {
                int c = src.getPixel(x, y);
                if ((c >>> 24) >= 128) count.merge(c, 1, Integer::sum);
            }
        }
        return count.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(ink);
    }

    /** Paints a face texel with the texel above it (or the one the entry names); a layer with eye holes gets a hole. */
    private static void erase(NativeImage img, NativeImage src, Spec spec, int[] e, int s, boolean holes) {
        int from = holes ? 0 : e.length > 2 ? src.getPixel(x(spec, e[2], s), y(spec, e[3], s)) : src.getPixel(x(spec, e[0], s), y(spec, e[1] - 1, s));
        fill(img, spec, e[0], e[1], s, from);
    }

    private static void fill(NativeImage img, Spec spec, int fx, int fy, int s, int argb) {
        for (int dx = 0; dx < s; dx++) for (int dy = 0; dy < s; dy++) img.setPixel(x(spec, fx, s) + dx, y(spec, fy, s) + dy, argb);
    }

    private static int x(Spec spec, int fx, int s) {
        return (spec.origin()[0] + fx) * s;
    }

    private static int y(Spec spec, int fy, int s) {
        return (spec.origin()[1] + fy) * s;
    }

    private static int distance(int a, int b) {
        return Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
    }

    private static int darken(int argb, float f) {
        int r = Math.round(((argb >> 16) & 255) * f), g = Math.round(((argb >> 8) & 255) * f), b = Math.round((argb & 255) * f);
        return (argb & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    private static int luma(int argb) {
        return (((argb >> 16) & 255) * 3 + ((argb >> 8) & 255) * 6 + (argb & 255)) / 10;
    }

    private static int[] pair(JsonArray a) {
        int[] out = new int[a.size()];
        for (int i = 0; i < out.length; i++) out[i] = a.get(i).getAsInt();
        return out;
    }

    private static int[][] pairs(JsonArray a) {
        int[][] out = new int[a.size()][];
        for (int i = 0; i < out.length; i++) out[i] = pair(a.get(i).getAsJsonArray());
        return out;
    }
}
