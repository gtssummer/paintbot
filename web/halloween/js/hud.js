// hud.js — pinned occupancy panel: team counts against capacity, class size, sound, fullscreen,
// undo and a two-step reset (in-page confirmation; no browser dialogs).
import { el, set } from './lib/mg.js';
import { TEAMS, CLASS_MIN, CLASS_MAX } from './teams.js';

export class Hud {
  constructor(stage, { roster, onChange, onSound, onFullscreen, sound }) {
    this.roster = roster;
    this.onChange = onChange;
    const root = (this.root = el('aside', { class: 'hud', 'aria-label': 'Team occupancy' }, stage));
    const head = el('div', { class: 'hud-head' }, root);
    el('span', { class: 'hud-title', text: 'TEAM OCCUPANCY' }, head);
    const tools = el('span', { class: 'hud-tools' }, head);
    this.gearBtn = el('button', { class: 'hud-collapse', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Show settings', text: '⚙' }, tools);
    this.toggleBtn = el('button', { class: 'hud-collapse', type: 'button', 'aria-expanded': 'true', 'aria-label': 'Collapse panel', text: '–' }, tools);
    const body = (this.body = el('div', { class: 'hud-body' }, root));
    const list = el('ul', { class: 'hud-teams' }, body);
    this.rows = TEAMS.map((t) => {
      const li = el('li', { style: { '--c': t.color } }, list);
      el('i', { class: 'chip' }, li);
      el('b', { text: t.name }, li);
      const pips = el('span', { class: 'pips' }, li);
      const pipEls = Array.from({ length: 6 }, () => el('i', {}, pips));
      const count = el('span', { class: 'count' }, li);
      const full = el('em', { class: 'full', text: 'FULL' }, li);
      return { li, pipEls, count, full };
    });
    const meta = el('div', { class: 'hud-meta' }, body);
    this.assigned = el('span', {}, meta);
    const drawer = el('div', { class: 'hud-drawer' }, body);
    const cls = el('div', { class: 'hud-class' }, drawer);
    el('span', { text: 'STUDENTS IN CLASS' }, cls);
    this.minus = el('button', { type: 'button', 'aria-label': 'Fewer students', text: '−' }, cls);
    this.size = el('b', {}, cls);
    this.plus = el('button', { type: 'button', 'aria-label': 'More students', text: '+' }, cls);
    const acts = el('div', { class: 'hud-actions' }, drawer);
    this.soundBtn = el('button', { type: 'button' }, acts);
    this.fsBtn = el('button', { type: 'button', text: 'FULLSCREEN' }, acts);
    this.undoBtn = el('button', { type: 'button', text: 'UNDO LAST' }, acts);
    this.resetBtn = el('button', { type: 'button', class: 'danger', text: 'RESET' }, acts);
    this.note = el('div', { class: 'hud-note', 'aria-live': 'polite' }, body);
    this.armedReset = 0;
    this.sound = sound;

    this.toggleBtn.onclick = () => this.setCollapsed(!root.classList.contains('collapsed'));
    this.gearBtn.onclick = () => { const open = root.classList.toggle('drawer-open'); this.gearBtn.setAttribute('aria-expanded', String(open)); this.disarm(); };
    this.minus.onclick = () => this.changeSize(-1);
    this.plus.onclick = () => this.changeSize(+1);
    this.soundBtn.onclick = () => { onSound(); this.render(); };
    this.fsBtn.onclick = () => onFullscreen();
    this.undoBtn.onclick = () => { const i = roster.undo(); this.say(i >= 0 ? `Removed the last student from ${TEAMS[i].name}.` : 'Nothing to undo.'); this.changed(); };
    this.resetBtn.onclick = () => {
      if (this.armedReset) { roster.reset(); this.armedReset = 0; this.say('All teams are empty again.'); this.changed(); return; }
      this.armedReset = 1; this.resetBtn.textContent = 'CONFIRM RESET'; this.resetBtn.classList.add('armed');
      this.say('Press CONFIRM RESET to clear every team.');
    };
    try { if (localStorage.getItem('door-vault-hud') === 'collapsed') this.setCollapsed(true); } catch { /* storage blocked */ }
    this.render();
  }
  setCollapsed(c) {
    this.root.classList.toggle('collapsed', c);
    this.toggleBtn.textContent = c ? '+' : '–';
    this.toggleBtn.setAttribute('aria-expanded', String(!c));
    try { localStorage.setItem('door-vault-hud', c ? 'collapsed' : 'open'); } catch { /* storage blocked */ }
  }
  changeSize(d) {
    if (!this.roster.setClassSize(this.roster.classSize + d)) this.say('Some teams already have more students than that class size allows.');
    this.changed();
  }
  say(m) { this.note.textContent = m; }
  changed() { this.disarm(); this.render(); this.onChange && this.onChange(); }
  disarm() { this.armedReset = 0; this.resetBtn.textContent = 'RESET'; this.resetBtn.classList.remove('armed'); }
  /** counts/caps can be overridden (capture mode shows a scripted roster); flash = team index that just changed. */
  render(view = null) {
    const r = this.roster, counts = view ? view.counts : r.counts, caps = view ? view.caps : r.caps();
    this.rows.forEach((row, i) => {
      const c = counts[i], cap = caps[i], full = c >= cap;
      row.pipEls.forEach((p, j) => { p.className = j < c ? 'on' : j < cap ? '' : 'na'; });
      row.count.textContent = `${c}/${cap}`;
      row.li.classList.toggle('is-full', full);
    });
    const total = view ? view.classSize : r.classSize, assigned = counts.reduce((a, b) => a + b, 0);
    this.assigned.innerHTML = `ASSIGNED <b>${assigned}/${total}</b>`;
    this.size.textContent = String(total);
    this.minus.disabled = total <= CLASS_MIN; this.plus.disabled = total >= CLASS_MAX;
    this.undoBtn.disabled = !(view ? false : r.state.history.length);
    this.soundBtn.textContent = this.sound && this.sound.muted ? 'SOUND OFF' : 'SOUND ON';
    this.soundBtn.setAttribute('aria-pressed', String(!(this.sound && this.sound.muted)));
  }
  /** Per-frame: highlight the row that just changed. */
  flash(i, k) { this.rows.forEach((row, j) => set(row.li, { css: { '--flash': j === i ? k.toFixed(3) : '0' } })); }
}
