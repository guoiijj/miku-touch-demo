import * as THREE from '../vendor/three/three.module.js';
import {
  headPoint, headGeometry, shellGeometry, lathe, bladeGeometry,
  pleatedSkirt, mesh, group, smoothstep, lerp, clamp, rand, discGeometry, orientToSurface,
} from './build.js';
import { buildMaterials } from './materials.js';
import { Strand, HairTube } from './hair.js';
import { irisTexture, mouthTexture, blushTexture, decalTexture, particleTexture } from './textures.js';

export const H = {
  floor: 0, ankle: 0.085, knee: 0.46, hip: 0.80, waist: 0.965,
  chest: 1.155, shoulder: 1.295, neck: 1.335, headPivot: 1.44, headCenter: 1.545, top: 1.663,
};
export const HEAD = { rx: 0.084, ry: 0.112, rz: 0.095 };
const HC = new THREE.Vector3(0, H.headCenter - H.headPivot, 0);   // 头中心（head 组局部）
const dirFrom = (theta, phi) => new THREE.Vector3(
  Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)
);
const FRONT = Math.PI / 2;

export function buildCharacter() {
  const M = buildMaterials();
  M.blush.map = blushTexture();
  M.blush.needsUpdate = true;
  M.iris.map = irisTexture();

  const root = new THREE.Group();
  const body = group(root);
  const hitMeshes = [];
  const tag = (m, zone, part) => { m.userData.zone = zone; if (part) m.userData.part = part; hitMeshes.push(m); return m; };

  // ================= 头 =================
  const EYE_THETA = 1.620;
  const EYE_PHI = 0.440;
  const EYE_SOCKET_R = 0.372;
  const EYE_SOCKET_D = 0.0135;
  const EYE_R = 0.0230;
  const eyeDirs = [dirFrom(EYE_THETA, FRONT - EYE_PHI), dirFrom(EYE_THETA, FRONT + EYE_PHI)];

  const head = group(body, [0, H.headPivot, 0]);
  const skull = mesh(headGeometry(HEAD.rx, HEAD.ry, HEAD.rz, 84, eyeDirs.map((dir) => ({ dir, r: EYE_SOCKET_R, depth: EYE_SOCKET_D }))), M.skin, [HC.x, HC.y, HC.z]);
  tag(skull, 'head', 'head');
  head.add(skull);
  const neck = mesh(lathe([[0.001, -0.03], [0.0285, -0.02], [0.0300, 0.015], [0.0295, 0.05], [0.032, 0.088], [0.001, 0.098]], 24), M.skin);
  neck.position.set(0, H.neck - H.headPivot - 0.01, 0);
  tag(neck, 'neck', 'neck');
  head.add(neck);

  // ---- 眼睛：眼窝里的眼球 + 虹膜 + 绕眼心旋转的眼皮 ----
  const eyes = [];
  const lidPivots = [];
  const lids = [];
  const lashes = [];
  for (const [i, dir] of eyeDirs.entries()) {
    const sign = i === 0 ? 1 : -1;
    const surf = headPoint(dir, HEAD.rx, HEAD.ry, HEAD.rz);
    const surfLen = surf.length();
    const center = surf.clone().normalize().multiplyScalar(surfLen - EYE_SOCKET_D - 0.006);
    // 眼球
    const eyeGroup = group(head, [HC.x + center.x, HC.y + center.y, HC.z + center.z]);
    const aimQ = new THREE.Quaternion();
    {
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize(),
        new THREE.Vector3().crossVectors(dir, new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize()).normalize(),
        dir.clone().normalize()
      );
      aimQ.setFromRotationMatrix(m);
    }
    eyeGroup.quaternion.copy(aimQ);
    const baseY = 0;
    const look = group(eyeGroup);
    const ball = mesh(new THREE.SphereGeometry(EYE_R, 34, 26), M.eyeWhite);
    ball.castShadow = false;
    look.add(ball);
    const CAPT = 0.68;
    const irisGeo = new THREE.SphereGeometry(EYE_R, 40, 26, 0, Math.PI * 2, 0, CAPT);
    {
      const ip = irisGeo.attributes.position, iuv = irisGeo.attributes.uv;
      for (let vi = 0; vi < ip.count; vi++) {
        const ix = ip.getX(vi), iy = ip.getY(vi), iz = ip.getZ(vi);
        const k = Math.atan2(Math.hypot(ix, iz), iy) / CAPT;
        const an = Math.atan2(iz, ix);
        iuv.setXY(vi, 0.5 + 0.5 * k * Math.cos(an), 0.5 + 0.5 * k * Math.sin(an));
      }
      iuv.needsUpdate = true;
    }
    irisGeo.rotateX(Math.PI / 2);
    const iris = new THREE.Mesh(irisGeo, M.iris);
    iris.scale.setScalar(1.008);
    look.add(iris);
    eyes.push({ group: look, aim: eyeGroup, side: sign, baseY, dir });
    // 眼皮：以眼心为球心的小球冠，绕眼心 X 轴旋转
    const lidAim = group(head, [HC.x + center.x, HC.y + center.y, HC.z + center.z]);
    lidAim.quaternion.copy(aimQ);
    const lidPivot = group(lidAim);
    const LR = EYE_R * 1.06;
    const lidGeo = new THREE.SphereGeometry(LR, 30, 20, 0, Math.PI * 2, 0, 2.02);
    const lid = new THREE.Mesh(lidGeo, M.skin);
    lid.castShadow = false;
    lidPivot.add(lid);
    const lashGeo = new THREE.TorusGeometry(LR * Math.sin(2.02) * 0.99, EYE_R * 0.16, 8, 30);
    const lash = new THREE.Mesh(lashGeo, M.lash);
    lash.rotation.x = Math.PI / 2;
    lash.position.y = LR * Math.cos(2.02);
    lash.castShadow = false;
    lash.scale.set(1, 1, 0.72);
    lidPivot.add(lash);
    lidPivots.push(lidPivot);
    lids.push(lid);
    lashes.push(lash);
    lidPivot.rotation.x = -1.86;    // 睁开：眼皮收在眼球上后方
  }

  // ---- 眉毛 ----
  const brows = [];
  for (const sign of [1, -1]) {
    const dir = dirFrom(1.327, FRONT + sign * -0.330);
    const p = headPoint(dir, HEAD.rx, HEAD.ry, HEAD.rz).multiplyScalar(1.012);
    const g = group(head, [HC.x + p.x, HC.y + p.y, HC.z + p.z]);
    orientToSurface(g, dir);
    const arc = mesh(new THREE.TorusGeometry(0.0205, 0.0027, 8, 20, 1.45), M.brow);
    arc.rotation.z = -0.78 - sign * 0.02;
    arc.position.set(0, 0.001, 0.001);
    arc.castShadow = false;
    g.add(arc);
    head.add(g);
    brows.push(g);
  }

  // ---- 嘴（脸面上的曲面片，画布换表情）----
  const mouthGroup = group(head, [HC.x, HC.y, HC.z]);
  const mouthGeo = shellGeometry(HEAD.rx, HEAD.ry, HEAD.rz, {
    theta0: 2.18, theta1: 2.02, phiC: FRONT, phiH: 0.205, scale: 1.014, segU: 14, segV: 10,
  });
  const mouthMat = M.mouth.clone();
  mouthMat.map = mouthTexture('closed');
  const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
  mouthGroup.add(mouthMesh);
  head.add(mouthGroup);
  const mouthCache = new Map();
  function setMouth(shape, t = 0) {
    const key = shape + '|' + Math.round(t * 5);
    let tex = mouthCache.get(key);
    if (!tex) {
      tex = mouthTexture(shape, t);
      mouthCache.set(key, tex);
      if (mouthCache.size > 48) {
        const k = mouthCache.keys().next().value;
        mouthCache.get(k)?.dispose();
        mouthCache.delete(k);
      }
    }
    if (mouthMat.map !== tex) { mouthMat.map = tex; mouthMat.needsUpdate = true; }
  }

  // ---- 腮红 ----
  const blushMat = M.blush.clone();
  const blushList = [];
  for (const sign of [1, -1]) {
    const b = new THREE.Mesh(shellGeometry(HEAD.rx, HEAD.ry, HEAD.rz, {
      theta0: 1.95, theta1: 1.75, phiC: FRONT + sign * -0.60, phiH: 0.27, scale: 1.013, segU: 14, segV: 10,
    }), blushMat);
    b.position.set(HC.x, HC.y, HC.z);
    b.castShadow = false;
    head.add(b);
    blushList.push(b);
  }

  // ---- 鼻子 ----
  const noseP = headPoint(dirFrom(1.99, FRONT), HEAD.rx, HEAD.ry, HEAD.rz);
  const nose = mesh(new THREE.SphereGeometry(0.0056, 12, 10), M.skinDeep, [HC.x + noseP.x, HC.y + noseP.y, HC.z + noseP.z]);
  nose.scale.set(1.15, 0.72, 1.25);
  nose.castShadow = false;
  head.add(nose);
  // ================= 头发 =================
  const hair = group(head);
  const hairParts = { cap: null, fringe: [], sideLock: [], backHair: [], ahoge: [] };
  const dirOf = (theta, phi) => dirFrom(theta, phi);
  const cap = mesh(shellGeometry(HEAD.rx, HEAD.ry, HEAD.rz, {
    theta0: 0.0, phiC: Math.PI / 2, phiH: Math.PI, scale: 1.022, segU: 64, segV: 30,
    theta1Fn: (phi) => {
      const front = Math.max(0, Math.cos(phi - Math.PI / 2));
      const back = Math.max(0, -Math.cos(phi - Math.PI / 2));
      const side = Math.max(0, 1 - front - back);
      return 1.10 + 0.62 * back + 0.26 * side;
    },
  }), M.hair);
  cap.position.set(HC.x, HC.y, HC.z);
  cap.castShadow = false;
  cap.name = 'hairCap';
  hairParts.cap = cap;
  hair.add(cap);
  tag(cap, 'hair', 'hair');

  let seed = 20261014;
  const hairRand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const bladeCache = new Map();
  function blade(len, w0, w1, thick, bend, curl, sway) {
    const key = [len, w0, w1, thick, bend, curl, sway].map((v) => Math.round(v * 1000)).join(',');
    let g = bladeCache.get(key);
    if (!g) {
      g = bladeGeometry({ len, w0, w1, thick, bend, curl, sway, tipThick: 0.0012 });
      bladeCache.set(key, g);
    }
    return g;
  }
  const HAIR_DEBUG = typeof location !== 'undefined' && /hairdebug/.test(location.search);
  const dbgMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
  function hairBlade(theta, phi, len, w0, bend, curl, sway = 0, mat = M.hair, scale = 1.03, thick = 0.008, name = 'fringe', w1r = 0.20) {
    const dir = dirOf(theta, phi);
    const p = headPoint(dir, HEAD.rx, HEAD.ry, HEAD.rz).multiplyScalar(scale);
    if (HAIR_DEBUG) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), dbgMat);
      d.position.set(HC.x + p.x, HC.y + p.y, HC.z + p.z);
      hair.add(d);
    }
    const m = mesh(blade(len, w0, w0 * w1r, thick, bend, curl, sway), mat, [HC.x + p.x, HC.y + p.y, HC.z + p.z]);
    orientToSurface(m, dir);
    m.castShadow = false;
    m.userData.zone = 'hair';
    m.name = name;
    if (hairParts[name]) hairParts[name].push(m);
    hitMeshes.push(m);
    hair.add(m);
    return m;
  }

  // 刘海：外层 32 片薄片 + 内层 20 片，短、密、分层
  for (let i = 0; i < 32; i++) {
    const t = (i / 31 - 0.5) * 2;
    const phi = FRONT + t * 1.22;
    const theta = 1.00 + 0.05 * Math.abs(t);
    const central = 1 - Math.abs(t);
    const len = 0.028 + 0.016 * central + 0.015 * Math.abs(Math.sin(i * 1.7)) + 0.006 * hairRand();
    const w0 = 0.029 + 0.009 * hairRand();
    const bend = -0.013 - 0.012 * central;
    hairBlade(theta, phi, len, w0, bend, -0.006, t * -0.016 + Math.sin(i * 2.3) * 0.006, M.hair, 1.020 + (i % 3) * 0.005, 0.0030, 'fringe', 0.34);
  }
  for (let i = 0; i < 20; i++) {
    const t = (i / 19 - 0.5) * 2;
    const phi = FRONT + t * 1.10;
    const theta = 1.14 + 0.05 * Math.abs(t);
    const len = 0.029 + 0.014 * (1 - Math.abs(t)) + 0.004 * hairRand();
    hairBlade(theta, phi, len, 0.026, -0.010, -0.005, t * -0.010, M.hairDark, 1.046 + (i % 2) * 0.004, 0.0024, 'fringe', 0.60);
  }
  // 侧鬓：贴着侧脸垂下的两片曲面
  for (const sign of [1, -1]) {
    const phiC = FRONT + sign * 1.40;
    for (let i = 0; i < 2; i++) {
      const pc = phiC + sign * i * 0.30;
      const g = shellGeometry(HEAD.rx, HEAD.ry, HEAD.rz, {
        theta0: 1.16 + i * 0.05, phiC: pc, phiH: 0.30 + i * 0.06, scale: 1.012 + i * 0.008, segU: 26, segV: 22,
        theta1Fn: (phi) => 2.22 - (1.6 + i * 9.0) * Math.pow(phi - pc, 2),
      });
      const sl = mesh(g, i === 0 ? M.hairSide : M.hairSideDark);
      sl.position.set(HC.x, HC.y, HC.z);
      sl.castShadow = false;
      sl.userData.zone = 'hair';
      sl.name = 'sideLock';
      hairParts.sideLock.push(sl);
      hitMeshes.push(sl);
      hair.add(sl);
    }
  }
  // 后脑层次
  for (let i = 0; i < 20; i++) {
    const u = i / 19;
    const phi = FRONT + 1.78 + u * (Math.PI * 2 - 3.56);
    const theta = 1.40 + 0.30 * (0.5 + 0.5 * Math.sin(i * 1.9));
    const len = 0.070 + 0.050 * hairRand();
    hairBlade(theta, phi, len, 0.031, -0.008, -0.010, 0, M.hairDark, 1.016, 0.0044, 'backHair');
  }
  // 呆毛
  {
    const dir = dirOf(0.50, 1.35);
    const p = headPoint(dir, HEAD.rx, HEAD.ry, HEAD.rz).multiplyScalar(1.05);
    const m = mesh(blade(0.085, 0.011, 0.0025, 0.008, -0.03, 0.05, 0.03), M.hair, [HC.x + p.x, HC.y + p.y, HC.z + p.z]);
    m.rotation.set(-2.4, 0.5, 0.2);
    m.castShadow = false;
    m.userData.zone = 'hair';
    m.name = 'ahoge';
    hairParts.ahoge.push(m);
    hitMeshes.push(m);
    hair.add(m);
  }

  // ---- 双马尾（红发圈 + 弹簧链 + 可变形发束）----
  const tails = [];
  const tailProfile = (u) => {
    const w = u < 0.06 ? lerp(0.046, 0.090, u / 0.06)
      : u < 0.32 ? lerp(0.090, 0.084, (u - 0.06) / 0.26)
        : u < 0.72 ? lerp(0.084, 0.052, (u - 0.32) / 0.40)
          : lerp(0.052, 0.019, (u - 0.72) / 0.28);
    return [w, w * 0.80];
  };
  for (const sign of [1, -1]) {
    const anchorDir = new THREE.Vector3(0.58 * sign, 0.88, -0.34).normalize();
    const surf = headPoint(anchorDir, HEAD.rx, HEAD.ry, HEAD.rz).multiplyScalar(1.04);
    const anchorLocal = new THREE.Vector3(HC.x + surf.x, HC.y + surf.y, HC.z + surf.z);
    const tieG = group(head, [anchorLocal.x, anchorLocal.y, anchorLocal.z]);
    const bun = mesh(new THREE.SphereGeometry(0.034, 20, 16), M.hair, [0, -0.006, -0.004], null, [1.05, 1.1, 1.0]);
    bun.castShadow = false;
    bun.userData.zone = 'hair';
    hitMeshes.push(bun);
    tieG.add(bun);
    const ring1 = mesh(new THREE.TorusGeometry(0.0335, 0.0072, 10, 22), M.tieRed, [0.004, 0.006, 0]);
    orientToSurface(ring1, anchorDir);
    ring1.rotateX(-0.35);
    ring1.castShadow = false;
    tieG.add(ring1);
    const ring2 = mesh(new THREE.TorusGeometry(0.0305, 0.0062, 10, 20), M.tieRed, [0.004, -0.014, 0.002]);
    orientToSurface(ring2, anchorDir);
    ring2.rotateX(-0.35);
    ring2.castShadow = false;
    tieG.add(ring2);
    const clip = mesh(new THREE.BoxGeometry(0.014, 0.026, 0.010), M.clipGold, [sign * 0.026, 0.010, 0.004]);
    clip.rotation.z = sign * 0.3;
    clip.castShadow = false;
    tieG.add(clip);
    tieG.userData.zone = sign > 0 ? 'tieL' : 'tieR';
    for (const c of tieG.children) { c.userData.zone = tieG.userData.zone; hitMeshes.push(c); }

    const n = 13, seg = 0.106;
    const rest = [];
    for (let i = 0; i < n - 1; i++) {
      const u = i / (n - 2);
      const out = 0.255 + 0.105 * Math.sin(Math.PI * Math.pow(u, 0.9))
        + 0.05 * Math.sin(u * 4.2) + (u > 0.78 ? 0.24 * (u - 0.78) : 0);
      const back = -0.15 + 0.08 * u + 0.05 * Math.cos(u * 5.3);
      rest.push(new THREE.Vector3(sign * out, -1, back).normalize());
    }
    const strand = new Strand({ n, seg, rest, stiff: 11.5, damp: 2.1, grav: -9.4, windK: 0.7, radial: 0.15, floorY: 0.07 });
    strand.reset(new THREE.Vector3(0, H.headPivot, 0).add(anchorLocal));
    const tubeA = new HairTube({ samples: 30, radial: 20, lobes: 5, lobeAmp: 0.13, profile: tailProfile, material: M.hair });
    const tubeB = new HairTube({
      samples: 30, radial: 14, lobes: 4, lobeAmp: 0.20,
      profile: (u) => { const p = tailProfile(u); return [p[0] * 0.60, p[1] * 0.66]; }, material: M.hairDark,
    });
    const tubeC = new HairTube({
      samples: 30, radial: 12, lobes: 3, lobeAmp: 0.24,
      profile: (u) => { const p = tailProfile(u); return [p[0] * 0.42, p[1] * 0.46]; }, material: M.hairLight,
    });
    for (const tb of [tubeA, tubeB, tubeC]) {
      tb.mesh.userData.zone = sign > 0 ? 'tailL' : 'tailR';
      hitMeshes.push(tb.mesh);
      body.add(tb.mesh);
    }
    tails.push({ side: sign, strand, tubes: [tubeA, tubeB, tubeC], anchorLocal, tieG });
  }
  // ================= 躯干与服装 =================
  const hips = group(body, [0, H.hip, 0]);
  const torso = group(body, [0, H.hip, 0]);

  const asProfile = (world, originY) => world.map(([r, y]) => [r, y - originY]).reverse();
  const torsoWorld = [
    [0.001, 0.82], [0.072, 0.845], [0.086, 0.90], [0.083, 0.965], [0.086, 1.02],
    [0.097, 1.09], [0.101, 1.15], [0.098, 1.21], [0.086, 1.255], [0.066, 1.285], [0.044, 1.305], [0.001, 1.312],
  ];
  const torsoMesh = mesh(lathe(asProfile(torsoWorld, H.hip), 30), M.skin);
  tag(torsoMesh, 'body', 'torso');
  torso.add(torsoMesh);

  // 银白上衣（无袖背心，下摆微张）
  const vestWorld = [
    [0.001, 0.845], [0.084, 0.855], [0.105, 0.875], [0.101, 0.905], [0.093, 0.955],
    [0.094, 1.03], [0.106, 1.10], [0.109, 1.16], [0.107, 1.20], [0.100, 1.235], [0.088, 1.260], [0.072, 1.280], [0.056, 1.294], [0.046, 1.302], [0.001, 1.304],
  ];
  const vest = mesh(lathe(asProfile(vestWorld.map(([r, y]) => [r + 0.0035, y]), H.hip), 32), M.cloth);
  tag(vest, 'body', 'chest');
  torso.add(vest);
  // 领口
  const collar = mesh(lathe([
    [0.0490, -0.036], [0.0530, -0.020], [0.0505, -0.004], [0.0458, 0.016], [0.0408, 0.040], [0.0364, 0.056],
    [0.0352, 0.060], [0.0350, 0.056], [0.0392, 0.040], [0.0440, 0.016], [0.0462, -0.004], [0.0485, -0.020], [0.0450, -0.036],
  ], 30), M.cloth, [0, H.neck - H.hip + 0.002, 0]);
  torso.add(collar);
  const collarEdge = mesh(new THREE.TorusGeometry(0.0358, 0.0022, 8, 30), M.tealTrim, [0, H.neck - H.hip + 0.058, 0], [Math.PI / 2, 0, 0]);
  torso.add(collarEdge);
  // 前襟 + 腰线
  for (let k = 0; k < 10; k++) {
    const py = 0.905 + k * 0.033;
    const rr = 0.100 + 0.010 * Math.sin((k / 9) * Math.PI);
    const btn = mesh(new THREE.SphereGeometry(0.0042, 10, 8), M.vestTrim, [0, py - H.hip, rr + 0.0015]);
    btn.castShadow = false;
    torso.add(btn);
  }
  const waistBelt = mesh(lathe([[0.004, -0.014], [0.098, -0.012], [0.100, 0.012], [0.004, 0.014]], 30), M.blackSoft, [0, 0.905 - H.hip, 0]);
  tag(waistBelt, 'body', 'belly');
  torso.add(waistBelt);

  // 领带
  const tieGroup = group(torso, [0, 0, 0]);
  const knot = mesh(new THREE.BoxGeometry(0.030, 0.026, 0.020), M.tie, [0, 1.243 - H.hip, 0.112]);
  knot.rotation.set(0.06, 0, 0.78);
  tieGroup.add(knot);
  const tieBlade = mesh(bladeGeometry({
    len: 0.275, w0: 0.026, w1: 0.040, thick: 0.011, tipThick: 0.008, bend: 0.012, curl: -0.01, segU: 10, segV: 8,
  }), M.tie, [0, 1.238 - H.hip, 0.114]);
  tieBlade.rotation.x = -0.03;
  tieGroup.add(tieBlade);
  const tieEdge = mesh(bladeGeometry({
    len: 0.275, w0: 0.028, w1: 0.042, thick: 0.005, tipThick: 0.004, bend: 0.012, curl: -0.01, segU: 8, segV: 8,
  }), M.tieDark, [0, 1.238 - H.hip, 0.113]);
  tieEdge.rotation.x = -0.03;
  tieEdge.castShadow = false;
  tieGroup.add(tieEdge);
  const tieClasp = mesh(new THREE.BoxGeometry(0.030, 0.013, 0.014), M.vestTrim, [0, 1.005 - H.hip, 0.108]);
  tieGroup.add(tieClasp);
  tag(tieBlade, 'body', 'chest');
  tag(knot, 'body', 'chest');

  // 裙子（百褶 + 青绿镶边）
  const skirt = mesh(pleatedSkirt({ top: 0.096, bottom: 0.145, height: 0.180, seg: 48, pleat: 0.16, y0: 0.828 - H.hip }), M.skirt);
  tag(skirt, 'skirt', 'skirt');
  hips.add(skirt);
  const hemTrim = mesh(lathe([[0.1415, -0.008], [0.1475, 0], [0.1455, 0.010], [0.004, 0.012]], 48), M.tealTrim, [0, 0.745 - H.hip, 0]);
  hips.add(hemTrim);
  const skirtTopTrim = mesh(lathe([[0.100, -0.006], [0.104, 0.002], [0.102, 0.010], [0.004, 0.011]], 34), M.tealTrim, [0, 0.910 - H.hip, 0]);
  hips.add(skirtTopTrim);
  for (const sign of [1, -1]) {
    const strap = mesh(new THREE.BoxGeometry(0.028, 0.055, 0.010), M.blackSoft, [sign * 0.062, 0.895 - H.hip, 0.092]);
    strap.rotation.z = sign * 0.12;
    hips.add(strap);
    const buckle = mesh(new THREE.BoxGeometry(0.016, 0.012, 0.012), M.tealTrim, [sign * 0.062, 0.885 - H.hip, 0.098]);
    hips.add(buckle);
  }
  // 臀胯（避免裙下穿帮）
  const pelvis = mesh(lathe([[0.001, -0.02], [0.080, 0.0], [0.092, 0.045], [0.086, 0.10], [0.004, 0.12]], 26), M.blackSoft, [0, 0.80 - H.hip + 0.01, 0]);
  hips.add(pelvis);

  // ================= 手臂 =================
  const arms = {};
  for (const sign of [1, -1]) {
    const shoulder = group(torso, [sign * 0.114, H.shoulder - H.hip, 0.004]);
    shoulder.rotation.set(0.02, 0, -sign * 0.15);
    const deltoid = mesh(new THREE.SphereGeometry(0.033, 18, 14), M.skin, [0, -0.006, 0], null, [1, 0.95, 1]);
    tag(deltoid, 'arm', 'shoulder');
    shoulder.add(deltoid);
    const upper = mesh(lathe([
      [0.001, -0.205], [0.020, -0.198], [0.0265, -0.175], [0.0285, -0.12], [0.0305, -0.06], [0.0315, 0.004], [0.001, 0.012],
    ], 20), M.skin);
    upper.userData.zone = 'arm'; upper.userData.part = sign > 0 ? 'armL' : 'armR';
    hitMeshes.push(upper);
    shoulder.add(upper);
    // 黑色袖套（上臂一半开始）
    const sleeveUp = mesh(lathe([
      [0.001, -0.203], [0.0245, -0.196], [0.0300, -0.172], [0.0322, -0.12], [0.0342, -0.078], [0.0355, -0.070], [0.001, -0.066],
    ], 20), M.black);
    tag(sleeveUp, 'arm', sign > 0 ? 'armL' : 'armR');
    shoulder.add(sleeveUp);
    const sleeveRoll = mesh(new THREE.TorusGeometry(0.0345, 0.006, 8, 20), M.blackSoft, [0, -0.070, 0], [Math.PI / 2, 0, 0]);
    shoulder.add(sleeveRoll);
    // 01 标记（左臂）
    if (sign > 0) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.030, 0.023), new THREE.MeshBasicMaterial({
        map: decalTexture('01'), transparent: true, depthWrite: false,
      }));
      dec.position.set(0.0035, -0.045, 0.0305);
      dec.rotation.set(0, 0.35, 0);
      dec.userData.zone = 'arm'; dec.userData.part = 'armL';
      hitMeshes.push(dec);
      shoulder.add(dec);
    }
    // 前臂 + 手套袖
    const elbow = group(shoulder, [0, -0.198, 0]);
    elbow.rotation.set(0.05, 0, -sign * 0.02);
    const fore = mesh(lathe([
      [0.001, -0.180], [0.0175, -0.174], [0.0215, -0.150], [0.0245, -0.10], [0.0272, -0.02], [0.028, 0.006], [0.001, 0.014],
    ], 18), M.skin);
    tag(fore, 'arm', sign > 0 ? 'armL' : 'armR');
    elbow.add(fore);
    const sleeveFore = mesh(lathe([
      [0.001, -0.168], [0.0200, -0.163], [0.0245, -0.140], [0.0272, -0.09], [0.0298, -0.012], [0.0305, 0.006], [0.001, 0.012],
    ], 18), M.black);
    tag(sleeveFore, 'arm', sign > 0 ? 'armL' : 'armR');
    elbow.add(sleeveFore);
    for (const ly of [-0.150, -0.126]) {
      const ring = mesh(new THREE.TorusGeometry(0.0255, 0.0022, 6, 20), M.tealTrim, [0, ly, 0], [Math.PI / 2, 0, 0]);
      ring.castShadow = false;
      ring.userData.zone = 'arm'; hitMeshes.push(ring);
      elbow.add(ring);
    }
    // 手
    const hand = group(elbow, [0, -0.178, 0]);
    const palm = mesh(new THREE.SphereGeometry(0.026, 16, 14), M.skin, [0, -0.024, 0], null, [0.92, 1.25, 0.62]);
    tag(palm, 'hand', sign > 0 ? 'handL' : 'handR');
    hand.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const fi = group(hand, [(i - 1.5) * 0.0132, -0.052, 0.001]);
      fi.rotation.z = (i - 1.5) * 0.06;
      const len1 = 0.019 - Math.abs(i - 1.5) * 0.0016;
      const seg1 = mesh(lathe([[0.001, -len1], [0.0044, -len1 + 0.002], [0.0052, -len1 * 0.4], [0.0055, 0.002], [0.001, 0.004]], 10), M.skin);
      seg1.userData.zone = 'hand'; seg1.userData.part = sign > 0 ? 'handL' : 'handR';
      hitMeshes.push(seg1);
      fi.add(seg1);
      const mid = group(fi, [0, -len1, 0]);
      const len2 = 0.017 - Math.abs(i - 1.5) * 0.0014;
      const seg2 = mesh(lathe([[0.001, -len2], [0.0034, -len2 + 0.002], [0.0046, -len2 * 0.35], [0.005, 0.002], [0.001, 0.004]], 10), M.skin);
      seg2.userData.zone = 'hand'; seg2.userData.part = sign > 0 ? 'handL' : 'handR';
      hitMeshes.push(seg2);
      mid.add(seg2);
      fingers.push({ root: fi, mid });
    }
    const thumb = group(hand, [sign * 0.017, -0.030, 0.004]);
    thumb.rotation.set(0.25, 0, sign * 1.05);
    const th1 = mesh(lathe([[0.001, -0.020], [0.0048, -0.018], [0.0058, -0.008], [0.0060, 0.004], [0.001, 0.008]], 10), M.skin);
    th1.userData.zone = 'hand'; th1.userData.part = sign > 0 ? 'handL' : 'handR';
    hitMeshes.push(th1);
    thumb.add(th1);
    const th2g = group(thumb, [0, -0.020, 0]);
    const th2 = mesh(lathe([[0.001, -0.018], [0.0042, -0.016], [0.0052, -0.006], [0.0055, 0.003], [0.001, 0.006]], 10), M.skin);
    th2.userData.zone = 'hand'; th2.userData.part = sign > 0 ? 'handL' : 'handR';
    hitMeshes.push(th2);
    th2g.add(th2);
    arms[sign > 0 ? 'L' : 'R'] = { sign, shoulder, elbow, hand, fingers, thumb: { root: thumb, mid: th2g }, rest: { shoulder: [0.02, 0, -sign * 0.15], elbow: [0.05, 0, -sign * 0.02] } };
  }

  // ================= 腿 =================
  const legs = {};
  for (const sign of [1, -1]) {
    const hip = group(body, [sign * 0.060, H.hip, 0]);
    hip.rotation.z = -sign * 0.018;
    const thigh = mesh(lathe([
      [0.001, -0.348], [0.0415, -0.342], [0.0465, -0.30], [0.0525, -0.20], [0.0575, -0.08], [0.0605, 0.006], [0.001, 0.014],
    ], 22), M.skin);
    tag(thigh, 'leg', sign > 0 ? 'thighL' : 'thighR');
    hip.add(thigh);
    const knee = group(hip, [0, -0.342, 0]);
    const shin = mesh(lathe([
      [0.001, -0.372], [0.0275, -0.366], [0.0305, -0.33], [0.0365, -0.24], [0.0415, -0.13], [0.0455, -0.02], [0.047, 0.006], [0.001, 0.014],
    ], 22), M.skin);
    tag(shin, 'leg', sign > 0 ? 'shinL' : 'shinR');
    knee.add(shin);
    // 过膝袜
    const sockThigh = mesh(lathe([
      [0.001, -0.310], [0.0470, -0.305], [0.0530, -0.26], [0.0570, -0.16], [0.0605, -0.055], [0.0625, 0.004], [0.001, 0.012],
    ], 22), M.black);
    tag(sockThigh, 'leg', sign > 0 ? 'sockThighL' : 'sockThighR');
    hip.add(sockThigh);
    const sockTop = mesh(lathe([[0.0622, -0.014], [0.0668, -0.004], [0.0655, 0.008], [0.001, 0.010]], 24), M.tealTrim, [0, -0.098, 0]);
    hip.add(sockTop);
    const sockShin = mesh(lathe([
      [0.001, -0.372], [0.0300, -0.368], [0.0335, -0.335], [0.0390, -0.24], [0.0445, -0.13], [0.0480, -0.02], [0.0495, 0.058], [0.001, 0.066],
    ], 22), M.black);
    tag(sockShin, 'leg', sign > 0 ? 'sockL' : 'sockR');
    knee.add(sockShin);
    // 鞋
    const foot = group(knee, [0, -0.372, 0]);
    const shoeBody = mesh(new THREE.BoxGeometry(0.070, 0.052, 0.105), M.headphone, [0, -0.043, 0.008]);
    tag(shoeBody, 'shoe', sign > 0 ? 'shoeL' : 'shoeR');
    foot.add(shoeBody);
    const toeCap = mesh(new THREE.SphereGeometry(0.036, 16, 12), M.headphone, [0, -0.048, 0.058], null, [0.98, 0.72, 1.05]);
    tag(toeCap, 'shoe', sign > 0 ? 'shoeL' : 'shoeR');
    foot.add(toeCap);
    const heel = mesh(new THREE.BoxGeometry(0.064, 0.036, 0.045), M.headphone, [0, -0.052, -0.055]);
    foot.add(heel);
    const sole = mesh(new THREE.BoxGeometry(0.074, 0.018, 0.152), M.tealTrim, [0, -0.070, 0.016]);
    tag(sole, 'shoe', sign > 0 ? 'shoeL' : 'shoeR');
    foot.add(sole);
    const soleEdge = mesh(new THREE.BoxGeometry(0.070, 0.006, 0.148), M.tealTrim, [0, -0.0785, 0.016]);
    foot.add(soleEdge);
    const strap = mesh(new THREE.BoxGeometry(0.072, 0.016, 0.030), M.black, [0, -0.030, 0.045]);
    foot.add(strap);
    legs[sign > 0 ? 'L' : 'R'] = { sign, hip: group(body, [0, 0, 0]), thighRoot: hip, knee, foot };
  }

  // ================= 耳机 =================
  const hpG = group(head, [HC.x, HC.y, HC.z]);
  const band = mesh(new THREE.TorusGeometry(0.100, 0.0105, 14, 48, Math.PI * 1.02), M.headphone, [0, -0.004, -0.008]);
  band.scale.set(1.0, 1.30, 1.0);
  band.rotation.y = 0.06;
  hpG.add(band);
  const bandPad = mesh(new THREE.TorusGeometry(0.086, 0.0135, 12, 40, Math.PI * 0.92), M.blackSoft, [0, -0.004, -0.008]);
  bandPad.scale.set(1.0, 1.30, 1.0);
  bandPad.rotation.y = 0.06;
  bandPad.castShadow = false;
  hpG.add(bandPad);
  for (const sign of [1, -1]) {
    const cup = mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.024, 26), M.headphone, [sign * 0.094, -0.006, -0.010], [0, 0, Math.PI / 2]);
    cup.userData.zone = sign > 0 ? 'earL' : 'earR';
    hitMeshes.push(cup);
    hpG.add(cup);
    const cupRing = mesh(new THREE.TorusGeometry(0.0375, 0.0070, 10, 26), M.headphoneRed, [sign * 0.107, -0.006, -0.010], [0, Math.PI / 2, 0]);
    cupRing.userData.zone = sign > 0 ? 'earL' : 'earR';
    hitMeshes.push(cupRing);
    hpG.add(cupRing);
    const cupInner = mesh(new THREE.CircleGeometry(0.033, 24), M.blackSoft, [sign * 0.1095, -0.006, -0.010], [0, sign * Math.PI / 2, 0]);
    cupInner.userData.zone = sign > 0 ? 'earL' : 'earR';
    hitMeshes.push(cupInner);
    hpG.add(cupInner);
    const tealLine = mesh(new THREE.BoxGeometry(0.004, 0.005, 0.046), M.tealTrim, [sign * 0.098, 0.030, 0.000]);
    tealLine.rotation.y = sign * 0.4;
    tealLine.castShadow = false;
    hpG.add(tealLine);
  }
  // 麦克风（左）
  const micBase = new THREE.Vector3(0.099, -0.018, 0.022);
  const micEnd = new THREE.Vector3(0.056, -0.082, 0.076);
  const micVec = new THREE.Vector3().subVectors(micEnd, micBase);
  const micLen = micVec.length();
  const micArm = mesh(
    new THREE.CylinderGeometry(0.0042, 0.0036, micLen, 10), M.metalDark,
    [(micBase.x + micEnd.x) * 0.5, (micBase.y + micEnd.y) * 0.5, (micBase.z + micEnd.z) * 0.5],
  );
  micArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), micVec.normalize().clone());
  hpG.add(micArm);
  const micTip = mesh(new THREE.SphereGeometry(0.0112, 14, 12), M.headphoneRed, [micEnd.x, micEnd.y, micEnd.z], null, [1.1, 0.78, 1.1]);
  hpG.add(micTip);
  // ================= 热区解析 =================
  const _pv = new THREE.Vector3();
  function headZone(pWorld) {
    const p = head.worldToLocal(_pv.copy(pWorld).clone());
    const rx = p.x - HC.x, ry = p.y - HC.y, rz = p.z - HC.z;
    const front = rz > 0.028;
    if (ry > 0.086) return 'headTop';
    if (front && ry > 0.020) return 'forehead';
    if (front && ry <= 0.020 && ry > -0.040 && Math.abs(rx) > 0.040) return rx > 0 ? 'cheekL' : 'cheekR';
    if (front && ry <= -0.040 && ry > -0.068 && Math.abs(rx) < 0.034) return 'mouth';
    if (front && ry <= -0.068) return 'chin';
    if (front && ry <= 0.020 && ry > -0.040) return 'eyeArea';
    if (!front && Math.abs(rx) > 0.062 && ry > -0.05 && ry < 0.05) return rx > 0 ? 'earL' : 'earR';
    if (!front && ry < -0.02) return 'headBack';
    return 'head';
  }
  function resolveZone(pWorld, obj) {
    const coarse = (obj && obj.userData && obj.userData.zone) || 'body';
    const y = pWorld.y;
    let name = coarse, detail = null, tail = null;
    if (coarse === 'head') name = headZone(pWorld);
    else if (coarse === 'hair') name = 'hair';
    else if (coarse === 'tailL' || coarse === 'tailR') {
      const side = coarse === 'tailL' ? 1 : -1;
      const tl = tails.find((x) => x.side === side);
      let best = 0, bd = 1e9;
      if (tl) {
        for (let i = 0; i < tl.strand.n; i++) {
          const d = tl.strand.p[i].distanceTo(pWorld);
          if (d < bd) { bd = d; best = i; }
        }
      }
      name = coarse; detail = best / 11; tail = tl;
    } else if (coarse === 'arm') {
      const s = (obj.userData.part || '').endsWith('L') ? 'L' : 'R';
      name = y > 1.225 ? `shoulder${s}` : y > 1.10 ? `upperArm${s}` : y > 0.98 ? `forearm${s}` : `wrist${s}`;
    } else if (coarse === 'hand') name = obj.userData.part || 'hand';
    else if (coarse === 'leg') {
      const s = (obj.userData.part || '').endsWith('L') ? 'L' : 'R';
      name = y > 0.62 ? `thigh${s}` : y > 0.44 ? `knee${s}` : y > 0.16 ? `sock${s}` : `ankle${s}`;
    } else if (coarse === 'shoe') name = obj.userData.part || 'shoe';
    else if (coarse === 'body') {
      name = y > 1.24 ? 'chest' : y > 1.05 ? 'chest' : y > 0.94 ? 'belly' : y > 0.86 ? 'waist' : 'hip';
      if (y > 1.24 && Math.abs(pWorld.x) > 0.075) name = pWorld.x > 0 ? 'shoulderL' : 'shoulderR';
    }
    return { name, coarse, tail, detail };
  }

  // 调试用热区（默认隐藏）
  const debugZones = group(body);
  debugZones.visible = false;
  {
    const zm = new THREE.MeshBasicMaterial({ color: 0x3fd8c0, wireframe: true, transparent: true, opacity: 0.5 });
    const spots = [
      ['headTop', 0, 1.645, 0, 0.07], ['forehead', 0, 1.585, 0.075, 0.05], ['cheekL', 0.055, 1.510, 0.078, 0.04],
      ['cheekR', -0.055, 1.510, 0.078, 0.04], ['mouth', 0, 1.493, 0.096, 0.032], ['chin', 0, 1.462, 0.082, 0.032],
      ['earL', 0.098, 1.545, -0.006, 0.045], ['earR', -0.098, 1.545, -0.006, 0.045],
      ['chest', 0, 1.16, 0.105, 0.09], ['belly', 0, 0.99, 0.098, 0.09], ['skirt', 0, 0.80, 0.14, 0.11],
      ['handL', 0.20, 0.72, 0.02, 0.05], ['handR', -0.20, 0.72, 0.02, 0.05],
    ];
    for (const [n, x, y, z, r] of spots) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), zm);
      s.position.set(x, y, z);
      s.userData.label = n;
      debugZones.add(s);
    }
  }
  body.add(debugZones);

  // ================= 头发更新 =================
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const wind = new THREE.Vector3();
  const spineBufs = [];
  let wp = 0;
  function update(dt, elapsed, state = {}) {
    body.updateMatrixWorld(true);
    _m.copy(body.matrixWorld).invert();
    _m2.multiplyMatrices(_m, head.matrixWorld).decompose(_p, _q, _s);
    wp += dt;
    const gust = 0.55 + 0.45 * Math.sin(wp * 0.6) + 0.22 * Math.sin(wp * 1.73 + 1.1);
    wind.set(0.11 * gust + (state.windX || 0), 0.01 * gust, -0.05 * gust + (state.windZ || 0));
    if (state.impulse) wind.add(state.impulse);
    for (let ti = 0; ti < tails.length; ti++) {
      const tl = tails[ti];
      const rad = tl.side;
      // 头部外旋时，锚点姿态也带入，让发根自然
      tl.strand.step(dt, _p, _q, wind);
      if (!spineBufs[ti] || spineBufs[ti][0].length !== tl.tubes[0].S) {
        const S0 = tl.tubes[0].S;
        spineBufs[ti] = [0, 1, 2].map(() => Array.from({ length: S0 }, () => new THREE.Vector3()));
      }
      const base = tl.strand.spine(spineBufs[ti][0]);
      const S = base.length;
      const side = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (const [k, tube] of tl.tubes.entries()) {
        const buf = spineBufs[ti][k];
        if (k === 0) { tube.update(base); continue; }
        const scale = k === 1 ? 0.62 : 0.42;
        for (let i = 0; i < S; i++) {
          const u = i / (S - 1);
          const a = base[Math.min(S - 1, i + 1)].clone().sub(base[Math.max(0, i - 1)]);
          if (a.lengthSq() < 1e-9) a.set(0, -1, 0);
          tan.copy(a).normalize();
          side.crossVectors(tan, up);
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
          side.normalize();
          const aR = tailProfile(u)[0] * 0.5;
          const bR = aR * scale;
          const hug = (aR - bR) * 0.9 + 0.004;
          const dir = k === 1 ? 1 : -1;
          buf[i].copy(base[i]).addScaledVector(side, dir * hug).addScaledVector(tan, k === 2 ? 0.004 : 0);
        }
        tube.update(buf);
      }
    }
  }
  function nudgeHair(dir, idx, tail) {
    for (const tl of tails) {
      if (tail && tl.side !== tail.side) continue;
      tl.strand.pullAt = idx ?? 6;
      tl.strand.pull.copy(dir);
    }
  }

  return {
    root, body, hips, torso, head, HC,
    mat: M,
    eye: { list: eyes },
    lidPivots, lids,
    brows,
    mouth: { mesh: mouthMesh, group: mouthGroup, setShape: setMouth },
    blush: blushList, blushMat,
    arms, legs, tails,
    hitMeshes, resolveZone, update, nudgeHair,
    hairGroup: hair, hairParts, lashes, lids, lidPivots, eyeGroups: eyes,
    debugZones,
    dirOnHead: (theta, phi) => headPoint(dirFrom(theta, phi), HEAD.rx, HEAD.ry, HEAD.rz),
  };
}