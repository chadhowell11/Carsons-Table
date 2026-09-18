#!/usr/bin/env python3
"""Generate the WebP pair a dish photo needs.

    python3 scripts/add-photo.py path/to/photo.jpg crabcakes

Writes assets/img/<key>.webp (720px wide) and assets/img/<key>-thumb.webp
(220x220 centre crop). Then register the key in assets/js/images.js and add
img:"<key>" to the dish in assets/js/menu-data.js.

Requires Pillow:  pip install pillow
"""
import sys, os
from PIL import Image

if len(sys.argv) != 3:
    sys.exit(__doc__)

src, key = sys.argv[1], sys.argv[2]
out = os.path.join(os.path.dirname(__file__), "..", "assets", "img")
im = Image.open(src).convert("RGB")

big = im if im.width <= 720 else im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
big.save(os.path.join(out, key + ".webp"), "WEBP", quality=78, method=6)

s = min(im.size)
sq = im.crop(((im.width - s) // 2, (im.height - s) // 2,
              (im.width + s) // 2, (im.height + s) // 2)).resize((220, 220), Image.LANCZOS)
sq.save(os.path.join(out, key + "-thumb.webp"), "WEBP", quality=76, method=6)

print(f"wrote {key}.webp and {key}-thumb.webp")
print(f'now add  {key}:"assets/img/{key}.webp", {key}_t:"assets/img/{key}-thumb.webp"  to images.js')
