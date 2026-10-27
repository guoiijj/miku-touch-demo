import * as THREE from '../vendor/three/three.module.js';
import { buildCharacter, H } from './character.js';
import { buildModelCharacter } from './modelCharacter.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { Rig } from './rig.js';
import { HandInput } from './hand.js';
import { Particles } from './particles.js';
import { Voice } from './speech.js';
import { MicInput } from './mic.js';
import { setupUI } from './ui.js';
import { clamp, lerp, damp, rand } from './build.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x081014, 0.045);
scene.background = new THREE.Color(0x081014);

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(0xe8fbff, 0x14222a, 0.65);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4ea, 2.35);
key.position.set(2.1, 3.1, 2.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.4;
key.shadow.camera.far = 9;
key.shadow.camera.left = -1.4;
key.shadow.camera.right = 1.4;
key.shadow.camera.top = 2.4;
key.shadow.camera.bottom = -0.2;
key.shadow.bias = -0.0009;
key.shadow.normalBias = 0.012;
scene.add(key);
const fill = new THREE.DirectionalLight(0xa8ecff, 0.85);
fill.position.set(-2.4, 1.5, 2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x46e0c8, 1.5);
rim.position.set(-1.4, 2.2, -3.0);
scene.add(rim);
const rim2 = new THREE.PointLight(0x7ef0dc, 1.2, 6, 2);
rim2.position.set(1.6, 1.2, -1.6);
scene.add(rim2);

// ---------- 背景 ----------
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(512, 300, 20, 512, 300, 620);
  rg.addColorStop(0, '#1d3d44');
  rg.addColorStop(0.38, '#122730');
  rg.addColorStop(0.72, '#0a161c');
  rg.addColorStop(1, '#04080a');
  g.fillStyle = rg;
  g.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dome = new THREE.Mesh(
  new THREE.SphereGeometry(9, 40, 24),
  new THREE.MeshBasicMaterial({ map: backdropTexture(), side: THREE.BackSide, fog: false })
);
scene.add(dome);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0x0d1a20, roughness: 0.72, metalness: 0.08 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.52, 0.55, 96),
  new THREE.MeshBasicMaterial({ color: 0x36d9c2, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.004;
scene.add(ring);
const ring2 = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 0.905, 96),
  new THREE.MeshBasicMaterial({ color: 0x2bb9a6, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
);
ring2.rotation.x = -Math.PI / 2;
ring2.position.y = 0.003;
scene.add(ring2);

// ---------- 相机 ----------
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 60);
const VIEWS = {
  front: { yaw: 0, pitch: 0.045, dist: 3.75, ty: 0.90 },
  side: { yaw: Math.PI / 2, pitch: 0.04, dist: 3.65, ty: 0.90 },
  back: { yaw: Math.PI, pitch: 0.04, dist: 3.75, ty: 0.90 },
  face: { yaw: 0.10, pitch: 0.0, dist: 0.80, ty: 1.52 },
};
const cam = { yaw: 0.0, pitch: 0.045, dist: 3.75, ty: 0.90, tYaw: 0, tPitch: 0.045, tDist: 3.75, tTy: 0.90 };
const camTarget = new THREE.Vector3(0, 0.94, 0);
let autoOrbit = 0;

function applyView(name) {
  const v = VIEWS[name] || VIEWS.front;
  cam.tYaw = v.yaw; cam.tPitch = v.pitch; cam.tDist = v.dist; cam.tTy = v.ty;
  autoOrbit = 0;
}
function updateCamera(dt) {
  cam.yaw = damp(cam.yaw, cam.tYaw + autoOrbit, 6, dt);
  cam.pitch = damp(cam.pitch, cam.tPitch, 6, dt);
  cam.dist = damp(cam.dist, cam.tDist, 6, dt);
  cam.ty = damp(cam.ty, cam.tTy, 6, dt);
  camTarget.set(0, cam.ty, 0);
  const dir = new THREE.Vector3(
    Math.sin(cam.yaw) * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
    Math.cos(cam.yaw) * Math.cos(cam.pitch)
  );
  const desired = camTarget.clone().addScaledVector(dir, cam.dist);
  camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  camera.lookAt(camTarget);
}
camera.position.set(0, 1.0, 3.8);
camera.lookAt(0, 0.90, 0);

// ---------- 人物 ----------
// 人物：默认用 Tripo AI 生成的写实模型（models/miku.glb）；?model=0 切回程序化角色
let char = null;
const wantModel = new URLSearchParams(location.search).get('model') !== '0';
if (wantModel) {
  // 优先用 Tripo 自动绑定骨骼 + 真人动作的版本，失败再退回单网格版
  for (const url of ['models/miku_rig.glb', 'models/miku.glb']) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const gltf = await new GLTFLoader().parseAsync(await resp.arrayBuffer(), 'models/');
      char = buildModelCharacter({ renderer, scene, gltf });
      break;
    } catch (e) {
      console.warn('模型载入失败：', url, e && e.message ? e.message : e);
    }
  }
}
if (!char) char = buildCharacter();
scene.add(char.root);
const rig = new Rig(char);

// 指尖光标
const cursorDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.013, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x9cfff0, transparent: true, opacity: 0.9 })
);
scene.add(cursorDot);
const cursorRing = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (await import('./textures.js')).particleTexture('ring'),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0,
}));
cursorRing.scale.setScalar(0.16);
scene.add(cursorRing);
const hoverRing = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (await import('./textures.js')).particleTexture('spark'),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
}));
scene.add(hoverRing);

const particles = new Particles(scene);
const voice = new Voice({ onLevel: (l) => { rig.talkTarget = Math.max(rig.talkTarget * 0.6, l * 0.95); } });
// ---------- 语音指令（点「开启麦克风」后直接说）----------
function voiceCommand(s) {
  if (!s) return false;
  const has = (...ws) => ws.some((w) => s.includes(w));
  const say = (t, tag) => { voice.speak(t); ui.log('语音指令 · ' + tag); };
  const syncTurn = () => { const b = document.getElementById('btnTurn'); if (b) b.classList.toggle('on', rig.turnOn); };
  if (has('不要转', '别转', '停下', '停一下', '停止')) { rig.turnStop(); syncTurn(); say('好，停住', '停下'); return true; }
  if (has('转一圈', '转个圈', '转一下')) { rig.spinOnce(); syncTurn(); say('转一圈咯～', '转一圈'); return true; }
  if (has('旋转', '转起来', '转给我看', '转圈')) { rig.turnToggle(); syncTurn(); say(rig.turnOn ? '好，我转给你看～' : '好，停在这里', '旋转'); return true; }
  if (has('转身', '转过去', '转过来', '背面')) { rig.turnBy(Math.PI); syncTurn(); say('转过去啦～', '转身'); return true; }
  if (has('左转', '往左', '左边')) { rig.turnBy(Math.PI / 2); syncTurn(); say('往左边转～', '左转'); return true; }
  if (has('右转', '往右', '右边')) { rig.turnBy(-Math.PI / 2); syncTurn(); say('往右边转～', '右转'); return true; }
  return false;
}

const mic = new MicInput({
  onLevel: (l) => {
    if (l > 0.05) {
      rig.talkTarget = Math.max(rig.talkTarget, Math.min(1, l * 1.25));
      rig.micActive = performance.now();
    }
  },
  onText: (t) => {
    if (voiceCommand((t || '').replace(/[，。！？、,.!?\s]/g, ''))) return;
    if (!rig.micEcho) return;
    if (t && t.length > 0 && t.length < 40) { voice.speak(t); ui.log('她说：' + t); }
  },
});

// ---------- 手指交互 ----------
const raycaster = new THREE.Raycaster();
const cursor = new THREE.Vector3();
const lastCursor = new THREE.Vector3();
let hover = null;
let latchZone = null;
let lastHover = null;
let lastHoverT = 0;
let latchPoint = null;
let grab = null;
let grabStart = 0;
let waveCd = 0;
let fistCd = 0;
let chatterCd = rand(22, 34);
let zoneCd = {};
const LINE = {
  headTop: ['啊——头顶被摸到了', '再摸就长不高啦～', '嘿嘿…好舒服', '你的手好暖呀'],
  forehead: ['呀！吓我一跳', '额头也要照顾到吗？', '嗯……这样很舒服'],
  cheekL: ['噗——别戳脸啦', '脸颊软软的吧？', '嘻嘻，痒痒的'],
  cheekR: ['噗——别戳脸啦', '这边也要摸吗？', '呀！痒～'],
  mouth: ['别戳嘴啦！我还没唱歌呢', '呜……痒！', '你再戳我就唱歌给你听'],
  chin: ['咯咯咯……好痒～', '下巴不可以啦', '嘿嘿，你找到我的笑点了'],
  earL: ['耳机要被弄歪了', '耳朵…有点痒'],
  earR: ['耳机要被弄歪了', '呀！耳朵不行'],
  headBack: ['背后交给你啦', '在的呀～'],
  hair: ['头发要乱掉了啦', '轻一点嘛～', '刚梳好的头发哦'],
  tailL: ['头发要被拉直啦！', '这条是双马尾哦，轻一点', '呀——不要拽啦'],
  tailR: ['头发要被拉直啦！', '这条是双马尾哦，轻一点', '呀——不要拽啦'],
  neck: ['脖子很痒……', '别挠那里啦'],
  shoulderL: ['肩膀有点酸呢', '谢谢～'],
  shoulderR: ['肩膀有点酸呢', '谢谢～'],
  chest: ['喂～！', '这么近……'],
  belly: ['呀！好痒——', '肚子不行啦！'],
  waist: ['呀！好痒——', '腰很怕痒的'],
  hip: ['啊！', '不、不可以'],
  skirt: ['喂！不可以乱碰哦', '裙子会皱的啦', '这可是我自己做的哦'],
  thighL: ['腿…有点痒', '别乱摸啦'],
  thighR: ['腿…有点痒', '别乱摸啦'],
  kneeL: ['膝盖被你点到了', '诶？'],
  kneeR: ['膝盖被你点到了', '诶？'],
  sockL: ['袜子有好好穿哦', '嗯？'],
  sockR: ['袜子有好好穿哦', '嗯？'],
  ankleL: ['鞋子上有青绿色的边，好看吧', '诶？'],
  handL: ['握手！', '你好呀～'],
  handR: ['握手！', '你好呀～'],
  shoeL: ['鞋子会弄脏的啦', '诶？'],
  _default: ['在的呀～', '嗯？你叫我？', '要不要听我唱歌？', '再靠近一点也可以哦'],
};
const TALK_ZONES = new Set(['headTop', 'cheekL', 'cheekR', 'mouth', 'chin', 'earL', 'earR', 'tailL', 'tailR', 'hair', 'skirt', 'hip', 'chest', 'belly']);

function cursorFromHand(st) {
  const x = (0.5 - st.cx) * 1.12;
  const y = clamp(1.66 - (st.cy - 0.14) / 0.68 * 1.20, 0.10, 2.00);
  const z = lerp(0.42, 0.015, st.depth);
  cursor.set(x, y, z);
}
function zoneLine(name) {
  const arr = LINE[name] || LINE._default;
  const now = performance.now();
  const last = zoneCd[name] || 0;
  if (now - last < 900) return null;
  zoneCd[name] = now;
  return arr[Math.floor(Math.random() * arr.length)];
}

function doTouch(h) {
  const name = h.zone.name;
  rig.reaction(name, h.point, 1);
  char.nudgeHair(new THREE.Vector3(0, 0.2, 0.1), 5, null);
  particles.burst(name.startsWith('cheek') || name === 'headTop' ? 'heart' : 'spark', h.point, 5, { size: 0.045, radius: 0.03 });
  particles.spawn('ring', h.point, { size: 0.05, grow: 0.22, ttl: 0.5, v: new THREE.Vector3(0, 0.05, 0) });
  if (TALK_ZONES.has(name)) {
    const line = zoneLine(name);
    if (line) { ui.bubble(line, 2.2); voice.speak(line); ui.log('触摸 · ' + name + '：' + line); }
  } else {
    voice.speak('嗯？');
    ui.log('触摸 · ' + name);
  }
}

function updateInteraction(dt) {
  const st = hand.state;
  cursorFromHand(st);
  cursorDot.visible = st.present;
  cursorRing.visible = st.present;
  if (!st.present) { hover = null; hoverRing.material.opacity = 0; return; }

  cursorDot.position.copy(cursor);
  const conv = clamp(st.pinch01, 0, 1);
  const pulse = 1 + 0.5 * conv + 0.08 * Math.sin(performance.now() / 220);
  cursorDot.scale.setScalar(clamp(pulse, 0.8, 1.9));
  cursorDot.material.color.setRGB(lerp(0.65, 1, conv), lerp(1, 0.7, conv), lerp(0.95, 0.6, conv));
  cursorRing.position.copy(cursor);
  cursorRing.material.opacity = 0.35 + 0.5 * conv;
  cursorRing.scale.setScalar(0.13 + 0.16 * conv);

  // 命中测试
  raycaster.set(camera.position, cursor.clone().sub(camera.position).normalize());
  raycaster.far = 6;
  const hits = raycaster.intersectObjects(char.hitMeshes, false);
  const hit = hits.find((x) => x.distance > 0.12) || null;
  if (hit) {
    const zone = char.resolveZone(hit.point, hit.object);
    hover = { zone, point: hit.point.clone(), obj: hit.object };
    lastHover = hover; lastHoverT = performance.now();
    hoverRing.position.copy(hit.point);
    hoverRing.material.opacity = 0.35 + 0.25 * Math.sin(performance.now() / 180);
    hoverRing.scale.setScalar(0.09 + 0.02 * Math.sin(performance.now() / 210));
    rig.lookAtPoint(hit.point);
    ui.hoverZone = zone.name;
  } else {
    hover = null;
    hoverRing.material.opacity = 0;
    rig.lookAtPoint(cursor);
    ui.hoverZone = '';
  }

  // 指尖交汇＝触摸
  if (st.pinchEdge) {
    // 捏住瞬间若指尖刚好滑出身体，就沿用 0.7 秒内最后命中的部位，避免“按下去就摸空”
    const src = hover || (performance.now() - lastHoverT < 700 ? lastHover : null);
    if (src) { doTouch(src); latchZone = src.zone; latchPoint = src.point.clone(); }
  }
  if (!st.pinch) { latchZone = null; latchPoint = null; }

  // 交汇中＝抓住（锁定“捏住那一刻”的命中点，手指推进或轻微滑动都不会滑脱）
  const hold = st.pinch ? (hover || (latchZone ? { zone: latchZone, point: latchPoint, obj: null } : null)) : null;
  if (hold) {
    const z = hold.zone;
    if (z.coarse === 'tailL' || z.coarse === 'tailR') {
      const tl = z.tail || char.tails.find((x) => (x.side > 0 ? 'tailL' : 'tailR') === z.coarse);
      if (tl) {
        const idx = Math.round((z.detail || 0.5) * 11);
        const pt = tl.strand.p[idx];
        tl.strand.pullAt = idx;
        tl.strand.pull.copy(cursor.clone().sub(pt).multiplyScalar(-1.6)).add(new THREE.Vector3(0, 0.6, 0));
        if (!grab) { grab = { kind: 'tail', tl, idx }; grabStart = performance.now(); }
      }
    } else if (z.coarse === 'body' || z.coarse === 'skirt' || z.name === 'chest' || z.name === 'belly') {
      const dx = cursor.x - lastCursor.x;
      char.body.rotation.y += dx * 2.2;
      char.body.rotation.z = damp(char.body.rotation.z, clamp(-dx * 8, -0.3, 0.3), 6, dt);
      if (!grab) { grab = { kind: 'body' }; grabStart = performance.now(); }
      rig.holdBody = true;
    } else if (z.coarse === 'head' || z.coarse === 'hair') {
      const dx = cursor.x - lastCursor.x;
      const dy = cursor.y - lastCursor.y;
      char.head.rotation.y += dx * 0.9;
      char.head.rotation.x += dy * 0.6;
      if (!grab) { grab = { kind: 'head' }; grabStart = performance.now(); }
    } else {
      if (!grab) grab = { kind: 'press' };
    }
  } else if (!st.pinch && grab) {
    if (grab.kind === 'tail') {
      rig.giggle();
      voice.speak('呀——！头发');
      particles.burst('spark', cursor, 6, { size: 0.05, speed: 0.35 });
    } else if (grab.kind === 'head') {
      rig.patHead();
    } else if (grab.kind === 'body') {
      rig.setExpression('happy', 1.4);
    }
    rig.holdBody = false;
    grab = null;
  }
  if (!st.pinch) {
    char.body.rotation.z = damp(char.body.rotation.z, 0, 4, dt);
  }
  lastCursor.copy(cursor);

  // 手势：挥手 / 握拳
  waveCd -= dt; fistCd -= dt;
  if (st.wave && waveCd <= 0 && hand.camOn) {
    rig.wave(2.8);
    voice.speak('嗨～看到你啦！');
    ui.bubble('嗨～看到你啦！', 2.4);
    ui.log('你挥手 → 她也挥手');
    waveCd = 7;
    particles.burst('note', new THREE.Vector3(-0.25, 1.3, 0.1), 4, { size: 0.05, speed: 0.4 });
  }
  if (st.fist && fistCd <= 0 && hand.camOn) {
    rig.startle();
    voice.speak('诶？手上拿的是什么？');
    ui.log('你握拳 → 她被吓一跳');
    fistCd = 7;
  }

  // 闲聊
  chatterCd -= dt;
  if (chatterCd <= 0 && !voice.speaking) {
    chatterCd = rand(26, 48);
    const lines = ['要不要听我唱歌？', '今天也要开开心心的哦', '你的手抬久啦，累不累？', '我一直都在这里呀～', '再摸摸头嘛…'];
    const l = lines[Math.floor(Math.random() * lines.length)];
    rig.setExpression(Math.random() < 0.5 ? 'happy' : 'smile', 2.5);
    voice.speak(l);
    ui.bubble(l, 2.6);
  }
}

// ---------- 输入与 UI ----------
const hand = new HandInput({ canvas, video: document.getElementById('video'), log: (m) => ui?.log(m), toast: (m) => ui?.toast(m) });
let ui;
ui = setupUI({
  hand, rig, char, voice, mic, camera, views: VIEWS,
  app: {
    setView: applyView,
    reset: () => {
      applyView('front');
      rig.sing(false); rig.dance(false); rig.spin = 0; rig.turnStop();
      char.body.rotation.set(0, 0, 0);
      document.querySelectorAll('.grid .btn.on').forEach((b) => b.classList.remove('on'));
    },
  },
});
voice.onText = (t) => ui.bubble(t, Math.min(4, 1.2 + t.length * 0.12));

// 右键/拖动旋转，滚轮缩放
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || (hand.camOn && e.button === 0)) { dragging = true; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointerup', (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch {} });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.tYaw -= e.movementX * 0.005;
  cam.tPitch = clamp(cam.tPitch + e.movementY * 0.0035, -0.35, 0.85);
});
canvas.addEventListener('wheel', (e) => {
  cam.tDist = clamp(cam.tDist * (1 + Math.sign(e.deltaY) * 0.08), 0.6, 5.2);
}, { passive: true });
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); rig.blinkNow(2); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); rig.turnBy(Math.PI / 6); }
  if (e.key === 'ArrowRight') { e.preventDefault(); rig.turnBy(-Math.PI / 6); }
  if (e.key === '1') applyView('front');
  if (e.key === '2') applyView('side');
  if (e.key === '3') applyView('back');
  if (e.key === '4') applyView('face');
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// ---------- 主循环 ----------
let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = clamp((now - last) / 1000, 0.0005, 0.05);
  last = now;
  hand.update(dt);
  updateInteraction(dt);
  rig.update(dt, now / 1000);
  particles.update(dt);
  updateCamera(dt);
  ring.material.opacity = 0.28 + 0.1 * Math.sin(now / 900);
  ui.update(dt);
  renderer.render(scene, camera);
  frames++;
  if (frames === 3) {
    document.getElementById('loading').classList.add('done');
    window.__ready = true;
    ui.log('鼠标模式：移动鼠标＝指尖，按住左键＝两指交汇（捏住）');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__app = {
  THREE,
  char, rig, hand, camera, scene, renderer, particles, voice, mic, cam,
  setView: applyView,
  setCam(o) { Object.assign(cam, o); },
  get hover() { return hover; },
};
