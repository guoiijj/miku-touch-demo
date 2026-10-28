import * as THREE from '../vendor/three/three.module.js';
import { sampleVertexColor } from './hairRig.js';

// Hand-built looks. Each one changes both cloth colour and silhouette.
export const OUTFITS = {
  formula: {
    id: 'formula',
    index: '01',
    name: '公式解构',
    en: 'FORMULA / 01',
    note: '象牙白胸衣、炭黑袖套与青色滚边，保留最初的舞台轮廓。',
    palette: { primary: '#171a1e', secondary: '#ede9df', mid: '#8b9196', accent: '#32ceb9' },
    strength: 0.92,
    accentStrength: 0.42,
    layers: ['underShorts'],
  },
  midnight: {
    id: 'midnight',
    index: '02',
    name: '午夜礼装',
    en: 'MIDNIGHT / 02',
    note: '深海蓝长裙、银灰领面和一线暖金，适合慢慢转身。',
    palette: { primary: '#1d2744', secondary: '#dddce6', mid: '#8e96ab', accent: '#c9aa65' },
    strength: 1.0,
    accentStrength: 0.72,
    layers: ['longSkirt', 'midnightTorso', 'midnightSleeves', 'waistband'],
  },
  sakura: {
    id: 'sakura',
    index: '03',
    name: '樱色和装',
    en: 'SAKURA / 03',
    note: '灰粉衣料、奶油内衬、宽袖与束腰，动作会带起很轻的衣摆。',
    palette: { primary: '#b96d7d', secondary: '#f0dfd4', mid: '#c9979c', accent: '#e0b0b8' },
    strength: 1.0,
    accentStrength: 0.58,
    layers: ['longSkirt', 'sakuraTorso', 'kimonoSleeves', 'obi'],
  },
  cyber: {
    id: 'cyber',
    index: '04',
    name: '机能短夹克',
    en: 'FIELD / 04',
    note: '石墨灰短夹克、冷白内层、薄荷荧光滚边，肩线更利落。',
    palette: { primary: '#222a2a', secondary: '#d2d7cd', mid: '#7e8d88', accent: '#69e1c4' },
    strength: 0.98,
    accentStrength: 0.8,
    layers: ['underShorts', 'cyberTorso', 'cyberSleeves'],
  },
  lounge: {
    id: 'lounge',
    index: '05',
    name: '奶油居家',
    en: 'LOUNGE / 05',
    note: '燕麦色宽松上衣、灰褐下装和鼠尾草绿细节，姿态会更放松。',
    palette: { primary: '#b9aa96', secondary: '#ddcdb8', mid: '#a29484', accent: '#7c9d96' },
    strength: 1.0,
    accentStrength: 0.58,
    layers: ['loungeSkirt', 'loungeTorso', 'loungeSleeves', 'waistband'],
  },
  stage: {
    id: 'stage',
    index: '06',
    name: '月白舞台',
    en: 'STAGE / 06',
    note: '月白长裙、雾银上衣和金色腰线，裙摆带一层很薄的纱。',
    palette: { primary: '#b9b3bf', secondary: '#f1eee7', mid: '#a9a3b2', accent: '#d2b16b' },
    strength: 0.94,
    accentStrength: 0.8,
    layers: ['longSkirt', 'sheerOverskirt', 'stageTorso', 'waistband'],
  },
};

const COLOR_FALLBACK = {
  primary: '#171a1e',
  secondary: '#ede9df',
  mid: '#8b9196',
  accent: '#32ceb9',
};

// Tripo 的原模型把身体中心放在 z≈0.17，而不是原点。所有新衣层都
// 必须用同一个中心，否则衣片会被原衬衫或裙摆从正面穿出来。
const BODY_CENTER_Z = 0.168;

function color(hex) {
  return new THREE.Color(hex || '#ffffff');
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function sstep(a, b, x) {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
}

function addClothAttributes(char) {
  const geom = char.mesh.geometry;
  const pos = geom.attributes.position;
  const col = geom.userData.baseVertexColor || sampleVertexColor(geom, char.mat);
  geom.userData.baseVertexColor = col;
  const n = pos.count;
  const hair = geom.attributes.hairMask ? geom.attributes.hairMask.array : new Float32Array(n);
  const cloth = new Float32Array(n);
  const arm = new Float32Array(n);
  const leg = new Float32Array(n);
  const body = new Float32Array(n);
  const boneName = (b) => String(b.name || '').replace(/^mixamorig[:_]?/i, '').toLowerCase();
  const armBones = new Set(
    ['leftarm', 'rightarm', 'leftforearm', 'rightforearm']
      .map((name) => char.skeleton.bones.findIndex((b) => boneName(b) === name))
      .filter((i) => i >= 0),
  );
  const handBones = new Set(
    ['lefthand', 'righthand']
      .map((name) => char.skeleton.bones.findIndex((b) => boneName(b) === name))
      .filter((i) => i >= 0),
  );
  const legBones = new Set(
    ['leftupleg', 'leftleg', 'leftfoot', 'lefttoebase', 'rightupleg', 'rightleg', 'rightfoot', 'righttoebase']
      .map((name) => char.skeleton.bones.findIndex((b) => boneName(b) === name))
      .filter((i) => i >= 0),
  );
  const bodyBones = new Set(
    ['hips', 'pelvis', 'spine', 'spine1']
      .map((name) => char.skeleton.bones.findIndex((b) => boneName(b) === name))
      .filter((i) => i >= 0),
  );
  const skinIndex = geom.attributes.skinIndex;
  const skinWeight = geom.attributes.skinWeight;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (hair[i] > 0.5 || y > 1.395 || y < 0.012) continue;
    const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2];
    const skin = r > g + 15 && g > b + 5 && r > 78;
    cloth[i] = skin ? 0 : 1;
    if (skinIndex && skinWeight) {
      let armWeight = 0;
      let handWeight = 0;
      let legWeight = 0;
      let bodyWeight = 0;
      for (let k = 0; k < 4; k++) {
        const bone = skinIndex.getComponent(i, k);
        const weight = skinWeight.getComponent(i, k);
        if (armBones.has(bone)) armWeight += weight;
        if (handBones.has(bone)) handWeight += weight;
        if (legBones.has(bone)) legWeight += weight;
        if (bodyBones.has(bone)) bodyWeight += weight;
      }
      leg[i] = legWeight;
      body[i] = bodyWeight;
      // 原模型抬臂时，腋下到腰侧会拉出很长的皮肤三角。它们不一定绑在手臂骨上，
      // 所以除骨骼权重外，再把袖层覆盖范围内的侧身顶点一并归入遮罩，手掌除外。
      const sideBand = y > 0.80 && y < 1.35 && Math.abs(pos.getX(i) - 0.031) > 0.075;
      const bareSkin = cloth[i] < 0.5;
      arm[i] = (armWeight > 0.22 || (sideBand && bareSkin && handWeight < 0.30)) ? 1 : 0;
    }
  }
  geom.setAttribute('clothMask', new THREE.Float32BufferAttribute(cloth, 1));
  geom.setAttribute('armMask', new THREE.Float32BufferAttribute(arm, 1));
  geom.setAttribute('legMask', new THREE.Float32BufferAttribute(leg, 1));
  geom.setAttribute('bodyMask', new THREE.Float32BufferAttribute(body, 1));
  if (!geom.attributes.hairMask) geom.setAttribute('hairMask', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  return { cloth, hair };
}

const BASE_VERT = [
  'attribute float clothMask;',
  'attribute float armMask;',
  'attribute float legMask;',
  'attribute float bodyMask;',
  'attribute float hairMask;',
  'varying float vCloth;',
  'varying float vArm;',
  'varying float vLeg;',
  'varying float vBody;',
  'varying float vHair;',
  'varying vec3 vGarmentPos;',
].join('\n');

const BASE_FRAG = [
  'uniform vec3 uPrimary;',
  'uniform vec3 uSecondary;',
  'uniform vec3 uMid;',
  'uniform vec3 uAccent;',
  'uniform float uStrength;',
  'uniform float uAccentStrength;',
  'uniform float uHideTorso;',
  'uniform float uHideSkirt;',
  'uniform float uHideMiniSkirt;',
  'uniform float uHideArms;',
  'uniform float uUnderShorts;',
  'uniform float uBodyCenterZ;',
  'uniform vec2 uHideTorsoY;',
  'varying float vCloth;',
  'varying float vArm;',
  'varying float vLeg;',
  'varying float vBody;',
  'varying float vHair;',
  'varying vec3 vGarmentPos;',
].join('\n');

const BASE_RECOLOR = [
  '  float torsoCut = step(0.5, uHideTorso) * smoothstep(uHideTorsoY.x - 0.006, uHideTorsoY.x + 0.006, vGarmentPos.y)',
  '    * (1.0 - smoothstep(uHideTorsoY.y - 0.006, uHideTorsoY.y + 0.006, vGarmentPos.y));',
  '  float skirtCut = step(0.5, uHideSkirt) * smoothstep(0.60, 0.62, vGarmentPos.y)',
  '    * (1.0 - smoothstep(1.008, 1.020, vGarmentPos.y));',
  '  float miniCut = step(0.5, uHideMiniSkirt) * smoothstep(0.600, 0.616, vGarmentPos.y)',
  '    * (1.0 - smoothstep(0.952, 0.968, vGarmentPos.y));',
  '  miniCut *= smoothstep(0.26, 0.58, vBody);',
  '  miniCut *= 1.0 - smoothstep(0.42, 0.70, vArm);',
  '  float hipR = length(vec2(vGarmentPos.x, vGarmentPos.z - uBodyCenterZ));',
  '  float keepLeg = smoothstep(0.48, 0.82, vLeg) * (1.0 - smoothstep(0.104, 0.128, hipR));',
  '  miniCut *= 1.0 - keepLeg;',
  '  if (vCloth > 0.5 && vHair < 0.25 && (torsoCut > 0.5 || skirtCut > 0.5 || miniCut > 0.5)) discard;',
  '  if (step(0.5, uHideArms) * vArm * (1.0 - step(0.25, vHair)) > 0.5) discard;',
  '  float wLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
  '  float wSkin = smoothstep(0.035, 0.09, diffuseColor.r - diffuseColor.g);',
  '  float wMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));',
  '  float wMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));',
  '  float wNeutral = 1.0 - smoothstep(0.028, 0.082, wMax - wMin);',
  '  float wDark = 1.0 - smoothstep(0.018, 0.075, wLum);',
  '  float wLight = smoothstep(0.26, 0.56, wLum) * wNeutral;',
  '  float wMid = clamp((1.0 - wDark) * (1.0 - wLight) * wNeutral, 0.0, 1.0);',
  '  float wTeal = smoothstep(0.018, 0.07, diffuseColor.g - diffuseColor.r) * step(0.0, diffuseColor.b - diffuseColor.r);',
  '  float gate = vCloth * (1.0 - wSkin) * (1.0 - vHair) * uStrength;',
  '  vec3 wc = diffuseColor.rgb;',
  '  wc = mix(wc, uPrimary, wDark * gate);',
  '  wc = mix(wc, uSecondary, wLight * gate);',
  '  wc = mix(wc, uMid, wMid * gate * 0.82);',
  '  wc = mix(wc, uAccent, wTeal * gate * uAccentStrength);',
  '  float wGrain = fract(sin(dot(floor(vGarmentPos * 820.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
  '  wc *= 0.988 + 0.024 * wGrain;',
  '  float shortsY = smoothstep(0.728, 0.742, vGarmentPos.y) * (1.0 - smoothstep(0.993, 1.003, vGarmentPos.y));',
  '  float shortsCenter = 1.0 - smoothstep(0.068, 0.108, abs(vGarmentPos.x));',
  '  float shortsWidth = mix(shortsCenter, 1.0, smoothstep(0.880, 0.940, vGarmentPos.y));',
  '  float shortsEnvelope = 1.0 - smoothstep(0.145, 0.175, abs(vGarmentPos.x));',
  '  float shorts = step(0.5, uUnderShorts) * (1.0 - vCloth) * (1.0 - vHair) * shortsY * shortsWidth * shortsEnvelope;',
  '  wc = mix(wc, uPrimary * 0.82, shorts * 0.985);',
  '  diffuseColor.rgb = wc;',
].join('\n');

function installBaseShader(char) {
  const material = char.mat;
  const uniforms = {
    uPrimary: { value: color(COLOR_FALLBACK.primary) },
    uSecondary: { value: color(COLOR_FALLBACK.secondary) },
    uMid: { value: color(COLOR_FALLBACK.mid) },
    uAccent: { value: color(COLOR_FALLBACK.accent) },
    uStrength: { value: 0.92 },
    uAccentStrength: { value: 0.42 },
    uHideTorso: { value: 0 },
    uHideSkirt: { value: 0 },
    uHideMiniSkirt: { value: 0 },
    uHideArms: { value: 0 },
    uUnderShorts: { value: 0 },
    uBodyCenterZ: { value: BODY_CENTER_Z },
    uHideTorsoY: { value: new THREE.Vector2(0.90, 1.33) },
  };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    if (previous) previous(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + BASE_VERT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCloth = clothMask;\n  vArm = armMask;\n  vLeg = legMask;\n  vBody = bodyMask;\n  vHair = hairMask;\n  vGarmentPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BASE_FRAG)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + BASE_RECOLOR)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= mix(0.24, 1.0, vHair);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.86, vCloth * (1.0 - vHair));');
  };
  material.customProgramCacheKey = () => 'miku-wardrobe-base-v3';
  material.needsUpdate = true;
  return uniforms;
}

function stabilizeGarmentWeights(char) {
  const g = char.mesh.geometry;
  const pos = g.attributes.position;
  const cloth = g.attributes.clothMask.array;
  const hair = g.attributes.hairMask.array;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const index = g.index;
  if (!index || !si || !sw) return;
  const n = pos.count;
  const bones = char.skeleton.bones;
  const nameOf = (b) => String(b.name || '').replace(/^mixamorig[:_]?/i, '').toLowerCase();
  const find = (...names) => bones.findIndex((b) => names.includes(nameOf(b)));
  const hips = find('hips', 'pelvis');
  const spine = find('spine');
  const spine1 = find('spine1');
  const chain = {
    L: { shoulder: find('leftshoulder'), upper: find('leftarm'), fore: find('leftforearm'), hand: find('lefthand') },
    R: { shoulder: find('rightshoulder'), upper: find('rightarm'), fore: find('rightforearm'), hand: find('righthand') },
  };
  if (hips < 0) return;
  for (const side of ['L', 'R']) {
    const c = chain[side];
    if (c.upper < 0 || c.fore < 0 || c.hand < 0) return;
  }
  const armBones = new Set();
  for (const side of ['L', 'R']) {
    const c = chain[side];
    armBones.add(c.upper);
    armBones.add(c.fore);
    armBones.add(c.hand);
  }

  // 绑定姿态骨骼坐标：几何体是绑定姿态，量当前姿态会错位。
  if (!char._bindHeads) {
    const inv = char.mesh.bindMatrixInverse;
    const M = char.mesh.bindMatrix.constructor;
    char._bindHeads = bones.map((_, i) => {
      const m = new M().multiplyMatrices(inv, new M().copy(char.skeleton.boneInverses[i]).invert());
      const e = m.elements;
      return [e[12], e[13], e[14]];
    });
  }
  const BH = char._bindHeads;

  // 按三角面求连通件（不含头发），模型由许多独立小件拼成。
  const uf = new Int32Array(n);
  for (let i = 0; i < n; i++) uf[i] = i;
  const rootOf = (a) => {
    let r = a;
    while (uf[r] !== r) r = uf[r];
    while (uf[a] !== r) { const nx = uf[a]; uf[a] = r; a = nx; }
    return r;
  };
  const unite = (a, b) => {
    a = rootOf(a); b = rootOf(b);
    if (a !== b) uf[b] = a;
  };
  const idx = index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (hair[a] > 0.5 || hair[b] > 0.5 || hair[c] > 0.5) continue;
    unite(a, b);
    unite(b, c);
  }

  // 每个连通件的手臂骨占比，用于整件归类。
  const comps = new Map();
  for (let i = 0; i < n; i++) {
    if (hair[i] > 0.5) continue;
    const r = rootOf(i);
    let s = comps.get(r);
    if (!s) { s = { count: 0, armL: 0, armR: 0, shL: 0, shR: 0, cx: 0 }; comps.set(r, s); }
    s.count++;
    s.cx += pos.getX(i);
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k), w = sw.getComponent(i, k);
      if (b === chain.L.upper || b === chain.L.fore || b === chain.L.hand) s.armL += w;
      else if (b === chain.R.upper || b === chain.R.fore || b === chain.R.hand) s.armR += w;
      else if (b === chain.L.shoulder) s.shL += w;
      else if (b === chain.R.shoulder) s.shR += w;
    }
  }

  // 碎屑件：只有多根互不相容的骨骼混在一起时才按多数骨刚性绑定。
  const CRUMB = 24;
  const crumbTally = new Map();
  for (let i = 0; i < n; i++) {
    if (hair[i] > 0.5) continue;
    const r = rootOf(i);
    const s = comps.get(r);
    if (!s || s.count >= CRUMB) continue;
    let dom = -1, best = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > best) { best = w; dom = si.getComponent(i, k); }
    }
    if (dom < 0) continue;
    let t = crumbTally.get(r);
    if (!t) { t = new Map(); crumbTally.set(r, t); }
    t.set(dom, (t.get(dom) || 0) + 1);
  }
  const crumbFix = new Map();
  for (const [r, t] of crumbTally) {
    let hasArm = false, hasBody = false, mb = -1, mc = 0;
    for (const [b, c] of t) {
      if (armBones.has(b)) hasArm = true; else hasBody = true;
      if (c > mc) { mc = c; mb = b; }
    }
    if (hasArm && hasBody && mb >= 0) crumbFix.set(r, mb);
  }

  const armSide = new Map();
  for (const [r, s] of comps) {
    if (s.count < CRUMB) continue;
    const score = s.armL + s.armR + s.shL + s.shR;
    if (score >= s.count * 0.5) armSide.set(r, s.cx <= 0 ? 'R' : 'L');
  }

  const segDist = (px, py, pz, a, b) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
    const len2 = abx * abx + aby * aby + abz * abz || 1e-8;
    let s = (apx * abx + apy * aby + apz * abz) / len2;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    return Math.hypot(apx - abx * s, apy - aby * s, apz - abz * s);
  };

  const segs = {};
  for (const side of ['L', 'R']) {
    const c = chain[side];
    const up = BH[c.upper], fo = BH[c.fore], ha = BH[c.hand];
    const dx = ha[0] - fo[0], dy = ha[1] - fo[1], dz = ha[2] - fo[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const tip = [ha[0] + (dx / len) * 0.09, ha[1] + (dy / len) * 0.09, ha[2] + (dz / len) * 0.09];
    const list = [
      { bone: c.upper, a: up, b: fo },
      { bone: c.fore, a: fo, b: ha },
      { bone: c.hand, a: ha, b: tip },
    ];
    if (c.shoulder >= 0) list.unshift({ bone: c.shoulder, a: BH[c.shoulder], b: up });
    segs[side] = list;
  }

  const writeBone = (i, arr) => {
    for (let k = 0; k < 4; k++) {
      si.setComponent(i, k, arr[k][0]);
      sw.setComponent(i, k, arr[k][1]);
    }
  };

  for (let i = 0; i < n; i++) {
    if (hair[i] > 0.5) continue;
    const r = rootOf(i);
    const single = crumbFix.get(r);
    if (single !== undefined) {
      writeBone(i, [[single, 1], [0, 0], [0, 0], [0, 0]]);
      continue;
    }
    const side = armSide.get(r);
    if (side) {
      const c = chain[side];
      const own = new Set([c.shoulder, c.upper, c.fore, c.hand]);
      let stray = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > 0) stray += own.has(si.getComponent(i, k)) ? 0 : w;
      }
      if (stray <= 0.02) continue;
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const ws = segs[side].map((sg) => 1 / Math.pow(segDist(px, py, pz, sg.a, sg.b) + 0.015, 4));
      let tot = 0;
      for (const w of ws) tot += w;
      const items = segs[side].map((sg, k) => [sg.bone, ws[k] / tot]);
      items.sort((x, y) => y[1] - x[1]);
      writeBone(i, [items[0], items[1], items[2], items[3] || [0, 0]]);
    } else {
      let rest = 0;
      for (let k = 0; k < 4; k++) {
        if (!armBones.has(si.getComponent(i, k))) rest += sw.getComponent(i, k);
      }
      if (rest < 1e-3) {
        const y = pos.getY(i);
        const target = y > 1.02 && spine1 >= 0 ? spine1 : y > 0.94 && spine >= 0 ? spine : hips;
        writeBone(i, [[target, 1], [0, 0], [0, 0], [0, 0]]);
      } else {
        for (let k = 0; k < 4; k++) {
          sw.setComponent(i, k, armBones.has(si.getComponent(i, k)) ? 0 : sw.getComponent(i, k) / rest);
        }
      }
    }
  }
  si.needsUpdate = true;
  sw.needsUpdate = true;
}

const SHELL_UNIFORM_DECL = [
  'uniform float uY0;',
  'uniform float uY1;',
  'uniform float uArmY0;',
  'uniform float uArmY1;',
  'uniform float uArmX;',
  'uniform float uArms;',
  'uniform float uNeckCut;',
  'uniform float uInflate;',
  'uniform float uTrimW;',
  'uniform float uZipper;',
  'uniform vec3 uColor;',
  'uniform vec3 uTrimColor;',
].join('\n');
const SHELL_VERT_DECL = [
  SHELL_UNIFORM_DECL,
  'attribute float clothMask;',
  'attribute float hairMask;',
  'varying float vCloth;',
  'varying float vHair;',
  'varying vec3 vRest;',
  'varying vec3 vShellPos;',
].join('\n');
const SHELL_FRAG_DECL = [
  SHELL_UNIFORM_DECL,
  'varying float vCloth;',
  'varying float vHair;',
  'varying vec3 vRest;',
  'varying vec3 vShellPos;',
].join('\n');

function makeShellMaterial(opts) {
  const uniforms = {
    uY0: { value: opts.y0 },
    uY1: { value: opts.y1 },
    uArmY0: { value: opts.armY0 ?? 1.11 },
    uArmY1: { value: opts.armY1 ?? 1.35 },
    uArmX: { value: opts.armX ?? 0.098 },
    uArms: { value: opts.arms ? 1 : 0 },
    uNeckCut: { value: opts.neckCut ? 1 : 0 },
    uInflate: { value: opts.inflate ?? 0.012 },
    uTrimW: { value: opts.trimW ?? 0.012 },
    uZipper: { value: opts.zipper ? 1 : 0 },
    uColor: { value: color(opts.color || '#ffffff') },
    uTrimColor: { value: color(opts.trimColor || '#ffffff') },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0.015,
    side: THREE.FrontSide,
    shadowSide: THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SHELL_VERT_DECL)
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '  vCloth = clothMask;',
        '  vHair = hairMask;',
        '  vRest = transformed;',
        '  transformed += objectNormal * uInflate;',
        '  vShellPos = transformed;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SHELL_FRAG_DECL)
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '  float torsoBand = smoothstep(uY0 - 0.010, uY0 + 0.010, vRest.y) * (1.0 - smoothstep(uY1 - 0.010, uY1 + 0.010, vRest.y));',
        '  float armX = smoothstep(uArmX, uArmX + 0.026, abs(vRest.x));',
        '  float armY = smoothstep(uArmY0, uArmY0 + 0.015, vRest.y) * (1.0 - smoothstep(uArmY1 - 0.02, uArmY1, vRest.y));',
        '  float sleeve = armX * armY;',
        '  float region = mix(torsoBand, max(torsoBand, sleeve), step(0.5, uArms));',
        '  if (vHair > 0.45 || region < 0.46) discard;',
        '  if (uNeckCut > 0.5 && vRest.y > 1.260 && vRest.z > 0.025 && abs(vRest.x) < 0.082) discard;',
        '  float fold = 0.955 + 0.045 * sin(vRest.x * 86.0 + vRest.y * 31.0) * sin(vRest.z * 61.0 - vRest.y * 17.0);',
        '  vec3 fabric = uColor * fold;',
        '  float edge = min(abs(vRest.y - uY0), abs(vRest.y - uY1));',
        '  fabric = mix(fabric, uTrimColor, (1.0 - smoothstep(0.0, uTrimW, edge)) * 0.88);',
        '  if (uZipper > 0.5 && abs(vRest.x) < 0.008 && vRest.z > 0.07 && torsoBand > 0.5) fabric = mix(fabric, uTrimColor, 0.94);',
        '  diffuseColor.rgb = fabric;',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = 0.88;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = 0.012;');
  };
  material.customProgramCacheKey = () => 'miku-wardrobe-shell-v2';
  return { material, uniforms };
}

function bindSkinned(char, geometry, material) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.bind(char.skeleton, char.mesh.bindMatrix);
  char.act.add(mesh);
  return mesh;
}

function makeShell(char, opts) {
  const { material, uniforms } = makeShellMaterial(opts);
  const mesh = bindSkinned(char, char.mesh.geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 2;
  return { id: opts.id, mesh, material, uniforms, role: opts.role || 'primary' };
}

function makeSkirtGeometry(char, opts) {
  const seg = opts.segments ?? 112;
  const rings = opts.rings ?? 28;
  const waistRx = opts.waistRx ?? opts.waistR;
  const waistRz = opts.waistRz ?? opts.waistR * 0.66;
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const pleat = Math.cos(a * (opts.pleats ?? 20));
      const wave = Math.pow(t, 0.75) * (opts.pleatDepth ?? 0.018) * pleat;
      const k = Math.pow(t, opts.flare ?? 1.08);
      const rx = waistRx + (opts.hemR - waistRx) * k + wave;
      const rz = waistRz + (opts.hemR - waistRz) * k + wave;
      const drop = Math.sin(a - 0.55) * (opts.backDrop ?? 0.012) * Math.pow(t, 1.7);
      const y = opts.waistY + (opts.hemY - opts.waistY) * t - drop;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + (opts.centerZ ?? BODY_CENTER_Z));
      normals.push(0, 0, 1);
      uvs.push(s / seg, t);
      const shade = 0.85 + 0.12 * (0.5 + 0.5 * pleat) + 0.03 * (1 - t);
      colors.push(shade, shade, shade);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      const a = r * seg + s, b = r * seg + s2;
      const c = (r + 1) * seg + s, d = (r + 1) * seg + s2;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const n = positions.length / 3;
  const hips = char.skeleton.bones.indexOf(char.hipsBone);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = hips; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

function makeSkirt(char, opts) {
  const uniforms = {
    uTime: { value: 0 },
    uSway: { value: new THREE.Vector3() },
    uTrimColor: { value: color(opts.trimColor || '#ffffff') },
    uWaistY: { value: opts.waistY },
    uHemY: { value: opts.hemY },
    uPleats: { value: opts.pleats ?? 20 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: color(opts.color || '#ffffff'),
    roughness: opts.roughness ?? 0.88,
    metalness: opts.metalness ?? 0.01,
    side: THREE.DoubleSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: !opts.transparent,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSway;\nuniform float uWaistY;\nuniform float uHemY;\nvarying float vSkirtT;\nvarying vec3 vSkirtPos;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '  float skirtT = clamp((uWaistY - position.y) / max(0.001, uWaistY - uHemY), 0.0, 1.0);',
        '  vSkirtT = skirtT;',
        '  transformed.x += uSway.x * skirtT * skirtT * 0.85;',
        '  transformed.z += uSway.z * skirtT * skirtT * 0.85;',
        '  transformed.x += sin(uTime * 1.35 + position.y * 10.0 + position.x * 7.0) * 0.0042 * skirtT;',
        '  transformed.z += cos(uTime * 1.17 + position.y * 8.0 + position.z * 9.0) * 0.0038 * skirtT;',
        '  vSkirtPos = transformed;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTrimColor;\nuniform float uPleats;\nvarying float vSkirtT;\nvarying vec3 vSkirtPos;')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '  float hemLine = smoothstep(0.925, 0.985, vSkirtT);',
        '  float pleatShade = 0.94 + 0.06 * sin(atan(vSkirtPos.z, vSkirtPos.x) * uPleats);',
        '  diffuseColor.rgb *= pleatShade;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, uTrimColor, hemLine * 0.82);',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = 0.9;');
  };
  material.customProgramCacheKey = () => 'miku-wardrobe-skirt-v2';
  const mesh = bindSkinned(char, makeSkirtGeometry(char, opts), material);
  mesh.visible = false;
  mesh.renderOrder = opts.transparent ? 5 : 3;
  return { id: opts.id, mesh, material, uniforms, role: opts.role || 'primary' };
}

function skinnedRingGeometry(char, y, height, radiusX, radiusZ, segments = 72, centerZ = BODY_CENTER_Z) {
  const g = new THREE.CylinderGeometry(1, 1.012, height, segments, 1, true);
  g.scale(radiusX, 1, radiusZ);
  g.translate(0, y, centerZ);
  const n = g.attributes.position.count;
  const hips = char.skeleton.bones.indexOf(char.hipsBone);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = hips; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

const TORSO_PROFILES = {
  fitted: [
    [0.88, 0.132, 0.084],
    [0.94, 0.122, 0.080],
    [1.00, 0.118, 0.078],
    [1.08, 0.123, 0.080],
    [1.15, 0.136, 0.086],
    [1.21, 0.153, 0.090],
    [1.26, 0.171, 0.094],
    [1.295, 0.144, 0.087],
    [1.325, 0.088, 0.075],
  ],
  loose: [
    [0.88, 0.158, 0.100],
    [0.94, 0.150, 0.097],
    [1.00, 0.148, 0.096],
    [1.08, 0.152, 0.098],
    [1.15, 0.160, 0.101],
    [1.21, 0.172, 0.105],
    [1.26, 0.182, 0.108],
    [1.295, 0.154, 0.098],
    [1.325, 0.094, 0.080],
  ],
  stage: [
    [0.96, 0.120, 0.079],
    [1.02, 0.116, 0.077],
    [1.09, 0.121, 0.079],
    [1.16, 0.134, 0.085],
    [1.22, 0.151, 0.089],
    [1.27, 0.168, 0.093],
    [1.30, 0.132, 0.084],
    [1.325, 0.083, 0.073],
  ],
};

function profileAt(profile, y) {
  if (y <= profile[0][0]) return [profile[0][1], profile[0][2]];
  for (let i = 1; i < profile.length; i++) {
    if (y <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      const t = clamp01((y - a[0]) / (b[0] - a[0]));
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return [profile[profile.length - 1][1], profile[profile.length - 1][2]];
}

function torsoGeometry(char, opts) {
  const seg = opts.segments ?? 120;
  const rings = opts.rings ?? 36;
  const profile = TORSO_PROFILES[opts.profile || 'fitted'] || TORSO_PROFILES.fitted;
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const y0 = opts.y0, y1 = opts.y1;
  const centerZ = opts.centerZ ?? BODY_CENTER_Z;
  const neckDrop = opts.neckDrop ?? 0.055;
  const shoulderDrop = opts.shoulderDrop ?? 0.066;
  const ease = opts.ease ?? 0.011;
  const flare = opts.flare ?? 0.0;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const front = Math.max(0, Math.sin(a));
      const side = Math.pow(Math.abs(Math.cos(a)), 1.7);
      const topY = y1 - neckDrop * sstep(0.38, 1.0, front) - shoulderDrop * side;
      const y = y0 + (topY - y0) * t;
      const pr = profileAt(profile, y);
      const ripples = 1 + (opts.fold ?? 0.006) * Math.sin(a * (opts.pleatCount ?? 14) + 0.4) * Math.pow(t, 0.55);
      const outer = ease * (0.62 + 0.38 * Math.sin(Math.PI * t));
      const hemFlare = flare * Math.pow(1 - t, 2.2);
      const rx = (pr[0] + outer + hemFlare) * ripples;
      const rz = (pr[1] + outer * 0.72 + hemFlare * 0.8) * ripples;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + centerZ);
      normals.push(0, 0, 1);
      uvs.push(s / seg, t);
      const light = 0.88 + 0.12 * (0.5 + 0.5 * Math.cos(a - 0.62));
      colors.push(light, light, light);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      const a = r * seg + s, b = r * seg + s2, c = (r + 1) * seg + s, d = (r + 1) * seg + s2;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();

  const nameOf = (b) => b.name.replace(/^mixamorig[:_]?/i, '');
  const byName = {};
  for (let i = 0; i < char.skeleton.bones.length; i++) byName[nameOf(char.skeleton.bones[i]).toLowerCase()] = i;
  const bi = {
    hips: byName.hips ?? byName.pelvis ?? 0,
    spine: byName.spine ?? byName.spine1 ?? 0,
    spine1: byName.spine1 ?? byName.spine ?? 0,
    spine2: byName.spine2 ?? byName.chest ?? 0,
  };
  const n = positions.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    let w2 = sstep(1.10, 1.265, y);
    let w1 = sstep(0.985, 1.13, y) * (1 - w2);
    let ws = sstep(0.885, 1.005, y) * (1 - w2 - w1);
    let wh = Math.max(0, 1 - w2 - w1 - ws);
    const total = w2 + w1 + ws + wh || 1;
    si[i * 4] = bi.hips; sw[i * 4] = wh / total;
    si[i * 4 + 1] = bi.spine; sw[i * 4 + 1] = ws / total;
    si[i * 4 + 2] = bi.spine1; sw[i * 4 + 2] = w1 / total;
    si[i * 4 + 3] = bi.spine2; sw[i * 4 + 3] = w2 / total;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

function makeTorsoGarment(char, opts) {
  const centerZ = opts.centerZ ?? BODY_CENTER_Z;
  const uniforms = {
    uColor: { value: color(opts.color || '#ffffff') },
    uTrimColor: { value: color(opts.trimColor || '#ffffff') },
    uY0: { value: opts.y0 },
    uY1: { value: opts.y1 },
    uZipper: { value: opts.zipper ? 1 : 0 },
    uPocket: { value: opts.pocket ? 1 : 0 },
    uGoldLine: { value: opts.goldLine ? 1 : 0 },
    uCenterZ: { value: centerZ },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.87,
    metalness: opts.metalness ?? 0.01,
    side: THREE.FrontSide,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uY0;\nuniform float uY1;\nuniform float uCenterZ;\nvarying float vGY;\nvarying float vGT;\nvarying float vGA;\nvarying vec3 vGP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGY = position.y;\n  vGT = clamp((position.y - uY0) / max(0.001, uY1 - uY0), 0.0, 1.0);\n  vGA = atan(position.z - uCenterZ, position.x);\n  vGP = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uColor;\nuniform vec3 uTrimColor;\nuniform float uZipper;\nuniform float uPocket;\nuniform float uGoldLine;\nuniform float uCenterZ;\nvarying float vGY;\nvarying float vGT;\nvarying float vGA;\nvarying vec3 vGP;')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '  float seam = 0.966 + 0.034 * sin(vGA * 22.0 + vGT * 9.0) * sin(vGA * 7.0 - vGT * 3.0);',
        '  vec3 fabric = uColor * seam;',
        '  float hem = 1.0 - smoothstep(0.0, 0.037, vGT);',
        '  float topEdge = smoothstep(0.945, 0.992, vGT);',
        '  fabric = mix(fabric, uTrimColor, (hem * 0.72 + topEdge * 0.28));',
        '  if (uZipper > 0.5 && abs(vGP.x) < 0.011 && vGP.z - uCenterZ > 0.055) fabric = mix(fabric, uTrimColor, 0.93);',
        '  if (uPocket > 0.5 && vGP.z - uCenterZ > 0.055 && vGY > 0.985 && vGY < 1.075 && abs(vGP.x) < 0.105) {',
        '    float pocketEdge = 1.0 - smoothstep(0.0, 0.008, min(abs(vGY - 0.985), abs(vGY - 1.075)));',
        '    fabric = mix(fabric, uColor * 0.72, 0.34);',
        '    fabric = mix(fabric, uTrimColor, pocketEdge * 0.42);',
        '  }',
        '  if (uGoldLine > 0.5 && vGP.z - uCenterZ > 0.03 && vGT > 0.57 && vGT < 0.60 && abs(vGP.x) < 0.155) fabric = mix(fabric, uTrimColor, 0.65);',
        '  diffuseColor.rgb = fabric;',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = 0.88;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = 0.01;');
  };
  material.customProgramCacheKey = () => 'miku-wardrobe-torso-v3';
  const mesh = bindSkinned(char, torsoGeometry(char, { ...opts, centerZ }), material);
  mesh.visible = false;
  mesh.renderOrder = 2;
  return {
    id: opts.id, mesh, material, uniforms, role: opts.role || 'primary',
    y0: opts.y0, y1: opts.y1,
  };
}

function makeWaistBand(char, opts) {
  const material = new THREE.MeshStandardMaterial({
    color: color(opts.color || '#ffffff'),
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.12,
    side: THREE.DoubleSide,
  });
  const mesh = bindSkinned(
    char,
    skinnedRingGeometry(char, opts.y, opts.height, opts.radiusX, opts.radiusZ, 96, opts.centerZ),
    material,
  );
  mesh.visible = false;
  mesh.renderOrder = 4;
  return { id: opts.id, mesh, material, role: opts.role || 'accent' };
}

function makeBuckle(char, opts) {
  const g = new THREE.BoxGeometry(opts.w, opts.h, opts.d, 1, 1, 1);
  g.translate(0, opts.y, opts.z);
  const n = g.attributes.position.count;
  const hips = char.skeleton.bones.indexOf(char.hipsBone);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = hips; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const material = new THREE.MeshStandardMaterial({ color: color(opts.color || '#ffffff'), roughness: 0.38, metalness: 0.48 });
  const mesh = bindSkinned(char, g, material);
  mesh.visible = false;
  mesh.renderOrder = 5;
  return { id: opts.id, mesh, material, role: opts.role || 'accent' };
}

function sleeveGeometry(char, sign, opts) {
  const segments = opts.segments ?? 34;
  const radial = opts.radial ?? 22;
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const normName = (b) => b.name.replace(/^mixamorig[:_]?/i, '').toLowerCase();
  const findBone = (name) => char.skeleton.bones.find((b) => normName(b) === name.toLowerCase());
  const upper = findBone(sign > 0 ? 'LeftArm' : 'RightArm');
  const fore = findBone(sign > 0 ? 'LeftForeArm' : 'RightForeArm');
  const hand = findBone(sign > 0 ? 'LeftHand' : 'RightHand');
  const armIndex = char.skeleton.bones.indexOf(upper);
  const foreIndex = char.skeleton.bones.indexOf(fore);
  const rippleAmt = opts.ripple ?? 0.012;

  // 袖子必须沿着绑定姿态的真实手臂方向生成。旧版按水平 T-pose 建模，
  // 绑到自然下垂的骨架上就会横着悬空。
  char.act.updateMatrixWorld(true);
  const local = (bone) => char.act.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const p0 = local(upper);
  const p1 = local(fore);
  const p2 = local(hand);
  p0.add(new THREE.Vector3(-sign * 0.014, 0.045, 0.004));
  const lenA = p0.distanceTo(p1), lenB = p1.distanceTo(p2) || 1;
  const elbowT = clamp01(lenA / (lenA + lenB));
  const uStart = opts.start ?? 0;
  const uEnd = opts.end ?? 0.965;
  const r0 = opts.r0 ?? opts.rz0 ?? 0.054;
  const r1 = opts.r1 ?? opts.rz1 ?? 0.058;
  const rBell = opts.rBell ?? r1;
  const rCuff = opts.rCuff ?? Math.min(r1, 0.034);
  const depth = opts.depth ?? 0.84;
  const tangentA = new THREE.Vector3().subVectors(p1, p0).normalize();
  const tangentB = new THREE.Vector3().subVectors(p2, p1).normalize();

  let capCenter = null;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = uStart + (uEnd - uStart) * t;
    let center, tangent;
    if (u <= elbowT) {
      const k = clamp01(u / elbowT);
      center = new THREE.Vector3().lerpVectors(p0, p1, k);
      tangent = tangentA.clone().lerp(tangentB, k * 0.35).normalize();
    } else {
      const k = u - elbowT;
      center = new THREE.Vector3().lerpVectors(p1, p2, k / Math.max(0.001, 1 - elbowT));
      tangent = tangentB.clone();
    }
    if (u > 1) center.addScaledVector(tangentB, (u - 1) * lenB);
    const ref = Math.abs(tangent.z) < 0.88 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const sideAxis = new THREE.Vector3().crossVectors(ref, tangent).normalize();
    const depthAxis = new THREE.Vector3().crossVectors(tangent, sideAxis).normalize();
    const shoulderTaper = 0.70 + 0.30 * sstep(0, 0.085, t);
    const radius = (r0 + (r1 - r0) * sstep(0, 0.42, t)
      + (rBell - r1) * sstep(0.32, 0.72, t)
      + (rCuff - rBell) * sstep(0.78, 1.0, t)) * shoulderTaper;
    if (i === 0) capCenter = center.clone();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ripple = 1 + rippleAmt * Math.sin(a * 6 + t * 8.5) * (0.18 + 0.82 * t);
      const rr = radius * ripple;
      positions.push(
        center.x + sideAxis.x * Math.cos(a) * rr + depthAxis.x * Math.sin(a) * rr * depth,
        center.y + sideAxis.y * Math.cos(a) * rr + depthAxis.y * Math.sin(a) * rr * depth,
        center.z + sideAxis.z * Math.cos(a) * rr + depthAxis.z * Math.sin(a) * rr * depth,
      );
      normals.push(0, 0, 1);
      uvs.push(t, j / radial);
      const shade = 0.88 + 0.10 * (0.5 + 0.5 * Math.cos(a - 0.5)) + (t > 0.92 ? 0.045 : 0);
      colors.push(shade, shade, shade);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + 1;
      const c = (i + 1) * (radial + 1) + j, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  let capIndex = -1;
  if (capCenter) {
    capIndex = positions.length / 3;
    positions.push(capCenter.x, capCenter.y, capCenter.z);
    normals.push(0, 1, 0);
    uvs.push(0, 0.5);
    colors.push(0.94, 0.94, 0.94);
    for (let j = 0; j < radial; j++) indices.push(capIndex, j, j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const n = positions.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = uStart + (uEnd - uStart) * t;
    const wFore = sstep(elbowT - 0.055, elbowT + 0.075, u);
    for (let j = 0; j <= radial; j++) {
      const k = (i * (radial + 1) + j) * 4;
      si[k] = Math.max(0, armIndex); sw[k] = 1 - wFore;
      si[k + 1] = Math.max(0, foreIndex); sw[k + 1] = wFore;
    }
  }
  if (capIndex >= 0) {
    const k = capIndex * 4;
    si[k] = Math.max(0, armIndex); sw[k] = 1;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

function makeSleeve(char, sign, opts) {
  const uniforms = { uTrimColor: { value: color(opts.trimColor || '#ffffff') } };
  const material = new THREE.MeshStandardMaterial({
    color: color(opts.color || '#ffffff'),
    roughness: 0.9,
    metalness: 0.005,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSleeveT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSleeveT = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTrimColor;\nvarying float vSleeveT;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  float cuff = smoothstep(0.935, 0.988, vSleeveT);\n  float shoulderSeam = 1.0 - smoothstep(0.0, 0.035, vSleeveT);\n  diffuseColor.rgb = mix(diffuseColor.rgb, uTrimColor, cuff * 0.68 + shoulderSeam * 0.26);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = 0.9;');
  };
  material.customProgramCacheKey = () => 'miku-wardrobe-sleeve-v3';
  const mesh = bindSkinned(char, sleeveGeometry(char, sign, opts), material);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return { id: opts.id + (sign > 0 ? 'L' : 'R'), mesh, material, uniforms, role: opts.role || 'primary' };
}

export class Wardrobe {
  constructor({ char, scene }) {
    this.char = char;
    this.scene = scene;
    this.current = OUTFITS.formula;
    this.palette = { ...OUTFITS.formula.palette };
    this.userOverrides = {};
    this.sway = new THREE.Vector3();
    this.prevYaw = 0;
    this.prevPitch = 0;
    this.ready = false;
    this.build();
  }

  build() {
    const char = this.char;
    if (!char || !char.mesh || !char.skeleton) return;
    addClothAttributes(char);
    stabilizeGarmentWeights(char);
    this.base = installBaseShader(char);
    this.layers = {};

    this.layers.longSkirt = makeSkirt(char, {
      id: 'longSkirt', role: 'primary', waistY: 1.005, hemY: 0.255,
      waistRx: 0.134, waistRz: 0.091, hemR: 0.368, pleats: 24, pleatDepth: 0.024,
      flare: 1.18, backDrop: 0.018, centerZ: BODY_CENTER_Z,
    });
    this.layers.loungeSkirt = makeSkirt(char, {
      id: 'loungeSkirt', role: 'mid', waistY: 0.992, hemY: 0.335,
      waistRx: 0.136, waistRz: 0.092, hemR: 0.292, pleats: 14, pleatDepth: 0.012,
      flare: 1.06, backDrop: 0.012, centerZ: BODY_CENTER_Z,
      roughness: 0.96, metalness: 0.0,
    });
    this.layers.sheerOverskirt = makeSkirt(char, {
      id: 'sheerOverskirt', role: 'secondary', waistY: 1.002, hemY: 0.225,
      waistRx: 0.138, waistRz: 0.094, hemR: 0.415, pleats: 32, pleatDepth: 0.015,
      flare: 1.26, backDrop: 0.025, centerZ: BODY_CENTER_Z,
      transparent: true, opacity: 0.34, roughness: 0.72, metalness: 0.03,
    });
    this.layers.midnightTorso = makeTorsoGarment(char, {
      id: 'midnightTorso', role: 'primary', y0: 0.935, y1: 1.330,
      profile: 'fitted', neckDrop: 0.068, ease: 0.012, fold: 0.006,
      color: '#1d2744', trimColor: '#c9aa65', goldLine: true, roughness: 0.8,
    });
    this.layers.sakuraTorso = makeTorsoGarment(char, {
      id: 'sakuraTorso', role: 'primary', y0: 0.925, y1: 1.330,
      profile: 'fitted', neckDrop: 0.090, shoulderDrop: 0.070, ease: 0.014, fold: 0.011,
      color: '#b96d7d', trimColor: '#e0b0b8', goldLine: false, roughness: 0.92,
    });
    this.layers.cyberTorso = makeTorsoGarment(char, {
      id: 'cyberTorso', role: 'primary', y0: 0.928, y1: 1.322,
      profile: 'fitted', neckDrop: 0.075, shoulderDrop: 0.088, ease: 0.018, fold: 0.004,
      color: '#222a2a', trimColor: '#69e1c4', zipper: true, roughness: 0.62, metalness: 0.035,
    });
    this.layers.loungeTorso = makeTorsoGarment(char, {
      id: 'loungeTorso', role: 'secondary', y0: 0.940, y1: 1.318,
      profile: 'fitted', neckDrop: 0.072, shoulderDrop: 0.104, ease: 0.016, fold: 0.012,
      color: '#ddcdb8', trimColor: '#a99985', trimRole: 'mid', pocket: true, roughness: 0.97,
    });
    this.layers.stageTorso = makeTorsoGarment(char, {
      id: 'stageTorso', role: 'secondary', y0: 0.975, y1: 1.328,
      profile: 'stage', neckDrop: 0.082, shoulderDrop: 0.072, ease: 0.010, fold: 0.007,
      color: '#f1eee7', trimColor: '#d2b16b', goldLine: true, roughness: 0.72, metalness: 0.025,
    });
    this.layers.waistband = makeWaistBand(char, {
      id: 'waistband', role: 'accent', y: 0.952, height: 0.030,
      radiusX: 0.154, radiusZ: 0.113,
      centerZ: BODY_CENTER_Z, color: '#32ceb9',
    });
    this.layers.utilityBelt = makeWaistBand(char, {
      id: 'utilityBelt', role: 'primary', y: 0.985, height: 0.042,
      radiusX: 0.143, radiusZ: 0.102,
      centerZ: BODY_CENTER_Z, color: '#222a2a', roughness: 0.5, metalness: 0.22,
    });
    this.layers.utilityBuckle = makeBuckle(char, {
      id: 'utilityBuckle', role: 'accent', y: 0.985, z: BODY_CENTER_Z + 0.109,
      w: 0.052, h: 0.032, d: 0.012, color: '#69e1c4',
    });
    this.layers.obi = makeWaistBand(char, {
      id: 'obi', role: 'secondary', y: 0.962, height: 0.090,
      radiusX: 0.158, radiusZ: 0.116,
      centerZ: BODY_CENTER_Z, color: '#f0dfd4', roughness: 0.62, metalness: 0.02,
    });
    this.layers.kimonoSleeves = [
      makeSleeve(char, 1, {
        id: 'kimonoSleeves', role: 'primary', color: '#b96d7d', trimColor: '#e0b0b8',
        r0: 0.063, r1: 0.066, rBell: 0.086, rCuff: 0.035, end: 1.01, depth: 0.78, ripple: 0.018,
      }),
      makeSleeve(char, -1, {
        id: 'kimonoSleeves', role: 'primary', color: '#b96d7d', trimColor: '#e0b0b8',
        r0: 0.063, r1: 0.066, rBell: 0.086, rCuff: 0.035, end: 1.01, depth: 0.78, ripple: 0.018,
      }),
    ];
    this.layers.midnightSleeves = [
      makeSleeve(char, 1, {
        id: 'midnightSleeves', role: 'primary', color: '#1d2744', trimColor: '#c9aa65',
        r0: 0.052, r1: 0.046, rBell: 0.049, rCuff: 0.034, end: 0.97, depth: 0.84, ripple: 0.006,
      }),
      makeSleeve(char, -1, {
        id: 'midnightSleeves', role: 'primary', color: '#1d2744', trimColor: '#c9aa65',
        r0: 0.052, r1: 0.046, rBell: 0.049, rCuff: 0.034, end: 0.97, depth: 0.84, ripple: 0.006,
      }),
    ];
    this.layers.cyberSleeves = [
      makeSleeve(char, 1, {
        id: 'cyberSleeves', role: 'primary', color: '#222a2a', trimColor: '#69e1c4',
        r0: 0.057, r1: 0.050, rBell: 0.055, rCuff: 0.034, end: 0.96, depth: 0.84, ripple: 0.005,
      }),
      makeSleeve(char, -1, {
        id: 'cyberSleeves', role: 'primary', color: '#222a2a', trimColor: '#69e1c4',
        r0: 0.057, r1: 0.050, rBell: 0.055, rCuff: 0.034, end: 0.96, depth: 0.84, ripple: 0.005,
      }),
    ];
    this.layers.loungeSleeves = [
      makeSleeve(char, 1, {
        id: 'loungeSleeves', role: 'secondary', color: '#e8ddcb', trimColor: '#b9aa96',
        r0: 0.061, r1: 0.058, rBell: 0.069, rCuff: 0.035, end: 1.00, depth: 0.9, ripple: 0.014,
      }),
      makeSleeve(char, -1, {
        id: 'loungeSleeves', role: 'secondary', color: '#e8ddcb', trimColor: '#b9aa96',
        r0: 0.061, r1: 0.058, rBell: 0.069, rCuff: 0.035, end: 1.00, depth: 0.9, ripple: 0.014,
      }),
    ];

    this.byId = new Map();
    const addLayer = (layer) => {
      if (Array.isArray(layer)) { layer.forEach(addLayer); return; }
      this.byId.set(layer.id, layer);
      if (layer.mesh) this.char.act.add(layer.mesh);
    };
    Object.values(this.layers).forEach(addLayer);

    this.ready = true;
    this.apply(this.current.id);
  }

  setColors(palette, strength, accentStrength) {
    const p = { ...COLOR_FALLBACK, ...(palette || {}) };
    this.palette = p;
    if (!this.base) return;
    this.base.uPrimary.value.copy(color(p.primary));
    this.base.uSecondary.value.copy(color(p.secondary));
    this.base.uMid.value.copy(color(p.mid));
    this.base.uAccent.value.copy(color(p.accent));
    this.base.uStrength.value = strength ?? 1;
    this.base.uAccentStrength.value = accentStrength ?? 0.6;
    for (const layer of this.byId.values()) {
      const c = p[layer.role] || p.primary;
      if (layer.uniforms && layer.uniforms.uColor) {
        layer.uniforms.uColor.value.copy(color(c));
      } else if (layer.material && layer.material.color) {
        layer.material.color.copy(color(c));
      }
      if (layer.uniforms && layer.uniforms.uTrimColor) {
        layer.uniforms.uTrimColor.value.copy(color(p[layer.trimRole || 'accent'] || p.accent));
      }
    }
  }

  apply(id, overrides = {}) {
    const preset = OUTFITS[id] || OUTFITS.formula;
    this.current = preset;
    this.userOverrides = overrides || {};
    const palette = { ...preset.palette, ...(overrides.palette || {}) };
    this.setColors(palette, preset.strength, preset.accentStrength);
    const active = new Set(preset.layers);
    if (overrides.layers) overrides.layers.forEach((l) => active.add(l));
    if (overrides.removeLayers) overrides.removeLayers.forEach((l) => active.delete(l));

    for (const [layerId, layer] of Object.entries(this.layers)) {
      const on = active.has(layerId);
      if (Array.isArray(layer)) for (const item of layer) item.mesh.visible = on;
      else if (layer.mesh) layer.mesh.visible = on;
    }
    this.layers.utilityBuckle.mesh.visible = active.has('utilityBelt');

    // 长裙/上身衣片是“实穿”的独立衣层。把被它们覆盖的原模型布料挖掉，
    // 既不会出现领带或短裙穿出，也不影响皮肤和头发。
    this.base.uHideSkirt.value = (active.has('longSkirt') || active.has('loungeSkirt')) ? 1 : 0;
    this.base.uHideMiniSkirt.value = 0;
    this.base.uHideArms.value = ['kimonoSleeves', 'midnightSleeves', 'cyberSleeves', 'loungeSleeves']
      .some((id) => active.has(id)) ? 1 : 0;
    this.base.uUnderShorts.value = active.has('underShorts') ? 1 : 0;
    const torsoId = ['midnightTorso', 'sakuraTorso', 'cyberTorso', 'loungeTorso', 'stageTorso']
      .find((id) => active.has(id));
    this.base.uHideTorso.value = torsoId ? 1 : 0;
    if (torsoId) {
      const t = this.byId.get(torsoId);
      this.base.uHideTorsoY.value.set(t.y0, t.y1);
    }

    this.state = {
      ...preset,
      palette,
      activeLayers: [...active],
    };
    return this.state;
  }

  cycle(dir = 1) {
    const ids = Object.keys(OUTFITS);
    const i = ids.indexOf(this.current.id);
    return this.apply(ids[(i + dir + ids.length) % ids.length]);
  }

  update(dt, time) {
    if (!this.ready) return;
    const yaw = this.char.body.rotation.y;
    const roll = this.char.hips.rotation.z || 0;
    const dyaw = Math.atan2(Math.sin(yaw - this.prevYaw), Math.cos(yaw - this.prevYaw));
    this.prevYaw = yaw;
    const targetX = clamp01(Math.abs(dyaw) / Math.max(dt, 0.001) * 0.055) * Math.sign(dyaw);
    const targetZ = clamp01(Math.abs(roll) * 0.75) * Math.sign(roll);
    this.sway.x += (targetX * 0.16 - this.sway.x) * Math.min(1, dt * 3.5);
    this.sway.z += (targetZ * 0.12 - this.sway.z) * Math.min(1, dt * 3.0);
    if (this.layers.longSkirt) {
      this.layers.longSkirt.uniforms.uTime.value = time;
      this.layers.longSkirt.uniforms.uSway.value.copy(this.sway);
    }
    if (this.layers.sheerOverskirt) {
      this.layers.sheerOverskirt.uniforms.uTime.value = time * 0.86 + 1.7;
      this.layers.sheerOverskirt.uniforms.uSway.value.copy(this.sway).multiplyScalar(1.35);
    }
  }
}

export function applyIntentOverrides(base, intent) {
  const next = { ...base };
  if (intent.palette) next.palette = { ...(base.palette || {}), ...intent.palette };
  if (intent.removeLayers) next.removeLayers = [...(base.removeLayers || []), ...intent.removeLayers];
  if (intent.layers) next.layers = [...(base.layers || []), ...intent.layers];
  return next;
}
