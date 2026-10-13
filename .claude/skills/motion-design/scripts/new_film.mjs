#!/usr/bin/env node
// new_film.mjs — scaffold a film project: engine, test-card film, render contract, tools.
//
//   node <skill>/scripts/new_film.mjs my-film --title "Launch reel" --format 16x9 --fps 60 --duration 15 --bpm 120
//   options: --size 1920x1080 | --format 16x9|9x16|1x1|4x5   --loop   --force (overwrite template files, never film.js/film.json/docs)
//
// Then: cd my-film && node tools/render.mjs check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, '..');
const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const n = argv[i + 1]; if (n !== undefined && !n.startsWith('--')) { flags[a.slice(2)] = n; i++; } else flags[a.slice(2)] = true; }
  else pos.push(a);
}
if (!pos[0]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(1); }

const dest = path.resolve(pos[0]);
const keep = new Set(['film.js', 'film.json', 'docs/brief.md']);
let copied = 0, skipped = 0;
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n), d = path.join(dst, n), rel = path.relative(dest, d).split(path.sep).join('/');
    if (fs.statSync(s).isDirectory()) { copyDir(s, d); continue; }
    if (fs.existsSync(d) && (!flags.force || keep.has(rel))) { skipped++; continue; }
    fs.copyFileSync(s, d); copied++;
  }
}
copyDir(path.join(skill, 'assets', 'template'), dest);
fs.mkdirSync(path.join(dest, 'tools'), { recursive: true });
for (const t of ['render.mjs', 'fonts.mjs', 'audio.py']) fs.copyFileSync(path.join(here, t), path.join(dest, 'tools', t));
for (const d of ['out', 'assets/images', 'audio']) fs.mkdirSync(path.join(dest, d), { recursive: true });

// Apply options to film.json (only when we just created it, or when flags are given explicitly).
const fj = path.join(dest, 'film.json');
const film = JSON.parse(fs.readFileSync(fj, 'utf8'));
if (flags.title) film.title = String(flags.title);
const fmt = flags.format && film.formats && film.formats[flags.format];
if (fmt) [film.width, film.height] = fmt;
if (flags.size) { const [w, h] = String(flags.size).split(/[x×]/).map(Number); if (w && h) { film.width = w; film.height = h; } }
if (flags.fps) film.fps = Number(flags.fps);
if (flags.duration) film.duration = Number(flags.duration);
if (flags.bpm) film.bpm = Number(flags.bpm);
if (flags.loop) film.loop = true;
fs.writeFileSync(fj, JSON.stringify(film, null, 2) + '\n');
const html = path.join(dest, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/<title>.*<\/title>/, `<title>${film.title.replace(/</g, '')}</title>`));

console.log(`✓ film project at ${dest} (${copied} files copied${skipped ? `, ${skipped} existing kept` : ''})`);
console.log(`  ${film.width}×${film.height} @${film.fps}fps, ${film.duration}s, ${film.bpm} BPM${film.loop ? ', loop' : ''}`);
console.log(`next:\n  cd ${path.relative(process.cwd(), dest) || '.'}\n  node tools/render.mjs check      # toolchain + contract check on the test card\n  then write docs/brief.md, replace film.js, and follow CLAUDE.md`);
