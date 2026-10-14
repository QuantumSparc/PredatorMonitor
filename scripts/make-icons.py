"""Draws the app icons (assets/icon.png, tray.png, icon.ico) — a glowing ring with a pulse line.

Usage: python scripts/make-icons.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

MAUVE = (203, 166, 247)
SAPPHIRE = (116, 199, 236)
PINK = (245, 194, 231)
BASE = (17, 17, 27)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw(size):
    s = size * 4  # supersample
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = s * 0.06
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=s * 0.24, fill=BASE + (255,))
    # gradient ring
    cx = cy = s / 2
    r = s * 0.31
    w = max(2, int(s * 0.075))
    steps = 360
    for i in range(steps):
        a0 = math.radians(i - 90)
        t = i / steps
        col = lerp(MAUVE, SAPPHIRE, t * 2) if t < 0.5 else lerp(SAPPHIRE, PINK, (t - 0.5) * 2)
        x = cx + r * math.cos(a0)
        y = cy + r * math.sin(a0)
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col + (255,))
    # pulse line
    pts = [(-0.24, 0), (-0.1, 0), (-0.04, -0.17), (0.04, 0.17), (0.1, 0), (0.24, 0)]
    line = [(cx + px * s, cy + py * s) for px, py in pts]
    d.line(line, fill=(205, 214, 244, 255), width=max(2, int(s * 0.05)), joint='curve')
    glow = img.filter(ImageFilter.GaussianBlur(s * 0.02))
    out = Image.alpha_composite(glow, img)
    return out.resize((size, size), Image.LANCZOS)


big = draw(256)
big.save(os.path.join(OUT, 'icon.png'))
draw(32).save(os.path.join(OUT, 'tray.png'))
big.save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icons written to', os.path.abspath(OUT))
