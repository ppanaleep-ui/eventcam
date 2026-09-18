#!/usr/bin/env python3
"""Regenerate the card artwork from the original scans and mockups.

    python3 art/build.py <folder-with-the-five-source-images>

Everything the page displays is the couple's own printed artwork; this script only
cuts it into the pieces the animation needs.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.dirname(os.path.abspath(__file__))
COVERS, INSIDE, ENVELOPE, MOCKUP = (
    "def9d4f8-image.jpg", "1c36e050-image.jpg", "0b7becef-image.jpg", "704cf45b-image.jpg")

def save(im, name, q=90):
    im.save(os.path.join(OUT, name), "WEBP", quality=q, method=6)
    print(name, im.size)

# ── the printed spreads, split at the fold ──────────────────────────────
cov = Image.open(os.path.join(SRC, COVERS)).convert("RGB"); w, h = cov.size
save(cov.crop((766, 0, w, h)), "cover-front.webp")
save(cov.crop((0, 0, 766, h)), "cover-back.webp")

ins = Image.open(os.path.join(SRC, INSIDE)).convert("RGB"); w, h = ins.size
save(ins.crop((0, 0, 765, h)), "inside-left.webp")
save(ins.crop((765, 0, w, h)), "inside-right.webp")

# ── the envelope, split along the flap seam (found by tracing its diagonal) ──
env = Image.open(os.path.join(SRC, ENVELOPE)).convert("RGB"); W, H = env.size
SIDE_Y, POINT_Y = 170, 633
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).polygon([(0, 0), (W, 0), (W, SIDE_Y), (W / 2, POINT_Y), (0, SIDE_Y)], fill=255)
soft = mask.filter(ImageFilter.GaussianBlur(0.8))

flap = env.convert("RGBA"); flap.putalpha(soft)
save(flap.crop((0, 0, W, POINT_Y + 4)), "env-flap.webp")

grad = np.zeros((H, W, 3), np.uint8)                    # warm paper falling into shadow
t = np.clip(np.linspace(0, 1, H)[:, None] * 1.75, 0, 1)
for i, (a, b) in enumerate(((0xb6, 0xea), (0xab, 0xe3), (0x93, 0xd2))):
    grad[..., i] = (a + (b - a) * t).astype(np.uint8)
save(Image.composite(Image.fromarray(grad), env, soft), "env-body.webp")

# ── the paper lily layer, masked out of the mockup photograph ───────────
im = Image.open(os.path.join(SRC, MOCKUP)).convert("RGB")
a = np.asarray(im).astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]
m = (((R - G > 13) & (B - G > -2) & (R > 165)) * 255).astype(np.uint8)
mk = Image.fromarray(m).filter(ImageFilter.MaxFilter(9)).filter(
    ImageFilter.MinFilter(13)).filter(ImageFilter.MaxFilter(7))
arr = np.asarray(mk).copy(); arr[:, :860] = 0          # keep the cluster on the card
mk = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(1.6))

lily = im.convert("RGBA"); lily.putalpha(mk)
la = np.asarray(lily).astype(int)
show_through = ((la[..., 0] - la[..., 1]) < 13) & (la[..., 3] > 120) & (la[..., 0] < 215)
t2 = Image.fromarray((show_through * 255).astype(np.uint8)).filter(
    ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))
patch = im.filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.GaussianBlur(5))
clean = Image.composite(patch, im, t2).convert("RGBA")  # drop the names showing through
clean.putalpha(mk)

ys, xs = np.nonzero(np.asarray(mk) > 24)
save(clean.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).transpose(
    Image.FLIP_LEFT_RIGHT), "lily.webp", 92)
