import { clamp, lerp } from './build.js';

const $ = (id) => document.getElementById(id);
const CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function setupUI(ctx) {
  const { hand, rig, char, voice, mic, camera, views, app } = ctx;
  const overlay = $('overlay');
  const video = $('video');
  const octx = overlay.getContext('2d');
  let logLines = [];
  let bubbleTimer = 0;

  function log(text) {
    logLines.push(text);
    if (logLines.length > 4) logLines = logLines.slice(-4);
    $('log').innerHTML = logLines.map((l) => `<span>${l}</span>`).join('');
  }
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function bubble(text, dur = 2.6) {
    const b = $('bubble');
    $('bubbleText').textContent = text;
    b.classList.remove('hidden');
    requestAnimationFrame(() => b.classList.add('show'));
    bubbleTimer = dur;
    clearTimeout(b._h);
    b._h = setTimeout(() => { b.classList.remove('show'); }, dur * 1000);
  }

  // ---- 摄像头 ----
  async function refreshDevices() {
    const list = await hand.listDevices();
    const sel = $('selCam');
    if (!list.length) return;
    sel.innerHTML = '<option value="">默认摄像头</option>' + list.map((d, i) =>
      `<option value="${d.deviceId}">${d.label || '摄像头 ' + (i + 1)}</option>`).join('');
  }
  $('btnCam').onclick = async () => {
    if (hand.camOn) {
      hand.stopCamera();
      $('btnCam').textContent = '开启摄像头';
      $('chipCam').textContent = '摄像头：未开启';
      toast('已关闭摄像头，鼠标模式生效');
      log('鼠标模式：移动鼠标＝指尖，按住＝交汇捏住');
    } else {
      $('btnCam').textContent = '开启中…';
      const ok = await hand.startCamera($('selCam').value);
      $('btnCam').textContent = ok ? '关闭摄像头' : '开启摄像头';
      $('chipCam').textContent = ok ? '摄像头：已开启' : '摄像头：失败';
      if (ok) { await refreshDevices(); bubble('把手抬起来呀～', 2.2); }
    }
  };
  $('selCam').onchange = async () => {
    if (hand.camOn) { hand.stopCamera(); await hand.startCamera($('selCam').value); }
  };
  refreshDevices();
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

  // ---- 手感 / 灵敏度 ----
  const seg = $('segFeel');
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
    hand.feel = b.dataset.k;
    toast('手感：' + b.textContent);
  };
  $('rngSens').oninput = (e) => {
    hand.sensitivity = +e.target.value;
    $('valSens').textContent = (+e.target.value).toFixed(2);
  };
  $('rngPinch').oninput = (e) => {
    hand.pinchScale = +e.target.value;
    $('valPinch').textContent = (+e.target.value).toFixed(2);
  };
  $('rngVol').oninput = (e) => {
    voice.volume = +e.target.value;
    $('valVol').textContent = (+e.target.value).toFixed(2);
  };
  $('chkVoice').onchange = (e) => { voice.enabled = e.target.checked; if (!e.target.checked) voice.stop(); };
  $('chkSkeleton').onchange = (e) => { hand.showSkeleton = e.target.checked; };
  $('chkMirror').onchange = (e) => { hand.mirror = e.target.checked; };
  $('chkZones').onchange = (e) => { char.debugZones.visible = e.target.checked; };

  // ---- 人物切换（写实模型 / 程序化）----
  const segModel = $('segModel');
  if (segModel) {
    const cur = char.isModel ? 'model' : 'proc';
    [...segModel.children].forEach((b) => b.classList.toggle('on', b.dataset.k === cur));
    segModel.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.k === cur) return;
      const url = new URL(location.href);
      if (b.dataset.k === 'proc') url.searchParams.set('model', '0');
      else url.searchParams.delete('model');
      location.href = url.toString();
    };
  }

  // ---- 动作 ----
  $('btnBlink').onclick = () => rig.blinkNow(2);
  $('btnHi').onclick = () => { rig.wave(); apiSay('你好呀！我是初音～'); };
  $('btnSong').onclick = () => {
    const on = !rig.singOn;
    rig.sing(on);
    $('btnSong').classList.toggle('on', on);
    if (on) apiSay('♪ 世界第一的公主殿下 ♪');
  };
  $('btnSpin').onclick = () => { rig.spinOnce(); $('btnTurn').classList.remove('on'); };
  $('btnDance').onclick = () => {
    const on = !rig.danceOn;
    rig.dance(on);
    $('btnDance').classList.toggle('on', on);
    if (on) apiSay('一起来跳舞吧♪');
  };
  $('btnReset').onclick = () => { app.reset(); toast('已复位'); };
  $('btnTurn').onclick = () => {
    const on = rig.turnToggle();
    $('btnTurn').classList.toggle('on', on);
    if (on) apiSay('好，我转给你看～');
  };
  function apiSay(t) { voice.speak(t); }

  // ---- 视角 ----
  const viewBtns = document.querySelectorAll('.view');
  viewBtns.forEach((b) => {
    b.onclick = () => {
      viewBtns.forEach((o) => o.classList.toggle('on', o === b));
      app.setView(b.dataset.view);
    };
  });

  // ---- 麦克风 ----
  $('btnMic').onclick = async () => {
    if (mic.active) { mic.stop(); $('btnMic').textContent = '开启麦克风'; $('btnMic').classList.remove('on'); return; }
    const ok = await mic.start();
    $('btnMic').textContent = ok ? '关闭麦克风' : '麦克风不可用';
    $('btnMic').classList.toggle('on', ok);
    if (ok) { toast('学我说话：开口她就跟着动嘴'); log('麦克风已开启，她学你说话'); }
  };

  // ---- 手部骨架覆盖层 ----
  function drawOverlay() {
    const st = hand.state;
    const w = overlay.width, h = overlay.height;
    if (!w || !h) return;
    octx.clearRect(0, 0, w, h);
    if (!hand.camOn) {
      octx.fillStyle = 'rgba(0,0,0,0)';
      return;
    }
    const lm = st.landmarks;
    if (lm && hand.showSkeleton) {
      const P = (i) => ({ x: (1 - lm[i].x) * w, y: lm[i].y * h });
      octx.lineCap = 'round';
      for (const [a, b] of CONN) {
        const p = P(a), q = P(b);
        octx.strokeStyle = 'rgba(63,216,192,.85)';
        octx.lineWidth = Math.max(2, w * 0.006);
        octx.beginPath(); octx.moveTo(p.x, p.y); octx.lineTo(q.x, q.y); octx.stroke();
      }
      for (let i = 0; i < lm.length; i++) {
        const p = P(i);
        octx.fillStyle = i === 8 ? '#eafffb' : 'rgba(210,255,246,.75)';
        octx.beginPath(); octx.arc(p.x, p.y, i === 8 ? w * 0.012 : w * 0.007, 0, Math.PI * 2); octx.fill();
      }
      // 指尖交汇高亮：拇指—食指
      const a = P(4), b = P(8);
      const conv = clamp(st.pinch01, 0, 1);
      octx.strokeStyle = `rgba(${lerp(63, 255, conv) | 0},${lerp(216, 120, conv) | 0},${lerp(192, 140, conv) | 0},${0.45 + 0.55 * conv})`;
      octx.lineWidth = Math.max(2, w * (0.004 + 0.006 * conv));
      octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke();
      if (conv > 0.55) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        octx.strokeStyle = 'rgba(255,255,255,.9)';
        octx.lineWidth = Math.max(2, w * 0.005);
        octx.beginPath(); octx.arc(mx, my, w * (0.02 + 0.03 * conv), 0, Math.PI * 2); octx.stroke();
      }
    }
  }

  let fpsT = 0, fpsN = 0, fps = 0;
  function update(dt) {
    overlay.width = video.videoWidth ? Math.min(720, video.videoWidth) : 480;
    overlay.height = Math.round(overlay.width * 0.75);
    drawOverlay();
    fpsN++;
    fpsT += dt;
    if (fpsT > 0.5) {
      fps = Math.round(fpsN / fpsT);
      fpsN = 0; fpsT = 0;
      $('chipFps').textContent = fps + ' FPS';
    }
    const st = hand.state;
    $('chipHand').textContent = st.present
      ? (st.source === 'camera' ? `手：已识别 · ${st.pinch ? '交汇中' : st.open ? '张开' : '握起'}` : '手：鼠标模式')
      : '手：未检测';
  }

  return { log, toast, bubble, update, refreshDevices };
}
