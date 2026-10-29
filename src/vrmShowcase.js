import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/controls/OrbitControls.js';
import {
  VRMLoaderPlugin, VRMUtils,
  VRMSpringBoneManager, VRMSpringBoneJoint,
  VRMSpringBoneCollider, VRMSpringBoneColliderShapeCapsule, VRMSpringBoneColliderShapeSphere,
} from '../vendor/three-vrm/three-vrm.module.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '../vendor/three-vrm-animation/three-vrm-animation.module.js';

const canvas = document.getElementById('c');
const loadEl = document.getElementById('load');
const pbar = document.getElementById('pbar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
window.__vrmCamera = camera;

const hemi = new THREE.HemisphereLight(0xffffff, 0x5d6f80, 0.95);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e8, 1.0);
key.position.set(1.6, 3.2, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 9;
key.shadow.camera.left = -1.2;
key.shadow.camera.right = 1.2;
key.shadow.camera.top = 2.4;
key.shadow.camera.bottom = -0.2;
key.shadow.bias = -0.0006;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fd7ff, 0.5);
rim.position.set(-2.2, 2.0, -2.6);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffe6f2, 0.28);
fill.position.set(-1.8, 1.2, 2.2);
scene.add(fill);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.ShadowMaterial({ color: 0x04080c, opacity: 0.42 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.45;
controls.maxDistance = 6;
controls.minPolarAngle = 0.6;
controls.maxPolarAngle = 2.1;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.update();

const state = { ready: false, vrm: null, mixer: null, actions: new Map(), current: null, clipMode: false, motion: 'idle', restPose: null };

window.__setView = (theta, phi, radius, y, still) => {
  if (still) controls.autoRotate = false;
  if (y != null) controls.target.y = y;
  const sp = Math.sin(phi);
  camera.position.set(
    controls.target.x + radius * sp * Math.sin(theta),
    controls.target.y + radius * Math.cos(phi),
    controls.target.z + radius * sp * Math.cos(theta)
  );
  controls.update();
};


function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

const MOTIONS = [
  { id: 'idle', label: '待机' },
  { id: 'greet', label: '打招呼', file: 'greeting.vrma', once: true },
  { id: 'wave', label: '挥手', file: 'waving.vrma', once: true },
  { id: 'clap', label: '拍手', file: 'clap.vrma', once: true , trim: [0.9, 3.15] },
  { id: 'dance', label: '舞步', file: 'dance-1.vrma' },
  { id: 'gangnam', label: '骑马舞', file: 'dance-gangnam.vrma' },
];

const motionButtons = Array.from(document.querySelectorAll('[data-motion]'));
motionButtons.forEach((b) => b.addEventListener('click', () => playMotion(b.dataset.motion)));
function markMotion(id) {
  motionButtons.forEach((b) => b.classList.toggle('on', b.dataset.motion === id));
}

function playMotion(id) {
  if (!state.ready) return;
  const def = MOTIONS.find((m) => m.id === id);
  if (!def) return;
  markMotion(id);
  if (id === 'idle' || !state.actions.has(id)) {
    if (state.mixer) state.mixer.stopAllAction();
    if (state.restPose) {
      for (const [bone, rest] of state.restPose) {
        bone.position.copy(rest.p);
        bone.quaternion.copy(rest.q);
        bone.scale.copy(rest.s);
      }
    }
    state.current = null;
    state.clipMode = false;
    state.motion = 'idle';
    return;
  }
  const action = state.actions.get(id);
  if (state.current === action) action.stop();
  action.reset();
  action.setLoop(def.once ? THREE.LoopOnce : THREE.LoopRepeat, def.once ? 1 : Infinity);
  action.clampWhenFinished = !!def.once;
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  action.fadeIn(0.3).play();
  if (state.current && state.current !== action) state.current.fadeOut(0.3);
  state.current = action;
  state.clipMode = true;
  state.motion = id;
}
window.__playMotion = playMotion;

const testMotion = new URLSearchParams(location.search).get('test') === '1';

function setupSpringBones(vrm) {
  const scene = vrm.scene;
  const humanoid = vrm.humanoid;
  const raw = (name) => humanoid.getRawBoneNode(name);
  const groups = { hair: [], skirt: [], tie: [] };

  function collider(group, boneName, from, to, radius) {
    const bone = raw(boneName);
    if (!bone) return;
    const fromLocal = bone.worldToLocal(new THREE.Vector3(from[0], from[1], from[2]));
    const shape = to
      ? new VRMSpringBoneColliderShapeCapsule({
          offset: fromLocal,
          tail: bone.worldToLocal(new THREE.Vector3(to[0], to[1], to[2])),
          radius,
        })
      : new VRMSpringBoneColliderShapeSphere({ offset: fromLocal, radius });
    const item = new VRMSpringBoneCollider(shape);
    item.name = 'spring-collider-' + group;
    bone.add(item);
    groups[group].push(item);
  }

  collider('hair', 'neck', [0, 1.33, 0.01], null, 0.055);
  collider('hair', 'head', [0, 1.42, -0.01], null, 0.10);
  collider('hair', 'spine', [0, 1.27, -0.01], [0, 1.03, -0.01], 0.105);
  collider('hair', 'spine', [0, 1.21, -0.075], null, 0.09);
  collider('hair', 'leftShoulder', [0.08, 1.27, 0], null, 0.06);
  collider('hair', 'rightShoulder', [-0.08, 1.27, 0], null, 0.06);
  collider('hair', 'leftUpperArm', [0.088, 1.274, 0.01], [0.132, 1.072, 0.015], 0.05);
  collider('hair', 'rightUpperArm', [-0.088, 1.274, 0.01], [-0.132, 1.072, 0.015], 0.05);
  collider('hair', 'leftLowerArm', [0.132, 1.072, 0.015], [0.175, 0.874, 0.051], 0.045);
  collider('hair', 'rightLowerArm', [-0.132, 1.072, 0.015], [-0.175, 0.874, 0.051], 0.045);
  collider('hair', 'hips', [0, 0.92, 0], null, 0.10);
  collider('hair', 'leftUpperLeg', [0.072, 0.916, 0.031], [0.074, 0.515, 0.001], 0.065);
  collider('hair', 'rightUpperLeg', [-0.072, 0.916, 0.031], [-0.074, 0.515, 0.001], 0.065);
  collider('hair', 'leftLowerLeg', [0.074, 0.515, 0.001], [0.081, 0.106, -0.049], 0.05);
  collider('hair', 'rightLowerLeg', [-0.074, 0.515, 0.001], [-0.081, 0.106, -0.049], 0.05);

  collider('skirt', 'leftUpperLeg', [0.072, 0.90, 0.02], [0.074, 0.53, 0.005], 0.078);
  collider('skirt', 'hips', [0, 0.98, 0.02], null, 0.12);
  collider('skirt', 'rightUpperLeg', [-0.072, 0.90, 0.02], [-0.074, 0.53, 0.005], 0.078);
  collider('skirt', 'leftLowerLeg', [0.074, 0.53, 0.005], [0.081, 0.30, -0.03], 0.062);
  collider('skirt', 'rightLowerLeg', [-0.074, 0.53, 0.005], [-0.081, 0.30, -0.03], 0.062);
  collider('skirt', 'leftLowerArm', [0.132, 1.072, 0.015], [0.175, 0.874, 0.051], 0.05);
  collider('skirt', 'rightLowerArm', [-0.132, 1.072, 0.015], [-0.175, 0.874, 0.051], 0.05);
  collider('skirt', 'leftHand', [0.175, 0.874, 0.051], null, 0.05);
  collider('skirt', 'rightHand', [-0.175, 0.874, 0.051], null, 0.05);

  collider('tie', 'spine', [0, 1.13, 0.055], null, 0.05);
  collider('tie', 'spine', [0, 1.02, 0.045], null, 0.045);
  collider('tie', 'upperChest', [0, 1.22, 0.06], null, 0.05);

  const manager = new VRMSpringBoneManager();

  function chain(names, settings, group) {
    for (let i = 0; i < names.length - 1; i++) {
      const bone = scene.getObjectByName(names[i]);
      const child = scene.getObjectByName(names[i + 1]);
      if (!bone || !child) continue;
      manager.addJoint(new VRMSpringBoneJoint(bone, child, settings, [{ colliders: groups[group] }]));
    }
  }

  const gravity = new THREE.Vector3(0, -1, 0);
  const fwDigit = (n) => String.fromCharCode(0xff10 + n);
  const numbered = (prefix, count) => Array.from({ length: count }, (_, k) => prefix + fwDigit(k + 1));
  const RIGHT_HAIR = String.fromCharCode(0x53f3, 0x9aea);
  const LEFT_HAIR = String.fromCharCode(0x5de6, 0x9aea);
  const TIE = String.fromCharCode(0xff88, 0xff78, 0xff80, 0xff72);
  const SKIRT = String.fromCharCode(0x30b9, 0x30ab, 0x30fc, 0x30c8) + '_';

  const hairSettings = { hitRadius: 0.025, stiffness: 1.1, dragForce: 0.5, gravityPower: 0.2, gravityDir: gravity };
  chain(numbered(RIGHT_HAIR, 9), hairSettings, 'hair');
  chain(numbered(LEFT_HAIR, 9), hairSettings, 'hair');

  const skirtSettings = { hitRadius: 0.034, stiffness: 1.4, dragForce: 0.5, gravityPower: 0.12, gravityDir: gravity };
  for (let j = 0; j < 16; j++) {
    const names = [];
    for (let i = 0; i < 5; i++) names.push(SKIRT + i + '_' + j);
    chain(names, skirtSettings, 'skirt');
  }

  chain(numbered(TIE, 3), { hitRadius: 0.02, stiffness: 1.6, dragForce: 0.5, gravityPower: 0.12, gravityDir: gravity }, 'tie');

  vrm.springBoneManager = manager;
  manager.setInitState();
  return { joints: manager.joints.size, colliders: groups.hair.length + groups.skirt.length + groups.tie.length };
}

function trimClip(clip, start, end) {
  const length = Math.max(0.05, end - start);
  const tracks = [];
  for (const track of clip.tracks) {
    const stride = track.times.length ? track.values.length / track.times.length : 0;
    if (!stride) continue;
    const times = [];
    const values = [];
    for (let i = 0; i < track.times.length; i++) {
      const time = track.times[i] - start;
      if (time < -1e-4 || time > length + 1e-4) continue;
      times.push(Math.min(length, Math.max(0, time)));
      for (let k = 0; k < stride; k++) values.push(track.values[i * stride + k]);
    }
    if (times.length) tracks.push(new track.constructor(track.name, times, values));
  }
  const out = new THREE.AnimationClip(clip.name + '_trim', length, tracks);
  out.resetDuration();
  return out;
}

const defaultModelUrl = './models/miku_vrm.vrm';
const url = new URLSearchParams(location.search).get('model') || defaultModelUrl;

async function loadModel(modelUrl) {
  if (modelUrl !== defaultModelUrl) return loader.loadAsync(modelUrl);

  try {
    const manifestResponse = await fetch('./models/miku_vrm.parts.json', { cache: 'force-cache' });
    if (!manifestResponse.ok) throw new Error('model parts manifest not found');
    const manifest = await manifestResponse.json();
    const chunks = [];
    let loaded = 0;
    for (const name of manifest.parts) {
      const response = await fetch('./models/miku_vrm.parts/' + name, { cache: 'force-cache' });
      if (!response.ok) throw new Error('model part failed: ' + name);
      const chunk = new Uint8Array(await response.arrayBuffer());
      chunks.push(chunk);
      loaded += chunk.byteLength;
      if (manifest.totalBytes) pbar.style.width = Math.round((loaded / manifest.totalBytes) * 100) + '%';
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return await loader.parseAsync(bytes.buffer, './models/');
  } catch (error) {
    console.warn('model parts unavailable; loading the complete VRM instead', error);
    return await loader.loadAsync(modelUrl, (ev) => {
      if (ev.total) pbar.style.width = Math.round((ev.loaded / ev.total) * 100) + '%';
    });
  }
}

loadModel(url).then((gltf) => {
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('not a VRM file');

  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.combineMorphs(vrm);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  vrm.scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  window.__vrmBox = box;
  window.__vrmControls = controls;
  controls.target.set(center.x, box.min.y + size.y * 0.50, center.z);
  window.__setView(0.32, 1.44, size.y * 2.30, null, true);

  scene.add(vrm.scene);
  scene.updateMatrixWorld(true);
  const springInfo = setupSpringBones(vrm);
  state.vrm = vrm;
  state.restPose = new Map();
  for (const name of Object.keys(vrm.humanoid.humanBones || {})) {
    const bone = vrm.humanoid.getNormalizedBoneNode(name);
    if (bone) state.restPose.set(bone, { p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() });
  }
  state.mixer = new THREE.AnimationMixer(vrm.scene);
  state.mixer.addEventListener('finished', (e) => { if (e.action === state.current) playMotion('idle'); });
  state.ready = true;
  window.__vrmReady = true;
  window.__vrmInfo = {
    height: +size.y.toFixed(3),
    meta: vrm.meta ? { name: vrm.meta.name, metaVersion: vrm.meta.metaVersion } : null,
    bones: vrm.humanoid ? vrm.humanoid.humanBones ? Object.keys(vrm.humanoid.humanBones).length : 0 : 0,
    expressions: vrm.expressionManager ? Object.keys(vrm.expressionManager.expressionMap).length : 0,
    spring: springInfo,
  };
  loadEl.classList.add('gone');

  Promise.all(MOTIONS.filter((m) => m.file).map(async (def) => {
    const btn = motionButtons.find((b) => b.dataset.motion === def.id);
    try {
      const clipGltf = await loader.loadAsync('./models/vrma/' + def.file);
      const animation = clipGltf.userData.vrmAnimations && clipGltf.userData.vrmAnimations[0];
      if (!animation) throw new Error('no VRMA data');
      state.animations = state.animations || new Map();
      state.animations.set(def.id, animation);
      const hipsRestY = vrm.humanoid.normalizedRestPose.hips.position[1];
      animation.restHipsPosition.y = hipsRestY;
      let clip = createVRMAnimationClip(animation, vrm);
      if (def.trim) clip = trimClip(clip, def.trim[0], def.trim[1]);
      const hipsName = vrm.humanoid.getNormalizedBoneNode('hips').name;
      const hipsTrack = clip.tracks.find((t) => t.name === hipsName + '.position');
      if (hipsTrack) {
        const ox = hipsTrack.values[0], oy = hipsTrack.values[1], oz = hipsTrack.values[2];
        for (let i = 0; i < hipsTrack.values.length; i += 3) {
          hipsTrack.values[i] -= ox;
          const dy = Math.max(-0.16, Math.min(0.16, hipsTrack.values[i + 1] - oy));
          hipsTrack.values[i + 1] = hipsRestY + dy;
          hipsTrack.values[i + 2] -= oz;
        }
      }
      const action = state.mixer.clipAction(clip);
      action.setLoop(def.once ? THREE.LoopOnce : THREE.LoopRepeat, def.once ? 1 : Infinity);
      action.clampWhenFinished = !!def.once;
      state.actions.set(def.id, action);
      if (btn) { btn.disabled = false; btn.classList.add('ready'); }
    } catch (err) {
      console.warn('motion failed', def.id, err);
      if (btn) { btn.disabled = true; btn.textContent = def.label + '（不可用）'; }
    }
  })).then(() => {
    window.__vrmMotionsReady = true;
    window.__vrmMotions = Array.from(state.actions.keys());
  });

  tick();
}).catch((err) => {
  console.error(err);
  loadEl.textContent = '模型载入失败：' + (err && err.message ? err.message : err);
});

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const vrm = state.vrm;
  if (vrm) {
    if (state.mixer) state.mixer.update(dt);
    const h = vrm.humanoid;
    if (h && !state.clipMode) {
      const chest = h.getNormalizedBoneNode('upperChest') || h.getNormalizedBoneNode('chest');
      const headBone = h.getNormalizedBoneNode('head');
      const amp = testMotion ? 7 : 1;
      const hips = h.getNormalizedBoneNode('hips');
      if (testMotion && hips) hips.rotation.y = Math.sin(t * 1.15) * 0.14;
      if (chest) {
        chest.rotation.z = Math.sin(t * 1.05) * 0.012 * amp;
        chest.rotation.x = Math.sin(t * 1.45) * 0.010 * amp;
        chest.rotation.y = testMotion ? -Math.sin(t * 1.15) * 0.05 : 0;
      }
      if (headBone) {
        headBone.rotation.y = Math.sin(t * 0.62) * 0.10 * (testMotion ? 4.2 : 1);
        headBone.rotation.z = Math.sin(t * 0.93 + 0.7) * 0.022 * amp;
      }
      const lua = h.getNormalizedBoneNode('leftUpperArm');
      const rua = h.getNormalizedBoneNode('rightUpperArm');
      const lla = h.getNormalizedBoneNode('leftLowerArm');
      const rla = h.getNormalizedBoneNode('rightLowerArm');
      if (lua) { lua.rotation.z = 1.35 + Math.sin(t * 0.85) * 0.02; lua.rotation.x = 0.02; }
      if (rua) { rua.rotation.z = -1.35 - Math.sin(t * 0.85) * 0.02; rua.rotation.x = 0.02; }
      if (lla) { lla.rotation.y = -0.12; }
      if (rla) { rla.rotation.y = 0.12; }
    }
    vrm.update(dt);
  }

  controls.update();
  renderer.render(scene, camera);
}

window.__vrmState = state;


