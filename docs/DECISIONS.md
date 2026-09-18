# Decisions and why

Written so a later session doesn't spend time re-deriving these, or undo one
without knowing what it cost.

## Menus are data, not PDFs

The single most important change. Their current site serves every menu as a PDF, which
means: Google cannot index a single dish, phones render them badly, and no price changes
without going back to the agency. Modelling the menu as structured data is what makes
search, dietary filters, photos per dish, and an ordering cart possible at all. Everything
else in this project follows from that one decision.

## The palette was sampled, not chosen

An early version guessed a single forest green and set the wordmark in a script typeface.
Both were wrong. The real logo is a cream oval badge with **two** greens — a dark pine
script and a sage secondary — plus a thin gold hairline. The current tokens come from
reading pixel values out of the supplied logo files. If a color ever looks off, sample the
logo again rather than adjusting by eye.

## Dark-dominant, not cream-dominant

Their existing site is cream with green accents and reads like a brochure. Inverting it so
pine green dominates makes it read like dinner. It also suits the photography, which was
shot on black.

## Near-black behind product photos

The studio dish photos have pure black backgrounds. The photo strip sits on `--black`
(`#080C06`) so the images dissolve into the section instead of sitting in visible
rectangles. Casual phone photos (bread pudding, soup, po-boy, redfish) have ordinary
backgrounds and are only used as thumbnails and in the lightbox, where that doesn't matter.

## The hero photo is blurred on purpose

All three exterior shots are about 510px. That is far too small for a sharp full-bleed
hero. Upscaling with a heavy blur and a pine overlay turns the softness into apparent depth
of field rather than an obviously low-resolution image. The sharp version of the building
is used at native size down in the Visit section, where a guest actually wants to see the
entrance. If better exteriors arrive, swap the hero source and drop the blur.

## The status rail is the pitch, not decoration

The hero rail (open state, walk-in wait, next available table) and the waitlist card in the
reservations section exist to make one argument visible: the host stand and the website
should be connected. The owner raised that gap unprompted. Without the rail, that part of
the conversation is abstract.

## No script font in CSS

The logo already contains a brush script. A second script face for section headers competed
with it. Section eyebrows are Fraunces italic in sage instead.

## Typos corrected here, not on their menus

Their PDFs contain live errors: COSMPOLITAN, EMPORER, "Sicily, Itlay", "Tempes Fugit"
(Tempus Fugit), "Cevaro" (Cervaro), and "Terre Nere" spelled two ways. This build uses the
corrected spellings. Their two PDFs also contradict each other on two wines — the wine list
shows "Domaine de Noire 'Soif de Tendresse'" and "Round Pond Kith & Kin" where the cocktail
PDF shows "Domaine de Pallus Messanges Rouge" and "Round Pond Estate" at identical prices.
This build follows the wine list. **One of the two is stale and the client needs to say
which.** Do not silently "fix" this the other way.

## Lunch and dinner prices genuinely differ

Sensation salad $6/$8, Caesar $8/$12, Seafood salad $16/$24, crab cakes $24/$23, fried
eggplant $22/$20. This is taken verbatim from their menus. Probably intentional, unconfirmed.
Don't normalize them.

## noindex is not optional

See CLAUDE.md, rule 1.

## No build step

It must open from a `file://` path on an iPad in a restaurant, and deploy to GitHub Pages
with zero configuration. Any tooling that breaks either of those costs more than it adds.
