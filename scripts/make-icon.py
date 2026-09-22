#!/usr/bin/env python3
"""Regenerate the favicon and the iOS home-screen icon from the client logo.

    python3 scripts/make-icon.py

Writes assets/img/favicon.png (circular, transparent outside the badge) and
assets/img/icon-180.png (opaque tile for apple-touch-icon, which iOS
composites onto black if it has an alpha channel).

The monogram artwork is lifted straight out of assets/img/mono.webp rather
than redrawn. That file is the client's oval badge: a cream field, a gold
hairline just inside the edge, and the T/C monogram in the middle. We mask
out an ellipse that sits *inside* the hairline, which leaves cream plus
monogram and no oval edge.

Both icons use the inverted treatment — a dark green disc carrying a gold T
and a cream C — which is how the restaurant paints the mark on its own
dining room wall (see the badge behind Carson in assets/img/carson.webp).
The cream badge is the primary logo, but cream on a browser tab strip is
nearly invisible in light mode, and a favicon has to hold up at 16px.

Requires Pillow:  pip install pillow
"""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "assets", "img")

# Sampled from mono.webp: the three colours the badge artwork is drawn in.
CREAM = (244, 241, 233)   # the field
SAGE = (122, 148, 101)    # the T and the rosemary sprig
DARK = (41, 80, 33)       # the C

# Targets, matching the tokens in assets/css/site.css.
PAPER = (246, 241, 230)   # --paper, what the C becomes
BRASS = (216, 204, 168)   # --brass-soft, the hairline and what the T becomes
GREEN = (35, 71, 25)      # --green, the disc
BLACK = (8, 12, 6)        # --black, the tile behind the iOS icon

# Geometry of assets/img/mono.webp (188x310).
BADGE_C = (94, 155)       # centre of the oval
BADGE_R = (81, 140)       # semi-axes of an ellipse safely inside the hairline
GLYPH = (24, 90, 147, 243)  # monogram bounding box, right/bottom exclusive

SS = 8                    # supersampling factor
GLYPH_FRAC = 0.74         # monogram height as a fraction of the disc diameter
RING_INSET = 0.035        # hairline inset from the disc edge, as a fraction
CREAM_CUTOFF = 12         # how far from cream a pixel must be to count as ink


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def monogram():
    """The monogram alone, recoloured, on a transparent ground.

    Every pixel inside the badge is some blend of the cream field with either
    the sage of the T or the dark green of the C. We work out which of the two
    a pixel leans towards, swap in that ink's replacement colour, and carry the
    blend across as alpha — so the original antialiasing survives the swap.
    """
    src = Image.open(os.path.join(IMG, "mono.webp")).convert("RGBA")
    inside = Image.new("L", src.size, 0)
    ImageDraw.Draw(inside).ellipse(
        [BADGE_C[0] - BADGE_R[0], BADGE_C[1] - BADGE_R[1],
         BADGE_C[0] + BADGE_R[0], BADGE_C[1] + BADGE_R[1]], fill=255)

    reach = {SAGE: dist(SAGE, CREAM), DARK: dist(DARK, CREAM)}
    swap = {SAGE: BRASS, DARK: PAPER}

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    sp, ip, op = src.load(), inside.load(), out.load()
    for y in range(src.height):
        for x in range(src.width):
            if not ip[x, y]:
                continue
            r, g, b, a = sp[x, y]
            if a < 8:
                continue
            d = dist((r, g, b), CREAM)
            if d < CREAM_CUTOFF:
                continue
            ink = SAGE if dist((r, g, b), SAGE) <= dist((r, g, b), DARK) else DARK
            op[x, y] = swap[ink] + (round(255 * min(1.0, d / reach[ink])),)
    return out


def disc(size):
    """Render the circular badge at `size` px, transparent outside the circle."""
    d = size * SS
    canvas = Image.new("RGBA", (d, d), GREEN + (255,))

    ink = monogram()
    scale = (GLYPH_FRAC * d) / (GLYPH[3] - GLYPH[1])
    ink = ink.resize((max(1, round(ink.width * scale)),
                      max(1, round(ink.height * scale))), Image.LANCZOS)

    # Land the monogram's bounding box dead centre on the disc.
    gx = (GLYPH[0] + GLYPH[2]) / 2 * scale
    gy = (GLYPH[1] + GLYPH[3]) / 2 * scale
    canvas.alpha_composite(ink, (round(d / 2 - gx), round(d / 2 - gy)))

    ring_px = max(1.0, size * 0.012) * SS
    inset = RING_INSET * d
    ImageDraw.Draw(canvas).ellipse(
        [inset, inset, d - inset - 1, d - inset - 1],
        outline=BRASS + (255,), width=round(ring_px))

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
    save(disc(64), "favicon.png")

    # iOS home screen: the same disc on a near-black tile, which is the one
    # field the green reads cleanly against. No alpha — iOS composites a
    # transparent apple-touch-icon onto black.
    tile = Image.new("RGBA", (180, 180), BLACK + (255,))
    badge = disc(round(180 * 0.88))
    off = (180 - badge.width) // 2
    tile.alpha_composite(badge, (off, off))
    save(tile.convert("RGB"), "icon-180.png")

    print("wrote favicon.png (64x64) and icon-180.png (180x180)")


if __name__ == "__main__":
    main()
