package io.github.profetgit.mobreactions.anim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.Reader;
import java.util.HashMap;
import java.util.Map;

/**
 * One keyframed animation exported from Blockbench (dev/anim/hits.js, ZH.exportClips). Values stay in Blockbench
 * units (degrees, px, scale factors); times are game ticks. Sampling reproduces Blockbench's own interpolation
 * (BoneAnimator.interpolate): exact-key match, step, linear only when both ends are linear, otherwise uniform
 * Catmull-Rom through the neighbouring keys (THREE.SplineCurve with clamped ends).
 */
public final class Clip {
    public enum Channel { ROT, POS, SCALE }

    enum Interp { LINEAR, CATMULLROM, STEP }

    record Key(float t, float x, float y, float z, Interp interp) {
        float v(int axis) {
            return axis == 0 ? x : axis == 1 ? y : z;
        }
    }

    /** Blockbench treats keys closer than 1/1200 s (1/60 tick) as "at" the query time. */
    private static final float EPS = 1f / 60f;

    public final String name;
    public final float length;
    public final float land;
    /** Death clips: where the head ends up, as a rig-frame direction (x = the mob's right, z = its back), or null. */
    public final float[] lie;
    /** Death clips: the tick the body is down (lying or in its heap) and its height then in blocks; -1 when not given. */
    public final float down, rest;
    private final Map<String, Key[][]> bones = new HashMap<>();

    private Clip(String name, float length, float land, float[] lie, float down, float rest) {
        this.name = name;
        this.length = length;
        this.land = land;
        this.lie = lie;
        this.down = down;
        this.rest = rest;
    }

    public static Clip parse(Reader reader) {
        JsonObject o = JsonParser.parseReader(reader).getAsJsonObject();
        JsonArray lie = o.has("lie") && o.get("lie").isJsonArray() ? o.getAsJsonArray("lie") : null;
        Clip c = new Clip(o.get("name").getAsString(), o.get("length").getAsFloat(), o.has("land") ? o.get("land").getAsFloat() : -1,
            lie == null ? null : new float[] {lie.get(0).getAsFloat(), lie.get(1).getAsFloat()}, num(o, "down"), num(o, "rest"));
        for (Map.Entry<String, JsonElement> b : o.getAsJsonObject("bones").entrySet()) {
            JsonObject chans = b.getValue().getAsJsonObject();
            Key[][] arr = new Key[Channel.values().length][];
            arr[Channel.ROT.ordinal()] = keys(chans.getAsJsonArray("rot"));
            arr[Channel.POS.ordinal()] = keys(chans.getAsJsonArray("pos"));
            arr[Channel.SCALE.ordinal()] = keys(chans.getAsJsonArray("scale"));
            c.bones.put(b.getKey(), arr);
        }
        return c;
    }

    private static float num(JsonObject o, String key) {
        return o.has(key) ? o.get(key).getAsFloat() : -1;
    }

    private static Key[] keys(JsonArray a) {
        if (a == null || a.isEmpty()) return null;
        Key[] out = new Key[a.size()];
        for (int i = 0; i < out.length; i++) {
            JsonObject k = a.get(i).getAsJsonObject();
            JsonArray v = k.getAsJsonArray("v");
            Interp in = switch (k.get("i").getAsString()) {
                case "linear" -> Interp.LINEAR;
                case "step" -> Interp.STEP;
                default -> Interp.CATMULLROM;
            };
            out[i] = new Key(k.get("t").getAsFloat(), v.get(0).getAsFloat(), v.get(1).getAsFloat(), v.get(2).getAsFloat(), in);
        }
        java.util.Arrays.sort(out, (p, q) -> Float.compare(p.t, q.t));
        return out;
    }

    public boolean has(String bone, Channel ch) {
        Key[][] b = bones.get(bone);
        return b != null && b[ch.ordinal()] != null;
    }

    /**
     * Event keys of a step track (the key's time and its position x), e.g. the iron golem's dust track: a non-zero value
     * is an event at that tick. Empty when the clip has no such track.
     */
    public float[][] events(String bone) {
        Key[][] b = bones.get(bone);
        Key[] ks = b == null ? null : b[Channel.POS.ordinal()];
        if (ks == null) return new float[0][];
        float[][] out = new float[ks.length][];
        for (int i = 0; i < ks.length; i++) out[i] = new float[] {ks[i].t, ks[i].x};
        return out;
    }

    /** Writes the channel's value at tick {@code t} into {@code out}; channels without keys give 0 (or 1 for scale). */
    public void sample(String bone, Channel ch, float t, float[] out) {
        Key[][] b = bones.get(bone);
        Key[] ks = b == null ? null : b[ch.ordinal()];
        if (ks == null) {
            float d = ch == Channel.SCALE ? 1 : 0;
            out[0] = d;
            out[1] = d;
            out[2] = d;
            return;
        }
        for (int axis = 0; axis < 3; axis++) out[axis] = eval(ks, t, axis);
    }

    static float eval(Key[] ks, float t, int axis) {
        int before = -1, after = -1;
        for (int i = 0; i < ks.length; i++) {
            if (ks[i].t < t) {
                if (before < 0 || ks[i].t > ks[before].t) before = i;
            } else if (after < 0 || ks[i].t < ks[after].t) {
                after = i;
            }
        }
        if (before >= 0 && Math.abs(ks[before].t - t) < EPS) return ks[before].v(axis);
        if (after >= 0 && Math.abs(ks[after].t - t) < EPS) return ks[after].v(axis);
        if (before >= 0 && ks[before].interp == Interp.STEP) return ks[before].v(axis);
        if (after < 0) return ks[before].v(axis);
        if (before < 0) return ks[after].v(axis);
        Key a = ks[before], b = ks[after];
        float u = (t - a.t) / (b.t - a.t);
        if (a.interp == Interp.LINEAR && (b.interp == Interp.LINEAR || b.interp == Interp.STEP)) {
            return a.v(axis) + (b.v(axis) - a.v(axis)) * u;
        }
        float p0 = before > 0 ? ks[before - 1].v(axis) : a.v(axis);
        float p3 = after + 1 < ks.length ? ks[after + 1].v(axis) : b.v(axis);
        return catmullRom(u, p0, a.v(axis), b.v(axis), p3);
    }

    /** THREE.js Interpolations.CatmullRom. */
    static float catmullRom(float t, float p0, float p1, float p2, float p3) {
        float v0 = (p2 - p0) * 0.5f, v1 = (p3 - p1) * 0.5f, t2 = t * t, t3 = t * t2;
        return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
    }
}
