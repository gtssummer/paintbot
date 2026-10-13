// teams.js — teams, capacity rules and the persistent roster.
// Capacity: with S students and 4 teams every team ends with floor(S/4) or floor(S/4)+1 players
// ("fair fill"): a team may grow to base+1 only while fewer than S mod 4 teams have done so.
// For S = 20…24 that is exactly the 5–6 players per team the brief asks for.

export const TEAMS = [
  { id: 1, name: 'TEAM 1', color: '#ff7a1a', glow: '#ffb46e', deep: '#5a1f00', ink: '#1c0a00' }, // neon orange
  { id: 2, name: 'TEAM 2', color: '#7dff3a', glow: '#c2ff96', deep: '#173f00', ink: '#0a1a00' }, // slime green
  { id: 3, name: 'TEAM 3', color: '#b34dff', glow: '#dcabff', deep: '#2d0059', ink: '#14002a' }, // electric purple
  { id: 4, name: 'TEAM 4', color: '#ffe31a', glow: '#fff39a', deep: '#4d4300', ink: '#1f1b00' }, // toxic yellow
];

export const CLASS_MIN = 20, CLASS_MAX = 24;
const KEY = 'door-vault-randomizer-v1';

function storage() {
  try { const s = window.localStorage; const k = '__t'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}

export class Roster {
  constructor({ persist = true, initial = null } = {}) {
    this.store = persist ? storage() : null;
    this.state = { classSize: 24, counts: [0, 0, 0, 0], history: [] };
    if (initial) this.state = structuredClone(initial);
    else if (this.store) {
      try {
        const s = JSON.parse(this.store.getItem(KEY) || 'null');
        if (s && Array.isArray(s.counts) && s.counts.length === 4) this.state = { classSize: s.classSize || 24, counts: s.counts, history: s.history || [] };
      } catch { /* corrupted storage: start fresh */ }
    }
  }
  save() { if (this.store) try { this.store.setItem(KEY, JSON.stringify(this.state)); } catch { /* quota or blocked */ } }
  get counts() { return this.state.counts; }
  get classSize() { return this.state.classSize; }
  assigned() { return this.state.counts.reduce((a, b) => a + b, 0); }
  caps() {
    const n = TEAMS.length, base = Math.floor(this.state.classSize / n), extra = this.state.classSize % n;
    const big = this.state.counts.filter((c) => c > base).length;
    return this.state.counts.map((c) => (c > base || big < extra ? base + 1 : base));
  }
  pool() { const caps = this.caps(); return this.state.counts.map((c, i) => (c < caps[i] ? i : -1)).filter((i) => i >= 0); }
  isFull(i) { return this.state.counts[i] >= this.caps()[i]; }
  complete() { return this.pool().length === 0; }
  /** Uniform pick among teams that still have room, with a crypto-grade random source. */
  pick(rand = cryptoRandom) { const p = this.pool(); return p.length ? p[Math.floor(rand() * p.length)] : -1; }
  assign(i) { this.state.counts[i]++; this.state.history.push(i); this.save(); }
  undo() { const i = this.state.history.pop(); if (i == null) return -1; this.state.counts[i]--; this.save(); return i; }
  reset() { this.state.counts = [0, 0, 0, 0]; this.state.history = []; this.save(); }
  /** Change class size if every team still fits its new capacity. */
  setClassSize(n) {
    n = Math.max(CLASS_MIN, Math.min(CLASS_MAX, n));
    const prev = this.state.classSize;
    this.state.classSize = n;
    if (this.state.counts.some((c, i) => c > this.caps()[i]) || this.assigned() > n) { this.state.classSize = prev; return false; }
    this.save();
    return true;
  }
}

export function cryptoRandom() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  catch { return Math.random(); } // mg-allow: fallback for very old browsers only
}
