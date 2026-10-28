// 语音：用系统 TTS 说中文；同时提供麦克风音量驱动口型（"学我说话"）
export class Voice {
  constructor(o = {}) {
    this.enabled = o.enabled !== false;
    this.volume = o.volume ?? 0.9;
    this.lang = 'zh-CN';
    this.onLevel = o.onLevel || (() => {});
    this.onText = o.onText || (() => {});
    this.speaking = false;
    this._voice = null;
    this._pick();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => this._pick();
    }
  }
  _pick() {
    if (!window.speechSynthesis) return;
    const vs = window.speechSynthesis.getVoices() || [];
    const zh = vs.filter((v) => /zh|Chinese|Yue|Xiaoxiao|Xiaoyi|Huihui|Yaoyao|Kangkang/i.test(v.lang + v.name));
    const fem = zh.find((v) => /Xiaoxiao|Xiaoyi|Huihui|Yaoyao|female|女/i.test(v.name));
    this._voice = fem || zh[0] || vs[0] || null;
  }
  speak(text, o = {}) {
    if (!this.enabled || !window.speechSynthesis) { this._fake(text, o); return; }
    try { window.speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang;
    if (this._voice) u.voice = this._voice;
    u.rate = o.rate ?? 1.12;
    u.pitch = o.pitch ?? 1.45;
    u.volume = this.volume;
    this.speaking = true;
    this._textLen = text.length;
    this.onText(text);
    u.onstart = () => { this._t0 = performance.now(); this._fakeStart(text); };
    u.onend = () => { this.speaking = false; this._fakeStop(); };
    u.onerror = () => { this.speaking = false; this._fakeStop(); };
    try { window.speechSynthesis.speak(u); } catch { this._fake(text, o); }
  }
  // 没有 TTS 时：用假节奏动嘴
  _fake(text, o) {
    this.onText(text);
    this._fakeStart(text);
    const dur = Math.min(4200, 260 + text.length * 130);
    clearTimeout(this._fakeTimer);
    this._fakeTimer = setTimeout(() => this._fakeStop(), dur);
  }
  _fakeStart(text) {
    this.speaking = true;
    clearInterval(this._fakeIv);
    this._fakeIv = setInterval(() => {
      const lvl = 0.25 + 0.75 * Math.abs(Math.sin(performance.now() / 95));
      this.onLevel(lvl);
    }, 45);
  }
  _fakeStop() {
    this.speaking = false;
    clearInterval(this._fakeIv);
    this.onLevel(0);
  }
  stop() {
    try { window.speechSynthesis?.cancel(); } catch {}
    this._fakeStop();
  }
}
