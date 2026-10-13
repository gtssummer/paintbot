// audio.js — procedural sound design with the Web Audio API: no samples, nothing to download.
// Industrial clunks, a conveyor hum that follows the rail speed, ratchet ticks as doors pass the
// lock station, the latch, the door creak, a per-team fanfare and a neon ignition buzz.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.hum = null; }

  ensure() {
    try {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.22;
      this.bus = ctx.createGain();
      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.6, 3);
      this.send = ctx.createGain(); this.send.gain.value = 0.2;
      this.bus.connect(comp); this.bus.connect(this.send); this.send.connect(this.verb); this.verb.connect(comp);
      comp.connect(this.master); this.master.connect(ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      this.ambient();
      return true;
    } catch { return false; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    let s = 7;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, decay); }
    }
    return buf;
  }
  makeNoise(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let s = 3;
    for (let i = 0; i < n; i++) { s = (s * 48271) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    return buf;
  }

  // ── primitives ──
  gain(v = 0, dest = this.bus) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  pan(p, dest = this.bus) { const n = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain(); if (n.pan) n.pan.value = p; n.connect(dest); return n; }
  filter(type, f, q = 1, dest) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (dest) b.connect(dest); return b; }
  envelope(param, t, peak, attack, decay, floor = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(floor, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  }
  tone(type, f0, t, { f1 = f0, glide = 0.1, peak = 0.3, attack = 0.005, decay = 0.3, dest = this.bus, detune = 0 } = {}) {
    const o = this.ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const g = this.gain(0, dest); this.envelope(g.gain, t, peak, attack, decay);
    o.connect(g); o.start(t); o.stop(t + attack + decay + 0.05);
    return o;
  }
  noise(t, { type = 'bandpass', f = 1000, q = 1, peak = 0.3, attack = 0.002, decay = 0.1, f1 = null, glide = 0.2, dest = this.bus } = {}) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const fl = this.filter(type, f, q);
    if (f1) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(f1, t + glide); }
    const g = this.gain(0, dest); this.envelope(g.gain, t, peak, attack, decay);
    src.connect(fl); fl.connect(g);
    src.start(t, (t * 0.37) % 1.5); src.stop(t + attack + decay + 0.05);
    return { src, fl, g };
  }

  // ── sounds ──
  ambient() {
    const ctx = this.ctx, t = ctx.currentTime, out = this.gain(0.0);
    out.gain.linearRampToValueAtTime(0.06, t + 3);
    const lp = this.filter('lowpass', 240, 0.7, out);
    for (const [f, type] of [[55, 'sine'], [55.35, 'sine'], [110.2, 'sawtooth']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = type === 'sawtooth' ? 0.18 : 0.5;
      o.connect(g); g.connect(lp); o.start(t);
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nl = this.filter('lowpass', 380, 0.5); const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(nl); nl.connect(ng); ng.connect(out); n.start(t);
  }

  press() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.noise(t, { type: 'highpass', f: 3500, peak: 0.5, decay: 0.012 });
    this.tone('sine', 110, t, { f1: 52, glide: 0.14, peak: 0.95, decay: 0.24 });
    this.tone('square', 190, t, { f1: 120, glide: 0.06, peak: 0.08, decay: 0.07, dest: this.filter('lowpass', 900, 1, this.bus) });
    this.noise(t + 0.01, { f: 1300, q: 7, peak: 0.25, decay: 0.09 });
    this.tone('sawtooth', 110, t + 0.08, { f1: 520, glide: 0.5, peak: 0.07, attack: 0.08, decay: 0.45, dest: this.filter('lowpass', 1400, 2, this.bus) });
  }

  whoosh(dur = 1.3, reverse = false) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime, p = this.pan(reverse ? 0.7 : -0.7);
    if (p.pan) p.pan.linearRampToValueAtTime(reverse ? -0.7 : 0.7, t + dur);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = this.filter('bandpass', 260, 1.1);
    const [a, b, c] = reverse ? [2600, 900, 220] : [260, 2600, 600];
    bp.frequency.setValueAtTime(a, t); bp.frequency.exponentialRampToValueAtTime(b, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(c, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(p); src.start(t); src.stop(t + dur + 0.05);
  }

  spinStart() {
    if (!this.ensure()) return;
    this.spinStop(0);
    const ctx = this.ctx, t = ctx.currentTime, out = this.gain(0);
    const lp = this.filter('lowpass', 300, 2.5, out);
    const oscs = [46, 46.7, 92.3].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.6; o.connect(g); g.connect(lp); o.start(t); return o; });
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const rb = this.filter('bandpass', 2300, 1.4); const rg = this.gain(0); n.connect(rb); rb.connect(rg); n.start(t);
    this.hum = { out, lp, oscs, n, rg };
  }
  spinSpeed(k) {
    const h = this.hum; if (!h) return;
    const t = this.ctx.currentTime;
    h.out.gain.setTargetAtTime(0.03 + 0.3 * k, t, 0.05);
    h.lp.frequency.setTargetAtTime(260 + 1900 * k, t, 0.05);
    h.oscs.forEach((o, i) => o.frequency.setTargetAtTime([46, 46.7, 92.3][i] * (1 + 1.4 * k), t, 0.05));
    h.rg.gain.setTargetAtTime(0.11 * Math.pow(k, 1.4), t, 0.05);
  }
  spinStop(fade = 0.3) {
    const h = this.hum; if (!h) return;
    const t = this.ctx.currentTime;
    h.out.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3)); h.rg.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
    h.oscs.forEach((o) => { o.frequency.setTargetAtTime(30, t, fade); o.stop(t + fade + 0.3); });
    h.n.stop(t + fade + 0.3);
    this.hum = null;
  }

  tick(k) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime, slow = 1 - k;
    this.noise(t, { f: 2600 + 1800 * k, q: 3, peak: 0.12 + 0.3 * slow, decay: 0.012 + 0.02 * slow });
    this.tone('triangle', 900 + 500 * slow, t, { f1: 600, glide: 0.03, peak: 0.05 + 0.1 * slow, decay: 0.035 });
  }

  latch() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.noise(t, { type: 'highpass', f: 2200, peak: 0.8, decay: 0.014 });
    this.tone('sine', 82, t, { f1: 44, glide: 0.25, peak: 1, decay: 0.4 });
    [523, 1187, 2231, 3489].forEach((f, i) => this.tone('sine', f, t + 0.004, { peak: 0.14 / (i + 1) ** 0.5, decay: 0.7 / (i + 1) }));
    this.noise(t + 0.07, { type: 'highpass', f: 4800, peak: 0.13, attack: 0.03, decay: 0.55 });
  }
  clamp() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    for (const d of [0, 0.075]) { this.noise(t + d, { type: 'highpass', f: 3000, peak: 0.45, decay: 0.01 }); this.tone('sine', 160, t + d, { f1: 90, glide: 0.05, peak: 0.35, decay: 0.08 }); }
  }
  creak() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(88, t); o.frequency.linearRampToValueAtTime(130, t + 0.55);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 26; lfo.connect(lg); lg.connect(o.frequency);
    const bp = this.filter('bandpass', 950, 5); const g = this.gain(0); this.envelope(g.gain, t, 0.14, 0.05, 0.55);
    o.connect(bp); bp.connect(g); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
    this.noise(t + 0.05, { f: 500, q: 0.8, peak: 0.2, attack: 0.1, decay: 0.5, f1: 1800, glide: 0.5 });
  }

  fanfare(team) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const root = [60, 62, 64, 67][team] ?? 60, hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // sub hit + cymbal swell
    this.tone('sine', 66, t, { f1: 34, glide: 0.8, peak: 0.9, decay: 1.1 });
    this.noise(t, { type: 'highpass', f: 5200, peak: 0.16, attack: 0.01, decay: 1.6 });
    // brass stab, then the resolved chord
    const brass = (notes, at, dur, peak) => notes.forEach((m) => {
      const lp = this.filter('lowpass', 500, 1.2); const g = this.gain(0); lp.connect(g);
      lp.frequency.setValueAtTime(500, t + at); lp.frequency.exponentialRampToValueAtTime(4200, t + at + 0.06); lp.frequency.exponentialRampToValueAtTime(1500, t + at + dur);
      this.envelope(g.gain, t + at, peak, 0.012, dur);
      for (const det of [-9, 0, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(lp); o.start(t + at); o.stop(t + at + dur + 0.1); }
    });
    brass([root - 12, root, root + 4, root + 7], 0, 0.42, 0.07);
    brass([root - 12, root + 5, root + 9, root + 12], 0.34, 0.3, 0.055);
    brass([root - 12, root, root + 4, root + 7, root + 12], 0.62, 1.6, 0.07);
    // rising arpeggio
    [0, 4, 7, 12, 16, 19, 24].forEach((iv, i) => this.tone('triangle', hz(root + 12 + iv), t + 0.05 + i * 0.065, { peak: 0.09, decay: 0.32 }));
    // sparkle
    const pent = [0, 2, 4, 7, 9];
    for (let i = 0; i < 18; i++) {
      const m = root + 24 + pent[(i * 3) % 5] + 12 * (i % 2);
      const p = this.pan(((i * 37) % 17) / 8.5 - 1);
      this.tone('sine', hz(m), t + 0.5 + i * 0.045, { peak: 0.035, decay: 0.5, dest: p });
    }
  }

  neon() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [0, 0.09, 0.15, 0.27].forEach((d, i) => {
      this.tone('square', 120, t + d, { peak: i === 3 ? 0.05 : 0.08, attack: 0.002, decay: i === 3 ? 0.5 : 0.035, dest: this.filter('bandpass', 1900, 2, this.bus) });
      this.noise(t + d, { type: 'highpass', f: 4200, peak: 0.18, decay: 0.02 });
    });
  }
  ui() { if (!this.ensure()) return; const t = this.ctx.currentTime; this.noise(t, { type: 'highpass', f: 2500, peak: 0.3, decay: 0.012 }); this.tone('sine', 1500, t, { peak: 0.06, decay: 0.04 }); }
  armed() { if (!this.ensure()) return; const t = this.ctx.currentTime; this.tone('triangle', 660, t, { peak: 0.07, decay: 0.12 }); this.tone('triangle', 990, t + 0.09, { peak: 0.07, decay: 0.2 }); }
}
