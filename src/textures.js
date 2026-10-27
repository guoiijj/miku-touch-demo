import * as THREE from '../vendor/three/three.module.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, opt = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat[0], opt.repeat[1]); }
  t.needsUpdate = true;
  return t;
}

// 眼睛虹膜：青绿放射渐变 + 深色瞳 + 高光
export function irisTexture() {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  const R = s / 2, cx = R, cy = R;
  g.clearRect(0, 0, s, s);
  const outer = g.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
  outer.addColorStop(0, '#08363c');
  outer.addColorStop(0.40, '#1b8f92');
  outer.addColorStop(0.70, '#4fd6c4');
  outer.addColorStop(0.88, '#2c8b8e');
  outer.addColorStop(0.97, '#0d3339');
  outer.addColorStop(1, '#071f24');
  g.fillStyle = outer;
  g.beginPath(); g.arc(cx, cy, R * 0.995, 0, Math.PI * 2); g.fill();
  // 放射纹理
  g.globalAlpha = 0.13;
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    g.strokeStyle = i % 2 ? '#c9fff4' : '#0d4a50';
    g.lineWidth = s * 0.012;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28);
    g.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 瞳孔
  const pup = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.36);
  pup.addColorStop(0, '#04191d');
  pup.addColorStop(0.75, '#062a2f');
  pup.addColorStop(1, 'rgba(6,42,47,.75)');
  g.fillStyle = pup;
  g.beginPath(); g.arc(cx, cy, R * 0.42, 0, Math.PI * 2); g.fill();
  // 高光
  const hi = (x, y, r, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a})`);
    rg.addColorStop(0.6, `rgba(255,255,255,${a * 0.55})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  hi(cx - R * 0.30, cy - R * 0.34, R * 0.34, 0.98);
  hi(cx + R * 0.32, cy + R * 0.30, R * 0.22, 0.55);
  hi(cx + R * 0.16, cy - R * 0.56, R * 0.13, 0.7);
  return tex(c);
}

// 嘴：多种形状，画在同一张 256x160 画布上
export function mouthTexture(shape, t = 0) {
  const w = 256, h = 160, c = canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.5;
  const dark = '#5d1a24', inner = '#3a0d16', lip = '#b1505c';
  const stroke = (lw) => { g.lineWidth = lw; g.lineCap = 'round'; g.strokeStyle = dark; };
  const openMouth = (k) => {
    const wd = 46 + 10 * k, ht = 6 + 54 * k;
    const grad = g.createLinearGradient(0, cy - ht, 0, cy + ht);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.72, '#5c1421');
    grad.addColorStop(1, '#7d2231');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx - wd, cy - ht * 0.25);
    g.quadraticCurveTo(cx, cy - ht * 1.15, cx + wd, cy - ht * 0.25);
    g.quadraticCurveTo(cx, cy + ht * 1.25, cx - wd, cy - ht * 0.25);
    g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(255,255,255,.86)';
    g.beginPath(); g.ellipse(cx, cy - ht * 0.62, wd * 0.86, ht * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d84f68';
    g.beginPath(); g.ellipse(cx, cy + ht * 0.78, wd * 0.6, ht * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    stroke(6);
    g.beginPath();
    g.moveTo(cx - wd, cy - ht * 0.25);
    g.quadraticCurveTo(cx, cy - ht * 1.15, cx + wd, cy - ht * 0.25);
    g.stroke();
  };
  switch (shape) {
    case 'closed': {           // 微笑闭口
      stroke(7);
      g.beginPath();
      g.moveTo(cx - 34, cy - 6);
      g.quadraticCurveTo(cx, cy + 20, cx + 34, cy - 6);
      g.stroke();
      break;
    }
    case 'smirk': {
      stroke(7);
      g.beginPath();
      g.moveTo(cx - 30, cy + 4);
      g.quadraticCurveTo(cx + 2, cy + 14, cx + 32, cy - 12);
      g.stroke();
      break;
    }
    case 'o': {                // 惊讶
      g.fillStyle = inner;
      g.beginPath(); g.ellipse(cx, cy + 2, 17, 24, 0, 0, Math.PI * 2); g.fill();
      stroke(6);
      g.strokeStyle = lip;
      g.beginPath(); g.ellipse(cx, cy + 2, 17, 24, 0, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'grin': {             // 大笑
      const wd = 62, ht = 34;
      g.fillStyle = inner;
      g.beginPath();
      g.moveTo(cx - wd, cy - 12);
      g.quadraticCurveTo(cx, cy - 26, cx + wd, cy - 12);
      g.quadraticCurveTo(cx, cy + ht * 1.5, cx - wd, cy - 12);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.ellipse(cx, cy - 14, wd * 0.82, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d84f68';
      g.beginPath(); g.ellipse(cx, cy + 22, wd * 0.5, 13, 0, 0, Math.PI * 2); g.fill();
      stroke(6);
      g.beginPath();
      g.moveTo(cx - wd, cy - 12);
      g.quadraticCurveTo(cx, cy - 26, cx + wd, cy - 12);
      g.stroke();
      break;
    }
    case 'sad': {
      stroke(7);
      g.beginPath();
      g.moveTo(cx - 30, cy + 10);
      g.quadraticCurveTo(cx, cy - 12, cx + 30, cy + 10);
      g.stroke();
      break;
    }
    case 'open': {             // 说话中
      openMouth(0.35 + 0.65 * t);
      break;
    }
    case 'sing': {
      openMouth(0.25 + 0.55 * Math.abs(Math.sin(t * Math.PI * 3)));
      break;
    }
    default: {
      stroke(7);
      g.beginPath();
      g.moveTo(cx - 30, cy - 2);
      g.quadraticCurveTo(cx, cy + 12, cx + 30, cy - 2);
      g.stroke();
    }
  }
  return tex(c);
}

// 腮红
export function blushTexture() {
  const s = 128, c = canvas(s, s), g = c.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(255,116,150,.85)');
  rg.addColorStop(0.45, 'rgba(255,120,155,.45)');
  rg.addColorStop(1, 'rgba(255,120,155,0)');
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(s / 2, s / 2, s / 2, s / 2 * 0.72, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.5;
  g.strokeStyle = 'rgba(255,140,170,.6)';
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const y = s * (0.34 + i * 0.16);
    g.beginPath(); g.moveTo(s * 0.3, y); g.lineTo(s * 0.7, y); g.stroke();
  }
  return tex(c);
}

// 手臂上的 01
export function decalTexture(text = '01', color = '#e2453f') {
  const w = 128, h = 96, c = canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = 'bold 74px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return tex(c);
}

export function particleTexture(kind = 'heart') {
  const s = 128, c = canvas(s, s), g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  if (kind === 'heart') {
    g.fillStyle = '#ff6d92';
    g.beginPath();
    const r = s * 0.30;
    g.moveTo(cx, cy + r * 1.25);
    g.bezierCurveTo(cx - r * 2.0, cy - r * 0.35, cx - r * 0.72, cy - r * 1.5, cx, cy - r * 0.45);
    g.bezierCurveTo(cx + r * 0.72, cy - r * 1.5, cx + r * 2.0, cy - r * 0.35, cx, cy + r * 1.25);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(cx - r * 0.5, cy - r * 0.5, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2); g.fill();
  } else if (kind === 'note') {
    g.fillStyle = '#8ef0dd';
    g.beginPath(); g.ellipse(cx - 14, cy + 30, 21, 15, -0.35, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + 30, cy + 16, 21, 15, -0.35, 0, Math.PI * 2); g.fill();
    g.fillRect(cx + 8, cy - 30, 8, 52);
    g.fillRect(cx - 34, cy - 14, 8, 52);
    g.beginPath();
    g.moveTo(cx - 26, cy - 14); g.lineTo(cx + 16, cy - 30); g.lineTo(cx + 16, cy - 12); g.lineTo(cx - 26, cy + 4);
    g.closePath(); g.fill();
  } else if (kind === 'spark') {
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(180,255,240,.7)');
    rg.addColorStop(1, 'rgba(120,240,220,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, s / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath();
    g.moveTo(cx, 4); g.lineTo(cx + 7, cy - 7); g.lineTo(s - 4, cy); g.lineTo(cx + 7, cy + 7);
    g.lineTo(cx, s - 4); g.lineTo(cx - 7, cy + 7); g.lineTo(4, cy); g.lineTo(cx - 7, cy - 7);
    g.closePath(); g.fill();
  } else {                     // ring 触摸波纹
    g.strokeStyle = 'rgba(180,255,240,.95)';
    g.lineWidth = 7;
    g.beginPath(); g.arc(cx, cy, s * 0.38, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, s * 0.26, 0, Math.PI * 2); g.stroke();
  }
  return tex(c);
}

// 接触阴影
export function shadowTexture() {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(0,0,0,.55)');
  rg.addColorStop(0.45, 'rgba(0,0,0,.28)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  return tex(c);
}

// 布料/皮肤微噪点，避免死平
export function noiseTexture(rgb = [255, 255, 255], amt = 10, size = 128) {
  const c = canvas(size, size), g = c.getContext('2d');
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: [2, 2] });
}
