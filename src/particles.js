import * as THREE from '../vendor/three/three.module.js';
import { particleTexture } from './textures.js';
import { rand } from './build.js';

export class Particles {
  constructor(scene, max = 160) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.mats = {};
    for (const kind of ['heart', 'note', 'spark', 'ring']) {
      this.mats[kind] = new THREE.SpriteMaterial({
        map: particleTexture(kind), transparent: true, depthWrite: false,
        blending: kind === 'spark' || kind === 'ring' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
    }
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(this.mats.heart);
      s.visible = false;
      s.frustumCulled = false;
      scene.add(s);
      this.pool.push(s);
    }
  }
  spawn(kind, pos, o = {}) {
    const s = this.pool.pop();
    if (!s) return null;
    s.material = this.mats[kind] || this.mats.spark;
    s.visible = true;
    s.position.copy(pos);
    if (o.offset) s.position.add(o.offset);
    s.scale.setScalar(o.size || 0.05);
    this.active.push({
      s, life: 0, ttl: o.ttl || 1.4,
      v: o.v || new THREE.Vector3(rand(-0.15, 0.15), rand(0.35, 0.7), rand(-0.1, 0.1)),
      spin: rand(-2, 2), size0: o.size || 0.05, size1: o.grow ?? (o.size ? o.size * 1.4 : 0.07),
      drift: o.drift || 0,
    });
    return s;
  }
  burst(kind, pos, n = 6, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = (o.radius || 0.05) * rand(0.5, 1.2);
      this.spawn(kind, pos, {
        ...o,
        offset: new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.8, rand(-0.03, 0.03)),
        v: new THREE.Vector3(Math.cos(a) * (o.speed || 0.25), Math.abs(Math.sin(a)) * (o.speed || 0.25) + 0.25, rand(-0.08, 0.08)),
        size: (o.size || 0.05) * rand(0.8, 1.25),
      });
    }
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        p.s.visible = false;
        p.s.material = this.mats.heart;
        this.pool.push(p.s);
        this.active.splice(i, 1);
        continue;
      }
      p.s.position.addScaledVector(p.v, dt);
      p.v.y -= 0.25 * dt;
      p.v.multiplyScalar(1 - 0.6 * dt);
      const s = THREE.MathUtils.lerp(p.size0, p.size1, k);
      p.s.scale.setScalar(s * (1 - k * 0.35));
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.pow(k, 1.6);
    }
  }
}
