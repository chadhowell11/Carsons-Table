# Carson's Table — Website & Ordering Concept

A working design concept for [Carson's Table](https://www.carsonstable.com/), Mandeville, LA.
Static site, no build step, no dependencies.

> **This is a demo, not the restaurant's live site.** No orders or reservations are
> submitted anywhere. The page is marked `noindex` and `robots.txt` disallows crawling
> so it cannot be mistaken for the real thing in search results.

## What's in it

- Full menu as structured data instead of PDFs — dinner, lunch, cocktails, wine
- Search, dietary filters (vegetarian, without shellfish, spicy, under $20)
- Item modifiers: house butters and steak toppings, protein choices, po-boy sides, wine pour sizes
- Cart with pickup/curbside, tax estimate, market-price handling
- Reservation flow with party size, time slots, seating preference
- Live "tonight" status rail — open state, walk-in wait, next table — driven by the clock
- Photo lightbox on every dish that has an image

## Structure

```
index.html
robots.txt
assets/
  css/site.css
  js/images.js      image path map + the featured plates strip
  js/menu-data.js   every dish, price, description and modifier group
  js/app.js         rendering, cart, reservations, lightbox
  img/              logos, dish photography, exteriors (WebP)
```

Scripts load in order: `images.js` → `menu-data.js` → `app.js`. `app.js` depends on both.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` mostly works, but a local server is closer
to how it will behave once deployed.

## Deploy to GitHub Pages

1. Commit and push to `main`.
2. Repo → **Settings** → **Pages**.
3. Source: **Deploy from a branch**. Branch: `main`, folder: `/ (root)`. Save.
4. Live in a minute or two at `https://chadhowell11.github.io/Carsons-Table/`.

`.nojekyll` is included so GitHub serves the files as-is.

## Editing the menu

Everything lives in `assets/js/menu-data.js`. A dish looks like:

```js
{n:"Crab Cakes", d:"Two jumbo lump crab cakes, pan seared and drizzled with remoulade",
 p:24, s:1, img:"crabcakes"}
```

| key | meaning |
|-----|---------|
| `n` | name |
| `d` | description |
| `p` | price — `null` renders "Bar price" with no add button |
| `s` / `v` / `hot` | contains shellfish / vegetarian / spicy — drives the filters |
| `img` | key into `IMG` in `images.js`; needs `<key>.webp` and `<key>-thumb.webp` |
| `o` | modifier groups, `t:"one"` for radio or `t:"many"` for checkboxes |

## Known gaps

- Photography covers 15 of roughly 80 dishes. More images need the same
  large + thumbnail pair added to `assets/img/` and registered in `images.js`.
- Wait times, time slots and availability are illustrative. Real values would come
  from the host stand system.
- Two photo-to-dish matches are inferred and unconfirmed: the tall iced cocktail
  (tagged Berry Blush) and the po-boy (tagged fried catfish).
