import * as THREE from '../vendor/three/three.module.js';
import { clamp, lerp, damp, rand, smoothstep } from './build.js';

const EXPR = {
  smile: { mouth: 'closed', brow: 0.0, browTilt: 0, blush: 0.0, eye: 1.0 },
  happy: { mouth: 'grin', brow: 0.6, browTilt: -0.1, blush: 0.15, eye: 1.0 },
  laugh: { mouth: 'grin', brow: 0.9, browTilt: -0.2, blush: 0.3, eye: 0.82 },
  shy: { mouth: 'closed', brow: -0.4, browTilt: 0.25, blush: 0.92, eye: 0.92 },
  surprised: { mouth: 'o', brow: 1.0, browTilt: 0, blush: 0.1, eye: 1.12 },
  annoyed: { mouth: 'sad', brow: -0.7, browTilt: -0.35, blush: 0.2, eye: 0.86 },
  sing: { mouth: 'sing', brow: 0.3, browTilt: 0, blush: 0.12, eye: 0.9 },
  wink: { mouth: 'smile', brow: 0.2, browTilt: 0.1, blush: 0.3, eye: 1.0 },
  smug: { mouth: 'smirk', brow: -0.2, browTilt: -0.3, blush: 0.05, eye: 0.94 },
};

export class Rig {
  constructor(ch) {
    this.ch = ch;
    this.t = 0;
    this.blink = 1;
    this.blinkT = 0;
    this.nextBlink = rand(1.8, 4.5);
    this.winkSide = 0;
    this.look = new THREE.Vector2();
    this.lookS = new THREE.Vector2();
    this.lookWorld = null;
    this.imp = { headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0, tumble: 0, bounce: 0 };
    this.expr = 'smile';
    this.exprHold = 0;
    this.blush = 0;
    this.talk = 0;
    this.singOn = false;
    this.singT = 0;
    this.danceOn = false;
    this.danceT = 0;
    this.spin = 0;
    this.spinV = 0;
    this.turnOn = false;
    this.turnV = 0;
    this.turnTo = null;
    this.waveT = 0;
    this.headPatT = 0;
    this.squishT = 0;
    this.tickleT = 0;
    this.giggleT = 0;
    this.startleT = 0;
    this.armPose = { L: { s: [0.02, 0, 0.15], e: [0.05, 0, 0.02], curl: 0.18 }, R: { s: [0.02, 0, -0.15], e: [0.05, 0, -0.02], curl: 0.18 } };
    this.armCur = JSON.parse(JSON.stringify(this.armPose));
    this.breath = 0;
    this.browBase = [];
    for (const b of ch.brows) this.browBase.push(b.position.y);
    this.talkTarget = 0;
  }

  // ---------- 表情 ----------
  setExpression(name, hold = 3.2) {
    if (!EXPR[name]) return;
    this.expr = name;
    this.exprHold = hold;
    this.blush = Math.max(this.blush, EXPR[name].blush);
  }
  blinkNow(times = 1) {
    this.blinkT = 0;
    this.blinkSeq = times;
  }
  wink() { this.winkSide = -1; this.blinkT = 0; this.blinkSeq = 1; }

  // ---------- 动作 ----------
  wave(dur = 2.6) { this.waveT = dur; this.setExpression('happy', dur); this.ch.onAction?.('wave', dur); }
  patHead() { this.headPatT = 1.3; this.setExpression('happy', 1.6); this.ch.onAction?.('patHead'); }
  squish() { this.squishT = 1.0; this.setExpression('shy', 1.5); this.ch.onAction?.('squish'); }
  tickleMouth() { this.tickleT = 1.2; this.setExpression('laugh', 1.6); this.ch.onAction?.('tickle'); }
  giggle() { this.giggleT = 1.5; this.setExpression('laugh', 1.8); this.imp.bounce = 1; this.ch.onAction?.('giggle'); }
  startle() { this.startleT = 0.9; this.setExpression('surprised', 1.4); this.ch.onAction?.('startle'); }
  shyPose() { this.setExpression('shy', 2.4); this.ch.onAction?.('shyPose'); }
  sing(on) { this.singOn = on; if (on) this.setExpression('sing', 4); this.ch.onAction?.('sing', !!on); }
  dance(on) { this.danceOn = on; this.danceT = 0; this.ch.onAction?.('dance', !!on); }
  spinOnce() { this.spin = 0.001; this.spinV = 0; this.turnOn = false; this.turnTo = null; }
  // 旋转：开着就匀速自转，关掉时稳稳停在最近的 90°（方便从任意角度看）
  turnToggle() {
    this.turnOn = !this.turnOn;
    if (this.turnOn) {
      this.spin = 0; this.turnTo = null; this.holdBody = false;
    } else {
      const q = Math.PI / 2;
      this.turnTo = Math.round(this.ch.body.rotation.y / q) * q;
    }
    return this.turnOn;
  }
  turnBy(d) { this.turnOn = false; this.turnTo = this.ch.body.rotation.y + d; }
  turnStop() { this.turnOn = false; this.turnTo = null; this.turnV = 0; this.holdBody = false; }
  lookAtPoint(p) { this.lookWorld = p; }

  update(dt, elapsed) {
    const ch = this.ch;
    this.t += dt;
    const t = this.t;

    // ---- 待机呼吸与重心 ----
    this.breath = Math.sin(t * 1.75) * 0.5 + 0.5;
    const sway = Math.sin(t * 0.55) * 0.5 + Math.sin(t * 1.13 + 1.2) * 0.2;
    // 呼吸：真人骨架由动作剪辑负责（缩放会把头一起吹大），这里只补一点点胸腔起伏
    if (ch.clipped) ch.torso.position.y = 0.0012 * this.breath;
    else ch.torso.scale.set(1 + 0.014 * this.breath, 1, 1 + 0.016 * this.breath);
    ch.hips.position.x = sway * 0.006;
    ch.hips.rotation.z = sway * 0.022;
    ch.torso.rotation.z = -sway * 0.026;
    ch.body.position.y = 0;

    // ---- 视角跟随（手指）----
    let tgtYaw = 0, tgtPitch = 0;
    if (this.lookWorld) {
      const headPos = new THREE.Vector3().setFromMatrixPosition(ch.head.matrixWorld);
      const d = this.lookWorld.clone().sub(headPos);
      const parentQ = new THREE.Quaternion();
      ch.torso.getWorldQuaternion(parentQ).invert();
      d.applyQuaternion(parentQ);
      // 真人脖子的活动范围：左右 ±34°，抬头 15°、低头 17°（再靠上身的自然晃动补足）
      tgtYaw = clamp(Math.atan2(d.x, Math.abs(d.z) + 0.001) * 0.9, -0.60, 0.60);
      tgtPitch = clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z) + 0.001) * 0.62, -0.30, 0.26);
    }
    this.lookS.x = damp(this.lookS.x, tgtYaw, 5.5, dt);
    this.lookS.y = damp(this.lookS.y, tgtPitch, 5.5, dt);

    // ---- 头 ----
    const idleHeadY = Math.sin(t * 0.42) * 0.05 + Math.sin(t * 0.83 + 0.6) * 0.02;
    const idleHeadX = Math.sin(t * 0.61 + 1.7) * 0.03;
    let headY = this.lookS.x + idleHeadY + this.imp.headY;
    let headX = this.lookS.y * 0.85 + idleHeadX + this.imp.headX;
    let headZ = this.imp.headZ + sway * 0.02;
    if (this.headPatT > 0) { headX += 0.16 * Math.sin(this.headPatT * 12) * this.headPatT; }
    if (this.tickleT > 0) { headY += 0.10 * Math.sin(this.tickleT * 22) * this.tickleT; }
    ch.head.rotation.y = damp(ch.head.rotation.y, headY, 9, dt);
    ch.head.rotation.x = damp(ch.head.rotation.x, headX, 9, dt);
    ch.head.rotation.z = damp(ch.head.rotation.z, headZ, 8, dt);

    // ---- 眨眼 ----
    this.blinkT += dt;
    let blink = 1;
    if (this.blinkSeq > 0) {
      const k = this.blinkT / 0.16;
      blink = k < 1 ? 1 - Math.sin(k * Math.PI) : 1;
      if (this.blinkT > 0.16) {
        this.blinkT = 0; this.blinkSeq--;
        if (this.blinkSeq <= 0) { this.nextBlink = rand(2.0, 5.5); if (Math.random() < 0.25) this.nextBlink = rand(0.35, 0.7); }
      }
    } else if (this.blinkT > this.nextBlink) {
      this.blinkSeq = Math.random() < 0.3 ? 2 : 1;
      this.blinkT = 0;
    }
    const e = EXPR[this.expr] || EXPR.smile;
    for (let i = 0; i < ch.lidPivots.length; i++) {
      const lid = ch.lidPivots[i];
      const isWinkSide = this.winkSide !== 0 && ch.eye.list[i].side === this.winkSide;
      const open = isWinkSide && this.blinkSeq > 0 ? 0.06 : blink;
      lid.rotation.x = damp(lid.rotation.x, -1.86 * open, 26, dt);
    }
    if (this.winkSide !== 0 && this.blinkSeq <= 0) this.winkSide = 0;

    // ---- 眼珠看向手指 ----
    const eyeOpen = clamp(blink, 0, 1);
    for (const eye of ch.eye.list) {
      const eyeY = clamp(this.lookS.x * 0.55 + this.imp.headY * 0.5, -0.5, 0.5);
      const eyeX = clamp(this.lookS.y * 0.5, -0.35, 0.35);
      const wob = Math.sin(t * 2.1 + eye.side) * 0.012;
      eye.group.rotation.y = damp(eye.group.rotation.y, eye.baseY + eyeY + wob, 10, dt);
      eye.group.rotation.x = damp(eye.group.rotation.x, -eyeX, 10, dt);
      const s = e.eye * (1 + (this.startleT > 0 ? 0.12 * this.startleT : 0));
      const want = 0.10 + 0.90 * eyeOpen;
      eye.group.scale.set(
        damp(eye.group.scale.x, s, 12, dt),
        damp(eye.group.scale.y, s * want, 22, dt),
        damp(eye.group.scale.z, s, 12, dt)
      );
    }

    // ---- 眉毛 ----
    const browLift = e.brow + (this.startleT > 0 ? this.startleT * 0.5 : 0);
    for (const [i, brow] of ch.brows.entries()) {
      const sign = i === 0 ? 1 : -1;
      const baseY = this.browBase[i] ?? brow.position.y;
      brow.position.y = damp(brow.position.y, baseY + browLift * 0.0075, 7, dt);
      brow.rotation.z = damp(brow.rotation.z, sign * (0.16 - e.browTilt * 0.55), 7, dt);
      brow.rotation.x = damp(brow.rotation.x, -browLift * 0.22, 7, dt);
    }

    // ---- 嘴 ----
    this.talk = damp(this.talk, this.talkTarget ?? 0, 18, dt);
    let shape = e.mouth;
    let mt = 0;
    if (this.singOn) {
      this.singT += dt;
      shape = 'sing';
      mt = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.singT * Math.PI * 2.6));
    } else if (this.talk > 0.10) {
      shape = 'open';
      mt = clamp(this.talk, 0, 1);
    }
    if (this.tickleT > 0.05) { shape = 'grin'; mt = 0; }
    ch.mouth.setShape(shape, mt);

    // ---- 腮红 ----
    this.blush = damp(this.blush, (EXPR[this.expr] || EXPR.smile).blush, 6, dt);
    const bAmt = clamp(this.blush * (1 + 0.2 * Math.sin(t * 3)), 0, 1);
    ch.blushMat.opacity = bAmt * 0.95;

    // ---- 手臂姿态 ----
    const P = this.armPose;
    for (const key of ['L', 'R']) {
      const sign = key === 'L' ? 1 : -1;
      P[key].s[0] = 0.02 + Math.sin(t * 1.2 + (key === 'L' ? 0 : 1.6)) * 0.035;
      P[key].s[1] = 0;
      P[key].s[2] = sign * (0.15 + Math.sin(t * 0.9 + (key === 'L' ? 0.4 : 2.1)) * 0.03);
      P[key].e[0] = 0.05 + Math.sin(t * 1.05 + (key === 'L' ? 1.1 : 0.2)) * 0.04 + 0.06;
      P[key].curl = 0.18 + Math.sin(t * 0.8 + (key === 'L' ? 0.2 : 1.4)) * 0.05;
    }
    if (this.waveT > 0) {
      this.waveT -= dt;
      const k = clamp(this.waveT / 2.6, 0, 1);
      const wig = Math.sin(t * 9.5) * 0.42;
      P.R.s[2] = -sign2('R') * lerp(0.15, 2.05, smoothstep(0, 0.22, 1 - k));
      P.R.s[0] = -0.28 * k;
      P.R.e[2] = -0.55 - 0.25 * k;
      P.R.e[0] = 0.2;
      P.R.s[1] = wig * k;
      P.R.curl = 0.05;
      P.L.curl = 0.3;
    }
    if (this.headPatT > 0) {
      this.headPatT -= dt;
      const k = clamp(this.headPatT / 1.3, 0, 1);
      P.L.s[2] = lerp(0.15, 1.05, k);
      P.L.s[0] = -0.9 * k;
      P.L.e[0] = 1.75 * k;
      P.L.curl = 0.35;
    }
    if (this.squishT > 0) {
      this.squishT -= dt;
      const k = clamp(this.squishT / 1.0, 0, 1);
      P.L.s[2] = lerp(0.15, 0.85, k); P.L.s[0] = -0.95 * k; P.L.e[0] = 1.6 * k;
      P.R.s[2] = -lerp(0.15, 0.85, k); P.R.s[0] = -0.95 * k; P.R.e[0] = 1.6 * k;
      P.L.curl = 0.55; P.R.curl = 0.55;
    }
    if (this.giggleT > 0) {
      this.giggleT -= dt;
      const k = clamp(this.giggleT / 1.5, 0, 1);
      P.L.s[2] = lerp(0.15, 0.75, k); P.R.s[2] = -lerp(0.15, 0.75, k);
      P.L.curl = 0.7 * k; P.R.curl = 0.7 * k;
      ch.body.position.y = Math.abs(Math.sin(t * 16)) * 0.012 * k;
      ch.torso.rotation.x = damp(ch.torso.rotation.x, -0.10 * k, 12, dt);
    } else {
      ch.torso.rotation.x = damp(ch.torso.rotation.x, 0.012 + this.breath * 0.006 - this.imp.bodyX * 0.4, 6, dt);
    }
    if (this.danceOn) {
      this.danceT += dt;
      const d = this.danceT;
      const beat = Math.sin(d * 5.2);
      P.L.s[2] = lerp(0.15, 1.55, 0.5 + 0.5 * beat);
      P.R.s[2] = -lerp(0.15, 1.55, 0.5 - 0.5 * beat);
      P.L.e[0] = 0.5 + 0.4 * beat;
      P.R.e[0] = 0.5 - 0.4 * beat;
      P.L.curl = 0.35; P.R.curl = 0.35;
      ch.head.rotation.z += Math.sin(d * 2.6) * 0.09;
      ch.hips.rotation.z += Math.sin(d * 2.6) * 0.09;
      ch.body.position.y = Math.abs(Math.sin(d * 5.2)) * 0.02;
      ch.legs.L.knee.rotation.x = Math.max(0, Math.sin(d * 2.6)) * 0.18;
      ch.legs.R.knee.rotation.x = Math.max(0, -Math.sin(d * 2.6)) * 0.18;
      if (Math.sin(d * 5.2) > 0.9) this.blinkNow(1);
    } else {
      ch.legs.L.knee.rotation.x = damp(ch.legs.L.knee.rotation.x, 0, 4, dt);
      ch.legs.R.knee.rotation.x = damp(ch.legs.R.knee.rotation.x, 0, 4, dt);
    }
    // 应用手臂
    for (const key of ['L', 'R']) {
      const sign = key === 'L' ? 1 : -1;
      const arm = ch.arms[key];
      const cur = this.armCur[key], tgt = P[key];
      for (let i = 0; i < 3; i++) {
        cur.s[i] = damp(cur.s[i], tgt.s[i], 10, dt);
        cur.e[i] = damp(cur.e[i], tgt.e[i], 10, dt);
      }
      cur.curl = damp(cur.curl, tgt.curl, 10, dt);
      const rest = arm.rest;
      arm.shoulder.rotation.x = rest.shoulder[0] + cur.s[0];
      arm.shoulder.rotation.y = cur.s[1];
      arm.shoulder.rotation.z = -sign * cur.s[2];
      arm.elbow.rotation.x = rest.elbow[0] + cur.e[0];
      arm.elbow.rotation.y = -sign * cur.e[1];
      arm.elbow.rotation.z = -sign * cur.e[2];
      for (const [idx, f] of arm.fingers.entries()) {
        f.root.rotation.x = cur.curl * (1.0 + idx * 0.02);
        f.mid.rotation.x = cur.curl * 0.95;
      }
      arm.thumb.root.rotation.x = 0.25 + cur.curl * 0.5;
      arm.thumb.mid.rotation.x = cur.curl * 0.7;
    }

    // ---- 转圈 / 旋转 ----
    if (this.spin > 0) {
      this.spinV = Math.min(this.spinV + dt * 7, 7.5);
      this.spin += this.spinV * dt;
      const eased = 3.14159 * 2;
      const prog = clamp((this.spin - 0.001) / eased, 0, 1);
      ch.body.rotation.y = eased * (1 - Math.pow(1 - prog, 2.4));
      if (prog >= 1) { this.spin = 0; this.spinV = 0; ch.body.rotation.y = 0; }
    } else if (this.turnOn) {
      this.turnV = Math.min(this.turnV + dt * 3.2, 0.7);
      ch.body.rotation.y += this.turnV * dt;
      if (ch.body.rotation.y > Math.PI) ch.body.rotation.y -= Math.PI * 2;
      if (ch.body.rotation.y < -Math.PI) ch.body.rotation.y += Math.PI * 2;
      this.holdBody = true;
    } else if (this.turnTo !== null) {
      ch.body.rotation.y = damp(ch.body.rotation.y, this.turnTo, 5, dt);
      if (Math.abs(ch.body.rotation.y - this.turnTo) < 0.004) {
        ch.body.rotation.y = this.turnTo;
        this.turnTo = null;
        this.turnV = 0;
        this.holdBody = true;
      }
    } else if (!this.holdBody) {
      ch.body.rotation.y = damp(ch.body.rotation.y, 0, 8, dt);
    }

    // ---- 冲击衰减 ----
    for (const k of Object.keys(this.imp)) {
      this.imp[k] = damp(this.imp[k], 0, 3.2, dt);
    }
    if (this.exprHold > 0) {
      this.exprHold -= dt;
      if (this.exprHold <= 0 && !this.singOn) this.expr = 'smile';
    }
    if (this.startleT > 0) this.startleT -= dt;
    if (this.tickleT > 0) this.tickleT -= dt;

    // ---- 头发 ----
    ch.update(dt, elapsed, {
      windX: Math.sin(t * 0.7) * 0.10,
      windZ: Math.cos(t * 0.53) * 0.06,
      impulse: null,
    });

  }

  reaction(zone, pWorld, strength = 1) {
    const ch = this.ch;
    const headPos = new THREE.Vector3().setFromMatrixPosition(ch.head.matrixWorld);
    const away = new THREE.Vector3().subVectors(headPos, pWorld);
    const dir = new THREE.Vector3().subVectors(pWorld, headPos).normalize();
    switch (zone) {
      case 'headTop': this.patHead(); this.imp.headX = -0.10 * strength; this.imp.headY = rand(-0.06, 0.06); this.imp.bodyZ = rand(-0.05, 0.05); break;
      case 'forehead': this.startle(); this.imp.headX = -0.16 * strength; break;
      case 'cheekL': case 'cheekR': {
        this.squish();
        const s = zone === 'cheekL' ? 1 : -1;
        this.imp.headZ = -s * 0.18 * strength;
        this.imp.headY = s * 0.14 * strength;
        break;
      }
      case 'mouth': this.tickleMouth(); this.imp.headX = -0.12 * strength; this.imp.headY = rand(-0.12, 0.12); break;
      case 'chin': this.giggle(); this.imp.headX = 0.12 * strength; break;
      case 'earL': case 'earR': this.shyPose(); this.imp.headZ = (zone === 'earL' ? -1 : 1) * 0.2 * strength; this.imp.headY = (zone === 'earL' ? -1 : 1) * 0.18 * strength; break;
      case 'neck': this.squish(); this.imp.headX = 0.1 * strength; break;
      case 'hair': case 'headBack': this.setExpression('surprised', 1.2); this.imp.headX = 0.14 * strength; break;
      case 'tailL': case 'tailR': {
        this.giggle();
        this.imp.headX = -0.08 * strength;
        const tl = this.ch.tails.find((x) => (x.side > 0 ? 'tailL' : 'tailR') === zone);
        if (tl) {
          let best = 0, bd = 1e9;
          for (let i = 0; i < tl.strand.n; i++) {
            const d = tl.strand.p[i].distanceTo(pWorld);
            if (d < bd) { bd = d; best = i; }
          }
          this.ch.nudgeHair(new THREE.Vector3().subVectors(pWorld, tl.strand.p[best]).multiplyScalar(0.6), best, tl);
        }
        break;
      }
      case 'skirt': this.startle(); this.imp.headX = 0.2 * strength; break;
      case 'belly': case 'waist': this.giggle(); break;
      case 'chest': this.squish(); break;
      case 'shoulderL': case 'shoulderR': this.setExpression('happy', 1.6); this.imp.headZ = (zone.endsWith('L') ? -1 : 1) * 0.1 * strength; break;
      default: this.setExpression('surprised', 1.2); this.imp.headX = 0.1 * strength; break;
    }

  }
}

function sign2(key) { return key === 'L' ? 1 : -1; }
