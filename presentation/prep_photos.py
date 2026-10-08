"""Crop and grade the source photos in photos/src/ to the exact frames used by
build_deck.js, writing the results to photos/. A missing source is skipped and
the slide falls back to an empty photo frame.

Usage: python3 prep_photos.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps

HERE = Path(__file__).parent
SRC = HERE / "photos" / "src"
OUT = HERE / "photos"
ROSE = (196, 139, 156)
CHARCOAL = (43, 42, 46)


def crop_to(img, w, h, fx=0.5, fy=0.5):
    """Crop img to aspect w:h, keeping the point (fx, fy) as centred as possible."""
    target = w / h
    iw, ih = img.size
    if iw / ih > target:
        nw = round(ih * target)
        x = round((iw - nw) * fx)
        return img.crop((x, 0, x + nw, ih))
    nh = round(iw / target)
    y = round((ih - nh) * fy)
    return img.crop((0, y, iw, y + nh))


def tint(img, color, strength):
    """Duotone-style grade: greyscale, then blend toward a colour."""
    grey = ImageOps.grayscale(img).convert("RGB")
    return Image.blend(grey, Image.new("RGB", grey.size, color), strength)


def arch(img, w, h, scale=200):
    """Round-topped (arched) cut-out with a transparent background."""
    img = crop_to(img, w, h).resize((round(w * scale), round(h * scale)), Image.LANCZOS).convert("RGBA")
    W, H = img.size
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, W, W), fill=255)
    d.rectangle((0, W // 2, W, H), fill=255)
    img.putalpha(mask)
    return img


def arch_outline(w, h, color, width_px=6, scale=200):
    W, H = round(w * scale), round(h * scale)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    half = width_px // 2
    d.arc((half, half, W - half, W - half), 180, 360, fill=color, width=width_px)
    d.line((half, W // 2, half, H), fill=color, width=width_px)
    d.line((W - half - 1, W // 2, W - half - 1, H), fill=color, width=width_px)
    return im


def src(name):
    p = SRC / name
    return Image.open(p).convert("RGB") if p.exists() else None


def save(img, name):
    img.save(OUT / name, quality=92)
    print("wrote", name, img.size)


def main():
    b = src("building_podsosensky_20.jpg")
    if b:
        graded = ImageEnhance.Contrast(tint(b, ROSE, 0.10)).enhance(1.1)
        save(arch(graded, 5.2, 6.4), "title_arch.png")
        save(arch_outline(5.7, 7.0, ROSE + (255,)), "title_arch_outline.png")
        dark = ImageEnhance.Brightness(tint(b, CHARCOAL, 0.15)).enhance(0.8)
        save(crop_to(dark, 5.433, 7.5, fy=0.4), "war_building.jpg")
        save(crop_to(dark, 5.2, 7.5, fx=0.75, fy=0.2), "closing_building.jpg")

    d = src("diploma_1931.jpg")
    if d:
        save(d, "diploma.jpg")

    for name in ("shulgin", "savrasova", "allakhverdyan"):
        p = src(f"director_{name}.jpg")
        if p:
            save(crop_to(ImageOps.grayscale(p).convert("RGB"), 0.95, 1.25, fy=0.3), f"dir_{name}.jpg")

    g = src("literature_group_1933.jpg")
    if g:
        save(crop_to(g, 6.933, 7.5, fx=0.5), "faculties_group1933.jpg")
        save(crop_to(ImageEnhance.Brightness(g).enhance(0.85), 5.2, 7.5, fx=0.45), "closing_group1933.jpg")

    c = src("chemistry_students_1931.jpg")
    if c:
        save(crop_to(c, 6.933, 7.5, fx=0.35), "faculties_chem1931.jpg")

    u = src("uzboy_expedition.jpg")
    if u:
        save(crop_to(u, 4.68, 3.5, fx=0.7), "growth_uzboy.jpg")

    r = src("rybakov_excavations.jpg")
    if r:
        save(crop_to(r, 4.73, 2.95), "steps_rybakov.jpg")

    for name in ("rubinstein", "porshnev"):
        p = src(f"professor_{name}.jpg")
        if p:
            save(crop_to(ImageOps.grayscale(p).convert("RGB"), 2.1, 2.8, fy=0.2), f"prof_{name}.jpg")


if __name__ == "__main__":
    main()
