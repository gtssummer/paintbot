#!/usr/bin/env node
// render.mjs — render a seek(t) film: checks, stills, contact sheets, drafts, masters, video inspection.
// Zero npm dependencies: Node 22+ (global WebSocket), a Chrome/Chromium binary, ffmpeg/ffprobe on PATH.
//
//   node tools/render.mjs check                         contract checks: determinism, fonts, errors, lint, timing
//   node tools/render.mjs stills 0.5 2 4.25             full-res PNGs → out/stills/
//   node tools/render.mjs sheet [--every 0.5|--beats|--at 1,2.5] [--width 480 --cols 4]   labelled contact sheet(s)
//   node tools/render.mjs strip 3.2 [--span 0.5 --n 12] frames around a moment (spacing / easing / blur check)
//   node tools/render.mjs draft                         fast preview: half res, ≤30 fps, no blur → out/draft.mp4
//   node tools/render.mjs final [--sub 4 --workers 4]   master with motion blur (+ out/audio.wav) → out/final.mp4
//   node tools/render.mjs inspect [out/final.mp4]       evidence for the critic: metrics + sheets from the video
//   node tools/render.mjs serve [--port 4173]           preview server for a human (space, ←/→, [ ], G guides)
//
// Common flags: --dir <film folder> (default: cwd)  --page index.html  --format 9x16  --from S --to S
//               --fps N  --scale K  --out PATH  --chrome PATH  --audio PATH|none  --crf N  --preset slow

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

/* ───────────────────────────── args ───────────────────────────── */

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const eq = k.indexOf('=');
      if (eq > 0) { a[k.slice(2, eq)] = k.slice(eq + 1); continue; }
      const key = k.slice(2), next = argv[i + 1];
      if (next === undefined || (next.startsWith('--'))) a[key] = true;
      else { a[key] = next; i++; }
    } else a._.push(k);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'help';
const DIR = path.resolve(args.dir || process.cwd());
const OUT = path.join(DIR, 'out');
const log = (...m) => console.log(...m);
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const num = (v, d) => (v === undefined || v === true ? d : Number(v));

if (cmd === 'help' || args.help) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n');
  log(src.replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}
if (typeof WebSocket === 'undefined' && cmd !== 'serve') die('Node 22+ is required (global WebSocket). You have ' + process.version);

/* ───────────────────────────── static server ───────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain',
};
function startServer(root, port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://x');
        let p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
        if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
        if (!fs.existsSync(p)) { res.writeHead(404); return res.end('404 ' + u.pathname); }
        const size = fs.statSync(p).size, type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
        const head = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
        const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
        if (range) {
          const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(p, { start, end }).pipe(res);
        }
        res.writeHead(200, { ...head, 'Content-Length': size });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(p).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/* ───────────────────────────── chrome ───────────────────────────── */

function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
function findChrome() {
  const c = [];
  for (const k of ['chrome']) if (args[k]) c.push(args[k]);
  for (const k of ['CHROME_PATH', 'MG_CHROME', 'PUPPETEER_EXECUTABLE_PATH']) if (process.env[k]) c.push(process.env[k]);
  const home = os.homedir();
  const pwRoots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, '.cache/ms-playwright'), path.join(home, 'Library/Caches/ms-playwright'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright')].filter(Boolean);
  const full = [], shell = [];
  for (const root of pwRoots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root).sort().reverse(); } catch { continue; }
    for (const d of dirs) {
      const b = path.join(root, d);
      if (d.startsWith('chromium-')) full.push(path.join(b, 'chrome-linux/chrome'), path.join(b, 'chrome-linux64/chrome'), path.join(b, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'), path.join(b, 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'), path.join(b, 'chrome-win/chrome.exe'), path.join(b, 'chrome-win64/chrome.exe'));
      if (d.startsWith('chromium_headless_shell-')) shell.push(path.join(b, 'chrome-linux/headless_shell'), path.join(b, 'chrome-headless-shell-linux64/chrome-headless-shell'), path.join(b, 'chrome-mac/headless_shell'), path.join(b, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), path.join(b, 'chrome-headless-shell-mac-x64/chrome-headless-shell'), path.join(b, 'chrome-win/headless_shell.exe'), path.join(b, 'chrome-headless-shell-win64/chrome-headless-shell.exe'));
    }
  }
  const sys = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
    : process.platform === 'win32'
      ? [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean)
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'].map(which).filter(Boolean);
  // Windows: prefer Playwright's headless shell (installed Chrome + fresh profiles can trip account lockout policies).
  const order = process.platform === 'win32' ? [...c, ...shell, ...full, ...sys] : [...c, ...full, ...sys, ...shell];
  for (const p of order) if (p && fs.existsSync(p)) return p;
  die('No Chrome/Chromium found. Install Google Chrome, or run `npx playwright install chromium`, or set CHROME_PATH=/path/to/chrome.');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}${m.error.data ? ' — ' + m.error.data : ''}`));
        else p.res(m.result);
      } else if (m.method) for (const fn of this.handlers.get(m.method) || []) fn(m.params || {}, m.sessionId);
    };
    ws.onclose = () => { for (const p of this.pending.values()) p.rej(new Error('Chrome connection closed')); this.pending.clear(); };
  }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => res(new CDP(ws));
      ws.onerror = () => rej(new Error('could not connect to Chrome DevTools at ' + url));
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id, msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej, method }); this.ws.send(JSON.stringify(msg)); });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  off(method, fn) { const a = this.handlers.get(method) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
}

async function launchBrowser() {
  const bin = findChrome();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-chrome-'));
  const flags = [
    '--headless', '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-breakpad', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--run-all-compositor-stages-before-draw', '--disable-features=Translate,MediaRouter,OptimizationHints,PaintHolding,AutofillServerCommunication',
    '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
  ];
  if (args.gpu === 'off') flags.push('--disable-gpu');
  if (process.platform === 'linux' && (process.getuid?.() === 0 || process.env.MG_NO_SANDBOX)) flags.push('--no-sandbox');
  const proc = spawn(bin, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errBuf = '';
  const wsUrl = await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('Chrome did not start within 30 s:\n' + errBuf.slice(-1500))), 30000);
    proc.stderr.on('data', (d) => {
      errBuf = (errBuf + d).slice(-20000); // keep draining stderr so Chrome never blocks on a full pipe
      const m = errBuf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(to); res(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(to); rej(new Error(`Chrome (${bin}) exited with ${code}:\n` + errBuf.slice(-1500))); });
  });
  const cdp = await CDP.connect(wsUrl);
  const version = (await cdp.send('Browser.getVersion')).product;
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    try { await Promise.race([cdp.send('Browser.close'), new Promise((r) => setTimeout(r, 3000))]); } catch {}
    try { proc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
  };
  return { cdp, proc, bin, version, close };
}

class Page {
  constructor(browser, sessionId) { this.b = browser; this.cdp = browser.cdp; this.sid = sessionId; this.logs = []; }
  send(method, params) { return this.cdp.send(method, params, this.sid); }
  static async create(browser, { width, height, scale = 1 }) {
    const { targetId } = await browser.cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(browser, sessionId);
    p.targetId = targetId;
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Log.enable');
    await p.size(width, height, scale);
    const keep = (s) => { if (p.logs.length < 200) p.logs.push(s); };
    browser.cdp.on('Runtime.consoleAPICalled', (e, sid) => {
      if (sid !== sessionId || !['error', 'warning', 'assert'].includes(e.type)) return;
      keep(`console.${e.type}: ` + (e.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    });
    browser.cdp.on('Runtime.exceptionThrown', (e, sid) => { if (sid === sessionId) keep('exception: ' + (e.exceptionDetails?.exception?.description || e.exceptionDetails?.text)); });
    browser.cdp.on('Log.entryAdded', (e, sid) => { if (sid === sessionId && e.entry.level === 'error') keep(`${e.entry.source}: ${e.entry.text} ${e.entry.url || ''}`.trim()); });
    return p;
  }
  async size(width, height, scale = 1) {
    this.w = width; this.h = height; this.scale = scale;
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  }
  waitEvent(method, timeout = 60000) {
    return new Promise((res, rej) => {
      const fn = (params, sid) => { if (sid === this.sid) { this.cdp.off(method, fn); clearTimeout(to); res(params); } };
      const to = setTimeout(() => { this.cdp.off(method, fn); rej(new Error(`timeout waiting for ${method}`)); }, timeout);
      this.cdp.on(method, fn);
    });
  }
  async goto(url) {
    const loaded = this.waitEvent('Page.loadEventFired', 90000);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`navigation failed: ${r.errorText} (${url})`);
    await loaded;
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'evaluation failed');
    }
    return r.result ? r.result.value : undefined;
  }
  async waitReady(timeout = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.eval('window.__ready === true')) return;
      const errs = await this.eval('(window.__mgErrors || []).filter(e => e.startsWith("render error")).length');
      if (errs) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const errs = await this.eval('window.__mgErrors || []').catch(() => []);
    throw new Error('film never became ready (window.__ready)\n' + [...errs, ...this.logs].map((s) => '  ' + s).join('\n'));
  }
  async seek(t, info) { await this.eval(`window.seek(${t}${info ? ', ' + JSON.stringify(info) : ''})`); }
  async shot(format = 'png', quality = 92) {
    const p = { format, clip: { x: 0, y: 0, width: this.w, height: this.h, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: true, fromSurface: true };
    if (format === 'jpeg') p.quality = quality;
    const r = await this.send('Page.captureScreenshot', p);
    return Buffer.from(r.data, 'base64');
  }
  async setContent(html) {
    const { frameTree } = await this.send('Page.getFrameTree');
    const loaded = this.waitEvent('Page.loadEventFired', 30000).catch(() => {});
    await this.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await loaded;
  }
  close() { return this.b.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {}); }
}

/* ───────────────────────────── film session ───────────────────────────── */

async function openFilm(browser, srv, { scale = 1, sizeOverride } = {}) {
  const port = srv.address().port;
  const q = new URLSearchParams({ render: '1' });
  if (args.format) q.set('format', args.format);
  if (args.query) for (const kv of String(args.query).split('&')) { const [k, v = ''] = kv.split('='); q.set(k, v); }
  const url = `http://127.0.0.1:${port}/${args.page || 'index.html'}?${q}`;
  const page = await Page.create(browser, { width: 1920, height: 1080, scale: 1 });
  await page.goto(url);
  await page.waitReady();
  const film = await page.eval('JSON.parse(JSON.stringify(window.FILM || {}))');
  if (!film.width || !film.height) throw new Error('window.FILM is missing width/height — did the film call mount()?');
  const W = sizeOverride?.[0] || film.width, H = sizeOverride?.[1] || film.height;
  await page.size(W, H, scale);
  await page.seek(0);
  const errors = await page.eval('window.__mgErrors || []');
  return { page, film, errors, url };
}

const fmtT = (t) => t.toFixed(2).padStart(6, '0');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

/* ───────────────────────────── PNG decode (for checks) ───────────────────────────── */

function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12]) throw new Error('interlaced PNG'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`unsupported PNG (depth ${bitDepth}, type ${colorType})`);
  const bpp = colorType === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = cur[x * bpp + k];
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgb: out };
}
function imgStats(png) {
  const { w, h, rgb } = decodePNG(png);
  let s = 0, s2 = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) { const l = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]; s += l; s2 += l * l; }
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}
function imgDiff(a, b) {
  const A = decodePNG(a), B = decodePNG(b);
  if (A.w !== B.w || A.h !== B.h) return 255;
  let s = 0;
  for (let i = 0; i < A.rgb.length; i++) s += Math.abs(A.rgb[i] - B.rgb[i]);
  return s / A.rgb.length;
}

/* ───────────────────────────── contact sheets ───────────────────────────── */

async function composeSheets(browser, items, { title, outBase, cols = 4, cellW = 480, aspect, pageMaxH = 1900 }) {
  // items: [{png: Buffer, label: string, sub?: string}]
  const cellH = Math.round(cellW / aspect), labelH = 34, gap = 8, pad = 16, headH = 40;
  const rowH = cellH + labelH + gap;
  const rowsPerPage = Math.max(1, Math.floor((pageMaxH - headH - pad * 2) / rowH));
  const perPage = rowsPerPage * cols, pages = Math.ceil(items.length / perPage), files = [];
  const page = await Page.create(browser, { width: 800, height: 600, scale: 1 });
  for (let pi = 0; pi < pages; pi++) {
    const chunk = items.slice(pi * perPage, (pi + 1) * perPage);
    const rows = Math.ceil(chunk.length / cols);
    const W = pad * 2 + cols * cellW + (cols - 1) * gap, H = pad * 2 + headH + rows * rowH;
    const cells = chunk.map((it) => `<figure><img src="data:image/${it.mime || 'png'};base64,${it.png.toString('base64')}"><figcaption><b>${it.label}</b><span>${it.sub || ''}</span></figcaption></figure>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#101012;color:#e9e9ec;font:600 15px/1.2 ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace}
      .wrap{padding:${pad}px} h1{margin:0 0 ${headH - 26}px;font-size:18px;font-weight:700;letter-spacing:.02em;height:26px;white-space:nowrap;overflow:hidden}
      .grid{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${gap}px}
      figure{margin:0} img{display:block;width:${cellW}px;height:${cellH}px;object-fit:contain;background:#000;outline:1px solid #2b2b31}
      figcaption{height:${labelH}px;display:flex;gap:10px;align-items:center;white-space:nowrap;overflow:hidden}
      figcaption span{color:#9a9aa3;font-weight:500;overflow:hidden;text-overflow:ellipsis}
    </style></head><body><div class="wrap"><h1>${title}${pages > 1 ? ` — page ${pi + 1}/${pages}` : ''}</h1><div class="grid">${cells}</div></div></body></html>`;
    await page.size(W, H, 1);
    await page.setContent(html);
    await page.eval('Promise.all([...document.images].map(i => i.decode().catch(() => null)))');
    const png = await page.shot('png');
    const f = pages > 1 ? `${outBase}-${pi + 1}.png` : `${outBase}.png`;
    fs.writeFileSync(f, png);
    files.push(f);
  }
  await page.close();
  return files;
}

function frameLabel(film, t, sceneName) {
  const f = Math.round(t * film.fps);
  let s = '';
  if (film.bpm) {
    const spb = 60 / film.bpm, b = (t - (film.offset || 0)) / spb, bpb = film.beatsPerBar || 4;
    if (b >= 0) s = `bar ${Math.floor(b / bpb)}:${Math.floor(b % bpb)}`;
  }
  return { label: `${t.toFixed(2)}s  f${f}`, sub: [s, sceneName].filter(Boolean).join('  ') };
}

/* ───────────────────────────── commands ───────────────────────────── */

async function withFilm(fn, opts = {}) {
  if (!fs.existsSync(path.join(DIR, args.page || 'index.html'))) die(`no ${args.page || 'index.html'} in ${DIR} (use --dir)`);
  const srv = await startServer(DIR);
  const browser = await launchBrowser();
  const cleanup = async () => { await browser.close(); srv.close(); };
  process.once('SIGINT', async () => { await cleanup(); process.exit(130); });
  try {
    const f = await openFilm(browser, srv, opts);
    if (f.errors.length) { log('⚠ film reported problems:'); for (const e of f.errors) log('  - ' + e); }
    return await fn({ ...f, browser, srv });
  } finally { await cleanup(); }
}

function timesFromArgs(film, positional) {
  const d = film.duration, fps = film.fps;
  const clampT = (t) => Math.min(Math.max(0, t), d - 1 / fps);
  if (positional.length) return positional.flatMap((s) => String(s).split(',')).map(Number).filter(Number.isFinite).map(clampT);
  if (args.at) return String(args.at).split(',').map(Number).map(clampT);
  const from = num(args.from, 0), to = Math.min(num(args.to, d), d);
  if (args.beats && film.bpm) {
    const spb = 60 / film.bpm, every = num(args.beats === true ? 1 : args.beats, 1), out = [];
    for (let t = (film.offset || 0); t < to - 1e-6; t += spb * every) if (t >= from) out.push(clampT(t + 0.5 / fps));
    return out;
  }
  const every = num(args.every, Math.max(0.25, Math.round((d / 24) * 4) / 4)), out = [];
  for (let t = from; t < to - 1e-6; t += every) out.push(clampT(t));
  if (out[out.length - 1] < d - 1 / fps - 1e-6 && to >= d) out.push(clampT(d - 1 / fps));
  return out;
}

async function cmdStills() {
  await withFilm(async ({ page, film }) => {
    const dir = path.join(OUT, 'stills'); mkdir(dir);
    for (const t of timesFromArgs(film, args._.slice(1))) {
      await page.seek(t);
      const f = path.join(dir, `t${fmtT(t)}${args.format ? '-' + args.format : ''}.png`);
      fs.writeFileSync(f, await page.shot('png'));
      log(f);
    }
  });
}

async function cmdSheet(kind = 'sheet') {
  const scaleK = num(args.scale, 0.5);
  await withFilm(async ({ page, film, browser }) => {
    let times;
    if (kind === 'strip') {
      const c = Number(args._[1]);
      if (!Number.isFinite(c)) die('usage: strip <time> [--span 0.5] [--n 12]');
      const span = num(args.span, 0.5), n = num(args.n, 12);
      times = Array.from({ length: n }, (_, i) => Math.min(Math.max(0, c - span / 2 + (span * i) / (n - 1)), film.duration - 1 / film.fps));
    } else times = timesFromArgs(film, args._.slice(1));
    const items = [];
    for (const t of times) {
      await page.seek(t);
      const scene = await page.eval(`window.FILM && window.FILM.sceneAt ? window.FILM.sceneAt(${t}) : ''`).catch(() => '');
      items.push({ png: await page.shot('jpeg', 88), mime: 'jpeg', ...frameLabel(film, t, scene) });
    }
    const dir = path.join(OUT, 'sheets'); mkdir(dir);
    const name = args.name || (kind === 'strip' ? `strip-${fmtT(Number(args._[1]))}` : args.beats ? 'beats' : 'contact') + (args.format ? '-' + args.format : '');
    const cols = num(args.cols, kind === 'strip' ? 6 : film.width / film.height < 0.9 ? 6 : 4);
    const cellW = num(args.width, kind === 'strip' ? 320 : film.width / film.height < 0.9 ? 300 : 480);
    const what = kind === 'strip' ? `strip around ${args._[1]}s (${times.length} frames over ${num(args.span, 0.5)}s)` : `${times.length} frames`;
    const files = await composeSheets(browser, items, { title: `${film.title || 'film'} — ${film.width}×${film.height} @${film.fps} — ${what}`, outBase: path.join(dir, name), cols, cellW, aspect: film.width / film.height });
    for (const f of files) log(f);
  }, { scale: scaleK });
}

async function cmdCheck() {
  await withFilm(async ({ page, film, errors, browser, srv }) => {
    let problems = 0;
    const bad = (m) => { problems++; log('  ✗ ' + m); };
    const ok = (m) => log('  ✓ ' + m);
    log(`film: ${film.title || '(untitled)'} — ${film.width}×${film.height} @${film.fps}fps, ${film.duration}s${film.loop ? ', loop' : ''}${film.bpm ? `, ${film.bpm} BPM` : ''}`);
    log(`chrome: ${browser.version}`);

    log('\n1. Errors and fonts');
    if (errors.length) errors.forEach((e) => bad(e)); else ok('no film errors (fonts declared in film.json all render)');
    const fontInfo = await page.eval(`[...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.style + ': ' + f.status)`);
    const failed = fontInfo.filter((s) => s.endsWith('error'));
    if (failed.length) failed.forEach((s) => bad('font face failed to load: ' + s));
    else ok(`${fontInfo.filter((s) => s.endsWith('loaded')).length} webfont faces loaded`);
    if (page.logs.length) page.logs.slice(0, 20).forEach((l) => bad('page: ' + l)); else ok('no console errors or failed requests');

    log('\n2. Determinism (same frame in any order, on any page)');
    const d = film.duration, fps = film.fps, last = d - 1 / fps;
    const ts = [...new Set([0, d * 0.21, d * 0.5, d * 0.77, last, ...film.cuts.flatMap((c) => [c - 1 / fps, c]).slice(0, 8)].map((t) => +Math.min(Math.max(0, t), last).toFixed(4)))];
    const pass = async (pg, order) => { const h = {}; for (const t of order) { await pg.seek(t); h[t] = sha(await pg.shot('png')); } return h; };
    const scale = num(args.scale, 0.5);
    await page.size(film.width, film.height, scale);
    const asc = await pass(page, ts);
    const desc = await pass(page, [...ts].reverse());
    const fresh = (await openFilm(browser, srv, { scale })).page;
    const shuffled = ts.map((t, i) => [t, (i * 7919) % ts.length]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    const shuf = await pass(fresh, shuffled);
    await fresh.close();
    const diffs = ts.filter((t) => asc[t] !== desc[t] || asc[t] !== shuf[t]);
    if (diffs.length) bad(`frames differ by render order at t = ${diffs.join(', ')} → state leaks between frames: a property not written on every frame/branch, a counter, Math.random, Date/performance.now, timers, rAF, CSS transitions, or an image not yet decoded`);
    else ok(`${ts.length} frames identical across ascending, descending and shuffled renders on two pages`);

    log('\n3. Frames');
    await page.size(film.width, film.height, 0.25);
    await page.seek(0);
    const f0 = imgStats(await page.shot('png'));
    if (f0.std < 3) bad(`frame 0 is nearly blank (std ${f0.std.toFixed(1)}): the first frame is the thumbnail and the hook — show something`);
    else ok(`frame 0 has content (std ${f0.std.toFixed(1)})`);
    if (film.loop) {
      await page.seek(0); const a = await page.shot('png');
      await page.seek(d); const b = await page.shot('png');
      await page.seek(last); const c = await page.shot('png');
      const seam = imgDiff(a, b), step = imgDiff(c, a);
      if (seam > 1.5) bad(`loop seam: frame(duration) differs from frame(0) by ${seam.toFixed(2)}/255 — the last frame must return to the first`);
      else ok(`loop closes: frame(duration) ≈ frame(0) (diff ${seam.toFixed(2)}), last→first step ${step.toFixed(2)}`);
    }

    log('\n4. Lint (film code only: lib/ and tools/ are skipped)');
    const lintRules = [
      [/Math\.random\s*\(/, 'Math.random — use rng(seed) / hash(i)'],
      [/Date\.now\s*\(|new Date\s*\(|performance\.now\s*\(/, 'wall-clock time — derive everything from t'],
      [/\bsetTimeout\s*\(|\bsetInterval\s*\(|requestAnimationFrame\s*\(/, 'timers/rAF — the renderer drives time through seek(t)'],
      [/\btransition\s*:|\banimation\s*:|@keyframes/, 'CSS transitions/animations — compute styles from t instead'],
      [/will-change/, 'will-change — scaled layers rasterise once and go blurry'],
      [/fonts\.googleapis|https?:\/\/[^'")\s]+\.(woff2?|ttf|otf)/, 'remote font — bundle fonts locally (tools/fonts.mjs)'],
    ];
    const files = [];
    const walk = (dir) => { for (const n of fs.readdirSync(dir)) { if (/^(lib|tools|node_modules|out|\.git)$/.test(n)) continue; const p = path.join(dir, n); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (/\.(m?js|html|css)$/.test(n)) files.push(p); } };
    walk(DIR);
    let hits = 0;
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/mg-allow/.test(line)) return;
        for (const [re, why] of lintRules) if (re.test(line)) { hits++; if (hits <= 25) bad(`${path.relative(DIR, f)}:${i + 1}: ${why}`); }
      });
    }
    if (!hits) ok(`${files.length} files clean (add a // mg-allow comment to silence a deliberate line)`);

    log('\n5. Speed');
    await page.size(film.width, film.height, 1);
    const N = 10, timeIt = async (fn) => { const t0 = performance.now(); for (let i = 0; i < N; i++) await fn(i); return (performance.now() - t0) / N; };
    const seekMs = await timeIt((i) => page.seek((d * i) / N));
    const pngMs = await timeIt(async (i) => { await page.seek((d * i) / N); await page.shot('png'); }) - seekMs;
    const jpgMs = await timeIt(async (i) => { await page.seek((d * i) / N); await page.shot('jpeg', 95); }) - seekMs;
    const frames = Math.round(d * fps), sub = num(args.sub, 4), workers = num(args.workers, Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    ok(`seek ${seekMs.toFixed(0)} ms + capture ${pngMs.toFixed(0)} ms (png) / ${jpgMs.toFixed(0)} ms (jpeg) per frame at full res`);
    ok(`final at ${fps} fps × ${sub} subframes on ${workers} workers ≈ ${Math.ceil(((seekMs + pngMs) * frames * sub) / workers / 1000)} s (png) or ≈ ${Math.ceil(((seekMs + jpgMs) * frames * sub) / workers / 1000)} s with --capture jpeg`);
    if (seekMs > 60) log(`  ! seek takes ${seekMs.toFixed(0)} ms: something heavy runs per frame (DOM rebuilds, big canvases, layout thrash). Build once in setup, only write styles in render.`);

    log(problems ? `\n${problems} problem(s). Fix them before rendering the master.` : '\nAll checks passed.');
    process.exitCode = problems ? 1 : 0;
  });
}

function ffmpeg(argv, { input } = {}) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { p.on('error', (e) => rej(new Error('ffmpeg not found on PATH: ' + e.message))); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c)))); });
  return { p, done };
}
const writeAsync = (stream, buf) => new Promise((res, rej) => { stream.write(buf, (e) => (e ? rej(e) : res())); });

async function cmdVideo(mode) {
  const draft = mode === 'draft';
  if (!which('ffmpeg')) die('ffmpeg not found on PATH');
  const srv = await startServer(DIR);
  const probe = await launchBrowser();
  let film;
  try { film = (await openFilm(probe, srv)).film; } finally { await probe.close(); }
  const fps = num(args.fps, draft ? Math.min(30, film.fps) : film.fps);
  const scale = num(args.scale, draft ? 0.5 : 1);
  const sub = Math.max(1, Math.round(num(args.sub, draft ? 1 : 4)));
  const shutter = num(args.shutter, 0.5);
  const from = num(args.from, 0), to = Math.min(num(args.to, film.duration), film.duration);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps), total = f1 - f0;
  if (total <= 0) die('empty frame range');
  const workers = Math.max(1, Math.min(num(args.workers, draft ? 2 : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)))), total));
  const W = Math.round(film.width * scale), H = Math.round(film.height * scale);
  const cuts = film.cuts || [];
  const capFmt = args.capture || (draft ? 'jpeg' : 'png');
  const capQ = num(args.quality, draft ? 88 : 95);
  const tag = args.format ? '-' + args.format : '';
  const out = path.resolve(args.out || path.join(OUT, `${draft ? 'draft' : 'final'}${tag}${args.from || args.to ? `-${from}-${to}` : ''}.mp4`));
  mkdir(path.dirname(out));
  const audioArg = args.audio, audioDefault = path.join(OUT, 'audio.wav');
  const audio = audioArg === 'none' ? null : audioArg ? path.resolve(audioArg) : fs.existsSync(audioDefault) ? audioDefault : null;
  log(`${mode}: ${W}×${H} @${fps}fps, frames ${f0}–${f1} (${total}), ${sub > 1 ? `${sub} subframes, shutter ${shutter}` : 'no motion blur'}, ${workers} worker(s)${audio ? ', audio ' + path.relative(DIR, audio) : ', silent'}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-render-'));
  const t0 = performance.now();
  let done = 0;
  const chunk = Math.ceil(total / workers), segs = [];
  const sampleTime = (f, s) => {
    const tc = f / fps;
    if (sub === 1) return tc;
    let ts = (f + shutter * ((s + 0.5) / sub - 0.5)) / fps;
    for (const c of cuts) { if (tc >= c && ts < c) ts = c; if (tc < c && ts >= c) ts = c - 1e-4; } // never blend across a hard cut
    return Math.min(Math.max(0, ts), film.duration - 1e-4);
  };
  const runWorker = async (w) => {
    const a = f0 + w * chunk, b = Math.min(f1, a + chunk);
    if (a >= b) return;
    const seg = path.join(tmp, `seg${String(w).padStart(3, '0')}.mkv`);
    segs[w] = seg;
    const browser = await launchBrowser();
    try {
      const { page } = await openFilm(browser, srv, { scale });
      const vf = sub > 1 ? `tmix=frames=${sub},select='eq(mod(n\\,${sub})\\,${sub - 1})',setpts=N/(${fps}*TB)` : 'null';
      const ff = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps * sub), '-c:v', capFmt === 'png' ? 'png' : 'mjpeg', '-i', '-', '-vf', vf, '-r', String(fps), '-c:v', 'ffv1', '-level', '3', '-threads', '2', '-pix_fmt', 'bgr0', seg], { input: true });
      for (let f = a; f < b; f++) {
        for (let s = 0; s < sub; s++) {
          await page.seek(sampleTime(f, s), { frame: f, sub: s, subs: sub });
          await writeAsync(ff.p.stdin, await page.shot(capFmt, capQ));
        }
        done++;
        if (done % Math.max(1, Math.round(fps)) === 0 || done === total) {
          const el = (performance.now() - t0) / 1000, eta = (el / done) * (total - done);
          log(`  ${done}/${total} frames  ${el.toFixed(0)}s elapsed  ~${eta.toFixed(0)}s left`);
        }
      }
      ff.p.stdin.end();
      await ff.done;
      if (page.logs.length) { log(`  worker ${w} page messages:`); page.logs.slice(0, 10).forEach((l) => log('    ' + l)); }
    } finally { await browser.close(); }
  };
  try {
    await Promise.all(Array.from({ length: workers }, (_, w) => runWorker(w)));
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    const evenW = W % 2 ? W + 1 : W, evenH = H % 2 ? H + 1 : H;
    const vf = `pad=${evenW}:${evenH},scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p`;
    const enc = ['-f', 'concat', '-safe', '0', '-i', list];
    if (audio) enc.push('-ss', String(from), '-i', audio);
    enc.push('-map', '0:v:0');
    if (audio) enc.push('-map', '1:a:0', '-af', 'apad', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    enc.push('-vf', vf, '-c:v', 'libx264', '-preset', args.preset || (draft ? 'veryfast' : 'slow'), '-crf', String(num(args.crf, draft ? 22 : 16)),
      '-tune', 'animation', '-x264-params', 'aq-mode=3', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-r', String(fps), '-t', (total / fps).toFixed(6), '-movflags', '+faststart', out);
    await ffmpeg(enc).done;
    const secs = (performance.now() - t0) / 1000;
    const meta = { out: path.relative(DIR, out), mode, width: W, height: H, fps, frames: total, from, to, sub, shutter, workers, audio: audio ? path.relative(DIR, audio) : null, seconds: +secs.toFixed(1), msPerFrame: +((secs * 1000) / total).toFixed(1), renderedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(OUT, `render-${draft ? 'draft' : 'final'}${tag}.json`), JSON.stringify(meta, null, 2));
    log(`✓ ${out}  (${secs.toFixed(1)} s, ${meta.msPerFrame} ms/frame)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    srv.close();
  }
}

/* ───────────────────────────── inspect a rendered video ───────────────────────────── */

function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) die('ffprobe failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}
function readGrayFrames(file, w, h, fps) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) die('ffmpeg decode failed: ' + r.stderr);
  const n = Math.floor(r.stdout.length / (w * h)), frames = [];
  for (let i = 0; i < n; i++) frames.push(r.stdout.subarray(i * w * h, (i + 1) * w * h));
  return frames;
}

async function cmdInspect() {
  const file = path.resolve(args._[1] || path.join(OUT, 'final.mp4'));
  if (!fs.existsSync(file)) die('no video at ' + file);
  const pr = ffprobe(file);
  const v = pr.streams.find((s) => s.codec_type === 'video'), a = pr.streams.find((s) => s.codec_type === 'audio');
  const [fn, fd] = (v.avg_frame_rate || v.r_frame_rate).split('/').map(Number);
  const fps = fd ? fn / fd : fn, dur = Number(pr.format.duration);
  const m = { file: path.relative(DIR, file), width: v.width, height: v.height, fps: +fps.toFixed(3), duration: +dur.toFixed(3), frames: Number(v.nb_frames) || Math.round(dur * fps), codec: v.codec_name, pix_fmt: v.pix_fmt, audio: !!a };
  const findings = [];
  // Motion energy at analysis rate (all frames, ≤ 60 fps) on a small gray proxy.
  const aw = 160, ah = Math.max(2, Math.round((160 * v.height) / v.width / 2) * 2), afps = Math.min(60, Math.round(fps));
  const frames = readGrayFrames(file, aw, ah, afps);
  const diff = [0];
  for (let i = 1; i < frames.length; i++) { let s = 0; const A = frames[i], B = frames[i - 1]; for (let k = 0; k < A.length; k++) s += Math.abs(A[k] - B[k]); diff.push(s / A.length); }
  const luma = frames.map((f) => f.reduce((s, x) => s + x, 0) / f.length);
  // Dead spans: almost no change for ≥ 0.6 s (holds are fine when intended — say so in the brief).
  const deadThr = 0.12, minDead = Math.round(0.6 * afps), dead = [];
  for (let i = 1, run = 0; i <= diff.length; i++) {
    if (i < diff.length && diff[i] < deadThr) run++;
    else { if (run >= minDead) dead.push([(i - run) / afps, i / afps]); run = 0; }
  }
  // Pops: a single-frame spike far above its neighbourhood (a cut is fine; a jump inside a move is not).
  const pops = [];
  for (let i = 2; i < diff.length - 2; i++) {
    const nb = [diff[i - 2], diff[i - 1], diff[i + 1], diff[i + 2]].sort((x, y) => x - y), med = (nb[1] + nb[2]) / 2;
    if (diff[i] > 6 && diff[i] > 5 * Math.max(med, 0.4)) pops.push(+(i / afps).toFixed(3));
  }
  const black = luma.map((l, i) => [l, i]).filter(([l]) => l < 4).map(([, i]) => i);
  // Per-second energy sparkline helps spot flat stretches and the rhythm of the edit.
  const perSec = [];
  for (let s = 0; s < Math.ceil(frames.length / afps); s++) { const sl = diff.slice(s * afps, (s + 1) * afps); perSec.push(sl.reduce((x, y) => x + y, 0) / Math.max(1, sl.length)); }
  const maxE = Math.max(...perSec, 1e-6), bars = '▁▂▃▄▅▆▇█';
  m.energy = perSec.map((e) => +e.toFixed(2));
  m.energySparkline = perSec.map((e) => bars[Math.min(7, Math.floor((e / maxE) * 7.999))]).join('');
  m.deadSpans = dead.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
  m.pops = pops;
  m.blackFrames = black.length;
  m.firstFrameBlank = luma[0] < 4 || frames[0].every((x) => Math.abs(x - frames[0][0]) < 3);
  m.loopSeam = +((() => { const A = frames[0], B = frames[frames.length - 1]; let s = 0; for (let k = 0; k < A.length; k++) s += Math.abs(A[k] - B[k]); return s / A.length; })()).toFixed(2);
  if (m.firstFrameBlank) findings.push('P1 first frame is blank/flat — it is the thumbnail and the hook');
  for (const [x, y] of m.deadSpans) findings.push(`P1 dead span ${x}–${y}s: almost nothing moves for ${(y - x).toFixed(1)}s (fine only if it is a deliberate hold)`);
  if (pops.length) findings.push(`P1 possible pops/jumps at ${pops.slice(0, 12).join(', ')}s — check with a strip; fine if they are intended hard cuts`);
  if (black.length > 1) findings.push(`P2 ${black.length} near-black frames (fine if intended)`);
  // Audio: loudness and true peak.
  if (a) {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const txt = r.stderr || '';
    const I = txt.match(/I:\s+(-?[\d.]+) LUFS/g), TP = txt.match(/Peak:\s+(-?[\d.]+) dBFS/g);
    m.loudnessLUFS = I ? Number(I[I.length - 1].match(/-?[\d.]+/)[0]) : null;
    m.truePeakDBTP = TP ? Number(TP[TP.length - 1].match(/-?[\d.]+/)[0]) : null;
    if (m.loudnessLUFS != null && Math.abs(m.loudnessLUFS + 14) > 1.5) findings.push(`P2 loudness ${m.loudnessLUFS} LUFS (target −14 ±1 for social/web)`);
    if (m.truePeakDBTP != null && m.truePeakDBTP > -0.5) findings.push(`P1 true peak ${m.truePeakDBTP} dBTP (keep ≤ −1)`);
    const sil = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-'], { encoding: 'utf8' });
    const starts = [...(sil.stderr || '').matchAll(/silence_start: (-?[\d.]+)/g)].map((x) => Number(x[1]));
    const ends = [...(sil.stderr || '').matchAll(/silence_end: (-?[\d.]+)/g)].map((x) => Number(x[1]));
    m.silences = starts.map((s, i) => [+s.toFixed(2), +(ends[i] ?? dur).toFixed(2)]);
    for (const [s, e] of m.silences) if (s > 0.3 && e < dur - 1) findings.push(`P1 audio is silent ${s}–${e}s`);
  } else findings.push('P2 no audio track (fine only if the brief says silent)');
  m.findings = findings;
  const dir = path.join(OUT, 'review'); mkdir(dir);
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(m, null, 2));
  log(`${m.file}: ${m.width}×${m.height} @${m.fps}fps, ${m.duration}s, ${m.frames} frames, ${m.codec}/${m.pix_fmt}${a ? `, audio ${m.loudnessLUFS} LUFS / ${m.truePeakDBTP} dBTP` : ', no audio'}`);
  log(`energy/s: ${m.energySparkline}`);
  log(findings.length ? findings.map((f) => '  - ' + f).join('\n') : '  no automatic findings (the critic still has to look)');
  // Contact sheet from the actual encoded video (what viewers will see).
  const every = num(args.every, Math.max(0.25, Math.round((dur / 24) * 4) / 4));
  const times = []; for (let t = 0; t < dur - 1e-6; t += every) times.push(t);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-inspect-'));
  const items = [];
  for (const t of times) {
    const f = path.join(tmp, `f${times.indexOf(t)}.jpg`);
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3', f]);
    if (fs.existsSync(f)) items.push({ png: fs.readFileSync(f), mime: 'jpeg', label: `${t.toFixed(2)}s`, sub: `f${Math.round(t * fps)}` });
  }
  const browser = await launchBrowser();
  try {
    const files = await composeSheets(browser, items, { title: `${path.basename(file)} — every ${every}s (from the encoded video)`, outBase: path.join(dir, 'video-contact'), cols: v.width / v.height < 0.9 ? 6 : 4, cellW: v.width / v.height < 0.9 ? 300 : 480, aspect: v.width / v.height });
    for (const f of files) log(f);
  } finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  log(path.join(dir, 'metrics.json'));
}

async function cmdServe() {
  const port = num(args.port, 4173);
  const srv = await startServer(DIR, port);
  log(`preview: http://127.0.0.1:${srv.address().port}/${args.page || 'index.html'}   (space play/pause, ←/→ frame, shift = 1 s, [ ] beats, G safe-area guides)`);
  log('Ctrl+C to stop.');
}

const commands = { check: cmdCheck, stills: cmdStills, sheet: () => cmdSheet('sheet'), strip: () => cmdSheet('strip'), draft: () => cmdVideo('draft'), final: () => cmdVideo('final'), inspect: cmdInspect, serve: cmdServe };
if (!commands[cmd]) die(`unknown command "${cmd}". Run with --help.`);
commands[cmd]().catch((e) => { console.error('✗ ' + (e && e.stack ? e.stack : e)); process.exit(1); });
