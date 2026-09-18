# Roadmap

Ordered by what unblocks what. Nothing below the demo line should be built before the
client's technology audit is complete — several items depend on what their POS can
actually do, and building the wrong one wastes real money.

## Done — demo stage

- Four menus as structured data with search and dietary filters
- Item modifiers, cart with pickup/curbside, tax estimate, market-price handling
- Reservation flow and waitlist UI
- Photography on 15 dishes with lightbox
- Deployed as a static site

## Next — still demo, safe to build now

1. **Photo coverage.** 15 of roughly 80 dishes have images. The gap is visible when you
   scroll. Needs either a client photo session or accepting that most dishes stay text-only.
2. **Accessibility pass.** Tab order through the menu, focus trapping in the modal and
   lightbox, `aria-live` on cart updates. Currently partial.
3. **Real metadata.** Open Graph and Twitter card tags, so a link sent over text renders
   with the logo rather than a bare URL. Worth doing before more people see it.
4. **Print stylesheet for the menu.** Restaurants need printable menus constantly, and
   generating them from the same data is an easy, visible win.

## Blocked on the audit — do not start yet

5. **Menu admin.** The real answer to "how do I change a price?" Today it's editing a JS
   file, which is fine for a demo and unacceptable for a restaurant. Needs a datastore and
   an auth layer. **But** if their POS already holds the menu, the right build is a sync
   from the POS, not a second place to type prices. Audit first.
6. **Online ordering, for real.** Depends entirely on whether their POS exposes an ordering
   API, and whether they're already licensed for a module they aren't using. Their gift
   cards route through TableUp, which suggests a POS relationship worth investigating.
7. **Reservations, for real.** Strong candidate for buy rather than build — OpenTable, Resy
   and SevenRooms sell diner traffic, not just software, and that is the part you cannot
   replicate. The current UI may end up being a styled wrapper around a vendor widget.
8. **Host stand integration.** Highest value, hardest, and entirely constrained by what
   their table management system exposes. This is what the hero status rail is promising.

## Not planned

- A CMS for the marketing pages. Overkill for a site this size.
- Native apps. No.
