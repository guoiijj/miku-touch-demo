import * as THREE from '../vendor/three/three.module.js';
import { noiseTexture } from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

export function buildMaterials() {
  const M = {};
  M.skin = phys({ color: 0xf7d5b9, roughness: 0.62, metalness: 0, sheen: 0.35, sheenColor: new THREE.Color(0xffd9c8), clearcoat: 0.06, clearcoatRoughness: 0.7 });
  M.skinDeep = std({ color: 0xeec3ab, roughness: 0.68 });
  M.hair = phys({
    color: 0x2fb4a2, roughness: 0.40, metalness: 0.02, sheen: 0.8,
    sheenColor: new THREE.Color(0xa8fff0), sheenRoughness: 0.35, clearcoat: 0.15, clearcoatRoughness: 0.35,
  });
  M.hairDark = phys({ color: 0x17807c, roughness: 0.45, sheen: 0.7, sheenColor: new THREE.Color(0x74e2d0), clearcoat: 0.12 });
  M.hairLight = phys({ color: 0x4ddcc6, roughness: 0.34, sheen: 0.9, sheenColor: new THREE.Color(0xd8fff8) });
  M.tieRed = std({ color: 0xd0333f, roughness: 0.45 });
  M.clipGold = std({ color: 0xbfa63f, roughness: 0.35, metalness: 0.5 });

  M.cloth = phys({ color: 0xdde7ee, roughness: 0.48, metalness: 0.02, sheen: 0.7, sheenColor: new THREE.Color(0xdff2ff), clearcoat: 0.12, clearcoatRoughness: 0.4 });
  M.hairSide = phys({ color: 0x2fb4a2, roughness: 0.40, metalness: 0.02, sheen: 0.8, sheenColor: new THREE.Color(0xa8fff0), sheenRoughness: 0.35, clearcoat: 0.15, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
  M.hairSideDark = phys({ color: 0x17807c, roughness: 0.45, sheen: 0.7, sheenColor: new THREE.Color(0x74e2d0), clearcoat: 0.12, side: THREE.DoubleSide });
  M.clothInner = std({ color: 0xc7d1d3, roughness: 0.7 });
  M.vestTrim = std({ color: 0x9fb3b6, roughness: 0.4, metalness: 0.3 });
  M.tie = phys({ color: 0x2fbfa9, roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color(0xc8fff4), clearcoat: 0.2 });
  M.tieDark = std({ color: 0x1e8d81, roughness: 0.45 });
  M.black = phys({ color: 0x14171c, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color(0x7f9fb0) });
  M.blackSoft = std({ color: 0x1b2028, roughness: 0.55 });
  M.skirt = phys({ color: 0x15181d, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: new THREE.Color(0x6f93a3) });
  M.tealTrim = phys({ color: 0x33c8b4, roughness: 0.32, clearcoat: 0.4, sheen: 0.5, sheenColor: new THREE.Color(0xc4fff2) });
  M.metalDark = std({ color: 0x2a2f36, roughness: 0.3, metalness: 0.7 });
  M.headphone = phys({ color: 0x191c21, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color(0x9db6c4) });
  M.headphoneRed = phys({ color: 0xcf2f3c, roughness: 0.28, clearcoat: 0.45 });
  M.eyeWhite = phys({ color: 0xfdf6f2, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0xffffff) });
  M.lash = std({ color: 0x2b1f26, roughness: 0.5 });
  M.brow = std({ color: 0x1f6b68, roughness: 0.6 });
  M.blush = new THREE.MeshBasicMaterial({ map: null, transparent: true, opacity: 0, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide });
  M.mouth = new THREE.MeshBasicMaterial({ map: null, transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide });
  M.iris = new THREE.MeshBasicMaterial({ map: null, transparent: true, depthWrite: false });
  M.clothMap = noiseTexture([228, 233, 234], 10, 128);
  return M;
}
