# Hive.co music links — bounded investigation, 2026-10-27

Eight real music links from primary SoundCloud track descriptions were checked.
Five historical gate links reach native `/downloads/download/<id>/spotlight/`
pages, one link is removed (404), and two are ordinary artist/music smart-link redirects.
No account-free original download was established, so no adapter is added.

The domain remains active. `hive.co/l/<slug>` initially redirects to HTTP
`www.hive.co`; the probe deliberately used HTTPS on that known host instead.
The www host redirects to `app.hive.co`. Short aliases can then supply a native
anchor/meta refresh or a `/shortlink/js-redirect` wrapper. Only observed same-Hive
aliases and public HTML routes were read. The wrapper's validation values were
neither published nor sent to REA. External artist/music websites were not followed.

The five gate pages each returned the same generic React shell (20,187 bytes),
with `#reactContainer` and no SSR gate metadata or download URL. HTTP 200 alone
does not establish a usable gate. The current route-registry factory extracted
from the shipped main bundle contains dashboard/marketing routes but no literal
`downloads/download` route. Runtime lazy behavior and backend gate availability
remain unknown; this is not a claim that all Hive links are permanently dead.

## Primary discovery sources

- [Mayhem — Odyssey](https://soundcloud.com/mayhem/odyssey): `/l/odyssey`.
- [GORDO — Hijueputa](https://soundcloud.com/gordoszn/carnage-hijueputa-ft-gravedgr): `/l/hijueputa`.
- [medasin — Landing](https://soundcloud.com/officialmedasin/landing-1): `/l/rippls`.
- [NCS — Hollywood](https://soundcloud.com/nocopyrightsounds/leowi-hollywood-feat-joegarratt-ncs-release): `/l/2i7o5`.
- [Sasha Smith — guru boy](https://soundcloud.com/sashasmithxyz/guru-boy): `/l/guruboy-download`.
- [NCS — Survive](https://soundcloud.com/nocopyrightsounds/vanze-survive-feat-neon-dreams-ncs-release): `/l/2d843`.
- [medasin — Ramen](https://soundcloud.com/officialmedasin/ramen): `/l/IreneOutNow`.
- [ARMNHMR — PHOENIX RADIO takeover](https://soundcloud.com/armnhmr/phoenix-radio-armnhmr): `/l/phx-a-h`.

## REA/source evidence

The public `main.325c7f003f0958f1a4a0.bundle.js` is 6,418,652 bytes. Its exact
route-registry factory was extracted inertly with Acorn; it was not executed.
`route-provenance.json` records the source URL/hash and exact UTF-8 byte range,
factory hash, and the expression wrapper added for parsing.

REA parent `ev_7e2a06af85757dd68da265ad299fa2df44d3225ee9568364e901d96a07c10d15`;
summary `ev_cb0386b5b50d4b2430d869488e1782b9a0123c884a5700f948731132ff1d2635`.
One selected JavaScript extract, 8,382 bytes including wrapper, zero parse
failures. The provenance JSON was inventoried but outside source selection.
Full-bundle, lazy-module, server, and dynamic route behavior were not analyzed.

Publish only this report, the sanitized `gate-matrix.json`, and
`route-provenance.json`. Raw HTML and application source stay in local scratch.
No accounts, social actions, email registrations, completion/telemetry APIs,
or destination/file bodies were requested.
