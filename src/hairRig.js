// ================================================================
//  头发层
//  Tripo 的自动绑定把初音的长马尾误绑到了手臂 / 腿上 —— 挥手、跳舞时
//  头发会被扯成放射状的尖刺（畸形）。这里按"贴图颜色 + 位置"认出头发顶点，
//  把它们重新绑到挂在头骨下面的发骨链上，并用"跟随滞后"来驱动：
//  头发会自然地甩、滞后、回摆，而不是硬邦邦地跟着头顶走。
// ================================================================
import * as THREE from "../vendor/three/three.module.js";

export const HAIR_CFG = {
  splitX: 0.12,     // 左右分界：|x| 大于它算侧边长发
  bandY: 1.33,      // 侧边这个高度以上：非青色也算头发（发绳、耳机、耳廓）
  capY: 1.35,       // 中轴只有青色算头发（挡掉领带、裙边、鞋）
  rootY: 1.46,      // 发骨链根部高度（发绳位置）
  segs: 4,          // 每侧几段发骨
  maxLag: 0.46,     // 发链相对头部的最大滞后角（弧度）
  maxSwing: 0.34,   // 相邻两段之间的最大夹角（弧度）
  voteRatio: 0.55,  // 一整片贴片里超过这个比例的点像头发，就整片算头发
};

const _qh = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _ax = new THREE.Vector3();

function isTeal(r, g, b) { return g > r + 18 && b > r + 14 && g > 70; }

// 把贴图颜色采到每个顶点上（判断头发靠的就是这个）
export function sampleVertexColor(geom, mat) {
  const n = geom.attributes.position.count;
  const col = new Uint8Array(n * 3);
  const img = mat && mat.map && mat.map.image;
  const uv = geom.attributes.uv;
  if (!img || !uv) return col;
  let data, W, H;
  try {
    const cv = document.createElement("canvas");
    W = cv.width = img.width;
    H = cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    data = ctx.getImageData(0, 0, W, H).data;
  } catch (e) { return col; }
  for (let i = 0; i < n; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    u -= Math.floor(u);
    v -= Math.floor(v);
    const px = Math.min(W - 1, Math.max(0, (u * W) | 0));
    const py = Math.min(H - 1, Math.max(0, (v * H) | 0));
    const o = (py * W + px) * 4;
    col[i * 3] = data[o];
    col[i * 3 + 1] = data[o + 1];
    col[i * 3 + 2] = data[o + 2];
  }
  return col;
}

export function classifyHair(geom, col) {
  const pos = geom.attributes.position;
  const idx = geom.index ? geom.index.array : null;
  const n = pos.count;
  const out = new Uint8Array(n);
  const C = HAIR_CFG;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = x < 0 ? -x : x;
    const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2];
    const t = isTeal(r, g, b);
    // 脚下那片薄片（模型自带的底板）不是头发：马尾最低也在它上面/身后
    if (y < 0.30 && z > 0.02) { out[i] = 0; continue; }
    if (ax > C.splitX) out[i] = (t || y > C.bandY) ? 1 : 0;
    else out[i] = (t && y > C.capY) ? 1 : 0;
  }
  // 1 环扩张：紧贴头发的暗色发丝也收进来。只在头发的邻域里扩，
  // 所以不会碰到裙子、鞋底、手套这些同样偏青的东西。
  if (idx) {
    const near = new Uint8Array(n);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b2 = idx[t + 1], c2 = idx[t + 2];
      const ha = out[a], hb = out[b2], hc = out[c2];
      if (ha + hb + hc < 2) continue;
      if (!ha) near[a]++;
      if (!hb) near[b2]++;
      if (!hc) near[c2]++;
    }
    for (let i = 0; i < n; i++) {
      if (out[i] || near[i] < 2) continue;
      const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2];
      if (g > r + 12 && b > r + 10 && g > 45) out[i] = 1;
    }
  }
  return out;
}

// 整片投票：模型是一层层贴片拼起来的 —— 接缝处顶点不共享，只是位置重合。
// 一片贴片要么整片是头发，要么整片是衣服/皮肤，不会一半一半。
// 按片投票就能彻底避免「同一张面里一半跟着发骨、另一半跟着手臂」造成的撕裂与破洞。
export function voteHairComponents(geom, isHair) {
  const n = geom.attributes.position.count;
  const idx = geom.index ? geom.index.array : null;
  if (!idx) return { isHair, comps: 0, hairComps: 0, hairN: 0, demoted: 0 };
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (x) => {
    let r = x;
    while (par[r] !== r) r = par[r];
    while (par[x] !== r) { const nx = par[x]; par[x] = r; x = nx; }
    return r;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]);
    if (b !== a) par[b] = a;
    const c = find(idx[t + 2]);
    if (c !== a) par[c] = a;
  }
  const cnt = new Map(), hcnt = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    cnt.set(r, (cnt.get(r) || 0) + 1);
    if (isHair[i]) hcnt.set(r, (hcnt.get(r) || 0) + 1);
  }
  const keep = new Map();
  for (const [r, c] of cnt) keep.set(r, (hcnt.get(r) || 0) / c >= HAIR_CFG.voteRatio ? 1 : 0);
  let hairComps = 0;
  for (const r of keep.keys()) if (keep.get(r)) hairComps++;
  const out = new Uint8Array(n);
  let hairN = 0, before = 0;
  for (let i = 0; i < n; i++) {
    if (isHair[i]) before++;
    const v = keep.get(find(i)) ? 1 : 0;
    out[i] = v;
    hairN += v;
  }
  return { isHair: out, comps: cnt.size, hairComps, hairN, demoted: before - hairN };
}

// 一条马尾的中轴：从发绳位置到发梢等分取样，每点取附近顶点重心
function chainNodes(geom, isHair, sign) {
  const pos = geom.attributes.position;
  const C = HAIR_CFG;
  let yMin = 1e9;
  for (let i = 0; i < pos.count; i++) {
    if (!isHair[i]) continue;
    if (pos.getX(i) * sign <= C.splitX) continue;
    const y = pos.getY(i);
    if (y < yMin) yMin = y;
  }
  if (yMin > 1e8) return null;
  const K = C.segs + 1;
  const span = C.rootY - yMin;
  const pts = [];
  for (let k = 0; k < K; k++) {
    const yt = C.rootY - span * (k / (K - 1));
    let sx = 0, sz = 0, cnt = 0;
    for (let i = 0; i < pos.count; i++) {
      if (!isHair[i]) continue;
      const x = pos.getX(i);
      if (x * sign <= C.splitX) continue;
      const y = pos.getY(i);
      if (y > yt + 0.07 || y < yt - 0.07) continue;
      sx += x;
      sz += pos.getZ(i);
      cnt++;
    }
    if (cnt) pts.push(new THREE.Vector3(sx / cnt, yt, sz / cnt));
    else pts.push(new THREE.Vector3(sign * 0.30, yt, -0.10));
  }
  return pts;
}
// 给骨架补上发骨链，并重写头发顶点的蒙皮权重。
// 必须在骨架处于静止姿势时调用（onLoadedRigged 里紧跟代理节点之后）。
export function installHair(opt) {
  const { geom, mesh, headBone, rig, root, skeleton } = opt;
  const C = HAIR_CFG;
  if (!headBone || !skeleton) return null;
  const col = sampleVertexColor(geom, mesh.material);
  const isHair0 = classifyHair(geom, col);
  const vote = voteHairComponents(geom, isHair0);
  const isHair = vote.isHair;
  const hairN = vote.hairN;
  if (hairN < 200) return null;

  // 模型把手指和头发生成了同一张面（共面片）。头发不再跟着手臂走之后，
  // 这些缝合处会被扯成长针。把「头发 ↔ 四肢」之间的桥接面割开，
  // 两边各自独立，接缝只有几毫米，看不出
  const pos = geom.attributes.position;
  const cutBridges = () => {
    const gidx = geom.index ? geom.index.array : null;
    if (!gidx) return 0;
    // 只割位移大的地方（手/前臂/腿脚）；肩膀、上臂贴着关节，缝在一起也几乎不拉长，
    // 割开反而会露出缺口
    const limbRe = /hand|forearm|upleg|leg|foot|toe/i;
    const limbDom = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let bs = 0, bi = 0;
      for (let k = 0; k < 4; k++) { const wv = sw[i * 4 + k]; if (wv > bs) { bs = wv; bi = si0[i * 4 + k]; } }
      const nm = (skeleton.bones[bi] && skeleton.bones[bi].name || "").replace(/^mixamorig[:_]?/i, "");
      limbDom[i] = limbRe.test(nm) ? 1 : 0;
    }
    const keep = new Uint32Array(gidx.length);
    let m = 0, cut = 0;
    for (let t = 0; t < gidx.length; t += 3) {
      const a = gidx[t], b2 = gidx[t + 1], c2 = gidx[t + 2];
      const ha = isHair[a], hb = isHair[b2], hc = isHair[c2];
      if ((ha !== hb || hb !== hc) &&
          ((!ha && limbDom[a]) || (!hb && limbDom[b2]) || (!hc && limbDom[c2]))) { cut++; continue; }
      keep[m++] = a; keep[m++] = b2; keep[m++] = c2;
    }
    if (cut) geom.setIndex(new THREE.BufferAttribute(keep.subarray(0, m), 1));
    return cut;
  };
  const headIdx = skeleton.bones.indexOf(headBone);
  if (headIdx < 0) return null;
  const si0 = geom.attributes.skinIndex.array;
  const sw = geom.attributes.skinWeight.array;
  const cutTris = cutBridges();


  // 1) 两侧各建一条 4 段发骨，挂在头骨下面
  const chains = [];
  for (const sign of [1, -1]) {
    const pts = chainNodes(geom, isHair, sign);
    if (!pts) continue;
    const bones = [];
    let parent = headBone;
    for (let k = 0; k < pts.length; k++) {
      const b = new THREE.Bone();
      b.name = (sign > 0 ? "hairL" : "hairR") + k;
      root.updateMatrixWorld(true);
      b.position.copy(parent.worldToLocal(pts[k].clone()));
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
      parent.add(b);
      skeleton.bones.push(b);
      bones.push(b);
      parent = b;
    }
    chains.push({ sign, pts, bones, items: [] });
  }
  if (!chains.length) return null;

  // 2) 重写头发顶点的权重：头骨 + 发骨链（三角核平滑过渡）
  const si = si0;
  const S = C.segs;
  const hw = 1 / S;
  for (let i = 0; i < pos.count; i++) {
    if (!isHair[i]) continue;
    const x = pos.getX(i), y = pos.getY(i);
    const sign = x >= 0 ? 1 : -1;
    let ch = null;
    for (const c2 of chains) if (c2.sign === sign) ch = c2;
    if (!ch) ch = chains[0];
    const yTop = ch.pts[0].y, yBot = ch.pts[ch.pts.length - 1].y;
    let t = (yTop - y) / Math.max(1e-4, yTop - yBot);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    const w = [0, 0, 0, 0];
    for (let k = 0; k < S; k++) {
      const tc = (k + 0.5) / S;
      const v = 1 - Math.abs(t - tc) / hw;
      w[k] = v > 0 ? v : 0;
    }
    if (t >= (S - 0.5) / S) for (let k = 0; k < S; k++) w[k] = k === S - 1 ? 1 : 0;
    const cand = [];
    for (let k = 0; k < S; k++) if (w[k] > 1e-3) cand.push(k);
    cand.sort((a, b2) => w[b2] - w[a]);
    if (cand.length > 3) cand.length = 3;
    let sum = 0;
    for (const k of cand) sum += w[k];
    let wh = 1 - sum;
    if (wh < 0) wh = 0;
    const list = [];
    if (wh > 1e-3) list.push([headIdx, wh]);
    for (const k of cand) list.push([skeleton.bones.indexOf(ch.bones[k]), w[k]]);
    let tot = 0;
    for (const it of list) tot += it[1];
    if (!(tot > 0)) continue;
    for (let k = 0; k < 4; k++) {
      if (k < list.length) {
        si[i * 4 + k] = list[k][0];
        sw[i * 4 + k] = list[k][1] / tot;
      } else {
        si[i * 4 + k] = 0;
        sw[i * 4 + k] = 0;
      }
    }
  }
  geom.attributes.skinIndex.needsUpdate = true;
  geom.attributes.skinWeight.needsUpdate = true;

  // 3) 绑定姿势重算（新加的骨头也要有逆绑定矩阵）
  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  mesh.bind(skeleton);

  // 4) 每段发骨的驱动代理（交给 rigSkin 换算成骨骼局部量）
  for (const ch of chains) {
    for (let k = 0; k < ch.bones.length; k++) {
      const p = rig.proxy(ch.bones[k]);
      const rec = p.userData.rec;
      if (rec) rec.depth = 1000 + k;       // 必须排在头骨之后施加
      ch.items.push({ bone: ch.bones[k], proxy: p, tau: 0.10 + 0.05 * k, qf: new THREE.Quaternion() });
    }
  }
  return new HairSwinger(headBone, chains.map((c2) => c2.items),
    { hairN, bones: skeleton.bones.length, cutTris, comps: vote.comps, hairComps: vote.hairComps, demoted: vote.demoted });
}

// 发链驱动：每一段都以不同的时间常数"追"头部的朝向，
// 追得慢就有滞后 → 头发会甩、会慢半拍，松手后自然回摆。
export class HairSwinger {
  constructor(headBone, items, info) {
    this.head = headBone;
    this.items = items || [];
    this.info = info || {};
    this.ready = false;
    this.t = 0;
  }
  update(dt) {
    if (!this.head || !this.items.length || !(dt > 0)) return;
    this.head.getWorldQuaternion(_qh);
    if (!this.ready) {
      for (const ch of this.items) for (const it of ch) it.qf.copy(_qh);
      this.ready = true;
      return;
    }
    this.t += dt;
    const C = HAIR_CFG;
    for (const ch of this.items) {
      for (let k = 0; k < ch.length; k++) {
        const it = ch[k];
        const a = 1 - Math.exp(-dt / it.tau);
        it.qf.slerp(_qh, a > 1 ? 1 : a);
        // 限住整段相对头部的滞后
        _qp.copy(_qh).invert().multiply(it.qf);
        clampAngle(_qp, C.maxLag);
        it.qf.copy(_qh).multiply(_qp);
        // 这一段相对父段的夹角（世界空间）
        _qp.copy(k === 0 ? _qh : ch[k - 1].qf).invert();
        _qa.copy(it.qf).multiply(_qp);
        clampAngle(_qa, C.maxSwing);
        // 一点点怠速摇曳，别像雕塑
        const sway = 0.014 * Math.sin(this.t * 1.05 + k * 0.9);
        _ax.set(0, 0, 1);
        _qp.setFromAxisAngle(_ax, sway);
        _qa.multiply(_qp);
        it.proxy.quaternion.copy(_qa);
      }
    }
  }
}

function clampAngle(q, max) {
  if (q.w > 1) q.w = 1;
  else if (q.w < -1) q.w = -1;
  const ang = 2 * Math.acos(q.w);
  if (ang <= max) return q;
  const s = Math.sqrt(Math.max(1e-8, 1 - q.w * q.w));
  _ax.set(q.x / s, q.y / s, q.z / s);
  return q.setFromAxisAngle(_ax, max);
}
