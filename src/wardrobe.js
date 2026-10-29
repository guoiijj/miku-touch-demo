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
    layers: ['longSkirt', 'sheerOverskirt', 'stageTorso', 'stageSleeves', 'waistband'],
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
    if (hair[i] > 0.5 || y > 1.445 || y < 0.012) continue;
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
  'uniform float uStageClean;',
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
  '  float torsoCore = 1.0 - smoothstep(0.158, 0.180, length(vec2(vGarmentPos.x, vGarmentPos.z - uBodyCenterZ)));',
  '  float geoCut = step(0.5, uHideTorso) * smoothstep(uHideTorsoY.x - 0.004, uHideTorsoY.x + 0.004, vGarmentPos.y)',
  '    * (1.0 - smoothstep(1.292, 1.302, vGarmentPos.y)) * torsoCore;',
  '  if (vCloth > 0.5 && vHair < 0.25 && (torsoCut > 0.5 || skirtCut > 0.5 || miniCut > 0.5)) discard;',
  '  if (geoCut > 0.5 && vHair < 0.35) discard;',
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
  '  float stageCollar = step(0.5, uHideTorso) * vCloth',
  '    * smoothstep(1.306, 1.322, vGarmentPos.y) * (1.0 - smoothstep(1.424, 1.444, vGarmentPos.y))',
  '    * (1.0 - smoothstep(0.050, 0.075, abs(vGarmentPos.x)));',
  '  float gate = vCloth * (1.0 - wSkin) * (1.0 - vHair) * uStrength * (1.0 - stageCollar);',
  '  vec3 wc = diffuseColor.rgb;',
  '  wc = mix(wc, uPrimary, wDark * gate);',
  '  wc = mix(wc, uSecondary, wLight * gate);',
  '  wc = mix(wc, uMid, wMid * gate * 0.82);',
  '  wc = mix(wc, uAccent, wTeal * gate * uAccentStrength);',
  '  float stageArm = vArm * smoothstep(1.245, 1.285, vGarmentPos.y);',
'  float stageCloth = vCloth * smoothstep(1.270, 1.292, vGarmentPos.y)',
  '    * (1.0 - smoothstep(1.352, 1.368, vGarmentPos.y))',
  '    * smoothstep(0.036, 0.062, abs(vGarmentPos.x));',
  '  float stageShoulder = step(0.5, uStageClean) * max(stageArm, stageCloth)',
  '    * clamp(wNeutral * smoothstep(0.20, 0.38, wLum) + 0.62 * wNeutral, 0.0, 1.0);',
  '  wc = mix(wc, uSecondary * 0.985, stageShoulder * 0.98);',
  '  float stageCap = step(0.5, uStageClean) * wSkin',
  '    * smoothstep(1.250, 1.276, vGarmentPos.y) * (1.0 - smoothstep(1.354, 1.376, vGarmentPos.y))',
  '    * smoothstep(0.062, 0.088, abs(vGarmentPos.x));',
  '  wc = mix(wc, uSecondary * 0.985, stageCap * 0.96);',
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
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
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
    uStageClean: { value: 0 },
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
  const BH = bindHeads(char);

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

// 每根骨骼在绑定姿态下的头部坐标（与模型几何同一坐标系）。
// 衣服几何必须按绑定姿态生成，否则蒙皮时会把当前动作再叠加一次。
function bindHeads(char) {
  if (char._bindHeads) return char._bindHeads;
  const inv = char.mesh.bindMatrixInverse;
  const M = char.mesh.bindMatrix.constructor;
  char._bindHeads = char.skeleton.bones.map((_, i) => {
    const m = new M().multiplyMatrices(inv, new M().copy(char.skeleton.boneInverses[i]).invert());
    const e = m.elements;
    return [e[12], e[13], e[14]];
  });
  return char._bindHeads;
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

function makeSkirtCloth(char, mesh, opts) {
  const seg = opts.segments ?? 112;
  const rings = opts.rings ?? 28;
  const anchorRings = opts.anchorRings ?? 2;
  const softAnchorRings = opts.softAnchorRings ?? 0;
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const rest = new Float32Array(position.array);
  const count = position.count;
  const world = new Float32Array(count * 3);
  const previous = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const inverseMass = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / seg);
    if (ring <= anchorRings) {
      inverseMass[i] = 0;
    } else if (ring <= anchorRings + softAnchorRings) {
      const t = (ring - anchorRings) / Math.max(1, softAnchorRings);
      inverseMass[i] = 0.16 + 0.28 * t;
    } else {
      inverseMass[i] = 1;
    }
  }
  const targetRadius = new Float32Array(count);
  const axisW = new Float32Array((rings + 1) * 3);
  const ringAxis = new Float32Array((rings + 1) * 2);
  const upAxis = new THREE.Vector3(0, 1, 0);
  for (let r = 0; r <= rings; r++) {
    let sumX = 0, sumZ = 0;
    for (let s = 0; s < seg; s++) {
      const i = r * seg + s;
      sumX += rest[i * 3];
      sumZ += rest[i * 3 + 2];
    }
    ringAxis[r * 2] = sumX / seg;
    ringAxis[r * 2 + 1] = sumZ / seg;
  }

  const ea = [], eb = [], el = [], ek = [];
  const pushEdge = (a, b, stiffness) => {
    if (inverseMass[a] === 0 && inverseMass[b] === 0) return;
    const dx = rest[a * 3] - rest[b * 3];
    const dy = rest[a * 3 + 1] - rest[b * 3 + 1];
    const dz = rest[a * 3 + 2] - rest[b * 3 + 2];
    ea.push(a); eb.push(b); el.push(Math.hypot(dx, dy, dz)); ek.push(stiffness);
  };
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      pushEdge(a, r * seg + (s + 1) % seg, 0.92);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      pushEdge(a, a + seg, 0.94);
      pushEdge(a, (r + 1) * seg + (s + 1) % seg, 0.28);
      pushEdge(r * seg + (s + 1) % seg, a + seg, 0.28);
    }
  }
  const edgeA = new Uint16Array(ea), edgeB = new Uint16Array(eb);
  const edgeRest = new Float32Array(el), edgeK = new Float32Array(ek);
  const edgeCount = edgeA.length;

  const boneByName = {};
  for (const bone of char.skeleton.bones) {
    boneByName[String(bone.name || '').replace(/^mixamorig[:_]?/i, '').toLowerCase()] = bone;
  }
  const hipBone = char.hipsBone;
  const hipIndex = char.skeleton.bones.indexOf(hipBone);
  const H = new THREE.Matrix4();
  const HInv = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const colliders = [];
  const colliderCount = 13;
  for (let i = 0; i < colliderCount; i++) colliders.push([0, 0, 0, 0, 0, 0, 0, 0]);

  function refreshMatrices() {
    mesh.updateWorldMatrix(true, false);
    hipBone.updateWorldMatrix(true, true);
    H.multiplyMatrices(mesh.matrixWorld, hipBone.matrixWorld)
      .multiply(char.skeleton.boneInverses[hipIndex])
      .multiply(mesh.bindMatrix);
    HInv.copy(H).invert();
  }

  function setCollider(slot, a, b, radiusA, radiusB = radiusA) {
    const out = colliders[slot];
    if (a) {
      const ae = a.matrixWorld.elements;
      out[0] = ae[12]; out[1] = ae[13]; out[2] = ae[14];
    } else {
      out[0] = out[1] = out[2] = 0;
    }
    if (b) {
      const be = b.matrixWorld.elements;
      out[3] = be[12]; out[4] = be[13]; out[5] = be[14];
    } else {
      out[3] = out[0]; out[4] = out[1]; out[5] = out[2];
    }
    out[6] = radiusA;
    out[7] = radiusB;
  }

  function setColliderPoints(slot, ax, ay, az, bx, by, bz, radiusA, radiusB = radiusA) {
    const out = colliders[slot];
    out[0] = ax; out[1] = ay; out[2] = az;
    out[3] = bx; out[4] = by; out[5] = bz;
    out[6] = radiusA;
    out[7] = radiusB;
  }

  function buildColliders() {
    const hips = boneByName.hips || hipBone;
    const spine = boneByName.spine;
    const lu = boneByName.leftupleg, ll = boneByName.leftleg, lf = boneByName.leftfoot, lt = boneByName.lefttoebase;
    const ru = boneByName.rightupleg, rl = boneByName.rightleg, rf = boneByName.rightfoot, rt = boneByName.righttoebase;
    const lfa = boneByName.leftforearm, lh = boneByName.lefthand;
    const rfa = boneByName.rightforearm, rh = boneByName.righthand;
    setCollider(0, hips, spine, 0.138);
    setCollider(1, lu, ll, 0.116, 0.082);
    setCollider(2, ll, lf, 0.080, 0.068);
    setCollider(3, lf, lt, 0.078, 0.070);
    setCollider(4, ru, rl, 0.124, 0.086);
    setCollider(5, rl, rf, 0.082, 0.070);
    setCollider(6, rf, rt, 0.078, 0.070);
    setCollider(7, hips, lu, 0.150, 0.120);
    setCollider(8, hips, ru, 0.150, 0.120);
    if (lfa && lh) {
      setCollider(9, lfa, lh, 0.055, 0.050);
      const ae = lfa.matrixWorld.elements, he = lh.matrixWorld.elements;
      let dx = he[12] - ae[12], dy = he[13] - ae[13], dz = he[14] - ae[14];
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      setColliderPoints(11, he[12], he[13], he[14], he[12] + dx * 0.075, he[13] + dy * 0.075, he[14] + dz * 0.075, 0.054, 0.038);
    }
    if (rfa && rh) {
      setCollider(10, rfa, rh, 0.055, 0.050);
      const ae = rfa.matrixWorld.elements, he = rh.matrixWorld.elements;
      let dx = he[12] - ae[12], dy = he[13] - ae[13], dz = he[14] - ae[14];
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      setColliderPoints(12, he[12], he[13], he[14], he[12] + dx * 0.075, he[13] + dy * 0.075, he[14] + dz * 0.075, 0.054, 0.038);
    }
  }

  function updateTargets() {
    const e = H.elements;
    upAxis.set(e[4], e[5], e[6]).normalize();
    for (let r = 0; r <= rings; r++) {
      let sumY = 0;
      for (let s = 0; s < seg; s++) sumY += rest[(r * seg + s) * 3 + 1];
      v.set(ringAxis[r * 2], sumY / seg, ringAxis[r * 2 + 1]).applyMatrix4(H);
      axisW[r * 3] = v.x;
      axisW[r * 3 + 1] = v.y;
      axisW[r * 3 + 2] = v.z;
    }
    for (let i = 0; i < count; i++) {
      v.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]).applyMatrix4(H);
      target[i * 3] = v.x;
      target[i * 3 + 1] = v.y;
      target[i * 3 + 2] = v.z;
      const ao = Math.floor(i / seg) * 3;
      let dx = v.x - axisW[ao];
      let dy = v.y - axisW[ao + 1];
      let dz = v.z - axisW[ao + 2];
      const axial = dx * upAxis.x + dy * upAxis.y + dz * upAxis.z;
      dx -= upAxis.x * axial; dy -= upAxis.y * axial; dz -= upAxis.z * axial;
      targetRadius[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  function reset() {
    refreshMatrices();
    updateTargets();
    projectTargetsToBody();
    for (let i = 0; i < count; i++) {
      world[i * 3] = previous[i * 3] = target[i * 3];
      world[i * 3 + 1] = previous[i * 3 + 1] = target[i * 3 + 1];
      world[i * 3 + 2] = previous[i * 3 + 2] = target[i * 3 + 2];
    }
    dirty = false;
  }

  const targetSlots = [1, 2, 4, 5];
  const projNeed = new Float32Array(count);
  const projSmooth = new Float32Array(count);
  const projNx = new Float32Array(count);
  const projNy = new Float32Array(count);
  const projNz = new Float32Array(count);
  const projSx = new Float32Array(count);
  const projSy = new Float32Array(count);
  const projSz = new Float32Array(count);
  const projKernel = [0.46, 0.26, 0.13, 0.07, 0.04];
  const projLim = new Float32Array(count);
  const projDone = new Float32Array(count);
  const relaxTmp = new Float32Array(count * 3);

  function relaxSurface(amount) {
    relaxTmp.set(world);
    for (let r = anchorRings + 1; r <= rings; r++) {
      const base = r * seg;
      for (let s = 0; s < seg; s++) {
        const i = base + s;
        if (inverseMass[i] === 0) continue;
        const o = i * 3;
        const sl = base + ((s + seg - 1) % seg);
        const sr = base + ((s + 1) % seg);
        let ax = world[sl * 3] + world[sr * 3];
        let ay = world[sl * 3 + 1] + world[sr * 3 + 1];
        let az = world[sl * 3 + 2] + world[sr * 3 + 2];
        let cnt = 2;
        if (r > anchorRings + 1) {
          const u = i - seg;
          ax += world[u * 3]; ay += world[u * 3 + 1]; az += world[u * 3 + 2]; cnt++;
        }
        if (r < rings) {
          const d = i + seg;
          ax += world[d * 3]; ay += world[d * 3 + 1]; az += world[d * 3 + 2]; cnt++;
        }
        const k = amount * Math.min(1, inverseMass[i]);
        relaxTmp[o] = world[o] + (ax / cnt - world[o]) * k;
        relaxTmp[o + 1] = world[o + 1] + (ay / cnt - world[o + 1]) * k;
        relaxTmp[o + 2] = world[o + 2] + (az / cnt - world[o + 2]) * k;
      }
    }
    world.set(relaxTmp);
  }

  function targetClearance(x, y, z) {
    let best = 0;
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < targetSlots.length; k++) {
      const ca = colliders[targetSlots[k]];
      if (ca[6] <= 0 && ca[7] <= 0) continue;
      const abx = ca[3] - ca[0], aby = ca[4] - ca[1], abz = ca[5] - ca[2];
      const len2 = abx * abx + aby * aby + abz * abz;
      let t = len2 > 1e-10 ? ((x - ca[0]) * abx + (y - ca[1]) * aby + (z - ca[2]) * abz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ca[0] + abx * t), dy = y - (ca[1] + aby * t), dz = z - (ca[2] + abz * t);
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const pen = ca[6] + (ca[7] - ca[6]) * t + 0.02 - dd;
      if (pen > best) {
        best = pen;
        nx = dx / dd; ny = dy / dd; nz = dz / dd;
      }
    }
    targetClearance.nx = nx;
    targetClearance.ny = ny;
    targetClearance.nz = nz;
    return best;
  }

  function projectTargetsToBody() {
    projDone.fill(0);
    for (let pass = 0; pass < 4; pass++) {
      const scale = pass === 0 ? 1 : 0.9;
      for (let i = 0; i < count; i++) {
        const ring = Math.floor(i / seg);
        if (ring <= anchorRings) { projNeed[i] = 0; projLim[i] = 0; continue; }
        const o = i * 3;
        const pen = targetClearance(target[o], target[o + 1], target[o + 2]);
        projNeed[i] = pen > 0 ? pen * scale : 0;
        if (pass === 0) projLim[i] = Math.min(0.1, projNeed[i] + 0.005);
        projNx[i] = targetClearance.nx;
        projNy[i] = targetClearance.ny;
        projNz[i] = targetClearance.nz;
      }
      for (let r = anchorRings + 1; r <= rings; r++) {
        const base = r * seg;
        for (let s = 0; s < seg; s++) {
          let sum = 0, sx = 0, sy = 0, sz = 0, wsum = 0;
          for (let k = -4; k <= 4; k++) {
            const w = projKernel[Math.abs(k)];
            const idx = base + ((((s + k) % seg) + seg) % seg);
            sum += projNeed[idx] * w;
            sx += projNx[idx] * w;
            sy += projNy[idx] * w;
            sz += projNz[idx] * w;
            wsum += w;
          }
          const avg = sum / wsum;
          projSmooth[base + s] = Math.max(avg, projNeed[base + s] * 0.62);
          projSx[base + s] = sx / wsum;
          projSy[base + s] = sy / wsum;
          projSz[base + s] = sz / wsum;
        }
      }
      for (let r = anchorRings + 1; r <= rings; r++) {
        const base = r * seg;
        for (let s = 0; s < seg; s++) {
          const i = base + s;
          const up = r - 1 > anchorRings ? projSmooth[i - seg] : projSmooth[i];
          const dn = r + 1 <= rings ? projSmooth[i + seg] : projSmooth[i];
          let val = projSmooth[i] * 0.6 + up * 0.2 + dn * 0.2;
          val = Math.max(val, projSmooth[i] * 0.88);
          val = Math.min(0.26, val);
          const room = projLim[i] - projDone[i];
          if (room <= 1e-5) continue;
          if (val > room) val = room;
          projDone[i] += val;
          const o = i * 3, ao = r * 3;
          const upN = r - 1 > anchorRings ? i - seg : i;
          const dnN = r + 1 <= rings ? i + seg : i;
          let nx = projSx[i] * 0.6 + projSx[upN] * 0.2 + projSx[dnN] * 0.2;
          let ny = projSy[i] * 0.6 + projSy[upN] * 0.2 + projSy[dnN] * 0.2;
          let nz = projSz[i] * 0.6 + projSz[upN] * 0.2 + projSz[dnN] * 0.2;
          let rx = target[o] - axisW[ao];
          let ry = target[o + 1] - axisW[ao + 1];
          let rz = target[o + 2] - axisW[ao + 2];
          const axial = rx * upAxis.x + ry * upAxis.y + rz * upAxis.z;
          rx -= upAxis.x * axial; ry -= upAxis.y * axial; rz -= upAxis.z * axial;
          const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
          nx = nx * 0.82 + (rx / rl) * 0.18;
          ny = ny * 0.82 + (ry / rl) * 0.18;
          nz = nz * 0.82 + (rz / rl) * 0.18;
          ny = ny < -0.35 ? -0.35 : ny > 0.35 ? 0.35 : ny;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          target[o] += (nx / len) * val;
          target[o + 1] += (ny / len) * val;
          target[o + 2] += (nz / len) * val;
        }
      }
    }
  }

  function pinAnchors() {
    for (let i = 0, r = 0; r <= anchorRings; r++) {
      for (let s = 0; s < seg; s++, i++) {
        world[i * 3] = previous[i * 3] = target[i * 3];
        world[i * 3 + 1] = previous[i * 3 + 1] = target[i * 3 + 1];
        world[i * 3 + 2] = previous[i * 3 + 2] = target[i * 3 + 2];
      }
    }
  }

  function collideVertex(i, maxMove = 1e9) {
    const o = i * 3;
    let x = world[o], y = world[o + 1], z = world[o + 2];
    const ao = Math.floor(i / seg) * 3;
    let rx = target[o] - axisW[ao];
    let ry = target[o + 1] - axisW[ao + 1];
    let rz = target[o + 2] - axisW[ao + 2];
    const axial = rx * upAxis.x + ry * upAxis.y + rz * upAxis.z;
    rx -= upAxis.x * axial; ry -= upAxis.y * axial; rz -= upAxis.z * axial;
    let radial = Math.hypot(rx, ry, rz);
    if (radial < 1e-6) {
      rx = x - axisW[ao]; ry = y - axisW[ao + 1]; rz = z - axisW[ao + 2];
    }
    radial = Math.hypot(rx, ry, rz);
    if (radial < 1e-6) {
      const he = hipBone.matrixWorld.elements;
      rx = x - he[12]; ry = 0; rz = z - he[14];
      radial = Math.hypot(rx, rz) || 1;
    }
    rx /= radial; ry /= radial; rz /= radial;
    const startX = x, startY = y, startZ = z;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let c = 0; c < colliders.length; c++) {
        const ca = colliders[c];
        if (ca[6] <= 0 && ca[7] <= 0) continue;
        const abx = ca[3] - ca[0], aby = ca[4] - ca[1], abz = ca[5] - ca[2];
        const len2 = abx * abx + aby * aby + abz * abz;
        let t = len2 > 1e-10 ? ((x - ca[0]) * abx + (y - ca[1]) * aby + (z - ca[2]) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ca[0] + abx * t, cy = ca[1] + aby * t, cz = ca[2] + abz * t;
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const radius = ca[6] + (ca[7] - ca[6]) * t;
        const rr = radius + 0.010;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr) continue;
        const dist = Math.sqrt(d2);
        const push = rr - dist + 0.0015;
        let ux = rx, uy = ry, uz = rz;
        if (dist > 1e-6 && dist > radius * 0.45) {
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          const align = ux * nx + uy * ny + uz * nz;
          if (align < 0.6) {
            const w = Math.min(1, (0.6 - align) / 1.2);
            ux = ux * (1 - w) + nx * w;
            uy = uy * (1 - w) + ny * w;
            uz = uz * (1 - w) + nz * w;
            const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
            ux /= ul; uy /= ul; uz /= ul;
          }
        }
        x += ux * push; y += uy * push; z += uz * push;
        moved = true;
      }
      if (!moved) break;
      const mx = x - startX, my = y - startY, mz = z - startZ;
      const md = Math.sqrt(mx * mx + my * my + mz * mz);
      if (md > maxMove) {
        const k = maxMove / md;
        x = startX + mx * k; y = startY + my * k; z = startZ + mz * k;
        break;
      }
    }
    world[o] = x; world[o + 1] = y; world[o + 2] = z;
  }

  function solveEdges(iterations, shapeScale = 1) {
    const shapeK = (opts.shapeStiffness ?? 0.022) * shapeScale;
    for (let it = 0; it < iterations; it++) {
      for (let e = 0; e < edgeCount; e++) {
        const a = edgeA[e], b = edgeB[e];
        const wa = inverseMass[a], wb = inverseMass[b];
        if (wa + wb <= 0) continue;
        const ao = a * 3, bo = b * 3;
        let dx = world[bo] - world[ao];
        let dy = world[bo + 1] - world[ao + 1];
        let dz = world[bo + 2] - world[ao + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-7) continue;
        const correction = (len - edgeRest[e]) / len * edgeK[e];
        dx *= correction; dy *= correction; dz *= correction;
        const total = wa + wb;
        const ka = wa / total, kb = wb / total;
        world[ao] += dx * ka; world[ao + 1] += dy * ka; world[ao + 2] += dz * ka;
        world[bo] -= dx * kb; world[bo + 1] -= dy * kb; world[bo + 2] -= dz * kb;
      }
      for (let i = 0; i < count; i++) {
        if (inverseMass[i] === 0) continue;
        const o = i * 3;
        const w = inverseMass[i];
        world[o] += (target[o] - world[o]) * shapeK * w;
        world[o + 1] += (target[o + 1] - world[o + 1]) * shapeK * w;
        world[o + 2] += (target[o + 2] - world[o + 2]) * shapeK * w;
      }
    }
  }

  function solveCollisions(maxMove) {
    for (let i = 0; i < count; i++) {
      if (inverseMass[i] > 0) collideVertex(i, maxMove);
    }
  }

  const pushX = new Float32Array(count);
  const pushY = new Float32Array(count);
  const pushZ = new Float32Array(count);

  function solveCollisionsSmooth(maxMove, smooth) {
    for (let i = 0; i < count; i++) {
      pushX[i] = 0; pushY[i] = 0; pushZ[i] = 0;
      if (inverseMass[i] <= 0) continue;
      const o = i * 3;
      const x0 = world[o], y0 = world[o + 1], z0 = world[o + 2];
      collideVertex(i, maxMove);
      pushX[i] = world[o] - x0;
      pushY[i] = world[o + 1] - y0;
      pushZ[i] = world[o + 2] - z0;
      world[o] = x0; world[o + 1] = y0; world[o + 2] = z0;
    }
    for (let r = anchorRings + 1; r <= rings; r++) {
      const base = r * seg;
      for (let s = 0; s < seg; s++) {
        const i = base + s;
        if (inverseMass[i] === 0) continue;
        let ax = 0, ay = 0, az = 0, wsum = 0;
        for (let k = -4; k <= 4; k++) {
          const w = projKernel[Math.abs(k)];
          const idx = base + ((((s + k) % seg) + seg) % seg);
          ax += pushX[idx] * w; ay += pushY[idx] * w; az += pushZ[idx] * w;
          wsum += w;
        }
        let dx = pushX[i] * (1 - smooth) + (ax / wsum) * smooth;
        let dy = pushY[i] * (1 - smooth) + (ay / wsum) * smooth;
        let dz = pushZ[i] * (1 - smooth) + (az / wsum) * smooth;
        const own = Math.sqrt(pushX[i] * pushX[i] + pushY[i] * pushY[i] + pushZ[i] * pushZ[i]);
        const got = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const floor = own * 0.62;
        if (got > 1e-6 && got < floor) {
          const k = floor / got;
          dx *= k; dy *= k; dz *= k;
        }
        const o = i * 3;
        world[o] += dx; world[o + 1] += dy; world[o + 2] += dz;
      }
    }
  }

  function limitStretch(maxStrain) {
    for (let pass = 0; pass < 2; pass++) {
      for (let e = 0; e < edgeCount; e++) {
        const a = edgeA[e], b = edgeB[e];
        const wa = inverseMass[a], wb = inverseMass[b];
        if (wa + wb <= 0) continue;
        const ao = a * 3, bo = b * 3;
        let dx = world[bo] - world[ao];
        let dy = world[bo + 1] - world[ao + 1];
        let dz = world[bo + 2] - world[ao + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const cap = edgeRest[e] * maxStrain;
        if (len <= cap || len < 1e-7) continue;
        const correction = (len - cap) / len * 0.85;
        dx *= correction; dy *= correction; dz *= correction;
        const total = wa + wb;
        world[ao] += dx * (wa / total); world[ao + 1] += dy * (wa / total); world[ao + 2] += dz * (wa / total);
        world[bo] -= dx * (wb / total); world[bo + 1] -= dy * (wb / total); world[bo + 2] -= dz * (wb / total);
      }
    }
  }

  function clampRadial(floor) {
    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) continue;
      const o = i * 3, ao = Math.floor(i / seg) * 3;
      const minR = targetRadius[i] * floor;
      if (minR <= 1e-5) continue;
      let dx = world[o] - axisW[ao];
      let dy = world[o + 1] - axisW[ao + 1];
      let dz = world[o + 2] - axisW[ao + 2];
      const axial = dx * upAxis.x + dy * upAxis.y + dz * upAxis.z;
      dx -= upAxis.x * axial; dy -= upAxis.y * axial; dz -= upAxis.z * axial;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len >= minR || len < 1e-6) continue;
      const k = minR / len;
      world[o] = axisW[ao] + dx * k + upAxis.x * axial;
      world[o + 1] = axisW[ao + 1] + dy * k + upAxis.y * axial;
      world[o + 2] = axisW[ao + 2] + dz * k + upAxis.z * axial;
    }
  }

  function simulate(h, time) {
    pinAnchors();
    const damp = Math.exp(-0.8 * h);
    const gravity = -2.1 * h * h;
    const windX = Math.sin(time * 0.83 + 0.7) * 0.11 * h * h;
    const windZ = Math.cos(time * 0.61 - 0.2) * 0.08 * h * h;
    const maxStep = 0.055;
    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) continue;
      const o = i * 3;
      let vx = (world[o] - previous[o]) * damp;
      let vy = (world[o + 1] - previous[o + 1]) * damp;
      let vz = (world[o + 2] - previous[o + 2]) * damp;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > maxStep) {
        const k = maxStep / speed;
        vx *= k; vy *= k; vz *= k;
      }
      previous[o] = world[o]; previous[o + 1] = world[o + 1]; previous[o + 2] = world[o + 2];
      world[o] += vx + windX;
      world[o + 1] += vy + gravity;
      world[o + 2] += vz + windZ;
    }
    clampRadial(opts.radialFloor ?? 0.86);
    solveEdges(8);
    for (let pass = 0; pass < 3; pass++) {
      solveCollisions(0.022);
      solveEdges(2, 0.08);
    }
    solveEdges(2, 0.35);
    solveCollisions(0.2);
    limitStretch(1.55);
    for (let pass = 0; pass < 7; pass++) {
      solveCollisionsSmooth(0.06, 0.86);
      relaxSurface(0.12);
      clampRadial(opts.radialFloor ?? 0.86);
    }
    solveCollisions(0.02);
  }

  function writeBack() {
    for (let i = 0; i < count; i++) {
      v.set(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]).applyMatrix4(HInv);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    position.needsUpdate = true;
    normalTick++;
    if (normalTick % 2 === 0) geometry.computeVertexNormals();
  }

  function measurePenetration() {
    let countBad = 0, maxDepth = 0;
    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) continue;
      const o = i * 3, x = world[o], y = world[o + 1], z = world[o + 2];
      for (let c = 0; c < colliders.length; c++) {
        const ca = colliders[c];
        if (ca[6] <= 0 && ca[7] <= 0) continue;
        const abx = ca[3] - ca[0], aby = ca[4] - ca[1], abz = ca[5] - ca[2];
        const len2 = abx * abx + aby * aby + abz * abz;
        let t = len2 > 1e-10 ? ((x - ca[0]) * abx + (y - ca[1]) * aby + (z - ca[2]) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ca[0] + abx * t), dy = y - (ca[1] + aby * t), dz = z - (ca[2] + abz * t);
        const radius = ca[6] + (ca[7] - ca[6]) * t;
        const depth = radius + 0.006 - Math.hypot(dx, dy, dz);
        if (depth > 1e-4) { countBad++; if (depth > maxDepth) maxDepth = depth; break; }
      }
    }
    return { count: countBad, maxDepth };
  }

  let dirty = true;
  let normalTick = 0;
  let lastMs = 0;
  return {
    reset,
    update(dt, time, active) {
      if (!active || !mesh.visible) { dirty = true; return; }
      const start = performance.now();
      refreshMatrices();
      if (dirty) reset();
      updateTargets();
      buildColliders();
      projectTargetsToBody();
      const frameDt = Math.min(Math.max(dt, 0.001), 1 / 30);
      const steps = frameDt > 0.024 ? 3 : 2;
      const h = frameDt / steps;
      for (let s = 0; s < steps; s++) simulate(h, time + s * h);
      writeBack();
      lastMs = performance.now() - start;
    },
    measurePenetration,
    debugEdge(a, b) {
      for (let e = 0; e < edgeCount; e++) {
        if ((edgeA[e] === a && edgeB[e] === b) || (edgeA[e] === b && edgeB[e] === a)) {
          const lo = a * 3, hi = b * 3;
          const dx = world[hi] - world[lo], dy = world[hi + 1] - world[lo + 1], dz = world[hi + 2] - world[lo + 2];
          return { rest: edgeRest[e], len: Math.hypot(dx, dy, dz), k: edgeK[e], wa: inverseMass[a], wb: inverseMass[b] };
        }
      }
      return null;
    },
    debugVertex(i) {
      const o = i * 3;
      return {
        world: [world[o], world[o + 1], world[o + 2]],
        target: [target[o], target[o + 1], target[o + 2]],
        rest: [rest[o], rest[o + 1], rest[o + 2]],
        inverseMass: inverseMass[i],
        targetRadius: targetRadius[i],
      };
    },
    debugColliders() {
      return colliders.map((c) => c.slice());
    },
    get vertices() { return count; },
    get edges() { return edgeCount; },
    get lastMs() { return lastMs; },
  };
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
  material.customProgramCacheKey = () => 'miku-wardrobe-skirt-v3';
  const mesh = bindSkinned(char, makeSkirtGeometry(char, opts), material);
  mesh.visible = false;
  mesh.renderOrder = opts.transparent ? 5 : 3;
  const layer = { id: opts.id, mesh, material, uniforms, role: opts.role || 'primary' };
  if (opts.physics) layer.cloth = makeSkirtCloth(char, mesh, opts);
  return layer;
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
      [0.96, 0.140, 0.110, 0.000],
      [1.02, 0.146, 0.116, 0.004],
      [1.09, 0.122, 0.106, 0.010],
      [1.16, 0.108, 0.102, 0.006],
      [1.21, 0.112, 0.102, -0.001],
      [1.25, 0.117, 0.100, -0.006],
      [1.28, 0.106, 0.092, -0.012],
      [1.30, 0.095, 0.084, -0.018],
      [1.315, 0.085, 0.077, -0.024],
      [1.33, 0.074, 0.068, -0.030],
      [1.345, 0.063, 0.059, -0.035],
      [1.36, 0.050, 0.046, -0.040],
    ],
};

function profileAt(profile, y) {
  if (y <= profile[0][0]) return [profile[0][1], profile[0][2], profile[0][3] || 0];
  for (let i = 1; i < profile.length; i++) {
    if (y <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      const t = clamp01((y - a[0]) / (b[0] - a[0]));
      return [
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t,
      ];
    }
  }
  const last = profile[profile.length - 1];
  return [last[1], last[2], last[3] || 0];
}

function torsoGeometry(char, opts) {
  const seg = opts.segments ?? 120;
  const rings = opts.rings ?? 36;
  const profile = TORSO_PROFILES[opts.profile || 'fitted'] || TORSO_PROFILES.fitted;
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const y0 = opts.y0, y1 = opts.y1;
  const centerZ = opts.centerZ ?? BODY_CENTER_Z;
  const neckStart = opts.neckStart ?? 0.38;
  const neckDrop = opts.neckDrop ?? 0.055;
  const shoulderDrop = opts.shoulderDrop ?? 0.066;
  const ease = opts.ease ?? 0.011;
  const flare = opts.flare ?? 0.0;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const front = Math.max(0, Math.sin(a));
      const side = Math.pow(Math.abs(Math.cos(a)), 1.4);
      const topY = y1 - neckDrop * sstep(neckStart, 1.0, front) - shoulderDrop * side;
      const y = y0 + (topY - y0) * t;
      const pr = profileAt(profile, y);
      const ripples = 1 + (opts.fold ?? 0.006) * Math.sin(a * (opts.pleatCount ?? 14) + 0.4) * Math.pow(t, 0.55);
      const outer = ease * (0.62 + 0.38 * Math.sin(Math.PI * t));
      const hemFlare = flare * Math.pow(1 - t, 2.2);
      const rx = (pr[0] + outer + hemFlare) * ripples;
      const rz = (pr[1] + outer * 0.72 + hemFlare * 0.8) * ripples;
      const ringCenterZ = centerZ + pr[2];
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + ringCenterZ);
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
    neck: byName.neck ?? byName.spine2 ?? 0,
    leftArm: byName.leftarm ?? byName.leftshoulder ?? 0,
    rightArm: byName.rightarm ?? byName.rightshoulder ?? 0,
    leftShoulder: byName.leftshoulder ?? byName.leftarm ?? 0,
    rightShoulder: byName.rightshoulder ?? byName.rightarm ?? 0,
  };
  const n = positions.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const ax = Math.abs(x);
    let w2 = sstep(1.10, 1.265, y);
    let w1 = sstep(0.985, 1.13, y) * (1 - w2);
    let ws = sstep(0.885, 1.005, y) * (1 - w2 - w1);
    let wh = Math.max(0, 1 - w2 - w1 - ws);
    const armGate = sstep(1.252, 1.335, y) * sstep(0.072, 0.150, ax);
    const shoulderGate = sstep(1.272, 1.345, y) * sstep(0.036, 0.115, ax);
    const neckGate = sstep(1.305, 1.352, y) * (1 - sstep(0.022, 0.086, ax));
    const armW = armGate * 0.34;
    const shoulderW = shoulderGate * 0.34;
    const neckW = neckGate * 0.20;
    const bodyScale = Math.max(0, 1 - armW - shoulderW - neckW);
    wh *= bodyScale; ws *= bodyScale; w1 *= bodyScale; w2 *= bodyScale;
    const candidates = [
      [bi.hips, wh], [bi.spine, ws], [bi.spine1, w1], [bi.spine2, w2],
      [bi.neck, neckW],
      [x >= 0 ? bi.leftArm : bi.rightArm, armW],
      [x >= 0 ? bi.leftShoulder : bi.rightShoulder, shoulderW],
    ].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = candidates.reduce((sum, item) => sum + item[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = candidates[k][0];
      sw[i * 4 + k] = candidates[k][1] / total;
    }
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
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
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
    y0: opts.y0, y1: opts.y1, hideY1: opts.hideY1 ?? opts.y1,
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

  // 袖子沿绑定姿态的手臂方向生成：几何体本身处在绑定姿态，
  // 若用当前动作的世界坐标，蒙皮时会把动作再叠加一次，袖口就会离开手掌。
  const BH = bindHeads(char);
  const handIndex = char.skeleton.bones.indexOf(hand);
  const p0 = new THREE.Vector3(...BH[armIndex]);
  const p1 = new THREE.Vector3(...BH[foreIndex]);
  const p2 = new THREE.Vector3(...BH[handIndex]);
  p0.add(new THREE.Vector3(-sign * 0.016, 0.024, 0.004));
  const lenA = p0.distanceTo(p1), lenB = p1.distanceTo(p2) || 1;
  const elbowT = clamp01(lenA / (lenA + lenB));
  const uStart = opts.start ?? 0;
  const uEnd = opts.end ?? 0.965;
  const r0 = opts.r0 ?? opts.rz0 ?? 0.054;
  const r1 = opts.r1 ?? opts.rz1 ?? 0.058;
  const rBell = opts.rBell ?? r1;
  const rCuff = opts.rCuff ?? Math.min(r1, 0.034);
  const rWrist = opts.rWrist ?? rCuff * 0.74;
  const depth = opts.depth ?? 0.84;
  const tangentA = new THREE.Vector3().subVectors(p1, p0).normalize();
  const tangentB = new THREE.Vector3().subVectors(p2, p1).normalize();

  let capCenter = null;
  let endCenter = null;
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
    const shoulderTaper = 0.56 + 0.44 * sstep(0, 0.15, t);
    const wristTaper = 1 - (1 - rWrist / rCuff) * sstep(0.945, 1.0, t);
    const radius = (r0 + (r1 - r0) * sstep(0, 0.42, t)
      + (rBell - r1) * sstep(0.32, 0.72, t)
      + (rCuff - rBell) * sstep(0.78, 1.0, t)) * shoulderTaper * wristTaper;
    if (i === 0) capCenter = center.clone();
    if (i === segments) endCenter = center.clone();
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
  let endCapIndex = -1;
  if (endCenter) {
    endCapIndex = positions.length / 3;
    positions.push(endCenter.x, endCenter.y, endCenter.z);
    normals.push(0, 0, 1);
    uvs.push(1, 0.5);
    colors.push(0.9, 0.9, 0.9);
    const lastRing = segments * (radial + 1);
    for (let j = 0; j < radial; j++) indices.push(lastRing + j, lastRing + j + 1, endCapIndex);
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
  if (endCapIndex >= 0) {
    const k = endCapIndex * 4;
    si[k] = Math.max(0, foreIndex); sw[k] = 1;
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
      waistRx: 0.142, waistRz: 0.097, hemR: 0.368, pleats: 24, pleatDepth: 0.024,
      flare: 1.18, backDrop: 0.018, centerZ: BODY_CENTER_Z,
      physics: true, anchorRings: 10, softAnchorRings: 4, shapeStiffness: 0.045, radialFloor: 0.94,
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
      transparent: true, opacity: 0.40, roughness: 0.72, metalness: 0.03,
      physics: true, anchorRings: 9, softAnchorRings: 4, shapeStiffness: 0.038, radialFloor: 0.94,
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
      id: 'stageTorso', role: 'secondary', y0: 0.962, y1: 1.352, hideY1: 1.238,
      profile: 'stage', neckStart: 0.12, neckDrop: 0.054, shoulderDrop: 0.014, ease: 0.0015, fold: 0.0015,
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
        r0: 0.054, r1: 0.058, rBell: 0.066, rCuff: 0.033, end: 1.0, depth: 0.74, ripple: 0.014,
      }),
      makeSleeve(char, -1, {
        id: 'kimonoSleeves', role: 'primary', color: '#b96d7d', trimColor: '#e0b0b8',
        r0: 0.054, r1: 0.058, rBell: 0.066, rCuff: 0.033, end: 1.0, depth: 0.74, ripple: 0.014,
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
        r0: 0.058, r1: 0.056, rBell: 0.063, rCuff: 0.034, end: 1.00, depth: 0.84, ripple: 0.012,
      }),
      makeSleeve(char, -1, {
        id: 'loungeSleeves', role: 'secondary', color: '#e8ddcb', trimColor: '#b9aa96',
        r0: 0.058, r1: 0.056, rBell: 0.063, rCuff: 0.034, end: 1.00, depth: 0.84, ripple: 0.012,
      }),
    ];
    this.layers.stageSleeves = [
      makeSleeve(char, 1, {
        id: 'stageSleeves', role: 'secondary', color: '#f1eee7', trimColor: '#d2b16b',
        r0: 0.050, r1: 0.044, rBell: 0.046, rCuff: 0.031, end: 1.0, depth: 0.82, ripple: 0.006,
      }),
      makeSleeve(char, -1, {
        id: 'stageSleeves', role: 'secondary', color: '#f1eee7', trimColor: '#d2b16b',
        r0: 0.050, r1: 0.044, rBell: 0.046, rCuff: 0.031, end: 1.0, depth: 0.82, ripple: 0.006,
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
    for (const layer of Object.values(this.layers)) {
      const items = Array.isArray(layer) ? layer : [layer];
      for (const item of items) {
        if (item && item.cloth && item.mesh.visible) item.cloth.reset();
      }
    }
    this.layers.utilityBuckle.mesh.visible = active.has('utilityBelt');

    // 长裙/上身衣片是“实穿”的独立衣层。把被它们覆盖的原模型布料挖掉，
    // 既不会出现领带或短裙穿出，也不影响皮肤和头发。
    this.base.uHideSkirt.value = (active.has('longSkirt') || active.has('loungeSkirt')) ? 1 : 0;
    this.base.uHideMiniSkirt.value = 0;
    this.base.uHideArms.value = ['kimonoSleeves', 'midnightSleeves', 'cyberSleeves', 'loungeSleeves', 'stageSleeves']
      .some((id) => active.has(id)) ? 1 : 0;
    this.base.uUnderShorts.value = active.has('underShorts') ? 1 : 0;
    this.base.uStageClean.value = active.has('stageTorso') ? 1 : 0;
    const torsoId = ['midnightTorso', 'sakuraTorso', 'cyberTorso', 'loungeTorso', 'stageTorso']
      .find((id) => active.has(id));
    this.base.uHideTorso.value = torsoId ? 1 : 0;
    if (torsoId) {
      const t = this.byId.get(torsoId);
      this.base.uHideTorsoY.value.set(t.y0, t.hideY1 ?? t.y1);
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
    const clothOn = !!this.current && this.current.id === 'stage';
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
      if (this.layers.longSkirt.cloth) this.layers.longSkirt.cloth.update(dt, time, clothOn);
    }
    if (this.layers.sheerOverskirt) {
      this.layers.sheerOverskirt.uniforms.uTime.value = time * 0.86 + 1.7;
      this.layers.sheerOverskirt.uniforms.uSway.value.copy(this.sway).multiplyScalar(1.35);
      if (this.layers.sheerOverskirt.cloth) this.layers.sheerOverskirt.cloth.update(dt, time, clothOn);
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
