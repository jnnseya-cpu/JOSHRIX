/**
 * JOSHRIX model library generator — authors the platform's low-poly GLB assets.
 * Flat-shaded, vertex-coloured, no external textures: tiny files, one coherent
 * art style, and license-clean by construction.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';

const OUT = 'lib_out';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let seed = 1337;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: true });
const jit = (g, a) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd()-.5)*a, p.getY(i) + (rnd()-.5)*a, p.getZ(i) + (rnd()-.5)*a); g.computeVertexNormals(); return g; };
const mesh = (geo, mat, x=0, y=0, z=0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); return m; };
const box = (w,h,d) => new THREE.BoxGeometry(w,h,d);
const cyl = (rt,rb,h,s=7) => new THREE.CylinderGeometry(rt,rb,h,s);
const cone = (r,h,s=7) => new THREE.ConeGeometry(r,h,s);
const sph = (r,d=0) => new THREE.IcosahedronGeometry(r,d);

const WOOD = 0x6b4a2f, WOOD2 = 0x5d4027, STONE = 0xb8b2a4, STONE2 = 0x9a948a, ROOF = 0xa84a3d, IRON = 0x3a3f4a, GOLD = 0xf0c75e;
const models = [];
const add = (name, obj, tags, height, anims) => { obj.name = name; models.push({ name, obj, tags, height, anims }); };

/* ---------------- NATURE ---------------- */
for (const [i, col] of [0x3f9b4f, 0x2f7d3f, 0x57b45f].entries()) {
  const g = new THREE.Group();
  g.add(mesh(cyl(.12+i*.02, .18+i*.03, 1.1+i*.2, 6), M(WOOD), 0, .55+i*.1, 0));
  for (let k = 0; k < 3; k++) g.add(mesh(jit(sph(.55-k*.1), .08), M(col), (rnd()-.5)*.3, 1.15+i*.2+k*.38, (rnd()-.5)*.3));
  add(`tree_round_${i}`, g, ['tree','nature'], 2.1);
}
for (let i = 0; i < 2; i++) {
  const g = new THREE.Group();
  g.add(mesh(cyl(.1,.16,.9,6), M(WOOD2), 0, .45, 0));
  for (let k = 0; k < 3; k++) g.add(mesh(cone(.62-k*.16,.7), M(k%2?0x2c6e49:0x357a53), 0, 1+k*.45, 0));
  add(`tree_pine_${i}`, g, ['tree','pine','nature'], 2.4);
}
{ const g = new THREE.Group();
  const t = mesh(cyl(.1,.16,2.2,6), M(0x8a6b45), 0, 1.1, 0); t.rotation.z = .08; g.add(t);
  for (let k = 0; k < 6; k++) { const a = k/6*6.283; const f = mesh(box(1.1,.06,.28), M(0x4f9e52), Math.cos(a)*.5, 2.25, Math.sin(a)*.5); f.rotation.y = -a; f.rotation.z = -.35; g.add(f); }
  add('tree_palm', g, ['tree','palm','nature','beach'], 2.5); }
{ const g = new THREE.Group();
  g.add(mesh(cyl(.09,.17,1.6,6), M(0x4a3b30), 0, .8, 0));
  for (const [x,y,r] of [[-.35,1.5,.6],[.4,1.7,-.6],[0,1.9,.2]]) { const b = mesh(cyl(.05,.07,.7,5), M(0x4a3b30), x, y, 0); b.rotation.z = r; g.add(b); }
  add('tree_dead', g, ['tree','dead','nature','dark'], 2.2); }
for (let i = 0; i < 2; i++) { const g = new THREE.Group();
  for (let k = 0; k < 4; k++) g.add(mesh(jit(sph(.3-k*.03), .07), M(i?0x4a8f3c:0x3d7a4f), (rnd()-.5)*.5, .25+rnd()*.2, (rnd()-.5)*.5));
  add(`bush_${i}`, g, ['bush','foliage','nature'], .6); }
for (let i = 0; i < 2; i++) { const g = new THREE.Group();
  g.add(mesh(cyl(.02,.03,.4,4), M(0x4f8f3a), 0, .2, 0));
  const c = [0xe85d75, 0xf2c14e][i];
  for (let k = 0; k < 5; k++) { const a = k/5*6.283; g.add(mesh(box(.13,.03,.07), M(c), Math.cos(a)*.1, .42, Math.sin(a)*.1)); }
  g.add(mesh(sph(.05), M(GOLD), 0, .44, 0));
  add(`flower_${i}`, g, ['flower','foliage','nature'], .5); }
{ const g = new THREE.Group();
  for (let k = 0; k < 7; k++) { const b = mesh(box(.04,.3+rnd()*.2,.02), M(0x63a94a), (rnd()-.5)*.4, .18, (rnd()-.5)*.4); b.rotation.z = (rnd()-.5)*.5; g.add(b); }
  add('grass_tuft', g, ['grass','foliage','nature'], .4); }
{ const g = new THREE.Group(); const l = mesh(jit(cyl(.2,.22,1.4,7), .02), M(0x6b4f35), 0, .22, 0); l.rotation.z = 1.5708; g.add(l);
  g.add(mesh(cyl(.2,.2,.04,7), M(0x9b7d55), .7, .22, 0).rotateZ(1.5708));
  add('log', g, ['wood','nature','prop'], .45); }
{ const g = new THREE.Group(); g.add(mesh(jit(cyl(.28,.34,.5,7), .03), M(0x6b4f35), 0, .25, 0)); g.add(mesh(cyl(.26,.26,.05,7), M(0xa08055), 0, .5, 0));
  add('stump', g, ['wood','nature','prop'], .55); }
for (let i = 0; i < 3; i++) { const g = new THREE.Group();
  g.add(mesh(jit(sph(.45+i*.12), .14), M([0x8b8f98,0x767b85,0x9aa0a8][i]), 0, .3+i*.06, 0));
  add(`rock_${i}`, g, ['rock','nature'], .9); }
{ const g = new THREE.Group(); const r = mesh(jit(sph(.55), .12), M(0x82868f), 0, .12, 0); r.scale.y = .35; g.add(r);
  add('rock_flat', g, ['rock','nature','platform'], .3); }
for (let i = 0; i < 2; i++) { const g = new THREE.Group();
  g.add(mesh(cyl(.09,.13,.4,6), M(0xe8e0d0), 0, .2, 0));
  g.add(mesh(new THREE.SphereGeometry(.3,8,5,0,6.283,0,1.5708), M(i?0xd95763:0xb35ce0, {emissive: i?0x40080c:0x2a0a40, ei:.35}), 0, .4, 0));
  add(`mushroom_${i}`, g, ['mushroom','nature','fantasy'], .6); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.22,.26,1.2,7), M(0x4f8f5a), 0, .6, 0));
  for (const s of [-1,1]) { const a = mesh(cyl(.1,.12,.5,6), M(0x4f8f5a), s*.3, .85, 0); a.rotation.z = s*-.9; g.add(a); }
  add('cactus', g, ['cactus','nature','desert'], 1.3); }

/* ---------------- FANTASY ---------------- */
for (let i = 0; i < 3; i++) { const g = new THREE.Group(); const c = [0x7ee0ff,0xc07bff,0x7bffb8][i];
  const core = mesh(new THREE.OctahedronGeometry(.4), M(c,{rough:.25,emissive:c,ei:.65}), 0, .75, 0); core.scale.y = 1.9; g.add(core);
  for (let k = 0; k < 3; k++) { const a = rnd()*6.28; const s = mesh(new THREE.OctahedronGeometry(.14), M(c,{rough:.3,emissive:c,ei:.5}), Math.cos(a)*.35, .22, Math.sin(a)*.35); s.scale.y = 1.7; g.add(s); }
  add(`crystal_${i}`, g, ['crystal','collectable','emissive','fantasy'], 1.2); }
for (const broken of [false, true]) { const g = new THREE.Group();
  g.add(mesh(box(.6,.22,.6), M(STONE), 0, .11, 0));
  const sh = mesh(jit(cyl(.2,.24, broken?.9:1.8, 7), .03), M(STONE), 0, broken?.67:1.12, 0); if (broken) sh.rotation.z = .06; g.add(sh);
  if (!broken) g.add(mesh(box(.55,.2,.55), M(STONE), 0, 2.12, 0));
  add(broken?'ruin_pillar_broken':'ruin_pillar', g, ['ruin','structure','fantasy'], broken?1.1:2.2); }
{ const g = new THREE.Group(); for (const x of [-.8,.8]) g.add(mesh(box(.4,2,.5), M(STONE2), x, 1, 0));
  g.add(mesh(box(2.2,.4,.55), M(STONE2), 0, 2.2, 0)); g.add(mesh(box(.5,.3,.6), M(STONE), 0, 2.5, 0));
  add('ruin_arch', g, ['ruin','structure','fantasy'], 2.7); }
{ const g = new THREE.Group();
  g.add(mesh(cyl(.9,1.1,3.2,8), M(0xcfc8ba), 0, 1.6, 0)); g.add(mesh(cyl(1.15,1.15,.3,8), M(STONE), 0, 3.3, 0));
  g.add(mesh(cone(1.2,1.5,8), M(0x4a6fb3), 0, 4.2, 0));
  for (let i = 0; i < 3; i++) { const a = i*2.1+.5; const w = mesh(box(.18,.3,.1), M(0xffd97a,{emissive:0xffb830,ei:.9}), Math.cos(a)*.98, 1.2+i*.7, Math.sin(a)*.98); w.lookAt(0,w.position.y,0); g.add(w); }
  add('fantasy_tower', g, ['tower','castle','structure','fantasy'], 4.9); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.05,.07,1.4,6), M(IRON), 0, .7, 0));
  g.add(mesh(new THREE.OctahedronGeometry(.2), M(0xffe9a8,{emissive:0xffc23a,ei:1.2,rough:.4}), 0, 1.5, 0));
  g.add(mesh(cone(.18,.16,6), M(IRON), 0, 1.72, 0));
  add('lantern', g, ['lantern','light','emissive','prop'], 1.8); }
{ const g = new THREE.Group(); g.add(mesh(box(2,1.6,.5), M(STONE), 0, .8, 0));
  for (let i = 0; i < 4; i++) g.add(mesh(box(.35,.3,.55), M(STONE2), -.75+i*.5, 1.75, 0));
  add('castle_wall', g, ['castle','wall','structure','fantasy'], 1.9); }
{ const g = new THREE.Group();
  for (const x of [-1.05,1.05]) { g.add(mesh(cyl(.45,.5,2.4,8), M(STONE), x, 1.2, 0)); g.add(mesh(cone(.6,.7,8), M(0x4a6fb3), x, 2.75, 0)); }
  g.add(mesh(box(1.3,.25,.6), M(STONE2), 0, 2.3, 0)); g.add(mesh(box(1.2,1.7,.35), M(0x6b4a2f), 0, .85, 0));
  add('castle_gate', g, ['castle','gate','structure','fantasy'], 3.1); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.05,.05,2.2,5), M(WOOD2), 0, 1.1, 0));
  const b = mesh(box(.7,.9,.03), M(0xc0392b), .35, 1.6, 0); g.add(b); g.add(mesh(box(.2,.2,.05), M(GOLD), .35, 1.6, .02));
  add('banner', g, ['banner','decor','fantasy','castle'], 2.2); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.5,.55,.5,8), M(STONE), 0, .25, 0)); g.add(mesh(cyl(.42,.42,.1,8), M(0x2a4a6a), 0, .45, 0));
  for (const x of [-.42,.42]) g.add(mesh(box(.08,.9,.08), M(WOOD2), x, .95, 0));
  g.add(mesh(cone(.7,.4,4), M(ROOF), 0, 1.6, 0)); add('well', g, ['well','prop','fantasy','village'], 1.8); }

/* ---------------- BUILDINGS ---------------- */
const houseF = (w,h,d,wall,roof,rooftype) => { const g = new THREE.Group();
  g.add(mesh(box(w,h,d), M(wall), 0, h/2, 0));
  if (rooftype === 'gable') { const r = mesh(cone(w*.82,h*.7,4), M(roof), 0, h+h*.35, 0); r.rotation.y = .785; g.add(r); }
  else g.add(mesh(box(w*1.1,.18,d*1.1), M(roof), 0, h+.09, 0));
  const win = M(0xffe08a,{emissive:0xffbb33,ei:.7});
  g.add(mesh(box(.3,.34,.05), win, -w*.25, h*.55, d/2+.01)); g.add(mesh(box(.3,.34,.05), win, w*.25, h*.55, d/2+.01));
  g.add(mesh(box(.4,.75,.06), M(0x5d3f27), 0, .38, d/2+.01)); return g; };
add('house_small', houseF(1.6,1.2,1.4,0xe4d8c0,ROOF,'gable'), ['building','house','structure','village'], 2.3);
add('house_large', houseF(2.4,2,1.9,0xd9cdb4,0x8b4a3d,'gable'), ['building','house','structure','village'], 3.6);
add('shop', houseF(2,1.5,1.6,0xcfe0e8,0x3f6f8f,'flat'), ['building','shop','structure','town'], 1.8);
{ const g = new THREE.Group(); g.add(mesh(cyl(.85,.95,1.1,8), M(0xd8c9a8), 0, .55, 0)); g.add(mesh(cone(1,.9,8), M(0x8a6a3f), 0, 1.55, 0));
  g.add(mesh(box(.4,.7,.06), M(0x5d3f27), 0, .35, .9)); add('hut', g, ['building','hut','structure','village'], 2); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.7,.9,2.4,8), M(0xe0d6c0), 0, 1.2, 0)); g.add(mesh(cone(.9,.8,8), M(ROOF), 0, 2.8, 0));
  const hub = new THREE.Group(); hub.name = 'bladesPiv'; hub.position.set(0, 2, .95); g.add(hub);
  for (let i = 0; i < 4; i++) { const b = mesh(box(.14,1.5,.05), M(0xf0e6d0), 0, .75, 0); b.rotation.z = i*1.5708; const w = new THREE.Group(); w.rotation.z = i*1.5708; w.add(mesh(box(.14,1.5,.05), M(0xf0e6d0), 0, .75, 0)); hub.add(w); }
  add('windmill', g, ['building','windmill','structure','village'], 3.2, [new THREE.AnimationClip('spin', 4, [new THREE.QuaternionKeyframeTrack('bladesPiv.quaternion', [0,1,2,3,4], [0,0,0,1, 0,0,.707,.707, 0,0,1,0, 0,0,.707,-.707, 0,0,0,1])])]); }
{ const g = new THREE.Group(); for (const x of [-.7,0,.7]) g.add(mesh(box(.1,.8,.1), M(WOOD2), x, .4, 0));
  for (const y of [.35,.65]) g.add(mesh(box(1.6,.08,.06), M(WOOD), 0, y, 0)); add('fence', g, ['fence','prop','structure','village'], .8); }
{ const g = new THREE.Group(); g.add(mesh(box(2.4,.12,1.1), M(WOOD), 0, .5, 0));
  for (const x of [-1,1]) for (const z of [-.5,.5]) g.add(mesh(box(.12,.5,.12), M(WOOD2), x, .25, z));
  for (const z of [-.52,.52]) g.add(mesh(box(2.4,.3,.06), M(WOOD2), 0, .7, z)); add('bridge', g, ['bridge','structure','prop'], .85); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.06,.08,1.2,5), M(WOOD2), 0, .6, 0));
  const s = mesh(box(.8,.4,.06), M(0x9b7d55), .2, 1.1, 0); s.rotation.z = -.06; g.add(s); add('signpost', g, ['sign','prop','village'], 1.3); }

/* ---------------- PROPS ---------------- */
for (const open of [false, true]) { const g = new THREE.Group();
  g.add(mesh(box(.7,.4,.5), M(0x8a5a34), 0, .2, 0)); g.add(mesh(box(.72,.08,.52), M(GOLD), 0, .38, 0));
  const lid = new THREE.Group(); lid.name = 'lidPiv'; lid.position.set(0,.4,-.25); g.add(lid);
  const l = mesh(new THREE.CylinderGeometry(.25,.25,.7,8,1,false,0,3.1416), M(0x8a5a34), 0, 0, .25); l.rotation.z = 1.5708; lid.add(l);
  if (open) lid.rotation.x = -1.1; else g.add(mesh(box(.14,.18,.06), M(GOLD), 0, .3, .26));
  add(open?'chest_open':'chest_closed', g, ['container','chest','treasure','prop'], .7); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.28,.24,.62,9), M(0x8a6a45), 0, .31, 0));
  for (const y of [.12,.5]) g.add(mesh(cyl(.29,.29,.05,9), M(0x5a5a5a), 0, y, 0)); add('barrel', g, ['container','barrel','prop'], .65); }
{ const g = new THREE.Group(); g.add(mesh(box(.55,.55,.55), M(0x9b7d4f), 0, .28, 0));
  for (const a of [[0,.28,.28],[0,.28,-.28]]) g.add(mesh(box(.58,.07,.02), M(0x6b5432), a[0], a[1], a[2])); add('crate', g, ['container','crate','prop'], .58); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.05,.06,.9,6), M(WOOD2), 0, .45, 0));
  g.add(mesh(sph(.16), M(0xff8a2b,{emissive:0xff6a00,ei:1.4,rough:.4}), 0, .98, 0)); add('torch', g, ['torch','light','emissive','prop'], 1.1); }
{ const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = i/5*6.283; const l = mesh(cyl(.05,.07,.6,5), M(WOOD2), Math.cos(a)*.15, .15, Math.sin(a)*.15); l.rotation.set(Math.sin(a)*.5,0,Math.cos(a)*-.5); g.add(l); }
  g.add(mesh(sph(.26), M(0xff7a1a,{emissive:0xff5500,ei:1.6,rough:.5}), 0, .35, 0)); add('campfire', g, ['fire','light','emissive','prop'], .6); }
{ const g = new THREE.Group(); g.add(mesh(sph(.16), M(0x7ee0ff,{emissive:0x2aa8d8,ei:.7,rough:.25}), 0, .18, 0));
  g.add(mesh(cyl(.05,.07,.16,6), M(0xcfd8e0), 0, .38, 0)); g.add(mesh(cyl(.07,.07,.06,6), M(0x8a6a45), 0, .48, 0)); add('potion', g, ['potion','collectable','prop'], .5); }
{ const g = new THREE.Group(); const c = mesh(cyl(.22,.22,.05,12), M(GOLD,{metal:.5,rough:.3,emissive:0x6a4a00,ei:.4}), 0, .3, 0); c.rotation.x = 1.5708; g.add(c);
  add('coin', g, ['coin','collectable','treasure','prop'], .5); }
{ const g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(.1,.03,6,10), M(GOLD,{metal:.4,rough:.35}), 0, .3, 0));
  g.add(mesh(box(.04,.3,.04), M(GOLD,{metal:.4}), 0, .1, 0)); g.add(mesh(box(.1,.04,.04), M(GOLD,{metal:.4}), .05, 0, 0)); add('key', g, ['key','collectable','prop'], .45); }
{ const g = new THREE.Group(); g.add(mesh(box(.9,1.7,.12), M(0x6b4a2f), 0, .85, 0));
  for (const y of [.4,1.3]) g.add(mesh(box(.95,.1,.14), M(0x4a3320), 0, y, 0)); g.add(mesh(sph(.06), M(GOLD,{metal:.5}), .3, .85, .1)); add('door', g, ['door','prop','structure'], 1.7); }

/* ---------------- CHARACTERS (node-pivot rigs, cloneable) ---------------- */
function humanoid(opts) {
  const g = new THREE.Group();
  const { skin, cloth, accent, hat } = opts;
  g.add(mesh(box(.55,.6,.32), M(cloth), 0, 1.05, 0));
  const torso = g.children[0]; torso.name = 'torso';
  g.add(mesh(box(.58,.12,.35), M(accent), 0, .78, 0));
  const hp = new THREE.Group(); hp.name = 'headPiv'; hp.position.y = 1.45; g.add(hp);
  hp.add(mesh(box(.36,.36,.34), M(skin), 0, .2, 0));
  if (hat === 'cone') hp.add(mesh(cone(.26,.5,7), M(accent), 0, .58, 0));
  if (hat === 'crest') hp.add(mesh(cone(.1,.25,5), M(accent), 0, .45, 0));
  if (hat === 'hair') hp.add(mesh(box(.38,.12,.36), M(0x4a3320), 0, .38, 0));
  for (const s of [['l',-1],['r',1]]) {
    const p = new THREE.Group(); p.name = s[0]+'ArmPiv'; p.position.set(s[1]*.36, 1.3, 0); g.add(p);
    p.add(mesh(box(.16,.55,.16), M(cloth), 0, -.28, 0)); p.add(mesh(box(.18,.14,.18), M(skin), 0, -.6, 0));
    const q = new THREE.Group(); q.name = s[0]+'LegPiv'; q.position.set(s[1]*.15, .72, 0); g.add(q);
    q.add(mesh(box(.18,.6,.2), M(opts.legs ?? 0x37527d), 0, -.32, 0)); q.add(mesh(box(.2,.14,.28), M(accent), 0, -.66, .03));
  }
  return g;
}
const qk = (angles, axis='x') => { const o=[]; for (const a of angles) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(axis==='x'?a:0, axis==='y'?a:0, axis==='z'?a:0)); o.push(q.x,q.y,q.z,q.w);} return o; };
const humanClips = () => [
  new THREE.AnimationClip('idle', 2.4, [
    new THREE.VectorKeyframeTrack('torso.position', [0,1.2,2.4], [0,1.05,0, 0,1.09,0, 0,1.05,0]),
    new THREE.QuaternionKeyframeTrack('headPiv.quaternion', [0,1.2,2.4], qk([.06,-.06,.06],'y')),
    new THREE.QuaternionKeyframeTrack('lArmPiv.quaternion', [0,1.2,2.4], qk([.08,.14,.08],'z')),
    new THREE.QuaternionKeyframeTrack('rArmPiv.quaternion', [0,1.2,2.4], qk([-.08,-.14,-.08],'z'))]),
  new THREE.AnimationClip('walk', .8, [
    new THREE.QuaternionKeyframeTrack('lArmPiv.quaternion', [0,.4,.8], qk([.6,-.6,.6])),
    new THREE.QuaternionKeyframeTrack('rArmPiv.quaternion', [0,.4,.8], qk([-.6,.6,-.6])),
    new THREE.QuaternionKeyframeTrack('lLegPiv.quaternion', [0,.4,.8], qk([-.7,.7,-.7])),
    new THREE.QuaternionKeyframeTrack('rLegPiv.quaternion', [0,.4,.8], qk([.7,-.7,.7]))]),
];
add('guardian', humanoid({skin:0x8fd6c7, cloth:0x4a6fb3, accent:GOLD, hat:'crest'}), ['character','humanoid','animated','fantasy','hero'], 1.7, humanClips());
add('hero_knight', humanoid({skin:0xe8b98a, cloth:0x9aa4b0, accent:0xc0392b, legs:0x5a6470, hat:'crest'}), ['character','humanoid','animated','hero','knight'], 1.7, humanClips());
add('mage', humanoid({skin:0xe8b98a, cloth:0x6b4a9e, accent:GOLD, legs:0x4a3370, hat:'cone'}), ['character','humanoid','animated','hero','mage'], 1.8, humanClips());
add('villager', humanoid({skin:0xe8b98a, cloth:0x8a9b5a, accent:0x8a6a45, legs:0x6b5432, hat:'hair'}), ['character','humanoid','animated','npc','village'], 1.7, humanClips());
add('enemy_goblin', humanoid({skin:0x7aa84f, cloth:0x5a4030, accent:0x3a2a1a, legs:0x4a3526, hat:'hair'}), ['character','humanoid','animated','enemy','creature'], 1.7, humanClips());
{ const g = new THREE.Group(); const b = mesh(jit(sph(.45,1), .05), M(0x5ad4a0,{rough:.35,emissive:0x0a3a2a,ei:.3}), 0, .42, 0); b.name = 'body'; g.add(b);
  for (const x of [-.15,.15]) g.add(mesh(sph(.06), M(0x102a20), x, .55, .38));
  add('enemy_slime', g, ['enemy','creature','animated'], .9, [new THREE.AnimationClip('bounce', 1, [
    new THREE.VectorKeyframeTrack('body.position', [0,.5,1], [0,.42,0, 0,.72,0, 0,.42,0]),
    new THREE.VectorKeyframeTrack('body.scale', [0,.25,.5,1], [1.15,.8,1.15, 1,1,1, .85,1.25,.85, 1.15,.8,1.15])])]); }
{ const g = new THREE.Group(); g.add(mesh(sph(.22), M(0x4a3a5a), 0, 1.2, 0));
  for (const s of [['l',-1],['r',1]]) { const p = new THREE.Group(); p.name = s[0]+'WingPiv'; p.position.set(s[1]*.18, 1.25, 0); g.add(p);
    const w = mesh(box(.55,.06,.35), M(0x3a2a4a), s[1]*.3, 0, 0); p.add(w); }
  for (const x of [-.08,.08]) g.add(mesh(sph(.04), M(0xff4a4a,{emissive:0xff2020,ei:.8}), x, 1.24, .2));
  add('enemy_bat', g, ['enemy','creature','animated','flying'], 1.4, [new THREE.AnimationClip('fly', .5, [
    new THREE.QuaternionKeyframeTrack('lWingPiv.quaternion', [0,.25,.5], qk([-.7,.5,-.7],'z')),
    new THREE.QuaternionKeyframeTrack('rWingPiv.quaternion', [0,.25,.5], qk([.7,-.5,.7],'z'))])]); }
{ const g = new THREE.Group(); const body = mesh(box(.7,.45,1.1), M(0xb5793f), 0, .75, 0); g.add(body);
  const hp = new THREE.Group(); hp.name = 'headPiv'; hp.position.set(0,.95,.6); g.add(hp);
  hp.add(mesh(box(.32,.3,.42), M(0xc98a4b), 0, .1, .1));
  for (const s of [-1,1]) { hp.add(mesh(box(.06,.22,.06), M(0x8a6a45), s*.12, .35, .05)); }
  for (const [x,z] of [[-.24,.4],[.24,.4],[-.24,-.4],[.24,-.4]]) { const p = new THREE.Group(); p.name = `leg${x<0?'l':'r'}${z>0?'f':'b'}Piv`; p.position.set(x,.6,z); g.add(p); p.add(mesh(box(.14,.55,.14), M(0xa06a35), 0, -.28, 0)); }
  add('animal_deer', g, ['animal','creature','animated','nature'], 1.3, [new THREE.AnimationClip('walk', .8, [
    new THREE.QuaternionKeyframeTrack('leglfPiv.quaternion', [0,.4,.8], qk([.5,-.5,.5])),
    new THREE.QuaternionKeyframeTrack('legrfPiv.quaternion', [0,.4,.8], qk([-.5,.5,-.5])),
    new THREE.QuaternionKeyframeTrack('leglbPiv.quaternion', [0,.4,.8], qk([-.5,.5,-.5])),
    new THREE.QuaternionKeyframeTrack('legrbPiv.quaternion', [0,.4,.8], qk([.5,-.5,.5]))])]); }

/* ---------------- VEHICLES + SPACE ---------------- */
{ const g = new THREE.Group(); g.add(mesh(box(1.8,.45,.9), M(0xd94f4f), 0, .45, 0)); g.add(mesh(box(1,.4,.82), M(0x9ad0e8,{rough:.2}), -.1, .82, 0));
  for (const [x,z] of [[-.6,.48],[.6,.48],[-.6,-.48],[.6,-.48]]) { const w = mesh(cyl(.22,.22,.16,10), M(0x2a2a2a), x, .24, z); w.rotation.x = 1.5708; g.add(w); }
  g.add(mesh(box(.1,.14,.7), M(0xffe9a8,{emissive:0xffd050,ei:.9}), .9, .5, 0)); add('car', g, ['vehicle','car'], 1); }
{ const g = new THREE.Group(); const h = mesh(box(1.9,.5,.85), M(0x8a5a34), 0, .3, 0); g.add(h); g.add(mesh(box(1.7,.1,.7), M(0xb5834f), 0, .55, 0));
  g.add(mesh(cyl(.05,.06,1.6,6), M(WOOD2), -.1, 1.35, 0)); const s = mesh(box(.06,1.1,.9), M(0xf0ece0), -.05, 1.3, 0); g.add(s);
  add('boat', g, ['vehicle','boat','water'], 2.1); }
{ const g = new THREE.Group(); g.add(mesh(box(1.1,.4,.75), M(0x8a6a45), 0, .55, 0));
  for (const z of [-.42,.42]) { const w = mesh(cyl(.3,.3,.1,10), M(0x6b4a2f), 0, .3, z); w.rotation.x = 1.5708; g.add(w); }
  g.add(mesh(box(.9,.08,.08), M(WOOD2), .9, .5, 0)); add('cart', g, ['vehicle','cart','village'], .9); }
{ const g = new THREE.Group(); g.add(mesh(cyl(.3,.34,1.6,10), M(0xe8e8ee,{metal:.3,rough:.4}), 0, 1.1, 0)); g.add(mesh(cone(.34,.7,10), M(0xd94f4f), 0, 2.25, 0));
  for (let i = 0; i < 3; i++) { const a = i/3*6.283; const f = mesh(box(.08,.5,.4), M(0xd94f4f), Math.cos(a)*.33, .5, Math.sin(a)*.33); f.rotation.y = -a; g.add(f); }
  g.add(mesh(cyl(.2,.28,.3,10), M(0xff8a2b,{emissive:0xff6a00,ei:1.2}), 0, .2, 0)); add('rocket', g, ['vehicle','rocket','space','scifi'], 2.6); }
{ const g = new THREE.Group(); g.add(mesh(jit(sph(.6,1), .18), M(0x7a7a86), 0, .6, 0)); add('asteroid', g, ['space','rock','scifi'], 1.2); }
{ const g = new THREE.Group(); g.add(mesh(sph(.9,2), M(0x4a7fd4,{rough:.6}), 0, .9, 0));
  const r = mesh(new THREE.TorusGeometry(1.4,.07,6,20), M(0xd8c08a,{rough:.5}), 0, .9, 0); r.rotation.x = 1.4; g.add(r); add('planet', g, ['space','planet','scifi'], 1.8); }
{ const g = new THREE.Group(); g.add(mesh(box(.5,.4,.5), M(0xd8d8e0,{metal:.4,rough:.35}), 0, 1, 0));
  for (const s of [-1,1]) g.add(mesh(box(.9,.03,.5), M(0x2a4a8a,{metal:.3,emissive:0x0a2a5a,ei:.4}), s*.72, 1, 0));
  g.add(mesh(cyl(.02,.02,.4,5), M(0xaaaab0), 0, 1.35, 0)); add('satellite', g, ['space','satellite','scifi'], 1.5); }
{ const g = new THREE.Group(); const s = mesh(new THREE.OctahedronGeometry(.3), M(0xffe066,{emissive:0xffc400,ei:1.3,rough:.3}), 0, .5, 0); s.scale.set(1,1.4,1); g.add(s);
  add('star_collectable', g, ['collectable','emissive','star','prop'], .8); }

const exporter = new GLTFExporter();
const index = [];
for (const m of models) {
  await new Promise((resolve, reject) => {
    exporter.parse(m.obj, (result) => {
      const buf = Buffer.from(result);
      fs.writeFileSync(`${OUT}/${m.name}.glb`, buf);
      index.push({ file: `${m.name}.glb`, tags: m.tags, height: m.height, bytes: buf.length, animations: (m.anims||[]).map(a=>a.name) });
      resolve();
    }, reject, { binary: true, animations: m.anims || [] });
  });
}
fs.writeFileSync(`${OUT}/_index.json`, JSON.stringify(index, null, 2));
const total = index.reduce((s,i)=>s+i.bytes,0);
console.log(`${index.length} models, ${(total/1024).toFixed(0)}KB total`);
console.log('animated:', index.filter(i=>i.animations.length).map(i=>i.file.replace('.glb','')).join(', '));
