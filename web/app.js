const tg = window.Telegram?.WebApp;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const colorInput = document.getElementById('color');
const sizeInput = document.getElementById('size');
const brushSelect = document.getElementById('brush');
const eraser = document.getElementById('eraser');
const clearBtn = document.getElementById('clear');
const saveBtn = document.getElementById('save');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const pickerBtn = document.getElementById('picker');

let drawing = false;
let lastX = 0, lastY = 0;
const undoStack = [];
const redoStack = [];
const MAX_STACK = 20;

function pushUndo() {
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.push(img);
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack.length = 0;
  } catch (e) { console.warn('pushUndo failed', e); }
}
function doUndo() { if (!undoStack.length) return; try { const img = undoStack.pop(); const cur = ctx.getImageData(0,0,canvas.width,canvas.height); redoStack.push(cur); ctx.putImageData(img, 0, 0); } catch (e) { console.warn(e); } }
function doRedo() { if (!redoStack.length) return; try { const img = redoStack.pop(); const cur = ctx.getImageData(0,0,canvas.width,canvas.height); undoStack.push(cur); ctx.putImageData(img, 0, 0); } catch (e) { console.warn(e); } }

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const shortSide = Math.min(rect.width, rect.height) * dpr;
  const scaleFactor = 1080 / shortSide;
  canvas.width = Math.floor(rect.width * dpr * scaleFactor);
  canvas.height = Math.floor(rect.height * dpr * scaleFactor);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(scaleFactor * dpr, scaleFactor * dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorInput.value;
  ctx.lineWidth = parseInt(sizeInput.value, 10);
}

function setComposite() { ctx.globalCompositeOperation = eraser.checked ? 'destination-out' : 'source-over'; }
function setBrush() { const brush = brushSelect.value; if (brush === 'round') { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; } else { ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; } }

function startDraw(x, y) { pushUndo(); drawing = true; lastX = x; lastY = y; }
function draw(x, y) { if (!drawing) return; setComposite(); setBrush(); ctx.strokeStyle = colorInput.value; ctx.lineWidth = parseInt(sizeInput.value, 10); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke(); lastX = x; lastY = y; }
function stopDraw() { drawing = false; }

canvas.addEventListener('mousedown', (e) => startDraw(e.offsetX, e.offsetY));
canvas.addEventListener('mousemove', (e) => draw(e.offsetX, e.offsetY));
window.addEventListener('mouseup', stopDraw);

canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; const rect = canvas.getBoundingClientRect(); startDraw(t.clientX - rect.left, t.clientY - rect.top); }, { passive: true });
canvas.addEventListener('touchmove', (e) => { const t = e.touches[0]; const rect = canvas.getBoundingClientRect(); draw(t.clientX - rect.left, t.clientY - rect.top); }, { passive: true });
window.addEventListener('touchend', stopDraw);

window.addEventListener('resize', () => { try { const img = ctx.getImageData(0, 0, canvas.width, canvas.height); resizeCanvas(); ctx.putImageData(img, 0, 0); } catch(e) { resizeCanvas(); } });
resizeCanvas();

clearBtn.addEventListener('click', () => { if (confirm('Точно очистить холст?')) { pushUndo(); ctx.clearRect(0, 0, canvas.width, canvas.height); } });
undoBtn.addEventListener('click', doUndo);
redoBtn.addEventListener('click', doRedo);

let picking = false;
pickerBtn.addEventListener('click', () => { picking = !picking; pickerBtn.style.outline = picking ? '2px solid #4caf50' : 'none'; });
canvas.addEventListener('click', (e) => {
  if (!picking) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  try {
    const p = ctx.getImageData(x * (canvas.width / rect.width), y * (canvas.height / rect.height), 1, 1).data;
    const hex = '#' + ([p[0], p[1], p[2]].map(v => v.toString(16).padStart(2,'0')).join(''));
    colorInput.value = hex;
  } catch (err) { console.warn('pipette fail', err); }
  picking = false; pickerBtn.style.outline = 'none';
});

async function saveImage() {
  const dataUrl = canvas.toDataURL('image/png');
  const payload = { image_data: dataUrl, brush: brushSelect.value, size: parseInt(sizeInput.value, 10), color: colorInput.value };
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = await r.json();
    if (json.ok) { alert('Сохранено!'); if (tg) tg.HapticFeedback?.notificationOccurred('success'); } else { alert('Ошибка сохранения'); }
  } catch (e) {
    alert('Не удалось сохранить: ' + e);
  }
}
saveBtn.addEventListener('click', saveImage);

if (tg) { tg.expand(); }
