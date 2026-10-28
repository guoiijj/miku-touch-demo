import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { buildModelCharacter } from './modelCharacter.js';
import { Rig } from './rig.js';
import { Wardrobe, OUTFITS } from './wardrobe.js';
import { parseIntent, intentReply, suggestionSet } from './intent.js';
import { clamp, damp } from './build.js';

const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xded9cf, 5.5, 12);

const camera = new THREE.PerspectiveCamera(31, innerWidth / innerHeight, 0.05, 40);
const cam = {
  yaw: 0.17, pitch: 0.018, dist: 4.72, targetY: 0.62,
  tYaw: 0.17, tPitch: 0.018, tDist: 4.72, tTargetY: 0.62,
};
const target = new THREE.Vector3(0, 0.91, 0);
function applyCamera(dt = 0.016, instant = false) {
  if (instant) {
    cam.yaw = cam.tYaw; cam.pitch = cam.tPitch; cam.dist = cam.tDist; cam.targetY = cam.tTargetY;
  } else {
    cam.yaw = damp(cam.yaw, cam.tYaw, 7, dt);
    cam.pitch = damp(cam.pitch, cam.tPitch, 7, dt);
    cam.dist = damp(cam.dist, cam.tDist, 7, dt);
    cam.targetY = damp(cam.targetY, cam.tTargetY, 7, dt);
  }
  target.set(0, cam.targetY, 0);
  const dir = new THREE.Vector3(
    Math.sin(cam.yaw) * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
    Math.cos(cam.yaw) * Math.cos(cam.pitch),
  );
  camera.position.copy(target).addScaledVector(dir, cam.dist);
  camera.lookAt(target);
}
applyCamera(0, true);

function setupEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.background = new THREE.Color(0xaaa79f);
  const panel = new THREE.MeshBasicMaterial({ color: 0xfff7eb });
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), panel);
  p1.position.set(2.3, 2.3, 1.2); p1.lookAt(0, 0.8, 0); es.add(p1);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xcbd7d8 }));
  p2.position.set(-2.2, 1.3, 1.8); p2.lookAt(0, 1.0, 0); es.add(p2);
  const p3 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: 0xf4e3c5 }));
  p3.position.set(0.2, 2.0, -2.2); p3.lookAt(0, 1.0, 0); es.add(p3);
  const rt = pmrem.fromScene(es, 0.035);
  pmrem.dispose();
  return rt.texture;
}
scene.environment = setupEnvironment();

const hemi = new THREE.HemisphereLight(0xfff8ec, 0x59615f, 0.72);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0dc, 2.65);
key.position.set(3.2, 4.4, 3.0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 9;
key.shadow.camera.left = -1.6;
key.shadow.camera.right = 1.6;
key.shadow.camera.top = 2.6;
key.shadow.camera.bottom = -0.2;
key.shadow.bias = -0.00065;
key.shadow.normalBias = 0.012;
scene.add(key);
const fill = new THREE.DirectionalLight(0xcfdde1, 0.95);
fill.position.set(-3.0, 2.1, 2.1);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xeef6ec, 1.55);
rim.position.set(-1.6, 2.6, -3.0);
scene.add(rim);
const rimWarm = new THREE.PointLight(0xffd9b4, 6.0, 5.0, 2.0);
rimWarm.position.set(1.8, 1.8, -1.2);
scene.add(rimWarm);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5.2, 96),
  new THREE.MeshStandardMaterial({ color: 0xd3cec3, roughness: 0.83, metalness: 0.02 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.86, 0.89, 0.018, 96),
  new THREE.MeshStandardMaterial({ color: 0xe1ddd3, roughness: 0.72, metalness: 0.01 }),
);
pedestal.position.y = 0.002;
pedestal.receiveShadow = true;
scene.add(pedestal);

const edge = new THREE.Mesh(
  new THREE.RingGeometry(0.855, 0.858, 96),
  new THREE.MeshBasicMaterial({ color: 0x5b5f59, transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.0125;
scene.add(edge);

function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(256, 256, 34, 256, 256, 250);
  rg.addColorStop(0, 'rgba(24,26,24,.36)');
  rg.addColorStop(0.44, 'rgba(24,26,24,.14)');
  rg.addColorStop(1, 'rgba(24,26,24,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1.55, 1.05),
  new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 }),
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.008;
scene.add(contact);

const cameraRig = new THREE.Group();
scene.add(cameraRig);

let char = null;
let rig = null;
let wardrobe = null;
let activeMotion = 'idle';
let toastTimer = 0;

function setLoading(text) {
  const el = document.getElementById('loadingText');
  if (el) el.textContent = text;
}

async function loadCharacter() {
  const loader = new GLTFLoader();
  const url = 'models/miku_rig.glb';
  setLoading('正在读取模型与贴图…');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  setLoading('正在整理骨骼与动作…');
  const gltf = await loader.parseAsync(buf, 'models/');
  char = buildModelCharacter({ renderer, scene, gltf });
  scene.add(char.root);
  rig = new Rig(char);
  await new Promise((resolve) => char.whenReady(resolve));
  setLoading('正在量体，缝制衣层…');
  await new Promise((r) => requestAnimationFrame(r));
  wardrobe = new Wardrobe({ char, scene });
  document.getElementById('modelStatus').textContent = 'FIT / 33 BONES · 6 LOOKS';
  document.getElementById('fitTag').textContent = 'LIVE FIT';
  buildLookbook();
  buildSuggestions();
  updateLookUI(wardrobe.apply('formula'));
  rig.gesture('pose', 2.8);
  setTimeout(() => document.getElementById('loading').classList.add('done'), 320);
}

function buildLookbook() {
  const list = document.getElementById('lookList');
  list.innerHTML = '';
  for (const look of Object.values(OUTFITS)) {
    const b = document.createElement('button');
    b.className = 'look-card';
    b.dataset.look = look.id;
    b.innerHTML = `
      <span class="look-index">${look.index}</span>
      <span><b class="look-title">${look.name}</b><small class="look-sub">${look.en.split('/')[0].trim()}</small></span>
      <span class="look-dots">${['primary', 'secondary', 'accent'].map((role) => `<i style="background:${look.palette[role]}"></i>`).join('')}</span>`;
    b.onclick = () => activateLook(look.id);
    list.appendChild(b);
  }
}

function buildSuggestions() {
  const box = document.getElementById('suggestions');
  box.innerHTML = '';
  for (const text of suggestionSet()) {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => {
      document.getElementById('promptInput').value = text;
      submitPrompt();
    };
    box.appendChild(b);
  }
}

function updateLookUI(state) {
  const look = state || wardrobe.state;
  if (!look) return;
  document.getElementById('lookCounter').textContent = `${look.index} / 06`;
  document.getElementById('lookEn').textContent = look.en;
  document.getElementById('lookName').textContent = look.name;
  document.getElementById('lookNote').textContent = look.note;
  const sw = document.getElementById('swatches');
  sw.innerHTML = ['primary', 'secondary', 'accent', 'mid']
    .map((k) => `<span title="${k}" style="background:${look.palette[k]}"></span>`).join('');
  document.querySelectorAll('.look-card').forEach((b) => b.classList.toggle('active', b.dataset.look === look.id));
}

function flashStage() {
  let c = document.querySelector('.curtain');
  if (!c) { c = document.createElement('div'); c.className = 'curtain'; stage.appendChild(c); }
  c.classList.remove('flash');
  void c.offsetWidth;
  c.classList.add('flash');
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function activateLook(id, overrides = {}, opts = {}) {
  const state = wardrobe.apply(id, overrides);
  updateLookUI(state);
  flashStage();
  if (!opts.silent) toast(`${state.index} / ${state.name}`);
  if (!opts.keepMotion) rig.gesture('pose', 2.25);
  setMotionLabel('定格展示');
  activeMotion = 'pose';
  document.querySelectorAll('.motion').forEach((b) => b.classList.toggle('active', b.dataset.motion === 'pose'));
  return state;
}

function resetPose() {
  rig.waveT = 0;
  rig.gestureT = 0;
  rig.danceOn = false;
  rig.sing(false);
  rig.turnStop();
  rig.holdBody = false;
  rig.setExpression('smile', 2.0);
  char.onAction('dance', false);
}

function setMotion(name) {
  if (name === 'dance' && rig.danceOn && activeMotion === 'dance') {
    rig.dance(false);
    activeMotion = 'idle';
    setMotionLabel('自然待机');
  } else {
    resetPose();
    activeMotion = name;
    if (name === 'idle') {
      setMotionLabel('自然待机');
    } else if (name === 'wave') {
      rig.wave(3.2);
      setMotionLabel('挥手');
    } else if (name === 'turn') {
      rig.turnBy(Math.PI);
      setMotionLabel('转身');
    } else if (name === 'spin') {
      rig.spinOnce();
      setMotionLabel('转一圈');
    } else if (name === 'pose') {
      rig.gesture('pose', 4.4);
      setMotionLabel('定格');
    } else if (name === 'stretch') {
      rig.gesture('stretch', 4.6);
      setMotionLabel('伸展');
    } else if (name === 'dance') {
      rig.dance(true);
      setMotionLabel('舞步');
    }
  }
  document.querySelectorAll('.motion').forEach((b) => b.classList.toggle('active', b.dataset.motion === activeMotion));
}

function setMotionLabel(text) {
  document.getElementById('motionState').textContent = text;
}

function submitPrompt() {
  const input = document.getElementById('promptInput');
  const text = input.value.trim();
  if (!text) return;
  if (!wardrobe) { toast('衣橱还在准备中'); return; }
  const intent = parseIntent(text, wardrobe.current.id);
  if (intent.hasLookSignal) {
    const overrides = { palette: intent.palette || undefined, layers: intent.layers, removeLayers: intent.removeLayers };
    activateLook(intent.outfitId, overrides, { silent: true });
  }
  if (intent.action) setMotion(intent.action);
  else if (intent.hasLookSignal) {
    // Keep a short pose so the new silhouette reads before returning to idle.
    setMotion('pose');
  }
  const reply = document.getElementById('reply');
  if (!intent.hasLookSignal && !intent.action) {
    reply.textContent = '我听到颜色或衣型才会动手。可以试试“换成粉色的樱花和装”。';
  } else {
    reply.textContent = intentReply(intent, wardrobe);
  }
  input.value = '';
}

function setupUI() {
  document.querySelectorAll('.motion').forEach((button) => {
    button.onclick = () => setMotion(button.dataset.motion);
  });
  document.getElementById('promptSend').onclick = submitPrompt;
  document.getElementById('promptInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) submitPrompt();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const map = { '1': 'idle', '2': 'wave', '3': 'turn', '4': 'pose', '5': 'stretch', '6': 'dance' };
    if (map[e.key]) setMotion(map[e.key]);
    if (e.key === 'ArrowRight') setMotion('turn');
  });
}

// Pointer orbit. UI elements stay above the canvas and are unaffected.
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw: cam.tYaw, pitch: cam.tPitch };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.tYaw = drag.yaw - (e.clientX - drag.x) * 0.0062;
  cam.tPitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.004, -0.22, 0.42);
});
canvas.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = 'grab'; });
canvas.addEventListener('pointercancel', () => { drag = null; canvas.style.cursor = 'grab'; });
canvas.addEventListener('wheel', (e) => {
  cam.tDist = clamp(cam.tDist * (1 + Math.sign(e.deltaY) * 0.065), 1.55, 5.6);
}, { passive: true });
canvas.addEventListener('dblclick', () => {
  cam.tYaw = 0.17; cam.tPitch = 0.018; cam.tDist = 4.72; cam.tTargetY = 0.62;
});
canvas.style.cursor = 'grab';

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

const clock = new THREE.Clock();
let frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (rig) rig.update(dt, time);
  if (wardrobe) wardrobe.update(dt, time);
  applyCamera(dt);
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__app = {
  THREE, scene, camera, renderer, cam,
  get char() { return char; },
  get rig() { return rig; },
  get wardrobe() { return wardrobe; },
  applyLook: activateLook,
  setMotion,
  prompt: (text) => { document.getElementById('promptInput').value = text; submitPrompt(); },
  setCamera: (opts) => { Object.assign(cam, opts); applyCamera(0, true); },
  get frames() { return frames; },
};

setupUI();
loadCharacter().catch((err) => {
  console.error(err);
  setLoading('模型载入失败：' + (err && err.message ? err.message : err));
  document.getElementById('modelStatus').textContent = '载入失败';
});
