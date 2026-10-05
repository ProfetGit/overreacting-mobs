-- Overreacting Mobs icon sprites. Run through the aseprite MCP: dofile("<abs>/MobReactions/dev/icon/draw_sprites.lua")
-- The zombie is one 32x32 atlas (every face of every cube is a region), drawn from scratch in the vanilla silhouette.
-- Shaded copies (side / under) and tint copies (hurt red, flash white) are made from it, because the render uses
-- shading:false. Expressions are separate 8x8 face planes (features only) that sit on the head's front.
-- fx_star, fx_ring, fx_puff, fx_spark and fx_smear are copied from Veinminer's sprites (same author).
dofile("/home/emppu/Projects/Minecraft Datapacks/.claude/skills/pack-icon-animation/assets/pixel_art.lua")
local OUT = "/home/emppu/Projects/Minecraft Datapacks/mods/MobReactions/dev/icon/sprites/"
local pc = app.pixelColor

local skin = { a = "#1E3A1C", b = "#2E5A26", c = "#3F7A30", d = "#56993A", e = "#72B84A", f = "#98D468" }
local shirt = { A = "#0F3E4A", B = "#16606C", C = "#1F8590", D = "#2BA9AE", E = "#52CCC8", F = "#8EE8DE" }
local pants = { p = "#1C1848", q = "#2A2870", r = "#3A3D96", s = "#4E56B8", t = "#6E7AD4", u = "#9AA6EC" }
local ink = { k = "#0E1A12", K = "#050A07", w = "#F4F6EE", W = "#FFFFFF", m = "#6B1A1A", n = "#B8433A" }
local iron = { I = "#2B2E3E", J = "#555A70", L = "#8D93A8", M = "#C3C8D6", N = "#EEF1F6" }
local wood = { Q = "#2E1D0B", V = "#5E3F1B", h = "#9C6D35", H = "#C0904E" }
local gold = { G = "#6B3413", g = "#E8891C", y = "#FFE14D", Y = "#FFF7BD" }
local function merge(...)
  local out = {}
  for _, t in ipairs({ ... }) do for k, v in pairs(t) do out[k] = v end end
  return out
end
local ALL = merge(skin, shirt, pants, ink)

-- ---- the atlas ------------------------------------------------------------------------------------------------------
local px = {}
local function put(ox, oy, rows)
  for y = 1, #rows do
    for x = 1, #rows[y] do
      local c = ALL[rows[y]:sub(x, x)]
      if c then px[PA.key(ox + x - 1, oy + y - 1)] = c end
    end
  end
end
-- head (8x8 faces): skin with a light top/left bevel, a dark bottom/right one and a few rot patches
put(0, 0, { "effeeeee", "eddddddc", "eddddddc", "eddddddc", "edddddcc", "eddddddc", "edddcddc", "cccccccb" })   -- front
put(8, 0, { "eeeeeeef", "edddcddc", "eddddddc", "ecddddcc", "eddddddc", "eddcdddc", "eddddddc", "cccccccb" })   -- side
put(16, 0, { "ffffffff", "feeeeeed", "feedeeed", "feeeeeed", "feeeeded", "feeeeeed", "fedeeeed", "dddddddd" }) -- top
put(24, 0, { "eeeeeeee", "eddddddc", "eddcdddc", "eddddddc", "eddddddc", "edddddcc", "eddddddc", "cccccccb" })  -- back
-- body 8x12 front: skin collar, torn cyan shirt, blue belt line and pants
put(0, 8, {
  "EEEeeEEE",
  "EDDdcDDC",
  "EDDDDDDC",
  "EDDCDDDC",
  "EDDDDDDC",
  "EDDDDDCC",
  "EDDDDDDC",
  "EDCDDDDC",
  "CCCDCCDC",
  "tssssssr",
  "ssssssrr",
  "rrrrrrrq",
})
put(8, 8, { "EDDC", "EDDC", "EDDC", "EDDC", "EDCC", "EDDC", "EDDC", "EDDC", "CCDC", "tssr", "sssr", "rrrq" })   -- body side
-- legs 4x12: pants, darker shoes
put(12, 8, { "tssr", "tssr", "tssr", "tsrr", "tssr", "tssr", "tssr", "tssr", "tsrr", "rrrq", "qqqp", "qqqp" })  -- leg front
put(16, 8, { "tssr", "tssr", "tsrr", "tssr", "tssr", "tssr", "tssr", "trsr", "tssr", "rrrq", "qqqp", "qqqp" })  -- leg side
-- arms point forward (boxes along z): side strip 12x4 (shoulder left, hand right), top strip 4x12 (shoulder on top)
put(20, 8, { "EEEEEeeeeeef", "DDDDCddddddd", "DDCDCddcdddd", "CCCCBccccccb" })                              -- arm side
put(0, 24, { "feeeeeeEEEEE", "dddddddCDDDD", "ddddcddCDCDD", "bccccccBCCCC" })                              -- arm side, flipped (east faces)
put(20, 12, { "eeed", "eddc", "eddc", "cccb" })                                                               -- hand (arm end)
put(24, 12, { "EEEF", "EDDC", "EDDC", "CCCB" })                                                               -- shoulder end
put(28, 8, { "EEEF", "EDDC", "EDDC", "EDCC", "EDDC", "CCCC", "eeef", "eddc", "eddc", "edcc", "eddc", "eddc" })   -- arm top
put(0, 20, { "EEEEEEEE", "EDDDDDDC", "EDDDDDDC", "CCCCCCCB" })                                                  -- body top
put(8, 20, { "qqqp", "qppp", "qppp", "pppp" })                                                                 -- leg sole
PA.save_pixels(OUT .. "zombie", 32, 32, px)

-- shaded copies: one step (side faces) and two steps (under / back faces) down each ramp
local function steps(n)
  local m = {}
  for _, ro in ipairs({ { skin, "abcdef", "#122612" }, { shirt, "ABCDEF", "#0A2A33" }, { pants, "pqrstu", "#120F30" } }) do
    local ramp, order, floor = ro[1], ro[2], ro[3]
    for i = 1, #order do
      local j = i - n
      m[ramp[order:sub(i, i)]] = j >= 1 and ramp[order:sub(j, j)] or floor
    end
  end
  return m
end
PA.remap(OUT .. "zombie.aseprite", OUT .. "zombie_side", steps(1))
PA.remap(OUT .. "zombie.aseprite", OUT .. "zombie_under", steps(2))

-- tints: lerp every opaque pixel toward a colour (vanilla's hurt overlay reads as a red wash; the flash as white)
-- hurt: a red monotone of the pixel's brightness, mixed k over the original (a plain lerp to red turned green mud-brown)
local function hurt(src, dst, k)
  local s = Sprite{ fromFile = src }
  local out = {}
  for it in s.cels[1].image:pixels() do
    local v = it()
    if pc.rgbaA(v) > 0 then
      local r, g, b = pc.rgbaR(v), pc.rgbaG(v), pc.rgbaB(v)
      local L = 0.3 * r + 0.59 * g + 0.11 * b
      local tr, tg, tb = math.min(255, L * 1.35 + 70), L * 0.5, L * 0.45
      local f = function(c, t) return math.floor(c + (t - c) * k + 0.5) end
      out[PA.key(it.x, it.y)] = string.format("#%02X%02X%02X", f(r, tr), f(g, tg), f(b, tb))
    end
  end
  local w, h = s.width, s.height
  s:close()
  PA.save_pixels(dst, w, h, out)
end
local function tint(src, dst, target, k)
  local s = Sprite{ fromFile = src }
  local tr, tg, tb = tonumber(target:sub(2, 3), 16), tonumber(target:sub(4, 5), 16), tonumber(target:sub(6, 7), 16)
  local out = {}
  for it in s.cels[1].image:pixels() do
    local v = it()
    if pc.rgbaA(v) > 0 then
      local f = function(c, t) return math.floor(c + (t - c) * k + 0.5) end
      out[PA.key(it.x, it.y)] = string.format("#%02X%02X%02X", f(pc.rgbaR(v), tr), f(pc.rgbaG(v), tg), f(pc.rgbaB(v), tb))
    end
  end
  local w, h = s.width, s.height
  s:close()
  PA.save_pixels(dst, w, h, out)
end
for _, v in ipairs({ "zombie", "zombie_side", "zombie_under" }) do
  hurt(OUT .. v .. ".aseprite", OUT .. v .. "_hurt", 0.75)
  tint(OUT .. v .. ".aseprite", OUT .. v .. "_flash", "#FFFFFF", 0.72)
end

-- ---- expressions: 8x8 face planes, features only (the head's skin shows through); not tinted, so the eyes stay white ------------------------------------
local faces = {
  normal = { "........", "........", "........", ".kk..kk.", ".kK..Kk.", "........", "..kkkk..", "........" },
  blink = { "........", "........", "........", "........", ".kk..kk.", "........", "..kkkk..", "........" },
  squint = { "........", "kk....kk", ".kk..kk.", "..k..k..", ".kk..kk.", "kk....kk", "..mnnm..", "........" },
  surprised = { "........", ".ww..ww.", "wwkwwkww", "wwKwwKww", ".ww..ww.", "...kk...", "...mm...", "...kk..." },
  dizzy = { "........", "........", "kkk.kkk.", "..k...k.", "k.k.k.k.", "kkk.kkk.", "........", "..nnkk.." },
  dizzy2 = { "........", "........", "kkk.kkk.", "k.k.k.k.", "k...k...", "kkk.kkk.", "........", "..kknn.." },
  grumpy = { "........", "........", "kk....kk", ".kk..kk.", ".kK..Kk.", "........", "..kkkk..", ".k....k." },
}
for name, rows in pairs(faces) do
  PA.sprite_from_grid(OUT .. "face_" .. name, rows, ink)
end

-- ---- iron sword: vanilla layout (blade on the diagonal, guard across it, grip and pommel bottom-left) ----------------
PA.sprite_from_grid(OUT .. "sword_item", {
  ".............NNI",
  "............NNMI",
  "...........NNMI.",
  "..........NNMI..",
  ".........NNMI...",
  "........NNMI....",
  ".......NNMI.....",
  "......NNMI......",
  "...J.NNMI.......",
  "...LJNMI........",
  "....LJJI........",
  "...hV.JJ........",
  "..hV...J........",
  ".hV.............",
  "JQ..............",
  "IJ..............",
}, merge(iron, wood))

-- dizzy star: small 5x5 yellow star that orbits the head
PA.sprite_from_grid(OUT .. "fx_dizzy", {
  "..G..",
  ".GyG.",
  "GyYyG",
  ".GyG.",
  "..G..",
}, gold)
-- sweat drop (flies off the head on the shake)
PA.sprite_from_grid(OUT .. "fx_drop", {
  "..W..",
  ".WFW.",
  "WFEEW",
  "WEDDW",
  ".WWW.",
}, merge(shirt, ink))

-- zombie head items for the Description Kit (caps): the head's front with the surprised face, 2D, 12x12
PA.sprite_from_grid(OUT .. "head_item", {
  "effffeeeeeed",
  "eddddddddddc",
  "edwwddddwwdc",
  "ewwkwddwwkwc",
  "ewwKwddwwKwc",
  "edwwddddwwdc",
  "edddddkkdddc",
  "eddddcmmdddc",
  "edddddkkdddc",
  "eddcdddddddc",
  "eddddddddcdc",
  "ccccccccccbb",
}, ALL)

-- ---- backgrounds: flat berry (the icon), the banner with a few twinkles ----------------------------------------------
local BERRY, BERRY_SHADOW = "#B8457A", "#963363"
local function flat(path, w, h, extra)
  local out = {}
  for y = 0, h - 1 do for x = 0, w - 1 do out[PA.key(x, y)] = BERRY end end
  for k, c in pairs(extra or {}) do out[k] = c end
  PA.save_pixels(path, w, h, out)
end
flat(OUT .. "bg_flat", 64, 64)
local twinkles = {}
for _, t in ipairs({ { 6, 5, 1 }, { 60, 6, 0 }, { 106, 5, 1 }, { 116, 30, 0 }, { 186, 10, 1 }, { 186, 46, 0 }, { 110, 58, 1 }, { 12, 58, 0 }, { 62, 57, 0 } }) do
  local x, y, big = t[1], t[2], t[3] == 1
  twinkles[PA.key(x, y)] = "#E07AA8"
  if big then
    for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do twinkles[PA.key(x + d[1], y + d[2])] = "#CC5C8E" end
  end
end
flat(OUT .. "banner_bg", 192, 64, twinkles)

-- ---- banner lettering: OVERREACTING in comic yellow over MOBS in zombie green, tagline in white + yellow ----------
local INK = "#2A0F22"
local POW = { bands = { "#FFFBE0", "#FFF3A0", "#FFF3A0", "#FFE14D", "#FFE14D", "#FFE14D", "#FFC233", "#FFC233", "#FFA41F", "#FFA41F" },
              extrude = { "#C4461E", "#7A1F24" }, outline = INK }
local ZOMBIE = { bands = { "#D6F59A", "#98D468", "#98D468", "#72B84A", "#72B84A", "#72B84A", "#56993A", "#56993A", "#3F7A30", "#3F7A30" },
                 extrude = { "#2E5A26", "#1E3A1C" }, outline = INK }
PA.title_sprite(OUT .. "banner_title_top", "OVERREACTING", POW)
PA.title_sprite(OUT .. "banner_title", "MOBS", ZOMBIE)
PA.label_sprite(OUT .. "banner_tagline", "ONE HIT. BIG DRAMA.", function(i) return i > 8 and "#FFE14D" or "#FFFFFF" end, INK)
