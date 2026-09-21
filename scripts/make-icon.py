#!/usr/bin/env python3
"""Regenerate the favicon and the iOS home-screen icon from the client logo.

    python3 scripts/make-icon.py

Writes assets/img/favicon.png (circular, transparent outside the badge) and
assets/img/icon-180.png (opaque pine tile for apple-touch-icon, which iOS
composites onto black if it has an alpha channel).

The monogram artwork is lifted straight out of assets/img/mono.webp rather
than redrawn. That file is the client's oval badge: a cream field, a gold
hairline just inside the edge, and the T/C monogram in the middle. We mask
out an ellipse that sits *inside* the hairline, so what we paste is only
cream plus monogram, then set it on a cream disc of the same cream. The
seam is invisible because both are the same colour, and the monogram keeps
its original antialiasing.

Requires Pillow:  pip install pillow
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "assets", "img")

# Sampled from the logo, matching the CSS tokens in assets/css/site.css.
PAPER = (244, 241, 233)   # the cream field of mono.webp, used for the disc
BRASS = (216, 204, 168)   # --brass-soft, the hairline around the badge
PINE = (23, 48, 15)       # --pine, the field behind the iOS icon

# Geometry of assets/img/mono.webp (188x310).
BADGE_C = (94, 155)       # centre of the oval
BADGE_R = (81, 140)       # semi-axes of an ellipse safely inside the hairline
GLYPH = (24, 90, 147, 243)  # monogram bounding box, right/bottom exclusive

SS = 8                    # supersampling factor
GLYPH_FRAC = 0.74         # monogram height as a fraction of the disc diameter
RING_INSET = 0.035        # hairline inset from the disc edge, as a fraction


def monogram_on_cream():
    """The inside of the badge: cream plus monogram, no hairline, no oval edge."""
    src = Image.open(os.path.join(IMG, "mono.webp")).convert("RGBA")
    mask = Image.new("L", src.size, 0)
    ImageDraw.Draw(mask).ellipse(
        [BADGE_C[0] - BADGE_R[0], BADGE_C[1] - BADGE_R[1],
         BADGE_C[0] + BADGE_R[0], BADGE_C[1] + BADGE_R[1]], fill=255)
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    return out


def disc(size, field, transparent_outside):
    """Render the circular badge at `size` px."""
    d = size * SS
    canvas = Image.new("RGBA", (d, d), field + (255,))

    inner = monogram_on_cream()
    scale = (GLYPH_FRAC * d) / (GLYPH[3] - GLYPH[1])
    inner = inner.resize((max(1, round(inner.width * scale)),
                          max(1, round(inner.height * scale))), Image.LANCZOS)

    # Land the monogram's bounding box dead centre on the disc.
    gx = (GLYPH[0] + GLYPH[2]) / 2 * scale
    gy = (GLYPH[1] + GLYPH[3]) / 2 * scale
    canvas.alpha_composite(inner, (round(d / 2 - gx), round(d / 2 - gy)))

    # The hairline goes on last: the pasted ellipse is taller than the disc
    # and would otherwise cover it at the top and bottom.
    ring_px = max(1.0, size * 0.012) * SS
    inset = RING_INSET * d
    ImageDraw.Draw(canvas).ellipse(
        [inset, inset, d - inset - 1, d - inset - 1],
        outline=BRASS + (255,), width=round(ring_px))

    if transparent_outside:
        edge = Image.new("L", (d, d), 0)
        ImageDraw.Draw(edge).ellipse([0, 0, d - 1, d - 1], fill=255)
        canvas.putalpha(edge)

    return canvas.resize((size, size), Image.LANCZOS)


def save(im, name):
    """Palette-quantise before writing. 128 colours is plenty for flat brand
    art and cuts these files by roughly three quarters with no visible loss."""
    im.quantize(colors=128, method=Image.FASTOCTREE).save(
        os.path.join(IMG, name), optimize=True)


def main():
    # Browser tab: a true circle, transparent at the corners.
    save(disc(64, PAPER, True), "favicon.png")

    # iOS home screen: same badge, inset on an opaque pine tile. No alpha —
    # iOS composites a transparent apple-touch-icon onto black.
    tile = Image.new("RGBA", (180, 180), PINE + (255,))
    badge = disc(round(180 * 0.84), PAPER, True)
    off = (180 - badge.width) // 2
    tile.alpha_composite(badge, (off, off))
    save(tile.convert("RGB"), "icon-180.png")

    print("wrote favicon.png (64x64) and icon-180.png (180x180)")


if __name__ == "__main__":
    main()
