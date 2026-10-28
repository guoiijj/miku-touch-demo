// ================================================================
//  骨骼驱动层：把 Tripo 自动绑定的标准骨架（Mixamo 命名）接到现有 rig.js 上
//  · 代理节点：rig.js 照旧往 Object3D 写 rotation / position，这里换算成骨骼局部量
//  · 语义统一为"角色空间"：X 左右、Y 上、Z 前，且按角色自身的轴向施加，
//    所以跟骨头自己的局部轴向（Mixamo 每根都不一样）无关
//  · 动画剪辑：mixer 播真人动作（待机 / 跳舞 / 挥手 …），代理旋转叠加在剪辑之上
// ================================================================
import * as THREE from '../vendor/three/three.module.js';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qid = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _vec = new THREE.Vector3();

export class BoneRig {
  constructor(bones, root) {
    this.bones = bones;
    this.root = root || null;      // 骨架根节点（承载朝向/尺寸的父节点），算世界朝向时要算进去
    this.records = [];
    this.mapped = [];
    this.depth = new Map();
    bones.forEach((b, i) => this.depth.set(b, i));
    this._chains = new Map();
  }

  // 按名字找骨头：先精确匹配，再模糊匹配（自动去掉 mixamorig: 前缀）
  find(...cands) {
    const norm = (b) => String(b.name || '').replace(/^mixamorig[:_]?/i, '').toLowerCase();
    for (const c of cands) {
      const k = c.toLowerCase();
      const hit = this.bones.find((b) => norm(b) === k);
      if (hit) return hit;
    }
    for (const c of cands) {
      const k = c.toLowerCase();
      const hit = this.bones.find((b) => norm(b).includes(k));
      if (hit) return hit;
    }
    return null;
  }

  // 从骨架根到 bone.parent 的固有旋转（相对"角色空间"）；与 matrixWorld 无关，随时可用
  _parentQuat(bone, out) {
    let chain = this._chains.get(bone);
    if (!chain) {
      chain = [];
      for (let b = bone.parent; b && b !== this.root && b.parent !== null; b = b.parent) chain.push(b);
      chain.reverse();
      if (this.root) chain.unshift(this.root);
      this._chains.set(bone, chain);
    }
    out.identity();
    for (const o of chain) out.multiply(o.quaternion);
    return out;
  }

  // 造一个代理节点：交给 rig.js 写 rotation；bone 为空时是空壳（只吞掉写入）
  proxy(bone, opts = {}) {
    const p = new THREE.Object3D();
    p.name = 'proxy';
    if (bone) {
      const rec = {
        p, bone,
        k: opts.k === undefined ? 1 : opts.k,
        sx: opts.sx === undefined ? 1 : opts.sx,
        sy: opts.sy === undefined ? 1 : opts.sy,
        sz: opts.sz === undefined ? 1 : opts.sz,
        extra: opts.extra || null,
        usePos: opts.usePos !== false,
        depth: this.depth.get(bone) ?? 0,
        q: new THREE.Quaternion(),
        pos: new THREE.Vector3(),
      };
      this.records.push(rec);
      p.userData.rec = rec;
      bone.add(p);                       // 当子节点：rig.js 读 matrixWorld 时拿到真实骨头的位姿
      this._remember(bone);
      if (rec.extra) for (const e of rec.extra) this._remember(e.bone);
    }
    return p;
  }

  _remember(bone) {
    if (this.mapped.indexOf(bone) >= 0) return;
    bone.userData.__restQ = bone.quaternion.clone();
    bone.userData.__restP = bone.position.clone();
    this.mapped.push(bone);
  }

  // 每帧：先把受控骨头复位到静止姿态（剪辑随后会覆盖被它驱动的骨头）
  reset() {
    for (const b of this.mapped) {
      b.quaternion.copy(b.userData.__restQ);
      b.position.copy(b.userData.__restP);
    }
  }

  // 把代理上的旋转 / 位移叠加到骨头上（角色空间 → 骨头局部空间）
  apply() {
    const queue = this._queue || (this._queue = []);
    queue.length = 0;
    for (const r of this.records) {
      const rot = r.p.rotation;
      if (rot.x || rot.y || rot.z) _qa.setFromEuler(_eul.set(rot.x * r.sx, rot.y * r.sy, rot.z * r.sz));
      else _qa.identity();
      r.q.copy(_qa);
      if (r.k !== 1) r.q.slerp(_qid, 1 - r.k);
      queue.push(r);
      if (r.extra) for (const e of r.extra) {
        const er = this._extraRec(e);
        er.q.copy(_qa).slerp(_qid, 1 - e.k);
        queue.push(er);
      }
    }
    queue.sort((a, b) => a.depth - b.depth);
    for (const r of queue) {
      const bone = r.bone;
      this._parentQuat(bone, _qb);                     // 父链在角色空间中的朝向（含我们刚改过的祖先）
      _qc.copy(_qb).invert().multiply(r.q).multiply(_qb);
      bone.quaternion.premultiply(_qc);
      if (r.usePos && r.p && (r.p.position.x || r.p.position.y || r.p.position.z)) {
        _vec.copy(r.p.position).applyQuaternion(_qb.copy(_qb).invert());
        bone.position.add(_vec);
      }
    }
  }

  _extraRec(e) {
    let r = this._extraMap && this._extraMap.get(e);
    if (!r) {
      if (!this._extraMap) this._extraMap = new Map();
      r = { bone: e.bone, q: new THREE.Quaternion(), usePos: false, p: null, depth: this.depth.get(e.bone) ?? 0 };
      this._extraMap.set(e, r);
    }
    return r;
  }
}

// 动作剪辑播放：常驻一段待机，需要时淡入别的动作，结束后自动淡回待机
export class ClipPlayer {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const c of clips || []) this.actions[c.name] = this.mixer.clipAction(c);
    this.names = Object.keys(this.actions);
    this.base = this.actions.idle || this.actions.Idle || null;
    this.cur = null;
    this.oneShotT = 0;
    this.looping = false;
    if (this.base) { this.base.play(); this.cur = this.base; }
  }
  has(name) { return !!this.actions[name]; }
  play(name, opts = {}) {
    const a = this.actions[name];
    if (!a) return false;
    const clip = a.getClip();
    const speed = opts.speed === 'fit' ? Math.max(0.35, clip.duration / (opts.fitTo || 3.0)) : (opts.speed || 1);
    const fade = opts.fade === undefined ? 0.3 : opts.fade;
    a.reset();
    a.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !opts.loop;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.fadeIn(fade).play();
    if (this.cur && this.cur !== a) this.cur.fadeOut(fade);
    this.cur = a;
    this.looping = !!opts.loop;
    this.oneShotT = opts.loop ? 0 : clip.duration / speed;
    return true;
  }
  stop(fade = 0.35) {
    this.oneShotT = 0;
    this.looping = false;
    if (!this.base || this.cur === this.base) return;
    this.base.reset();
    this.base.enabled = true;
    this.base.setEffectiveWeight(1);
    this.base.fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = this.base;
  }
  update(dt) {
    if (this.oneShotT > 0) {
      this.oneShotT -= dt;
      if (this.oneShotT <= 0 && !this.looping) this.stop();
    }
    this.mixer.update(dt);
  }
}
