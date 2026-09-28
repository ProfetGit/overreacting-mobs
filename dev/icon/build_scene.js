// Overreacting Mobs icon scene + animation. Run inside Blockbench (free format project named PROJECT):
//   eval(require('fs').readFileSync('<this file>', 'utf8')); window.OM = OM; OM.loadTextures()   // then, in a later call:
//   OM.build(); OM.animate(); OM.camera()                                                          // then:
//   OM.render(first, last)                                                                         // 1600px frames -> frames/
// A zombie (vanilla box sizes, units = texels, feet at y 0) faces the attacker on the left. An iron sword swings in, the
// zombie freezes in a white flash, flies back red and wide-eyed, lands, sees stars, shakes it off and stomps back.
// Every bone holds three copies of its cube (normal / hurt red / flash white) and the head holds the expression planes;
// step scale keys pick which one shows. Flat things (sword, FX) live in the `screen` group, tilted to face the camera.
var OM = (function () {
  const fs = require('fs');
  const DIR = '/home/emppu/Projects/Minecraft Datapacks/MobReactions/dev/icon/';
  const TEX = DIR + 'sprites/';
  const FPS = 25, DT = 1 / FPS, LEN = 3.2;
  const CAM_POS = [0, 60, 104], CAM_TARGET = [0, 16, 0];
  let CAM_PAN = [0, 0, 0], CAM_ZOOM = 0.2;   // icon; the banner renders at OM.camera(0.17)
  const PITCH = -Math.atan2(CAM_POS[1] - CAM_TARGET[1], CAM_POS[2] - CAM_TARGET[2]) * 180 / Math.PI;
  const O = new THREE.Vector3(...CAM_TARGET);
  const RAD = Math.PI / 180;
  const YAW = -38;                     // the zombie turns its front toward the attacker on the left
  const Z_SWORD = 40, Z_FX = 60;

  const q = t => Math.round(t * FPS) / FPS;
  const worldToScreen = w => new THREE.Vector3(...w).sub(O).applyEuler(new THREE.Euler(-PITCH * RAD, 0, 0)).add(O);

  const PROJECT = 'overreacting_mobs_icon', ME = 'overreacting-mobs';
  function own() {
    const p = ModelProject.all.find(m => m.name === PROJECT);
    if (!p) throw new Error('project ' + PROJECT + ' is not open');
    if (Project !== p) p.select();
    return p;
  }
  function lockedBy() {
    const l = window.BB_LOCK;
    return l && l.owner !== ME && l.until > Date.now() ? l.owner : null;
  }

  const tex = {};
  function loadTextures() {
    own();
    Texture.all.slice().forEach(t => t.remove(true));
    for (const f of fs.readdirSync(TEX).filter(f => f.endsWith('.png') && !/^(bg|banner|review|title|icon)/.test(f))) {
      const url = 'data:image/png;base64,' + fs.readFileSync(TEX + f).toString('base64');
      tex[f.slice(0, -4)] = new Texture({ name: f }).fromDataURL(url).add(false);
    }
    return Object.keys(tex).join(',');
  }
  function ensureTex() {
    for (const k in tex) delete tex[k];
    Texture.all.forEach(t => { tex[t.name.replace('.png', '')] = t; });
  }
  function pixels(name) {
    const img = tex[name].img;
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data, out = [];
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 127) out.push([x, y]);
    return { size: cv.width, px: out };
  }

  function group(name, origin, parent, rotation) {
    const g = new Group({ name, origin, rotation: rotation || [0, 0, 0] });
    g.addTo(parent); g.init();
    return g;
  }
  const FACES = ['north', 'south', 'east', 'west', 'up', 'down'];
  function cube(name, from, to, parent, faceTex, opts) {
    const c = new Cube(Object.assign({ name, from, to, box_uv: false }, opts || {}));
    c.addTo(parent); c.init();
    for (const f of FACES) {
      const spec = f in faceTex ? faceTex[f] : faceTex.all;
      if (spec) c.faces[f].extend({ texture: tex[spec[0]].uuid, uv: spec[1] });
      else c.faces[f].extend({ texture: null });
    }
    return c;
  }
  function plane(name, centre, size, parent, texName, mirror) {
    const [x, y, z] = centre, h = size / 2;
    return cube(name, [x - h, y - h, z], [x + h, y + h, z], parent, { south: [texName, mirror ? [16, 0, 0, 16] : [0, 0, 16, 16]] });
  }
  function extrude(prefix, texName, pivotPx, at, s, parent) {
    const { size, px } = pixels(texName), k = 16 / size;
    for (const [x, y] of px) {
      const x0 = at[0] + (x - pivotPx[0]) * s, y0 = at[1] + (pivotPx[1] - y - 1) * s;
      cube(prefix, [x0, y0, at[2] - s / 2], [x0 + s, y0 + s, at[2] + s / 2], parent, { all: [texName, [x * k, y * k, (x + 1) * k, (y + 1) * k]] });
    }
  }

  // atlas regions (px in the 32x32 zombie atlas) -> UV in project units; `m` mirrors horizontally
  const R = (x, y, w, h, m) => m ? [(x + w) / 2, y / 2, x / 2, (y + h) / 2] : [x / 2, y / 2, (x + w) / 2, (y + h) / 2];
  // each face: [region, shade] with shade '' (lit: up, south), '_side' (east, west) or '_under' (north, down)
  const PARTS = {
    head: { from: [-4, 24, -4], to: [4, 32, 4], pivot: [0, 24, 0], parent: 'torso',
      faces: { south: [R(0, 0, 8, 8), ''], north: [R(24, 0, 8, 8), '_under'], east: [R(8, 0, 8, 8), '_side'],
        west: [R(8, 0, 8, 8, 1), '_side'], up: [R(16, 0, 8, 8), ''], down: [R(16, 0, 8, 8), '_under'] } },
    body: { from: [-4, 12, -2], to: [4, 24, 2], pivot: [0, 12, 0], parent: 'torso',
      faces: { south: [R(0, 8, 8, 12), ''], north: [R(0, 8, 8, 12), '_under'], east: [R(8, 8, 4, 12), '_side'],
        west: [R(8, 8, 4, 12), '_side'], up: [R(0, 20, 8, 4), ''], down: [R(0, 20, 8, 4), '_under'] } },
    arm_r: { from: [-8, 20, -2], to: [-4, 24, 10], pivot: [-6, 22, 0], parent: 'torso', arm: true },
    arm_l: { from: [4, 20, -2], to: [8, 24, 10], pivot: [6, 22, 0], parent: 'torso', arm: true },
    leg_r: { from: [-4, 0, -2], to: [0, 12, 2], pivot: [-2, 12, 0], parent: 'zombie', leg: true },
    leg_l: { from: [0, 0, -2], to: [4, 12, 2], pivot: [2, 12, 0], parent: 'zombie', leg: true },
  };
  const ARM = { west: [R(20, 8, 12, 4), '_side'], east: [R(0, 24, 12, 4), '_side'], up: [R(28, 8, 4, 12), ''],
    down: [R(28, 8, 4, 12), '_under'], south: [R(20, 12, 4, 4), ''], north: [R(24, 12, 4, 4), '_under'] };
  const LEG = { south: [R(12, 8, 4, 12), ''], north: [R(12, 8, 4, 12), '_under'], east: [R(16, 8, 4, 12), '_side'],
    west: [R(16, 8, 4, 12, 1), '_side'], up: [R(8, 20, 4, 4), ''], down: [R(8, 20, 4, 4), '_under'] };
  const TINTS = ['', '_hurt', '_flash'];
  const EXPR = ['normal', 'blink', 'squint', 'surprised', 'dizzy', 'dizzy2', 'grumpy'];

  // sword: 16px sprite, grip pixel and blade tip pixel
  const SWORD_PX = 1.5, SWORD_PIVOT = [2.5, 12.5], SWORD_TIP = [14.5, 0.5], SMEAR_R = 26;
  const HIT = [-3.5, 29.5, 0];          // world point the blade tip strikes (the head's front-left)
  const LAND = [14, 0, -2];             // where the feet touch down after the knockback
  const SPARKS = [40, 100, 160, 220];
  const DIZZY = 3;
  const T = {
    blink: 0.20, windStart: 0.32, cocked: 0.48, mid: 0.52, impact: 0.56, release: 0.68, land: 1.08,
    shake: 1.96, grumpy: 2.24, hops: [2.32, 2.60], hopLen: 0.20, calm: 2.92,
  };
  const P = {
    restRot: 40, cockedRot: 56, midRot: 8, impactRot: -60, rest: [-1, -6, 0], cockedPos: [-3, -3, 0],
    apex: 10, hopH: 4, orbit: [9, 3],
  };

  const G = {};
  function fxPlane(name, at, size, texName, mirror) {
    G[name] = group(name, at, G.screen);
    plane(name + '_plane', at, size, G[name], texName, mirror);
  }

  function build() {
    own(); ensureTex();
    Animation.all.slice().forEach(a => a.remove(false));
    Outliner.root.slice().forEach(n => n.remove(false));
    // floor shadow (key cyan disc; the compositor paints it in the background's shadow tone)
    G.shadow = group('shadow', [0, 0.2, 0], undefined);
    cube('shadow_plane', [-11, 0.2, -11], [11, 0.2, 11], G.shadow, { up: ['shadow', [0, 0, 16, 16]] });

    G.zombie = group('zombie', [0, 0, 0], undefined, [0, YAW, 0]);
    G.torso = group('torso', [0, 12, 0], G.zombie);
    for (const [name, p] of Object.entries(PARTS)) {
      const g = G[name] = group(name, p.pivot, G[p.parent]);
      const faces = p.arm ? ARM : p.leg ? LEG : p.faces;
      TINTS.forEach(tn => {
        const sub = G[name + (tn || '_n')] = group(name + (tn || '_n'), p.pivot, g);
        const f = {};
        for (const [d, [uv, shade]] of Object.entries(faces)) f[d] = ['zombie' + shade + tn, uv];
        cube(name + '_cube' + tn, p.from, p.to, sub, f);
      });
    }
    EXPR.forEach(e => {
      const n = 'face_' + e;
      G[n] = group(n, [0, 28, 4], G.head);
      plane(n + '_plane', [0, 28, 4.04], 8, G[n], n);
    });

    G.screen = group('screen', O.toArray(), undefined, [PITCH, 0, 0]);
    const L = layout();
    G.sword = group('sword', [L.grip.x, L.grip.y, Z_SWORD], G.screen);
    extrude('sword_px', 'sword_item', SWORD_PIVOT, [L.grip.x, L.grip.y, Z_SWORD], SWORD_PX, G.sword);
    // smear: quarter ring around the grip, thick end right behind the blade (a clockwise swing)
    G.smear = group('smear', [L.grip.x, L.grip.y, Z_SWORD - 3], G.screen);
    const S = SMEAR_R * 16 / 15.6;
    cube('smear_plane', [L.grip.x, L.grip.y, Z_SWORD - 3], [L.grip.x + S, L.grip.y + S, Z_SWORD - 3], G.smear, { south: ['fx_smear', [0, 0, 16, 16]] });
    // impact FX at the tip
    fxPlane('star', [L.tip.x - 2, L.tip.y + 1, Z_FX + 8], 15, 'fx_star');
    fxPlane('ring', [L.tip.x - 2, L.tip.y + 1, Z_FX + 7], 18, 'fx_ring');
    SPARKS.forEach((a, k) => fxPlane('spark_' + k, [L.tip.x, L.tip.y, Z_FX + 9 + k * 0.1], 6, 'fx_spark'));
    // landing dust, dizzy stars, sweat drops, hop dust
    L.dust.forEach((d, k) => fxPlane('dust_' + k, [d.x, d.y, Z_FX + k], 12, 'fx_puff', k === 0));
    for (let k = 0; k < DIZZY; k++) fxPlane('dizzy_' + k, [L.orbit.x, L.orbit.y, 0], 6, 'fx_dizzy');
    for (let k = 0; k < 2; k++) fxPlane('drop_' + k, [L.orbit.x + (k ? 5 : -5), L.orbit.y - 4, Z_FX + 3 + k], 4.5, 'fx_drop', k === 0);
    L.hop.forEach((d, k) => fxPlane('hdust_' + k, [d.x, d.y, Z_FX - 4 + k], 10, 'fx_puff', k % 2));
    Canvas.updateAll();
    return Outliner.elements.length;
  }

  // ---- layout (screen space) ----
  function rot2(v, deg) {
    const a = deg * RAD;
    return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  }
  const tipOff = r => rot2([(SWORD_TIP[0] - SWORD_PIVOT[0]) * SWORD_PX, (SWORD_PIVOT[1] - SWORD_TIP[1]) * SWORD_PX], r);
  function layout() {
    const tip = worldToScreen(HIT);
    const o = tipOff(P.impactRot);
    const grip = { x: tip.x - o[0], y: tip.y - o[1] };
    const [lx, , lz] = LAND;
    const dust = [-9, 9].map(dx => { const f = worldToScreen([lx + dx, 1, lz + 3]); return { x: f.x, y: f.y + 4 }; });
    const orbit = worldToScreen([lx, 35, lz]);
    const hop = [0.5, 0].map(k => { const f = worldToScreen([lx * k, 1, lz * k + 3]); return { x: f.x, y: f.y + 3 }; });
    return { tip, grip, dust, orbit, hop, head: worldToScreen([0, 28, 0]) };
  }

  // ---- animation ----
  let A = null;
  function K(g, ch, t, v, interp) {
    const [x, y, z] = typeof v === 'number' ? [v, v, v] : v;
    A.getBoneAnimator(g).addKeyframe({ channel: ch, time: q(t), interpolation: interp || 'linear', data_points: [{ x, y, z }] });
  }
  const track = (g, ch, keys, interp) => keys.forEach(([t, v, i]) => K(g, ch, t, v, i || interp));
  const NF = Math.round(LEN * FPS);
  const frames = fn => { const out = []; for (let f = 0; f <= NF; f++) out.push([f * DT, fn(f * DT, f)]); return out; };
  const near = (t, a, b) => t > a - 1e-6 && t < b - 1e-6;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = u => u * u * (3 - 2 * u);

  function faceAt(t, f) {
    if (near(t, T.blink, T.blink + 0.08)) return 'blink';
    if (near(t, T.impact, T.release) || near(t, T.land, T.land + 0.08)) return 'squint';
    if (near(t, T.release, T.land)) return 'surprised';
    if (near(t, T.land + 0.08, T.shake)) return f % 4 < 2 ? 'dizzy' : 'dizzy2';
    if (near(t, T.shake, T.grumpy)) return 'blink';
    if (near(t, T.grumpy, T.calm)) return 'grumpy';
    return 'normal';
  }
  function tintAt(t) {
    if (near(t, T.impact, T.impact + 0.08)) return '_flash';
    if (near(t, T.impact + 0.08, T.land)) return '_hurt';
    return '';
  }

  // root path: world position of the feet
  function rootPos(t) {
    const [lx, , lz] = LAND;
    if (t < T.impact) return [0, 0, 0];
    if (t < T.release) { const k = Math.round((t - T.impact) * FPS); return [[0, 0, 0], [1.2, -1.2, 0], [-0.8, -1.4, 0]][k] || [0, -1.4, 0]; }
    if (t < T.land) { const u = (t - T.release) / (T.land - T.release); return [lx * u, -1.4 * (1 - u) + 4 * P.apex * u * (1 - u), lz * u]; }
    const h1 = T.hops[0], h2 = T.hops[1], hl = T.hopLen;
    if (t < h1) return [lx, 0, lz];
    const hop = (a, b, u) => [a[0] + (b[0] - a[0]) * u, 4 * P.hopH * u * (1 - u), a[2] + (b[2] - a[2]) * u];
    const mid = [lx * 0.5, 0, lz * 0.5];
    if (t < h1 + hl) return hop(LAND, mid, (t - h1) / hl);
    if (t < h2) return mid;
    if (t < h2 + hl) return hop(mid, [0, 0, 0], (t - h2) / hl);
    return [0, 0, 0];
  }

  function ensureG() {
    for (const k in G) delete G[k];
    Group.all.forEach(g => { G[g.name] = g; });
  }
  function animate() {
    own(); ensureTex(); ensureG();
    Animation.all.slice().forEach(a => a.remove(false));
    A = new Animation({ name: 'icon_loop', length: LEN, loop: 'loop', snapping: FPS }).add(false);
    A.select();
    const warnings = [];
    for (const [k, v] of Object.entries(T)) [].concat(v).forEach(t => { if (Math.abs(t * FPS - Math.round(t * FPS)) > 1e-6) warnings.push(`T.${k} ${t} off grid`); });
    const L = layout(), I = T.impact, W = T.windStart, rr = P.restRot, z = r => [0, 0, r], Rl = T.release, Ld = T.land;

    // ---- sword: rest -> wind-up -> 2-frame slash -> buried in the hit-stop -> follow-through and a damped return ----
    track(G.sword, 'rotation', [
      [0, z(rr), 'catmullrom'], [W, z(rr), 'catmullrom'], [W + 0.08, z(rr - 5), 'catmullrom'], [T.cocked, z(P.cockedRot)],
      [T.mid, z(P.midRot)], [I, z(P.impactRot)], [Rl, z(P.impactRot)],
      [Rl + 0.04, z(P.impactRot - 14), 'catmullrom'], [Rl + 0.12, z(P.impactRot - 6), 'catmullrom'], [Rl + 0.28, z(rr + 10), 'catmullrom'],
      [Rl + 0.40, z(rr - 7), 'catmullrom'], [Rl + 0.52, z(rr + 3), 'catmullrom'], [Rl + 0.64, z(rr), 'catmullrom'], [LEN, z(rr), 'catmullrom'],
    ]);
    const Rp = P.rest;
    track(G.sword, 'position', [
      [0, Rp, 'catmullrom'], [W, Rp, 'catmullrom'], [W + 0.08, [Rp[0] + 1, Rp[1] - 1.5, 0], 'catmullrom'], [T.cocked, P.cockedPos],
      [T.mid, [-3, 2, 0]], [I, [0, 0, 0]], [Rl, [0, 0, 0]],
      [Rl + 0.04, [3, -3, 0], 'catmullrom'], [Rl + 0.16, [-2, 1, 0], 'catmullrom'], [Rl + 0.36, Rp, 'catmullrom'], [LEN, Rp, 'catmullrom'],
    ]);
    track(G.sword, 'scale', [[0, 1], [W, 1], [T.cocked, [0.94, 1.08, 1]], [T.mid, [1.08, 0.95, 1]], [I, 1], [LEN, 1]]);
    const smearRot = r => 45 + r + 2;
    track(G.smear, 'rotation', [[T.mid, z(smearRot(P.midRot)), 'step'], [I, z(smearRot(P.impactRot)), 'step']]);
    track(G.smear, 'position', [[T.mid, [-3, 2, 0], 'step'], [I, [0, 0, 0], 'step']]);
    track(G.smear, 'scale', [[0, 0, 'step'], [T.mid, 1, 'step'], [I, 0.9, 'step'], [I + DT, 0, 'step']]);

    // ---- impact FX ----
    track(G.star, 'scale', [[0, 0], [I - DT, 0], [I, 1.4], [I + DT, 1.1], [I + 2 * DT, 0.6], [I + 3 * DT, 0]]);
    track(G.star, 'rotation', [[I, z(0)], [I + 3 * DT, z(-30)]]);
    track(G.ring, 'scale', [[0, 0], [I - DT, 0], [I, 0.5], [I + DT, 0.95], [I + 2 * DT, 1.35], [I + 3 * DT, 0]]);
    SPARKS.forEach((a, k) => {
      const sc = [[0, 0], [I - DT, 0]], pos = [];
      for (let f = 0; f <= 4; f++) {
        const t = I + f * DT, d = 18 * (1 - Math.pow(1 - f / 4, 2));
        sc.push([t, f === 4 ? 0 : 1 - f * 0.2]);
        pos.push([t, [Math.cos(a * RAD) * d, Math.sin(a * RAD) * d, 0]]);
      }
      track(G['spark_' + k], 'scale', sc);
      track(G['spark_' + k], 'position', pos);
    });

    // ---- zombie: which cube copy and which face shows, sampled per frame with step keys ----
    const tints = frames(tintAt), faces = frames(faceAt);
    for (const name of Object.keys(PARTS)) TINTS.forEach(tn => {
      track(G[name + (tn || '_n')], 'scale', tints.map(([t, v]) => [t, v === tn ? 1 : 0, 'step']));
    });
    EXPR.forEach(e => track(G['face_' + e], 'scale', faces.map(([t, v]) => [t, v === e ? 1 : 0, 'step'])));

    // root: hit-stop jitter, flight arc, hops home (sampled per frame)
    track(G.zombie, 'position', frames(rootPos));
    // root tilt: thrown back in the air, righting itself before touchdown; a little lean into each hop
    track(G.zombie, 'rotation', [
      [0, 0], [I, 0], [Rl, [-6, 0, 0]], [Rl + 0.12, [-24, 0, 4], 'catmullrom'], [Rl + 0.24, [-14, 0, -3], 'catmullrom'], [Ld - 0.04, [4, 0, 0], 'catmullrom'],
      [Ld, [6, 0, 0]], [Ld + 0.12, [0, 0, 0], 'catmullrom'],
      [T.hops[0], [0, 0, 0]], [T.hops[0] + 0.08, [-8, 0, 0], 'catmullrom'], [T.hops[0] + T.hopLen, [4, 0, 0]],
      [T.hops[1], [0, 0, 0]], [T.hops[1] + 0.08, [-8, 0, 0], 'catmullrom'], [T.hops[1] + T.hopLen, [4, 0, 0]], [T.calm, [0, 0, 0], 'catmullrom'], [LEN, 0],
    ]);
    // squash at the feet: buckle on the hit, big contact squash on landing, a smaller one per hop
    const hopSquash = h => [[h - 0.08, 1], [h - 0.04, [1.1, 0.88, 1.1]], [h, [0.92, 1.1, 0.92]], [h + T.hopLen - 0.04, [0.96, 1.05, 0.96]],
      [h + T.hopLen, [1.12, 0.88, 1.12]], [h + T.hopLen + 0.04, [0.97, 1.03, 0.97]], [h + T.hopLen + 0.08, 1]];
    track(G.zombie, 'scale', [
      [0, 1], [I - DT, 1], [I, [1.06, 0.93, 1.06]], [Rl, [1.04, 0.95, 1.04]], [Rl + 0.04, [0.94, 1.08, 0.94]], [Rl + 0.16, 1],
      [Ld - DT, [0.95, 1.06, 0.95]], [Ld, [1.2, 0.78, 1.2]], [Ld + 0.04, [1.08, 0.9, 1.08]], [Ld + 0.08, [0.95, 1.06, 0.95]],
      [Ld + 0.16, [1.03, 0.98, 1.03]], [Ld + 0.24, 1],
      ...hopSquash(T.hops[0]), ...hopSquash(T.hops[1]), [LEN, 1],
    ]);

    // torso (bends at the hips): thrown back on the hit, folds over on landing, drunk sway while dizzy
    const sway = (t, a, ph) => a * Math.sin(2 * Math.PI * (t - Ld) / 0.48 + (ph || 0));
    const dizzy = t => near(t, Ld + 0.16, T.shake);
    const fade = t => clamp((t - Ld - 0.16) / 0.16, 0, 1) * clamp((T.shake - t) / 0.12, 0, 1);
    track(G.torso, 'rotation', frames(t => {
      if (t < I) return [0, 0, 0];
      if (t < Rl) return [-26, 0, -6];
      if (t < Ld) { const u = (t - Rl) / (Ld - Rl); return [-26 + 18 * smooth(u), 0, -6 + 10 * u]; }
      if (t < Ld + 0.16) { const u = (t - Ld) / 0.16; return [26 * Math.sin(Math.PI * u) + 6 * u, 0, 4 * (1 - u)]; }
      if (dizzy(t)) return [6 - 2 * fade(t), 0, sway(t, 9) * fade(t)];
      if (t < T.grumpy) { const u = (t - T.shake) / (T.grumpy - T.shake); return [4 * (1 - u), 0, 0]; }
      return [0, 0, 0];
    }));
    // head: whips back a beat after the release, circles while dizzy, shakes it off
    track(G.head, 'rotation', frames((t, f) => {
      if (t < I) return [0, 0, 0];
      if (t < Rl) return [4, 0, 0];
      if (t < Rl + 0.08) return [-14, 10, 8];
      if (t < Ld) { const u = (t - Rl - 0.08) / (Ld - Rl - 0.08); return [-14 + 12 * u, 10 - 10 * u, 8 - 8 * u]; }
      if (t < Ld + 0.16) { const u = (t - Ld) / 0.16; return [14 * Math.sin(Math.PI * u), 0, 0]; }
      if (dizzy(t)) return [sway(t, 8, Math.PI / 2) * fade(t), 0, -sway(t, 12) * fade(t)];
      if (near(t, T.shake, T.shake + 0.28)) { const k = Math.round((t - T.shake) * FPS); return [0, [0, 28, -28, 28, -28, 14, 0][k], 0]; }
      if (near(t, T.grumpy, T.calm)) return [8, 0, 0];
      return [0, 0, 0];
    }));
    // arms: flung apart on the hit, flail in the air, flop down on landing, dangle while dizzy, back up to stomp home
    // [raise (-x up), swing (y: outward is -y for the right arm, +y for the left), 0]; mirrored per side, never symmetric
    const armKeys = (s) => {
      const o = v => [v[0], s ? -v[1] : v[1], 0];
      const k = (a, b) => (s ? a : b);
      return [
        [0, 0], [I - DT, 0], [I, o(k([-50, 70], [10, 35]))], [Rl, o(k([-56, 76], [14, 38]))],
        [Rl + 0.08, o(k([-100, 40], [-30, 70])), 'catmullrom'], [Rl + 0.16, o(k([-40, 80], [-90, 30])), 'catmullrom'],
        [Rl + 0.28, o(k([-95, 50], [-35, 75])), 'catmullrom'], [Ld - 0.04, o(k([-60, 40], [-70, 30])), 'catmullrom'],
        [Ld, o(k([-40, 20], [-45, 18]))], [Ld + 0.08, o([35, 6]), 'catmullrom'], [Ld + 0.20, o([22, 0]), 'catmullrom'],
        [T.shake - 0.08, o([28, -4]), 'catmullrom'], [T.shake + 0.08, o(k([10, 20], [34, 20])), 'catmullrom'], [T.shake + 0.16, o(k([34, 20], [10, 20])), 'catmullrom'],
        [T.grumpy, [0, 0, 0], 'catmullrom'],
        [T.hops[0] + 0.08, o([k(-14, 8), 0]), 'catmullrom'], [T.hops[1] + 0.08, o([k(8, -14), 0]), 'catmullrom'],
        [T.calm, [0, 0, 0], 'catmullrom'], [LEN, 0],
      ];
    };
    track(G.arm_r, 'rotation', armKeys(1), 'catmullrom');
    track(G.arm_l, 'rotation', armKeys(0), 'catmullrom');
    // legs: kick out of step in the air, splay into the landing, march home
    const legKeys = s => [
      [0, 0], [I, 0], [Rl, [s ? -8 : 8, 0, s ? -4 : 4]], [Rl + 0.12, [s ? -38 : 22, 0, s ? -8 : 8], 'catmullrom'],
      [Rl + 0.24, [s ? 18 : -30, 0, s ? -6 : 6], 'catmullrom'], [Ld - 0.04, [s ? -10 : 10, 0, s ? -10 : 10], 'catmullrom'],
      [Ld, [0, 0, s ? -12 : 12]], [Ld + 0.16, [0, 0, s ? -6 : 6], 'catmullrom'], [T.shake, [0, 0, s ? -6 : 6]], [T.grumpy, [0, 0, 0], 'catmullrom'],
      [T.hops[0], [0, 0, 0]], [T.hops[0] + 0.12, [s ? -26 : 20, 0, 0], 'catmullrom'], [T.hops[0] + T.hopLen, [0, 0, 0]],
      [T.hops[1], [0, 0, 0]], [T.hops[1] + 0.12, [s ? 20 : -26, 0, 0], 'catmullrom'], [T.hops[1] + T.hopLen, [0, 0, 0]], [LEN, 0],
    ];
    track(G.leg_r, 'rotation', legKeys(1), 'catmullrom');
    track(G.leg_l, 'rotation', legKeys(0), 'catmullrom');

    // shadow: follows the feet on the floor, shrinks with height
    track(G.shadow, 'position', frames(t => { const p = rootPos(t); return [p[0], 0, p[2]]; }));
    track(G.shadow, 'scale', frames(t => { const k = clamp(1 - Math.max(0, rootPos(t)[1]) / 30, 0.45, 1); return [k, 1, k]; }));

    // landing dust puffs, sliding outward and rising
    L.dust.forEach((d, k) => {
      const sg = k ? 1 : -1;
      track(G['dust_' + k], 'scale', [[0, 0], [Ld - DT, 0], [Ld, 0.6], [Ld + DT, 1.1], [Ld + 2 * DT, 1.0], [Ld + 4 * DT, 0.6], [Ld + 5 * DT, 0]]);
      track(G['dust_' + k], 'position', [[Ld, [0, 0, 0]], [Ld + 5 * DT, [sg * 8, 4, 0]]]);
    });
    // hop dust: a small puff where each hop lands
    L.hop.forEach((d, k) => {
      const tl = T.hops[k] + T.hopLen;
      track(G['hdust_' + k], 'scale', [[0, 0], [tl - DT, 0], [tl, 0.7], [tl + DT, 0.9], [tl + 2 * DT, 0.5], [tl + 3 * DT, 0]]);
      track(G['hdust_' + k], 'position', [[tl, [0, 0, 0]], [tl + 3 * DT, [0, 3, 0]]]);
    });
    // dizzy stars: orbit the landed head on a tilted ellipse, behind the head on the far half
    for (let k = 0; k < DIZZY; k++) {
      track(G['dizzy_' + k], 'position', frames(t => {
        const a = 2 * Math.PI * ((t - Ld) / 0.64 + k / DIZZY);
        return [P.orbit[0] * Math.cos(a), P.orbit[1] * Math.sin(a) + 2, Z_FX * (Math.sin(a) >= -0.2 ? 1 : 0) - 16 * (Math.sin(a) < -0.2 ? 1 : 0)];
      }));
      track(G['dizzy_' + k], 'scale', frames(t => {
        if (!near(t, Ld + 0.12, T.shake + 0.04)) return 0;
        const a = clamp((t - Ld - 0.08) / 0.12, 0, 1) * clamp((T.shake + 0.04 - t) / 0.12, 0, 1);
        return a * (0.85 + 0.15 * Math.sin(2 * Math.PI * ((t - Ld) / 0.64 + k / DIZZY)));
      }));
      track(G['dizzy_' + k], 'rotation', frames(t => [0, 0, ((t - Ld) * 400 + k * 40) % 90]));
    }
    // sweat drops: flung off both sides on the head shake
    for (let k = 0; k < 2; k++) {
      const t0 = T.shake + 0.08 + k * 0.04, sg = k ? 1 : -1;
      track(G['drop_' + k], 'scale', [[0, 0], [t0 - DT, 0], [t0, 1], [t0 + 0.2, 1], [t0 + 0.28, 0]]);
      const pos = [];
      for (let f = 0; f <= 7; f++) { const tt = f * DT; pos.push([t0 + tt, [sg * 60 * tt, 50 * tt - 450 * tt * tt, 0]]); }
      track(G['drop_' + k], 'position', pos);
    }
    Animator.preview();
    return warnings.length ? warnings.join('; ') : 'ok';
  }

  // ---- render ----
  function setTime(t) {
    Timeline.setTime(t);
    Animator.preview();
  }
  function render(first, last, res, dir) {
    res = res || 1600;
    dir = dir || DIR + 'frames/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const shot = f => new Promise(done => {
      own();
      setTime(f * DT);
      Screencam.advancedScreenshot(Preview.selected, { angle_preset: 'view', resolution: [res, res], anti_aliasing: 'none', shading: false }, url => {
        fs.writeFileSync(dir + 'frame_' + String(f).padStart(3, '0') + '.png', Buffer.from(url.split(',')[1], 'base64'));
        done();
      });
    });
    if (lockedBy()) return 'Blockbench is locked by ' + lockedBy();
    window.BB_LOCK = { owner: ME, until: Date.now() + 300000 };
    return (async () => {
      try { for (let f = first; f <= last; f++) await shot(f); } finally { if (window.BB_LOCK && window.BB_LOCK.owner === ME) delete window.BB_LOCK; }
      return `rendered ${first}..${last}`;
    })();
  }
  function scaleSweep() {
    own();
    const bad = [];
    for (let f = 0; f <= NF; f++) {
      setTime(f * DT);
      Group.all.forEach(g => { const s = g.mesh.scale; if (s.x < 0 || s.y < 0 || s.z < 0) bad.push(g.name + '@' + f); });
    }
    return bad.length ? bad.join(',') : 'no negative scale';
  }
  function probe(cubeName, t) {
    own(); setTime(t);
    const c = Cube.all.find(c => c.name === cubeName), b = new THREE.Box3().setFromObject(c.mesh), v = new THREE.Vector3();
    b.getCenter(v);
    return v.toArray().map(n => Math.round(n * 10) / 10);
  }

  // ---- review still: every expression on the zombie, and the sword ----
  function show(expr, tint) {
    for (const name of Object.keys(PARTS)) TINTS.forEach(tn => { G[name + (tn || '_n')].mesh.visible = tn === (tint || ''); });
    EXPR.forEach(e => { G['face_' + e].mesh.visible = e === expr; });
  }
  function ensureG() {
    for (const k in G) delete G[k];
    Group.all.forEach(g => { G[g.name] = g; });
  }
  function review() {
    own(); ensureTex(); ensureG(); camera(0.5);
    const dir = DIR + 'review/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const shots = [['normal', ''], ['squint', '_flash'], ['surprised', '_hurt'], ['dizzy', ''], ['dizzy2', ''], ['grumpy', ''], ['blink', '']];
    const shot = ([e, tn]) => new Promise(done => {
      show(e, tn);
      Screencam.advancedScreenshot(Preview.selected, { angle_preset: 'view', resolution: [800, 800], anti_aliasing: 'none', shading: false }, url => {
        fs.writeFileSync(dir + `zombie_${e}${tn}.png`, Buffer.from(url.split(',')[1], 'base64'));
        done();
      });
    });
    return (async () => { for (const s of shots) await shot(s); show('normal', ''); return 'review shots: ' + shots.length; })();
  }

  // ---- camera + render ----
  function camera(zoom, pan) {
    own();
    const p = Preview.selected;
    p.setProjectionMode(true);
    const pn = pan || CAM_PAN;
    const pos = CAM_POS.map((v, i) => v + pn[i]), tgt = CAM_TARGET.map((v, i) => v + pn[i]);
    p.camera.position.set(...pos);
    p.controls.target.set(...tgt);
    p.camera.lookAt(...tgt);
    p.camera.zoom = zoom || CAM_ZOOM; p.camera.updateProjectionMatrix();
    p.controls.update();
  }

  return { own, lockedBy, G, T, P, tex, loadTextures, build, animate, layout, camera, render, setTime, scaleSweep, probe, review, show, worldToScreen, q, PITCH, FPS, DT, LEN };
})();
