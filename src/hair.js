import * as THREE from '../vendor/three/three.module.js';

// 发丝链：锚点跟随头部，末端滞后 => 自然甩动
export class Strand {
  constructor(o) {
    this.n = o.n;
    this.seg = o.seg;
    this.rest = o.rest.map((v) => v.clone());       // 每节相对上一节的方向（单位向量，锚点局部空间）
    this.stiff = o.stiff ?? 7.0;
    this.damp = o.damp ?? 2.6;
    this.grav = o.grav ?? -9.0;
    this.windK = o.windK ?? 1.0;
    this.mass = o.mass ?? 1.0;
    this.radial = o.radial ?? 0.17;                 // 与身体轴的碰撞半径
    this.floorY = o.floorY ?? 0.08;
    this.p = [];
    this.v = [];
    this.pull = new THREE.Vector3();                // 外部拖拽力（手指）
    this.pullAt = -1;
    this._restP = [];
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this.reset(o.anchor || new THREE.Vector3());
  }
  reset(anchorWorld) {
    this.p = []; this.v = []; this._restP = [];
    const pos = anchorWorld ? anchorWorld.clone() : new THREE.Vector3();
    const dir = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < this.n; i++) {
      if (i > 0) {
        const d = i - 1 < this.rest.length ? this.rest[i - 1] : this.rest[this.rest.length - 1];
        pos.addScaledVector(d, this.seg * (i === 1 ? 0.85 : 1));
      }
      this.p.push(pos.clone());
      this.v.push(new THREE.Vector3());
      this._restP.push(pos.clone());
    }
  }
  // anchorPos：锚点（已在同一坐标系内）；anchorQuat：锚点姿态，用于计算静止形状
  step(dt, anchorPos, anchorQuat, wind, grav) {
    const q = anchorQuat || this._q.identity();
    const g = grav || new THREE.Vector3(0, this.grav, 0);
    const restTarget = new THREE.Vector3();
    const prevRest = new THREE.Vector3().copy(anchorPos);
    for (let i = 0; i < this.n; i++) {
      if (i > 0) {
        const d = (i - 1 < this.rest.length ? this.rest[i - 1] : this.rest[this.rest.length - 1])
          .clone().applyQuaternion(q).normalize();
        prevRest.addScaledVector(d, this.seg * (i === 1 ? 0.85 : 1));
      }
      if (i === 0) { this.p[0].copy(anchorPos); this.v[0].set(0, 0, 0); continue; }
      const p = this.p[i], v = this.v[i];
      v.addScaledVector(g, dt * 0.5);
      if (wind) { v.x += wind.x * this.windK * dt; v.z += wind.z * this.windK * dt; v.y += wind.y * this.windK * dt * 0.5; }
      if (this.pullAt >= 0 && Math.abs(i - this.pullAt) < 2.5) {
        const k = 1 - Math.abs(i - this.pullAt) / 2.5;
        v.addScaledVector(this.pull, dt * 26 * k);
      }
      restTarget.copy(prevRest);
      v.addScaledVector(restTarget.sub(p), this.stiff * dt);
      v.multiplyScalar(Math.exp(-this.damp * dt));
      p.addScaledVector(v, dt);
    }
    for (let it = 0; it < 3; it++) {
      this.p[0].copy(anchorPos);
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i];
        const d = this._tmp.copy(b).sub(a);
        const len = d.length() || 1e-5;
        const target = this.seg * (i === 1 ? 0.85 : 1);
        const s = (len - target) / len;
        b.sub(d.multiplyScalar(s * 0.92));
      }
    }
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i];
      if (p.y < this.floorY) { p.y = this.floorY; this.v[i].y *= -0.18; }
      const t = THREE.MathUtils.clamp((p.y - 0.70) / 0.80, 0, 1);
      const rad = this.radial * (0.55 + 0.65 * Math.sin(Math.PI * t));
      const flat = Math.hypot(p.x, p.z);
      if (p.y > 0.62 && p.y < 1.52 && flat < rad) {
        const s = rad / (flat || 1e-5);
        p.x *= s; p.z *= s;
      }
    }
    this.pull.multiplyScalar(Math.exp(-6 * dt));
    if (this.pull.lengthSq() < 1e-4) this.pullAt = -1;
  }  spine(out) {
    const S = out.length;
    for (let i = 0; i < S; i++) {
      const t = (i / (S - 1)) * (this.n - 1);
      const i0 = Math.min(this.n - 1, Math.floor(t));
      const i1 = Math.min(this.n - 1, i0 + 1);
      const f = t - i0;
      out[i].copy(this.p[i0]).lerp(this.p[i1], f);
    }
    // 末端稍微翘起，发尾更自然
    if (this.n >= 3) {
      const tipDir = this._tmp.copy(this.p[this.n - 1]).sub(this.p[this.n - 2]);
      out[S - 1].addScaledVector(tipDir, 0.35);
    }
    return out;
  }
}

// 可变形发束网格：沿脊线布管，逐帧更新顶点
export class HairTube {
  constructor(o) {
    this.S = o.samples ?? 26;
    this.R = o.radial ?? 12;
    this.profile = o.profile;              // u => [wid, thick]
    this.lobes = o.lobes ?? 0;             // 截面脊线数（分股感）
    this.lobeAmp = o.lobeAmp ?? 0.16;
    this.points = [];
    for (let i = 0; i < this.S; i++) this.points.push(new THREE.Vector3());
    const verts = this.S * this.R;
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    const idx = [];
    for (let i = 0; i < this.S - 1; i++) {
      for (let j = 0; j < this.R; j++) {
        const a = i * this.R + j, b = i * this.R + ((j + 1) % this.R);
        const c = a + this.R, d = b + this.R;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, o.material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this._tangent = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._n1 = new THREE.Vector3();
    this._prevSide = new THREE.Vector3();
    this._ref = new THREE.Vector3(0, 0, 1);
    this._off = new THREE.Vector3();
  }
  update(spinePts) {
    const S = this.S, R = this.R, pos = this.pos, uvArr = this.uv;
    let prevSideValid = false;
    for (let i = 0; i < S; i++) {
      this.points[i].copy(spinePts[i]);
      const u = i / (S - 1);
      const t0 = spinePts[Math.max(0, i - 1)], t1 = spinePts[Math.min(S - 1, i + 1)];
      this._tangent.copy(t1).sub(t0);
      if (this._tangent.lengthSq() < 1e-10) this._tangent.set(0, -1, 0);
      this._tangent.normalize();
      // 平行传输坐标系
      if (!prevSideValid) {
        this._side.crossVectors(this._ref, this._tangent);
        if (this._side.lengthSq() < 1e-6) this._side.set(1, 0, 0).cross(this._tangent);
        this._side.normalize();
        prevSideValid = true;
      } else {
        const dot = this._prevSide.dot(this._tangent);
        this._side.copy(this._prevSide).addScaledVector(this._tangent, -dot).normalize();
      }
      this._up.crossVectors(this._tangent, this._side).normalize();
      this._prevSide.copy(this._side);
      const pr = this.profile(u);
      const w = pr[0] * 0.5, th = pr[1] * 0.5;
      const ampT = this.lobes
        ? this.lobeAmp * (0.4 + 0.6 * Math.sin(Math.PI * THREE.MathUtils.clamp((u - 0.03) / 0.94, 0, 1)))
        : 0;
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2;
        const lobe = ampT ? 1 + ampT * Math.cos(this.lobes * a) : 1;
        const ox = Math.cos(a) * w * lobe, oy = Math.sin(a) * th * lobe;
        this._off.copy(this._side).multiplyScalar(ox).addScaledVector(this._up, oy);
        const k = (i * R + j) * 3;
        pos[k] = this.points[i].x + this._off.x;
        pos[k + 1] = this.points[i].y + this._off.y;
        pos[k + 2] = this.points[i].z + this._off.z;
        this.nor[k] = this._off.x; this.nor[k + 1] = this._off.y; this.nor[k + 2] = this._off.z;
        uvArr[(i * R + j) * 2] = u;
        uvArr[(i * R + j) * 2 + 1] = j / R;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}
