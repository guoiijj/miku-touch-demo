// 麦克风：音量驱动口型（像"你好汤姆猫"那样学你说话）
export class MicInput {
  constructor(o = {}) {
    this.onLevel = o.onLevel || (() => {});
    this.onText = o.onText || (() => {});
    this.active = false;
    this.level = 0;
    this.recog = null;
    this.echo = false;
  }
  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.src = this.ctx.createMediaStreamSource(stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 512;
      this.an.smoothingTimeConstant = 0.65;
      this.src.connect(this.an);
      this.buf = new Uint8Array(this.an.frequencyBinCount);
      this.active = true;
      this._loop();
      this._startRecog();
      return true;
    } catch (e) {
      return false;
    }
  }
  stop() {
    this.active = false;
    try { this.recog?.stop(); } catch {}
    try { this.ctx?.close(); } catch {}
  }
  _loop() {
    if (!this.active) return;
    this.an.getByteFrequencyData(this.buf);
    let sum = 0;
    for (let i = 2; i < 40; i++) sum += this.buf[i];
    const avg = sum / 38 / 255;
    this.level = Math.max(0, Math.min(1, Math.pow(avg * 1.9, 0.8)));
    this.onLevel(this.level);
    requestAnimationFrame(() => this._loop());
  }
  _startRecog() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.lang = 'zh-CN';
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        if (res && res.isFinal) this.onText(res[0].transcript.trim());
      };
      r.onerror = () => {};
      r.onend = () => { if (this.active) { try { r.start(); } catch {} } };
      r.start();
      this.recog = r;
    } catch { this.recog = null; }
  }
}
