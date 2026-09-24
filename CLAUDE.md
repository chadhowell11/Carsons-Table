# CLAUDE.md — working notes for Carson's Table

Read this before editing. It covers the things that aren't obvious from the code
and the handful of decisions that are easy to undo by accident.

## What this is

A design and functionality concept for Carson's Table, a restaurant in Mandeville, LA.
It exists to demonstrate, to the owner, what their website could be — their current site
is a splash page whose menus are PDFs and whose reservation buttons link to `#`.

It is a **demo**, not the restaurant's live site. Nothing submits anywhere.

## Hard rules

1. **Do not remove `noindex` or `robots.txt`.** This is a public mock of a real business,
   with their real logo, menu and address. If it gets indexed, a local searching for the
   restaurant can land on a fake site with a dead reservation form. Only lift this if the
   client has formally adopted it as their real site.
2. **No build step, no framework, no package manager.** Plain HTML, CSS and vanilla JS,
   served as files. This is deliberate — it has to run from GitHub Pages and from a
   `file://` open on an iPad in a restaurant with bad wifi. Don't introduce React, a
   bundler, or npm without a specific reason and a conversation.
3. **Script order matters.** `images.js` → `menu-data.js` → `app.js`. `app.js` reads `IMG`,
   `MENUS` and `PLATES` from the first two. Don't add `defer` to some and not others.
4. **Don't re-inline images as base64.** An earlier version did; it made the file 1.2 MB
   and every image change rewrote the whole document. Assets stay as files.
5. **Wrap all `localStorage` access in try/catch.** It throws in some `file://` contexts
   and in private browsing. The cart must degrade to in-memory, never break the page.

## Structure

```
index.html            markup only — no inline styles
robots.txt            disallow all
.nojekyll             tells Pages to serve files as-is
assets/css/site.css   all styling
assets/js/images.js   IMG path map + PLATES (featured photo strip)
assets/js/menu-data.js  every dish, price, description, modifier group
assets/js/app.js      rendering, filters, cart, modal, reservations, lightbox, clock
assets/img/           logos, dish photos, exteriors (WebP), icon (PNG)
scripts/add-photo.py  helper to generate the image pair for a new dish
scripts/make-icon.py  regenerates favicon.png and icon-180.png from mono.webp
docs/                 decisions and roadmap
private/              engagement context — gitignored, do not commit
tableside/            the multi-tenant platform (Node) — separate rules in tableside/CLAUDE.md.
                      It doesn't touch the prototype, but if merged to main, Pages will serve its
                      source as static files (no secrets live there). See tableside/docs/DECISIONS.md D10.
```

## Brand

These are **sampled from the client's actual logo files**, not chosen. Don't substitute
"close enough" greens.

| token | value | where it comes from |
|-------|-------|---------------------|
| `--green` | `#234719` | the "Carson's" script in the logo |
| `--sage` | `#78905F` | the word "TABLE" in the logo |
| `--paper` | `#F6F1E6` | the cream field of the logo badge |
| `--brass-soft` | `#D8CCA8` | the gold hairline around the badge |
| `--pine` | `#17300F` | darkened brand green, used for dark sections |
| `--black` | `#080C06` | near-black, only behind product photography |

The logo is a **cream oval badge**, not transparent type. It reads well on dark fields and
poorly on cream ones — that's why the header, hero and footer are dark.

**Typography:** Fraunces (display/serif) and Karla (body/UI), both from Google Fonts.
There is deliberately **no script font** in the CSS. An earlier version used Parisienne for
section headers and it fought with the brush script inside the logo. Two script faces on a
page read as a mistake. Section eyebrows use Fraunces italic in sage instead.

**Don't put `url()` inside a CSS custom property set from HTML.** The hero photo used
to be a `--heroimg` var on the `<section>`, and browsers resolved that path relative to
`site.css` rather than the document — it 404'd as `assets/css/assets/img/...` and the
hero silently rendered as flat pine. The path now lives in `site.css` where a relative
url reads the way it looks.

**Colors are tokens.** Use `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--line)`.
There's a dark-mode token override block; hardcoding hex breaks it.

## The menu data model

Everything lives in `assets/js/menu-data.js`. Four menus: `dinner`, `lunch`, `bar`, `wine`.

```js
{n:"Crab Cakes",
 d:"Two jumbo lump crab cakes, pan seared and drizzled with remoulade",
 p:24, s:1, img:"crabcakes",
 o:[{g:"Sauce", t:"one", c:[{l:"Remoulade"},{l:"Cocktail sauce"}]}]}
```

| key | meaning |
|-----|---------|
| `n` | name |
| `d` | description (optional — sides omit it) |
| `p` | price. `null` renders "Bar price" and no add button (used for classic cocktails) |
| `s` | contains shellfish — drives the "without shellfish" filter |
| `v` | vegetarian |
| `hot` | spicy |
| `img` | key into `IMG`; requires both `<key>.webp` and `<key>-thumb.webp` |
| `o` | array of modifier groups |

Modifier group: `{g:"Group label", t:"one"|"many", req:1, c:[{l:"Choice", p:5, mp:1}]}`
- `t:"one"` renders radios and is always required; `t:"many"` renders checkboxes,
  required only if `req` is set.
- `c[].p` is a price delta. `c[].mp` marks market price — it adds `$0` to the cart and
  triggers the "quoted by the kitchen" note in the cart footer.

**Shared helpers** at the bottom of the file: `STEAK()`, `SIDE()`, `SAUCE()`, `KIDSIDE()`,
plus `APPS(crabPrice, eggplantPrice)` and `SOUP`. Appetizers are shared between lunch and
dinner with different prices for crab cakes and fried eggplant — edit `APPS()` once.

**Wine items use a different shape:** `{n, g (grape), v (region), h (half glass), gl (glass), b (bottle)}`.
Missing pour sizes are simply absent and render as a dash. Wine courses carry `wine:1`
and render as a table, not cards.

## Adding a dish photo

```bash
python3 scripts/add-photo.py path/to/photo.jpg crabcakes
```

Writes `assets/img/crabcakes.webp` (720px, q78) and `crabcakes-thumb.webp` (220px square,
q76). Then register it in `images.js` and add `img:"crabcakes"` to the dish.

Product shots are on black backgrounds, which is why the photo strip section sits on
`--black` — the images bleed into the section with no visible edge. Keep that in mind if
you add photos shot on white.

## Run and deploy

```bash
python3 -m http.server 8000     # http://localhost:8000
```

Deploy: push to `main`, then Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Things that are illustrative, not real

- Wait times, open/closed state and reservation slots are computed from the clock in
  `app.js` (`clock()`, `TIMES`, `FULL`). They are plausible fiction. Real values would come
  from the host stand system, which is a Phase 1 integration question, not a code question.
- Checkout and reservation confirmation show a toast and do nothing else, on purpose.

## Unconfirmed with the client

- The tall iced cocktail photo is tagged **Berry Blush**; it may be the Spring Soda mocktail.
- The po-boy photo is tagged **Fried Catfish Po-boy**; inferred from it being a single fillet.
- Menu typos were corrected here but not on their PDFs (Cervaro vs "Cevaro", Tempus Fugit
  vs "Tempes Fugit", Cosmopolitan vs "COSMPOLITAN"). Their two PDFs also disagree on two
  wines. See `docs/DECISIONS.md`.
