// ================================================================
//  指尖初音 · 写实模型适配层
//  把 Tripo AI 生成的单网格 GLB（models/miku.glb）包装成和程序化
//  角色完全一样的接口，rig.js / main.js / ui.js 不用改就能驱动它。
//  · 单网格 → 三骨（胯 / 躯干 / 头）柔性蒙皮：点头、摇头、呼吸、转圈
//  · 眼睑：直接在模型材质里做遮罩（上睑下滑 / 下睑上抬）；嘴 / 腮红：贴在拟合出的脸部曲面上
//  · 热区：自建 12mm 均匀网格 + DDA 射线，命中 140 万面也只要 0.1ms
// ================================================================
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { clamp, damp, smoothstep, rand } from './build.js';
import { blushTexture } from './textures.js';
import { BoneRig, ClipPlayer } from './rigSkin.js';
import { installHair } from './hairRig.js';

const MODEL_URL = 'models/miku.glb';

// ---------- 尺寸（单位与程序化角色一致，脚底 y=0，总高 1.663）----------
const H = {
  ankle: 0.11, knee: 0.45, hip: 0.80, waist: 0.97, chest: 1.16,
  shoulder: 1.25, neck: 1.34, chin: 1.4035, mouth: 1.4347, eye: 1.4935, top: 1.663,
};
const BONE_Y = { hips: 0.80, torso: 1.14, head: 1.302 };
const BAND_HEAD = [1.33, 1.42];
const BAND_TORSO = [0.86, 1.16];
// 脖子：整段（脖子＋头）绕颈根 1.302 处刚性转动 —— 长度永远不变、下巴与脖子不会脱开；
// 过渡带藏在衣领里（r0 内是颈柱，r1 外是衣领/肩胸，不跟着头走）
const NECK = { cx: 0, cz: 0.065, r0: 0.085, r1: 0.125, y0: 1.245, y1: 1.302 };

// ---------- 脸部曲面：三次多项式拟合（残差 rms 0.5mm / 最大 1.4mm）----------
// z = Σ c[i] * T[i]，T = [1, v, v², v³, u, uv, uv², u², u²v, u³]，u=x-cx，v=y-cy
const FACE = {
  lidL: { cx: -0.052, cy: 1.4875, c: [0.208267, 0.132513, 10.868334, 22.282506, 0.363248, -8.454613, 145.191303, -5.500881, 131.94624, 232.531425] },
  lidR: { cx: 0.052, cy: 1.4875, c: [0.206222, 0.169432, 9.99735, 25.200583, -0.479828, 10.013157, -138.68969, -15.952588, 153.045799, -393.890103] },
  mouth: { cx: -0.002, cy: 1.437, c: [0.230968, 0.285881, -6.90506, 13.293081, -0.033901, -0.098761, -28.126425, -13.779681, 5.575978, 44.962713] },
};

function faceZ(f, x, y) {
  const u = x - f.cx, v = y - f.cy, c = f.c;
  return c[0] + c[1] * v + c[2] * v * v + c[3] * v * v * v + c[4] * u + c[5] * u * v
    + c[6] * u * v * v + c[7] * u * u + c[8] * u * u * v + c[9] * u * u * u;
}
function faceN(f, x, y) {
  const u = x - f.cx, v = y - f.cy, c = f.c;
  const du = c[4] + c[5] * v + c[6] * v * v + 2 * c[7] * u + 2 * c[8] * u * v + 3 * c[9] * u * u;
  const dv = c[1] + 2 * c[2] * v + 3 * c[3] * v * v + c[5] * u + 2 * c[6] * u * v + c[8] * u * u;
  const nx = clamp(-du, -2.6, 2.6), ny = clamp(-dv, -2.6, 2.6);
  const l = 1 / Math.hypot(nx, ny, 1);
  return [nx * l, ny * l, l];
}

// ---------- 眼睑：直接改模型自身材质的 albedo ----------
// 贴图上眼睛张开高度约 24mm（y 1.482–1.506）。上睑从双眼皮线一路滑到眼睑下缘，
// 下睑平时与下眼睑齐平、闭眼时微微上抬。遮罩做进模型自己的材质里，
// 光照 / 法线 / 深度天然和周围皮肤一致，不会有贴片接缝或浮在脸上的问题。
const LID = {
  crease: 1.5122, closed: 1.4782, arc: 0.0026, lowerRest: 1.4824, lowerUp: 0.0056,
  eyeCx: 0.047, eyeHx: 0.0255,
};

function lidMaskGLSL(lid) {
  return (
    '  float lidGain = 0.0;\n' +
    '  if (vLidPos.y > 1.452 && vLidPos.y < 1.538 && abs(vLidPos.x) < 0.098) {\n' +
    '    float ldx = (abs(vLidPos.x) - ' + lid.eyeCx.toFixed(5) + ') / ' + lid.eyeHx.toFixed(5) + ';\n' +
    '    float llat = 1.0 - smoothstep(0.86, 1.12, abs(ldx));\n' +
    '    float lUp = vLidPos.x > 0.0 ? uLidUp.x : uLidUp.y;\n' +
    '    float lCl = clamp((' + lid.crease.toFixed(5) + ' - lUp) / ' + (lid.crease - lid.closed).toFixed(5) + ', 0.0, 1.0);\n' +
    '    lUp -= ' + lid.arc.toFixed(5) + ' * lCl * clamp(1.0 - ldx * ldx * 1.35, 0.0, 1.0);\n' +
    '    float lLo = vLidPos.x > 0.0 ? uLidLo.x : uLidLo.y;\n' +
    '    float mUp = smoothstep(lUp - uSoft, lUp + uSoft, vLidPos.y)\n' +
    '      * (1.0 - smoothstep(' + lid.crease.toFixed(5) + ' - uSoft * 2.5, ' + lid.crease.toFixed(5) + ', vLidPos.y));\n' +
    '    float mLo = (1.0 - smoothstep(lLo - uSoft, lLo + uSoft, vLidPos.y))\n' +
    '      * smoothstep(' + lid.lowerRest.toFixed(5) + ' - uSoft * 2.5, ' + lid.lowerRest.toFixed(5) + ', vLidPos.y);\n' +
    '    lidGain = max(mUp, mLo) * llat;\n' +
    '    float lash = 1.0 - smoothstep(0.0, 0.0045, vLidPos.y - lUp);\n' +
    '    diffuseColor.rgb = mix(diffuseColor.rgb, uSkin * (1.0 - 0.13 * lash), lidGain);\n' +
    '  }\n'
  );
}

function installLidShader(material, skinColor) {
  const uniforms = {
    uSkin: { value: new THREE.Color(skinColor) },
    uLidUp: { value: new THREE.Vector2(LID.crease, LID.crease) },
    uLidLo: { value: new THREE.Vector2(LID.lowerRest, LID.lowerRest) },
    uSoft: { value: 0.0009 },
  };
  const decl = 'varying vec3 vLidPos;\nuniform vec3 uSkin;\nuniform vec2 uLidUp;\nuniform vec2 uLidLo;\nuniform float uSoft;';
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLidPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLidPos = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + decl)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + lidMaskGLSL(LID))
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= (1.0 - lidGain);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix(roughnessFactor, 0.82, lidGain);');
  };
  material.needsUpdate = true;
  return uniforms;
}

// 贴在脸面上的椭圆片（嘴 / 腮红）
function ellipseGeo(f, cx, cy, rx, ry, off, rings) {
  const pos = [], nor = [], uv = [], idx = [];
  pos.push(cx, cy, faceZ(f, cx, cy) + off);
  nor.push(...faceN(f, cx, cy));
  uv.push(0.5, 0.5);
  const SEG = 34;
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx * rr, y = cy + Math.sin(a) * ry * rr;
      pos.push(x, y, faceZ(f, x, y) + off);
      nor.push(...faceN(f, x, y));
      uv.push(0.5 + 0.5 * Math.cos(a) * rr, 0.5 + 0.5 * Math.sin(a) * rr);
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * SEG, b0 = 1 + r * SEG;
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      idx.push(a0 + s, b0 + s, a0 + s2, a0 + s2, b0 + s, b0 + s2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- 均匀网格射线加速器 ----------
function buildGrid(pos, idx) {
  const cell = 0.012;
  const mn = [-0.60, -0.02, -0.36];
  const nx = 100, ny = 144, nz = 60;
  const nc = nx * ny * nz;
  const counts = new Int32Array(nc);
  const tris = idx.length / 3;
  function cellRange(t, out) {
    for (let a = 0; a < 3; a++) {
      const i0t = idx[t * 3] * 3, i1t = idx[t * 3 + 1] * 3, i2t = idx[t * 3 + 2] * 3;
      const p0 = pos[i0t + a], p1 = pos[i1t + a], p2 = pos[i2t + a];
      let lo = Math.min(p0, p1, p2), hi = Math.max(p0, p1, p2);
      let i0 = Math.floor((lo - mn[a]) / cell), i1 = Math.floor((hi - mn[a]) / cell);
      const lim = [nx, ny, nz][a];
      i0 = clamp(i0, 0, lim - 1); i1 = clamp(i1, 0, lim - 1);
      if (i1 - i0 > 2) { const mid = Math.floor((i0 + i1) / 2); i0 = mid; i1 = mid; }
      out[a * 2] = i0; out[a * 2 + 1] = i1;
    }
    return out;
  }
  const rng = new Int32Array(6);
  for (let t = 0; t < tris; t++) {
    cellRange(t, rng);
    for (let i = rng[0]; i <= rng[1]; i++) for (let j = rng[2]; j <= rng[3]; j++) for (let k = rng[4]; k <= rng[5]; k++)
      counts[(i * ny + j) * nz + k]++;
  }
  const starts = new Int32Array(nc + 1);
  for (let i = 0; i < nc; i++) starts[i + 1] = starts[i] + counts[i];
  const list = new Int32Array(starts[nc]);
  const cur = starts.slice(0, nc);
  for (let t = 0; t < tris; t++) {
    cellRange(t, rng);
    for (let i = rng[0]; i <= rng[1]; i++) for (let j = rng[2]; j <= rng[3]; j++) for (let k = rng[4]; k <= rng[5]; k++)
      list[cur[(i * ny + j) * nz + k]++] = t;
  }
  return { cell, mn, nx, ny, nz, starts, list, pos, idx, tris };
}

const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _pv = new THREE.Vector3(), _nrm = new THREE.Vector3();
const _tv = new THREE.Vector3(), _qv = new THREE.Vector3();
function gridRaycast(g, ro, rd, far, out) {
  const cell = g.cell;
  let t0 = 0, t1 = far;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ro.x : a === 1 ? ro.y : ro.z;
    const d = a === 0 ? rd.x : a === 1 ? rd.y : rd.z;
    const hi = g.mn[a] + [g.nx, g.ny, g.nz][a] * cell;
    if (Math.abs(d) < 1e-9) { if (o < g.mn[a] || o > hi) return false; continue; }
    let ta = (g.mn[a] - o) / d, tb = (hi - o) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  const step = cell * 0.5;
  const pos = g.pos, idx = g.idx;
  for (let t = t0; t <= t1; t += step) {
    const px = ro.x + rd.x * t, py = ro.y + rd.y * t, pz = ro.z + rd.z * t;
    const i = Math.floor((px - g.mn[0]) / cell), j = Math.floor((py - g.mn[1]) / cell), k = Math.floor((pz - g.mn[2]) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    const cc = (i * g.ny + j) * g.nz + k;
    let bestT = Infinity, bestTri = -1;
    for (let s = g.starts[cc]; s < g.starts[cc + 1]; s++) {
      const tri = g.list[s] * 3;
      const a0 = idx[tri] * 3, b0 = idx[tri + 1] * 3, c0 = idx[tri + 2] * 3;
      _v0.set(pos[a0], pos[a0 + 1], pos[a0 + 2]);
      _v1.set(pos[b0], pos[b0 + 1], pos[b0 + 2]);
      _v2.set(pos[c0], pos[c0 + 1], pos[c0 + 2]);
      _e1.subVectors(_v1, _v0); _e2.subVectors(_v2, _v0);
      _pv.crossVectors(rd, _e2);
      const det = _e1.dot(_pv);
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const tv = _tv.copy(ro).sub(_v0);
      const u = tv.dot(_pv) * inv;
      if (u < 0 || u > 1) continue;
      const qv = _qv.crossVectors(tv, _e1);
      const v = rd.dot(qv) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = _e2.dot(qv) * inv;
      if (tt > 0.001 && tt < bestT) { bestT = tt; bestTri = g.list[s]; }
    }
    if (bestTri >= 0 && bestT <= t + step) {
      const tri = bestTri * 3;
      const a0 = idx[tri] * 3, b0 = idx[tri + 1] * 3, c0 = idx[tri + 2] * 3;
      _v0.set(pos[a0], pos[a0 + 1], pos[a0 + 2]);
      _v1.set(pos[b0], pos[b0 + 1], pos[b0 + 2]);
      _v2.set(pos[c0], pos[c0 + 1], pos[c0 + 2]);
      _nrm.subVectors(_v1, _v0).cross(_v2.clone().sub(_v0)).normalize();
      out.push({ t: bestT, tri: bestTri, n: _nrm.clone() });
      return true;
    }
  }
  return false;
}

// ---------- 热区判定 ----------
function makeTails() {
  const mk = (side) => {
    const p = [];
    for (let i = 0; i < 12; i++) {
      const u = i / 11;
      p.push(new THREE.Vector3(side * (0.16 + 0.24 * u), 1.42 - 1.06 * u, -0.02 + 0.12 * u));
    }
    return { side, strand: { n: 12, p, pullAt: 0, pull: new THREE.Vector3(), step() {}, spine(b) { return b; } } };
  };
  return [mk(1), mk(-1)];
}

// ---------- 主函数 ----------
export function buildModelCharacter(opts = {}) {
  const renderer = opts.renderer, scene = opts.scene;

  const root = new THREE.Group();
  const body = new THREE.Group();
  const act = new THREE.Group();
  root.add(body); body.add(act);

  // ---- 骨架：胯 → 躯干 → 头 ----
  let boneHips = new THREE.Bone(); boneHips.position.set(0, BONE_Y.hips, 0);
  let boneTorso = new THREE.Bone(); boneTorso.position.set(0, BONE_Y.torso - BONE_Y.hips, 0);
  let boneHead = new THREE.Bone(); boneHead.position.set(0, BONE_Y.head - BONE_Y.torso, 0);
  boneHips.add(boneTorso); boneTorso.add(boneHead);

  // ---- 占位节点：让 rig.js 的四肢动画代码不报错 ----
  const dummy = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  let arms = {};
  for (const key of ['L', 'R']) {
    const sx = key === 'L' ? 1 : -1;
    const shoulder = dummy(boneTorso, sx * 0.115, 0.10, 0);
    const elbow = dummy(shoulder, sx * 0.02, -0.26, 0);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const root2 = dummy(elbow, sx * 0.012, -0.22, 0.012 * (i - 1.5));
      fingers.push({ root: root2, mid: dummy(root2, 0, -0.04, 0) });
    }
    const thumbRoot = dummy(elbow, -sx * 0.03, -0.16, 0.03);
    arms[key] = {
      shoulder, elbow, fingers, thumb: { root: thumbRoot, mid: dummy(thumbRoot, 0, -0.035, 0) },
      rest: { shoulder: [0, 0, 0], elbow: [0, 0, 0] },
    };
  }
  let legs = { L: { knee: dummy(boneHips, 0.06, -0.32, 0) }, R: { knee: dummy(boneHips, -0.06, -0.32, 0) } };

  // ---- 头部挂件容器（模型空间 → 骨头局部空间）----
  let boneNeck = null;

const headRig = new THREE.Group();
  headRig.position.set(0, -BONE_Y.head, 0);
  boneHead.add(headRig);

  // ---- 眼睛（占位：外观由眼睑贴片负责）----
  const eyeList = [], lidPivots = [];
  for (let i = 0; i < 2; i++) {
    eyeList.push({ group: new THREE.Object3D(), side: i === 0 ? 1 : -1, baseY: 0, aim: null });
    const p = new THREE.Object3D();
    lidPivots.push(p);
  }

  // ---- 腮红 / 嘴 ----
  const blushMat = new THREE.MeshBasicMaterial({
    map: blushTexture(), transparent: true, opacity: 0, depthWrite: false,
  });
  const blushList = [];
  for (const side of [-1, 1]) {
    const f = side < 0 ? FACE.lidL : FACE.lidR;
    const g = ellipseGeo(f, side * 0.058, 1.470, 0.021, 0.0125, 0.0042, 3);
    const m = new THREE.Mesh(g, blushMat);
    m.castShadow = false; m.renderOrder = 6;
    headRig.add(m); blushList.push(m);
  }
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x4a1119, roughness: 0.55, metalness: 0.0,
    transparent: true, opacity: 1, side: THREE.DoubleSide,
  });
  const mouthMesh = new THREE.Mesh(ellipseGeo(FACE.mouth, -0.002, 1.4347, 0.0292, 0.0098, 0.0038, 3), mouthMat);
  mouthMesh.castShadow = false; mouthMesh.renderOrder = 5;
  mouthMesh.visible = false;
  headRig.add(mouthMesh);

  let mouthShape = 'closed', mouthT = 0;
  function setShape(shape, t = 0) {
    mouthShape = shape; mouthT = t;
    let sx = 1, sy = 1, on = true;
    if (shape === 'open') { sy = 0.5 + 2.0 * clamp(t, 0, 1); sx = 0.95; }
    else if (shape === 'sing') { sy = 0.5 + 1.5 * clamp(t, 0, 1); sx = 0.9; }
    else if (shape === 'o') { sy = 1.9; sx = 0.62; }
    else if (shape === 'grin') { sy = 0.75; sx = 1.18; }
    else { on = false; }
    mouthMesh.visible = on;
    if (!on) return;
    mouthMesh.scale.set(sx, sy, 1);
    mouthMat.opacity = shape === 'grin' ? 0.85 : 1;
  }

  // ---- 热区格 + 假发尾 ----
  const tails = makeTails();
  let grid = null, mesh = null, material = null;
  let rigMapper = null, rigPlayer = null, hairRig = null;
  let groundIdx = [];
  let lidUniforms = null;
  let envTex = null;

  const debugZones = new THREE.Group();
  debugZones.visible = false;
  root.add(debugZones);
  {
    const zm = new THREE.MeshBasicMaterial({ color: 0x3fd8c0, wireframe: true, transparent: true, opacity: 0.55, depthTest: false });
    const spots = [
      ['headTop', 0, 1.62, 0, 0.07], ['forehead', 0, 1.545, 0.19, 0.05],
      ['cheekL', 0.062, 1.470, 0.19, 0.04], ['cheekR', -0.062, 1.470, 0.19, 0.04],
      ['mouth', -0.002, 1.4347, 0.23, 0.03], ['chin', 0, 1.408, 0.21, 0.03],
      ['earL', 0.115, 1.50, 0.02, 0.045], ['earR', -0.115, 1.50, 0.02, 0.045],
      ['neck', 0, 1.345, 0.09, 0.05], ['chest', 0, 1.13, 0.13, 0.08],
      ['belly', 0, 1.02, 0.12, 0.08], ['waist', 0, 0.94, 0.12, 0.07],
      ['skirt', 0, 0.82, 0.15, 0.10], ['hip', 0, 0.80, 0.10, 0.08],
      ['handL', 0.19, 0.76, 0.03, 0.05], ['handR', -0.19, 0.76, 0.03, 0.05],
      ['kneeL', 0.08, 0.45, 0.10, 0.05], ['kneeR', -0.08, 0.45, 0.10, 0.05],
      ['shoeL', 0.08, 0.05, 0.10, 0.05], ['shoeR', -0.08, 0.05, 0.10, 0.05],
      ['tailL', 0.34, 1.05, -0.02, 0.07], ['tailR', -0.34, 1.05, -0.02, 0.07],
    ];
    for (const [n, x, y, z, r] of spots) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), zm);
      s.position.set(x, y, z); s.userData.label = n; debugZones.add(s);
    }
  }

  // ---------- 载入 GLB ----------
  const readyCbs = [];
  let ready = false;
  const api = {
    isModel: true, root, body, act,
    get hips() { return boneHips; }, get torso() { return boneTorso; },
    get head() { return boneHead; }, get neck() { return boneNeck; },
    mat: {},
    eye: { list: eyeList },
    lidPivots, lids: [],
    brows: [],
    mouth: { mesh: mouthMesh, group: mouthMesh, setShape },
    blush: blushList, blushMat,
    get arms() { return arms; }, get legs() { return legs; }, tails,
    hitMeshes: [], resolveZone, update, nudgeHair,
    debugZones,
    get ready() { return ready; },
    get env() { return envTex; },
    whenReady(cb) { if (ready) cb(); else readyCbs.push(cb); },
    onAction(name, arg) { onAction(name, arg); },
    playClip(name, opts) { return playClip(name, opts); },
    get anim() { return rigPlayer; },
    get clips() { return rigPlayer ? rigPlayer.names : []; },
    dispose() { try { root.removeFromParent(); } catch (e) { /* ignore */ } },
  };

  const loader = new GLTFLoader();
  const onLoaded = (gltf) => {
    const src = gltf.scene;
    src.updateMatrixWorld(true);
    let skm = null;
    src.traverse((o) => { if (o.isSkinnedMesh && !skm) skm = o; });
    if (skm && skm.skeleton && skm.skeleton.bones.length >= 8) { onLoadedRigged(gltf, src, skm); return; }
    let m = null;
    src.traverse((o) => { if (o.isMesh && !m) m = o; });
    if (!m) { ready = true; readyCbs.forEach((c) => c()); return; }
    material = m.material;

    // 1) 把原始朝向/尺寸烘进顶点：正面 → +Z，脚底 → y=0，总高 1.663
    const geom = m.geometry;
    geom.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const s = H.top / (bb.max.y - bb.min.y);
    const fix = new THREE.Matrix4().makeTranslation(0, -bb.min.y * s, 0)
      .multiply(new THREE.Matrix4().makeScale(s, s, s));
    geom.applyMatrix4(fix);
    geom.computeBoundingBox();

    // 2) 三个骨头的柔性权重（按高度平滑过渡）
    const pos = geom.attributes.position;
    const n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      const rNeck = Math.hypot(pos.getX(i) - NECK.cx, pos.getZ(i) - NECK.cz);
      const tube = (1 - smoothstep(NECK.r0, NECK.r1, rNeck)) * smoothstep(NECK.y0, NECK.y1, y);
      const wh = Math.max(smoothstep(BAND_HEAD[0], BAND_HEAD[1], y), tube);
      const a = smoothstep(BAND_TORSO[0], BAND_TORSO[1], y);
      let wt = (1 - wh) * a, wp = 1 - wh - wt;
      if (wp < 0) { wp = 0; wt = 1 - wh; }
      const sum = wh + wt + wp || 1;
      si[i * 4] = 2; sw[i * 4] = wh / sum;
      si[i * 4 + 1] = 1; sw[i * 4 + 1] = wt / sum;
      si[i * 4 + 2] = 0; sw[i * 4 + 2] = wp / sum;
      si[i * 4 + 3] = 0; sw[i * 4 + 3] = 0;
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

    // 3) 蒙皮网格
    const sk = new THREE.SkinnedMesh(geom, material);
    sk.castShadow = true;
    sk.receiveShadow = false;
    sk.frustumCulled = false;
    sk.add(boneHips);
    sk.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([boneHips, boneTorso, boneHead]);
    sk.bind(skeleton);
    act.add(sk);
    mesh = sk;
    api.mat = material;

    // 4) 眼睑遮罩：取脸上亮部皮肤的平均色，装进模型自身材质
    lidUniforms = installLidShader(material, sampleSkinColor(geom, material));
    for (let i = 0; i < 2; i++) headRig.add(lidPivots[i]);

    // 5) 命中加速格
    grid = buildGrid(geom.attributes.position.array, geom.index.array);

    // 6) 环境光照（PBR 材质需要环境贴图才不显灰）
    if (renderer) {
      envTex = makeEnv(renderer);
      if (scene) scene.environment = envTex;
    }
    material.envMapIntensity = 0.9;
    material.needsUpdate = true;

    ready = true;
    readyCbs.forEach((c) => c());
  };
  if (opts.gltf) onLoaded(opts.gltf);
  else loader.load(MODEL_URL, onLoaded, undefined, (err) => {
    console.warn('模型载入失败：', err && err.message ? err.message : err);
    ready = true;
    readyCbs.forEach((c) => c());
  });


  // ---------- 写实模型 · Tripo 自动绑定骨骼（真人骨架 + 真人动作）----------
  function playClip(name, opts) { return rigPlayer ? rigPlayer.play(name, opts) : false; }
  function stopClip() { if (rigPlayer) rigPlayer.stop(); }

  function onLoadedRigged(gltf, src, sk) {
    material = sk.material;
    const geom = sk.geometry;

    // 1) 朝向 / 尺寸烘进顶点：正面 → +Z、脚底 y=0、总高 1.663（和三骨版同一套坐标）
    src.updateMatrixWorld(true);
    const wm = sk.matrixWorld.clone();
    const box = new THREE.Box3().setFromBufferAttribute(geom.attributes.position).applyMatrix4(wm);
    const sc = H.top / (box.max.y - box.min.y);
    const A = new THREE.Matrix4().makeTranslation(0, -box.min.y * sc, 0)
      .multiply(new THREE.Matrix4().makeScale(sc, sc, sc))
      .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    geom.applyMatrix4(new THREE.Matrix4().multiplyMatrices(A, wm));
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    // 2) 骨架整体套同一个 A；网格从骨架里搬出来（自身矩阵保持单位阵，蒙皮才自洽）
    const bones = sk.skeleton.bones;
    let armRoot = bones[0];
    while (armRoot.parent && armRoot.parent !== src && armRoot.parent !== sk) armRoot = armRoot.parent;
    const rigRoot = new THREE.Group();
    rigRoot.name = 'rigRoot';
    rigRoot.applyMatrix4(A);
    act.add(rigRoot);
    rigRoot.add(armRoot);
    if (sk.parent) sk.parent.remove(sk);
    sk.position.set(0, 0, 0);
    sk.rotation.set(0, 0, 0);
    sk.scale.set(1, 1, 1);
    sk.frustumCulled = false;
    sk.castShadow = true;
    sk.receiveShadow = false;
    act.add(sk);
    root.updateMatrixWorld(true);
    sk.skeleton.calculateInverses();
    sk.bind(sk.skeleton);
    mesh = sk;
    api.mat = material;
    // 鞋底采样点：跳舞时动作片段会把脚抬离地面，用这些点做贴地校正
    {
      const p = geom.attributes.position, cand = [];
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.16) cand.push(i);
      const step = Math.max(1, Math.floor(cand.length / 900));
      for (let i = 0; i < cand.length; i += step) groundIdx.push(cand[i]);
    }

    // 3) 认骨头（Mixamo 命名），给 rig.js 造代理节点
    const rig = new BoneRig(bones, rigRoot);
    const bHips = rig.find('hips', 'pelvis');
    const bSpine = rig.find('spine2', 'spine1', 'spine', 'chest');
    const bNek = rig.find('neck');
    const bHeadBone = rig.find('head');
    if (!bHips || !bHeadBone) console.warn('骨骼命名没认出来：', bones.map((b) => b.name).join(','));
    boneHips = rig.proxy(bHips);
    boneTorso = rig.proxy(bSpine);
    boneNeck = bNek;
    // 头：脖子分担 42%、头骨 58% —— 头骨原点就是颅底关节，转头才像真人
    boneHead = rig.proxy(bHeadBone, { k: 0.58, extra: bNek ? [{ bone: bNek, k: 0.42 }] : null });
    const mkArm = (up, fore, hand) => ({
      shoulder: rig.proxy(up, { sz: -1 }),
      elbow: rig.proxy(fore, { sx: -1 }),
      fingers: [{ root: rig.proxy(hand, { sx: -1 }), mid: rig.proxy(null) },
        { root: rig.proxy(null), mid: rig.proxy(null) },
        { root: rig.proxy(null), mid: rig.proxy(null) },
        { root: rig.proxy(null), mid: rig.proxy(null) }],
      thumb: { root: rig.proxy(null), mid: rig.proxy(null) },
      rest: { shoulder: [0, 0, 0], elbow: [0, 0, 0] },
    });
    arms = {
      L: mkArm(rig.find('leftarm'), rig.find('leftforearm'), rig.find('lefthand')),
      R: mkArm(rig.find('rightarm'), rig.find('rightforearm'), rig.find('righthand')),
    };
    legs = {
      L: {
        upper: rig.proxy(rig.find('leftupleg', 'leftupperleg', 'leftthigh')),
        knee: rig.proxy(rig.find('leftleg', 'leftknee')),
        foot: rig.proxy(rig.find('leftfoot')),
      },
      R: {
        upper: rig.proxy(rig.find('rightupleg', 'rightupperleg', 'rightthigh')),
        knee: rig.proxy(rig.find('rightleg', 'rightknee')),
        foot: rig.proxy(rig.find('rightfoot')),
      },
    };
    rigMapper = rig;

    // 3.5) 头发：Tripo 把长马尾误绑到手臂/腿上（挥手跳舞会被扯成尖刺），
    //      这里按贴图颜色认出头发顶点，重新绑到挂在头骨下的发骨链上
    hairRig = installHair({ geom, mesh: sk, headBone: bHeadBone, rig, root: rigRoot, skeleton: sk.skeleton });
    api.hair = hairRig ? hairRig.info : null;

    // 4) 头部挂件跟着真实头骨走（挂在骨头上，不挂代理，免得旋转被算两遍）
    if (headRig.parent) headRig.parent.remove(headRig);
    bHeadBone.add(headRig);
    headRig.matrixAutoUpdate = false;
    headRig.matrix.copy(bHeadBone.matrixWorld).invert();
    headRig.matrixWorldNeedsUpdate = true;

    // 5) 眼睑遮罩 / 命中格 / 环境光
    lidUniforms = installLidShader(material, sampleSkinColor(geom, material));
    for (let i = 0; i < 2; i++) headRig.add(lidPivots[i]);
    grid = buildGrid(geom.attributes.position.array, geom.index.array);
    if (renderer) {
      envTex = makeEnv(renderer);
      scene.environment = envTex;
    }
    material.envMapIntensity = 0.9;
    material.needsUpdate = true;

    // 6) 真人动作：待机常驻，其余动作按需淡入
    // Tripo 重定向会给每段动作烘一个各不相同的胯部常量偏移（最大接近半身长），
    // 统一归一化到静止位置：只保留每段动作自身的相对起伏
    for (const clip of gltf.animations || []) {
      for (const tr of clip.tracks) {
        if (!/Hips\.position$/.test(tr.name)) continue;
        const v = tr.values;
        const x0 = v[0], y0 = v[1], z0 = v[2];
        const rx = bHips ? bHips.position.x : 0, ry = bHips ? bHips.position.y : 0, rz = bHips ? bHips.position.z : 0;
        for (let i = 0; i < v.length; i += 3) {
          v[i] = rx + (v[i] - x0);
          v[i + 1] = ry + (v[i + 1] - y0);
          v[i + 2] = rz + (v[i + 2] - z0);
        }
        // 舞步片段自带大幅胯部升降，角色会整体离地：只保留水平摆动
        if (clip.name === 'dance_02') {
          for (let i = 1; i < v.length; i += 3) v[i] = ry;
        }
      }
    }
    rigPlayer = new ClipPlayer(rigRoot, gltf.animations || []);
    if (!rigPlayer.names.length) console.warn('模型里没有动画剪辑');
    api.clipped = true;
    api.bones = bones;
    api.mesh = sk;
    api.skeleton = sk.skeleton;
    api.rigRoot = rigRoot;
    api.hipsBone = bHips;
    api.headBone = bHeadBone;

    ready = true;
    readyCbs.forEach((c) => c());
  }

  // 皮肤取样：脸上靠前的皮肤顶点，取亮部平均色
  function sampleSkinColor(geom, mat) {
    const img = mat.map && mat.map.image;
    if (!img) return 0xe6cbb4;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let data;
    try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch (e) { return 0xe6cbb4; }
    const posA = geom.attributes.position, uvA = geom.attributes.uv;
    let r = 0, g = 0, b = 0, cnt = 0;
    const lum = [];
    const cand = [];
    for (let i = 0; i < posA.count; i += 3) {
      const x = posA.getX(i), y = posA.getY(i), z = posA.getZ(i);
      if (y < 1.45 || y > 1.56 || Math.abs(x) > 0.095 || z < 0.17) continue;
      let u = uvA.getX(i), v = uvA.getY(i);
      u -= Math.floor(u); v -= Math.floor(v);
      const px = Math.min(c.width - 1, Math.floor(u * c.width));
      const py = Math.min(c.height - 1, Math.floor(v * c.height));
      const o = (py * c.width + px) * 4;
      const rr = data[o], gg = data[o + 1], bb2 = data[o + 2];
      if (bb2 >= rr + 6) continue;
      cand.push([rr, gg, bb2, rr * 0.3 + gg * 0.6 + bb2 * 0.1]);
    }
    if (!cand.length) return 0xe6cbb4;
    cand.sort((a, b2) => a[3] - b2[3]);
    const from = Math.floor(cand.length * 0.7);
    for (let i = from; i < cand.length; i++) { r += cand[i][0]; g += cand[i][1]; b += cand[i][2]; cnt++; }
    if (!cnt) return 0xe6cbb4;
    const mix = (v) => clamp(Math.round(v / cnt), 0, 255);
    return (mix(r) << 16) | (mix(g) << 8) | mix(b);
  }

  function makeEnv(rend) {
    const pm = new THREE.PMREMGenerator(rend);
    pm.compileEquirectangularShader();
    const s = new THREE.Scene();
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g2 = c.getContext('2d');
    const grd = g2.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#bfe9ff');
    grd.addColorStop(0.45, '#5f8f9c');
    grd.addColorStop(0.55, '#20343c');
    grd.addColorStop(1, '#0a1418');
    g2.fillStyle = grd; g2.fillRect(0, 0, 256, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const env = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide }));
    s.add(env);
    const bright = new THREE.MeshBasicMaterial({ color: 0xdffcff });
    const box1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 0.1), bright);
    box1.position.set(2.0, 1.9, 1.4); box1.lookAt(0, 0.9, 0); s.add(box1);
    const box2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.1), bright);
    box2.position.set(-2.2, 1.2, 1.0); box2.lookAt(0, 0.9, 0); s.add(box2);
    const rt = pm.fromScene(s, 0.035);
    pm.dispose();
    return rt.texture;
  }

  // ---------- 热区 ----------
  function headZone(x, y, z) {
    const ax = Math.abs(x), L = x > 0;
    if (y > 1.600) return 'headTop';
    if (z < -0.03) return ax > 0.10 ? 'hair' : 'headBack';
    if (ax > 0.128) return 'hair';
    if (ax > 0.098 && y > 1.400) return 'hair';
    if (ax > 0.088 && y > 1.425 && y < 1.585 && z < 0.09) return L ? 'earL' : 'earR';
    if (y > 1.532) return 'forehead';
    if (y > 1.512) return 'forehead';
    if (y > 1.466) return ax > 0.024 ? (L ? 'cheekL' : 'cheekR') : 'forehead';
    if (y > 1.442) return ax > 0.040 ? (L ? 'cheekL' : 'cheekR') : 'forehead';
    if (y > 1.421) return ax < 0.038 ? 'mouth' : (L ? 'cheekL' : 'cheekR');
    return 'chin';
  }

  const TAIL_MID = new THREE.Vector3();
  function resolveZone(p, obj) {
    const x = p.x, y = p.y, z = p.z, ax = Math.abs(x);
    let name = 'belly', coarse = 'body', tail = null, detail = null;
    // 发尾：离身体主干的横向范围之外
    const isTail = (ax > 0.275 && y < 1.60) || (ax > 0.30) || (ax > 0.20 && y < 0.34);
    if (isTail) {
      coarse = x > 0 ? 'tailL' : 'tailR';
      const tl = tails.find((t2) => (t2.side > 0 ? 'tailL' : 'tailR') === coarse);
      tail = tl || null;
      if (tl) {
        let best = 0, bd = 1e9;
        for (let i = 0; i < tl.strand.n; i++) {
          const d = tl.strand.p[i].distanceToSquared(p);
          if (d < bd) { bd = d; best = i; }
        }
        detail = best / 11;
      }
      name = coarse;
    } else if (y > H.chin) {
      coarse = 'head';
      name = headZone(x, y, z);
    } else if (y > 1.29) {
      coarse = 'body';
      name = ax < 0.10 ? 'neck' : (x > 0 ? 'shoulderL' : 'shoulderR');
    } else if (y > 1.235) {
      coarse = 'body';
      name = ax > 0.085 ? (x > 0 ? 'shoulderL' : 'shoulderR') : 'chest';
    } else if (y > 1.10) {
      coarse = 'body';
      name = ax > 0.105 ? (x > 0 ? 'shoulderL' : 'shoulderR') : 'chest';
    } else if (y > 1.00) {
      coarse = 'body';
      if (ax > 0.125 && ax < 0.255 && z > -0.14 && z < 0.12) name = x > 0 ? 'handL' : 'handR';
      else name = ax > 0.105 ? (x > 0 ? 'shoulderL' : 'shoulderR') : 'chest';
    } else if (y > 0.84) {
      coarse = 'body';
      name = (ax > 0.135 && ax < 0.27) ? (x > 0 ? 'handL' : 'handR') : (y > 0.95 ? 'belly' : 'waist');
    } else if (y > 0.735) {
      coarse = 'body';
      name = (ax > 0.135 && ax < 0.27) ? (x > 0 ? 'handL' : 'handR') : 'skirt';
    } else if (y > 0.66) {
      coarse = 'body';
      name = (ax > 0.135 && ax < 0.27) ? (x > 0 ? 'handL' : 'handR') : (y > 0.70 ? 'hip' : (x > 0 ? 'thighL' : 'thighR'));
    } else if (y > 0.50) {
      coarse = 'leg';
      name = x > 0 ? 'thighL' : 'thighR';
    } else if (y > 0.395) {
      coarse = 'leg';
      name = x > 0 ? 'kneeL' : 'kneeR';
    } else if (y > 0.145) {
      coarse = 'leg';
      name = x > 0 ? 'sockL' : 'sockR';
    } else if (y > 0.085) {
      coarse = 'leg';
      name = x > 0 ? 'ankleL' : 'ankleR';
    } else {
      coarse = 'shoe';
      name = x > 0 ? 'shoeL' : 'shoeR';
    }
    if (!tail && (name === 'tailL' || name === 'tailR')) {
      // 保证主循环里的发尾拖拽代码有对象可用
      tail = tails.find((t2) => (t2.side > 0 ? 'tailL' : 'tailR') === name) || null;
      if (tail) detail = 0.5;
    }
    return { name, coarse, tail, detail };
  }

  function nudgeHair(dir, idx, tail) {
    // 单网格无法真拽头发：改成整身被拽一下，看得见反应
    tailKick = clamp((tailKick || 0) + dir.x * 1.6, -0.6, 0.6);
    tailKickT = 1.4;
  }

  // ---------- 表演（由 rig.js 的动作回调转发过来）----------
  const actState = { wave: 0, pat: 0, shy: 0, singOn: false, danceOn: false, startle: 0, lean: 0 };
  let tailKick = 0, tailKickT = 0;
  const lowSmooth = [0, 0];
  function onAction(name, arg) {
    switch (name) {
      case 'wave': actState.wave = typeof arg === 'number' ? arg : 2.6; playClip('wave_goodbye_02', { fitTo: 3.4 }); break;
      case 'patHead': actState.pat = 1.3; break;
      case 'squish': actState.shy = 1.6; break;
      case 'tickle': actState.pat = 1.2; break;
      case 'giggle': actState.pat = Math.max(actState.pat, 0.8); playClip('laugh_01', { fitTo: 2.6 }); break;
      case 'startle': actState.startle = 1.0; break;
      case 'shyPose': actState.shy = 2.4; break;
      case 'sing': actState.singOn = !!arg; if (arg) playClip('sing_01', { loop: true }); else stopClip(); break;
      case 'dance': actState.danceOn = !!arg; if (arg) playClip('dance_02', { loop: true }); else stopClip(); break;
      default: break;
    }
  }

  // ---------- 每帧 ----------
  let tAcc = 0;
  function update(dt, elapsed, state = {}) {
    tAcc += dt;
    const t = tAcc;
    // 眼皮：rig 把 rotation.x 从 -1.86（睁）推到 0（闭），换算成上 / 下睑缘位置
    if (lidUniforms) {
      for (let i = 0; i < 2; i++) {
        const close = 1 - clamp(-lidPivots[i].rotation.x / 1.86, 0, 1);
        const my = LID.crease + (LID.closed - LID.crease) * close;
        lowSmooth[i] = damp(lowSmooth[i], close, 24, dt);
        const ly = LID.lowerRest + LID.lowerUp * lowSmooth[i];
        if (i === 0) { lidUniforms.uLidUp.value.x = my; lidUniforms.uLidLo.value.x = ly; }
        else { lidUniforms.uLidUp.value.y = my; lidUniforms.uLidLo.value.y = ly; }
      }
    }
    // 腮红
    const bl = clamp(blushMat.opacity, 0, 1);
    blushMat.opacity = bl * 0.8;
    for (const b2 of blushList) b2.visible = bl > 0.01;

    // 被拽发尾时的整身反应
    if (tailKickT > 0) tailKickT -= dt;
    tailKick = damp(tailKick, 0, tailKickT > 0 ? 1.2 : 3.4, dt);
    boneHips.rotation.y = damp(boneHips.rotation.y, tailKick * 0.55, 6, dt);

    // 表演层
    let lean = 0, tilt = 0, bounce = 0, twist = 0;
    // 拽发尾：单网格拽不动头发，改成整身被拽得歪一下（pull 由 main.js 每帧写入）
    let pullX = 0, grabbed = false;
    for (const tl of tails) {
      const st2 = tl.strand;
      if (st2.pull.lengthSq() > 1e-4) {
        pullX += st2.pull.x; grabbed = true;
        st2.pull.multiplyScalar(Math.exp(-6 * dt));
        if (st2.pull.lengthSq() < 1e-4) st2.pullAt = -1;
      }
    }
    if (grabbed) { twist += clamp(-pullX * 1.4, -0.6, 0.6); lean += 0.03; }
    if (actState.wave > 0) {
      actState.wave -= dt;
      const k = clamp(actState.wave / 1.0, 0, 1);
      lean += 0.045 * k;
      tilt += Math.sin(t * 12) * 0.05 * k;
      twist += 0.10 * k;
      bounce += Math.abs(Math.sin(t * 12)) * 0.008 * k;
    }
    if (actState.pat > 0) { actState.pat -= dt; bounce += Math.abs(Math.sin(t * 14)) * 0.006; }
    if (actState.shy > 0) { actState.shy -= dt; lean += 0.05; }
    if (actState.startle > 0) { actState.startle -= dt; lean -= 0.10 * actState.startle; }
    if (actState.singOn) { tilt += Math.sin(t * 1.9) * 0.035; twist += Math.sin(t * 0.9) * 0.03; }
    if (actState.danceOn) { twist += Math.sin(t * 2.6) * 0.05; tilt += Math.cos(t * 5.2) * 0.04; }
    act.rotation.x = damp(act.rotation.x, lean, 6, dt);
    act.rotation.z = damp(act.rotation.z, tilt, 7, dt);
    act.rotation.y = damp(act.rotation.y, twist, 6, dt);
    if (bounce) act.position.y = bounce;
    else act.position.y = damp(act.position.y, 0, 6, dt);

    // ---- 骨骼：真人动作剪辑 + 代理旋转叠加 ----
    if (rigPlayer) {
      rigMapper.reset();
      rigPlayer.update(dt);
      if (hairRig) hairRig.update(dt);
      rigMapper.apply();
      if (actState.danceOn && groundIdx.length && mesh) {
        const pos = mesh.geometry.attributes.position;
        let minY = 1e9;
        for (const idx of groundIdx) {
          _tv.fromBufferAttribute(pos, idx);
          mesh.applyBoneTransform(idx, _tv);
          mesh.localToWorld(_tv);
          if (_tv.y < minY) minY = _tv.y;
        }
        if (minY > -0.3 && minY < 0.3) act.position.y -= minY;
      }
    }
  }

  api.hitMeshes = [makeProxy()];
  function makeProxy() {
    const proxy = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    proxy.visible = false;
    proxy.matrixAutoUpdate = false;
    const inv = new THREE.Matrix4();
    const ro = new THREE.Vector3(), rd = new THREE.Vector3();
    const world = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    proxy.raycast = function (raycaster, intersects) {
      if (!grid) return;
      world.copy(act.matrixWorld);
      inv.copy(world).invert();
      ro.copy(raycaster.ray.origin).applyMatrix4(inv);
      rd.copy(raycaster.ray.direction).transformDirection(inv);
      const hits = [];
      const far = raycaster.far > 0 ? raycaster.far : 1e3;
      gridRaycast(grid, ro, rd, far, hits);
      for (const h of hits) {
        tmp.copy(ro).addScaledVector(rd, h.t).applyMatrix4(world);
        intersects.push({
          distance: tmp.distanceTo(raycaster.ray.origin),
          point: tmp.clone(),
          face: { normal: h.n },
          faceIndex: h.tri,
          object: proxy,
        });
      }
    };
    root.add(proxy);
    return proxy;
  }

  return api;
}
