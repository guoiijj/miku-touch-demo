import * as THREE from '../vendor/three/three.module.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 头部：由单位球方向 → 二次元脸型椭球 ----------
// 宽额头、收窄下巴、脸颊微鼓、面部略平
export function headPoint(n, rx, ry, rz) {
  const y = n.y;
  const t = smoothstep(-0.05, -1.0, y);           // 0：脸中部以上，1：下巴
  let X = n.x * rx, Y = y * ry, Z = n.z * rz;
  const taper = 1 - 0.46 * Math.pow(t, 1.10);
  X *= taper;
  Z *= 1 - 0.26 * Math.pow(t, 1.45);
  if (Z > 0) Z *= 0.96;                            // 脸部略平
  const cheek = 0.058 * Math.exp(-Math.pow((y + 0.36) / 0.32, 2)) * Math.max(0, n.z);
  X *= 1 + cheek * 1.0;
  Z *= 1 + cheek * 0.5;
  X *= 1 + 0.018 * Math.max(0, y);                 // 颅顶稍宽
  if (Y < 0) Y *= 0.80;                            // 缩短下巴
  return new THREE.Vector3(X, Y, Z);
}

// sockets: [{dir, r, depth}] 在脸上挖出眼窝，眼球才能"嵌"进去
export function headGeometry(rx, ry, rz, seg = 64, sockets = []) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.72));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const q = headPoint(v, rx, ry, rz);
    for (const s of sockets) {
      const ang = Math.acos(clamp(v.dot(s.dir), -1, 1));
      if (ang < s.r) {
        const k = smoothstep(s.r, s.r * 0.30, ang);
        const qn = q.clone().normalize();
        q.addScaledVector(qn, -s.depth * k);
      }
    }
    p.setXYZ(i, q.x, q.y, q.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// 贴在头表面的曲面片（眼皮/腮红/嘴/发际）
export function shellGeometry(rx, ry, rz, o) {
  const { theta0, phiC, phiH, scale = 1.01, segU = 24, segV = 12 } = o;
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  const p = g.attributes.position, uv = g.attributes.uv;
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const phi = phiC + (u - 0.5) * 2 * phiH;
    const theta1 = o.theta1Fn ? o.theta1Fn(phi, u) : o.theta1;
    const theta = theta0 + v * (theta1 - theta0);
    const st = Math.sin(theta);
    n.set(st * Math.cos(phi), Math.cos(theta), st * Math.sin(phi)).normalize();
    const q = headPoint(n, rx, ry, rz).multiplyScalar(scale);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// 旋转体（脖子/躯干/袜子/裙摆底层）
export function lathe(profile, seg = 36) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0008), y));
  return new THREE.LatheGeometry(pts, seg);
}

export function profileAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
      const k = (y - y0) / (y1 - y0 || 1e-6);
      return lerp(r0, r1, k);
    }
  }
  return profile[profile.length - 1][0];
}

// 扇形渐宽/收尖的发片（刘海、发尾、呆毛）
export function bladeGeometry(o = {}) {
  const {
    len = 0.2, w0 = 0.035, w1 = 0.008, thick = 0.012, tipThick = 0.0015,
    bend = 0.0, curl = 0.0, twist = 0.0, sway = 0.0, segU = 16, segV = 10,
  } = o;
  const pos = [], idx = [], uvs = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    const c = new THREE.Vector3(
      sway * Math.pow(u, 2),
      -len * u,
      bend * Math.pow(u, 2) + curl * Math.pow(u, 3)
    );
    const d = new THREE.Vector3(
      sway * 2 * u,
      -len,
      bend * 2 * u + curl * 3 * u * u
    ).normalize();
    const side = new THREE.Vector3(1, 0, 0);
    const nrm = new THREE.Vector3().crossVectors(d, side).normalize();
    const w = lerp(w0, w1, Math.pow(u, 1.15)) * 0.5;
    const t = lerp(thick, tipThick, Math.pow(u, 0.85)) * 0.5;
    const ang = twist * u * Math.PI;
    for (let j = 0; j <= segV; j++) {
      const a = (j / segV) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ox = ca * w, oy = sa * t;
      const rx = ox * Math.cos(ang) - oy * Math.sin(ang);
      const ry = ox * Math.sin(ang) + oy * Math.cos(ang);
      pos.push(c.x + side.x * rx + nrm.x * ry, c.y + side.y * rx + nrm.y * ry, c.z + side.z * rx + nrm.z * ry);
      uvs.push(u, j / segV);
    }
  }
  const rowLen = segV + 1;
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * rowLen + j, b = a + rowLen;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 花瓣/心形等装饰用的圆片
export function discGeometry(r, seg = 40) {
  return new THREE.CircleGeometry(r, seg);
}

export function pleatedSkirt(o = {}) {
  const { top = 0.115, bottom = 0.20, height = 0.18, seg = 40, pleat = 0.16, y0 = 0 } = o;
  const g = new THREE.CylinderGeometry(top, bottom, height, seg, 5, true);
  const p = g.attributes.position;
  const step = (Math.PI * 2) / seg;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    let a = Math.atan2(z, x);
    if (a < 0) a += Math.PI * 2;
    const col = Math.round(a / step) % seg;
    const depth = col % 2 === 0 ? 0 : pleat * lerp(0.35, 1.0, smoothstep(height / 2, -height / 2, y));
    const f = 1 - depth;
    p.setXYZ(i, x * f, y, z * f);
  }
  p.needsUpdate = true;
  const flat = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) flat.setAttribute(name, g.attributes[name].clone());
  flat.setIndex(Array.from(g.index.array));
  g.dispose();
  flat.computeVertexNormals();
  flat.translate(0, y0, 0);
  return flat;
}
// 让贴在曲面上的片（刘海/睫毛/贴片）与头面正切
export function orientToSurface(obj, dir) {
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3().crossVectors(up, dir);
  if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
  t.normalize();
  const v = new THREE.Vector3().crossVectors(dir, t).normalize();
  const m = new THREE.Matrix4().makeBasis(t, v, dir.clone().normalize());
  obj.quaternion.setFromRotationMatrix(m);
  return obj;
}

export function mesh(geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

export function group(parent, pos) {
  const g = new THREE.Group();
  if (pos) g.position.set(pos[0], pos[1], pos[2]);
  if (parent) parent.add(g);
  return g;
}
