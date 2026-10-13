// Builds one self-contained HTML file: code, styles and fonts are inlined, so it opens with a double-click
// (file://, no server, no internet). Usage: node tools/build-offline.mjs [out.html]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'halloween-team-randomizer.html'));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// Browsers refuse to load module files from file://, so every import goes into one inline module.
const js = execFileSync('npx', ['--yes', 'esbuild@0.25.0', 'js/main.js', '--bundle', '--format=esm', '--log-level=warning'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, shell: process.platform === 'win32' });

const fonts = read('assets/fonts/fonts.css').replace(/url\("([^"]+)"\)/g, (_, file) =>
  `url("data:font/woff2;base64,${readFileSync(path.join(ROOT, 'assets/fonts', file)).toString('base64')}")`);

// Function replacers: the bundle may contain "$&"-style sequences that string replacements would expand.
const swaps = [
  ['<link rel="stylesheet" href="assets/fonts/fonts.css">', () => `<style>\n${fonts}</style>`],
  ['<link rel="stylesheet" href="css/vault.css">', () => `<style>\n${read('css/vault.css')}</style>`],
  ['<script type="module" src="js/main.js"></script>', () => `<script type="module">\n${js.replace(/<\/(script)/gi, '<\\/$1')}</script>`],
];
let html = read('index.html');
for (const [tag, fill] of swaps) {
  if (!html.includes(tag)) throw new Error(`index.html no longer contains ${tag}; update tools/build-offline.mjs`);
  html = html.replace(tag, fill);
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`✓ ${out}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
