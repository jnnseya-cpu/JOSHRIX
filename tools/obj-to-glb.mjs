/**
 * Convert OBJ+MTL model packs to GLB.
 * Asset packs from before glTF was universal ship OBJ/FBX/Blend only; a browser
 * game can load none of those. OBJ is plain text and its MTL materials here are
 * solid colours (verified: no map_Kd anywhere), so conversion is lossless.
 *
 *   node --import ./polyfill.mjs obj2glb.mjs <packsDir>
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

const PACKS = path.resolve(process.argv[2] || 'frontend/assets/models3d/packs');
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
const exporter = new GLTFExporter();

/** normalise a model so games can place it without guessing scale */
function normalise(obj) {
  const bb = new THREE.Box3().setFromObject(obj);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  // sit on y=0, centred on x/z
  obj.position.set(-center.x, -bb.min.y, -center.z);
  const g = new THREE.Group();
  g.add(obj);
  return { group: g, height: +size.y.toFixed(2) };
}

const objs = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.toLowerCase().endsWith('.obj')) objs.push(p);
  }
})(PACKS);

const results = [];
for (const objPath of objs) {
  const pack = path.relative(PACKS, objPath).split(path.sep)[0];
  const name = path.basename(objPath, path.extname(objPath));
  try {
    const mtlPath = objPath.replace(/\.obj$/i, '.mtl');
    let materials = null;
    if (fs.existsSync(mtlPath)) {
      materials = mtlLoader.parse(fs.readFileSync(mtlPath, 'utf8'), '');
      materials.preload();
    }
    if (materials) objLoader.setMaterials(materials);
    const parsed = objLoader.parse(fs.readFileSync(objPath, 'utf8'));
    objLoader.setMaterials(null);

    // OBJ/MTL is Phong; convert to StandardMaterial so PBR lighting + shadows work
    parsed.traverse((n) => {
      if (!n.isMesh) return;
      const src = Array.isArray(n.material) ? n.material : [n.material];
      const conv = src.map((m) => new THREE.MeshStandardMaterial({
        color: m?.color ?? new THREE.Color(0xcccccc),
        roughness: 0.75, metalness: 0.05, flatShading: false,
        ...(m?.emissive ? { emissive: m.emissive } : {}),
      }));
      n.material = Array.isArray(n.material) ? conv : conv[0];
      if (n.geometry) n.geometry.computeVertexNormals();
    });

    const { group, height } = normalise(parsed);
    const glb = await new Promise((res, rej) => exporter.parse(group, res, rej, { binary: true }));
    const buf = Buffer.from(glb);
    results.push({ pack, name, bytes: buf.length, height, buf, dir: path.dirname(objPath) });
  } catch (e) {
    results.push({ pack, name, error: String(e.message).slice(0, 100) });
  }
}

const byPack = {};
for (const r of results) (byPack[r.pack] ||= []).push(r);
for (const [pack, rows] of Object.entries(byPack)) {
  const ok = rows.filter((r) => !r.error);
  console.log(`${pack}: ${ok.length}/${rows.length} converted, ${(ok.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)}MB`);
  for (const r of rows.filter((r) => r.error)) console.log(`   ! ${r.name}: ${r.error}`);
}
fs.mkdirSync('converted', { recursive: true });
const index = [];
for (const r of results.filter((x) => !x.error)) {
  const slug = (r.pack + '_' + r.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  fs.writeFileSync(path.join('converted', slug + '.glb'), r.buf);
  index.push({ file: slug + '.glb', source: r.pack, height: r.height, bytes: r.buf.length });
}
fs.writeFileSync('converted/_index.json', JSON.stringify(index, null, 2));
console.log(`\nwrote ${index.length} GLB files to converted/`);
