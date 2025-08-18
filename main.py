import os, re, base64
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import asyncio

from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo, FSInputFile
from aiogram.enums.parse_mode import ParseMode
from aiogram.filters import Command

from models import UploadRequest, UploadResponse
from db import save_drawing, list_drawings, list_all_drawings, cleanup_old_drawings

load_dotenv()
BOT_TOKEN = os.environ.get("BOT_TOKEN")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "http://localhost:8000/")
MONITOR_CHAT_ID = os.environ.get("MONITOR_CHAT_ID")
ADMIN_IDS = os.environ.get("ADMIN_IDS", "")
CLEANUP_DAYS = int(os.environ.get("CLEANUP_DAYS", "10"))

admin_ids = set()
if ADMIN_IDS:
    for part in ADMIN_IDS.split(','):
        try:
            admin_ids.add(int(part.strip()))
        except Exception:
            pass

if not BOT_TOKEN:
    raise RuntimeError("Не задан BOT_TOKEN в .env")

app = FastAPI(title="Telegram Paint Bot")
app.mount("/static", StaticFiles(directory="web"), name="static")

@app.on_event("startup")
async def startup_event():
    loop = asyncio.get_event_loop()
    loop.create_task(background_cleanup())

async def background_cleanup():
    try:
        cleanup_old_drawings(days=CLEANUP_DAYS)
    except Exception:
        pass
    while True:
        await asyncio.sleep(24 * 3600)
        try:
            cleanup_old_drawings(days=CLEANUP_DAYS)
        except Exception:
            pass

@app.get("/", response_class=HTMLResponse)
def index():
    with open("web/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/upload", response_model=UploadResponse)
async def upload(req: UploadRequest, request: Request, background: BackgroundTasks):
    match = re.match(r"^data:image/\w+;base64,(.+)$", req.image_data)
    if not match:
        raise HTTPException(400, "Неверный формат image_data")
    try:
        raw = base64.b64decode(match.group(1))
    except Exception:
        raise HTTPException(400, "Не удалось декодировать base64")

    # простая схема: пока не используем initData — user_id = 0, можно улучшить позже
    user_id = int(request.headers.get("X-TG-User-Id", "0")) or 0
    username = request.headers.get("X-TG-Username", None)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    file_name = f"storage/draw_{ts}.png"
    with open(file_name, "wb") as f:
        f.write(raw)

    rec_id = save_drawing(user_id=user_id, username=username, file_path=file_name, brush=req.brush, size=req.size, color=req.color)

    if MONITOR_CHAT_ID:
        background.add_task(send_to_monitor, file_name, rec_id)

    return UploadResponse(ok=True, id=rec_id, url=f"{BASE_URL}/{file_name}")

@app.get("/storage/{name}")
async def get_image(name: str):
    path = os.path.join("storage", name)
    if not os.path.exists(path):
        raise HTTPException(404, "Файл не найден")
    return FileResponse(path, media_type="image/png")

bot = Bot(BOT_TOKEN, parse_mode=ParseMode.HTML)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: Message):
    kb = ReplyKeyboardMarkup(resize_keyboard=True, keyboard=[
        [KeyboardButton(text="Открыть холст 🎨", web_app=WebAppInfo(url=WEBAPP_URL))],
        [KeyboardButton(text="Мои рисунки 🖼")]
    ])
    await message.answer(
        "Привет! Это мини-Пейнт. Нажми кнопку <b>Открыть холст</b>, порисуй и нажми <b>Сохранить</b>.",
        reply_markup=kb
    )

@dp.message(F.text.lower() == "мои рисунки 🖼")
async def my_drawings(message: Message):
    if message.from_user.id in admin_ids:
        rows = list_all_drawings(limit=3)
    else:
        rows = list_drawings(user_id=message.from_user.id, limit=3)
    if not rows:
        await message.answer("Пока пусто. Нарисуй что-нибудь и нажми <b>Сохранить</b> в холсте ✨")
        return
    for row in rows[:3]:
        try:
            photo = FSInputFile(row.file_path)
            cap = f"id: <code>{row.id}</code> | кисть: {row.brush} | размер: {row.size} | цвет: {row.color}"
            await message.answer_photo(photo, caption=cap)
        except Exception:
            await message.answer(f"id {row.id}: (файл не найден) {row.file_path}")

async def send_to_monitor(file_path: str, rec_id: int):
    try:
        if not MONITOR_CHAT_ID:
            return
        await bot.send_photo(chat_id=int(MONITOR_CHAT_ID), photo=FSInputFile(file_path), caption=f"Новый рисунок id={rec_id}")
    except Exception as e:
        print('send_to_monitor failed', e)

async def run_bot():
    print("Bot polling started…")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    async def main_async():
        loop = asyncio.get_running_loop()
        bot_task = loop.create_task(run_bot())
        config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
        server = uvicorn.Server(config)
        api_task = loop.create_task(server.serve())
        await asyncio.gather(bot_task, api_task)
    asyncio.run(main_async())
