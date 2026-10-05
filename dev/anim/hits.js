// Mob Reactions: the rigs, keyframed hit reactions, preview renderer and exporter. Runs inside Blockbench.
//   eval(require('fs').readFileSync('<this file>', 'utf8')); window.ZH = ZH; window.VH = VH; ZH.loadTextures()
//   then, in a separate call: ZH.build(); ZH.animateAll(); ZH.save(); ZH.exportClips()
//   ZH.render('hit_front') -> dev/anim/hits/frames/hit_front/, then: python3 dev/anim/hitgif.py hit_front
// Two rigs, one engine (makeHits): ZH is the humanoid rig (tab zombie_hits, clips reactions/humanoid/, previews in
// dev/anim/hits/), VH the villager-like rig (tab villager_hits, clips reactions/villager/, previews in dev/anim/villager/;
// the helper scripts take --rig villager). VH.build('illager') previews on a vindicator with its separate arms,
// VH.build('villager') on a villager with only the crossed arms (rebuild, then animateAll, to switch). QH is the quadruped
// rig (tab quadruped_hits, clips reactions/quadruped/, previews in dev/anim/quadruped/), keyed on the cow. SH is the spider rig
// (tab spider_hits, clips reactions/spider/, previews in dev/anim/spider/), keyed on the spider (the cave spider is measured).
// CH is the creeper rig (tab creeper_hits, clips reactions/creeper/, previews in dev/anim/creeper/). EH is the enderman rig
// (tab enderman_hits, clips reactions/enderman/, previews in dev/anim/enderman/). PT is the pet rig (tab pet_hits, clips
// reactions/pet/, previews in dev/anim/pet/), keyed on the wolf (fox, cat, ocelot and the babies are measured). IG is the iron
// golem (tab golem_hits, clips reactions/golem/, previews in dev/anim/golem/).
// Needs python3 dev/anim/textures.py (vanilla textures from the local jar) and dev/anim/faces.py (face previews) first.
//
// Humanoid rig space: Blockbench px (16 per block), y up, the zombie faces -z. Group rest rotations are the vanilla chasing
// zombie (arms raised 120°, AnimationUtils.animateZombieArms with isAggressive), so every key is an offset from what
// vanilla draws, and the mod adds the keys on top of vanilla's own pose (walk, head look, arm bob, attack swing).
// Bones: root (feet pivot: squash, spin), pelvis (hips: whole-body tilt), torso (waist: carries body, head, arms),
// head, arm_r/arm_l, leg_r/leg_l. Two data tracks: walk (scale x = how much of vanilla's leg swing to keep) and
// face (position x = expression: 0 normal, 1 squint, 2 dizzy, 3 surprised; step keys).
// Villager rig: the same bones and pivots (IllagerModel, VillagerModel, WitchModel: neck 24 px, hips 12 px), plus `arms`,
// the crossed-arms part (pivot 0, 21, -1, rest 43° forward; keys are offsets and it moves as one piece), and a third data
// track, cross (position x, step keys): 0 = illagers show their separate arms (arm_r/arm_l, keyed as absolute poses from
// hanging straight down), 1 = the arms are crossed again. Villagers and witches only have the crossed arms; illagers whose
// vanilla pose isn't crossed (attacking, aiming, casting) keep their separate arms and blend back into vanilla's pose.
// Authoring units in ANIMS (converted in track()):
//   root/pelvis/torso/head rot: x + = tip back / look up, y + = turn to its left, z + = lean to its left
//   arms: absolute [raise (0 down, 90 forward, 180 up), inward swing, splay], same numbers for both arms. Order is Z-Y-X
//     (raise first, splay last, about the body's forward axis): splay + moves a lowered arm out but a raised arm in, so
//     flung-out arms are a small raise plus a big splay ([20, 0, 140] = up and out, a starfish arm)
//   villager `arms` (crossed): offsets [x + = lift toward the chin, y + = turn to its left, z + = tilt to its left]
//   legs: [forward kick, toe-out twist, outward splay], same numbers for both legs
//   key flags: 'L' = arrive linearly (a snap), 'S' = hold until the next key; everything else is catmull-rom.
// Quadruped rig (the cow; the mod measures every other quadruped and moves the pivots and scales the positions to fit):
// root (feet), tip_r/tip_l (rolls about the right/left flank's edge on the ground: z - tips it onto its right side on
// tip_r, z + onto its left on tip_l), pelvis (lowering the body with its position, tilting it about the middle of the
// belly: x + = nose up / rearing, x - = rump up), head, leg_fr/leg_fl/leg_hr/leg_hl ([x + = swing forward, twist,
// splay outward], same numbers for both sides), and the walk and face tracks.
// Spider rig (SpiderModel): root (feet), pelvis (the whole body: lowering it with its position, turning it about the middle of
// the body, 9 px up: x + = nose up / rearing, y + = turn to its left, z + = roll onto its left side), head, abdomen (body1,
// about its joint with the neck: x + = the tail drops, x - = it lifts) and the eight legs leg_r1..leg_r4 / leg_l1..leg_l4
// (front to hind). Legs are offsets from vanilla's splayed rest: [lift (+ = the tip up), swing (+ = the tip forward), twist],
// same numbers for both sides. Lying on its back is pelvis x or z 180 with the pelvis lowered 5 px.
// Creeper rig (CreeperModel): root (feet), pelvis (the whole body about the hips, 6 px up), torso (body and head about the
// hips, the legs stay planted), head (about the neck, 18 px up) and leg_fr/fl/hr/hl (the quadruped's units).
// `carrier` is the real zombie's position (vanilla knockback, recorded on a 26.3 server). It is not animation.
function makeHits(RIG) {
  const fs = require('fs');
  const V = RIG === 'villager', Q = RIG === 'quadruped', S = RIG === 'spider', C = RIG === 'creeper', E = RIG === 'enderman', P = RIG === 'pet', IG = RIG === 'golem';
  const ROOT = '/home/emppu/Projects/Minecraft Datapacks/mods/MobReactions/';
  const DIR = ROOT + 'dev/anim/';
  const OUT = DIR + (V ? 'villager/' : Q ? 'quadruped/' : S ? 'spider/' : C ? 'creeper/' : E ? 'enderman/' : P ? 'pet/' : IG ? 'golem/' : 'hits/');
  const CLIPS = ROOT + 'src/main/resources/assets/mobreactions/reactions/' + (V ? 'villager/' : Q ? 'quadruped/' : S ? 'spider/' : C ? 'creeper/' : E ? 'enderman/' : P ? 'pet/' : IG ? 'golem/' : 'humanoid/');
  const FPS = 20, PX = 16, NAME = V ? 'villager_hits' : Q ? 'quadruped_hits' : S ? 'spider_hits' : C ? 'creeper_hits' : E ? 'enderman_hits' : P ? 'pet_hits' : IG ? 'golem_hits' : 'zombie_hits', SUB = 2.5; // preview frames per tick (50 fps)
  const TEX_W = IG ? 128 : 64, TEX_H = IG ? 128 : S || C || E || P ? 32 : 64, CAM_Y = S || P ? 8 : C ? 14 : E || IG ? 24 : 18;
  const ARM_REST = V || E || IG ? [0, 0, 0] : [120, 5.73, 0];
  // villager rig: vanilla's crossed arms (IllagerModel/VillagerModel "arms", xRot -0.75 rad) and the separate-arm pose that
  // lines up with them, which illagers pass through when they cross their arms again
  const ARMS_REST = [42.97, 0, 0], CROSS = [58, 30, 0];
  const FACES = ['', '_squint', '_dizzy', '_surprised'];
  // the spider previews with its glowing eyes layer baked onto the texture (faces.py writes spider_glow*.png)
  const SKINS = V ? ['vindicator', 'villager'] : Q ? ['cow'] : S ? ['spider_glow'] : C ? ['creeper'] : E ? ['enderman_glow'] : P ? ['wolf'] : IG ? ['iron_golem'] : ['zombie'];

  // ---------- own tab (Blockbench is shared with other sessions) ----------
  let uuid = null;
  function own() {
    let p = uuid && ModelProject.all.find(q => q.uuid === uuid);
    if (!p) p = ModelProject.all.find(q => q.name === NAME || q.name === NAME + '.bbmodel');
    if (!p) throw new Error('no ' + NAME + ' tab');
    uuid = p.uuid;
    if (Project !== p) p.select();
    return p;
  }
  function lock(ms) {
    const L = window.BB_LOCK;
    if (L && L.owner !== NAME && L.until > Date.now()) throw new Error('Blockbench locked by ' + L.owner);
    window.BB_LOCK = { owner: NAME, until: Date.now() + ms };
  }
  const unlock = () => { if (window.BB_LOCK && window.BB_LOCK.owner === NAME) window.BB_LOCK = null; };

  // ---------- rig ----------
  const tex = {}, G = {}, HEADS = [];
  let variant = SKINS[0] === 'vindicator' ? 'illager' : SKINS[0];
  const skin = () => (variant === 'illager' ? 'vindicator' : variant);
  function loadTextures() {
    own();
    Project.texture_width = TEX_W; Project.texture_height = TEX_H;
    Texture.all.slice().forEach(t => t.remove(true));
    for (const s of SKINS) for (const f of FACES) {
      const url = 'data:image/png;base64,' + fs.readFileSync(DIR + 'textures/' + s + f + '.png').toString('base64');
      const t = new Texture({ name: s + f + '.png' }).fromDataURL(url).add(false);
      t.uv_width = TEX_W; t.uv_height = TEX_H;
      tex[s + f] = t;
    }
    return Object.keys(tex).join(', ') + ' loaded';
  }
  function ensure() {
    own();
    if (!tex[skin()]) SKINS.forEach(s => FACES.forEach(f => { tex[s + f] = Texture.all.find(t => t.name === s + f + '.png'); }));
    if (!G.carrier || !Group.all.includes(G.carrier)) Group.all.forEach(g => { G[g.name] = g; });
    if (V && G.arms) variant = G.arm_r && Group.all.includes(G.arm_r) ? 'illager' : 'villager';
    if (!HEADS.length || !Cube.all.includes(HEADS[0])) {
      HEADS.length = 0;
      FACES.forEach(f => HEADS.push(Cube.all.find(c => c.name === 'head' + f)));
    }
  }
  function group(name, origin, parent, rotation) {
    const g = new Group({ name, origin, rotation: rotation || [0, 0, 0] });
    g.addTo(parent); g.init(); G[name] = g;
    return g;
  }
  function cube(name, from, to, uv, parent, o, t) {
    const c = new Cube(Object.assign({ name, from, to, box_uv: true, uv_offset: uv }, o || {}));
    c.addTo(parent); c.init(); c.applyTexture(t || tex[skin()], true);
    return c;
  }
  // vanilla HumanoidModel.createMesh boxes and pivots (ZombieModel, 64x64), x mirrored into Blockbench space.
  // The head has one cube per face texture; only the current expression is drawn.
  function build(v) {
    if (V) return buildVillager(v);
    if (Q) return buildQuadruped();
    if (S) return buildSpider();
    if (C) return buildCreeper();
    if (E) return buildEnderman();
    if (P) return buildPet();
    if (IG) return buildGolem();
    ensure();
    Project.texture_width = 64; Project.texture_height = 64;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 12, 0], G.root);
    group('torso', [0, 12, 0], G.pelvis);
    cube('body', [-4, 12, -2], [4, 24, 2], [16, 16], G.torso);
    group('head', [0, 24, 0], G.torso);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 24, -4], [4, 32, 4], [0, 0], G.head, {}, tex['zombie' + f])));
    cube('hat', [-4, 24, -4], [4, 32, 4], [32, 0], G.head, { inflate: 0.5 });
    group('arm_r', [5, 22, 0], G.torso, [ARM_REST[0], ARM_REST[1], 0]);
    cube('arm_r', [4, 12, -2], [8, 24, 2], [40, 16], G.arm_r);
    group('arm_l', [-5, 22, 0], G.torso, [ARM_REST[0], -ARM_REST[1], 0]);
    cube('arm_l', [-8, 12, -2], [-4, 24, 2], [40, 16], G.arm_l, { mirror_uv: true });
    group('leg_r', [1.9, 12, 0], G.pelvis);
    cube('leg_r', [-0.1, 0, -2], [3.9, 12, 2], [0, 16], G.leg_r);
    group('leg_l', [-1.9, 12, 0], G.pelvis);
    cube('leg_l', [-3.9, 0, -2], [0.1, 12, 2], [0, 16], G.leg_l, { mirror_uv: true });
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }
  // vanilla IllagerModel / VillagerModel boxes and pivots (64x64), x mirrored into Blockbench space (model y down from the
  // neck: Blockbench y = 24 - model y). 'illager' (vindicator texture) adds the separate arms, 'villager' has only the
  // crossed ones and the jacket.
  function buildVillager(v) {
    ensure();
    if (v) variant = v;
    const T = f => tex[skin() + (f || '')];
    Project.texture_width = 64; Project.texture_height = 64;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 12, 0], G.root);
    group('torso', [0, 12, 0], G.pelvis);
    cube('body', [-4, 12, -3], [4, 24, 3], [16, 20], G.torso, {}, T());
    cube('robe', [-4, 4, -3], [4, 24, 3], [0, 38], G.torso, { inflate: 0.5 }, T());
    group('head', [0, 24, 0], G.torso);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 24, -4], [4, 34, 4], [0, 0], G.head, {}, T(f))));
    cube('nose', [-1, 23, -6], [1, 27, -4], [24, 0], G.head, {}, T());
    group('arms', [0, 21, -1], G.torso, ARMS_REST);
    cube('arms_r', [4, 15, -3], [8, 23, 1], [44, 22], G.arms, {}, T());
    cube('arms_l', [-8, 15, -3], [-4, 23, 1], [44, 22], G.arms, { mirror_uv: true }, T());
    cube('arms_bar', [-4, 15, -3], [4, 19, 1], [40, 38], G.arms, {}, T());
    if (variant === 'illager') {
      group('arm_r', [5, 22, 0], G.torso);
      cube('arm_r', [4, 12, -2], [8, 24, 2], [40, 46], G.arm_r, {}, T());
      group('arm_l', [-5, 22, 0], G.torso);
      cube('arm_l', [-8, 12, -2], [-4, 24, 2], [40, 46], G.arm_l, { mirror_uv: true }, T());
    }
    group('leg_r', [2, 12, 0], G.pelvis);
    cube('leg_r', [0, 0, -2], [4, 12, 2], [0, 22], G.leg_r, {}, T());
    group('leg_l', [-2, 12, 0], G.pelvis);
    cube('leg_l', [-4, 0, -2], [0, 12, 2], [0, 22], G.leg_l, { mirror_uv: true }, T());
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    group('cross', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return variant + ': ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }


  // vanilla CowModel (64x64): legs 12 px, the body a 12x18x10 box turned 90° about x, the head 8x8x6 with snout and horns.
  // Model y is down from 24 px above the feet: Blockbench y = 24 - model y, x mirrored. Everything hangs off the pelvis.
  function buildQuadruped() {
    ensure();
    const T = f => tex['cow' + (f || '')];
    Project.texture_width = 64; Project.texture_height = 64;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('tip_r', [6, 0, 1], G.root);
    group('tip_l', [-6, 0, 1], G.tip_r);
    group('pelvis', [0, 12, 1], G.tip_l);
    group('body', [0, 19, 2], G.pelvis, [-90, 0, 0]);
    cube('body', [-6, 11, -5], [6, 29, 5], [18, 4], G.body, {}, T());
    cube('udder', [-2, 11, -6], [2, 17, -5], [52, 0], G.body, {}, T());
    group('head', [0, 20, -8], G.pelvis);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 16, -14], [4, 24, -8], [0, 0], G.head, {}, T(f))));
    cube('snout', [-3, 16, -15], [3, 19, -14], [1, 33], G.head, {}, T());
    cube('horn_r', [4, 22, -13], [5, 25, -12], [22, 0], G.head, {}, T());
    cube('horn_l', [-5, 22, -13], [-4, 25, -12], [22, 0], G.head, {}, T());
    for (const [n, x, z] of [['leg_hr', 4, 7], ['leg_hl', -4, 7], ['leg_fr', 4, -5], ['leg_fl', -4, -5]]) {
      group(n, [x, 12, z], G.pelvis);
      cube(n, [x - 2, 0, z - 2], [x + 2, 12, z + 2], [0, 16], G[n], x < 0 ? { mirror_uv: true } : {}, T());
    }
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'cow: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // vanilla SpiderModel (64x32): head 8x8x8 on the neck (body0, 6x6x6), abdomen (body1) 10x8x12, eight 16x2x2 legs pivoting at
  // x ±4, 9 px up (z -1, 0, 1, 2 from the front), splayed down 45° (middle pair 33.3°) and fanned out 45° / 22.5°.
  // Model y is down from 24 px above the feet: Blockbench y = 24 - model y, x mirrored (so the model's yRot is negated here).
  const SPIDER_LEGS = [['r1', -1, 45, -45], ['r2', 0, 22.5, -33.3], ['r3', 1, -22.5, -33.3], ['r4', 2, -45, -45]];
  function buildSpider() {
    ensure();
    const T = f => tex['spider_glow' + (f || '')];
    Project.texture_width = 64; Project.texture_height = 32;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 9, 0.5], G.root);
    cube('neck', [-3, 6, -3], [3, 12, 3], [0, 0], G.pelvis, {}, T());
    group('abdomen', [0, 9, 3], G.pelvis);
    cube('abdomen', [-5, 5, 3], [5, 13, 15], [0, 12], G.abdomen, {}, T());
    group('head', [0, 9, -3], G.pelvis);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 5, -11], [4, 13, -3], [32, 4], G.head, {}, T(f))));
    for (const [n, z, ry, rz] of SPIDER_LEGS) {
      group('leg_' + n, [4, 9, z], G.pelvis, [0, ry, rz]);
      cube('leg_' + n, [3, 8, z - 1], [19, 10, z + 1], [18, 0], G['leg_' + n], {}, T());
      const l = 'leg_l' + n.slice(1);
      group(l, [-4, 9, z], G.pelvis, [0, -ry, -rz]);
      cube(l, [-19, 8, z - 1], [-3, 10, z + 1], [18, 0], G[l], { mirror_uv: true }, T());
    }
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'spider: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // vanilla CreeperModel (64x32): body 8x12x4 and head 8x8x8 on it (both pivot at the neck, 18 px up), four 4x6x4 legs at
  // x ±2, z ±4 pivoting at the hips (6 px up). The rig adds a torso group at the hips that carries body and head.
  function buildCreeper() {
    ensure();
    const T = f => tex['creeper' + (f || '')];
    Project.texture_width = 64; Project.texture_height = 32;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 6, 0], G.root);
    group('torso', [0, 6, 0], G.pelvis);
    cube('body', [-4, 6, -2], [4, 18, 2], [16, 16], G.torso, {}, T());
    group('head', [0, 18, 0], G.torso);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 18, -4], [4, 26, 4], [0, 0], G.head, {}, T(f))));
    for (const [n, x, z] of [['leg_hr', 2, 4], ['leg_hl', -2, 4], ['leg_fr', 2, -4], ['leg_fl', -2, -4]]) {
      group(n, [x, 6, z], G.pelvis);
      cube(n, [x - 2, 0, z - 2], [x + 2, 6, z + 2], [0, 16], G[n], {}, T());
    }
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'creeper: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // vanilla EndermanModel (64x32): HumanoidModel's parts on stilts. Legs 2x30x2 pivoting 29 px up (model y -5; their feet
  // reach 1 px below the ground, as in vanilla), body 8x12x4 from 26 to 38, head 8x8x8 on the neck (37 px), the smaller jaw
  // (the `hat`, inflated -0.5) inside it, arms 2x30x2 hanging from the shoulders (±5, 36 px). Everything in the torso bends
  // at the hips. The preview texture has the glowing eyes baked on (faces.py writes enderman_glow*.png).
  function buildEnderman() {
    ensure();
    const T = f => tex['enderman_glow' + (f || '')];
    Project.texture_width = 64; Project.texture_height = 32;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 29, 0], G.root);
    group('torso', [0, 29, 0], G.pelvis);
    cube('body', [-4, 26, -2], [4, 38, 2], [32, 16], G.torso, {}, T());
    group('head', [0, 37, 0], G.torso);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 37, -4], [4, 45, 4], [0, 0], G.head, {}, T(f))));
    cube('hat', [-4, 37, -4], [4, 45, 4], [0, 16], G.head, { inflate: -0.5 }, T());
    group('arm_r', [5, 36, 0], G.torso);
    cube('arm_r', [4, 8, -1], [6, 38, 1], [56, 0], G.arm_r, {}, T());
    group('arm_l', [-5, 36, 0], G.torso);
    cube('arm_l', [-6, 8, -1], [-4, 38, 1], [56, 0], G.arm_l, { mirror_uv: true }, T());
    group('leg_r', [2, 29, 0], G.pelvis);
    cube('leg_r', [1, -1, -1], [3, 29, 1], [56, 0], G.leg_r, {}, T());
    group('leg_l', [-2, 29, 0], G.pelvis);
    cube('leg_l', [-3, -1, -1], [-1, 29, 1], [56, 0], G.leg_l, { mirror_uv: true }, T());
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'enderman: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // vanilla AdultWolfModel (64x32), converted from model space (pivot + box, y down from 24 px above the feet, x mirrored):
  // head (with the ears and the snout) on the neck, the body box and the mane (upper_body) turned 90° about x, 8 px legs
  // pivoting 8 px up, the tail hanging back 36° (WolfRenderState.tailAngle). Rig groups as the quadruped rig: pelvis at the
  // belly (7 px up) over the legs' middle (z 1.5), tip_r/tip_l at the flanks (±3).
  function buildPet() {
    ensure();
    const T = f => tex['wolf' + (f || '')];
    Project.texture_width = 64; Project.texture_height = 32;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    // a model-space box (pivot p, offset o, size w) as a Blockbench cube in its group
    const mc = (name, g, p, o, w, uv, opt, t) => cube(name, [-(p[0] + o[0] + w[0]), 24 - (p[1] + o[1] + w[1]), p[2] + o[2]], [-(p[0] + o[0]), 24 - (p[1] + o[1]), p[2] + o[2] + w[2]],
      uv, g, opt || {}, t || T());
    const mg = (name, p, parent, rot) => group(name, [-p[0], 24 - p[1], p[2]], parent, rot ? [-rot[0], -rot[1], rot[2]] : undefined);
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('tip_r', [3, 0, 1.5], G.root);
    group('tip_l', [-3, 0, 1.5], G.tip_r);
    group('pelvis', [0, 7, 1.5], G.tip_l);
    mg('body', [0, 14, 2], G.pelvis, [90, 0, 0]);
    mc('body', G.body, [0, 14, 2], [-3, -2, -3], [6, 9, 6], [18, 14]);
    mg('upper_body', [-1, 14, -3], G.pelvis, [90, 0, 0]);
    mc('upper_body', G.upper_body, [-1, 14, -3], [-3, -3, -3], [8, 6, 7], [21, 0]);
    const HP = [-1, 13.5, -7];
    mg('head', HP, G.pelvis);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(mc('head' + f, G.head, HP, [-2, -3, -2], [6, 6, 4], [0, 0], {}, T(f))));
    mc('ear_r', G.head, HP, [-2, -5, 0], [2, 2, 1], [16, 14]);
    mc('ear_l', G.head, HP, [2, -5, 0], [2, 2, 1], [16, 14]);
    mc('snout', G.head, HP, [-0.5, -0.001, -5], [3, 3, 4], [0, 10]);
    for (const [n, p, mir] of [['leg_hr', [-2.5, 16, 7], true], ['leg_hl', [0.5, 16, 7], false], ['leg_fr', [-2.5, 16, -4], true], ['leg_fl', [0.5, 16, -4], false]]) {
      mg(n, p, G.pelvis);
      mc(n, G[n], p, [0, 0, -1], [2, 8, 2], [0, 18], mir ? { mirror_uv: true } : {});
    }
    mg('tail', [-1, 12, 8], G.pelvis, [36, 0, 0]);
    mc('tail', G.tail, [-1, 12, 8], [0, 0, -1], [2, 8, 2], [9, 18]);
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'wolf: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // vanilla IronGolemModel (128x128): body 18x12x11 plus the waist 9x5x6 (the torso group bends them at the waist, 16 px
  // up), head 8x10x8 with the nose on the neck (31 px), arms 4x30x6 (vanilla pivots them at the body's centre, which is the
  // same for their only vanilla turn, xRot; here and in the mod they turn about the shoulders at x ±11), legs 6x16x5
  // pivoting 13 px up. Tracks: walk, face and dust.
  function buildGolem() {
    ensure();
    const T = f => tex['iron_golem' + (f || '')];
    Project.texture_width = 128; Project.texture_height = 128;
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    for (const k of Object.keys(G)) delete G[k];
    group('carrier', [0, 0, 0]);
    group('root', [0, 0, 0], G.carrier);
    group('pelvis', [0, 13, 0], G.root);
    group('torso', [0, 16, 0], G.pelvis);
    cube('body', [-9, 21, -6], [9, 33, 5], [0, 40], G.torso, {}, T());
    cube('waist', [-4.5, 16, -3], [4.5, 21, 3], [0, 70], G.torso, { inflate: 0.5 }, T());
    group('head', [0, 31, -2], G.torso);
    HEADS.length = 0;
    FACES.forEach(f => HEADS.push(cube('head' + f, [-4, 33, -7.5], [4, 43, 0.5], [0, 0], G.head, {}, T(f))));
    cube('nose', [-1, 32, -9.5], [1, 36, -7.5], [24, 0], G.head, {}, T());
    group('arm_r', [11, 31, 0], G.torso);
    cube('arm_r', [9, 3.5, -3], [13, 33.5, 3], [60, 21], G.arm_r, {}, T());
    group('arm_l', [-11, 31, 0], G.torso);
    cube('arm_l', [-13, 3.5, -3], [-9, 33.5, 3], [60, 58], G.arm_l, {}, T());
    group('leg_r', [4, 13, 0], G.pelvis);
    cube('leg_r', [1.5, 0, -3], [7.5, 16, 2], [37, 0], G.leg_r, {}, T());
    group('leg_l', [-5, 13, 0], G.pelvis);
    cube('leg_l', [-7.5, 0, -3], [-1.5, 16, 2], [60, 0], G.leg_l, { mirror_uv: true }, T());
    group('walk', [0, 0, 0]);
    group('face', [0, 0, 0]);
    group('dust', [0, 0, 0]);
    HEADS.slice(1).forEach(c => { c.visibility = false; });
    Canvas.updateAll();
    return 'iron golem: ' + Group.all.length + ' groups, ' + Cube.all.length + ' cubes';
  }

  // ---------- vanilla motion of the real zombie (preview only) ----------
  // Recorded on 26.3 (dev/test explore, `damage ... by <player>`): offsets from the hit spot per tick after the hit.
  // front: zombie walking at the player; knocked 1.25 back, 0.96 up, lands on tick 10, walks straight back in.
  const REC_FRONT = {
    z: [0, 0.3153, 0.4829, 0.6308, 0.7607, 0.8743, 0.9732, 1.0586, 1.1316, 1.1935, 1.2452, 1.2394, 1.1833, 1.0998, 1.0013,
      0.8946, 0.7834, 0.6698, 0.5549, 0.4393, 0.3232, 0.2069, 0.0906, -0.0259, -0.1424],
    y: [0, 0.3608, 0.6360, 0.8273, 0.9363, 0.9648, 0.9143, 0.7864, 0.5827, 0.3046],
  };
  // standing zombie hit in the back: knocked 1.99 forward, same hop, then it stood still (no turn within 26 ticks)
  const REC_STILL = {
    z: [0, 0.4, 0.618, 0.817, 0.998, 1.163, 1.312, 1.449, 1.573, 1.686, 1.788, 1.882, 1.933, 1.961, 1.976, 1.984, 1.989],
    y: REC_FRONT.y,
  };
  const WALK = 0.1165; // blocks per tick, measured
  // sprint hit: LivingEntity.knockback(0.4) from hurt, then Player.attack's knockback(0.5) while still on ground.
  // Not recorded (the mock player can't sprint-attack): simulated with constants fitted to REC_FRONT.
  function simSprint() {
    const z = [0], y = [0];
    let vy = 0.4, h = 0, v = 0.675, m = 0, air = true, py = 0;
    for (let k = 1; k <= 40; k++) {
      if (air) {
        py += vy; vy = (vy - 0.08) * 0.98;
        m = k === 1 ? 0.9 * v : k === 2 ? 0.48 * v : 0.91 * m - 0.0045;
        if (py <= 0) { py = 0; air = false; }
      } else m = Math.max(-WALK, m * 0.546 - 0.053);
      h += m; z.push(h); y.push(py);
    }
    return { z, y };
  }
  // Carrier: before the hit it walks forward (rig-local -z); from the hit on it follows the recording along `knock`
  // (a rig-local unit vector), then either walks back at the attacker ('walk') or stands ('stop').
  function carrierTrack(rec, knock, after) {
    return f => {
      if (f < 0) return { l: [0, 0, -WALK * f], up: 0 };
      const n = rec.z.length - 1;
      const d = f <= n ? rec.z[f] : rec.z[n] + (after === 'walk' ? -WALK * (f - n) : 0);
      return { l: [knock[0] * d, 0, knock[2] * d], up: f < rec.y.length ? rec.y[f] : 0 };
    };
  }
  // A dead mob doesn't walk back in: from the landing tick on it only slides to a stop (ground friction 0.546).
  function dead(rec, land) {
    const z = rec.z.slice(0, land + 1);
    let v = z[land] - z[land - 1];
    for (let f = land + 1; f <= 60; f++) { v *= 0.546; z.push(z[f - 1] + v); }
    return { z, y: rec.y };
  }
  // preview world: yaw (deg, + = turn left; 0 = facing -z, toward the attacker) and knock direction
  const SETUPS = {
    front: { yaw: 0, track: () => carrierTrack(REC_FRONT, [0, 0, 1], 'walk') },
    launch: { yaw: 0, track: () => carrierTrack(simSprint(), [0, 0, 1], 'walk') },
    back: { yaw: 180, track: () => carrierTrack(REC_STILL, [0, 0, -1], 'stop') },
    side_r: { yaw: 90, track: () => carrierTrack(REC_STILL, [-1, 0, 0], 'stop') },
    side_l: { yaw: -90, track: () => carrierTrack(REC_STILL, [1, 0, 0], 'stop') },
    front_dead: { yaw: 0, track: () => carrierTrack(dead(REC_FRONT, 10), [0, 0, 1], 'stop') },
    launch_dead: { yaw: 0, track: () => carrierTrack(dead(simSprint(), simSprint().y.findIndex((h, i) => i > 0 && h === 0)), [0, 0, 1], 'stop') },
    still: { yaw: 0, track: () => f => ({ l: [0, 0, f < 0 ? -WALK * f : 0], up: 0 }) },
  };


  const BONES = ['root', 'tip_r', 'tip_l', 'pelvis', 'torso', 'head', 'arms', 'arm_r', 'arm_l', 'leg_r', 'leg_l', 'leg_fr', 'leg_fl', 'leg_hr', 'leg_hl',
    'abdomen', 'leg_r1', 'leg_r2', 'leg_r3', 'leg_r4', 'leg_l1', 'leg_l2', 'leg_l3', 'leg_l4', 'tail'];
  function deathClip(ANIMS, base, cut, d) {
    const b = ANIMS[base], out = { setup: d.setup, len: d.len, land: d.land !== undefined ? d.land : b.land, lie: d.lie || null, down: d.down, rest: d.rest };
    for (const bone of BONES) {
      const src = b[bone] || {}, add = d[bone] || {}, chans = {};
      for (const ch of ['rot', 'pos', 'scale']) {
        const keys = (src[ch] || []).filter(k => k[0] <= cut).concat((add[ch] || []).filter(k => k[0] > cut));
        if (keys.length) chans[ch] = keys;
      }
      if (Object.keys(chans).length) out[bone] = chans;
    }
    out.walk = [[0, 0, 'L']];
    out.face = d.face;
    if (d.cross) out.cross = d.cross;
    return out;
  }
  // ---------- the humanoid reactions ----------
  function humanoidAnims() {
    // ---------- the reactions ----------
    // Shared beats (v3, after "too squishy" / "want real impact"): tick 0 snaps straight into the recoil pose and
    // tick 1 repeats it, so the mod's hit-stop holds it still (with a shake and a white flash) until the knockback
    // shows on screen. Ticks 1-3 release into the follow-through: the part that was hit leads, the head whips after
    // it, arms and legs lag behind with their inertia. Squash is only a few percent; landings bend the knees by
    // dipping the body (root position) instead. The real zombie is airborne for about ticks 1-9 and the mod
    // stretches that part to its actual flight, so the landing key always lands on touchdown.
    const ANIMS = {
      // Front, the first charged hit (heavy, picked 2026-09-25): a slash across the chest from its right (the mod mirrors it
      // for a right-handed swing, which arrives on its left). The impact is the most extreme pose, asymmetric and held dead
      // still: chest caved back and turned with the sweep, knees buckling, the near arm flung high and out, the far one lower
      // and forward. On the release the head whips a tick late; in the air the body keeps turning with the slash while the
      // head turns back to find the attacker, the near arm keeps rising, the far one swings across, one leg tucks up, and it
      // rights itself gradually from the apex. It lands hard: folds forward over a wide stumble, settles twice, stays
      // hunched for a beat, straightens slowly and shakes its head before it comes back.
      hit_front: {
        setup: 'front', len: 26, land: 10,
        root: {
          pos: [[0, [0, -0.6, 0], 'L'], [1, [0, -0.6, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]],
            [13, [0, -0.6, 0]], [15, [0, -0.9, 0]], [18, [0, 0, 0]]],
          rot: [[0, [0, 6, 0], 'L'], [1, [0, 6, 0], 'L'], [4, [0, 10, 0]], [7, [0, 14, 0]], [10, [0, 8, 0]], [13, [0, 6, 0]], [17, [0, 0, 0]]],
          scale: [[0, [1.03, 0.96, 0.95], 'L'], [1, [1.03, 0.96, 0.95], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'],
            [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [4, 0, 0], 'L'], [1, [4, 0, 0], 'L'], [3, [12, 0, 0]], [5, [10, 0, 0]], [7, [6, 0, 0]], [9, [1, 0, 0]], [10, [0, 0, 0], 'L'],
            [11, [-4, 0, 0]], [13, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [28, 9, 5], 'L'], [1, [28, 9, 5], 'L'], [3, [16, 5, 2]], [5, [13, 3, 1]], [7, [8, 1, 0]], [9, [2, 0, 0]], [10, [-14, 0, 0], 'L'],
            [11, [-26, 0, 0]], [13, [-12, 0, 0]], [15, [-16, 0, 0]], [18, [-4, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [18, 18, 9], 'L'], [1, [18, 18, 9], 'L'], [2, [24, 20, 10]], [4, [12, 10, 4]], [6, [6, -4, 2]], [8, [2, -12, 0]], [9, [0, -12, 0]],
            [10, [-4, -6, 0], 'L'], [11, [-10, -4, 0]], [12, [-20, 0, 0]], [14, [-6, 0, 0]], [16, [-10, 0, 0]], [18, [0, 0, 0]], [19, [0, 18, 0]],
            [20, [0, -14, 0]], [21, [0, 10, 0]], [22, [0, -4, 0]], [24, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [10, 0, 110], 'L'], [1, [10, 0, 110], 'L'], [2, [0, 0, 122]], [4, [6, 0, 132]], [6, [26, 0, 124]], [8, [52, 0, 96]],
            [10, [48, 0, 50], 'L'], [11, [26, 0, 40]], [13, [40, 0, 32]], [16, [80, 3, 16]], [19, [118, 5.73, 2]], [21, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [55, 0, 60], 'L'], [1, [55, 0, 60], 'L'], [2, [48, 12, 58]], [4, [64, 28, 44]], [6, [74, 30, 40]], [8, [72, 12, 48]],
            [10, [50, 0, 48], 'L'], [11, [28, 0, 40]], [13, [40, 0, 32]], [16, [88, 4, 12]], [19, [122, 5.73, 0]], [21, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-10, 0, 4], 'L'], [1, [-10, 0, 4], 'L'], [2, [0, 0, 8]], [5, [-6, 0, 10]], [8, [-10, 0, 4]], [10, [-22, 0, 4], 'L'],
            [11, [-26, 0, 5]], [13, [-16, 0, 3]], [16, [-6, 0, 0]], [18, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [14, 0, 4], 'L'], [1, [14, 0, 4], 'L'], [2, [28, 0, 6]], [5, [36, 0, 6]], [8, [22, 0, 4]], [10, [18, 0, 4], 'L'], [11, [20, 0, 5]],
            [13, [12, 0, 3]], [16, [4, 0, 0]], [18, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
        face: [[0, 1], [3, 3], [10, 1], [22, 0]],
      },

      // Light hit, an uncharged swing by the local player (crisp, the same family as hit_front): the same impact a little
      // smaller and the same flight, but it lands in a split stance with a quick knee dip, nods, shakes once, turns back to
      // the attacker and re-raises its arms one after the other.
      hit_light: {
        setup: 'front', len: 22, land: 10,
        root: {
          pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -0.8, 0], 'L'], [11, [0, -1.3, 0]], [13, [0, 0.15, 0]], [15, [0, 0, 0]]],
          rot: [[0, [0, 6, 0], 'L'], [1, [0, 6, 0], 'L'], [4, [0, 10, 0]], [7, [0, 14, 0]], [10, [0, 14, 0]], [12, [0, 12, 0]], [14, [0, 4, 0]],
            [16, [0, -1, 0]], [17, [0, 0, 0]]],
          scale: [[0, [1.02, 0.98, 0.95], 'L'], [1, [1.02, 0.98, 0.95], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'],
            [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [4, 0, 0], 'L'], [1, [4, 0, 0], 'L'], [3, [12, 0, 0]], [5, [10, 0, 0]], [7, [6, 0, 0]], [9, [1, 0, 0]], [10, [-2, 0, 0], 'L'],
            [12, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [24, 8, 4], 'L'], [1, [24, 8, 4], 'L'], [3, [16, 5, 2]], [5, [13, 3, 1]], [7, [8, 1, 0]], [9, [2, 0, 0]], [10, [-10, 0, 0], 'L'],
            [11, [-15, 0, 0]], [13, [2, 0, 0]], [15, [-2, 0, 0]], [17, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [14, 16, 8], 'L'], [1, [14, 16, 8], 'L'], [2, [24, 20, 10]], [4, [12, 10, 4]], [6, [6, -4, 2]], [8, [2, -12, 0]], [9, [0, -12, 0]],
            [10, [-4, -10, 0], 'L'], [11, [-12, -8, 0]], [12, [2, -8, 0]], [13, [0, 6, 2]], [14, [0, -14, -1]], [15, [0, -2, 0]], [17, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [10, 0, 110], 'L'], [1, [10, 0, 110], 'L'], [2, [0, 0, 122]], [4, [6, 0, 132]], [6, [26, 0, 124]], [8, [52, 0, 96]],
            [10, [58, 0, 44], 'L'], [11, [46, 0, 36]], [13, [80, 3, 20]], [15, [110, 5, 6]], [17, [122, 5.73, 0]], [18, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [55, 0, 60], 'L'], [1, [55, 0, 60], 'L'], [2, [48, 12, 58]], [4, [64, 28, 44]], [6, [74, 30, 40]], [8, [72, 12, 48]],
            [10, [66, 0, 36], 'L'], [11, [52, 0, 30]], [13, [96, 4, 14]], [15, [121, 5.73, 0]], [16, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-10, 0, 4], 'L'], [1, [-10, 0, 4], 'L'], [2, [0, 0, 8]], [5, [-6, 0, 10]], [8, [-10, 0, 4]], [10, [-14, 0, 2], 'L'],
            [12, [-9, 0, 0]], [14, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [14, 0, 4], 'L'], [1, [14, 0, 4], 'L'], [2, [28, 0, 6]], [5, [36, 0, 6]], [8, [22, 0, 4]], [10, [14, 0, 2], 'L'], [12, [9, 0, 0]],
            [14, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
        face: [[0, 1], [3, 3], [10, 1], [15, 0]],
      },

      // Critical hit (falling attack), heavy style: the blow from above crushes it, knees buckled deep, head driven down
      // between the shoulders, arms knocked out low. On the release it pops up and stretches, head snapping back, then wobbles
      // through the air, lands hard with its knees giving way again and stands there dazed (x x), swaying and wobbling its
      // head with its arms dangling, before it shakes it off.
      hit_crit: {
        setup: 'front', len: 32, land: 10,
        root: {
          pos: [[0, [0, -2, 0], 'L'], [1, [0, -2, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.6, 0], 'L'], [11, [0, -2.4, 0]], [13, [0, -0.8, 0]],
            [16, [0, -1.2, 0]], [20, [0, -0.4, 0]], [26, [0, 0, 0]]],
          rot: [[0, [0, 4, 0], 'L'], [1, [0, 4, 0], 'L'], [6, [0, -4, 0]], [10, [0, 0, 0]]],
          scale: [[0, [1.04, 0.95, 1.04], 'L'], [1, [1.04, 0.95, 1.04], 'L'], [3, [0.98, 1.03, 0.98]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.04, 0.95, 1.04], 'L'],
            [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [0, 0, 4], 'L'], [1, [0, 0, 4], 'L'], [3, [8, 0, 0]], [7, [4, 0, -2]], [10, [0, 0, 0], 'L'], [13, [0, 0, 7]], [17, [0, 0, -7]], [21, [0, 0, 5]],
            [25, [0, 0, -2]], [28, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [-16, 0, 6], 'L'], [1, [-16, 0, 6], 'L'], [2, [10, 0, 0]], [4, [14, 0, -2]], [7, [6, 0, 2]], [9, [0, 0, 0]], [10, [-20, 0, 0], 'L'], [11, [-26, 0, 0]],
            [13, [-6, 0, -8]], [15, [-10, 0, 9]], [17, [-4, 0, -8]], [19, [-10, 0, 7]], [21, [-4, 0, -5]], [23, [-6, 0, 3]], [26, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [-24, 8, 8], 'L'], [1, [-24, 8, 8], 'L'], [2, [-6, 4, 4]], [3, [24, 0, 0]], [5, [10, -24, 12]], [7, [4, 18, -10]], [9, [0, -6, 4]], [10, [-20, 0, 0], 'L'],
            [11, [-28, 0, 0]], [12, [8, 0, 10]], [14, [14, -8, -14]], [16, [4, 6, 16]], [18, [-8, -4, -12]], [20, [10, 6, 12]], [22, [-4, -3, -8]], [24, [6, 2, 4]],
            [26, [0, 0, 0]], [28, [0, 22, 0]], [29, [0, -18, 0]], [30, [0, 8, 0]], [31, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [12, 0, 70], 'L'], [1, [12, 0, 70], 'L'], [3, [50, 0, 104]], [5, [62, 0, 80]], [7, [42, 0, 88]], [9, [50, 0, 70]], [10, [25, 0, 34], 'L'],
            [11, [14, 0, 28]], [13, [16, 0, 12]], [16, [32, 0, 18]], [19, [14, 0, 10]], [22, [30, 0, 16]], [25, [22, 0, 10]], [28, [140, 0, 4], 'L'],
            [29, [114, 5.73, 0]], [31, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [18, 0, 62], 'L'], [1, [18, 0, 62], 'L'], [3, [42, 0, 96]], [5, [58, 0, 76]], [7, [44, 0, 90]], [9, [52, 0, 68]], [10, [26, 0, 34], 'L'],
            [11, [16, 0, 30]], [14, [18, 0, 14]], [17, [34, 0, 20]], [20, [16, 0, 10]], [23, [28, 0, 14]], [25, [22, 0, 10]], [28, [138, 0, 4], 'L'],
            [29, [116, 5.73, 0]], [31, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-8, 0, 12], 'L'], [1, [-8, 0, 12], 'L'], [3, [12, 0, 8]], [6, [22, 0, 6]], [9, [4, 0, 4]], [10, [0, 0, 14], 'L'], [11, [-4, 0, 16]],
            [13, [-10, 0, 6]], [16, [8, 0, 2]], [19, [-8, 0, 6]], [22, [8, 0, 2]], [25, [-4, 0, 4]], [28, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [6, 0, 10], 'L'], [1, [6, 0, 10], 'L'], [3, [-4, 0, 8]], [6, [-12, 0, 6]], [9, [6, 0, 4]], [10, [0, 0, 14], 'L'], [11, [4, 0, 16]],
            [13, [10, 0, 2]], [16, [-8, 0, 6]], [19, [8, 0, 2]], [22, [-8, 0, 6]], [25, [4, 0, 2]], [28, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.35], [26, 0.35], [29, 1]],
        face: [[0, 1], [10, 2], [27, 1], [30, 0]],
      },

      // Hit on its right side, heavy style: the blow spins it away, head snapped round, the hit-side arm flung high and out,
      // the other thrown across; it keeps turning in the air while the head turns back to find the attacker, lands hard on
      // its far leg with the near one crossing in, folds sideways over it, settles twice and turns back to face the attacker,
      // head first, before a shake.
      hit_side_r: {
        setup: 'side_r', len: 26, land: 10,
        root: {
          pos: [[0, [0, -0.6, 0], 'L'], [1, [0, -0.6, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.6, 0]],
            [15, [0, -0.9, 0]], [18, [0, 0, 0]]],
          rot: [[0, [0, 24, 0], 'L'], [1, [0, 24, 0], 'L'], [3, [0, 52, 0]], [5, [0, 66, 0]], [7, [0, 64, 0]], [9, [0, 52, 0]], [10, [0, 46, 0]], [13, [0, 38, 0]],
            [15, [0, 22, 0]], [17, [0, 4, 0]], [19, [0, -4, 0]], [21, [0, 0, 0]]],
          scale: [[0, [0.96, 0.97, 1.02], 'L'], [1, [0.96, 0.97, 1.02], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [0, 0, 10], 'L'], [1, [0, 0, 10], 'L'], [3, [0, 0, 18]], [5, [4, 0, 14]], [7, [4, 0, 8]], [9, [0, 0, 2]], [10, [0, 0, -6], 'L'], [11, [-4, 0, -10]],
            [13, [0, 0, -2]], [15, [0, 0, -5]], [18, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [0, 20, 16], 'L'], [1, [0, 20, 16], 'L'], [3, [4, 24, 20]], [5, [6, 12, 12]], [7, [4, 6, 6]], [9, [0, 2, 2]], [10, [-12, 0, -10], 'L'],
            [11, [-22, 0, -16]], [13, [-8, 0, -4]], [15, [-12, 0, -8]], [18, [-2, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [6, 42, 20], 'L'], [1, [6, 42, 20], 'L'], [2, [8, 56, 26]], [4, [4, 34, 14]], [6, [2, 10, 4]], [8, [0, -12, 0]], [9, [0, -18, -2]],
            [10, [-6, -20, -8], 'L'], [11, [-14, -18, -10]], [12, [-18, -16, -6]], [14, [-6, -20, -2]], [16, [-8, -8, 0]], [18, [0, 0, 0]], [19, [0, 14, 0]],
            [20, [0, -12, 0]], [21, [0, 6, 0]], [22, [0, -2, 0]], [24, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [16, 0, 116], 'L'], [1, [16, 0, 116], 'L'], [2, [10, 0, 130]], [4, [18, 0, 136]], [6, [38, 0, 110]], [8, [56, 0, 80]], [10, [48, 0, 50], 'L'],
            [11, [26, 0, 42]], [13, [40, 0, 32]], [16, [80, 3, 16]], [19, [118, 5.73, 2]], [21, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [74, 40, -6], 'L'], [1, [74, 40, -6], 'L'], [2, [60, 30, 20]], [4, [48, 10, 50]], [6, [46, 0, 70]], [8, [56, 0, 64]], [10, [50, 0, 48], 'L'],
            [11, [28, 0, 40]], [13, [40, 0, 32]], [16, [88, 4, 12]], [19, [122, 5.73, 0]], [21, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-8, 0, 18], 'L'], [1, [-8, 0, 18], 'L'], [3, [-10, 0, 24]], [6, [8, 0, 14]], [9, [2, 0, 8]], [10, [-4, 0, -6], 'L'], [11, [-8, 0, -8]],
            [13, [-16, 0, -2]], [15, [10, 0, 2]], [18, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [8, 0, 4], 'L'], [1, [8, 0, 4], 'L'], [3, [20, 0, 4]], [6, [-6, 0, 12]], [9, [2, 0, 6]], [10, [6, 0, 18], 'L'], [11, [8, 0, 22]],
            [13, [14, 0, 10]], [15, [-10, 0, 4]], [18, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
        face: [[0, 1], [3, 3], [10, 1], [22, 0]],
      },

      // Hit in the back, heavy style: whiplash. Hips shoved forward, chest and head snapped back, arms flung up behind it;
      // it pitches forward through the air with its legs scrambling, lands in a big catch step folded forward over its
      // knees, staggers once more, then looks back over its shoulder (surprised) before it comes round.
      hit_back: {
        setup: 'back', len: 26, land: 10,
        root: {
          pos: [[0, [0, -0.6, 0], 'L'], [1, [0, -0.6, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2.2, 0]], [13, [0, -0.6, 0]],
            [15, [0, -1, 0]], [18, [0, 0, 0]]],
          rot: [[0, [0, -4, 0], 'L'], [1, [0, -4, 0], 'L'], [6, [0, -8, 0]], [10, [0, -6, 0]], [16, [0, 0, 0]]],
          scale: [[0, [1.02, 0.97, 0.95], 'L'], [1, [1.02, 0.97, 0.95], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [-8, 0, 0], 'L'], [1, [-8, 0, 0], 'L'], [3, [-12, 0, 0]], [5, [-18, 0, 2]], [7, [-14, 0, 0]], [9, [-6, 0, 0]], [10, [0, 0, 0], 'L'],
            [11, [-6, 0, 0]], [13, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [24, 0, -4], 'L'], [1, [24, 0, -4], 'L'], [3, [30, 0, -4]], [5, [12, 0, -2]], [7, [-2, 0, 0]], [9, [-8, 0, 0]], [10, [-22, 0, 0], 'L'],
            [11, [-30, 0, 0]], [13, [-14, 0, 0]], [15, [-18, 0, 0]], [18, [-4, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [34, -6, -4], 'L'], [1, [34, -6, -4], 'L'], [2, [42, -8, -6]], [4, [20, -4, 0]], [6, [-6, 0, 0]], [8, [-12, 0, 0]], [10, [-16, 0, 0], 'L'],
            [11, [-22, 0, 0]], [12, [-26, 0, 0]], [14, [-4, 30, 0]], [16, [2, 60, 0]], [18, [0, 64, 0]], [20, [0, 40, 0]], [22, [0, 6, 0]], [24, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [196, 0, -20], 'L'], [1, [196, 0, -20], 'L'], [2, [212, 0, -26]], [4, [186, 0, -20]], [6, [150, -10, 4]], [8, [118, -18, 18]],
            [10, [80, -10, 30], 'L'], [11, [50, 0, 40]], [13, [44, 0, 34]], [16, [84, 3, 16]], [19, [118, 5.73, 2]], [21, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [180, 0, -14], 'L'], [1, [180, 0, -14], 'L'], [2, [200, 0, -20]], [4, [190, 0, -18]], [6, [160, -8, 0]], [8, [128, -16, 16]],
            [10, [86, -8, 32], 'L'], [11, [56, 0, 42]], [13, [46, 0, 36]], [16, [88, 4, 14]], [19, [122, 5.73, 0]], [21, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-22, 0, 4], 'L'], [1, [-22, 0, 4], 'L'], [3, [-28, 0, 4]], [5, [8, 0, 2]], [7, [-12, 0, 2]], [9, [14, 0, 2]], [10, [24, 0, 2], 'L'],
            [11, [28, 0, 3]], [13, [-10, 0, 0]], [15, [12, 0, 0]], [18, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [-8, 0, 4], 'L'], [1, [-8, 0, 4], 'L'], [3, [-14, 0, 4]], [5, [-24, 0, 2]], [7, [10, 0, 2]], [9, [-10, 0, 2]], [10, [-18, 0, 2], 'L'],
            [11, [-22, 0, 3]], [13, [12, 0, 0]], [15, [-8, 0, 0]], [18, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [16, 0.8], [19, 1]],
        face: [[0, 1], [14, 3], [21, 0]],
      },

      // Sprint hit (extra knockback), heavy style: shoved off balance, knees buckling, it tips back about 25°, windmills its
      // arms and backpedals through the air, lands on its heels still leaning back and teeters, then rocks forward into a
      // hard catch step, folding over it with a deep dip while the arms swing through, straightens and shakes its head.
      // It never goes further back than it could recover from: the real zombie lands on its feet and walks straight back in.
      hit_launch: {
        setup: 'launch', len: 30, land: 11,
        root: {
          pos: [[0, [0, -0.6, 0], 'L'], [1, [0, -0.6, 0], 'L'], [3, [0, 0, 0]], [10, [0, 0, 0]], [11, [0, -1.2, 0], 'L'], [13, [0, -0.8, 0]], [16, [0, -0.4, 0]],
            [18, [0, -2, 0]], [20, [0, -0.8, 0]], [23, [0, 0, 0]]],
          rot: [[0, [0, 5, 0], 'L'], [1, [0, 5, 0], 'L'], [6, [0, -6, 0]], [11, [0, 4, 0]], [16, [0, 0, 0]]],
          scale: [[0, [1.03, 0.96, 0.93], 'L'], [1, [1.03, 0.96, 0.93], 'L'], [3, [1, 1, 1]], [10, [1, 1, 1]], [11, [1.03, 0.97, 1.03], 'L'], [13, [1, 1, 1]],
            [17, [1, 1, 1]], [18, [1.03, 0.96, 1.03]], [20, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [8, 0, 0], 'L'], [1, [8, 0, 0], 'L'], [3, [20, 0, 0]], [5, [26, 0, 2]], [7, [28, 0, 0]], [9, [24, 0, -2]], [11, [20, 0, 0], 'L'],
            [13, [26, 0, 0]], [15, [22, 0, 0]], [17, [8, 0, 0]], [18, [-6, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [24, 6, 4], 'L'], [1, [24, 6, 4], 'L'], [3, [18, 0, 0]], [6, [12, 0, 0]], [9, [8, 0, 0]], [11, [4, 0, 0], 'L'], [13, [10, 0, 0]], [15, [4, 0, 0]],
            [17, [-10, 0, 0]], [18, [-22, 0, 0]], [20, [-10, 0, 0]], [22, [-12, 0, 0]], [25, [2, 0, 0]], [27, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [30, 14, 8], 'L'], [1, [30, 14, 8], 'L'], [2, [36, 16, 10]], [3, [22, 0, 0]], [5, [16, -6, 0]], [7, [12, 6, 0]], [9, [10, 0, 0]],
            [11, [-6, 0, 0], 'L'], [13, [14, 0, 0]], [15, [8, 0, 0]], [17, [-10, 0, 0]], [18, [-18, 0, 0]], [20, [-6, 0, 0]], [22, [0, 0, 0]], [23, [0, 14, 0]],
            [25, [0, -12, 0]], [27, [0, 6, 0]], [29, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [70, 0, 20], 'L'], [1, [70, 0, 20], 'L'], [3, [150, 0, 20]], [5, [230, 0, 20]], [7, [300, 0, 22]], [9, [370, 0, 22]], [11, [440, 0, 24]],
            [13, [510, 0, 24]], [15, [580, 0, 22]], [17, [650, 0, 18]], [18, [700, 0, 14]], [20, [760, 0, 10]], [22, [820, 4, 4]], [24, [844, 5.73, 0]],
            [26, [840, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [40, 0, 44], 'L'], [1, [40, 0, 44], 'L'], [3, [110, 0, 30]], [5, [180, 0, 22]], [7, [250, 0, 22]], [9, [320, 0, 22]], [11, [390, 0, 24]],
            [13, [460, 0, 24]], [15, [530, 0, 22]], [17, [610, 0, 18]], [18, [670, 0, 14]], [20, [740, 0, 10]], [22, [810, 4, 4]], [24, [836, 5.73, 0]],
            [26, [840, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [20, 0, 4], 'L'], [1, [20, 0, 4], 'L'], [3, [28, 0, 4]], [5, [-8, 0, 4]], [7, [26, 0, 4]], [9, [-6, 0, 4]], [11, [16, 0, 4], 'L'],
            [13, [18, 0, 4]], [15, [10, 0, 2]], [17, [-10, 0, 2]], [18, [-20, 0, 3]], [20, [-12, 0, 2]], [22, [4, 0, 0]], [24, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [10, 0, 4], 'L'], [1, [10, 0, 4], 'L'], [3, [4, 0, 4]], [5, [30, 0, 4]], [7, [-6, 0, 4]], [9, [24, 0, 4]], [11, [16, 0, 4], 'L'],
            [13, [14, 0, 4]], [15, [6, 0, 2]], [17, [14, 0, 2]], [18, [20, 0, 3]], [20, [12, 0, 2]], [22, [-4, 0, 0]], [24, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [11, 0, 'L'], [18, 0.2], [22, 0.8], [25, 1]],
        face: [[0, 1], [3, 3], [18, 1], [24, 0]],
      },

      // Combo hit 2/3 (the mod mirrors it for the other side), heavy style: a slash across the face from its right. Head
      // and chest wrenched round to its left, the near arm knocked across the chest, the far arm flung out, knees buckling.
      // The spin carries on through the air (the head turning back to find the attacker), it lands turned away, folds over
      // a wide stumble, settles twice and turns back to face the attacker, head first, then shakes it off.
      hit_twist: {
        setup: 'front', len: 26, land: 10,
        root: {
          pos: [[0, [0, -0.5, 0], 'L'], [1, [0, -0.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.6, 0]],
            [15, [0, -0.9, 0]], [18, [0, 0, 0]]],
          rot: [[0, [0, 14, 0], 'L'], [1, [0, 14, 0], 'L'], [4, [0, 24, 0]], [7, [0, 32, 0]], [10, [0, 30, 0]], [13, [0, 24, 0]], [16, [0, 8, 0]], [18, [0, -3, 0]],
            [20, [0, 0, 0]]],
          scale: [[0, [1.03, 0.96, 0.96], 'L'], [1, [1.03, 0.96, 0.96], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [6, 0, 4], 'L'], [1, [6, 0, 4], 'L'], [3, [12, 0, 8]], [5, [10, 0, 6]], [7, [6, 0, 3]], [9, [1, 0, 0]], [10, [0, 0, -2], 'L'], [11, [-4, 0, -4]],
            [13, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [12, 28, 10], 'L'], [1, [12, 28, 10], 'L'], [3, [14, 20, 8]], [5, [10, 12, 4]], [7, [6, 6, 2]], [9, [2, 2, 0]], [10, [-14, 0, -4], 'L'],
            [11, [-24, -4, -8]], [13, [-10, -2, -2]], [15, [-14, 0, -4]], [18, [-4, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [14, 40, 14], 'L'], [1, [14, 40, 14], 'L'], [2, [18, 52, 20]], [4, [10, 32, 10]], [6, [4, 10, 4]], [8, [0, -8, 0]], [9, [0, -14, 0]],
            [10, [-4, -12, 0], 'L'], [11, [-10, -10, 0]], [12, [-18, -8, 0]], [14, [-6, -14, 0]], [16, [-10, -6, 0]], [18, [0, 0, 0]], [19, [0, 16, 0]],
            [20, [0, -12, 0]], [21, [0, 8, 0]], [22, [0, -3, 0]], [24, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [70, 50, -10], 'L'], [1, [70, 50, -10], 'L'], [2, [64, 60, -6]], [4, [62, 50, 6]], [6, [68, 30, 22]], [8, [66, 12, 34]], [10, [48, 0, 44], 'L'],
            [11, [28, 0, 40]], [13, [40, 0, 32]], [16, [80, 3, 16]], [19, [118, 5.73, 2]], [21, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [30, 0, 96], 'L'], [1, [30, 0, 96], 'L'], [2, [20, 0, 112]], [4, [26, 0, 120]], [6, [40, 0, 106]], [8, [54, 0, 82]], [10, [50, 0, 50], 'L'],
            [11, [30, 0, 42]], [13, [42, 0, 34]], [16, [88, 4, 12]], [19, [122, 5.73, 0]], [21, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [12, 0, 10], 'L'], [1, [12, 0, 10], 'L'], [2, [4, 0, 14]], [5, [-4, 0, 12]], [8, [-8, 0, 6]], [10, [-20, 0, 10], 'L'], [11, [-24, 0, 12]],
            [13, [-14, 0, 6]], [16, [-6, 0, 0]], [18, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [4, 0, 4], 'L'], [1, [4, 0, 4], 'L'], [2, [26, 0, 6]], [5, [34, 0, 6]], [8, [20, 0, 4]], [10, [16, 0, 6], 'L'], [11, [18, 0, 8]],
            [13, [10, 0, 4]], [16, [4, 0, 0]], [18, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
        face: [[0, 1], [3, 3], [10, 1], [22, 0]],
      },

      // Combo finisher (every third hit after the first), heavy style: a blow to the gut. Knees buckle and it folds in half
      // around the blow, hands on its stomach, chin down; it flies back curled up, legs tucked, lands deeper still, staggers
      // back two steps, stays doubled over (x x) for a beat, straightens up slowly and shakes its head.
      hit_heavy: {
        setup: 'front', len: 28, land: 10,
        root: {
          pos: [[0, [0, -1.6, 0], 'L'], [1, [0, -1.6, 0], 'L'], [3, [0, -0.6, 0]], [9, [0, 0, 0]], [10, [0, -1.4, 0], 'L'], [11, [0, -2.4, 0]], [13, [0, -1.2, 0]],
            [15, [0, -1.8, 0]], [17, [0, -0.8, 0]], [20, [0, 0, 0]]],
          rot: [[0, [0, -6, 0], 'L'], [1, [0, -6, 0], 'L'], [5, [0, -4, 0]], [10, [0, 0, 0]]],
          scale: [[0, [1.04, 0.95, 0.94], 'L'], [1, [1.04, 0.95, 0.94], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.04, 0.95, 1.04], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: {
          rot: [[0, [10, 0, 0], 'L'], [1, [10, 0, 0], 'L'], [3, [16, 0, 0]], [5, [20, 0, 2]], [7, [16, 0, 0]], [9, [8, 0, 0]], [10, [4, 0, 0], 'L'], [11, [0, 0, 0]],
            [13, [6, 0, 0]], [16, [2, 0, 0]], [20, [0, 0, 0]]],
        },
        torso: {
          rot: [[0, [-38, -6, 0], 'L'], [1, [-38, -6, 0], 'L'], [3, [-44, -4, 0]], [6, [-40, -2, 0]], [9, [-32, 0, 0]], [10, [-40, 0, 0], 'L'], [11, [-48, 0, 0]],
            [13, [-34, 0, 2]], [15, [-40, 0, -2]], [18, [-24, 0, 0]], [21, [-8, 0, 0]], [23, [3, 0, 0]], [25, [0, 0, 0]]],
        },
        head: {
          rot: [[0, [-22, -8, 0], 'L'], [1, [-22, -8, 0], 'L'], [2, [-8, -4, 0]], [4, [-16, 0, 0]], [7, [-12, 4, 0]], [9, [-14, 0, 0]], [10, [-24, 0, 0], 'L'],
            [11, [-34, 0, 0]], [13, [-12, 0, 0]], [15, [-20, 0, 0]], [18, [0, 0, 0]], [21, [0, 18, 0]], [22, [0, -16, 0]], [23, [0, 10, 0]], [24, [0, -4, 0]],
            [26, [0, 0, 0]]],
        },
        arm_r: {
          rot: [[0, [40, 44, -10], 'L'], [1, [40, 44, -10], 'L'], [3, [30, 52, -10]], [6, [36, 46, -8]], [9, [42, 40, -8]], [10, [30, 44, -10], 'L'],
            [11, [22, 40, -10]], [14, [36, 32, -4]], [18, [76, 14, 2]], [21, [118, 5.73, 2]], [23, [120, 5.73, 0]]],
        },
        arm_l: {
          rot: [[0, [44, 40, -8], 'L'], [1, [44, 40, -8], 'L'], [3, [34, 48, -10]], [6, [38, 44, -10]], [9, [44, 38, -8]], [10, [32, 44, -10], 'L'],
            [11, [24, 40, -10]], [15, [38, 32, -4]], [19, [82, 14, 0]], [22, [122, 5.73, 0]], [24, [120, 5.73, 0]]],
        },
        leg_r: {
          rot: [[0, [-10, 0, 6], 'L'], [1, [-10, 0, 6], 'L'], [3, [18, 0, 6]], [6, [28, 0, 4]], [9, [10, 0, 2]], [10, [-6, 0, 6], 'L'], [11, [-10, 0, 8]],
            [13, [-22, 0, 4]], [15, [12, 0, 2]], [17, [-6, 0, 0]], [20, [0, 0, 0]]],
        },
        leg_l: {
          rot: [[0, [4, 0, 6], 'L'], [1, [4, 0, 6], 'L'], [3, [30, 0, 6]], [6, [38, 0, 4]], [9, [20, 0, 2]], [10, [8, 0, 6], 'L'], [11, [10, 0, 8]],
            [13, [16, 0, 4]], [15, [-16, 0, 2]], [17, [6, 0, 0]], [20, [0, 0, 0]]],
        },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [13, 0.2], [18, 0.7], [21, 1]],
        face: [[0, 1], [4, 3], [10, 2], [17, 1], [23, 0]],
      },
    };
    // mirror image of the side hit (hit on its left side)
    (function () {
      const m = JSON.parse(JSON.stringify(ANIMS.hit_side_r));
      m.setup = 'side_l';
      [m.arm_r, m.arm_l] = [m.arm_l, m.arm_r];
      [m.leg_r, m.leg_l] = [m.leg_l, m.leg_r];
      for (const b of ['root', 'pelvis', 'torso', 'head']) {
        if (!m[b]) continue;
        if (m[b].rot) m[b].rot.forEach(k => { k[1] = [k[1][0], -k[1][1], -k[1][2]]; });
        if (m[b].pos) m[b].pos.forEach(k => { k[1] = [-k[1][0], k[1][1], k[1][2]]; });
      }
      ANIMS.hit_side_l = m;
    })();

    // ---------- deaths ----------
    // A killing blow plays the death twin of the hit it would have got: the hit's own keys up to `cut` (impact, hit-stop,
    // follow-through), then the body goes limp in the air and lands on the landing key, which the mod syncs to the real
    // touchdown like a hit. Then a small bounce, it settles, and lies still until the clip ends and the mod plays the
    // vanilla poof. The lying poses pivot about the hips (pelvis) so the body rests centred on the mob's position; the
    // root drops by 10 px so the hips lie 2 px up (half the body's thickness). Lying on its back or front, root/pelvis x
    // is ±90, so torso/head x can only go away from the ground (back: <= 0, front: >= 0); arms lie flat at raise 0 or
    // 180 (face down: raise <= 0 or >= 180, face up: 0..180 points at the sky). `lie` = the direction the head ends up in
    // (rig frame, x = its right, z = its back) for the mod's room check; without room it falls back to death_crit's heap.
    // `down` = the tick it is down (lying or in its heap) and `rest` its height then (blocks): the mod shrinks the
    // bounding box the fire overlay is drawn with, so a burning body doesn't keep a standing column of flames.
    // death_collapse and death_slump are for deaths without a hit to grow out of (fire, fall, drowning).
    const DEATHS = {
      // Front: the shove keeps tipping it back; it pivots about the hips in the air, arms and legs trailing up, and slams
      // flat on its back on touchdown. Arms slap out to the sides, legs bounce once, the head rolls to one side.
      death_front: ['hit_front', 3, {
        setup: 'front_dead', len: 34, lie: [0, 1], down: 10, rest: 0.5,
        root: { pos: [[6, [0, -2, 0]], [8, [0, -5, 0]], [9, [0, -7, 0]], [10, [0, -10, 0], 'L'], [12, [0, -8.8, 0]], [14, [0, -10, 0]], [16, [0, -9.7, 0]], [18, [0, -10, 0]]] },
        pelvis: { rot: [[6, [34, 0, 4]], [8, [54, 0, 6]], [9, [68, 0, 5]], [10, [90, 0, 2], 'L'], [14, [90, 0, 0]]] },
        torso: { rot: [[6, [10, 4, 0]], [9, [4, 0, 0]], [10, [0, 0, 0], 'L'], [12, [-5, 0, 2]], [14, [0, 0, 0]], [16, [-2, 0, 0]], [18, [0, 0, 0]]] },
        head: {
          rot: [[5, [20, 4, 2]], [8, [8, -10, 0]], [10, [0, -6, 0], 'L'], [12, [-16, -10, 0]], [14, [-2, 20, 4]], [16, [-4, 30, 6]], [20, [-2, 38, 6]],
            [28, [-2, 42, 6]]],
          pos: [[9, [0, 0, 0]], [10, [0, 0, -3], 'L']],
        },
        arm_r: { rot: [[6, [70, 0, 85]], [8, [100, 0, 70]], [9, [115, 0, 58]], [10, [30, 0, 95], 'L'], [12, [14, 0, 102]], [14, [4, 0, 92]], [16, [8, 0, 96]], [20, [5, 0, 94]]] },
        arm_l: { rot: [[6, [66, 0, 88]], [8, [96, 0, 72]], [9, [110, 0, 60]], [10, [26, 0, 80], 'L'], [12, [12, 0, 74]], [14, [2, 0, 66]], [16, [6, 0, 70]], [20, [3, 0, 68]]] },
        leg_r: { rot: [[6, [40, 0, 8]], [9, [30, 0, 10]], [10, [8, 0, 12], 'L'], [12, [15, 0, 13]], [14, [0, 0, 12]], [16, [5, 0, 12]], [18, [0, 0, 12]]] },
        leg_l: { rot: [[6, [28, 0, 6]], [9, [20, 0, 8]], [10, [4, 0, 8], 'L'], [12, [9, 0, 9]], [14, [0, 0, 8]], [16, [3, 0, 9]], [18, [0, 0, 9]]] },
        face: [[0, 1], [10, 2]],
      }],
      // Twist: the slash keeps spinning it round; half a turn in the air, then it pitches forward and lands face down
      // with its arms flung out over its head, heels bouncing, cheek on the ground.
      death_twist: ['hit_twist', 3, {
        setup: 'front_dead', len: 34, lie: [0, 1], down: 10, rest: 0.5,
        root: {
          rot: [[5, [0, 70, 0]], [7, [0, 130, 0]], [9, [0, 170, 0]], [10, [0, 180, 0], 'L']],
          pos: [[6, [0, -2, 0]], [8, [0, -5, 0]], [9, [0, -7, 0]], [10, [0, -10, 0], 'L'], [12, [0, -8.8, 0]], [14, [0, -10, 0]], [16, [0, -9.7, 0]], [18, [0, -10, 0]]],
        },
        pelvis: { rot: [[6, [-10, 0, 6]], [8, [-40, 0, 4]], [9, [-62, 0, 2]], [10, [-90, 0, 0], 'L']] },
        torso: { rot: [[6, [6, 20, 8]], [9, [0, 6, 2]], [10, [0, 0, 0], 'L'], [12, [5, 0, -2]], [14, [0, 0, 0]], [16, [2, 0, 0]], [18, [0, 0, 0]]] },
        head: {
          rot: [[5, [10, 40, 10]], [8, [6, 20, 4]], [10, [4, 40, 0], 'L'], [12, [14, 50, -6]], [14, [2, 58, 0]], [18, [0, 62, 0]]],
          pos: [[9, [0, 0, 0]], [10, [0, 0, 2.5], 'L']],
        },
        arm_r: { rot: [[6, [90, 30, 10]], [8, [140, 0, -10]], [10, [181, 0, -30], 'L'], [12, [192, 0, -34]], [14, [180, 0, -30]], [16, [183, 0, -31]], [20, [182, 0, -30]]] },
        arm_l: { rot: [[6, [60, 0, 100]], [8, [130, 0, 20]], [10, [180, 0, -44], 'L'], [12, [190, 0, -48]], [14, [180, 0, -45]], [16, [182, 0, -46]], [20, [181, 0, -45]]] },
        leg_r: { rot: [[6, [10, 0, 14]], [9, [-10, 0, 10]], [10, [0, 0, 10], 'L'], [12, [-10, 0, 10]], [14, [0, 0, 10]], [16, [-4, 0, 10]], [18, [0, 0, 10]]] },
        leg_l: { rot: [[6, [20, 0, 10]], [9, [-4, 0, 8]], [10, [0, 0, 6], 'L'], [12, [-6, 0, 6]], [14, [0, 0, 6]], [16, [-3, 0, 6]], [18, [0, 0, 6]]] },
        face: [[0, 1], [10, 2]],
      }],
      // Heavy: flies back doubled over, lands on its knees, sways there for a moment with its arms hanging, then
      // topples forward and face-plants toward the attacker.
      death_heavy: ['hit_heavy', 6, {
        setup: 'front_dead', len: 38, lie: [0, -1], down: 19, rest: 0.5,
        root: { pos: [[9, [0, -1, 0]], [10, [0, -6, 0], 'L'], [12, [0, -5, 0]], [14, [0, -6.5, 0]], [16, [0, -6.5, 0]], [18, [0, -8, 0]], [19, [0, -10, 0], 'L'], [21, [0, -9.2, 0]], [23, [0, -10, 0]]] },
        pelvis: { rot: [[9, [4, 0, 0]], [10, [0, 0, 0], 'L'], [14, [0, 0, 3]], [16, [0, 0, 0]]] },
        torso: { rot: [[9, [-30, 0, 0]], [10, [-44, 0, 0], 'L'], [12, [-24, 0, 4]], [14, [-32, 0, -3]], [16, [-46, 0, 0]], [18, [-72, 0, 0]], [19, [-90, 0, 0], 'L'], [21, [-84, 0, 2]], [23, [-90, 0, 0]]] },
        head: {
          rot: [[9, [-14, 0, 0]], [10, [-30, 0, 0], 'L'], [12, [-4, -8, 0]], [14, [-16, 6, 0]], [16, [-28, 0, 0]], [18, [-10, 0, 0]], [19, [8, 20, 0], 'L'],
            [21, [4, 40, 0]], [24, [0, 55, 0]], [30, [0, 58, -4]]],
          pos: [[18, [0, 0, 0]], [19, [0, 0, 2.5], 'L']],
        },
        arm_r: { rot: [[9, [40, 40, -8]], [10, [30, 45, -10], 'L'], [12, [20, 20, 10]], [14, [10, 0, 12]], [16, [16, 0, 10]], [18, [40, 0, 14]], [19, [4, 0, 14], 'L'], [21, [-8, 0, 16]], [23, [0, 0, 14]], [26, [-2, 0, 14]]] },
        arm_l: { rot: [[9, [42, 38, -8]], [10, [32, 44, -10], 'L'], [12, [22, 18, 10]], [14, [12, 0, 14]], [16, [18, 0, 12]], [18, [44, 0, 12]], [19, [6, 0, 18], 'L'], [21, [-6, 0, 20]], [23, [0, 0, 18]], [26, [-1, 0, 18]]] },
        leg_r: { rot: [[9, [0, 0, 4]], [10, [-60, 0, 8], 'L'], [12, [-58, 0, 8]], [16, [-60, 0, 8]], [18, [-75, 0, 8]], [19, [-90, 0, 8], 'L'], [21, [-97, 0, 8]], [23, [-90, 0, 8]]] },
        leg_l: { rot: [[9, [0, 0, 4]], [10, [-60, 0, 8], 'L'], [12, [-57, 0, 8]], [16, [-60, 0, 8]], [18, [-75, 0, 8]], [19, [-90, 0, 8], 'L'], [21, [-95, 0, 8]], [23, [-90, 0, 8]]] },
        face: [[0, 1], [12, 2]],
      }],
      // Crit: the blow from above buckles its knees on landing; it sits down hard, legs shooting forward, and slumps
      // over into a heap, x x eyes. Stays in its own footprint, so it is also the fallback when there's no room to fall.
      death_crit: ['hit_crit', 3, {
        setup: 'front_dead', len: 34, down: 12, rest: 0.9,
        root: { pos: [[6, [0, 0, 0]], [9, [0, -1, 0]], [10, [0, -4, 0], 'L'], [12, [0, -10, 0]], [13, [0, -9.4, 0]], [14, [0, -10, 0]]] },
        pelvis: { rot: [[6, [3, 0, 0]], [10, [0, 0, 0], 'L'], [12, [6, 0, 0]], [14, [0, 0, 0]]] },
        torso: { rot: [[6, [6, 0, 0]], [9, [0, 0, 0]], [10, [-18, 0, 0], 'L'], [12, [4, 0, 6]], [14, [-10, 0, -6]], [16, [-24, 0, 6]], [18, [-38, 0, 14]], [20, [-46, 0, 18]], [24, [-48, 0, 20]], [30, [-50, 0, 22]]] },
        head: { rot: [[5, [10, -24, 12]], [7, [4, 18, -10]], [9, [0, -6, 4]], [10, [-20, 0, 0], 'L'], [12, [10, 10, 10]], [14, [-10, -8, -8]], [16, [-24, 6, 10]], [18, [-36, 4, 16]], [20, [-40, 2, 22]], [24, [-42, 0, 24]]] },
        arm_r: { rot: [[5, [60, 0, 70]], [7, [40, 0, 85]], [9, [50, 0, 70]], [10, [25, 0, 30], 'L'], [12, [10, 0, 40]], [14, [0, 0, 20]], [16, [8, 0, 12]], [18, [26, 0, 10]], [20, [38, 0, 12]], [26, [40, 0, 12]]] },
        arm_l: { rot: [[5, [58, 0, 72]], [7, [42, 0, 86]], [9, [52, 0, 68]], [10, [26, 0, 30], 'L'], [12, [12, 0, 44]], [14, [2, 0, 24]], [16, [8, 0, 18]], [18, [24, 0, 18]], [20, [34, 0, 20]], [26, [36, 0, 20]]] },
        leg_r: { rot: [[6, [20, 0, 6]], [9, [8, 0, 6]], [10, [20, 0, 14], 'L'], [12, [76, 0, 18]], [13, [90, 0, 18], 'L'], [14, [80, 0, 18]], [16, [90, 0, 20]]] },
        leg_l: { rot: [[6, [-12, 0, 6]], [9, [4, 0, 4]], [10, [16, 0, 12], 'L'], [12, [70, 0, 14]], [13, [88, 0, 14], 'L'], [14, [78, 0, 14]], [16, [88, 0, 15]]] },
        face: [[0, 1], [10, 2]],
      }],
      // Sprint: tips over backwards mid-windmill, lands flat on its back and skids away, legs bouncing; one arm ends up
      // over its head, the other flung out.
      death_launch: ['hit_launch', 5, {
        setup: 'launch_dead', len: 36, land: 11, down: 11, rest: 0.5, lie: [0, 1],
        root: { pos: [[7, [0, -2, 0]], [9, [0, -5, 0]], [10, [0, -7, 0]], [11, [0, -10, 0], 'L'], [12, [0, -8.8, 2]], [14, [0, -9.8, 5]], [16, [0, -10, 7.5]], [18, [0, -10, 8.6]], [20, [0, -10, 9]]] },
        pelvis: { rot: [[7, [40, 0, 0]], [9, [60, 0, 0]], [10, [74, 0, 2]], [11, [90, 0, 0], 'L']] },
        torso: { rot: [[7, [6, 0, 0]], [9, [2, 0, 0]], [11, [0, 0, 0], 'L'], [13, [-8, 0, 0]], [15, [0, 0, 0]], [17, [-2, 0, 0]], [19, [0, 0, 0]]] },
        head: {
          rot: [[7, [10, 6, 0]], [9, [4, 0, 0]], [11, [0, -8, 0], 'L'], [13, [-18, -4, 0]], [15, [-4, -16, -4]], [18, [-2, -28, -6]], [22, [-2, -36, -6]]],
          pos: [[10, [0, 0, 0]], [11, [0, 0, -3], 'L']],
        },
        arm_r: { rot: [[7, [290, 0, 22]], [9, [345, 0, 20]], [10, [380, 0, 20]], [11, [430, 0, 20], 'L'], [13, [520, 0, -30]], [15, [536, 0, -40]], [17, [530, 0, -38]], [20, [536, 0, -40]]] },
        arm_l: { rot: [[7, [245, 0, 22]], [9, [305, 0, 24]], [10, [345, 0, 24]], [11, [390, 0, 24], 'L'], [13, [372, 0, 70]], [15, [366, 0, 82]], [18, [368, 0, 80]]] },
        leg_r: { rot: [[7, [26, 0, 4]], [9, [40, 0, 6]], [10, [30, 0, 8]], [11, [6, 0, 10], 'L'], [13, [24, 0, 12]], [15, [4, 0, 12]], [17, [10, 0, 12]], [19, [0, 0, 12]]] },
        leg_l: { rot: [[7, [-6, 0, 4]], [9, [20, 0, 6]], [10, [24, 0, 8]], [11, [2, 0, 8], 'L'], [13, [16, 0, 10]], [15, [2, 0, 10]], [17, [6, 0, 10]], [19, [0, 0, 10]]] },
        face: [[0, 1], [3, 3], [11, 2]],
      }],
      // Right side: the twist away from the blow carries it over onto its left side, legs toward the attacker. It lands
      // on its shoulder and lower arm (the torso leans up off the ground over them), the head drops onto the arm, the
      // upper arm flops over its chest and the upper leg bends forward.
      death_side_r: ['hit_side_r', 3, {
        setup: 'side_r', len: 34, lie: [-0.87, 0.5], down: 10, rest: 0.6,
        root: {
          rot: [[5, [0, 62, 0]], [7, [0, 52, 0]], [9, [0, 40, 0]], [10, [0, 34, 0], 'L'], [12, [0, 30, 0]]],
          pos: [[5, [0, -1, 0]], [7, [0, -3, 0]], [9, [0, -5.5, 0]], [10, [0, -8, 0], 'L'], [12, [0, -6.8, 0]], [14, [0, -8, 0]], [16, [0, -7.7, 0]], [18, [0, -8, 0]]],
        },
        pelvis: { rot: [[5, [0, 0, 36]], [7, [0, 0, 56]], [9, [0, 0, 74]], [10, [0, 0, 90], 'L']] },
        torso: { rot: [[5, [0, 18, 14]], [7, [0, 10, 6]], [9, [0, 4, -4]], [10, [0, 0, -12], 'L'], [12, [0, 0, -18]], [14, [0, 0, -11]], [16, [0, 0, -13]], [18, [0, 0, -12]]] },
        head: { rot: [[5, [2, 30, 12]], [8, [0, 10, 4]], [10, [0, -4, 18], 'L'], [12, [0, -8, 6]], [14, [0, 0, 16]], [17, [0, 6, 15]], [22, [-4, 10, 17]]] },
        arm_r: { rot: [[5, [40, 0, 110]], [7, [70, 0, 85]], [9, [90, 0, 60]], [10, [70, 0, 20], 'L'], [12, [80, 10, 10]], [14, [55, 15, -5]], [16, [45, 18, -12]], [20, [42, 18, -14]]] },
        arm_l: { rot: [[5, [60, 10, 50]], [7, [80, 0, 40]], [9, [85, 0, 20]], [10, [80, 0, 4], 'L'], [12, [84, 0, 0]], [16, [78, 0, 2]]] },
        leg_r: { rot: [[6, [-2, 0, 16]], [9, [6, 0, 6]], [10, [20, 0, 0], 'L'], [12, [26, 0, 8]], [14, [24, 0, 2]], [16, [26, 0, 3]]] },
        leg_l: { rot: [[6, [8, 0, 8]], [9, [4, 0, 4]], [10, [4, 0, -2], 'L'], [12, [6, 0, 0]], [14, [4, 0, 0]]] },
        face: [[0, 1], [10, 2]],
      }],
      // Back: the whiplash throws it forward; it pitches over in the air and lands face down away from the attacker,
      // arms slapping down over its head, heels kicking up once.
      death_back: ['hit_back', 3, {
        setup: 'back', len: 34, lie: [0, -1], down: 10, rest: 0.5,
        root: { pos: [[5, [0, -1, 0]], [7, [0, -3, 0]], [9, [0, -6.5, 0]], [10, [0, -10, 0], 'L'], [12, [0, -8.8, 0]], [14, [0, -10, 0]], [16, [0, -9.7, 0]], [18, [0, -10, 0]]] },
        pelvis: { rot: [[5, [-18, 0, 0]], [7, [-34, 0, 0]], [9, [-58, 0, 0]], [10, [-90, 0, 0], 'L']] },
        torso: { rot: [[5, [10, 0, 0]], [7, [-4, 0, 0]], [9, [-8, 0, 0]], [10, [0, 0, 0], 'L'], [12, [5, 0, 0]], [14, [0, 0, 0]], [16, [2, 0, 0]], [18, [0, 0, 0]]] },
        head: {
          rot: [[5, [8, 0, 0]], [7, [-10, 0, 0]], [9, [-6, 6, 0]], [10, [6, 30, 0], 'L'], [12, [11, 36, 0]], [14, [4, 48, 0]], [17, [2, 54, 0]], [22, [0, 58, -2]]],
          pos: [[9, [0, 0, 0]], [10, [0, 0, 2.5], 'L']],
        },
        arm_r: { rot: [[5, [180, 0, -20]], [7, [160, 0, -18]], [9, [150, 0, -20]], [10, [180, 0, -30], 'L'], [12, [192, 0, -34]], [14, [180, 0, -36]], [16, [182, 0, -35]]] },
        arm_l: { rot: [[5, [176, 0, -18]], [7, [158, 0, -16]], [9, [148, 0, -16]], [10, [180, 0, -18], 'L'], [12, [188, 0, -22]], [14, [180, 0, -24]], [16, [181, 0, -23]]] },
        leg_r: { rot: [[5, [-10, 0, 4]], [7, [-14, 0, 6]], [9, [-4, 0, 8]], [10, [0, 0, 10], 'L'], [12, [-18, 0, 10]], [14, [0, 0, 10]], [16, [-4, 0, 10]], [18, [0, 0, 10]]] },
        leg_l: { rot: [[5, [-20, 0, 4]], [7, [4, 0, 6]], [9, [-8, 0, 8]], [10, [0, 0, 8], 'L'], [12, [-12, 0, 8]], [14, [0, 0, 8]], [16, [-2, 0, 8]], [18, [0, 0, 8]]] },
        face: [[0, 1], [10, 2]],
      }],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    (function () {
      const m = JSON.parse(JSON.stringify(ANIMS.death_side_r));
      m.setup = 'side_l';
      m.lie = [-m.lie[0], m.lie[1]];
      [m.arm_r, m.arm_l] = [m.arm_l, m.arm_r];
      [m.leg_r, m.leg_l] = [m.leg_l, m.leg_r];
      for (const b of ['root', 'pelvis', 'torso', 'head']) {
        if (!m[b]) continue;
        if (m[b].rot) m[b].rot.forEach(k => { k[1] = [k[1][0], -k[1][1], -k[1][2]]; });
        if (m[b].pos) m[b].pos.forEach(k => { k[1] = [-k[1][0], k[1][1], k[1][2]]; });
      }
      ANIMS.death_side_l = m;
    })();
    // Deaths with no hit to grow out of. The mod cross-fades into them from whatever pose is showing.
    // Collapse: knees buckle, it drops to its knees, sways, and falls on its face. Slump: sits down into the heap.
    ANIMS.death_collapse = {
      setup: 'still', len: 36, land: -1, lie: [0, -1], down: 15, rest: 0.5,
      root: { pos: [[0, [0, 0, 0]], [3, [0, -1.5, 0]], [6, [0, -6, 0], 'L'], [8, [0, -5.2, 0]], [10, [0, -6, 0]], [13, [0, -7, 0]], [15, [0, -10, 0], 'L'], [17, [0, -9.2, 0]], [19, [0, -10, 0]]] },
      torso: { rot: [[0, [0, 0, 0]], [3, [-8, 0, 4]], [6, [-20, 0, 0], 'L'], [8, [-8, 0, -4]], [10, [-16, 0, 4]], [12, [-30, 0, 2]], [14, [-66, 0, 0]], [15, [-90, 0, 0], 'L'], [17, [-84, 0, 0]], [19, [-90, 0, 0]]] },
      head: {
        rot: [[0, [0, 0, 0]], [3, [-12, 0, -6]], [6, [-26, 0, 4], 'L'], [8, [-10, 6, -6]], [10, [-24, -4, 8]], [12, [-30, 0, 4]], [14, [-6, 0, 0]], [15, [8, 24, 0], 'L'],
          [17, [2, 42, 0]], [20, [0, 52, 0]]],
        pos: [[14, [0, 0, 0]], [15, [0, 0, 2.5], 'L']],
      },
      arm_r: { rot: [[0, ARM_REST], [3, [90, 0, 6]], [6, [30, 0, 14]], [8, [10, 0, 10]], [10, [20, 0, 8]], [12, [36, 0, 10]], [14, [50, 0, 12]], [15, [4, 0, 14], 'L'], [17, [-8, 0, 16]], [19, [0, 0, 14]]] },
      arm_l: { rot: [[0, ARM_REST], [3, [86, 0, 8]], [6, [26, 0, 16]], [8, [8, 0, 12]], [10, [18, 0, 10]], [12, [34, 0, 12]], [14, [48, 0, 14]], [15, [6, 0, 18], 'L'], [17, [-6, 0, 20]], [19, [0, 0, 18]]] },
      leg_r: { rot: [[0, [0, 0, 0]], [3, [-10, 0, 8]], [6, [-60, 0, 8], 'L'], [8, [-56, 0, 8]], [10, [-60, 0, 8]], [13, [-72, 0, 8]], [15, [-90, 0, 8], 'L'], [17, [-96, 0, 8]], [19, [-90, 0, 8]]] },
      leg_l: { rot: [[0, [0, 0, 0]], [3, [4, 0, 6]], [6, [-60, 0, 8], 'L'], [8, [-57, 0, 8]], [10, [-60, 0, 8]], [13, [-72, 0, 8]], [15, [-90, 0, 8], 'L'], [17, [-95, 0, 8]], [19, [-90, 0, 8]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [4, 2]],
    };
    ANIMS.death_slump = {
      setup: 'still', len: 34, land: -1, down: 6, rest: 0.9,
      root: { pos: [[0, [0, 0, 0]], [3, [0, -2, 0]], [6, [0, -10, 0], 'L'], [8, [0, -9.2, 0]], [10, [0, -10, 0]]] },
      torso: { rot: [[0, [0, 0, 0]], [3, [-8, 0, 0]], [6, [6, 0, 4], 'L'], [8, [-10, 0, -6]], [10, [-24, 0, 6]], [13, [-38, 0, 14]], [16, [-46, 0, 18]], [22, [-50, 0, 22]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [-14, 0, 0]], [6, [10, 8, 8], 'L'], [8, [-12, -8, -8]], [10, [-26, 6, 10]], [13, [-36, 4, 16]], [16, [-40, 2, 22]], [22, [-42, 0, 24]]] },
      arm_r: { rot: [[0, ARM_REST], [3, [80, 0, 10]], [6, [20, 0, 30], 'L'], [8, [4, 0, 18]], [10, [10, 0, 12]], [13, [30, 0, 10]], [16, [40, 0, 12]]] },
      arm_l: { rot: [[0, ARM_REST], [3, [76, 0, 12]], [6, [18, 0, 34], 'L'], [8, [4, 0, 22]], [10, [10, 0, 18]], [13, [26, 0, 18]], [16, [36, 0, 20]]] },
      leg_r: { rot: [[0, [0, 0, 0]], [3, [16, 0, 10]], [6, [90, 0, 18], 'L'], [8, [80, 0, 18]], [10, [90, 0, 18]]] },
      leg_l: { rot: [[0, [0, 0, 0]], [3, [12, 0, 8]], [6, [86, 0, 14], 'L'], [8, [78, 0, 14]], [10, [88, 0, 15]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [4, 2]],
    };

    return { ANIMS, DEATHS };
  }

  // ---------- the villager-like reactions ----------
  // Same house style, grown from the approved humanoid clips: body, head, legs, walk and face tracks are the humanoid
  // clip's keys; only the arms are new. Illagers' separate arms keep the humanoid arm keys (both are absolute poses from
  // hanging) through the impact, flight and landing, then come together at CROSS and cross again (the cross track).
  // Villagers and witches have only the crossed arms, keyed here as one piece (`arms`): they jolt up with the blow, flap
  // in the air, slap down on landing and settle. One clip each for front, light, side (the mod mirrors it for the left),
  // back and big (crits and sprint hits); death twins for front and big (the heap, also for side and back kills and the
  // fallback when there's no room), and a collapse for deaths without a hit that stays in its own footprint.
  function villagerAnims() {
    const H = humanoidAnims().ANIMS;
    const body = name => { const a = JSON.parse(JSON.stringify(H[name])); delete a.arm_r; delete a.arm_l; return a; };
    const keep = (keys, upTo) => JSON.parse(JSON.stringify(keys.filter(k => k[0] <= upTo)));
    const HA = n => H[n].arm_r.rot, HB = n => H[n].arm_l.rot;
    const ANIMS = {};

    // Front (heavy): the slash from its right. Illagers fling their arms apart out of the cross; villagers throw the
    // crossed arms up and toward the blow's far side. They slap down on landing and cross again as it straightens.
    ANIMS.hit_front = Object.assign(body('hit_front'), {
      arm_r: { rot: keep(HA('hit_front'), 13).concat([[16, [46, 20, 10]], [18, CROSS]]) },
      arm_l: { rot: keep(HB('hit_front'), 13).concat([[16, [48, 22, 8]], [18, CROSS]]) },
      arms: {
        rot: [[0, [38, 10, 14], 'L'], [1, [38, 10, 14], 'L'], [2, [48, 12, 18]], [4, [42, 6, 10]], [6, [30, 0, 4]], [8, [16, -4, 0]],
          [10, [-12, 0, -4], 'L'], [11, [-20, 0, -6]], [13, [-6, 0, 0]], [15, [-10, 0, 0]], [18, [0, 0, 0]], [20, [4, 0, 0]], [22, [0, 0, 0]]],
        pos: [[0, [0, 1, 1], 'L'], [1, [0, 1, 1], 'L'], [4, [0, 0.5, 0.5]], [8, [0, 0, 0]]],
      },
      cross: [[0, 0], [18, 1]],
    });

    // Light (an uncharged swing): the same impact and flight, a split-stance landing and a quick re-cross.
    ANIMS.hit_light = Object.assign(body('hit_light'), {
      arm_r: { rot: keep(HA('hit_light'), 11).concat([[13, [48, 18, 12]], [14, CROSS]]) },
      arm_l: { rot: keep(HB('hit_light'), 11).concat([[13, [50, 20, 10]], [14, CROSS]]) },
      arms: {
        rot: [[0, [28, 8, 10], 'L'], [1, [28, 8, 10], 'L'], [2, [36, 10, 12]], [4, [32, 4, 6]], [6, [22, 0, 2]], [8, [12, -2, 0]],
          [10, [-8, 0, -2], 'L'], [11, [-14, 0, -4]], [13, [2, 0, 0]], [15, [-2, 0, 0]], [17, [0, 0, 0]]],
      },
      cross: [[0, 0], [14, 1]],
    });

    // Side (hit on its right; the mod mirrors it for the left): spun away, the near arm flung high, the far one across.
    // Villagers' crossed arms swing out toward the blow, lag through the spin and slap down on the landing.
    ANIMS.hit_side = Object.assign(body('hit_side_r'), {
      arm_r: { rot: keep(HA('hit_side_r'), 13).concat([[16, [46, 20, 10]], [18, CROSS]]) },
      arm_l: { rot: keep(HB('hit_side_r'), 13).concat([[16, [48, 22, 8]], [18, CROSS]]) },
      arms: {
        rot: [[0, [24, -10, 18], 'L'], [1, [24, -10, 18], 'L'], [2, [30, -6, 22]], [4, [26, 0, 14]], [6, [18, 4, 6]], [8, [8, 0, 0]],
          [10, [-10, 0, -6], 'L'], [11, [-16, 0, -8]], [13, [-4, 0, 0]], [15, [-8, 0, 0]], [18, [0, 0, 0]], [20, [3, 0, 0]], [22, [0, 0, 0]]],
      },
      cross: [[0, 0], [18, 1]],
    });

    // Back: whipped forward, arms thrown up and back over the head (illagers) or up in front of the face (villagers).
    ANIMS.hit_back = Object.assign(body('hit_back'), {
      arm_r: { rot: keep(HA('hit_back'), 13).concat([[16, [46, 20, 10]], [18, CROSS]]) },
      arm_l: { rot: keep(HB('hit_back'), 13).concat([[16, [48, 22, 8]], [18, CROSS]]) },
      arms: {
        rot: [[0, [60, 0, 0], 'L'], [1, [60, 0, 0], 'L'], [2, [72, 0, 0]], [4, [58, 0, 4]], [6, [40, 0, -4]], [8, [20, 0, 0]],
          [10, [-12, 0, 0], 'L'], [11, [-20, 0, 0]], [13, [-6, 0, 0]], [15, [-10, 0, 0]], [18, [0, 0, 0]], [20, [3, 0, 0]], [22, [0, 0, 0]]],
        pos: [[0, [0, 1, -1], 'L'], [1, [0, 1, -1], 'L'], [4, [0, 0.5, 0]], [8, [0, 0, 0]]],
      },
      cross: [[0, 0], [18, 1]],
    });

    // Big (crits and sprint hits): the blow from above buckles its knees, arms flung out and down; it wobbles dizzy
    // after the landing with its arms hanging, then gathers itself and crosses them again.
    ANIMS.hit_big = Object.assign(body('hit_crit'), {
      arm_r: { rot: keep(HA('hit_crit'), 25).concat([[27, [40, 18, 12]], [29, CROSS]]) },
      arm_l: { rot: keep(HB('hit_crit'), 25).concat([[27, [42, 20, 10]], [29, CROSS]]) },
      arms: {
        rot: [[0, [-20, 0, 6], 'L'], [1, [-20, 0, 6], 'L'], [3, [24, 0, -6]], [5, [30, 6, 8]], [7, [14, -6, -4]], [9, [20, 0, 0]],
          [10, [-16, 0, 0], 'L'], [11, [-22, 0, 4]], [13, [-10, 0, -6]], [16, [-14, 0, 6]], [19, [-8, 0, -6]], [22, [-12, 0, 4]], [25, [-6, 0, 0]],
          [28, [4, 0, 0], 'L'], [30, [0, 0, 0]]],
        pos: [[0, [0, -1, 0], 'L'], [1, [0, -1, 0], 'L'], [4, [0, 0, 0]]],
      },
      cross: [[0, 0], [29, 1]],
    });

    // Deaths. Twins keep their hit's keys up to `cut` (deathClip), then fall; the arms never cross again. Illagers' arms
    // follow the humanoid deaths; villagers' crossed arms flap up in the fall and end folded on the body.
    const DEATHS = {
      // Front: tips back in the air and slams flat on its back; arms slap out to the sides (illagers) or come to rest
      // folded over the belly (villagers).
      death_front: ['hit_front', 3, Object.assign(body('death_front'), {
        arm_r: { rot: HA('death_front').filter(k => k[0] > 3) },
        arm_l: { rot: HB('death_front').filter(k => k[0] > 3) },
        arms: { rot: [[6, [52, 0, 8]], [8, [60, 0, 4]], [9, [58, 0, 0]], [10, [-30, 0, 0], 'L'], [12, [-22, 0, 0]], [14, [-32, 0, 0]], [16, [-28, 0, 0]], [20, [-30, 0, 0]]] },
        cross: [[0, 0]],
      })],
      // Big: the knees go on landing, it sits down hard and slumps over into a heap in its own footprint, x x eyes, the
      // arms dropping into its lap.
      death_big: ['hit_big', 3, Object.assign(body('death_crit'), {
        arm_r: { rot: HA('death_crit').filter(k => k[0] > 3) },
        arm_l: { rot: HB('death_crit').filter(k => k[0] > 3) },
        arms: { rot: [[5, [28, 0, 6]], [7, [16, 0, -4]], [9, [20, 0, 0]], [10, [-20, 0, 0], 'L'], [12, [-30, 0, 6]], [14, [-24, 0, -4]], [16, [-34, 0, 4]], [20, [-38, 0, 6]],
          [26, [-40, 0, 6]]] },
        cross: [[0, 0]],
      })],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) {
      delete d.setup; delete d.len; delete d.land; delete d.walk;
      const b = H[name === 'death_front' ? 'death_front' : 'death_crit'];
      ANIMS[name] = deathClip(ANIMS, base, cut, Object.assign(d, { setup: b.setup, len: b.len, land: b.land, lie: b.lie, down: b.down, rest: b.rest }));
    }
    // No hit: the knees buckle and it drops onto them, sways, and folds forward over them, head down, arms limp. It stays
    // in its own footprint, so it never needs the room check.
    ANIMS.death_collapse = {
      setup: 'still', len: 36, land: -1, lie: null, down: 16, rest: 0.9,
      root: { pos: [[0, [0, 0, 0]], [3, [0, -1.5, 0]], [6, [0, -6, 0], 'L'], [8, [0, -5.2, 0]], [10, [0, -6, 0]], [14, [0, -8.5, 0]], [16, [0, -10, 0], 'L'],
        [18, [0, -9.4, 0]], [20, [0, -10, 0]]] },
      pelvis: { rot: [[6, [0, 0, 0]], [8, [0, 0, 3]], [10, [0, 0, -2]], [12, [0, 0, 0]]] },
      torso: { rot: [[0, [0, 0, 0]], [3, [-8, 0, 4]], [6, [-16, 0, 0], 'L'], [8, [-6, 0, -4]], [10, [-14, 0, 4]], [12, [-24, 0, 2]], [14, [-40, 0, 0]], [16, [-58, 0, 0], 'L'],
        [18, [-52, 0, 2]], [20, [-58, 0, 0]], [24, [-60, 0, -2]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [-12, 0, -6]], [6, [-26, 0, 4], 'L'], [8, [-10, 6, -6]], [10, [-24, -4, 8]], [12, [-30, 0, 4]], [14, [-20, 0, 0]], [16, [-36, 0, 6], 'L'],
        [18, [-30, 0, 8]], [22, [-40, 0, 10]]] },
      arm_r: { rot: [[0, CROSS], [3, [20, 0, 8]], [6, [10, 0, 14], 'L'], [8, [4, 0, 10]], [10, [12, 0, 8]], [14, [20, 0, 10]], [16, [8, 0, 16], 'L'], [18, [0, 0, 18]], [20, [4, 0, 16]]] },
      arm_l: { rot: [[0, CROSS], [3, [18, 0, 10]], [6, [8, 0, 16], 'L'], [8, [2, 0, 12]], [10, [10, 0, 10]], [14, [18, 0, 12]], [16, [6, 0, 18], 'L'], [18, [0, 0, 20]], [20, [3, 0, 18]]] },
      arms: { rot: [[0, [0, 0, 0]], [3, [10, 0, 0]], [6, [-14, 0, 0], 'L'], [8, [-6, 0, 0]], [10, [-10, 0, 0]], [14, [-4, 0, 0]], [16, [-24, 0, 0], 'L'], [18, [-18, 0, 0]],
        [20, [-22, 0, 0]]] },
      leg_r: { rot: [[0, [0, 0, 0]], [3, [-10, 0, 6]], [6, [-60, 0, 8], 'L'], [8, [-56, 0, 8]], [10, [-60, 0, 8]], [14, [-80, 0, 8]], [16, [-90, 0, 8], 'L'], [18, [-94, 0, 8]],
        [20, [-90, 0, 8]]] },
      leg_l: { rot: [[0, [0, 0, 0]], [3, [4, 0, 6]], [6, [-60, 0, 8], 'L'], [8, [-57, 0, 8]], [10, [-60, 0, 8]], [14, [-80, 0, 8]], [16, [-90, 0, 8], 'L'], [18, [-95, 0, 8]],
        [20, [-90, 0, 8]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [4, 2]],
      cross: [[0, 0]],
    };
    return { ANIMS, DEATHS };
  }

  // ---------- the quadruped reactions (keyed on the cow) ----------
  // Same house style and timing as the humanoids (impact held from tick 0 to 1, flight synced to the real hop, landing on
  // tick 10, a settle, a head shake), in a four-legged body: the blow rocks the whole body about the middle of the belly,
  // the legs splay and paddle, the head whips a tick late. Deaths roll the body over onto a flank about that flank's edge
  // on the ground (tip_r/tip_l), so it lies on its side with the legs sticking out, or drop it flat on its belly.
  function quadrupedAnims() {
    const ANIMS = {};
    // Front (heavy): the slash across the face from its right. It rocks back onto its hind legs with the front legs
    // thrown up and out, head snapped away; in the air it keeps turning while the head comes back, the front legs paddle
    // and the hind legs trail; it lands front-heavy with the front legs buckling, settles twice, stays head-down a beat,
    // straightens and shakes its head.
    ANIMS.hit_front = {
      setup: 'front', len: 26, land: 10,
      root: {
        pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -1.4, 0], 'L'], [11, [0, -2.2, 0]], [13, [0, -0.6, 0]], [15, [0, -1, 0]], [18, [0, 0, 0]]],
        rot: [[0, [0, 8, 0], 'L'], [1, [0, 8, 0], 'L'], [4, [0, 12, 0]], [7, [0, 16, 0]], [10, [0, 10, 0]], [13, [0, 6, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.03, 0.96, 1.03], 'L'], [1, [1.03, 0.96, 1.03], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: {
        rot: [[0, [10, 0, -4], 'L'], [1, [10, 0, -4], 'L'], [3, [16, 0, -2]], [5, [13, 0, 0]], [7, [8, 0, 0]], [9, [2, 0, 0]], [10, [-6, 0, 0], 'L'], [11, [-10, 0, 0]],
          [13, [-3, 0, 0]], [15, [-6, 0, 0]], [18, [-1, 0, 0]], [20, [0, 0, 0]]],
      },
      head: {
        rot: [[0, [26, 24, 12], 'L'], [1, [26, 24, 12], 'L'], [2, [34, 28, 14]], [4, [18, 14, 6]], [6, [8, -2, 2]], [8, [2, -14, 0]], [9, [0, -14, 0]], [10, [-8, -6, 0], 'L'],
          [11, [-18, -4, 0]], [12, [-24, 0, 0]], [14, [-8, 0, 0]], [16, [-12, 0, 0]], [18, [0, 0, 0]], [19, [0, 18, 0]], [20, [0, -14, 0]], [21, [0, 10, 0]], [22, [0, -4, 0]],
          [24, [0, 0, 0]]],
      },
      leg_fr: { rot: [[0, [28, 0, 14], 'L'], [1, [28, 0, 14], 'L'], [2, [36, 0, 16]], [4, [24, 0, 10]], [6, [4, 0, 6]], [8, [-10, 0, 4]], [10, [-6, 0, 10], 'L'], [11, [4, 0, 14]],
        [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_fl: { rot: [[0, [20, 0, 6], 'L'], [1, [20, 0, 6], 'L'], [2, [30, 0, 8]], [4, [34, 0, 6]], [6, [16, 0, 4]], [8, [-2, 0, 2]], [10, [-4, 0, 8], 'L'], [11, [6, 0, 12]],
        [13, [0, 0, 4]], [16, [0, 0, 0]]] },
      leg_hr: { rot: [[0, [14, 0, 4], 'L'], [1, [14, 0, 4], 'L'], [3, [-8, 0, 6]], [5, [-18, 0, 6]], [8, [-8, 0, 4]], [10, [6, 0, 6], 'L'], [11, [10, 0, 8]], [13, [2, 0, 4]],
        [16, [0, 0, 0]]] },
      leg_hl: { rot: [[0, [10, 0, 4], 'L'], [1, [10, 0, 4], 'L'], [3, [-4, 0, 6]], [5, [-22, 0, 6]], [8, [-12, 0, 4]], [10, [4, 0, 6], 'L'], [11, [8, 0, 8]], [13, [2, 0, 3]],
        [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    };

    // Light (an uncharged swing): the same kind of jolt, smaller, and a quick recovery.
    ANIMS.hit_light = {
      setup: 'front', len: 22, land: 10,
      root: {
        pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -0.9, 0], 'L'], [11, [0, -1.4, 0]], [13, [0, 0.1, 0]], [15, [0, 0, 0]]],
        rot: [[0, [0, 6, 0], 'L'], [1, [0, 6, 0], 'L'], [4, [0, 10, 0]], [7, [0, 12, 0]], [10, [0, 10, 0]], [12, [0, 8, 0]], [14, [0, 2, 0]], [16, [0, -1, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.02, 0.97, 1.02], 'L'], [1, [1.02, 0.97, 1.02], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [7, 0, -3], 'L'], [1, [7, 0, -3], 'L'], [3, [11, 0, -1]], [6, [7, 0, 0]], [9, [2, 0, 0]], [10, [-4, 0, 0], 'L'], [11, [-6, 0, 0]], [13, [1, 0, 0]], [15, [0, 0, 0]]] },
      head: {
        rot: [[0, [18, 18, 8], 'L'], [1, [18, 18, 8], 'L'], [2, [24, 20, 10]], [4, [12, 10, 4]], [6, [6, -4, 2]], [8, [2, -10, 0]], [10, [-6, -6, 0], 'L'], [11, [-12, -4, 0]],
          [12, [2, -4, 0]], [13, [0, 8, 2]], [14, [0, -10, -1]], [15, [0, -2, 0]], [17, [0, 0, 0]]],
      },
      leg_fr: { rot: [[0, [20, 0, 10], 'L'], [1, [20, 0, 10], 'L'], [3, [24, 0, 10]], [6, [6, 0, 4]], [9, [-6, 0, 4]], [10, [-4, 0, 8], 'L'], [11, [4, 0, 10]], [13, [0, 0, 2]], [15, [0, 0, 0]]] },
      leg_fl: { rot: [[0, [14, 0, 4], 'L'], [1, [14, 0, 4], 'L'], [3, [22, 0, 6]], [6, [10, 0, 4]], [9, [-2, 0, 2]], [10, [-2, 0, 6], 'L'], [11, [4, 0, 8]], [13, [0, 0, 2]], [15, [0, 0, 0]]] },
      leg_hr: { rot: [[0, [10, 0, 3], 'L'], [1, [10, 0, 3], 'L'], [4, [-10, 0, 4]], [8, [-6, 0, 2]], [10, [4, 0, 4], 'L'], [12, [2, 0, 2]], [14, [0, 0, 0]]] },
      leg_hl: { rot: [[0, [8, 0, 3], 'L'], [1, [8, 0, 3], 'L'], [4, [-14, 0, 4]], [8, [-8, 0, 2]], [10, [2, 0, 4], 'L'], [12, [2, 0, 2]], [14, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
      face: [[0, 1], [3, 3], [10, 1], [15, 0]],
    };

    // Side (hit on its right; the mod mirrors it for the left): shoved and spun away, it rolls onto its left legs with the
    // right legs flung out, head whipped away; it keeps spinning in the air while the head turns back, lands on its left
    // legs with a rebound roll, settles twice and turns back to face the attacker, head first, before a shake.
    ANIMS.hit_side = {
      setup: 'side_r', len: 26, land: 10,
      root: {
        pos: [[0, [0, -0.6, 0], 'L'], [1, [0, -0.6, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.6, 0]], [15, [0, -0.9, 0]], [18, [0, 0, 0]]],
        rot: [[0, [0, 22, 0], 'L'], [1, [0, 22, 0], 'L'], [3, [0, 44, 0]], [5, [0, 56, 0]], [7, [0, 56, 0]], [9, [0, 46, 0]], [10, [0, 42, 0]], [13, [0, 34, 0]], [15, [0, 20, 0]],
          [17, [0, 4, 0]], [19, [0, -4, 0]], [21, [0, 0, 0]]],
        scale: [[0, [0.97, 0.97, 1.02], 'L'], [1, [0.97, 0.97, 1.02], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [2, 0, 16], 'L'], [1, [2, 0, 16], 'L'], [3, [0, 0, 20]], [5, [0, 0, 14]], [7, [0, 0, 6]], [9, [0, 0, 0]], [10, [0, 0, -8], 'L'], [11, [0, 0, -10]],
        [13, [0, 0, 3]], [15, [0, 0, -3]], [17, [0, 0, 0]]] },
      head: {
        rot: [[0, [6, 26, 16], 'L'], [1, [6, 26, 16], 'L'], [2, [10, 32, 20]], [4, [6, 18, 10]], [6, [2, -4, 4]], [8, [0, -18, 0]], [10, [-8, -12, -4], 'L'], [11, [-14, -8, -6]],
          [13, [-6, -4, 0]], [15, [-8, -20, 0]], [17, [0, -8, 0]], [19, [0, 16, 0]], [20, [0, -12, 0]], [21, [0, 8, 0]], [22, [0, -3, 0]], [24, [0, 0, 0]]],
      },
      leg_fr: { rot: [[0, [10, 0, 26], 'L'], [1, [10, 0, 26], 'L'], [2, [14, 0, 34]], [5, [20, 0, 24]], [8, [4, 0, 10]], [10, [0, 0, 16], 'L'], [11, [4, 0, 18]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_hr: { rot: [[0, [-6, 0, 22], 'L'], [1, [-6, 0, 22], 'L'], [2, [-10, 0, 30]], [5, [-16, 0, 20]], [8, [-6, 0, 8]], [10, [0, 0, 12], 'L'], [11, [-4, 0, 14]], [13, [0, 0, 4]], [16, [0, 0, 0]]] },
      leg_fl: { rot: [[0, [4, 0, -8], 'L'], [1, [4, 0, -8], 'L'], [3, [16, 0, -4]], [6, [24, 0, 2]], [9, [6, 0, 4]], [10, [-4, 0, -6], 'L'], [11, [0, 0, -10]], [13, [0, 0, -2]], [16, [0, 0, 0]]] },
      leg_hl: { rot: [[0, [-2, 0, -8], 'L'], [1, [-2, 0, -8], 'L'], [3, [-12, 0, -4]], [6, [-20, 0, 2]], [9, [-6, 0, 4]], [10, [2, 0, -6], 'L'], [11, [0, 0, -10]], [13, [0, 0, -2]], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    };

    // Back: a buck. The blow from behind throws the rump up and the hind legs kick back, head thrown up; the rump comes
    // down in the air, it lands front first, the hind legs stamp, it settles and looks round, surprised.
    ANIMS.hit_back = {
      setup: 'back', len: 26, land: 10,
      root: {
        pos: [[0, [0, -0.5, 0], 'L'], [1, [0, -0.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.5, 0]], [15, [0, -0.8, 0]], [18, [0, 0, 0]]],
        rot: [[0, [0, -4, 0], 'L'], [1, [0, -4, 0], 'L'], [5, [0, -6, 0]], [10, [0, -2, 0]], [14, [0, 6, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.02, 0.97, 1.03], 'L'], [1, [1.02, 0.97, 1.03], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [-16, 0, 3], 'L'], [1, [-16, 0, 3], 'L'], [3, [-20, 0, 2]], [5, [-14, 0, 0]], [7, [-8, 0, 0]], [9, [-3, 0, 0]], [10, [-7, 0, 0], 'L'], [11, [-2, 0, 0]],
        [12, [4, 0, 0]], [14, [-1, 0, 0]], [16, [1, 0, 0]], [18, [0, 0, 0]]] },
      head: {
        rot: [[0, [22, -6, 6], 'L'], [1, [22, -6, 6], 'L'], [2, [30, -8, 8]], [4, [16, -4, 4]], [6, [4, 0, 0]], [8, [-4, 0, 0]], [10, [-14, 0, 0], 'L'], [11, [-20, 0, 0]],
          [13, [-4, 10, 0]], [15, [4, 26, 4]], [17, [6, 30, 4]], [19, [2, 12, 0]], [21, [0, 0, 0]]],
      },
      leg_hr: { rot: [[0, [-40, 0, 8], 'L'], [1, [-40, 0, 8], 'L'], [2, [-48, 0, 10]], [4, [-34, 0, 8]], [6, [-16, 0, 4]], [8, [-4, 0, 2]], [10, [-8, 0, 4], 'L'], [11, [8, 0, 6]],
        [12, [14, 0, 6]], [14, [0, 0, 2]], [16, [0, 0, 0]]] },
      leg_hl: { rot: [[0, [-34, 0, 6], 'L'], [1, [-34, 0, 6], 'L'], [2, [-44, 0, 8]], [4, [-38, 0, 6]], [6, [-20, 0, 4]], [8, [-6, 0, 2]], [10, [-10, 0, 4], 'L'], [11, [6, 0, 6]],
        [12, [12, 0, 6]], [14, [0, 0, 2]], [16, [0, 0, 0]]] },
      leg_fr: { rot: [[0, [-10, 0, 6], 'L'], [1, [-10, 0, 6], 'L'], [3, [-4, 0, 6]], [6, [8, 0, 4]], [9, [4, 0, 2]], [10, [-8, 0, 10], 'L'], [11, [-12, 0, 12]], [13, [-2, 0, 4]], [16, [0, 0, 0]]] },
      leg_fl: { rot: [[0, [-8, 0, 6], 'L'], [1, [-8, 0, 6], 'L'], [3, [0, 0, 6]], [6, [12, 0, 4]], [9, [6, 0, 2]], [10, [-6, 0, 10], 'L'], [11, [-10, 0, 12]], [13, [-2, 0, 4]], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [16, 0.8], [19, 1]],
      face: [[0, 1], [14, 3], [21, 0]],
    };

    // Big (crits and sprint hits): the blow from above flattens it, legs splayed out like a table giving way; it bounces
    // up with the legs dangling, lands splayed again, wobbles dizzy, gathers its legs and shakes its head.
    ANIMS.hit_big = {
      setup: 'front', len: 32, land: 10,
      root: {
        pos: [[0, [0, -3, 0], 'L'], [1, [0, -3, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -3.5, 0], 'L'], [11, [0, -4, 0]], [13, [0, -1.5, 0]], [16, [0, -2, 0]], [20, [0, -1, 0]],
          [26, [0, -0.5, 0]], [29, [0, 0, 0]]],
        rot: [[0, [0, 4, 0], 'L'], [1, [0, 4, 0], 'L'], [6, [0, -4, 0]], [10, [0, 0, 0]]],
        scale: [[0, [1.06, 0.92, 1.06], 'L'], [1, [1.06, 0.92, 1.06], 'L'], [3, [0.98, 1.03, 0.98]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.05, 0.94, 1.05], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [-3, 0, 3], 'L'], [1, [-3, 0, 3], 'L'], [3, [6, 0, 0]], [7, [3, 0, -2]], [10, [0, 0, 0], 'L'], [13, [0, 0, 7]], [17, [0, 0, -7]], [21, [0, 0, 5]],
        [25, [0, 0, -2]], [28, [0, 0, 0]]] },
      head: {
        rot: [[0, [-20, 8, 8], 'L'], [1, [-20, 8, 8], 'L'], [2, [-6, 4, 4]], [3, [20, 0, 0]], [5, [8, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [-18, 0, 0], 'L'],
          [11, [-24, 0, 0]], [12, [6, 0, 10]], [14, [10, -8, -12]], [16, [2, 6, 14]], [18, [-6, -4, -10]], [20, [8, 6, 10]], [22, [-4, -3, -6]], [24, [4, 2, 4]], [26, [0, 0, 0]],
          [28, [0, 20, 0]], [29, [0, -16, 0]], [30, [0, 8, 0]], [31, [0, 0, 0]]],
      },
      leg_fr: { rot: [[0, [6, 0, 34], 'L'], [1, [6, 0, 34], 'L'], [3, [10, 0, 12]], [5, [16, 0, 4]], [7, [6, 0, 10]], [9, [8, 0, 6]], [10, [4, 0, 28], 'L'], [11, [4, 0, 32]],
        [13, [2, 0, 16]], [16, [2, 0, 20]], [19, [0, 0, 12]], [22, [0, 0, 16]], [25, [0, 0, 10]], [28, [0, 0, 0]]] },
      leg_fl: { rot: [[0, [6, 0, 30], 'L'], [1, [6, 0, 30], 'L'], [3, [12, 0, 10]], [5, [8, 0, 6]], [7, [14, 0, 8]], [9, [6, 0, 6]], [10, [4, 0, 26], 'L'], [11, [4, 0, 30]],
        [13, [2, 0, 14]], [16, [2, 0, 18]], [19, [0, 0, 10]], [22, [0, 0, 14]], [25, [0, 0, 8]], [28, [0, 0, 0]]] },
      leg_hr: { rot: [[0, [-6, 0, 30], 'L'], [1, [-6, 0, 30], 'L'], [3, [-12, 0, 10]], [5, [-6, 0, 6]], [7, [-14, 0, 8]], [9, [-6, 0, 6]], [10, [-4, 0, 26], 'L'], [11, [-4, 0, 30]],
        [13, [-2, 0, 14]], [16, [-2, 0, 18]], [19, [0, 0, 10]], [22, [0, 0, 14]], [25, [0, 0, 8]], [28, [0, 0, 0]]] },
      leg_hl: { rot: [[0, [-6, 0, 34], 'L'], [1, [-6, 0, 34], 'L'], [3, [-10, 0, 12]], [5, [-16, 0, 4]], [7, [-6, 0, 10]], [9, [-8, 0, 6]], [10, [-4, 0, 28], 'L'], [11, [-4, 0, 32]],
        [13, [-2, 0, 16]], [16, [-2, 0, 20]], [19, [0, 0, 12]], [22, [0, 0, 16]], [25, [0, 0, 10]], [28, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [26, 0.3], [29, 1]],
      face: [[0, 1], [10, 2], [27, 1], [30, 0]],
    };

    // Deaths. Front: the rear-back keeps going; in the air it rolls over onto its right side and lands on it, legs stiff
    // and sticking out, head flopping to the ground; a small bounce, then a last twitch of a hind leg.
    const DEATHS = {
      death_front: ['hit_front', 3, {
        setup: 'front_dead', len: 34, lie: [1, 0], down: 10, rest: 0.75,
        root: { rot: [[4, [0, 12, 0]], [7, [0, 16, 0]], [10, [0, 18, 0]]] },
        tip_r: { rot: [[3, [0, 0, 0]], [5, [0, 0, -16]], [7, [0, 0, -44]], [9, [0, 0, -76]], [10, [0, 0, -90], 'L'], [12, [0, 0, -84]], [14, [0, 0, -90]], [16, [0, 0, -88]], [18, [0, 0, -90]]] },
        pelvis: { rot: [[5, [12, 0, 0]], [8, [4, 0, 0]], [10, [0, 0, 0], 'L']] },
        head: { rot: [[4, [18, 14, 6]], [6, [8, 0, 0]], [9, [0, -8, -6]], [10, [-6, -4, -18], 'L'], [12, [4, 0, -8]], [14, [-8, 4, -20]], [18, [-10, 6, -22]], [26, [-10, 6, -24]]] },
        leg_fr: { rot: [[4, [24, 0, 10]], [7, [12, 0, 6]], [10, [14, 0, 4], 'L'], [12, [20, 0, 6]], [14, [14, 0, 4]], [20, [14, 0, 4]]] },
        leg_fl: { rot: [[4, [30, 0, 6]], [7, [18, 0, 4]], [10, [8, 0, -6], 'L'], [12, [14, 0, -2]], [14, [8, 0, -6]], [20, [8, 0, -6]]] },
        leg_hr: { rot: [[4, [-10, 0, 6]], [7, [-16, 0, 4]], [10, [-12, 0, 4], 'L'], [12, [-18, 0, 6]], [14, [-12, 0, 4]], [20, [-12, 0, 4]], [22, [-26, 0, 4]], [24, [-12, 0, 4]]] },
        leg_hl: { rot: [[4, [-14, 0, 6]], [7, [-20, 0, 4]], [10, [-8, 0, -6], 'L'], [12, [-14, 0, -2]], [14, [-8, 0, -6]], [20, [-8, 0, -6]]] },
        face: [[0, 1], [10, 2]],
      }],
      // Big: flattened again on landing and stays down: the body drops onto its belly with the legs splayed flat like a
      // rug, chin on the ground, x x eyes. It stays in its own footprint, so it's also the fallback without room.
      death_big: ['hit_big', 3, {
        setup: 'front_dead', len: 34, lie: null, down: 11, rest: 0.6,
        pelvis: {
          pos: [[3, [0, 0, 0]], [7, [0, -1, 0]], [9, [0, -4, 0]], [10, [0, -11, 0], 'L'], [11, [0, -12, 0]], [13, [0, -10.8, 0]], [15, [0, -12, 0]]],
          rot: [[3, [6, 0, 0]], [7, [2, 0, -2]], [10, [0, 0, 0], 'L'], [12, [0, 0, 3]], [14, [0, 0, -1]], [16, [0, 0, 0]]],
        },
        head: { rot: [[5, [8, -20, 10]], [7, [4, 16, -8]], [9, [4, -6, 4]], [10, [-18, 0, 0], 'L'], [12, [-8, 8, 8]], [14, [-22, 4, 12]], [18, [-24, 6, 14]], [26, [-24, 6, 16]]] },
        leg_fr: { rot: [[5, [16, 0, 8]], [8, [10, 0, 20]], [10, [24, 0, 80], 'L'], [12, [26, 0, 72]], [14, [24, 0, 82]], [18, [24, 0, 80]]] },
        leg_fl: { rot: [[5, [8, 0, 6]], [8, [14, 0, 18]], [10, [20, 0, 78], 'L'], [12, [22, 0, 70]], [14, [20, 0, 80]], [18, [20, 0, 78]]] },
        leg_hr: { rot: [[5, [-6, 0, 6]], [8, [-10, 0, 18]], [10, [-22, 0, 78], 'L'], [12, [-24, 0, 70]], [14, [-22, 0, 80]], [18, [-22, 0, 78]]] },
        leg_hl: { rot: [[5, [-16, 0, 8]], [8, [-12, 0, 20]], [10, [-26, 0, 80], 'L'], [12, [-28, 0, 72]], [14, [-26, 0, 82]], [18, [-26, 0, 80]]] },
        face: [[0, 1], [10, 2]],
      }],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    // No hit: the front knees give first and it drops onto them, sways, the hind legs fold and it sinks onto its belly,
    // then it rolls over onto its left side, legs flopping out straight, head down, x x eyes.
    ANIMS.death_collapse = {
      setup: 'still', len: 36, land: -1, lie: null, down: 18, rest: 0.75,
      pelvis: {
        pos: [[0, [0, 0, 0]], [3, [0, -1, 0]], [6, [0, -5, 0], 'L'], [8, [0, -4.4, 0]], [10, [0, -5, 0]], [12, [0, -8, 0]], [13, [0, -12, 0], 'L'], [15, [0, -11.4, 0]], [17, [0, -12, 0]]],
        rot: [[0, [0, 0, 0]], [3, [-4, 0, 2]], [6, [-16, 0, 0], 'L'], [8, [-12, 0, -3]], [10, [-15, 0, 3]], [12, [-8, 0, 0]], [13, [0, 0, 0], 'L'], [15, [2, 0, 0]], [17, [0, 0, 0]]],
      },
      tip_l: { rot: [[16, [0, 0, 0]], [18, [0, 0, 30]], [20, [0, 0, 76]], [21, [0, 0, 90], 'L'], [23, [0, 0, 84]], [25, [0, 0, 90]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [-10, 0, -4]], [6, [-26, 0, 4], 'L'], [8, [-12, 6, -6]], [10, [-22, -4, 6]], [13, [-30, 0, 0], 'L'], [16, [-20, 0, 4]], [21, [-8, -6, 20], 'L'],
        [23, [-4, -4, 12]], [26, [-10, -6, 22]]] },
      leg_fr: { rot: [[0, [0, 0, 0]], [3, [-20, 0, 4]], [6, [-84, 0, 6], 'L'], [8, [-80, 0, 6]], [10, [-84, 0, 6]], [13, [-86, 0, 8], 'L'], [18, [-60, 0, 6]], [21, [10, 0, 4], 'L'],
        [23, [16, 0, 6]], [25, [10, 0, 4]]] },
      leg_fl: { rot: [[0, [0, 0, 0]], [3, [-16, 0, 4]], [6, [-84, 0, 6], 'L'], [8, [-81, 0, 6]], [10, [-84, 0, 6]], [13, [-86, 0, 8], 'L'], [18, [-60, 0, 6]], [21, [4, 0, -4], 'L'],
        [23, [10, 0, -2]], [25, [4, 0, -4]]] },
      leg_hr: { rot: [[0, [0, 0, 0]], [3, [4, 0, 4]], [6, [10, 0, 4]], [10, [16, 0, 4]], [12, [50, 0, 6]], [13, [86, 0, 8], 'L'], [18, [60, 0, 6]], [21, [-10, 0, 4], 'L'],
        [23, [-16, 0, 6]], [25, [-10, 0, 4]]] },
      leg_hl: { rot: [[0, [0, 0, 0]], [3, [4, 0, 4]], [6, [10, 0, 4]], [10, [16, 0, 4]], [12, [48, 0, 6]], [13, [86, 0, 8], 'L'], [18, [60, 0, 6]], [21, [-4, 0, -4], 'L'],
        [23, [-10, 0, -2]], [25, [-4, 0, -4]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [4, 2]],
    };
    return { ANIMS, DEATHS };
  }

  // ---------- the spider reactions ----------
  // Same house style and timing as the other rigs (impact held from tick 0 to 1, flight synced to the real hop, landing on
  // tick 10, a settle, a head shake), in a low eight-legged body: the blow rocks the whole body about its middle, the legs
  // are flung up or brace, the abdomen follows through a beat late, the head whips. On landing the body dips and the legs
  // splay flatter with it (their tips stay on the ground: a 3 px dip is about +19° of lift for the front and hind pairs,
  // +13° for the middle ones). Deaths end on its back with the legs curled in (the classic), or flat on its belly.
  function spiderAnims() {
    // key helpers: K(times, values, linear times); legs(times, linear times, {r1: [[lift, swing], ...], ...})
    const K = (ts, vs, lin) => ts.map((t, i) => ((lin || []).includes(t) ? [t, vs[i], 'L'] : [t, vs[i]]));
    const legs = (ts, lin, rows) => {
      const o = {};
      for (const [n, vs] of Object.entries(rows)) o['leg_' + n] = { rot: K(ts, vs.map(v => [v[0], v[1], 0]), lin) };
      return o;
    };
    const ANIMS = {};

    // Front (heavy): the slash across the face from its right. The front half rears up with the near front legs flung high,
    // the hind legs dig in, the head snaps away; in the air the body keeps turning, the legs paddle and the head comes back
    // to find the attacker; it lands front-heavy with every leg splaying out, the abdomen whipping up and down, settles
    // twice, stays low a beat, gathers its legs and shakes its head.
    ANIMS.hit_front = Object.assign({
      setup: 'front', len: 26, land: 10,
      root: {
        pos: [[0, [0, -0.5, 0], 'L'], [1, [0, -0.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -2, 0], 'L'], [11, [0, -3, 0]], [13, [0, -0.8, 0]],
          [15, [0, -1.4, 0]], [18, [0, 0, 0]]],
        rot: [[0, [0, 8, 0], 'L'], [1, [0, 8, 0], 'L'], [4, [0, 12, 0]], [7, [0, 16, 0]], [10, [0, 10, 0]], [13, [0, 6, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.03, 0.96, 1.03], 'L'], [1, [1.03, 0.96, 1.03], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: {
        rot: [[0, [12, 0, 5], 'L'], [1, [12, 0, 5], 'L'], [3, [18, 0, 3]], [5, [14, 0, 1]], [7, [8, 0, 0]], [9, [2, 0, 0]], [10, [-6, 0, 0], 'L'], [11, [-9, 0, 0]],
          [13, [-2, 0, 0]], [15, [-5, 0, 0]], [18, [-1, 0, 0]], [20, [0, 0, 0]]],
      },
      abdomen: {
        rot: [[0, [-6, 0, 0], 'L'], [1, [-6, 0, 0], 'L'], [3, [-12, 0, 0]], [5, [-4, 0, 0]], [7, [4, 0, 0]], [9, [2, 0, 0]], [10, [-10, 0, 0], 'L'], [11, [-14, 0, 0]],
          [13, [4, 0, 0]], [15, [-3, 0, 0]], [18, [1, 0, 0]], [20, [0, 0, 0]]],
      },
      head: {
        rot: [[0, [20, 20, 10], 'L'], [1, [20, 20, 10], 'L'], [2, [28, 24, 12]], [4, [14, 12, 4]], [6, [6, -4, 2]], [8, [2, -14, 0]], [9, [0, -14, 0]],
          [10, [-8, -6, 0], 'L'], [11, [-18, -4, 0]], [12, [-22, 0, 0]], [14, [-8, 0, 0]], [16, [-12, 0, 0]], [18, [0, 0, 0]], [19, [0, 18, 0]], [20, [0, -14, 0]],
          [21, [0, 10, 0]], [22, [0, -4, 0]], [24, [0, 0, 0]]],
      },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    }, legs([0, 1, 2, 4, 6, 8, 10, 11, 13, 15, 18], [0, 1, 10], {
      r1: [[40, 10], [40, 10], [52, 14], [34, 20], [10, 24], [4, 6], [20, 0], [26, -4], [6, 0], [10, 0], [0, 0]],
      l1: [[26, 6], [26, 6], [36, 10], [42, 4], [20, -6], [6, 4], [18, 0], [24, -2], [4, 0], [9, 0], [0, 0]],
      r2: [[18, 4], [18, 4], [24, 6], [12, 14], [22, -6], [6, 4], [14, 0], [18, 0], [4, 0], [7, 0], [0, 0]],
      l2: [[12, 2], [12, 2], [16, 4], [24, -8], [10, 10], [6, 2], [13, 0], [17, 0], [4, 0], [6, 0], [0, 0]],
      r3: [[-4, -4], [-4, -4], [-2, -8], [14, -14], [4, 6], [6, 0], [13, 0], [17, 0], [4, 0], [6, 0], [0, 0]],
      l3: [[-2, -2], [-2, -2], [0, -6], [6, 8], [16, -10], [6, 0], [12, 0], [16, 0], [4, 0], [6, 0], [0, 0]],
      r4: [[-8, -8], [-8, -8], [-6, -12], [10, -18], [18, -8], [8, 0], [18, 0], [22, 0], [5, 0], [9, 0], [0, 0]],
      l4: [[-6, -6], [-6, -6], [-4, -10], [16, -12], [8, -16], [8, 0], [17, 0], [21, 0], [5, 0], [8, 0], [0, 0]],
    }));

    // Light (an uncharged swing): the same kind of jolt, smaller, and a quick recovery.
    ANIMS.hit_light = Object.assign({
      setup: 'front', len: 22, land: 10,
      root: {
        pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -1.8, 0]], [13, [0, 0.1, 0]], [15, [0, 0, 0]]],
        rot: [[0, [0, 6, 0], 'L'], [1, [0, 6, 0], 'L'], [4, [0, 10, 0]], [7, [0, 12, 0]], [10, [0, 10, 0]], [12, [0, 8, 0]], [14, [0, 2, 0]], [16, [0, -1, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.02, 0.97, 1.02], 'L'], [1, [1.02, 0.97, 1.02], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [8, 0, 3], 'L'], [1, [8, 0, 3], 'L'], [3, [12, 0, 1]], [6, [8, 0, 0]], [9, [2, 0, 0]], [10, [-4, 0, 0], 'L'], [11, [-6, 0, 0]], [13, [1, 0, 0]], [15, [0, 0, 0]]] },
      abdomen: { rot: [[0, [-4, 0, 0], 'L'], [1, [-4, 0, 0], 'L'], [3, [-8, 0, 0]], [6, [2, 0, 0]], [10, [-6, 0, 0], 'L'], [11, [-9, 0, 0]], [13, [3, 0, 0]], [15, [0, 0, 0]]] },
      head: {
        rot: [[0, [14, 16, 8], 'L'], [1, [14, 16, 8], 'L'], [2, [22, 20, 10]], [4, [12, 10, 4]], [6, [6, -4, 2]], [8, [2, -10, 0]], [10, [-6, -6, 0], 'L'], [11, [-12, -4, 0]],
          [12, [2, -4, 0]], [13, [0, 8, 2]], [14, [0, -10, -1]], [15, [0, -2, 0]], [17, [0, 0, 0]]],
      },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
      face: [[0, 1], [3, 3], [10, 1], [15, 0]],
    }, legs([0, 1, 3, 6, 8, 10, 11, 13, 15], [0, 1, 10], {
      r1: [[26, 8], [26, 8], [30, 14], [8, 10], [4, 2], [10, 0], [14, 0], [2, 0], [0, 0]],
      l1: [[18, 4], [18, 4], [24, 0], [14, -4], [4, 2], [9, 0], [13, 0], [2, 0], [0, 0]],
      r2: [[12, 3], [12, 3], [16, 8], [14, -4], [4, 2], [7, 0], [9, 0], [1, 0], [0, 0]],
      l2: [[8, 2], [8, 2], [10, -4], [16, 6], [4, 0], [6, 0], [9, 0], [1, 0], [0, 0]],
      r3: [[-3, -3], [-3, -3], [8, -8], [6, 4], [4, 0], [7, 0], [9, 0], [1, 0], [0, 0]],
      l3: [[-2, -2], [-2, -2], [4, 6], [12, -6], [4, 0], [6, 0], [9, 0], [1, 0], [0, 0]],
      r4: [[-6, -6], [-6, -6], [8, -12], [14, -4], [6, 0], [10, 0], [13, 0], [2, 0], [0, 0]],
      l4: [[-4, -4], [-4, -4], [12, -8], [6, -12], [6, 0], [9, 0], [12, 0], [2, 0], [0, 0]],
    }));

    // Side (hit on its right; the mod mirrors it for the left): shoved and spun away, it rolls onto its left legs with the
    // right legs flung up, the abdomen swinging wide; it keeps spinning in the air while the head turns back, lands with a
    // rebound roll onto the near legs, settles twice and turns back to face the attacker, head first, before a shake.
    ANIMS.hit_side = Object.assign({
      setup: 'side_r', len: 26, land: 10,
      root: {
        pos: [[0, [0, -0.5, 0], 'L'], [1, [0, -0.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -2, 0], 'L'], [11, [0, -2.8, 0]], [13, [0, -0.8, 0]], [15, [0, -1.3, 0]],
          [18, [0, 0, 0]]],
        rot: [[0, [0, 22, 0], 'L'], [1, [0, 22, 0], 'L'], [3, [0, 44, 0]], [5, [0, 56, 0]], [7, [0, 56, 0]], [9, [0, 46, 0]], [10, [0, 42, 0]], [13, [0, 34, 0]], [15, [0, 20, 0]],
          [17, [0, 4, 0]], [19, [0, -4, 0]], [21, [0, 0, 0]]],
        scale: [[0, [0.97, 0.97, 1.02], 'L'], [1, [0.97, 0.97, 1.02], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [2, 0, 16], 'L'], [1, [2, 0, 16], 'L'], [3, [0, 0, 22]], [5, [0, 0, 16]], [7, [0, 0, 6]], [9, [0, 0, 0]], [10, [0, 0, -8], 'L'], [11, [0, 0, -11]],
        [13, [0, 0, 3]], [15, [0, 0, -3]], [17, [0, 0, 0]]] },
      abdomen: { rot: [[0, [0, -10, 0], 'L'], [1, [0, -10, 0], 'L'], [3, [0, -16, 0]], [5, [0, -6, 0]], [7, [0, 4, 0]], [9, [0, 2, 0]], [10, [-6, 0, 0], 'L'], [11, [-9, 0, 0]],
        [13, [3, 4, 0]], [15, [-2, -2, 0]], [18, [0, 0, 0]]] },
      head: {
        rot: [[0, [6, 26, 16], 'L'], [1, [6, 26, 16], 'L'], [2, [10, 32, 20]], [4, [6, 18, 10]], [6, [2, -4, 4]], [8, [0, -18, 0]], [10, [-8, -12, -4], 'L'], [11, [-14, -8, -6]],
          [13, [-6, -4, 0]], [15, [-8, -20, 0]], [17, [0, -8, 0]], [19, [0, 16, 0]], [20, [0, -12, 0]], [21, [0, 8, 0]], [22, [0, -3, 0]], [24, [0, 0, 0]]],
      },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    }, legs([0, 1, 2, 5, 8, 10, 11, 13, 16], [0, 1, 10], {
      r1: [[34, 6], [34, 6], [44, 10], [28, 4], [8, 0], [18, 0], [22, 0], [4, 0], [0, 0]],
      r2: [[30, 0], [30, 0], [40, 2], [24, -4], [6, 0], [16, 0], [20, 0], [3, 0], [0, 0]],
      r3: [[30, 0], [30, 0], [40, -2], [22, 4], [6, 0], [16, 0], [20, 0], [3, 0], [0, 0]],
      r4: [[32, -6], [32, -6], [42, -10], [26, -4], [8, 0], [18, 0], [22, 0], [4, 0], [0, 0]],
      l1: [[12, 4], [12, 4], [4, 8], [-10, 10], [4, 2], [8, 0], [10, 0], [2, 0], [0, 0]],
      l2: [[14, 0], [14, 0], [6, 4], [-12, -4], [2, 0], [6, 0], [8, 0], [1, 0], [0, 0]],
      l3: [[14, 0], [14, 0], [6, -4], [-12, 4], [2, 0], [6, 0], [8, 0], [1, 0], [0, 0]],
      l4: [[12, -4], [12, -4], [4, -8], [-10, -10], [4, -2], [8, 0], [10, 0], [2, 0], [0, 0]],
    }));

    // Back: the blow from behind kicks the abdomen up and flings the hind legs back, the front legs brace and the nose
    // dips; the abdomen comes down in the air, it lands front first, the hind legs stamp, it settles and looks round,
    // surprised.
    ANIMS.hit_back = Object.assign({
      setup: 'back', len: 26, land: 10,
      root: {
        pos: [[0, [0, -0.5, 0], 'L'], [1, [0, -0.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -2, 0], 'L'], [11, [0, -2.8, 0]], [13, [0, -0.6, 0]], [15, [0, -1.1, 0]],
          [18, [0, 0, 0]]],
        rot: [[0, [0, -4, 0], 'L'], [1, [0, -4, 0], 'L'], [5, [0, -6, 0]], [10, [0, -2, 0]], [14, [0, 6, 0]], [17, [0, 0, 0]]],
        scale: [[0, [1.02, 0.97, 1.03], 'L'], [1, [1.02, 0.97, 1.03], 'L'], [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [-10, 0, 3], 'L'], [1, [-10, 0, 3], 'L'], [3, [-14, 0, 2]], [5, [-10, 0, 0]], [7, [-6, 0, 0]], [9, [-2, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-3, 0, 0]],
        [12, [4, 0, 0]], [14, [-1, 0, 0]], [16, [1, 0, 0]], [18, [0, 0, 0]]] },
      abdomen: { rot: [[0, [-24, 0, 0], 'L'], [1, [-24, 0, 0], 'L'], [2, [-30, 0, 0]], [4, [-18, 0, 0]], [6, [-6, 0, 0]], [8, [2, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-2, 0, 0]],
        [12, [6, 0, 0]], [14, [-2, 0, 0]], [16, [1, 0, 0]], [18, [0, 0, 0]]] },
      head: {
        rot: [[0, [-12, -6, 6], 'L'], [1, [-12, -6, 6], 'L'], [2, [-16, -8, 8]], [4, [-6, -4, 4]], [6, [4, 0, 0]], [8, [6, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-10, 0, 0]],
          [13, [-4, 10, 0]], [15, [4, 26, 4]], [17, [6, 30, 4]], [19, [2, 12, 0]], [21, [0, 0, 0]]],
      },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [16, 0.8], [19, 1]],
      face: [[0, 1], [14, 3], [21, 0]],
    }, legs([0, 1, 2, 4, 6, 8, 10, 11, 12, 14, 16], [0, 1, 10], {
      r4: [[30, -24], [30, -24], [38, -30], [26, -20], [8, -8], [2, -2], [10, 0], [18, 0], [6, 0], [0, 0], [0, 0]],
      l4: [[26, -20], [26, -20], [34, -26], [30, -22], [12, -10], [4, -2], [10, 0], [16, 0], [5, 0], [0, 0], [0, 0]],
      r3: [[18, -14], [18, -14], [24, -18], [14, -10], [4, -4], [2, 0], [8, 0], [14, 0], [4, 0], [0, 0], [0, 0]],
      l3: [[14, -12], [14, -12], [20, -16], [16, -12], [6, -6], [2, 0], [8, 0], [13, 0], [4, 0], [0, 0], [0, 0]],
      r1: [[-4, 10], [-4, 10], [-2, 12], [8, 6], [4, 0], [2, 0], [16, 4], [12, 2], [4, 0], [0, 0], [0, 0]],
      l1: [[-4, 8], [-4, 8], [-2, 10], [6, 4], [4, 0], [2, 0], [15, 4], [11, 2], [4, 0], [0, 0], [0, 0]],
      r2: [[2, 4], [2, 4], [4, 6], [6, 2], [2, 0], [2, 0], [12, 2], [10, 0], [3, 0], [0, 0], [0, 0]],
      l2: [[2, 4], [2, 4], [4, 5], [5, 2], [2, 0], [2, 0], [11, 2], [9, 0], [3, 0], [0, 0], [0, 0]],
    }));

    // Big (crits and sprint hits): the blow from above flattens it onto its belly, every leg splayed flat like a table
    // giving way; it bounces up with the legs dangling, lands splayed again, wobbles dizzy, gathers its legs and shakes its head.
    const BIG_T = [0, 1, 3, 5, 7, 9, 10, 11, 13, 16, 19, 22, 25, 28];
    const big = (lift, swing, k) => [[lift, swing], [lift, swing], [-12 - k, swing], [-18 + k, 0], [-6, swing / 2], [-4 - k, 0], [lift - 6, swing / 2], [lift, swing / 2],
      [lift * 0.4, 0], [lift * 0.55, 0], [lift * 0.3, 0], [lift * 0.4, 0], [lift * 0.2, 0], [0, 0]];
    ANIMS.hit_big = Object.assign({
      setup: 'front', len: 32, land: 10,
      root: {
        pos: [[0, [0, -3.5, 0], 'L'], [1, [0, -3.5, 0], 'L'], [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -3.5, 0], 'L'], [11, [0, -4, 0]], [13, [0, -1.5, 0]], [16, [0, -2, 0]],
          [20, [0, -1, 0]], [26, [0, -0.5, 0]], [29, [0, 0, 0]]],
        rot: [[0, [0, 4, 0], 'L'], [1, [0, 4, 0], 'L'], [6, [0, -4, 0]], [10, [0, 0, 0]]],
        scale: [[0, [1.06, 0.92, 1.06], 'L'], [1, [1.06, 0.92, 1.06], 'L'], [3, [0.98, 1.03, 0.98]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.05, 0.94, 1.05], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: { rot: [[0, [-3, 0, 3], 'L'], [1, [-3, 0, 3], 'L'], [3, [6, 0, 0]], [7, [3, 0, -2]], [10, [0, 0, 0], 'L'], [13, [0, 0, 7]], [17, [0, 0, -7]], [21, [0, 0, 5]],
        [25, [0, 0, -2]], [28, [0, 0, 0]]] },
      abdomen: { rot: [[0, [-4, 0, 0], 'L'], [1, [-4, 0, 0], 'L'], [3, [-10, 0, 0]], [5, [-2, 0, 0]], [7, [4, 0, 0]], [9, [0, 0, 0]], [10, [-4, 0, 0], 'L'], [11, [-6, 0, 0]],
        [13, [2, 0, 0]], [16, [0, 0, 6]], [19, [0, 0, -6]], [22, [0, 0, 4]], [25, [0, 0, -2]], [28, [0, 0, 0]]] },
      head: {
        rot: [[0, [-8, 8, 8], 'L'], [1, [-8, 8, 8], 'L'], [2, [-4, 4, 4]], [3, [16, 0, 0]], [5, [6, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [-8, 0, 0], 'L'],
          [11, [-10, 0, 0]], [12, [6, 0, 10]], [14, [10, -8, -12]], [16, [2, 6, 14]], [18, [-6, -4, -10]], [20, [8, 6, 10]], [22, [-4, -3, -6]], [24, [4, 2, 4]],
          [26, [0, 0, 0]], [28, [0, 20, 0]], [29, [0, -16, 0]], [30, [0, 8, 0]], [31, [0, 0, 0]]],
      },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [26, 0.3], [29, 1]],
      face: [[0, 1], [10, 2], [27, 1], [30, 0]],
    }, legs(BIG_T, [0, 1, 10], {
      r1: big(30, 6, 2), l1: big(28, 6, 0), r2: big(22, 2, 1), l2: big(22, 2, 3),
      r3: big(22, -2, 3), l3: big(21, -2, 1), r4: big(30, -6, 0), l4: big(29, -6, 2),
    }));

    // Deaths. Vanilla's legs are single bars without a knee, so a leg "curls" by folding in over the belly while it shortens
    // along its length (scale x, about the hip), pair by pair from the front, with a spasm before and an overshoot after.
    const merge = (...parts) => {
      const o = {};
      for (const p of parts) for (const [bone, chans] of Object.entries(p)) o[bone] = Object.assign(o[bone] || {}, chans);
      return o;
    };
    const PAIRS = { r1: 0, l1: 0, r2: 1, l2: 1, r3: 2, l3: 2, r4: 3, l4: 3 };
    // curled: past vertical over the belly (in the body's frame, so up in the air once it lies on its back), swung toward
    // the middle, 0.6 long
    const CURL = { r1: [-72, -10], r2: [-76, -4], r3: [-76, 4], r4: [-72, 10], l1: [-70, -8], l2: [-75, -3], l3: [-75, 3], l4: [-71, 8] };
    // curl keys for one leg from tick t (staggered one tick per pair): a stiff spasm out, the fold, an overshoot, the settle
    function curl(n, t, twitch) {
      const [l, s] = CURL[n], d = PAIRS[n], a = t + d;
      const rot = [[a, [16, 0, 0]], [a + 2, [l * 0.5, s * 0.5, 0]], [a + 4, [l - 8, s, 0]], [a + 6, [l, s, 0]]];
      const scale = [[a, [1, 1, 1]], [a + 2, [0.8, 1, 1]], [a + 4, [0.6, 1, 1]], [a + 6, [0.66, 1, 1]]];
      if (twitch) {
        rot.push([twitch, [l, s, 0]], [twitch + 1, [l + 22, s, 0]], [twitch + 3, [l, s, 0]]);
        scale.push([twitch, [0.6, 1, 1]], [twitch + 1, [0.78, 1, 1]], [twitch + 3, [0.6, 1, 1]]);
      }
      return { rot, scale };
    }
    // Front: the rear-up keeps going into a backflip in the air (pelvis x to 180 about the body's middle); it lands on its
    // back, head away from the attacker, bounces once, the legs stretch out stiff, then curl up over the belly one pair after
    // another; a last twitch of a hind leg.
    const front = { setup: 'front_dead', len: 38, lie: null, down: 10, rest: 0.6,
      root: {
        rot: [[5, [0, 12, 0]], [8, [0, 14, 0]], [10, [0, 14, 0]]],
        scale: [[9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
      },
      pelvis: {
        rot: [[5, [58, 0, 4]], [7, [112, 0, 2]], [9, [164, 0, 0]], [10, [180, 0, 0], 'L'], [12, [184, 0, 0]], [14, [180, 0, 0]]],
        pos: [[3, [0, 0, 0]], [7, [0, 1, 0]], [9, [0, -3, 0]], [10, [0, -5, 0], 'L'], [12, [0, -3.6, 0]], [14, [0, -5, 0]], [16, [0, -4.6, 0]], [18, [0, -5, 0]]],
      },
      abdomen: { rot: [[6, [-10, 0, 0]], [9, [6, 0, 0]], [10, [0, 0, 0], 'L'], [12, [4, 0, 0]], [14, [0, 0, 0]]] },
      head: { rot: [[5, [10, -6, 0]], [8, [-10, 10, 0]], [10, [0, 0, 0], 'L'], [12, [14, -8, 6]], [14, [4, 10, -4]], [16, [8, 16, -8]], [20, [6, 20, -10]], [28, [6, 22, -10]]] },
      face: [[0, 1], [3, 3], [10, 2]],
    };
    const flail = { r1: [20, 20], r2: [30, 0], r3: [24, -6], r4: [14, -20], l1: [26, 14], l2: [16, 8], l3: [30, -8], l4: [20, -16] };
    for (const n of Object.keys(CURL)) {
      const c = curl(n, 14, n === 'r4' ? 28 : 0);
      front['leg_' + n] = { rot: [[5, [...flail[n], 0]], [8, [flail[n][0] * 0.3, flail[n][1] * 0.5, 0]], [10, [6, 0, 0], 'L'], [12, [12, 0, 0]]].concat(c.rot), scale: c.scale };
    }
    // Big: flattened on landing and it stays down, belly on the ground, legs splayed flat like a rug, a last spasm of the
    // legs, x x eyes.
    const DEATHS = {
      death_front: ['hit_front', 3, front],
      death_big: ['hit_big', 3, Object.assign({
        setup: 'front_dead', len: 34, lie: null, down: 10, rest: 0.35,
        root: { pos: [[5, [0, 0, 0]], [9, [0, -1, 0]], [10, [0, -5, 0], 'L'], [12, [0, -4.2, 0]], [14, [0, -5, 0]], [16, [0, -4.8, 0]], [18, [0, -5, 0]]] },
        pelvis: { rot: [[5, [4, 0, 0]], [8, [0, 0, -2]], [10, [0, 0, 0], 'L'], [12, [0, 0, 3]], [14, [0, 0, -1]], [16, [0, 0, 0]]] },
        abdomen: { rot: [[5, [-6, 0, 0]], [8, [2, 0, 0]], [10, [0, 0, 0], 'L'], [12, [-5, 0, 0]], [14, [0, 0, 0]]] },
        head: { rot: [[5, [6, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [2, 0, 0], 'L'], [12, [6, 8, 8]], [14, [2, 14, 10]], [18, [2, 16, 12]]] },
        face: [[0, 1], [10, 2]],
      }, legs([5, 8, 10, 12, 14, 18, 20, 21, 22, 23, 25], [10], {
        r1: [[-16, 2], [-6, 4], [44, 8], [36, 8], [44, 8], [42, 8], [42, 8], [30, 14], [42, 8], [42, 8], [42, 8]],
        l1: [[-18, 2], [-8, 4], [42, 8], [34, 8], [42, 8], [40, 8], [40, 8], [40, 8], [40, 8], [28, 2], [40, 8]],
        r2: [[-18, 0], [-6, 0], [36, 2], [28, 2], [36, 2], [34, 2], [34, 2], [34, 2], [24, 8], [34, 2], [34, 2]],
        l2: [[-16, 0], [-8, 0], [36, 2], [28, 2], [36, 2], [34, 2], [34, 2], [34, 2], [34, 2], [34, 2], [34, 2]],
        r3: [[-16, 0], [-6, 0], [36, -2], [28, -2], [36, -2], [34, -2], [34, -2], [34, -2], [34, -2], [34, -2], [34, -2]],
        l3: [[-18, 0], [-8, 0], [36, -2], [28, -2], [36, -2], [34, -2], [22, -8], [34, -2], [34, -2], [34, -2], [34, -2]],
        r4: [[-16, -2], [-6, -4], [44, -8], [36, -8], [44, -8], [42, -8], [42, -8], [42, -8], [42, -8], [30, -14], [42, -8]],
        l4: [[-18, -2], [-8, -4], [42, -8], [34, -8], [42, -8], [40, -8], [40, -8], [40, -8], [40, -8], [40, -8], [40, -8]],
      }))],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    // No hit: it never turns over on the ground (the user: only a spider in the air lands on its back). The legs give way
    // and it sinks onto its belly with the legs splayed flat, sways and trembles, then draws its legs in tight along its
    // sides one pair after another, shortening them (curled up in a ball), head flopped to one side, x x eyes; a last twitch.
    const TUCK = { r1: [30, -34], r2: [22, -14], r3: [22, 14], r4: [30, 34], l1: [30, -32], l2: [22, -13], l3: [22, 13], l4: [30, 32] };
    const collapse = {
      setup: 'still', len: 40, land: -1, lie: null, down: 6, rest: 0.4,
      root: { pos: [[0, [0, 0, 0]], [3, [0, -2, 0]], [6, [0, -5, 0], 'L'], [8, [0, -4.4, 0]], [10, [0, -5, 0]]] },
      pelvis: { rot: [[0, [0, 0, 0]], [6, [0, 0, 0], 'L'], [9, [0, 0, 3]], [12, [0, 0, -3]], [15, [0, 0, 2]], [18, [0, 0, 0]]] },
      abdomen: { rot: [[0, [0, 0, 0]], [3, [-4, 0, 0]], [6, [-2, 0, 0], 'L'], [9, [-2, 0, 4]], [12, [-2, 0, -4]], [15, [-2, 0, 2]], [18, [-2, 0, 0]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [4, 0, -4]], [6, [-4, 0, 4], 'L'], [9, [-2, 6, -6]], [12, [-4, -4, 8]], [15, [-2, 0, 4]], [20, [-4, 8, 16]], [24, [-4, 10, 18]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [4, 2]],
    };
    for (const [n, [l, s]] of Object.entries(TUCK)) {
      // flat: the tips on the ground with the belly down (the middle pair rests 12° flatter than the others)
      const f = PAIRS[n] === 1 || PAIRS[n] === 2 ? 22 : 30;
      const a = 18 + PAIRS[n], tr = n.charCodeAt(1) % 2 ? 3 : -3, rot = [[0, [0, 0, 0]], [3, [f * 0.4, 0, 0]], [6, [f, 0, 0], 'L'], [8, [f - 6, 0, 0]], [10, [f, 0, 0]],
        [12, [f + tr, 0, 0]], [14, [f - tr, 0, 0]], [16, [f, 0, 0]], [a, [f + 4, 0, 0]], [a + 2, [l + 6, s * 0.6, 0]], [a + 4, [l - 2, s + (s > 0 ? 4 : -4), 0]], [a + 6, [l, s, 0]]];
      const scale = [[a, [1, 1, 1]], [a + 2, [0.8, 1, 1]], [a + 4, [0.52, 1, 1]], [a + 6, [0.58, 1, 1]]];
      if (n === 'l2') {
        rot.push([31, [l, s, 0]], [32, [l + 10, s, 0]], [34, [l, s, 0]]);
        scale.push([31, [0.58, 1, 1]], [32, [0.74, 1, 1]], [34, [0.58, 1, 1]]);
      }
      collapse['leg_' + n] = { rot, scale };
    }
    ANIMS.death_collapse = collapse;
    return { ANIMS, DEATHS };
  }

  // ---------- the creeper reactions ----------
  // Same house style and timing (impact held from tick 0 to 1, flight synced to the real hop, landing on tick 10). The
  // creeper is a stiff column on four short legs, so it rocks like a knocked bottle: the whole body tips on the edge of its
  // feet (stand() keeps that edge on the ground), the torso bends at the hips, the head whips on its neck, and the legs splay
  // to lower it (6 px legs: a 1 px dip is about 30° of splay, 2 px about 50°).
  function creeperAnims() {
    const r2 = v => Math.round(v * 100) / 100, D = Math.PI / 180;
    // root keys from [t, rx, ry, rz, dy, flag]: rx/rz tip the body about the edge of its feet on the side it tips to (heel
    // z +6 / toe z -6, left x -4 / right x +4), so that edge stays put; dy lowers it
    function stand(rows) {
      const rot = [], pos = [];
      for (const [t, rx, ry, rz, dy, f] of rows) {
        const zp = rx > 0 ? 6 : -6, xp = rz > 0 ? -4 : 4, a = rx * D, b = rz * D;
        const k = [r2(xp * (1 - Math.cos(b))), r2(zp * Math.sin(a) - xp * Math.sin(b) + dy), r2(zp * (1 - Math.cos(a)))];
        rot.push(f ? [t, [rx, ry, rz], f] : [t, [rx, ry, rz]]);
        pos.push(f ? [t, k, f] : [t, k]);
      }
      return { rot, pos };
    }
    const L0 = (v) => [[0, v, 'L'], [1, v, 'L']];
    const ANIMS = {};

    // Front (heavy): the slash from its right snaps the stiff body back from the hips, the head whips a tick later and the
    // front feet skid forward; in the air it straightens while the head comes back round; it lands tipping onto its toes and
    // rocks back and forth on its stiff feet like a knocked bottle, the head wobbling a beat behind, then shakes its head.
    ANIMS.hit_front = {
      setup: 'front', len: 26, land: 10,
      root: Object.assign(stand([[0, 6, 8, 0, -0.4, 'L'], [1, 6, 8, 0, -0.4, 'L'], [3, 4, 10, 0, 0], [6, 0, 14, 0, 0], [9, 0, 10, 0, 0], [10, -8, 8, 0, -0.8, 'L'],
        [11, -6, 7, 0, -1.2], [13, 6, 5, 0, -0.3], [15, -4, 3, 0, -0.6], [17, 2, 1, 0, 0], [19, 0, 0, 0, 0]]), {
        scale: [...L0([1.03, 0.96, 1.03]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.97, 1.03], 'L'], [12, [1, 1, 1]]],
      }),
      torso: { rot: [...L0([20, 8, 5]), [3, [14, 5, 2]], [5, [10, 2, 0]], [7, [4, 0, 0]], [9, [0, 0, 0]], [10, [-10, 0, 0], 'L'], [11, [-16, 0, 0]], [13, [6, 0, 0]],
        [15, [-5, 0, 0]], [17, [2, 0, 0]], [19, [0, 0, 0]]] },
      head: { rot: [...L0([16, 16, 8]), [2, [26, 20, 10]], [4, [14, 10, 4]], [6, [6, -4, 2]], [8, [2, -12, 0]], [9, [0, -12, 0]], [10, [-6, -6, 0], 'L'], [11, [-18, -4, 0]],
        [13, [10, 0, 0]], [15, [-8, 0, 0]], [17, [4, 0, 0]], [19, [0, 18, 0]], [20, [0, -14, 0]], [21, [0, 10, 0]], [22, [0, -4, 0]], [24, [0, 0, 0]]] },
      leg_fr: { rot: [...L0([16, 0, 4]), [2, [24, 0, 6]], [5, [-10, 0, 8]], [8, [8, 0, 4]], [10, [4, 0, 24], 'L'], [11, [6, 0, 30]], [13, [0, 0, 12]], [15, [0, 0, 18]], [17, [0, 0, 0]]] },
      leg_fl: { rot: [...L0([10, 0, 3]), [2, [18, 0, 4]], [5, [14, 0, 6]], [8, [-6, 0, 4]], [10, [2, 0, 24], 'L'], [11, [4, 0, 30]], [13, [0, 0, 12]], [15, [0, 0, 18]], [17, [0, 0, 0]]] },
      leg_hr: { rot: [...L0([-6, 0, 3]), [3, [-14, 0, 4]], [6, [10, 0, 6]], [8, [-4, 0, 4]], [10, [-2, 0, 24], 'L'], [11, [-4, 0, 30]], [13, [0, 0, 12]], [15, [0, 0, 18]], [17, [0, 0, 0]]] },
      leg_hl: { rot: [...L0([-4, 0, 3]), [3, [6, 0, 4]], [6, [-14, 0, 6]], [8, [4, 0, 4]], [10, [-2, 0, 24], 'L'], [11, [-4, 0, 30]], [13, [0, 0, 12]], [15, [0, 0, 18]], [17, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    };

    // Light (an uncharged swing): the same jolt, smaller, a single rock on landing and a quick recovery.
    ANIMS.hit_light = {
      setup: 'front', len: 22, land: 10,
      root: Object.assign(stand([[0, 4, 6, 0, 0, 'L'], [1, 4, 6, 0, 0, 'L'], [4, 2, 10, 0, 0], [7, 0, 12, 0, 0], [10, -6, 10, 0, -0.5, 'L'], [12, 4, 6, 0, -0.2], [14, -2, 2, 0, 0],
        [16, 0, -1, 0, 0], [17, 0, 0, 0, 0]]), {
        scale: [...L0([1.02, 0.97, 1.02]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
      }),
      torso: { rot: [...L0([14, 6, 4]), [3, [10, 4, 2]], [6, [6, 1, 0]], [9, [1, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-10, 0, 0]], [13, [4, 0, 0]], [15, [-1, 0, 0]], [17, [0, 0, 0]]] },
      head: { rot: [...L0([12, 14, 6]), [2, [20, 18, 8]], [4, [10, 8, 4]], [6, [4, -4, 2]], [8, [2, -10, 0]], [10, [-6, -6, 0], 'L'], [11, [-12, -4, 0]], [12, [6, -4, 0]],
        [13, [0, 8, 2]], [14, [0, -10, -1]], [15, [0, -2, 0]], [17, [0, 0, 0]]] },
      leg_fr: { rot: [...L0([10, 0, 3]), [3, [14, 0, 4]], [6, [-4, 0, 4]], [9, [2, 0, 2]], [10, [2, 0, 18], 'L'], [11, [2, 0, 22]], [13, [0, 0, 4]], [15, [0, 0, 0]]] },
      leg_fl: { rot: [...L0([6, 0, 2]), [3, [10, 0, 3]], [6, [4, 0, 3]], [9, [-2, 0, 2]], [10, [2, 0, 18], 'L'], [11, [2, 0, 22]], [13, [0, 0, 4]], [15, [0, 0, 0]]] },
      leg_hr: { rot: [...L0([-4, 0, 2]), [3, [-8, 0, 3]], [6, [6, 0, 3]], [9, [-2, 0, 2]], [10, [-2, 0, 18], 'L'], [11, [-2, 0, 22]], [13, [0, 0, 4]], [15, [0, 0, 0]]] },
      leg_hl: { rot: [...L0([-3, 0, 2]), [3, [4, 0, 3]], [6, [-8, 0, 3]], [9, [2, 0, 2]], [10, [-2, 0, 18], 'L'], [11, [-2, 0, 22]], [13, [0, 0, 4]], [15, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
      face: [[0, 1], [3, 3], [10, 1], [15, 0]],
    };

    // Side (hit on its right; the mod mirrors it for the left): the body bends away from the blow at the hips and spins,
    // the near legs splay out, the head whips round; it lands tipping onto its near feet and rocks side to side, turns back to
    // face the attacker, head first, and shakes its head.
    ANIMS.hit_side = {
      setup: 'side_r', len: 26, land: 10,
      root: Object.assign(stand([[0, 0, 22, 6, -0.4, 'L'], [1, 0, 22, 6, -0.4, 'L'], [3, 0, 44, 4, 0], [5, 0, 56, 2, 0], [7, 0, 56, 0, 0], [9, 0, 46, 0, 0],
        [10, 0, 42, -8, -0.8, 'L'], [11, 0, 40, -6, -1.2], [13, 0, 34, 6, -0.3], [15, 0, 20, -4, -0.6], [17, 0, 4, 2, 0], [19, 0, -4, 0, 0], [21, 0, 0, 0, 0]]), {
        scale: [...L0([0.97, 0.97, 1.02]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.97, 1.03], 'L'], [12, [1, 1, 1]]],
      }),
      torso: { rot: [...L0([0, 16, 16]), [3, [4, 20, 18]], [5, [4, 10, 10]], [7, [2, 4, 4]], [9, [0, 0, 0]], [10, [-6, 0, -10], 'L'], [11, [-10, 0, -14]], [13, [0, 0, 6]],
        [15, [-3, 0, -4]], [17, [0, 0, 1]], [19, [0, 0, 0]]] },
      head: { rot: [...L0([6, 36, 20]), [2, [8, 48, 24]], [4, [4, 30, 12]], [6, [2, 8, 4]], [8, [0, -14, 0]], [9, [0, -18, -2]], [10, [-6, -18, -8], 'L'], [11, [-12, -16, -12]],
        [13, [-4, -16, 4]], [15, [-6, -8, -4]], [17, [0, 0, 2]], [19, [0, 14, 0]], [20, [0, -12, 0]], [21, [0, 6, 0]], [22, [0, -2, 0]], [24, [0, 0, 0]]] },
      leg_fr: { rot: [...L0([6, 0, 28]), [2, [10, 0, 36]], [5, [16, 0, 22]], [8, [4, 0, 8]], [10, [0, 0, 28], 'L'], [11, [2, 0, 30]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_hr: { rot: [...L0([-6, 0, 26]), [2, [-10, 0, 34]], [5, [-14, 0, 20]], [8, [-4, 0, 6]], [10, [0, 0, 26], 'L'], [11, [-2, 0, 28]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_fl: { rot: [...L0([4, 0, -6]), [3, [14, 0, -2]], [6, [20, 0, 4]], [9, [4, 0, 4]], [10, [-2, 0, 10], 'L'], [11, [0, 0, 14]], [13, [0, 0, 2]], [16, [0, 0, 0]]] },
      leg_hl: { rot: [...L0([-2, 0, -6]), [3, [-10, 0, -2]], [6, [-18, 0, 4]], [9, [-4, 0, 4]], [10, [2, 0, 10], 'L'], [11, [0, 0, 14]], [13, [0, 0, 2]], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
      face: [[0, 1], [3, 3], [10, 1], [22, 0]],
    };

    // Back: whiplash. The blow from behind shoves the hips forward, the body and head snap back and the hind legs kick up;
    // it pitches forward in the air, lands tipping onto its toes, rocks, and looks back over its shoulder, surprised.
    ANIMS.hit_back = {
      setup: 'back', len: 26, land: 10,
      root: Object.assign(stand([[0, -4, -4, 0, -0.3, 'L'], [1, -4, -4, 0, -0.3, 'L'], [5, -2, -6, 0, 0], [9, 0, -4, 0, 0], [10, -10, -2, 0, -0.8, 'L'], [11, -8, 0, 0, -1.2],
        [13, 5, 2, 0, -0.3], [15, -3, 4, 0, -0.5], [17, 1, 2, 0, 0], [19, 0, 0, 0, 0]]), {
        scale: [...L0([1.02, 0.97, 1.02]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.97, 1.03], 'L'], [12, [1, 1, 1]]],
      }),
      torso: { rot: [...L0([18, 0, -4]), [3, [24, 0, -4]], [5, [10, 0, -2]], [7, [-4, 0, 0]], [9, [-8, 0, 0]], [10, [-16, 0, 0], 'L'], [11, [-20, 0, 0]], [13, [4, 0, 0]],
        [15, [-6, 0, 0]], [17, [2, 0, 0]], [19, [0, 0, 0]]] },
      head: { rot: [...L0([28, -6, -4]), [2, [36, -8, -6]], [4, [16, -4, 0]], [6, [-6, 0, 0]], [8, [-12, 0, 0]], [10, [-16, 0, 0], 'L'], [11, [-22, 0, 0]], [12, [-8, 0, 0]],
        [14, [-2, 30, 0]], [16, [2, 60, 0]], [18, [0, 64, 0]], [20, [0, 40, 0]], [22, [0, 6, 0]], [24, [0, 0, 0]]] },
      leg_hr: { rot: [...L0([-24, 0, 4]), [3, [-30, 0, 4]], [5, [6, 0, 4]], [7, [-10, 0, 2]], [9, [8, 0, 2]], [10, [4, 0, 20], 'L'], [11, [6, 0, 24]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_hl: { rot: [...L0([-18, 0, 4]), [3, [-26, 0, 4]], [5, [-8, 0, 4]], [7, [8, 0, 2]], [9, [-6, 0, 2]], [10, [-2, 0, 20], 'L'], [11, [-4, 0, 24]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_fr: { rot: [...L0([-8, 0, 4]), [3, [-12, 0, 4]], [5, [10, 0, 4]], [7, [-6, 0, 2]], [9, [6, 0, 2]], [10, [-6, 0, 22], 'L'], [11, [-8, 0, 26]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      leg_fl: { rot: [...L0([-4, 0, 4]), [3, [-8, 0, 4]], [5, [-12, 0, 4]], [7, [8, 0, 2]], [9, [-4, 0, 2]], [10, [-4, 0, 22], 'L'], [11, [-6, 0, 26]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [16, 0.8], [19, 1]],
      face: [[0, 1], [14, 3], [21, 0]],
    };

    // Big (crits and sprint hits): the blow from above squashes it, legs splayed flat and chin driven onto its chest; it
    // pops up with the legs dangling, lands splayed again, wobbles dizzy on its hips, gathers its legs and shakes its head.
    const bigLeg = (x) => ({ rot: [...L0([x, 0, 55]), [3, [2.5 * x, 0, 8]], [5, [4 * x, 0, 2]], [7, [1.5 * x, 0, 8]], [9, [1.5 * x, 0, 6]], [10, [x / 2, 0, 50], 'L'], [11, [x / 2, 0, 56]],
      [13, [0, 0, 30]], [16, [0, 0, 38]], [20, [0, 0, 26]], [26, [0, 0, 18]], [29, [0, 0, 0]]] });
    ANIMS.hit_big = {
      setup: 'front', len: 32, land: 10,
      root: Object.assign(stand([[0, 0, 4, 0, -2.2, 'L'], [1, 0, 4, 0, -2.2, 'L'], [3, 0, 0, 0, 0], [6, 0, -4, 0, 0], [9, 0, 0, 0, 0], [10, 0, 0, 0, -2, 'L'], [11, 0, 0, 0, -2.4],
        [13, 0, 0, 0, -0.8], [16, 0, 0, 0, -1.2], [20, 0, 0, 0, -0.6], [26, 0, 0, 0, -0.3], [29, 0, 0, 0, 0]]), {
        scale: [...L0([1.06, 0.92, 1.06]), [3, [0.98, 1.03, 0.98]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.05, 0.94, 1.05], 'L'], [12, [1, 1, 1]]],
      }),
      torso: { rot: [...L0([-6, 0, 4]), [3, [6, 0, 0]], [7, [2, 0, -2]], [10, [-8, 0, 0], 'L'], [11, [-10, 0, 0]], [13, [0, 0, 8]], [16, [0, 0, -8]], [19, [0, 0, 7]], [22, [0, 0, -5]],
        [25, [0, 0, 3]], [28, [0, 0, 0]]] },
      head: { rot: [...L0([-16, 6, 6]), [2, [-6, 4, 4]], [3, [18, 0, 0]], [5, [8, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [-14, 0, 0], 'L'], [11, [-18, 0, 0]],
        [12, [6, 0, 10]], [14, [10, -8, -12]], [16, [2, 6, 14]], [18, [-6, -4, -10]], [20, [8, 6, 10]], [22, [-4, -3, -6]], [24, [4, 2, 4]], [26, [0, 0, 0]], [28, [0, 20, 0]],
        [29, [0, -16, 0]], [30, [0, 8, 0]], [31, [0, 0, 0]]] },
      leg_fr: bigLeg(4), leg_fl: bigLeg(3), leg_hr: bigLeg(-4), leg_hl: bigLeg(-3),
      walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [26, 0.3], [29, 1]],
      face: [[0, 1], [10, 2], [27, 1], [30, 0]],
    };

    // Deaths. The front twin keeps hit_front's impact (cut 3); two variants are under review (FLIPS, CH.flip(v)).
    // plank: it keeps tipping back stiff as a plank about its heels and slams flat on its back, feet swinging up; the head
    // (8 px deep against the body's 4) rests on the ground, the body 2 px above it.
    const slide = (r, dz) => { r.pos.forEach(k => { k[1][2] = r2(k[1][2] + (dz[k[0]] || 0)); }); return r; };
    // the feet stay planted and stiff while it tips over its heels; on the slam they kick up, flop back, bounce once and come
    // to rest raised a little (x staggers the pairs by a few degrees)
    const feetUp = (x) => [[5, [0, 0, 2]], [9, [2 + x / 2, 0, 3]], [10, [8 + x, 0, 4], 'L'], [11, [48 + x, 0, 6]], [13, [18 + x, 0, 6]], [15, [32 + x, 0, 6]], [17, [22 + x, 0, 6]],
      [19, [26 + x, 0, 6]]];
    const plank = {
      setup: 'front_dead', len: 36, lie: [0, 1], down: 10, rest: 0.5,
      // pivoting on the heels would lay it 1.6 blocks behind its feet: in the air it also slides 10 px forward, so it lands
      // about centred on the mob's position
      root: slide(stand([[4, 12, 12, 0, 0], [6, 30, 14, 0, 0], [8, 58, 14, 0, -0.4], [9, 76, 14, 0, -0.8], [10, 90, 14, 0, -1, 'L'], [11, 84, 14, 0, -0.8], [12, 90, 14, 0, -1],
        [14, 88, 14, 0, -1], [16, 90, 14, 0, -1]]), { 4: -1, 6: -3.5, 8: -7, 9: -9, 10: -10, 11: -10, 12: -10, 14: -10, 16: -10 }),
      torso: { rot: [[5, [4, 0, 0]], [8, [-4, 0, 0]], [10, [0, 0, 0], 'L'], [12, [-4, 0, 0]], [14, [0, 0, 0]]] },
      head: { rot: [[5, [10, 0, 0]], [8, [-6, 0, 0]], [10, [0, 0, 0], 'L'], [11, [-6, -10, 0]], [13, [0, 24, 0]], [16, [0, 30, 4]], [24, [0, 32, 4]]] },
      leg_fr: { rot: feetUp(4) }, leg_fl: { rot: feetUp(-2) },
      leg_hr: { rot: feetUp(0).concat([[24, [26, 0, 6]], [25, [40, 0, 6]], [27, [26, 0, 6]]]) }, leg_hl: { rot: feetUp(2) },
      face: [[0, 1], [3, 3], [10, 2]],
    };
    // air: knocked off its feet, it turns over backwards in the air about its hips and lands flat on its back
    const air = {
      setup: 'front_dead', len: 36, lie: [0, 1], down: 10, rest: 0.5,
      root: { rot: [[5, [0, 12, 0]], [8, [0, 14, 0]]] },
      pelvis: {
        rot: [[4, [18, 0, 2]], [6, [40, 0, 4]], [8, [66, 0, 2]], [9, [80, 0, 0]], [10, [90, 0, 0], 'L'], [12, [86, 0, 0]], [14, [90, 0, 0]]],
        pos: [[3, [0, 0, 0]], [7, [0, 1, 0]], [9, [0, -1, 0]], [10, [0, -2, 0], 'L'], [12, [0, -1.4, 0]], [14, [0, -2, 0]]],
      },
      torso: plank.torso, head: plank.head,
      leg_fr: { rot: [[5, [40, 0, 10]], [7, [20, 0, 20]], [9, [60, 0, 10]], [10, [90, 0, 8], 'L'], [12, [80, 0, 10]], [14, [92, 0, 8]], [16, [90, 0, 8]]] },
      leg_fl: { rot: [[5, [20, 0, 14]], [7, [44, 0, 6]], [9, [64, 0, 10]], [10, [90, 0, 8], 'L'], [12, [84, 0, 10]], [14, [90, 0, 8]]] },
      leg_hr: { rot: [[5, [-20, 0, 10]], [7, [10, 0, 16]], [9, [56, 0, 8]], [10, [88, 0, 8], 'L'], [12, [96, 0, 10]], [14, [86, 0, 8]], [16, [90, 0, 8]], [22, [90, 0, 8]],
        [23, [74, 0, 8]], [25, [90, 0, 8]]] },
      leg_hl: { rot: [[5, [-6, 0, 8]], [7, [-20, 0, 14]], [9, [50, 0, 8]], [10, [88, 0, 8], 'L'], [12, [94, 0, 10]], [14, [90, 0, 8]]] },
      face: plank.face,
    };
    const FLIPS = { plank: deathClip(ANIMS, 'hit_front', 3, plank), air: deathClip(ANIMS, 'hit_front', 3, air) };
    ANIMS.death_front = FLIPS.plank;
    // Big: the knees go on landing: the legs splay out flat, it drops onto its hips, folds forward over them and the head
    // lolls down to one side, x x. In its own footprint, so it's also the fallback without room.
    const crumple = (x) => ({ rot: [[5, [3 * x, 0, 8]], [8, [1.5 * x, 0, 20]], [10, [x, 0, 76], 'L'], [12, [x, 0, 70]], [14, [x, 0, 76]]] });
    const DEATHS = {
      death_big: ['hit_big', 3, {
        setup: 'front_dead', len: 36, lie: null, down: 18, rest: 0.5,
        root: stand([[5, 0, -4, 0, 0], [8, 0, 0, 0, -0.5], [10, 0, 0, 0, -4, 'L'], [11, 0, 0, 0, -4.6], [13, 0, 0, 0, -4.2], [15, 0, 0, 0, -4.6]]),
        // folded forward over the splayed legs until the face is about 2 px off the ground (-72°: the head, 8 px deep, then
        // hangs over the ground in front of it), then it rolls onto one cheek
        torso: { rot: [[5, [6, 0, 0]], [8, [0, 0, 0]], [10, [-6, 0, 0], 'L'], [12, [-14, 0, 4]], [14, [-30, 0, 2]], [16, [-52, 0, -2]], [17, [-66, 0, 0]], [18, [-74, 0, 0], 'L'],
          [20, [-70, 0, 2]], [22, [-72, 0, 0]]] },
        head: { rot: [[5, [8, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [-8, 0, 0], 'L'], [12, [4, 8, 10]], [14, [-10, -4, -8]], [16, [-6, 4, 6]], [18, [4, 0, 12], 'L'],
          [20, [6, 4, 18]], [23, [6, 6, 22]]] },
        leg_fr: crumple(4), leg_fl: crumple(3), leg_hr: crumple(-4), leg_hl: crumple(-3),
        face: [[0, 1], [10, 2]],
      }],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    // No hit: it fizzles. A few swelling pulses like its fuse, a pop that deflates it, the legs give way and it sinks,
    // sways, then folds forward over its splayed legs in its own footprint, x x.
    const sag = (x) => ({ rot: [[0, [0, 0, 0]], [9, [0, 0, 10], 'L'], [11, [x / 2, 0, 44]], [13, [x / 2, 0, 40]], [15, [x / 2, 0, 46]], [18, [x / 2, 0, 50]], [21, [x, 0, 72], 'L'],
      [23, [x, 0, 68]], [25, [x, 0, 76]]] });
    ANIMS.death_collapse = {
      setup: 'still', len: 44, land: -1, lie: null, down: 22, rest: 0.5,
      root: Object.assign(stand([[0, 0, 0, 0, 0], [8, 0, 0, 0, 0], [9, 0, 0, 0, -0.4, 'L'], [11, 0, 0, 0, -1.6], [13, 0, 0, 0, -1.3], [15, 0, 0, 0, -1.8], [18, 0, 0, 0, -2.2],
        [21, 0, 0, 0, -4.4, 'L'], [23, 0, 0, 0, -4.2], [25, 0, 0, 0, -4.6]]), {
        scale: [[0, [1, 1, 1]], [2, [1.03, 1.01, 1.03]], [3, [1.01, 1, 1.01]], [4, [1.05, 1.02, 1.05]], [5, [1.02, 1, 1.02]], [6, [1.07, 1.03, 1.07]], [8, [1.08, 1.03, 1.08]],
          [9, [0.97, 0.98, 0.97], 'L'], [11, [1.01, 1, 1.01]], [13, [1, 1, 1]]],
      }),
      torso: { rot: [[0, [0, 0, 0]], [8, [0, 0, 0]], [9, [-4, 0, 0], 'L'], [11, [-6, 0, 4]], [13, [-4, 0, -4]], [15, [-8, 0, 3]], [18, [-20, 0, 0]], [20, [-48, 0, 0]],
        [22, [-72, 0, 0], 'L'], [24, [-68, 0, 2]], [26, [-72, 0, 0]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [4, 4, 0]], [6, [6, -4, 2]], [8, [8, 0, 0]], [9, [-8, 0, 0], 'L'], [11, [-14, 0, -6]], [13, [-10, 6, 6]], [15, [-16, -4, -8]], [18, [-12, 0, 4]],
        [22, [4, 0, 12], 'L'], [24, [6, 4, 18]], [27, [6, 6, 22]]] },
      leg_fr: sag(4), leg_fl: sag(3), leg_hr: sag(-4), leg_hl: sag(-3),
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [9, 3], [11, 2]],
    };
    return { ANIMS, DEATHS, FLIPS };
  }

  // ---------- the enderman reactions (keyed on the enderman itself: hips 29 px up, 30 px legs and arms) ----------
  // Same house style and timing (impact held from tick 0 to 1, flight synced to the real hop, landing on tick 10, two
  // settles, a head shake), on a lanky body: legs and arms are stiff 30 px bars without knees or elbows. The legs can't
  // bend, so every dip on the ground comes from their angle: planted() lowers the root until the most upright leg (the
  // pelvis tilt included) reaches the ground. The arms hang (0 = straight down) and swing like heavy pendulums a beat behind
  // the body; with the torso folded forward they hang forward by as much, so they keep pointing at the ground.
  // Faces: squint on impact, surprised (eyes wide, and the mod drops its jaw) in the air, squint on landing.
  function endermanAnims() {
    const r2 = v => Math.round(v * 100) / 100, D = Math.PI / 180, LEG = 30;
    const L0 = (v) => [[0, v, 'L'], [1, v, 'L']];
    // linear sample of a key track's x at tick t (for the ground contact only)
    const at = (keys, t) => {
      if (!keys || !keys.length) return 0;
      if (t <= keys[0][0]) return keys[0][1][0];
      for (let i = 1; i < keys.length; i++) {
        if (t <= keys[i][0]) {
          const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
          return v0[0] + (v1[0] - v0[0]) * (t - t0) / (t1 - t0);
        }
      }
      return keys[keys.length - 1][1][0];
    };
    // rows [t, legR, legL, ground, extra, flag]: leg keys, and the root's height from the legs on ground ticks (0 in the air)
    function planted(pelvis, rows) {
      const lr = [], ll = [], pos = [];
      for (const [t, r, l, ground, extra, f] of rows) {
        const p = at(pelvis, t);
        const up = Math.max(Math.cos((r[0] + p) * D) * Math.cos(r[2] * D), Math.cos((l[0] + p) * D) * Math.cos(l[2] * D));
        const y = r2((ground ? -LEG * (1 - up) : 0) + (extra || 0));
        const k = (v) => (f ? [t, v, f] : [t, v]);
        lr.push(k(r)); ll.push(k(l)); pos.push(k([0, y, 0]));
      }
      return { leg_r: { rot: lr }, leg_l: { rot: ll }, pos };
    }
    const G_ = true, A_ = false;
    const ANIMS = {};

    // Front (heavy): the slash from its right. The thin chest caves back and turns with the sweep, the head whips a tick
    // late, the near arm is flung high and wide, the far one swings across in front; the legs skid apart. In the air the
    // body keeps turning while the head turns back to the attacker, the long legs scissor under it and the arms swing
    // through; it lands in a wide stumble, folds forward over it with both arms swinging forward like pendulums, settles
    // twice, straightens and shakes its head.
    (function () {
      const pelvis = [...L0([5, 0, 0]), [3, [12, 0, 0]], [5, [10, 0, 0]], [7, [5, 0, 0]], [9, [0, 0, 0]], [10, [-3, 0, 0], 'L'], [11, [-6, 0, 0]], [13, [-2, 0, 0]],
        [15, [-3, 0, 0]], [18, [0, 0, 0]]];
      const g = planted(pelvis, [[0, [-6, 0, 10], [10, 0, 9], G_, 0, 'L'], [1, [-6, 0, 10], [10, 0, 9], G_, 0, 'L'], [2, [-4, 0, 12], [18, 0, 8], A_], [4, [-14, 0, 8], [30, 0, 6], A_],
        [6, [-10, 0, 6], [26, 0, 5], A_], [8, [10, 0, 4], [-6, 0, 4], A_], [9, [16, 0, 4], [-14, 0, 4], A_], [10, [22, 0, 4], [-22, 0, 4], G_, 0, 'L'],
        [11, [26, 0, 5], [-26, 0, 5], G_], [13, [14, 0, 3], [-16, 0, 3], G_], [15, [18, 0, 3], [-19, 0, 3], G_], [18, [5, 0, 1], [-5, 0, 1], G_], [20, [0, 0, 0], [0, 0, 0], G_]]);
      ANIMS.hit_front = {
        setup: 'front', len: 26, land: 10,
        root: {
          pos: g.pos,
          rot: [...L0([0, 8, 0]), [4, [0, 12, 0]], [7, [0, 16, 0]], [10, [0, 10, 0]], [13, [0, 7, 0]], [17, [0, 0, 0]]],
          scale: [...L0([1.02, 0.97, 1.02]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: pelvis },
        torso: { rot: [...L0([26, 12, 6]), [3, [16, 7, 3]], [5, [11, 4, 1]], [7, [5, 1, 0]], [9, [0, 0, 0]], [10, [-12, 0, 0], 'L'], [11, [-24, 0, 0]], [13, [-12, 0, 0]],
          [15, [-16, 0, 0]], [18, [-5, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]] },
        head: { rot: [...L0([20, 22, 10]), [2, [28, 26, 12]], [4, [14, 12, 4]], [6, [6, -6, 2]], [8, [2, -14, 0]], [9, [0, -14, 0]], [10, [-6, -8, 0], 'L'], [11, [-14, -6, 0]],
          [12, [-22, 0, 0]], [14, [-8, 0, 0]], [16, [-10, 0, 0]], [18, [0, 0, 0]], [19, [0, 18, 0]], [20, [0, -14, 0]], [21, [0, 10, 0]], [22, [0, -4, 0]], [24, [0, 0, 0]]] },
        arm_r: { rot: [...L0([30, 0, 95]), [2, [22, 0, 110]], [4, [30, 0, 118]], [6, [50, 0, 100]], [8, [70, 0, 70]], [10, [60, 0, 55], 'L'], [11, [40, 0, 30]], [12, [36, 0, 16]],
          [13, [16, 0, 10]], [15, [26, 0, 8]], [17, [12, 0, 4]], [19, [2, 0, 2]], [21, [0, 0, 0]]] },
        arm_l: { rot: [...L0([60, 20, 30]), [2, [52, 26, 34]], [4, [70, 34, 24]], [6, [74, 30, 26]], [8, [60, 10, 36]], [10, [54, 6, 34], 'L'], [11, [38, 0, 20]], [12, [18, 0, 10]],
          [13, [30, 0, 8]], [15, [20, 0, 6]], [17, [8, 0, 3]], [19, [0, 0, 1]], [21, [0, 0, 0]]] },
        leg_r: g.leg_r, leg_l: g.leg_l,
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
        face: [[0, 1], [3, 3], [10, 1], [22, 0]],
      };
    })();

    // Light (an uncharged swing): the same impact, smaller, and the same flight; a split-stance landing, one quick dip, a
    // nod, one shake, and the arms swing down and settle.
    (function () {
      const pelvis = [...L0([4, 0, 0]), [3, [10, 0, 0]], [5, [8, 0, 0]], [7, [4, 0, 0]], [9, [0, 0, 0]], [10, [-2, 0, 0], 'L'], [12, [0, 0, 0]]];
      const g = planted(pelvis, [[0, [-4, 0, 8], [8, 0, 7], G_, 0, 'L'], [1, [-4, 0, 8], [8, 0, 7], G_, 0, 'L'], [3, [-10, 0, 8], [20, 0, 6], A_], [6, [-6, 0, 5], [16, 0, 4], A_],
        [9, [12, 0, 3], [-10, 0, 3], A_], [10, [16, 0, 3], [-16, 0, 3], G_, 0, 'L'], [12, [10, 0, 2], [-10, 0, 2], G_], [14, [0, 0, 0], [0, 0, 0], G_]]);
      ANIMS.hit_light = {
        setup: 'front', len: 22, land: 10,
        root: {
          pos: g.pos,
          rot: [...L0([0, 6, 0]), [4, [0, 10, 0]], [7, [0, 13, 0]], [10, [0, 12, 0]], [12, [0, 10, 0]], [14, [0, 4, 0]], [16, [0, -1, 0]], [17, [0, 0, 0]]],
          scale: [...L0([1.01, 0.98, 1.01]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.01, 0.98, 1.01], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: pelvis },
        torso: { rot: [...L0([20, 9, 4]), [3, [13, 5, 2]], [5, [9, 3, 1]], [7, [5, 1, 0]], [9, [0, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-13, 0, 0]], [13, [2, 0, 0]], [15, [-2, 0, 0]],
          [17, [0, 0, 0]]] },
        head: { rot: [...L0([16, 18, 8]), [2, [24, 22, 10]], [4, [12, 10, 4]], [6, [6, -4, 2]], [8, [2, -12, 0]], [9, [0, -12, 0]], [10, [-4, -10, 0], 'L'], [11, [-12, -8, 0]],
          [12, [2, -8, 0]], [13, [0, 6, 2]], [14, [0, -14, -1]], [15, [0, -2, 0]], [17, [0, 0, 0]]] },
        arm_r: { rot: [...L0([24, 0, 80]), [2, [18, 0, 92]], [4, [26, 0, 96]], [6, [42, 0, 80]], [8, [56, 0, 56]], [10, [46, 0, 40], 'L'], [11, [28, 0, 22]], [13, [8, 0, 8]],
          [15, [14, 0, 4]], [17, [2, 0, 1]], [18, [0, 0, 0]]] },
        arm_l: { rot: [...L0([48, 16, 24]), [2, [44, 20, 28]], [4, [58, 26, 20]], [6, [60, 22, 22]], [8, [48, 8, 28]], [10, [40, 4, 24], 'L'], [11, [24, 0, 14]], [13, [16, 0, 6]],
          [15, [4, 0, 2]], [16, [0, 0, 0]]] },
        leg_r: g.leg_r, leg_l: g.leg_l,
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
        face: [[0, 1], [3, 3], [10, 1], [15, 0]],
      };
    })();

    // Side (hit on its right; the mod mirrors it for the left): spun away from the blow, bent sideways at the hips, head
    // snapped round, the near arm flung up and out, the far one thrown across its chest, the near leg kicked out. It keeps
    // turning in the air while the head turns back, lands wide on both legs, rocks over the far one, settles and turns back
    // to face the attacker, head first, then a shake.
    (function () {
      const pelvis = [...L0([0, 0, 8]), [3, [0, 0, 14]], [5, [3, 0, 11]], [7, [3, 0, 6]], [9, [0, 0, 2]], [10, [0, 0, -4], 'L'], [11, [-3, 0, -7]], [13, [0, 0, -2]],
        [15, [0, 0, -4]], [18, [0, 0, 0]]];
      const g = planted(pelvis, [[0, [-6, 0, 16], [6, 0, 2], G_, 0, 'L'], [1, [-6, 0, 16], [6, 0, 2], G_, 0, 'L'], [3, [-8, 0, 24], [16, 0, 4], A_], [6, [6, 0, 14], [-6, 0, 10], A_],
        [9, [2, 0, 10], [2, 0, 8], A_], [10, [-4, 0, 6], [6, 0, 18], G_, 0, 'L'], [11, [-6, 0, 4], [8, 0, 22], G_], [13, [-10, 0, 8], [10, 0, 12], G_],
        [15, [6, 0, 6], [-6, 0, 10], G_], [18, [0, 0, 0], [0, 0, 0], G_]]);
      ANIMS.hit_side = {
        setup: 'side_r', len: 26, land: 10,
        root: {
          pos: g.pos,
          rot: [...L0([0, 24, 0]), [3, [0, 52, 0]], [5, [0, 66, 0]], [7, [0, 64, 0]], [9, [0, 52, 0]], [10, [0, 46, 0]], [13, [0, 38, 0]], [15, [0, 22, 0]], [17, [0, 4, 0]],
            [19, [0, -4, 0]], [21, [0, 0, 0]]],
          scale: [...L0([0.98, 0.97, 1.01]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: pelvis },
        torso: { rot: [...L0([0, 20, 16]), [3, [4, 24, 20]], [5, [6, 12, 12]], [7, [4, 6, 6]], [9, [0, 2, 2]], [10, [-10, 0, -10], 'L'], [11, [-18, 0, -15]], [13, [-6, 0, -4]],
          [15, [-10, 0, -7]], [18, [-2, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]] },
        head: { rot: [...L0([6, 42, 20]), [2, [8, 56, 26]], [4, [4, 34, 14]], [6, [2, 10, 4]], [8, [0, -12, 0]], [9, [0, -18, -2]], [10, [-6, -20, -8], 'L'], [11, [-14, -18, -10]],
          [12, [-18, -16, -6]], [14, [-6, -20, -2]], [16, [-8, -8, 0]], [18, [0, 0, 0]], [19, [0, 14, 0]], [20, [0, -12, 0]], [21, [0, 6, 0]], [22, [0, -2, 0]], [24, [0, 0, 0]]] },
        arm_r: { rot: [...L0([16, 0, 120]), [2, [10, 0, 134]], [4, [18, 0, 138]], [6, [36, 0, 112]], [8, [52, 0, 84]], [10, [44, 0, 56], 'L'], [11, [26, 0, 34]], [12, [18, 0, 20]],
          [14, [10, 0, 26]], [16, [10, 0, 12]], [18, [4, 0, 6]], [20, [0, 0, 2]], [22, [0, 0, 0]]] },
        arm_l: { rot: [...L0([70, 40, -6]), [2, [58, 30, 16]], [4, [46, 10, 44]], [6, [44, 0, 62]], [8, [50, 0, 58]], [10, [42, 0, 46], 'L'], [11, [24, 0, 30]], [12, [16, 0, 18]],
          [14, [12, 0, 26]], [16, [8, 0, 12]], [18, [2, 0, 6]], [20, [0, 0, 2]], [22, [0, 0, 0]]] },
        leg_r: g.leg_r, leg_l: g.leg_l,
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.2], [16, 0.8], [19, 1]],
        face: [[0, 1], [3, 3], [10, 1], [22, 0]],
      };
    })();

    // Back: whiplash. Hips shoved forward, chest and head snapped back, both arms flung up and back over its head; it pitches
    // forward through the air with the legs scrambling, lands in a long catch step folded forward over it, the arms swinging
    // down past its legs, staggers once more, then looks back over its shoulder, surprised, before it comes round.
    (function () {
      const pelvis = [...L0([-8, 0, 0]), [3, [-12, 0, 0]], [5, [-16, 0, 2]], [7, [-12, 0, 0]], [9, [-5, 0, 0]], [10, [0, 0, 0], 'L'], [11, [-4, 0, 0]], [13, [0, 0, 0]]];
      const g = planted(pelvis, [[0, [-4, 0, 6], [10, 0, 6], G_, 0, 'L'], [1, [-4, 0, 6], [10, 0, 6], G_, 0, 'L'], [3, [-20, 0, 6], [-8, 0, 6], A_], [5, [8, 0, 4], [-22, 0, 4], A_],
        [7, [-10, 0, 3], [10, 0, 3], A_], [9, [14, 0, 2], [-10, 0, 2], A_], [10, [24, 0, 2], [-20, 0, 2], G_, 0, 'L'], [11, [28, 0, 3], [-24, 0, 3], G_],
        [13, [-8, 0, 1], [12, 0, 1], G_], [15, [10, 0, 1], [-8, 0, 1], G_], [18, [0, 0, 0], [0, 0, 0], G_]]);
      ANIMS.hit_back = {
        setup: 'back', len: 26, land: 10,
        root: {
          pos: g.pos,
          rot: [...L0([0, -4, 0]), [6, [0, -8, 0]], [10, [0, -6, 0]], [16, [0, 0, 0]]],
          scale: [...L0([1.01, 0.98, 1.01]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: pelvis },
        torso: { rot: [...L0([24, 0, -4]), [3, [30, 0, -4]], [5, [12, 0, -2]], [7, [-2, 0, 0]], [9, [-8, 0, 0]], [10, [-20, 0, 0], 'L'], [11, [-28, 0, 0]], [13, [-12, 0, 0]],
          [15, [-16, 0, 0]], [18, [-4, 0, 0]], [20, [2, 0, 0]], [22, [0, 0, 0]]] },
        head: { rot: [...L0([34, -6, -4]), [2, [42, -8, -6]], [4, [20, -4, 0]], [6, [-6, 0, 0]], [8, [-12, 0, 0]], [10, [-16, 0, 0], 'L'], [11, [-22, 0, 0]], [12, [-26, 0, 0]],
          [14, [-4, 30, 0]], [16, [2, 60, 0]], [18, [0, 64, 0]], [20, [0, 40, 0]], [22, [0, 6, 0]], [24, [0, 0, 0]]] },
        arm_r: { rot: [...L0([196, 0, -16]), [2, [212, 0, -22]], [4, [188, 0, -18]], [6, [150, -10, 4]], [8, [110, -14, 16]], [10, [70, -6, 24], 'L'], [11, [40, 0, 20]],
          [12, [34, 0, 12]], [14, [14, 0, 8]], [16, [22, 0, 6]], [18, [10, 0, 3]], [20, [2, 0, 1]], [22, [0, 0, 0]]] },
        arm_l: { rot: [...L0([182, 0, -10]), [2, [200, 0, -16]], [4, [190, 0, -14]], [6, [160, -8, 0]], [8, [122, -12, 14]], [10, [78, -4, 22], 'L'], [11, [46, 0, 18]],
          [12, [26, 0, 10]], [14, [22, 0, 8]], [16, [14, 0, 5]], [18, [6, 0, 2]], [20, [0, 0, 0]]] },
        leg_r: g.leg_r, leg_l: g.leg_l,
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [16, 0.8], [19, 1]],
        face: [[0, 1], [14, 3], [21, 0]],
      };
    })();

    // Big (crits and sprint hits): the blow from above crushes it: the legs skid out into a wide straddle, the chest folds,
    // head driven down, arms knocked out low. On the release it pops up and stretches, wobbles through the air, lands hard
    // straddled again and stands there dazed (x x), swaying on its stiff legs with the arms dangling, then gathers its legs,
    // straightens and shakes its head.
    (function () {
      const pelvis = [...L0([0, 0, 3]), [3, [6, 0, 0]], [7, [3, 0, -2]], [10, [0, 0, 0], 'L'], [13, [0, 0, 5]], [17, [0, 0, -5]], [21, [0, 0, 4]], [25, [0, 0, -2]], [28, [0, 0, 0]]];
      const g = planted(pelvis, [[0, [-4, 0, 26], [4, 0, 24], G_, 0, 'L'], [1, [-4, 0, 26], [4, 0, 24], G_, 0, 'L'], [3, [10, 0, 6], [-6, 0, 6], A_], [6, [18, 0, 8], [-12, 0, 8], A_],
        [9, [4, 0, 6], [6, 0, 6], A_], [10, [0, 0, 24], [0, 0, 22], G_, 0, 'L'], [11, [-2, 0, 28], [2, 0, 27], G_], [13, [-4, 0, 14], [4, 0, 12], G_],
        [16, [4, 0, 20], [-2, 0, 18], G_], [19, [-4, 0, 14], [4, 0, 16], G_], [22, [2, 0, 17], [-2, 0, 13], G_], [25, [0, 0, 12], [0, 0, 12], G_], [28, [0, 0, 0], [0, 0, 0], G_]]);
      ANIMS.hit_big = {
        setup: 'front', len: 32, land: 10,
        root: {
          pos: g.pos,
          rot: [...L0([0, 4, 0]), [6, [0, -4, 0]], [10, [0, 0, 0]]],
          scale: [...L0([1.03, 0.95, 1.03]), [3, [0.99, 1.02, 0.99]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.03, 0.96, 1.03], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: pelvis },
        torso: { rot: [...L0([-18, 0, 6]), [2, [10, 0, 0]], [4, [14, 0, -2]], [7, [6, 0, 2]], [9, [0, 0, 0]], [10, [-20, 0, 0], 'L'], [11, [-26, 0, 0]], [13, [-6, 0, -8]],
          [15, [-10, 0, 9]], [17, [-4, 0, -8]], [19, [-10, 0, 7]], [21, [-4, 0, -5]], [23, [-6, 0, 3]], [26, [0, 0, 0]]] },
        head: { rot: [...L0([-24, 8, 8]), [2, [-6, 4, 4]], [3, [24, 0, 0]], [5, [10, -24, 12]], [7, [4, 18, -10]], [9, [0, -6, 4]], [10, [-20, 0, 0], 'L'], [11, [-28, 0, 0]],
          [12, [8, 0, 10]], [14, [14, -8, -14]], [16, [4, 6, 16]], [18, [-8, -4, -12]], [20, [10, 6, 12]], [22, [-4, -3, -8]], [24, [6, 2, 4]], [26, [0, 0, 0]], [28, [0, 22, 0]],
          [29, [0, -18, 0]], [30, [0, 8, 0]], [31, [0, 0, 0]]] },
        arm_r: { rot: [...L0([10, 0, 60]), [3, [40, 0, 96]], [5, [54, 0, 76]], [7, [36, 0, 84]], [9, [44, 0, 66]], [10, [30, 0, 40], 'L'], [11, [24, 0, 22]], [13, [8, 0, 14]],
          [16, [16, 0, 20]], [19, [6, 0, 10]], [22, [14, 0, 16]], [25, [8, 0, 8]], [28, [2, 0, 2]], [30, [0, 0, 0]]] },
        arm_l: { rot: [...L0([14, 0, 54]), [3, [36, 0, 90]], [5, [50, 0, 72]], [7, [38, 0, 86]], [9, [46, 0, 62]], [10, [30, 0, 38], 'L'], [11, [22, 0, 24]], [14, [10, 0, 12]],
          [17, [18, 0, 20]], [20, [6, 0, 10]], [23, [12, 0, 14]], [25, [8, 0, 8]], [28, [2, 0, 2]], [30, [0, 0, 0]]] },
        leg_r: g.leg_r, leg_l: g.leg_l,
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.35], [26, 0.35], [29, 1]],
        face: [[0, 1], [10, 2], [27, 1], [30, 0]],
      };
    })();

    // Deaths. Front (the user picked "timber topple", 2026-09-28): the shove keeps tipping it back, stiff as a felled tree,
    // about its heels (z +1), feet planted and legs straight; the arms rise in front of it as the body falls away from them.
    // It slams flat on its back, the long arms slap out to the sides, the feet kick up on the slam, flop back and settle,
    // and the head rolls to one side, x x. Pivoting on the heels would lay the whole 2.8 blocks behind its feet, so it also
    // slides 18 px forward in the air. Lying on its back the head's back (4 px behind the neck) would sink 3 px and the body's
    // 1: the root lifts 1 px and the head moves 1 px up (toward its face) and tucks its chin.
    function topple(rows) {
      const rot = [], pos = [];
      for (const [t, rx, ry, dy, dz, f] of rows) {
        const a = rx * D, k = [0, r2(Math.sin(a) + dy), r2(1 - Math.cos(a) + dz)];
        rot.push(f ? [t, [rx, ry, 0], f] : [t, [rx, ry, 0]]);
        pos.push(f ? [t, k, f] : [t, k]);
      }
      return { rot, pos };
    }
    const kick = (x) => [[4, [0, 0, 2]], [9, [2 + x / 2, 0, 3]], [10, [6 + x, 0, 4], 'L'], [11, [34 + x, 0, 6]], [13, [8 + x, 0, 6]], [15, [16 + x, 0, 6]], [17, [5 + x, 0, 6]],
      [19, [8 + x, 0, 6]], [22, [4 + x, 0, 6]]];
    const DEATHS = {
      death_front: ['hit_front', 3, {
        setup: 'front_dead', len: 36, lie: [0, 1], down: 10, rest: 0.4,
        root: topple([[4, 8, 10, 0, -1], [6, 24, 12, 0, -4], [8, 50, 12, 0, -10], [9, 70, 12, 0.5, -14], [10, 90, 12, 1, -18, 'L'], [11, 85, 12, 1, -18], [12, 90, 12, 1, -18],
          [14, 88, 12, 1, -18], [16, 90, 12, 1, -18]]),
        pelvis: { rot: [[4, [0, 0, 0]]] },
        torso: { rot: [[5, [4, 0, 0]], [8, [-3, 0, 0]], [10, [0, 0, 0], 'L'], [12, [-3, 0, 0]], [14, [0, 0, 0]]] },
        head: {
          // 0.10.4 (the user: the head floated off the shoulders): 1 px lift, just what the root's 1 px needs, and a
          // softer roll to the side (34° swung the 8 px head's corner up off the 4 px deep body)
          rot: [[5, [10, 0, 0]], [8, [-8, 0, 0]], [10, [-14, 0, 0], 'L'], [11, [-18, -8, 0]], [13, [-10, 14, 0]], [16, [-8, 18, 3]], [24, [-8, 20, 3]]],
          pos: [[9, [0, 0, 0]], [10, [0, 0, -1], 'L']],
        },
        arm_r: { rot: [[5, [40, 0, 40]], [7, [70, 0, 44]], [9, [96, 0, 44]], [10, [20, 0, 70], 'L'], [12, [6, 0, 84]], [14, [2, 0, 74]], [16, [4, 0, 78]], [20, [3, 0, 77]]] },
        arm_l: { rot: [[5, [52, 10, 24]], [7, [80, 4, 30]], [9, [100, 0, 32]], [10, [24, 0, 50], 'L'], [12, [8, 0, 60]], [14, [2, 0, 52]], [16, [4, 0, 55]], [20, [3, 0, 54]]] },
        leg_r: { rot: kick(3) }, leg_l: { rot: kick(-2).concat([[26, [2, 0, 6]], [27, [14, 0, 6]], [29, [2, 0, 6]]]) },
        face: [[0, 1], [3, 3], [10, 2]],
      }],
      // Big: the legs give way sideways on landing: they skid out into the splits, the hips drop to the ground, it folds
      // forward over them and the long arms flop onto the ground in front, head lolling, x x. It stays in its own footprint,
      // so it's also the death for side and back kills and the fallback without room.
      death_big: ['hit_big', 3, {
        setup: 'front_dead', len: 38, lie: null, down: 16, rest: 0.9,
        root: { pos: [[5, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -3, 0], 'L'], [11, [0, -5.5, 0]], [12, [0, -9.6, 0]], [14, [0, -17, 0]], [16, [0, -26.4, 0], 'L'], [17, [0, -25.8, 0]],
          [18, [0, -26.4, 0]]] },
        pelvis: { rot: [[5, [3, 0, 0]], [10, [0, 0, 0], 'L'], [13, [0, 0, 3]], [16, [0, 0, 0]]] },
        torso: { rot: [[5, [8, 0, 0]], [9, [0, 0, 0]], [10, [-8, 0, 0], 'L'], [12, [4, 0, 6]], [14, [-4, 0, -6]], [16, [-10, 0, 4], 'L'], [18, [-26, 0, 2]], [20, [-44, 0, 0]],
          [22, [-54, 0, 2]], [24, [-50, 0, 3]], [27, [-53, 0, 3]]] },
        head: { rot: [[5, [10, -24, 12]], [7, [4, 18, -10]], [9, [0, -6, 4]], [10, [-16, 0, 0], 'L'], [12, [10, 10, 10]], [14, [-8, -8, -8]], [16, [4, 6, 10], 'L'], [18, [-18, 4, 16]],
          [21, [-30, 2, 22]], [24, [-34, 0, 26]], [30, [-35, 0, 27]]] },
        arm_r: { rot: [[5, [54, 0, 76]], [7, [36, 0, 84]], [9, [44, 0, 66]], [10, [24, 0, 30], 'L'], [12, [10, 0, 40]], [14, [4, 0, 50]], [16, [10, 0, 60], 'L'], [18, [60, 0, 40]],
          [20, [100, 0, 30]], [22, [128, 0, 22]], [24, [122, 0, 23]], [27, [126, 0, 22]]] },
        arm_l: { rot: [[5, [50, 0, 72]], [7, [38, 0, 86]], [9, [46, 0, 62]], [10, [26, 0, 30], 'L'], [12, [12, 0, 44]], [14, [6, 0, 52]], [16, [12, 0, 62], 'L'], [18, [62, 0, 36]],
          [20, [104, 0, 24]], [22, [132, 0, 14]], [24, [126, 0, 15]], [27, [130, 0, 14]]] },
        leg_r: { rot: [[5, [18, 0, 8]], [9, [4, 0, 6]], [10, [0, 0, 24], 'L'], [11, [-2, 0, 36]], [12, [-3, 0, 50]], [14, [-3, 0, 68]], [16, [-4, 0, 88], 'L'], [17, [-4, 0, 85]],
          [18, [-4, 0, 88]]] },
        leg_l: { rot: [[5, [-12, 0, 8]], [9, [6, 0, 6]], [10, [0, 0, 22], 'L'], [11, [2, 0, 35]], [12, [3, 0, 50]], [14, [3, 0, 68]], [16, [4, 0, 88], 'L'], [17, [4, 0, 86]],
          [18, [4, 0, 88]]] },
        face: [[0, 1], [10, 2]],
      }],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    // No hit (water, rain, fire, a fall): it staggers, sways on its stiff legs, and the legs slowly skid out into the same
    // splits; it sinks, wobbles, and folds forward over them, arms flopping onto the ground, x x. In its own footprint.
    ANIMS.death_collapse = {
      setup: 'still', len: 44, land: -1, lie: null, down: 22, rest: 0.9,
      root: { pos: [[0, [0, 0, 0]], [3, [0, -0.3, 0]], [7, [0, -1.2, 0]], [10, [0, -3.4, 0]], [13, [0, -6.8, 0]], [16, [0, -12.4, 0]], [19, [0, -20, 0]], [22, [0, -26.4, 0], 'L'],
        [23, [0, -25.8, 0]], [24, [0, -26.4, 0]]] },
      pelvis: { rot: [[0, [0, 0, 0]], [3, [0, 0, 4]], [6, [0, 0, -4]], [9, [0, 0, 3]], [12, [0, 0, -2]], [15, [0, 0, 0]]] },
      torso: { rot: [[0, [0, 0, 0]], [3, [-6, 0, -4]], [6, [-4, 0, 5]], [9, [-8, 0, -4]], [12, [-6, 0, 3]], [16, [-4, 0, 0]], [19, [2, 0, 0]], [22, [-10, 0, 3], 'L'], [24, [-26, 0, 2]],
        [26, [-44, 0, 0]], [28, [-54, 0, 2]], [30, [-50, 0, 3]], [33, [-53, 0, 3]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [-10, 6, -6]], [6, [-4, -8, 8]], [9, [-14, 6, -8]], [12, [-8, -4, 6]], [16, [-6, 0, 0]], [19, [6, 0, 0]], [22, [-4, 6, 10], 'L'],
        [24, [-18, 4, 16]], [27, [-30, 2, 22]], [30, [-34, 0, 26]], [36, [-35, 0, 27]]] },
      arm_r: { rot: [[0, [0, 0, 0]], [3, [10, 0, 12]], [6, [4, 0, 4]], [9, [10, 0, 14]], [12, [6, 0, 8]], [16, [4, 0, 20]], [19, [2, 0, 36]], [22, [10, 0, 60], 'L'], [24, [60, 0, 40]],
        [26, [100, 0, 30]], [28, [128, 0, 22]], [30, [122, 0, 23]], [33, [126, 0, 22]]] },
      arm_l: { rot: [[0, [0, 0, 0]], [3, [6, 0, 8]], [6, [10, 0, 14]], [9, [4, 0, 6]], [12, [10, 0, 12]], [16, [4, 0, 22]], [19, [2, 0, 38]], [22, [12, 0, 62], 'L'], [24, [62, 0, 36]],
        [26, [104, 0, 24]], [28, [132, 0, 14]], [30, [126, 0, 15]], [33, [130, 0, 14]]] },
      leg_r: { rot: [[0, [0, 0, 0]], [3, [-3, 0, 8]], [7, [-3, 0, 16]], [10, [-3, 0, 28]], [13, [-4, 0, 40]], [16, [-4, 0, 55]], [19, [-4, 0, 72]], [22, [-4, 0, 88], 'L'],
        [23, [-4, 0, 85]], [24, [-4, 0, 88]]] },
      leg_l: { rot: [[0, [0, 0, 0]], [3, [3, 0, 6]], [7, [3, 0, 16]], [10, [3, 0, 28]], [13, [4, 0, 40]], [16, [4, 0, 55]], [19, [4, 0, 72]], [22, [4, 0, 88], 'L'],
        [23, [4, 0, 86]], [24, [4, 0, 88]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [3, 3], [10, 1], [19, 2]],
    };
    return { ANIMS, DEATHS };
  }

  // ---------- the pet reactions (keyed on the wolf; fox, cat, ocelot and every baby are measured) ----------
  // Same beats as the quadruped rig (impact held from tick 0 to 1, flight synced to the real hop, landing on tick 10), in a
  // light, quick body with a tail: the tail clamps down on the impact, streams up in the air and tucks on landing; the legs
  // scramble through the air (paddling out of step) and splay into a skid on landing. The recovery is a wet-dog shake-off
  // (the user's pick, 2026-09-28): head first, the body half a tick later, the tail last, swinging out a few times and dying
  // down, eyes squeezed shut, then the tail comes back up. A hit pet runs off (panic) or chases the attacker right after
  // landing, so its legs walk again from tick 12 and the shake plays on the move (with frozen legs it skated away).
  // Deaths: the front one is the curl (the user picked it over tumble and flop from real-client GIFs, 2026-09-28; the
  // others stay in FLIPS),
  // the big one splats flat on its belly, and without a hit it lies down and curls up on its side.
  // Units as the quadruped rig; tail: [lift (+ = up), wag (+ = toward its left), 0].
  function petAnims() {
    const L0 = (v) => [[0, v, 'L'], [1, v, 'L']];
    // the shake-off from tick t: roll amplitudes for head, body (half a tick later) and tail wag (a tick later)
    function shake(t, amp, n) {
      const head = [], body = [], tail = [];
      for (let i = 0; i < n; i++) {
        const a = Math.round(amp * (1 - i / n) * (i % 2 ? -1 : 1) * 10) / 10;
        head.push([t + i, [0, 0, a]]);
        body.push([t + i + 0.5, [0, 0, Math.round(a * 0.7 * 10) / 10]]);
        tail.push([t + i + 1, [6, Math.round(a * 1.6 * 10) / 10, 0]]);
      }
      head.push([t + n, [0, 0, 0]]); body.push([t + n + 0.5, [0, 0, 0]]);
      tail.push([t + n + 1, [14, 0, 0]], [t + n + 3, [0, 0, 0]]);
      return { head, body, tail };
    }
    // legs paddling out of step in the air, from tick a to b (every 2 ticks)
    function paddle(a, b, amp, phase) {
      const k = [];
      for (let t = a, i = 0; t <= b; t += 2, i++) k.push([t, [Math.round(amp * Math.cos(i * Math.PI / 1.5 + phase)), 0, 6]]);
      return k;
    }
    const ANIMS = {};

    // Front (heavy): the swipe across the face from its right. It rears back, front paws thrown up, head snapped away, tail
    // clamped; in the air it keeps turning while the head comes back, the paws scramble and the tail streams up; it lands
    // front-heavy in a splayed skid with the tail tucked, settles twice, then shakes itself off from nose to tail.
    (function () {
      const s = shake(17, 20, 7);
      ANIMS.hit_front = {
        setup: 'front', len: 30, land: 10,
        root: {
          pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.5, 0]], [15, [0, -0.8, 0]], [17, [0, 0, 0]]],
          rot: [...L0([0, 8, 0]), [4, [0, 14, 0]], [7, [0, 18, 0]], [10, [0, 10, 0]], [13, [0, 5, 0]], [16, [0, 0, 0]]],
          scale: [...L0([1.04, 0.95, 1.04]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.04, 0.95, 1.04], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: [...L0([14, 0, -4]), [3, [20, 0, -2]], [5, [16, 0, 0]], [7, [8, 0, 0]], [9, [0, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-12, 0, 0]], [13, [-3, 0, 0]],
          [15, [-5, 0, 0]], [16.5, [0, 0, 0]], ...s.body] },
        head: { rot: [...L0([30, 26, 14]), [2, [38, 30, 16]], [4, [20, 16, 6]], [6, [8, -2, 2]], [8, [2, -14, 0]], [9, [0, -14, 0]], [10, [-10, -6, 0], 'L'], [11, [-20, -4, 0]],
          [13, [-6, 0, 0]], [15, [-8, 0, 0]], [16, [0, 0, 0]], ...s.head] },
        tail: { rot: [...L0([-30, 10, 0]), [3, [-20, 6, 0]], [5, [14, -10, 0]], [7, [24, -14, 0]], [9, [10, 0, 0]], [10, [-10, 0, 0], 'L'], [11, [-26, 0, 0]], [13, [-14, 0, 0]],
          [15, [-18, 0, 0]], [17, [-6, 0, 0]], ...s.tail] },
        leg_fr: { rot: [...L0([34, 0, 14]), [2, [44, 0, 16]], ...paddle(4, 8, 30, 0), [9, [0, 0, 6]], [10, [-10, 0, 20], 'L'], [11, [-12, 0, 26]], [13, [0, 0, 8]], [15, [0, 0, 12]], [17, [0, 0, 0]]] },
        leg_fl: { rot: [...L0([24, 0, 6]), [2, [14, 0, 8]], ...paddle(4, 8, 30, 2), [9, [0, 0, 6]], [10, [-8, 0, 18], 'L'], [11, [-10, 0, 24]], [13, [0, 0, 8]], [15, [0, 0, 12]], [17, [0, 0, 0]]] },
        leg_hr: { rot: [...L0([-8, 0, 4]), [2, [-20, 0, 4]], ...paddle(4, 8, 22, 1), [9, [0, 0, 6]], [10, [8, 0, 16], 'L'], [11, [10, 0, 22]], [13, [0, 0, 6]], [15, [0, 0, 10]], [17, [0, 0, 0]]] },
        leg_hl: { rot: [...L0([-4, 0, 4]), [2, [10, 0, 4]], ...paddle(4, 8, 22, 3), [9, [0, 0, 6]], [10, [6, 0, 18], 'L'], [11, [8, 0, 24]], [13, [0, 0, 6]], [15, [0, 0, 10]], [17, [0, 0, 0]]] },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
        face: [[0, 1], [3, 3], [10, 1], [16, 0], [17, 1], [25, 0]],
      };
    })();

    // Light (an uncharged swing): the same flinch, smaller, one settle and a short shake.
    (function () {
      const s = shake(14, 14, 5);
      ANIMS.hit_light = {
        setup: 'front', len: 24, land: 10,
        root: {
          pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -0.8, 0], 'L'], [11, [0, -1.3, 0]], [13, [0, 0, 0]]],
          rot: [...L0([0, 6, 0]), [4, [0, 10, 0]], [7, [0, 13, 0]], [10, [0, 10, 0]], [13, [0, 2, 0]], [14, [0, 0, 0]]],
          scale: [...L0([1.02, 0.97, 1.02]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.02, 0.97, 1.02], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: [...L0([9, 0, -3]), [3, [14, 0, -1]], [5, [11, 0, 0]], [7, [5, 0, 0]], [9, [0, 0, 0]], [10, [-5, 0, 0], 'L'], [11, [-7, 0, 0]], [13, [0, 0, 0]], ...s.body] },
        head: { rot: [...L0([22, 20, 10]), [2, [28, 24, 12]], [4, [14, 12, 4]], [6, [6, -4, 2]], [8, [2, -10, 0]], [10, [-8, -6, 0], 'L'], [11, [-14, -4, 0]], [13, [0, 0, 0]], ...s.head] },
        tail: { rot: [...L0([-22, 8, 0]), [3, [-14, 4, 0]], [5, [10, -8, 0]], [7, [16, -10, 0]], [9, [6, 0, 0]], [10, [-8, 0, 0], 'L'], [11, [-18, 0, 0]], [13, [-8, 0, 0]], ...s.tail] },
        leg_fr: { rot: [...L0([24, 0, 10]), [2, [30, 0, 12]], ...paddle(4, 8, 20, 0), [10, [-6, 0, 14], 'L'], [11, [-8, 0, 18]], [13, [0, 0, 0]]] },
        leg_fl: { rot: [...L0([16, 0, 4]), [2, [10, 0, 6]], ...paddle(4, 8, 20, 2), [10, [-5, 0, 12], 'L'], [11, [-6, 0, 16]], [13, [0, 0, 0]]] },
        leg_hr: { rot: [...L0([-6, 0, 3]), [2, [-14, 0, 3]], ...paddle(4, 8, 14, 1), [10, [5, 0, 12], 'L'], [11, [6, 0, 16]], [13, [0, 0, 0]]] },
        leg_hl: { rot: [...L0([-3, 0, 3]), [2, [8, 0, 3]], ...paddle(4, 8, 14, 3), [10, [4, 0, 12], 'L'], [11, [5, 0, 16]], [13, [0, 0, 0]]] },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.4], [14, 1]],
        face: [[0, 1], [3, 3], [10, 1], [13, 0], [14, 1], [20, 0]],
      };
    })();

    // Side (hit on its right; the mod mirrors it for the left): rolled away from the blow and spun, the near legs kicked
    // out, the head whipped round, the tail flung toward the blow; it lands leaning onto its near legs, rocks back, turns
    // to face the attacker again, head first, and shakes it off.
    (function () {
      const s = shake(17, 20, 7);
      ANIMS.hit_side = {
        setup: 'side_r', len: 30, land: 10,
        root: {
          pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -1.8, 0]], [13, [0, -0.4, 0]], [15, [0, -0.7, 0]], [17, [0, 0, 0]]],
          rot: [...L0([0, 20, 0]), [3, [0, 44, 0]], [5, [0, 56, 0]], [7, [0, 56, 0]], [9, [0, 46, 0]], [10, [0, 40, 0]], [12, [0, 30, 0]], [14, [0, 14, 0]], [16, [0, 0, 0]]],
          scale: [...L0([0.97, 0.97, 1.03]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.04, 0.95, 1.04], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: [...L0([0, 0, 14]), [3, [0, 0, 24]], [5, [2, 0, 18]], [7, [2, 0, 8]], [9, [0, 0, 0]], [10, [0, 0, -8], 'L'], [11, [0, 0, -11]], [13, [0, 0, 4]], [15, [0, 0, -3]],
          [16.5, [0, 0, 0]], ...s.body] },
        head: { rot: [...L0([6, 40, 20]), [2, [8, 52, 24]], [4, [4, 30, 12]], [6, [2, 8, 4]], [8, [0, -14, 0]], [10, [-6, -18, -8], 'L'], [11, [-12, -16, -10]], [13, [-4, -10, 0]],
          [15, [0, -2, 0]], [16, [0, 0, 0]], ...s.head] },
        tail: { rot: [...L0([-10, -30, 0]), [3, [0, -36, 0]], [5, [16, -20, 0]], [7, [22, 0, 0]], [9, [10, 10, 0]], [10, [-8, 14, 0], 'L'], [11, [-20, 16, 0]], [13, [-12, 4, 0]],
          [15, [-14, 0, 0]], [17, [-6, 0, 0]], ...s.tail] },
        leg_fr: { rot: [...L0([6, 0, 32]), [2, [10, 0, 40]], ...paddle(4, 8, 24, 0), [10, [0, 0, 28], 'L'], [11, [2, 0, 32]], [13, [0, 0, 8]], [15, [0, 0, 12]], [17, [0, 0, 0]]] },
        leg_hr: { rot: [...L0([-6, 0, 30]), [2, [-10, 0, 38]], ...paddle(4, 8, 20, 1), [10, [0, 0, 26], 'L'], [11, [-2, 0, 30]], [13, [0, 0, 8]], [15, [0, 0, 12]], [17, [0, 0, 0]]] },
        leg_fl: { rot: [...L0([4, 0, -6]), [2, [14, 0, -2]], ...paddle(4, 8, 24, 2), [10, [-2, 0, 10], 'L'], [11, [0, 0, 14]], [13, [0, 0, 2]], [17, [0, 0, 0]]] },
        leg_hl: { rot: [...L0([-2, 0, -6]), [2, [-10, 0, -2]], ...paddle(4, 8, 20, 3), [10, [2, 0, 10], 'L'], [11, [0, 0, 14]], [13, [0, 0, 2]], [17, [0, 0, 0]]] },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
        face: [[0, 1], [3, 3], [10, 1], [16, 0], [17, 1], [25, 0]],
      };
    })();

    // Back: a kick in the rear. The rump jumps up, the hind legs fly back, the tail clamps down hard and the head snaps up;
    // it pitches forward through the air, lands on its front paws in a stumble, looks back over its shoulder (surprised),
    // turns forward again and shakes it off.
    (function () {
      const s = shake(19, 18, 6);
      ANIMS.hit_back = {
        setup: 'back', len: 30, land: 10,
        root: {
          pos: [[0, [0, 0, 0], 'L'], [9, [0, 0, 0]], [10, [0, -1.2, 0], 'L'], [11, [0, -2, 0]], [13, [0, -0.5, 0]], [15, [0, -0.8, 0]], [17, [0, 0, 0]]],
          rot: [...L0([0, -4, 0]), [5, [0, -6, 0]], [9, [0, -4, 0]], [13, [0, 0, 0]]],
          scale: [...L0([1.03, 0.96, 1.03]), [3, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.04, 0.95, 1.04], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: [...L0([-14, 0, 0]), [3, [-20, 0, 0]], [5, [-10, 0, 0]], [7, [-2, 0, 0]], [9, [2, 0, 0]], [10, [-12, 0, 0], 'L'], [11, [-16, 0, 0]], [13, [-4, 0, 0]],
          [15, [-6, 0, 0]], [17, [0, 0, 0]], ...s.body] },
        head: { rot: [...L0([30, -4, -4]), [2, [38, -6, -6]], [4, [16, -4, 0]], [6, [-4, 0, 0]], [8, [-10, 0, 0]], [10, [-16, 0, 0], 'L'], [11, [-22, 0, 0]], [12, [-8, 0, 0]],
          [13, [-2, 30, 0]], [15, [2, 58, 0]], [17, [0, 60, 0]], [18, [0, 30, 0]], ...s.head] },
        tail: { rot: [...L0([-44, 0, 0]), [3, [-40, 0, 0]], [5, [-10, 0, 0]], [7, [16, 0, 0]], [9, [20, 0, 0]], [10, [0, 0, 0], 'L'], [11, [-20, 0, 0]], [13, [-10, 0, 0]],
          [15, [-16, 0, 0]], [18, [-6, 0, 0]], ...s.tail] },
        leg_hr: { rot: [...L0([-34, 0, 6]), [2, [-44, 0, 6]], ...paddle(4, 8, 22, 1), [10, [4, 0, 16], 'L'], [11, [6, 0, 20]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
        leg_hl: { rot: [...L0([-28, 0, 6]), [2, [-38, 0, 6]], ...paddle(4, 8, 22, 3), [10, [-2, 0, 16], 'L'], [11, [-4, 0, 20]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
        leg_fr: { rot: [...L0([-10, 0, 4]), [2, [-14, 0, 4]], ...paddle(4, 8, 28, 0), [10, [-14, 0, 18], 'L'], [11, [-16, 0, 22]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
        leg_fl: { rot: [...L0([-6, 0, 4]), [2, [-10, 0, 4]], ...paddle(4, 8, 28, 2), [10, [-12, 0, 18], 'L'], [11, [-14, 0, 22]], [13, [0, 0, 6]], [16, [0, 0, 0]]] },
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.3], [15, 1]],
        face: [[0, 1], [10, 1], [13, 3], [18, 0], [19, 1], [26, 0]],
      };
    })();

    // Big (crits and sprint hits): squashed flat, legs splayed out like a starfish, chin on the ground; it pops up with the
    // legs dangling, lands splayed again, wobbles dizzy (x x) with its tail limp, gathers its legs and shakes it off.
    (function () {
      const s = shake(25, 18, 6);
      const bigLeg = (x) => ({ rot: [...L0([x, 0, 55]), [3, [2.5 * x, 0, 8]], [5, [4 * x, 0, 2]], [7, [1.5 * x, 0, 8]], [9, [1.5 * x, 0, 6]], [10, [x / 2, 0, 50], 'L'], [11, [x / 2, 0, 56]],
        [13, [0, 0, 30]], [16, [0, 0, 38]], [20, [0, 0, 26]], [23, [0, 0, 12]], [25, [0, 0, 0]]] });
      ANIMS.hit_big = {
        setup: 'front', len: 36, land: 10,
        root: {
          pos: [...L0([0, -3, 0]), [3, [0, 0, 0]], [9, [0, 0, 0]], [10, [0, -2.6, 0], 'L'], [11, [0, -3.2, 0]], [13, [0, -1.4, 0]], [16, [0, -1.9, 0]], [20, [0, -1.2, 0]],
            [23, [0, -0.4, 0]], [25, [0, 0, 0]]],
          scale: [...L0([1.06, 0.92, 1.06]), [3, [0.98, 1.03, 0.98]], [5, [1, 1, 1]], [9, [1, 1, 1]], [10, [1.05, 0.94, 1.05], 'L'], [12, [1, 1, 1]]],
        },
        pelvis: { rot: [...L0([-4, 0, 4]), [3, [6, 0, 0]], [7, [2, 0, -2]], [10, [0, 0, 0], 'L'], [13, [0, 0, 8]], [16, [0, 0, -8]], [19, [0, 0, 6]], [22, [0, 0, -3]], [24.5, [0, 0, 0]],
          ...s.body] },
        head: { rot: [...L0([-22, 6, 6]), [2, [-8, 4, 4]], [3, [20, 0, 0]], [5, [8, -20, 10]], [7, [4, 16, -8]], [9, [0, -6, 4]], [10, [-18, 0, 0], 'L'], [11, [-22, 0, 0]],
          [12, [6, 0, 10]], [14, [10, -8, -12]], [16, [2, 6, 14]], [18, [-6, -4, -10]], [20, [8, 6, 10]], [22, [-4, -3, -6]], [24, [0, 0, 0]], ...s.head] },
        tail: { rot: [...L0([-20, 0, 0]), [3, [20, 0, 0]], [6, [10, 10, 0]], [9, [4, 0, 0]], [10, [-24, 0, 0], 'L'], [12, [-30, 0, 0]], [16, [-32, 4, 0]], [20, [-30, -4, 0]],
          [24, [-20, 0, 0]], ...s.tail] },
        leg_fr: bigLeg(4), leg_fl: bigLeg(3), leg_hr: bigLeg(-4), leg_hl: bigLeg(-3),
        walk: [[0, 0, 'L'], [10, 0, 'L'], [12, 0.35], [24, 0.35], [27, 1]],
        face: [[0, 1], [10, 2], [24, 1], [32, 0]],
      };
    })();

    // Deaths: three front variants were filmed (PT.flip(v)); the user picked curl.
    // flop: tipped onto its right side in the air (about the flank's edge, like the cow) and lands on it, legs stiff and
    // sticking out, a bounce, the tail flops once.
    const flop = {
      setup: 'front_dead', len: 34, lie: [1, 0], down: 10, rest: 0.4,
      root: { rot: [[4, [0, 12, 0]], [7, [0, 16, 0]], [10, [0, 18, 0]]] },
      tip_r: { rot: [[3, [0, 0, 0]], [5, [0, 0, -16]], [7, [0, 0, -44]], [9, [0, 0, -76]], [10, [0, 0, -90], 'L'], [12, [0, 0, -82]], [14, [0, 0, -90]], [16, [0, 0, -88]], [18, [0, 0, -90]]] },
      pelvis: { rot: [[5, [12, 0, 0]], [8, [4, 0, 0]], [10, [0, 0, 0], 'L']] },
      head: { rot: [[4, [18, 14, 6]], [6, [8, 0, 0]], [9, [0, -8, -6]], [10, [-6, -4, -18], 'L'], [12, [4, 0, -8]], [14, [-8, 4, -20]], [18, [-10, 6, -22]], [26, [-10, 6, -24]]] },
      tail: { rot: [[4, [10, -10, 0]], [7, [20, 0, 0]], [10, [0, 0, 0], 'L'], [11, [0, -20, 0]], [13, [0, 10, 0]], [15, [0, -4, 0]], [18, [0, 0, 0]]] },
      leg_fr: { rot: [[4, [24, 0, 10]], [7, [12, 0, 6]], [10, [14, 0, 4], 'L'], [12, [20, 0, 6]], [14, [14, 0, 4]]] },
      leg_fl: { rot: [[4, [30, 0, 6]], [7, [18, 0, 4]], [10, [8, 0, -6], 'L'], [12, [14, 0, -2]], [14, [8, 0, -6]]] },
      leg_hr: { rot: [[4, [-10, 0, 6]], [7, [-16, 0, 4]], [10, [-12, 0, 4], 'L'], [12, [-18, 0, 6]], [14, [-12, 0, 4]], [22, [-12, 0, 4]], [23, [-26, 0, 4]], [25, [-12, 0, 4]]] },
      leg_hl: { rot: [[4, [-14, 0, 6]], [7, [-20, 0, 4]], [10, [-8, 0, -6], 'L'], [12, [-14, 0, -2]], [14, [-8, 0, -6]]] },
      face: [[0, 1], [10, 2]],
    };
    // tumble: knocked over backwards, a full backward somersault through the air, and it comes down on its right side,
    // legs flung out, tail flopping.
    const tumble = {
      setup: 'front_dead', len: 34, lie: [1, 0], down: 10, rest: 0.4,
      root: { rot: [[4, [0, 12, 0]], [8, [0, 18, 0]]] },
      pelvis: {
        rot: [[3, [16, 0, 0]], [5, [90, 0, 4]], [7, [200, 0, 6]], [8, [270, 0, 4]], [9, [330, 0, 2]], [10, [360, 0, 0], 'L']],
        pos: [[3, [0, 0, 0]], [5, [0, 5, 0]], [7, [0, 7, 0]], [9, [0, 3, 0]], [10, [0, 0, 0], 'L']],
      },
      tip_r: { rot: [[7, [0, 0, 0]], [9, [0, 0, -60]], [10, [0, 0, -90], 'L'], [12, [0, 0, -80]], [14, [0, 0, -90]], [16, [0, 0, -87]], [18, [0, 0, -90]]] },
      head: { rot: [[4, [24, 10, 6]], [6, [-20, 0, 0]], [8, [-30, -10, 0]], [10, [-6, -4, -18], 'L'], [12, [6, 0, -6]], [14, [-8, 4, -20]], [18, [-10, 6, -22]], [26, [-10, 6, -24]]] },
      tail: { rot: [[4, [30, 0, 0]], [6, [40, 0, 0]], [8, [20, 10, 0]], [10, [0, 0, 0], 'L'], [11, [0, -24, 0]], [13, [0, 12, 0]], [15, [0, -4, 0]], [18, [0, 0, 0]]] },
      leg_fr: { rot: [[4, [50, 0, 12]], [6, [-30, 0, 16]], [8, [40, 0, 14]], [10, [16, 0, 6], 'L'], [12, [24, 0, 8]], [14, [16, 0, 6]]] },
      leg_fl: { rot: [[4, [40, 0, 10]], [6, [-20, 0, 14]], [8, [50, 0, 10]], [10, [10, 0, -4], 'L'], [12, [18, 0, -2]], [14, [10, 0, -4]]] },
      leg_hr: { rot: [[4, [-30, 0, 8]], [6, [30, 0, 12]], [8, [-40, 0, 10]], [10, [-14, 0, 4], 'L'], [12, [-22, 0, 6]], [14, [-14, 0, 4]]] },
      leg_hl: { rot: [[4, [-20, 0, 8]], [6, [40, 0, 10]], [8, [-30, 0, 8]], [10, [-10, 0, -4], 'L'], [12, [-18, 0, -2]], [14, [-10, 0, -4]]] },
      face: [[0, 1], [3, 3], [10, 2]],
    };
    // curl: it lands on its feet, the legs give, it sinks onto its belly, rolls onto its side and curls up, head tucked
    // toward its tail and the tail wrapped round, like a pet going to sleep. It stays in its own footprint.
    const curlUp = (t0, speed) => {
      const T = (t) => t0 + (t - t0) * speed;
      return {
        pelvis: { pos: [[T(t0), [0, 0, 0]], [T(t0 + 2), [0, -2, 0]], [T(t0 + 4), [0, -4.6, 0], 'L'], [T(t0 + 5), [0, -4.2, 0]], [T(t0 + 7), [0, -4.6, 0]]],
          rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [-6, 0, 0]], [T(t0 + 4), [0, 0, 0], 'L']] },
        tip_l: { rot: [[T(t0 + 7), [0, 0, 0]], [T(t0 + 9), [0, 0, 40]], [T(t0 + 10), [0, 0, 80]], [T(t0 + 11), [0, 0, 90], 'L'], [T(t0 + 13), [0, 0, 86]], [T(t0 + 15), [0, 0, 90]]] },
        head: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [-14, 0, 0]], [T(t0 + 4), [-24, 0, 0], 'L'], [T(t0 + 7), [-16, 10, 0]], [T(t0 + 11), [-20, 40, 10], 'L'], [T(t0 + 14), [-24, 56, 14]],
          [T(t0 + 18), [-26, 60, 16]]] },
        tail: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 4), [-20, 0, 0], 'L'], [T(t0 + 8), [-10, 10, 0]], [T(t0 + 11), [-6, 40, 0], 'L'], [T(t0 + 14), [-10, 60, 0]], [T(t0 + 18), [-12, 66, 0]]] },
        leg_fr: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [-30, 0, 6]], [T(t0 + 4), [-80, 0, 8], 'L'], [T(t0 + 8), [-70, 0, 6]], [T(t0 + 11), [-30, 0, 4], 'L'], [T(t0 + 14), [-40, 0, 4]]] },
        leg_fl: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [-26, 0, 6]], [T(t0 + 4), [-80, 0, 8], 'L'], [T(t0 + 8), [-70, 0, 6]], [T(t0 + 11), [-24, 0, -4], 'L'], [T(t0 + 14), [-34, 0, -4]]] },
        leg_hr: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [20, 0, 6]], [T(t0 + 4), [80, 0, 8], 'L'], [T(t0 + 8), [70, 0, 6]], [T(t0 + 11), [30, 0, 4], 'L'], [T(t0 + 14), [44, 0, 4]]] },
        leg_hl: { rot: [[T(t0), [0, 0, 0]], [T(t0 + 2), [18, 0, 6]], [T(t0 + 4), [80, 0, 8], 'L'], [T(t0 + 8), [70, 0, 6]], [T(t0 + 11), [24, 0, -4], 'L'], [T(t0 + 14), [38, 0, -4]]] },
      };
    };
    const curl = Object.assign({ setup: 'front_dead', len: 38, lie: null, down: 21, rest: 0.4, face: [[0, 1], [10, 2]] }, curlUp(10, 1));
    // the curl's first keys start at the landing: in the air it keeps hit_front's flight
    curl.tail.rot.unshift([5, [16, -10, 0]], [8, [10, 0, 0]]);
    curl.head.rot.unshift([5, [8, -2, 2]], [8, [2, -12, 0]]);
    const FLIPS = { flop: deathClip(ANIMS, 'hit_front', 3, flop), tumble: deathClip(ANIMS, 'hit_front', 3, tumble), curl: deathClip(ANIMS, 'hit_front', 3, curl) };
    ANIMS.death_front = FLIPS.curl;
    // Big: splats flat on its belly on landing, legs spread like a rug, chin down, tail flat, x x.
    const DEATHS = {
      death_big: ['hit_big', 3, {
        setup: 'front_dead', len: 34, lie: null, down: 11, rest: 0.35,
        pelvis: {
          pos: [[3, [0, 0, 0]], [7, [0, -0.5, 0]], [9, [0, -2, 0]], [10, [0, -6, 0], 'L'], [11, [0, -6.8, 0]], [13, [0, -6, 0]], [15, [0, -6.6, 0]]],
          rot: [[3, [6, 0, 0]], [7, [2, 0, -2]], [10, [0, 0, 0], 'L'], [12, [0, 0, 3]], [14, [0, 0, -1]], [16, [0, 0, 0]]],
        },
        head: { rot: [[5, [8, -20, 10]], [7, [4, 16, -8]], [9, [4, -6, 4]], [10, [-18, 0, 0], 'L'], [12, [-8, 8, 8]], [14, [-22, 4, 12]], [18, [-24, 6, 14]], [26, [-24, 6, 16]]] },
        tail: { rot: [[5, [10, 0, 0]], [9, [6, 0, 0]], [10, [-30, 0, 0], 'L'], [11, [-10, 0, 0]], [13, [-26, 0, 0]], [16, [-24, 0, 0]]] },
        leg_fr: { rot: [[5, [16, 0, 8]], [8, [10, 0, 20]], [10, [24, 0, 80], 'L'], [12, [26, 0, 72]], [14, [24, 0, 82]], [18, [24, 0, 80]]] },
        leg_fl: { rot: [[5, [8, 0, 6]], [8, [14, 0, 18]], [10, [20, 0, 78], 'L'], [12, [22, 0, 70]], [14, [20, 0, 80]], [18, [20, 0, 78]]] },
        leg_hr: { rot: [[5, [-6, 0, 6]], [8, [-10, 0, 18]], [10, [-22, 0, 78], 'L'], [12, [-24, 0, 70]], [14, [-22, 0, 80]], [18, [-22, 0, 78]]] },
        leg_hl: { rot: [[5, [-16, 0, 8]], [8, [-12, 0, 20]], [10, [-26, 0, 80], 'L'], [12, [-28, 0, 72]], [14, [-26, 0, 82]], [18, [-26, 0, 80]]] },
        face: [[0, 1], [10, 2]],
      }],
    };
    for (const [name, [base, cut, d]] of Object.entries(DEATHS)) ANIMS[name] = deathClip(ANIMS, base, cut, d);
    // No hit: it wobbles, the legs give, it lies down and curls up on its side (slower than the curl variant).
    const col = curlUp(4, 1.3);
    ANIMS.death_collapse = Object.assign({ setup: 'still', len: 44, land: -1, lie: null, down: 19, rest: 0.4, walk: [[0, 1, 'L'], [3, 0]], face: [[0, 1], [4, 2]] }, col);
    col.head.rot.unshift([0, [0, 0, 0]], [2, [-6, 8, -6]]);
    col.pelvis.rot.unshift([0, [0, 0, 0]], [2, [0, 0, 4]]);
    col.head.rot.splice(2, 1);
    col.pelvis.rot.splice(2, 1);
    return { ANIMS, DEATHS, FLIPS };
  }

  // ---------- the iron golem reactions (keyed on the golem) ----------
  // The golem never leaves the ground (knockback resistance 1), so there is no flight and no landing key (land -1): the
  // clip runs at one tick per tick from the hit. Heavy and slow: the impact holds two ticks, the body rocks on its heels or
  // toes (root turns about the edge of its feet, heel z +2 / toe z -3), steps are slow lifts and heavy plants, and every
  // plant or slam fires a `dust` event (step track, position x: 1 = feet, 2 = fists in front, 3 = the whole body landing),
  // which the mod turns into crumbs from the block underneath. Legs are 13 px from hip to sole: a leg angle a dips the hips
  // by 13 (1 - cos a). Arms are absolute from hanging (they pivot at the shoulders here; vanilla's pivot sits at the body's
  // centre, the mod turns them about the shoulder).
  function golemAnims() {
    const r2 = v => Math.round(v * 100) / 100, D = Math.PI / 180;
    const L2 = (v) => [[0, v, 'L'], [2, v, 'L']];
    // root keys from [t, rx, ry, rz, dy, flag]: rx tips it about its heels (+, z +2) or toes (-, z -3), rz about the outer
    // edge of its feet (±7.5), so that edge stays on the ground
    function stand(rows) {
      const rot = [], pos = [];
      for (const [t, rx, ry, rz, dy, f] of rows) {
        const zp = rx > 0 ? 2 : -3, xp = rz > 0 ? -7.5 : 7.5, a = rx * D, b = rz * D;
        const k = [r2(xp * (1 - Math.cos(b))), r2(zp * Math.sin(a) - xp * Math.sin(b) + (dy || 0)), r2(zp * (1 - Math.cos(a)))];
        rot.push(f ? [t, [rx, ry, rz], f] : [t, [rx, ry, rz]]);
        pos.push(f ? [t, k, f] : [t, k]);
      }
      return { rot, pos };
    }
    const shake = (t) => [[t, [0, 0, 0]], [t + 2, [0, 16, 0]], [t + 4, [0, -14, 0]], [t + 6, [0, 8, 0]], [t + 8, [0, -3, 0]], [t + 10, [0, 0, 0]]];
    const ANIMS = {};

    // Front (heavy): the blow from its right knocks the chest back and round, the arms swing out with it; it rocks back
    // onto its heels, a leg comes off the ground and plants a heavy step back (dust), the arms swing through like
    // pendulums, it rocks forward over the planted foot into a stomp (dust), settles and shakes its head.
    ANIMS.hit_front = {
      setup: 'still', len: 34, land: -1,
      root: Object.assign(stand([...L2([0, 6, 0, -0.4]).map(k => [k[0], ...k[1], 'L']), [5, 5, 8, 0, 0], [8, 7, 8, 0, 0], [10, 2, 6, 0, 0], [12, -3, 4, 0, -0.8, 'L'],
        [14, -1, 2, 0, -0.3], [16, 1, 0, 0, 0], [18, 0, 0, 0, 0]]), {
        scale: [...L2([1.02, 0.98, 1.02]), [4, [1, 1, 1]], [11, [1, 1, 1]], [12, [1.02, 0.98, 1.02], 'L'], [14, [1, 1, 1]]],
      }),
      torso: { rot: [...L2([12, 10, 5]), [4, [16, 12, 6]], [7, [10, 8, 3]], [10, [2, 4, 0]], [12, [-8, 2, 0], 'L'], [14, [-4, 0, 0]], [17, [0, 0, 0]]] },
      head: { rot: [...L2([14, 16, 8]), [3, [20, 20, 10]], [6, [10, 8, 4]], [9, [4, -6, 0]], [12, [-10, -4, 0], 'L'], [14, [-4, 0, 0]], [17, [0, 0, 0]], ...shake(20)] },
      arm_r: { rot: [...L2([24, 0, 36]), [4, [36, 0, 44]], [7, [28, 0, 30]], [10, [8, 0, 12]], [12, [-10, 0, 6], 'L'], [14, [8, 0, 4]], [16, [-4, 0, 2]], [19, [2, 0, 0]], [21, [0, 0, 0]]] },
      arm_l: { rot: [...L2([34, 12, 12]), [4, [44, 16, 16]], [7, [30, 10, 10]], [10, [6, 0, 6]], [12, [-12, 0, 4], 'L'], [14, [10, 0, 2]], [16, [-4, 0, 0]], [19, [2, 0, 0]], [21, [0, 0, 0]]] },
      leg_r: { rot: [...L2([-4, 0, 3]), [5, [-6, 0, 3]], [8, [-4, 0, 2]], [12, [-6, 0, 2], 'L'], [15, [0, 0, 0]]] },
      leg_l: { rot: [...L2([6, 0, 3]), [4, [4, 0, 3]], [6, [-10, 0, 4]], [8, [-14, 0, 3], 'L'], [10, [-6, 0, 2]], [12, [8, 0, 2], 'L'], [15, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [16, 0], [20, 1]],
      face: [[0, 1], [3, 3], [12, 1], [28, 0]],
      dust: [[0, 0], [8, 1], [9, 0], [12, 1], [13, 0]],
    };

    // Light (an uncharged swing): a small rock back and a heavy nod.
    ANIMS.hit_light = {
      setup: 'still', len: 22, land: -1,
      root: stand([...L2([0, 4, 0, 0]).map(k => [k[0], ...k[1], 'L']), [5, 4, 5, 0, 0], [8, -2, 3, 0, 0], [11, 1, 0, 0, 0], [13, 0, 0, 0, 0]]),
      torso: { rot: [...L2([8, 6, 3]), [5, [10, 6, 2]], [8, [-4, 2, 0]], [11, [2, 0, 0]], [13, [0, 0, 0]]] },
      head: { rot: [...L2([10, 12, 6]), [4, [14, 14, 6]], [7, [0, 0, 0]], [9, [-14, 0, 0]], [11, [4, 0, 0]], [13, [-4, 0, 0]], [15, [0, 0, 0]]] },
      arm_r: { rot: [...L2([14, 0, 20]), [5, [20, 0, 24]], [8, [-6, 0, 8]], [11, [4, 0, 2]], [14, [0, 0, 0]]] },
      arm_l: { rot: [...L2([20, 8, 8]), [5, [26, 10, 10]], [8, [-8, 0, 4]], [11, [4, 0, 0]], [14, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [10, 0], [14, 1]],
      face: [[0, 1], [3, 3], [8, 1], [15, 0]],
    };

    // Side (hit on its right; the mod mirrors it for the left): twisted away from the blow, bent sideways, the near arm
    // flung out and up; it tips onto the far foot's edge, braces with a wide side step of the near leg (dust), rocks back
    // upright, turns back to face the attacker and shakes its head.
    ANIMS.hit_side = {
      setup: 'still', len: 34, land: -1,
      root: stand([...L2([0, 14, 6, -0.3]).map(k => [k[0], ...k[1], 'L']), [5, 0, 22, 8, 0], [8, 0, 24, 5, 0], [10, 0, 22, -3, -0.6, 'L'], [13, 0, 16, 1, 0], [16, 0, 8, 0, 0],
        [19, 0, 0, 0, 0]]),
      torso: { rot: [...L2([2, 14, 12]), [4, [4, 18, 16]], [7, [2, 12, 10]], [10, [0, 4, -4], 'L'], [13, [0, 2, 2]], [16, [0, 0, 0]]] },
      head: { rot: [...L2([6, 30, 14]), [3, [8, 38, 18]], [6, [4, 20, 8]], [9, [0, -6, 0]], [11, [-4, -14, -4]], [14, [0, -8, 0]], [17, [0, 0, 0]], ...shake(20)] },
      arm_r: { rot: [...L2([10, 0, 56]), [4, [14, 0, 70]], [7, [10, 0, 50]], [10, [0, 0, 14], 'L'], [12, [4, 0, 22]], [14, [0, 0, 8]], [17, [0, 0, 2]], [20, [0, 0, 0]]] },
      arm_l: { rot: [...L2([30, 24, -4]), [4, [36, 30, 0]], [7, [24, 14, 6]], [10, [4, 0, 8], 'L'], [12, [8, 0, 4]], [15, [0, 0, 0]]] },
      leg_r: { rot: [...L2([0, 0, 8]), [5, [4, 0, 20]], [8, [0, 0, 24]], [10, [0, 0, 16], 'L'], [13, [0, 0, 8]], [16, [0, 0, 0]]] },
      leg_l: { rot: [...L2([0, 0, 2]), [5, [0, 0, -4]], [10, [0, 0, 4], 'L'], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [16, 0], [20, 1]],
      face: [[0, 1], [3, 3], [10, 1], [28, 0]],
      dust: [[0, 0], [10, 1], [11, 0]],
    };

    // Back: shoved from behind, it lurches forward onto its toes, chest and head snapped back, arms swung back; a heavy
    // stumbling step forward (dust), it rocks back upright, turns its head to look over its shoulder (surprised) and back.
    ANIMS.hit_back = {
      setup: 'still', len: 34, land: -1,
      root: stand([...L2([-5, -3, 0, -0.3]).map(k => [k[0], ...k[1], 'L']), [5, -8, -4, 0, 0], [8, -6, -4, 0, 0], [10, -1, -2, 0, -0.8, 'L'], [12, 2, 0, 0, -0.3], [15, 0, 0, 0, 0]]),
      pelvis: { rot: [...L2([-4, 0, 0]), [5, [-6, 0, 0]], [10, [0, 0, 0], 'L']] },
      torso: { rot: [...L2([14, 0, -2]), [4, [18, 0, -2]], [7, [4, 0, 0]], [10, [-10, 0, 0], 'L'], [12, [-4, 0, 0]], [15, [0, 0, 0]]] },
      head: { rot: [...L2([20, -4, -2]), [3, [26, -6, -2]], [6, [6, 0, 0]], [10, [-12, 0, 0], 'L'], [12, [-2, 0, 0]], [15, [0, 30, 0]], [18, [0, 52, 0]], [22, [0, 50, 0]],
        [25, [0, 20, 0]], [28, [0, 0, 0]]] },
      arm_r: { rot: [...L2([-30, 0, 14]), [4, [-40, 0, 16]], [7, [-18, 0, 10]], [10, [20, 0, 6], 'L'], [12, [4, 0, 4]], [14, [10, 0, 2]], [17, [0, 0, 0]]] },
      arm_l: { rot: [...L2([-26, 0, 12]), [4, [-36, 0, 14]], [7, [-14, 0, 8]], [10, [22, 0, 6], 'L'], [12, [6, 0, 4]], [14, [10, 0, 2]], [17, [0, 0, 0]]] },
      leg_r: { rot: [...L2([-6, 0, 2]), [5, [4, 0, 2]], [8, [22, 0, 2]], [10, [18, 0, 2], 'L'], [13, [6, 0, 0]], [16, [0, 0, 0]]] },
      leg_l: { rot: [...L2([-10, 0, 2]), [5, [-12, 0, 2]], [10, [-14, 0, 2], 'L'], [13, [-4, 0, 0]], [16, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [16, 0], [20, 1]],
      face: [[0, 1], [3, 1], [15, 3], [26, 0]],
      dust: [[0, 0], [10, 1], [11, 0]],
    };

    // Big (crits and sprint hits): a bigger front hit, 0.10.5 (the user disliked the squat and fist slam: "the legs go
    // weird"). The chest is hurled back and the arms fly out wide; it rocks far back onto its heels, its left leg comes off
    // the ground and plants a very heavy step back (dust), then it lunges forward over both feet into a hard stomp (dust)
    // with the arms swinging through like pendulums, wobbles dazed (x x), settles and shakes its head.
    ANIMS.hit_big = {
      setup: 'still', len: 44, land: -1,
      root: Object.assign(stand([...L2([0, 8, 0, -1.4]).map(k => [k[0], ...k[1], 'L']), [4, 8, 10, 0, -1.0], [6, 13, 12, 0, -0.6], [9, 14, 12, 0, 0], [11, 6, 8, 0, 0],
        [12, -8, 6, 0, -2.0, 'L'], [14, -3, 4, 0, -0.8], [17, 4, 2, 0, -0.3], [20, 0, 0, 0, 0]]), {
        scale: [...L2([1.03, 0.96, 1.03]), [4, [1, 1, 1]], [11, [1, 1, 1]], [12, [1.03, 0.96, 1.03], 'L'], [14, [1, 1, 1]]],
      }),
      torso: { rot: [...L2([18, 12, 6]), [4, [30, 16, 8]], [8, [24, 10, 4]], [11, [6, 4, 0]], [12, [-16, 0, 0], 'L'], [14, [-8, 0, 0]], [17, [2, 0, 0]], [20, [0, 0, 0]]] },
      head: { rot: [...L2([22, 20, 10]), [3, [30, 26, 12]], [6, [12, 10, 4]], [9, [6, -8, 0]], [12, [-18, -6, 0], 'L'], [14, [-8, 10, 6]], [17, [6, -10, -6]], [20, [2, 8, 4]],
        [23, [4, -6, -3]], [26, [0, 0, 0]], ...shake(28)] },
      arm_r: { rot: [...L2([30, 0, 44]), [4, [44, 0, 64]], [7, [36, 0, 50]], [10, [12, 0, 24]], [12, [-16, 0, 10], 'L'], [14, [12, 0, 6]], [16, [-6, 0, 3]], [19, [3, 0, 0]], [22, [0, 0, 0]]] },
      arm_l: { rot: [...L2([40, 10, 30]), [4, [52, 12, 50]], [7, [40, 8, 36]], [10, [10, 0, 14]], [12, [-18, 0, 8], 'L'], [14, [14, 0, 4]], [16, [-6, 0, 2]], [19, [3, 0, 0]], [22, [0, 0, 0]]] },
      leg_r: { rot: [...L2([-6, 0, 3]), [6, [-8, 0, 3]], [10, [-6, 0, 3]], [12, [12, 0, 3], 'L'], [15, [0, 0, 0]]] },
      leg_l: { rot: [...L2([8, 0, 3]), [4, [14, 0, 4]], [6, [-14, 0, 4]], [9, [-22, 0, 3], 'L'], [11, [-10, 0, 3]], [12, [12, 0, 3], 'L'], [15, [0, 0, 0]]] },
      walk: [[0, 0, 'L'], [20, 0], [24, 1]],
      face: [[0, 1], [3, 3], [12, 2], [26, 1], [34, 0]],
      dust: [[0, 0], [9, 1], [10, 0], [12, 1], [13, 0]],
    };

    // Deaths: three front variants were filmed (FLIPS, IG.flip(v)); the user picked tower (2026-09-28). Pivoting on its
    // heels would lay it all behind its feet, away from its position (a burning golem's flames stayed standing at its feet),
    // so it also slides 21 px forward as it falls and lands centred on its spot (0.10.3). tower: it rocks once, then tips back stiff over its heels like a
    // falling tower and slams flat on its back (dust 3); the arms flop out, the feet bounce. Lying on its back the body's back
    // (5 px behind the leg line) would sink 3 px: the root lifts 3.
    // rows [t, rx, ry, dy, (dz), (flag)]: dz slides it along z (px)
    function topple(rows, zp) {
      const rot = [], pos = [];
      for (const row of rows) {
        const [t, rx, ry, dy] = row, f = typeof row[row.length - 1] === 'string' ? row[row.length - 1] : undefined, dz = typeof row[4] === 'number' ? row[4] : 0;
        const a = rx * D, k = [0, r2(zp * Math.sin(a) + dy), r2(zp * (1 - Math.cos(a)) + dz)];
        rot.push(f ? [t, [rx, ry, 0], f] : [t, [rx, ry, 0]]);
        pos.push(f ? [t, k, f] : [t, k]);
      }
      return { rot, pos };
    }
    const tower = {
      setup: 'still', len: 44, lie: [0, 1], down: 19, rest: 0.8,
      root: topple([[4, 6, 6, 0], [7, -2, 6, 0], [10, 4, 8, 0], [12, 14, 8, 0, -1], [14, 30, 8, 0.5, -4], [16, 52, 8, 1.2, -10], [18, 80, 8, 2.4, -17], [19, 90, 8, 3, -21, 'L'],
        [21, 86, 8, 2.8, -21], [23, 90, 8, 3, -21]], 2),
      torso: { rot: [[4, [8, 4, 0]], [8, [0, 0, 0]], [18, [-3, 0, 0]], [19, [0, 0, 0], 'L'], [21, [-4, 0, 0]], [23, [0, 0, 0]]] },
      head: { rot: [[4, [10, 4, 0]], [9, [-4, 0, 0]], [14, [-10, 0, 0]], [19, [-16, 0, 0], 'L'], [21, [-18, -16, 0]], [24, [-14, 28, 0]], [30, [-14, 30, 4]]] },
      arm_r: { rot: [[4, [10, 0, 8]], [10, [4, 0, 6]], [14, [30, 0, 14]], [17, [60, 0, 20]], [19, [20, 0, 60], 'L'], [21, [8, 0, 76]], [23, [2, 0, 70]], [26, [4, 0, 72]]] },
      arm_l: { rot: [[4, [12, 0, 8]], [10, [6, 0, 6]], [14, [34, 0, 12]], [17, [64, 0, 18]], [19, [24, 0, 50], 'L'], [21, [10, 0, 64]], [23, [2, 0, 58]], [26, [4, 0, 60]]] },
      leg_r: { rot: [[4, [0, 0, 2]], [18, [0, 0, 3]], [19, [4, 0, 4], 'L'], [20, [18, 0, 5]], [22, [4, 0, 5]], [24, [8, 0, 5]], [26, [5, 0, 5]]] },
      leg_l: { rot: [[4, [0, 0, 2]], [18, [0, 0, 3]], [19, [4, 0, 4], 'L'], [20, [14, 0, 5]], [22, [3, 0, 5]], [24, [6, 0, 5]], [26, [4, 0, 5]]] },
      face: [[0, 1], [3, 3], [19, 2]],
      dust: [[0, 0], [19, 3], [20, 0]],
    };
    // crumble: the legs give way, it sits down hard (dust), sways sitting, then tips back flat onto its back (dust).
    const crumble = {
      setup: 'still', len: 46, lie: [0, 1], down: 22, rest: 0.8,
      root: { pos: [[3, [0, 0, 0]], [6, [0, -2, 0]], [9, [0, -8, 0]], [11, [0, -10.5, 0], 'L'], [13, [0, -9.8, 0]], [15, [0, -10.5, 0]]] },
      pelvis: { rot: [[11, [0, 0, 0]], [13, [0, 0, 3]], [16, [0, 0, -2]], [18, [6, 0, 0]], [20, [40, 0, 0]], [22, [80, 0, 0]], [23, [90, 0, 0], 'L'], [25, [86, 0, 0]], [27, [90, 0, 0]]],
        pos: [[18, [0, 0, 0]], [23, [0, -1, 0], 'L']] },
      torso: { rot: [[3, [6, 0, 0]], [9, [-10, 0, 0]], [11, [-16, 0, 0], 'L'], [13, [-8, 0, 2]], [16, [-10, 0, -2]], [18, [-6, 0, 0]], [23, [0, 0, 0], 'L'], [25, [-4, 0, 0]], [27, [0, 0, 0]]] },
      head: { rot: [[3, [10, 4, 0]], [9, [-8, 0, 0]], [11, [-16, 0, 0], 'L'], [13, [4, 8, 6]], [16, [-4, -6, -6]], [19, [4, 0, 0]], [23, [-16, 0, 0], 'L'], [25, [-18, 20, 0]],
        [30, [-14, 30, 4]]] },
      arm_r: { rot: [[3, [10, 0, 10]], [9, [20, 0, 24]], [11, [4, 0, 30], 'L'], [14, [6, 0, 20]], [18, [10, 0, 16]], [21, [50, 0, 20]], [23, [16, 0, 64], 'L'], [25, [4, 0, 74]], [28, [2, 0, 70]]] },
      arm_l: { rot: [[3, [12, 0, 10]], [9, [22, 0, 22]], [11, [6, 0, 28], 'L'], [14, [8, 0, 18]], [18, [12, 0, 14]], [21, [54, 0, 18]], [23, [18, 0, 54], 'L'], [25, [4, 0, 62]], [28, [2, 0, 58]]] },
      leg_r: { rot: [[3, [0, 0, 4]], [6, [20, 0, 10]], [9, [60, 0, 12]], [11, [82, 0, 12], 'L'], [13, [78, 0, 12]], [15, [82, 0, 12]]] },
      leg_l: { rot: [[3, [0, 0, 4]], [6, [18, 0, 10]], [9, [58, 0, 12]], [11, [80, 0, 12], 'L'], [13, [76, 0, 12]], [15, [80, 0, 12]]] },
      face: [[0, 1], [3, 3], [11, 2]],
      dust: [[0, 0], [11, 1], [12, 0], [23, 3], [24, 0]],
    };
    // face-plant: it staggers a step forward (dust), teeters on its toes and falls forward stiff onto its face toward the
    // attacker (dust), arms flung forward over its head.
    const plant = {
      setup: 'still', len: 44, lie: [0, -1], down: 20, rest: 0.8,
      root: topple([[4, -4, 4, 0], [8, -6, 4, -0.6], [10, -4, 4, 0], [12, -12, 4, 0], [14, -26, 4, 0], [16, -46, 4, 0.8], [18, -72, 4, 2], [20, -90, 4, 3, 'L'], [22, -86, 4, 2.8],
        [24, -90, 4, 3]], -3),
      torso: { rot: [[4, [-8, 0, 0]], [8, [4, 0, 0]], [12, [-4, 0, 0]], [20, [0, 0, 0], 'L'], [22, [4, 0, 0]], [24, [0, 0, 0]]] },
      head: { rot: [[4, [-10, 0, 0]], [8, [6, 0, 0]], [14, [14, 0, 0]], [20, [20, 0, 0], 'L'], [22, [18, 20, 0]], [26, [16, 34, 0]], [32, [16, 36, 0]]] },
      arm_r: { rot: [[4, [-10, 0, 8]], [8, [20, 0, 10]], [12, [40, 0, 12]], [16, [110, 0, 20]], [20, [170, 0, 30], 'L'], [22, [176, 0, 34]], [24, [172, 0, 32]]] },
      arm_l: { rot: [[4, [-8, 0, 8]], [8, [18, 0, 10]], [12, [44, 0, 10]], [16, [116, 0, 18]], [20, [172, 0, 24], 'L'], [22, [178, 0, 28]], [24, [174, 0, 26]]] },
      leg_r: { rot: [[4, [4, 0, 2]], [6, [16, 0, 2]], [8, [10, 0, 2], 'L'], [12, [4, 0, 2]], [20, [0, 0, 3], 'L'], [21, [-16, 0, 4]], [23, [-4, 0, 4]], [25, [-8, 0, 4]]] },
      leg_l: { rot: [[4, [-4, 0, 2]], [8, [-6, 0, 2]], [12, [-2, 0, 2]], [20, [0, 0, 3], 'L'], [21, [-12, 0, 4]], [23, [-2, 0, 4]], [25, [-6, 0, 4]]] },
      face: [[0, 1], [3, 3], [20, 2]],
      dust: [[0, 0], [8, 1], [9, 0], [20, 3], [21, 0]],
    };
    const FLIPS = { tower: deathClip(ANIMS, 'hit_front', 2, tower), crumble: deathClip(ANIMS, 'hit_front', 2, crumble), plant: deathClip(ANIMS, 'hit_front', 2, plant) };
    for (const [n, d] of Object.entries({ tower, crumble, plant })) FLIPS[n].dust = d.dust;
    ANIMS.death_front = FLIPS.tower;
    // Big and no hit: both topple back over the heels like the tower (the user disliked the splits these used to end in,
    // 2026-09-28). shifted(d, dt) is a copy of a death's keys dt ticks later (the tower's first keys are at tick 4).
    const shifted = (d, dt) => {
      const o = JSON.parse(JSON.stringify(d));
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) v.forEach(k => { k[0] += dt; });
        else if (v && typeof v === 'object') for (const ch of Object.values(v)) if (Array.isArray(ch)) ch.forEach(k => { k[0] += dt; });
      }
      o.down += dt;
      o.len += dt;
      return o;
    };
    // Big: the blow throws it back onto its heels (hit_big up to tick 6), and it topples back from there.
    const big = Object.assign(shifted(tower, 6), { face: [[0, 1], [3, 3], [6, 2]] });
    big.dust = [[0, 0], [25, 3], [26, 0]];
    ANIMS.death_big = deathClip(ANIMS, 'hit_big', 6, big);
    ANIMS.death_big.dust = big.dust;
    // No hit: it creaks (small twitches) and topples back.
    const col = shifted(tower, 2);
    col.root.rot.unshift([0, [0, 0, 0]], [3, [0, 0, 2]]);
    col.root.pos.unshift([0, [0, 0, 0]], [3, [0, 0, 0]]);
    col.torso.rot.unshift([0, [0, 0, 0]], [3, [-6, 0, 3]]);
    col.head.rot.unshift([0, [0, 0, 0]], [3, [-8, 8, 4]]);
    col.arm_r.rot.unshift([0, [0, 0, 0]], [3, [8, 0, 10]]);
    col.arm_l.rot.unshift([0, [0, 0, 0]], [3, [8, 0, 10]]);
    col.leg_r.rot.unshift([0, [0, 0, 0]]);
    col.leg_l.rot.unshift([0, [0, 0, 0]]);
    ANIMS.death_collapse = Object.assign(col, { land: -1, walk: [[0, 1, 'L'], [3, 0]], face: [[0, 1], [3, 3], [21, 2]] });
    // Without room to fall back (a wall behind it): it sits down hard in its own footprint, legs out in front, and slumps
    // forward over them. The mod plays it instead of any golem death that can't lie down.
    ANIMS.death_slump = {
      setup: 'still', len: 40, land: -1, lie: null, down: 11, rest: 1.2,
      root: { pos: [[0, [0, 0, 0]], [3, [0, 0, 0]], [6, [0, -2, 0]], [9, [0, -8, 0]], [11, [0, -10.5, 0], 'L'], [13, [0, -9.8, 0]], [15, [0, -10.5, 0]]] },
      torso: { rot: [[0, [0, 0, 0]], [3, [6, 0, 0]], [9, [-10, 0, 0]], [11, [-16, 0, 0], 'L'], [14, [-24, 0, 2]], [18, [-40, 0, 3]], [22, [-44, 0, 4]]] },
      head: { rot: [[0, [0, 0, 0]], [3, [10, 4, 0]], [9, [-8, 0, 0]], [11, [-16, 0, 0], 'L'], [14, [4, 8, 6]], [18, [-14, 6, 12]], [24, [-16, 6, 14]]] },
      arm_r: { rot: [[0, [0, 0, 0]], [3, [10, 0, 10]], [9, [20, 0, 24]], [11, [4, 0, 30], 'L'], [14, [20, 0, 16]], [18, [40, 0, 10]], [24, [44, 0, 10]]] },
      arm_l: { rot: [[0, [0, 0, 0]], [3, [12, 0, 10]], [9, [22, 0, 22]], [11, [6, 0, 28], 'L'], [14, [22, 0, 14]], [18, [42, 0, 8]], [24, [46, 0, 8]]] },
      leg_r: { rot: [[0, [0, 0, 0]], [3, [0, 0, 4]], [6, [20, 0, 10]], [9, [60, 0, 12]], [11, [82, 0, 12], 'L'], [13, [78, 0, 12]], [15, [82, 0, 12]]] },
      leg_l: { rot: [[0, [0, 0, 0]], [3, [0, 0, 4]], [6, [18, 0, 10]], [9, [58, 0, 12]], [11, [80, 0, 12], 'L'], [13, [76, 0, 12]], [15, [80, 0, 12]]] },
      walk: [[0, 1, 'L'], [3, 0]],
      face: [[0, 1], [3, 3], [11, 2]],
      dust: [[0, 0], [11, 1], [12, 0]],
    };
    return { ANIMS, FLIPS };
  }

  const { ANIMS, DEATHS, FLIPS } = V ? villagerAnims() : Q ? quadrupedAnims() : S ? spiderAnims() : C ? creeperAnims() : E ? endermanAnims() : P ? petAnims() : IG ? golemAnims() : humanoidAnims();

  // ---------- write keys ----------
  function conv(bone, v) {
    if (/^leg_r\d$/.test(bone)) return [v[2], v[1], v[0]];
    if (/^leg_l\d$/.test(bone)) return [v[2], -v[1], -v[0]];
    // tail: lift up is a negative x turn of the backward-hanging tail, a wag to its left a negative y turn
    if (bone === 'tail') return [-v[0], -v[1], v[2]];
    if (bone === 'arm_r') return [v[0] - ARM_REST[0], v[1] - ARM_REST[1], v[2]];
    if (bone === 'arm_l') return [v[0] - ARM_REST[0], -(v[1] - ARM_REST[1]), -v[2]];
    if (bone === 'leg_r' || bone === 'leg_fr' || bone === 'leg_hr') return [v[0], -v[1], v[2]];
    if (bone === 'leg_l' || bone === 'leg_fl' || bone === 'leg_hl') return [v[0], v[1], -v[2]];
    return v;
  }
  function track(A, bone, ch, keys, stepAll) {
    const ba = A.getBoneAnimator(G[bone]);
    const interp = keys.map(k => (stepAll || k[2] === 'S' ? 'step' : 'catmullrom'));
    keys.forEach((k, i) => { if (k[2] === 'L') { interp[i] = 'linear'; if (i > 0 && interp[i - 1] !== 'step') interp[i - 1] = 'linear'; } });
    keys.forEach((k, i) => {
      const v = typeof k[1] === 'number' ? (ch === 'scale' ? [k[1], k[1], k[1]] : [k[1], 0, 0]) : k[1];
      const [x, y, z] = ch === 'rotation' ? conv(bone, v) : v;
      ba.addKeyframe({ channel: ch, time: k[0] / FPS, interpolation: interp[i], data_points: [{ x, y, z }] });
    });
  }
  function animate(name) {
    ensure();
    Animation.all.filter(a => a.name === name).forEach(a => a.remove(false));
    const d = ANIMS[name];
    const A = new Animation({ name, length: d.len / FPS, loop: 'once', snapping: FPS }).add(false);
    for (const b of BONES) {
      const t = d[b];
      if (!t || !G[b]) continue;
      if (t.rot) track(A, b, 'rotation', t.rot);
      if (t.pos) track(A, b, 'position', t.pos);
      if (t.scale) track(A, b, 'scale', t.scale);
    }
    if (d.walk) track(A, 'walk', 'scale', d.walk);
    if (d.face) track(A, 'face', 'position', d.face, true);
    if (d.cross && G.cross) track(A, 'cross', 'position', d.cross, true);
    if (d.dust && G.dust) track(A, 'dust', 'position', d.dust, true);
    return name + ': ' + d.len + ' ticks';
  }
  function animateAll() { return Object.keys(ANIMS).map(animate).join('; '); }
  function save() {
    ensure();
    fs.writeFileSync(DIR + NAME + '.bbmodel', Codecs.project.compile());
    return 'saved ' + NAME + '.bbmodel';
  }

  // ---------- export for the mod: the Blockbench keys as they are (Blockbench units), plus reference samples ----------
  const CHANNELS = { rotation: 'rot', position: 'pos', scale: 'scale' };
  function exportClips() {
    ensure();
    if (!fs.existsSync(CLIPS)) fs.mkdirSync(CLIPS, { recursive: true });
    const refDir = OUT + 'reference/';
    if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
    const out = [];
    for (const A of Animation.all) {
      const clip = clipJson(A);
      const ref = { name: A.name, samples: [] };
      // Blockbench's own interpolation at off-tick times, for the mod's unit test
      A.select();
      for (let t = 0; t <= clip.length; t += 0.37) {
        Timeline.setTime(t / FPS);
        const s = { t: Math.round(t * 1000) / 1000 };
        for (const [bone, chans] of Object.entries(clip.bones)) {
          const ba = A.animators[G[bone].uuid];
          for (const ch of Object.keys(CHANNELS)) if (chans[CHANNELS[ch]]) s[bone + '.' + CHANNELS[ch]] = ba.interpolate(ch).map(v => +(+v).toFixed(4));
        }
        ref.samples.push(s);
      }
      fs.writeFileSync(CLIPS + A.name + '.json', JSON.stringify(clip, null, 1));
      fs.writeFileSync(refDir + A.name + '.json', JSON.stringify(ref));
      out.push(A.name);
    }
    return 'exported ' + out.join(', ');
  }
  function clipJson(A) {
    const clip = { name: A.name, length: Math.round(A.length * FPS), land: ANIMS[A.name].land, bones: {} };
    for (const k of ['lie', 'down', 'rest']) if (ANIMS[A.name][k] != null) clip[k] = ANIMS[A.name][k];
    for (const g of Group.all) {
      const ba = A.animators[g.uuid];
      if (!ba) continue;
      const b = {};
      for (const [ch, key] of Object.entries(CHANNELS)) {
        const kfs = (ba[ch] || []).slice().sort((p, q) => p.time - q.time);
        if (!kfs.length) continue;
        b[key] = kfs.map(k => ({ t: Math.round(k.time * FPS * 1000) / 1000, v: ['x', 'y', 'z'].map(a => +k.calc(a).toFixed(4)), i: k.interpolation }));
      }
      if (Object.keys(b).length) clip.bones[g.name] = b;
    }
    return clip;
  }

  // Dev review (dev/demo/run.sh CLIPS=<dir>): writes the named clips as they are animated now into <dir>, where the
  // mod's dev override picks them up instead of the bundled ones, e.g. to film a tweak before exporting it.
  function exportTo(dir, names) {
    ensure();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const n of names) fs.writeFileSync(dir + '/' + n + '.json', JSON.stringify(clipJson(Animation.all.find(a => a.name === n)), null, 1));
    return 'wrote ' + names.join(', ') + ' to ' + dir;
  }

  // ---------- posing (preview mirrors what the mod does: vanilla pose + keys) ----------
  const obj = g => g.scene_object || g.mesh;
  function play(A, t) {
    Animator.animations.forEach(a => { a.playing = a === A; });
    if (Animation.selected !== A) A.select();
    Timeline.setTime(t / FPS);
    Animator.preview();
  }
  // vanilla walk (HumanoidModel legs + AnimationUtils.bobArms; the villager-like models swing their legs half as far and
  // don't bob their arms); `weight` = the clip's walk track
  function walkPose(w, age, weight, calm) {
    const leg = Math.cos(w.pos * 0.6662) * 1.4 * w.spd * weight * (V ? 0.5 : 1);
    if (S) {
      // SpiderModel: every leg swings (yRot) and steps (zRot) on its own phase; here in Blockbench space (yRot negated)
      const p = w.pos * 0.6662, sp = w.spd * weight;
      [['r4', 0], ['r3', Math.PI], ['r2', Math.PI / 2], ['r1', Math.PI * 1.5]].forEach(([n, ph]) => {
        const swing = -Math.cos(p * 2 + ph) * 0.4 * sp, step = Math.abs(Math.sin(p + ph) * 0.4) * sp, l = 'leg_l' + n.slice(1);
        obj(G['leg_' + n]).rotation.y -= swing; obj(G[l]).rotation.y += swing;
        obj(G['leg_' + n]).rotation.z += step; obj(G[l]).rotation.z -= step;
      });
      return;
    }
    if (Q || C || P) {
      // QuadrupedModel, CreeperModel and the pets: diagonal pairs swing together
      obj(G.leg_hr).rotation.x -= leg; obj(G.leg_fl).rotation.x -= leg;
      obj(G.leg_hl).rotation.x += leg; obj(G.leg_fr).rotation.x += leg;
      return;
    }
    if (E) {
      // EndermanModel: HumanoidModel's swing halved and clamped to ±0.4 rad, legs and arms
      const l = Math.max(-0.4, Math.min(0.4, leg * 0.5)), a = Math.max(-0.4, Math.min(0.4, -leg * 0.5 * (w.spd > 0 ? 1 : 0)));
      obj(G.leg_r).rotation.x -= l; obj(G.leg_l).rotation.x += l;
      if (calm) return;
      obj(G.arm_r).rotation.x -= a; obj(G.arm_l).rotation.x += a;
      return;
    }
    obj(G.leg_r).rotation.x -= leg;
    obj(G.leg_l).rotation.x += leg;
    if (calm || V) return; // the mod drops vanilla's arm bob and head look during a death
    const bz = Math.cos(age * 0.09) * 0.05 + 0.05, bx = Math.sin(age * 0.067) * 0.05;
    obj(G.arm_r).rotation.z += bz; obj(G.arm_l).rotation.z -= bz;
    obj(G.arm_r).rotation.x -= bx; obj(G.arm_l).rotation.x += bx;
  }
  const lerp = (a, b, u) => a + (b - a) * u;
  // frame plan: PRE ticks walking in, the reaction, POST ticks of vanilla; SUB frames per tick. Carrier position and
  // walk state are per tick like the game, and interpolated between ticks like the client does.
  const PRE = 8, POST = 8;
  function plan(name, sub) {
    sub = sub || SUB;
    const d = ANIMS[name], S = SETUPS[d.setup], tr = S.track(), yaw = S.yaw * Math.PI / 180;
    const ticks = [];
    const w = { pos: 0, spd: 0 };
    let prev = null;
    for (let f = -PRE; f <= d.len + POST; f++) {
      const c = tr(f), [lx, , lz] = c.l;
      const p = [lx * Math.cos(yaw) + lz * Math.sin(yaw), c.up, -lx * Math.sin(yaw) + lz * Math.cos(yaw)];
      const dist = prev ? Math.hypot(p[0] - prev[0], p[2] - prev[2]) : WALK;
      w.spd += (Math.min(dist * 4, 1) - w.spd) * 0.4;
      w.pos += w.spd;
      ticks.push({ f, p, pos: w.pos, spd: w.spd });
      prev = p;
    }
    const frames = [], n = Math.round((PRE + d.len + POST) * sub);
    for (let i = 0; i < n; i++) {
      const tt = i / sub - PRE, k = Math.floor(tt + PRE), u = tt + PRE - k;
      const a = ticks[k], b = ticks[Math.min(k + 1, ticks.length - 1)];
      frames.push({
        t: tt, yaw: S.yaw, p: [0, 1, 2].map(j => lerp(a.p[j], b.p[j], u)),
        walk: { pos: lerp(a.pos, b.pos, u), spd: lerp(a.spd, b.spd, u) },
        react: tt >= 0 && tt < d.len, hurt: tt >= 0 && tt < (d.land > 0 ? d.land : 10),
        death: name.startsWith('death_'), gone: name.startsWith('death_') && tt >= d.len,
      });
    }
    return frames;
  }
  function pose(name, fr) {
    const A = Animation.all.find(a => a.name === name);
    if (fr.react) play(A, fr.t);
    else { Animator.animations.forEach(a => { a.playing = false; }); Animator.showDefaultPose(); }
    const weight = fr.react ? obj(G.walk).scale.x : 1;
    const face = fr.react ? Math.round(obj(G.face).position.x) : 0;
    HEADS.forEach((c, i) => { if (c.mesh) c.mesh.visible = i === face; });
    if (V && G.arm_r) {
      // an illager whose vanilla pose is crossed shows its separate arms from the hit until the clip crosses them again
      const apart = fr.react && Math.round(obj(G.cross).position.x) === 0;
      obj(G.arm_r).visible = apart; obj(G.arm_l).visible = apart; obj(G.arms).visible = !apart;
    }
    const c = obj(G.carrier);
    c.position.set(fr.p[0] * PX, fr.p[1] * PX, fr.p[2] * PX);
    c.rotation.set(0, fr.yaw * Math.PI / 180, 0);
    c.visible = !fr.gone; // after a death clip the mod plays the vanilla poof
    walkPose(fr.walk, fr.t + PRE, weight, fr.death && fr.react);
    scene.updateMatrixWorld(true);
  }

  // ---------- preview scene (ground and shadow) ----------
  let RR = null, EXTRA = null;
  function pixTex(size, draw) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const cx = cv.getContext('2d'); draw(cx, size);
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }
  function makeExtras() {
    const root = new THREE.Group(); root.name = 'zh_extras';
    const N = 48;
    const ground = pixTex(N * 16, (cx, s) => {
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const pal = ['#5d9a3a', '#64a33f', '#598f37', '#6aaa45', '#5f9d3c'];
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { cx.fillStyle = pal[Math.floor(rnd() * pal.length)]; cx.fillRect(x, y, 1, 1); }
      cx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i <= N; i++) { cx.fillRect(i * 16, 0, 1, s); cx.fillRect(0, i * 16, s, 1); }
    });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(N * PX, N * PX), new THREE.MeshBasicMaterial({ map: ground }));
    gm.rotation.x = -Math.PI / 2; root.add(gm);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.1; root.add(sh);
    EXTRA = { root, ground: gm, shadow: sh };
  }
  function placeExtras(fr) {
    EXTRA.shadow.visible = !fr.gone;
    EXTRA.shadow.position.set(fr.p[0] * PX, 0.1, fr.p[2] * PX);
    EXTRA.shadow.material.opacity = 0.42 * Math.max(0.25, 1 - fr.p[1] / 1.6);
  }

  // ---------- render ----------
  // camera looks from the attacker's side (-z), front-left and a bit above, framing the whole path of the clip
  const VIEW = { dir: [-0.62, 0.2, -0.7], fov: 30, res: 480 };
  function camFor(name) {
    const fr = plan(name), xs = fr.map(q => q.p[0]), zs = fr.map(q => q.p[2]), up = Math.max(...fr.map(q => q.p[1]));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.8 + (E ? 3.8 : 2.6) + up * 0.6;
    const dist = span * PX / 2 / Math.tan(VIEW.fov * Math.PI / 360);
    const n = Math.hypot(...VIEW.dir), t = [cx * PX, CAM_Y + up * 7, cz * PX];
    return { fov: VIEW.fov, res: VIEW.res, target: t, pos: VIEW.dir.map((v, i) => t[i] + v / n * dist) };
  }
  function snap(file, opt, withScene) {
    if (!RR) RR = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true, antialias: false });
    RR.setSize(opt.res, opt.res);
    RR.setClearColor(0x8fc0ec, withScene ? 1 : 0);
    const cam = new THREE.PerspectiveCamera(opt.fov, 1, 1, 4000);
    cam.position.set(...opt.pos); cam.lookAt(new THREE.Vector3(...opt.target));
    const hidden = scene.children.filter(c => c !== Project.model_3d && c.visible && c.name !== 'lights' && c !== EXTRA.root);
    hidden.forEach(c => { c.visible = false; });
    EXTRA.root.visible = withScene;
    RR.render(scene, cam);
    hidden.forEach(c => { c.visible = true; });
    fs.writeFileSync(file, Buffer.from(RR.domElement.toDataURL('image/png').split(',')[1], 'base64'));
  }
  function render(name, opt) {
    ensure();
    lock(180000);
    try {
      if (!EXTRA) makeExtras();
      if (EXTRA.root.parent !== scene) scene.add(EXTRA.root);
      opt = Object.assign(camFor(name), opt || {});
      // overwrite in place: a folder removed and recreated from the flatpak Blockbench gets deleted again moments later
      const dir = OUT + 'frames/' + name + '/';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const frames = plan(name);
      frames.forEach((fr, i) => {
        pose(name, fr);
        placeExtras(fr);
        const id = String(i).padStart(3, '0');
        snap(dir + 'f' + id + '.png', opt, true);
        if (fr.hurt) snap(dir + 'm' + id + '.png', opt, false);
      });
      const d = ANIMS[name];
      fs.writeFileSync(dir + 'meta.json', JSON.stringify({ name, pre: PRE, len: d.len, post: POST, sub: SUB, n: frames.length,
        ticks: frames.map(fr => Math.round(fr.t * 100) / 100), hurt: frames.map((fr, i) => (fr.hurt ? i : -1)).filter(i => i >= 0) }));
      scene.remove(EXTRA.root);
      HEADS.forEach((c, i) => { if (c.mesh) c.mesh.visible = i === 0; });
      obj(G.carrier).visible = true;
      Animator.showDefaultPose();
      return `rendered ${name}: ${frames.length} frames`;
    } finally { unlock(); }
  }
  function renderAll() { return Object.keys(ANIMS).map(n => render(n)).join('; '); }
  // close-up stills for checking poses: ticks of one clip from a view direction ([x, y, z] from the zombie, rig space)
  // -> dev/anim/hits/stills/<name>_<view>_<tick>.png, then: python3 dev/anim/stills.py <name>
  function stills(name, ticks, views, opt) {
    opt = Object.assign({ y: 6, dist: 70 }, opt || {});
    ensure();
    lock(120000);
    try {
      if (!EXTRA) makeExtras();
      if (EXTRA.root.parent !== scene) scene.add(EXTRA.root);
      const dir = OUT + 'stills/';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const fr = plan(name), out = [];
      for (const t of ticks) {
        const f = fr.find(q => Math.abs(q.t - t) < 1e-6);
        if (!f) continue;
        pose(name, f);
        placeExtras(f);
        for (const [vn, v] of Object.entries(views)) {
          const yaw = f.yaw * Math.PI / 180, dx = v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), dz = -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw);
          const tg = [f.p[0] * PX, opt.y, f.p[2] * PX], n = Math.hypot(dx, v[1], dz), dist = opt.dist;
          snap(dir + name + '_' + vn + '_' + t + '.png', { fov: 30, res: 320, target: tg, pos: [tg[0] + dx / n * dist, tg[1] + v[1] / n * dist, tg[2] + dz / n * dist] }, true);
          out.push(vn + t);
        }
      }
      scene.remove(EXTRA.root);
      HEADS.forEach((c, i) => { if (c.mesh) c.mesh.visible = i === 0; });
      obj(G.carrier).visible = true;
      Animator.showDefaultPose();
      return out.join(' ');
    } finally { unlock(); }
  }

  // Onion skin and arcs: one fixed camera for the whole clip, a model-only frame per tick from t0 to t1 and the screen
  // paths of the head and hand tips at every preview frame -> dev/anim/hits/onion/<name>/, then: python3 dev/anim/onion.py <name>
  // opt.view: [x, y, z] direction from the zombie (rig space, default its left side); opt.world = false keeps the carrier
  // in place, so the paths show the body's own motion without the knockback.
  const TIPS = IG ? { head: ['head', [0, 12, -6]], fist_r: ['arm_r', [0, -28, 0]], fist_l: ['arm_l', [0, -28, 0]], foot_r: ['leg_r', [0, -13, 0]] }
    : P ? { head: ['head', [0, 0, -9]], tail: ['tail', [0, -8, 0]], paw_fr: ['leg_fr', [0, -8, 0]], paw_hr: ['leg_hr', [0, -8, 0]] }
    : E ? { head: ['head', [0, 8, -4]], hand_r: ['arm_r', [0, -28, 0]], hand_l: ['arm_l', [0, -28, 0]], chest: ['torso', [0, 9, -2]], foot_r: ['leg_r', [0, -30, 0]] }
    : C ? { head: ['head', [0, 8, -4]], chest: ['torso', [0, 12, -2]], foot_fr: ['leg_fr', [0, -6, -2]], foot_hr: ['leg_hr', [0, -6, 2]] }
    : S ? { head: ['head', [0, 0, -8]], tail: ['abdomen', [0, 0, 12]], foot_r1: ['leg_r1', [15, 0, 0]], foot_r4: ['leg_r4', [15, 0, 0]], foot_l2: ['leg_l2', [-15, 0, 0]] }
    : Q ? { head: ['head', [0, 0, -7]], hoof_fr: ['leg_fr', [0, -12, 0]], hoof_hr: ['leg_hr', [0, -12, 0]], rump: ['pelvis', [0, 5, 10]] }
    : { head: ['head', [0, 8, -4]], hand_r: ['arm_r', [1, -10, 0]], hand_l: ['arm_l', [-1, -10, 0]], chest: ['torso', [0, 10, -2]], hands: ['arms', [0, -4, -2]] };
  function trail(name, t0, t1, opt) {
    ensure();
    opt = Object.assign({ view: [-1, 0.12, 0], world: true, res: 640, dist: 95 }, opt || {});
    lock(120000);
    try {
      if (!EXTRA) makeExtras();
      if (EXTRA.root.parent !== scene) scene.add(EXTRA.root);
      const dir = OUT + 'onion/' + name + '/';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const frames = plan(name, 5).filter(q => q.t >= t0 - 1e-6 && q.t <= t1 + 1e-6);
      if (!opt.world) frames.forEach(q => { q.p = [0, 0, 0]; });
      const ps = frames.map(q => q.p), mid = [0, 2].map(j => (Math.min(...ps.map(p => p[j])) + Math.max(...ps.map(p => p[j]))) / 2);
      const n = Math.hypot(...opt.view), tg = [mid[0] * PX, S ? 8 : 16, mid[1] * PX];
      const cam = { fov: 30, res: opt.res, target: tg, pos: opt.view.map((v, i) => tg[i] + v / n * opt.dist) };
      const C = new THREE.PerspectiveCamera(cam.fov, 1, 1, 4000);
      C.position.set(...cam.pos); C.lookAt(new THREE.Vector3(...tg)); C.updateMatrixWorld(true);
      const paths = {}, ticks = [];
      for (const [k, [bone]] of Object.entries(TIPS)) if (G[bone]) paths[k] = [];
      frames.forEach(fr => {
        pose(name, fr);
        placeExtras(fr);
        for (const [k, [bone, off]] of Object.entries(TIPS)) {
          if (!G[bone]) continue;
          const v = obj(G[bone]).localToWorld(new THREE.Vector3(...off)).project(C);
          paths[k].push([+(((v.x + 1) / 2) * opt.res).toFixed(1), +(((1 - v.y) / 2) * opt.res).toFixed(1), +fr.t.toFixed(2)]);
        }
        if (Math.abs(fr.t - Math.round(fr.t)) < 1e-6) {
          const id = String(Math.round(fr.t)).padStart(3, '0').replace('-', 'm');
          snap(dir + 'o' + id + '.png', cam, false);
          ticks.push(Math.round(fr.t));
        }
      });
      obj(G.carrier).visible = false; EXTRA.shadow.visible = false;
      snap(dir + 'bg.png', cam, true);
      fs.writeFileSync(dir + 'paths.json', JSON.stringify({ name, t0, t1, res: opt.res, ticks, paths }));
      scene.remove(EXTRA.root);
      HEADS.forEach((c, i) => { if (c.mesh) c.mesh.visible = i === 0; });
      obj(G.carrier).visible = true;
      Animator.showDefaultPose();
      return `onion ${name}: ${ticks.length} ticks, ${frames.length} path points`;
    } finally { unlock(); }
  }

  // creeper rig: which death_front is animated (the variants under review; see creeperAnims)
  function flip(v) {
    if (!FLIPS || !FLIPS[v]) throw new Error('no variant ' + v);
    ANIMS.death_front = FLIPS[v];
    return animate('death_front') + ' (' + v + ')';
  }

  return { ANIMS, SETUPS, G, loadTextures, build, animate, animateAll, save, exportClips, render, renderAll, stills, trail, plan, own, VIEW, exportTo,
    DEATHS, flip, variant: () => variant };
}
var ZH = makeHits('humanoid');
var VH = makeHits('villager');
var QH = makeHits('quadruped');
var SH = makeHits('spider');
var CH = makeHits('creeper');
var EH = makeHits('enderman');
var PT = makeHits('pet');
var IG = makeHits('golem');
