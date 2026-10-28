import { clamp, lerp, smoothstep } from './build.js';

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// One-Euro 滤波：慢动作时稳、快动作时跟手
class OneEuro {
  constructor(minCutoff, beta) {
    this.min0 = minCutoff; this.beta0 = beta;
    this.min = minCutoff; this.beta = beta;
    this.x = null; this.dx = 0;
  }
  reset() { this.x = null; this.dx = 0; }
  filter(v, dt) {
    if (this.x === null || !isFinite(this.x)) { this.x = v; return v; }
    const d = dt > 0.0005 ? dt : 1 / 30;
    const alpha = (cut) => 1 / (1 + (1 / (2 * Math.PI * cut)) / d);
    const ad = alpha(1.0);
    this.dx = ad * ((v - this.x) / d) + (1 - ad) * this.dx;
    const a = alpha(this.min + this.beta * Math.abs(this.dx));
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
  nudge(target, k) {
    this.dx = 0;
    this.x = this.x === null ? target : this.x + (target - this.x) * k;
    return this.x;
  }
}

const FEELS = {
  snappy: 2.6,
  balance: 1.0,
  steady: 0.5,
};
const MODEL_WASM = '../vendor/mediapipe/wasm';
const MODEL_TASK = '../vendor/mediapipe/hand_landmarker.task';

export class HandInput {
  constructor(opts = {}) {
    this.video = opts.video;
    this.canvas = opts.canvas;
    this.overlay = opts.overlay;
    this.log = opts.log || (() => {});
    this.toast = opts.toast || (() => {});
    this.landmarker = null;
    this.camOn = false;
    this.stream = null;
    this.running = false;
    this.feel = 'balance';
    this.sensitivity = 1;
    this.pinchScale = 1;
    this.showSkeleton = true;
    this.mirror = true;
    this.devices = [];
    this.landmarks = null;
    this.lastSeen = -99;
    this.shown = false;
    this._x = new OneEuro(2.6, 1.8);
    this._y = new OneEuro(2.6, 1.8);
    this._d = new OneEuro(1.6, 0.7);
    this._p = new OneEuro(2.4, 0.9);
    this._t = 0;
    this._sendMs = 0;
    this._gpuFail = false;
    this.state = {
      present: false, cx: 0.5, cy: 0.5, depth: 0.4, pinch01: 0, pinch: false,
      pinchEdge: false, releaseEdge: false, fingers: 0, open: false, fist: false,
      pointing: false, handScale: 0.1, wave: false, palm: [0.5, 0.5], speed: 0,
      landmarks: null, source: 'none',
    };
    this._prevPinch = false;
    this._xs = [];
    this._grab = false;
    this._bindPointer();
  }

  // ---------- 无摄像头时：鼠标当指尖 ----------
  _bindPointer() {
    const el = this.canvas || window;
    const rectOf = () => (this.canvas ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight });
    this._pointer = { active: false };
    const move = (e) => {
      if (this.camOn) return;
      const r = rectOf();
      const el2 = this.canvas || document.body;
      const rw = el2.clientWidth || r.width, rh = el2.clientHeight || r.height;
      this._pointer.active = true;
      this.state.source = 'mouse';
      this.state.present = true;
      this._mx = clamp((e.clientX - r.left) / rw, 0, 1);
      this._my = clamp((e.clientY - r.top) / rh, 0, 1);
    };
    const down = (e) => { if (!this.camOn) { this._pointer.down = true; move(e); } };
    const up = () => { if (!this.camOn) this._pointer.down = false; };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  async listDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter((d) => d.kind === 'videoinput');
      return this.devices;
    } catch { return []; }
  }

  async ensureModel() {
    if (this.landmarker) return true;
    const mod = await import('../vendor/mediapipe/vision_bundle.mjs');
    const vision = await mod.FilesetResolver.forVisionTasks(MODEL_WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_TASK, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    try {
      this.landmarker = await mod.HandLandmarker.createFromOptions(vision, opts('GPU'));
    } catch (err) {
      this._gpuFail = true;
      this.log('GPU 手部模型不可用，改用 CPU');
      this.landmarker = await mod.HandLandmarker.createFromOptions(vision, opts('CPU'));
    }
    return true;
  }

  async startCamera(deviceId) {
    if (this.camOn) return true;
    try {
      this.log('正在准备手部识别模型…');
      await this.ensureModel();
      const constraints = {
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.camOn = true;
      this.running = true;
      this.state.source = 'camera';
      this._refreshStats();
      this.loop();
      this.log('摄像头已开启：把手抬到画面里，指尖靠近人物就能互动');
      return true;
    } catch (err) {
      this.camOn = false;
      const msg = String(err && err.message || err);
      this.toast('摄像头开启失败：' + msg);
      this.log('摄像头不可用，已切换为鼠标模式（把鼠标当指尖）');
      return false;
    }
  }

  stopCamera() {
    this.running = false;
    this.camOn = false;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.landmarks = null;
    this.state.present = false;
    this.state.source = 'mouse';
    this._x.reset(); this._y.reset(); this._d.reset(); this._p.reset();
  }

  _refreshStats() {
    // 用于提示：长时间看不到手
    this._emptySince = performance.now();
  }

  update(dt) {
    if (!this.camOn) this._detect(performance.now(), dt || 1 / 60);
  }

  loop() {
    if (!this.running) return;
    const step = () => {
      if (!this.running) return;
      let dt = 0;
      const now = performance.now();
      if (this._last) dt = clamp((now - this._last) / 1000, 0.001, 0.1);
      this._last = now;
      this._detect(now, dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _detect(now, dt) {
    const st = this.state;
    if (this.landmarker && this.video && this.video.readyState >= 2) {
      let res = null;
      try {
        res = this.landmarker.detectForVideo(this.video, now);
      } catch (err) { res = null; }
      let lm = null;
      if (res && res.landmarks && res.landmarks.length) {
        lm = res.landmarks[0];
        this.handed = res.handednesses?.[0]?.[0]?.categoryName || '';
      }
      this.landmarks = lm;
      if (lm) this.lastSeen = now;
      st.present = lm ? true : (now - this.lastSeen < 300);
    }
    const f = FEELS[this.feel] || 1;
    this._x.min = 2.6 * f; this._x.beta = 1.8 * f;
    this._y.min = 2.6 * f; this._y.beta = 1.8 * f;

    let cx, cy, depth, pinch01, handScale, fingers, open, fist, pointing;
    if (this.camOn && this.landmarks) {
      const L = this.landmarks;
      const tip = L[8], thumb = L[4], wrist = L[0], mcp = L[9];
      handScale = dist2(wrist, mcp) || 0.1;
      cx = this.mirror ? 1 - tip.x : tip.x;
      cy = tip.y;
      depth = clamp((handScale - 0.075) / 0.075, 0, 1);
      const pd = dist2(tip, thumb) / handScale;
      const raw = smoothstep(0.95 * this.pinchScale, 0.45 * this.pinchScale, pd);
      fingers = countFingers(L, handScale);
      open = fingers >= 4;
      fist = fingers <= 1;
      pointing = fingers === 1;
      pinch01 = this._p.filter(raw, dt);
      const was = st.pinch;
      st.pinch = was ? pinch01 > 0.42 : pinch01 > 0.62;
    } else {
      const p = this._pointer || { active: false };
      cx = this._mx ?? 0.5;
      cy = this._my ?? 0.5;
      handScale = p.down ? 0.085 : 0.105;
      depth = p.down ? 0.85 : 0.35;
      fingers = p.down ? 0 : 5;
      open = !p.down; fist = false; pointing = false;
      const want = p.down ? 1 : 0;
      pinch01 = this._p.filter(want, dt);
      st.pinch = pinch01 > 0.55;
    }
    st.pinchEdge = st.pinch && !this._prevPinch;
    st.releaseEdge = !st.pinch && this._prevPinch;
    this._prevPinch = st.pinch;

    const sx = this._x.filter(cx, dt);
    const sy = this._y.filter(cy, dt);
    const sd = this._d.filter(depth, dt);
    st.speed = Math.hypot(sx - (this._px ?? sx), sy - (this._py ?? sy)) / Math.max(dt, 1e-3);
    this._px = sx; this._py = sy;
    st.cx = sx; st.cy = sy; st.depth = sd;
    st.handScale = handScale; st.fingers = fingers; st.open = open; st.fist = fist;
    st.pointing = pointing; st.pinch01 = pinch01;
    st.landmarks = this.landmarks;
    if (this.camOn && open) {
      this._xs.push({ x: sx, t: now });
      while (this._xs.length && now - this._xs[0].t > 900) this._xs.shift();
      let turns = 0, dir = 0;
      for (let i = 1; i < this._xs.length; i++) {
        const dx = this._xs[i].x - this._xs[i - 1].x;
        if (Math.abs(dx) < 0.012) continue;
        const d = Math.sign(dx);
        if (dir !== 0 && d !== dir) turns++;
        dir = d;
      }
      st.wave = turns >= 2;
    } else {
      st.wave = false;
      this._xs.length = 0;
    }
    if (this.camOn && !this.landmarks && now - this.lastSeen > 4000 && !this._warned) {
      this._warned = true;
      this.log('还没有看到手：把手抬到画面里，或调整摄像头');
    }
    if (this.landmarks) this._warned = false;
  }
}
function countFingers(L, scale) {
  const wrist = L[0];
  let n = 0;
  const chains = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
  for (const [mcp, pip, tip] of chains) {
    const dTip = dist3(L[tip], wrist), dPip = dist3(L[pip], wrist);
    if (dTip > dPip * 1.06) n++;
  }
  // 拇指：指尖离食指根部的距离
  if (dist3(L[4], L[5]) / scale > 0.62) n++;
  return n;
}
