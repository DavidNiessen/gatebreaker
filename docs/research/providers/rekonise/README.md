# Rekonise investigation — 2026-10-27

## Outcome

A source-backed timing check established an anonymous destination for Drillas after
35 seconds. A timed recheck then returned destinations for **all sixteen** corpus
links; metadata and unlock were HTTP 200, with at most three requests in flight.
No account, action-completion, analytics, email, CAPTCHA, or file request was performed.
See [timer-followup.md](timer-followup.md) and `timed-matrix.json`.

The initial sixteen immediate requests below are retained as a timing-limited baseline,
not evidence of permanent unsupported/account-required gates. Their metadata returned
HTTP 200 and immediate unlocks returned HTTP 403. A tokenless request returned HTTP 400.

`live-matrix.json` is the publish-safe corpus and outcome record. It includes sixteen
public gate URLs, metadata/unlock statuses, action codes, and destination-presence flags.
It contains no gate token, unlock pass, cookie, credential, or destination URL.

The provider and 67 offline tests cover native link/uploaded-file results,
elapsed waits, bounded parsing, schema/route/origin boundaries, countdown, cancellation,
and email-list gates without email submission. Installed Chrome and Firefox suites
also cover nine authored scenarios, with a real-duration ordinary-action timer and
an accelerated extra-email allowance, cancellation past former deadlines, custom
routes, files, and server errors. Real Chrome checks resolved link/file/email gates;
real Firefox checks resolved link and file gates. The old tokenless approach remains
unverified/obsolete. See the installed-browser matrix in the parent directory.

## Native contract observed in shipped code

The public gate page selects Angular route `SocialUnlockDetailPageComponent` through
`main-ZOY6MVHD.js` and `chunk-BKIhvhTW.js`. Native service and route code establish:

- `chunk-JPU9kR0L.js` sets the public API origin to `https://api.rekonise.com`.
- `chunk-BWdt6ug8.js` constructs GET `/social-unlocks/<slug>` for public metadata.
- Its `unlock(t,e,i)` builds GET `/social-unlocks/<slug>/unlock?token=<encoded token>`
  and adds optional `pass` only when a previously saved native unlock pass exists.
- `chunk-BTyx-vUk.js` calls that method with the returned model's `slug` and
  `unlock_token`. Successful responses can supply `url`, `file`, or snippet content
  depending on the gate type. A previous native pass is not an account-free fallback
  available in a fresh browser and was not guessed or generated.
- The public page also contains Angular transfer state in `script#ng-state`; its
  metadata response contains a model with title, slug, actions, type, status, and an
  opaque public `unlock_token`. The response URL can be an SSR-internal loopback
  address; an adapter must never trust/request that transferred URL.

The old public snippet claiming tokenless `/unlock` success is not current evidence.
The shipped service now supplies a gate token, and tokenless live testing failed.

## REA evidence

Focused final static analysis selected the actual native service, gate component,
and config, not the unrelated framework/vendor chunks:

- Parent `ev_d998f84f3925be419daf068948214c6d8e2996cf7d0a5ebad89ceceb2bd47eaf`.
- Summary `ev_2cc2e57b1886d0bb9a6a38b21b2eeb9d3f084e452aabb0d47162bc8a4ad7be7f`.
- Three JavaScript files, 37,583 text bytes, zero parse failures.
- Twenty-two other inventoried files were outside that exact analysis selection.
- Graph semantics remain partial for dynamic framework behavior; static observations
  do not claim successful authorization or backend implementation knowledge.

| Selected script     | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `chunk-BWdt6ug8.js` | `b4a4f01bb618c9c4d5d0b71421a9173f090252dce8899cc22a2bff341bf259d5` |
| `chunk-BTyx-vUk.js` | `90407ef9e24b22877f49fb89b738479df005538a8cf25287c3bf791af12bfb4b` |
| `chunk-JPU9kR0L.js` | `e039ed023fc1b30efbf01378e0460f8500f4a5a223fa12d0617fa220fd850cc7` |

An earlier exploratory five-file pass had semantic node ceilings and therefore
truncation (parent `ev_f65588e64ed325045a5eda263a06c5b624e544efe13a803930634642de17d346`).
It is not used as proof of comprehensive gate-component coverage.

REA metadata-only runtime evidence
`ev_d6e7ecfda88dfed30a2518c86654e37d0c43f7822ce48632b4f56b264df59b25`
opened the Drillas page in a fresh browser and captured accessibility/URL after a
one-second wait. Requested capture coverage was complete, with no network body
capture or final unlock click. It showed the two subscribe requirements and a
disabled unlock control at 0/2 completed. It did not perform account actions.

## Live validation

One native GET metadata + unmodified returned-token unlock sequence was attempted
per corpus URL, with credential omission, no redirects, deadlines, and a delay
between gates. The matrix stopped on a rate-limit response if one appeared; none did.
All sixteen models were link-type gates and collectively declared action codes
1, 3, 4, and 9. These span single, repeated, and mixed social requirements.

For Drillas, the same native sequence was independently checked in a fresh real
Chromium browser. It also returned metadata 200 and unlock 403. A bounded follow-up
used the site's native `X-Initial-Referrer` header and a five-second interaction
delay; the outcome remained 403. No token modification, guessed pass, authorization
header, user account, social mutation, email, CAPTCHA action, or file download was
used. Returned error text was “Unable to unlock. Please refresh and try again.”

The source-backed timer follow-up supersedes the initial unsupported classification.
The exact backend timing rule remains unknown, but the successful delayed requests
establish an account-free path for the tested cases. Initial immediate refusal does
not establish an account requirement.

## Implemented boundary and remaining scope

The staged adapter constructs only fixed API GET paths after route/model validation.
It ignores transferred SSR response URLs, does not retain SSR tokens in `Gate` metadata,
fetches a current public gate token, waits, and uses that token unchanged. Returned
passes are ignored rather than persisted. Link destinations use the shared safe HTTPS
baseline; uploaded files additionally require the exact native API storage capability
route and query shape established by the separate file-mode investigation. No binary
request is made. Snippet responses and unavailable gates remain unsupported.

Ordinary action upper bounds are 15 seconds each; watch-video action code 30 uses
45 seconds. The adapter sums these bounds and adds five seconds of margin. A declared
email-list step adds one conservative 15-second budget without submitting any address.
Its current schema bound is 30 actions, an implementation limit rather than a claim
about the service's creator policy. The maximum countdown is 1,370 seconds including
the email step; every wait remains cancellable and reports progress at most once/second.

The sixteen-link timed batch held all tokens until the longest native interval and
then queued requests, so actual waits were about 50.7 seconds. This is explicit in
the matrix and is not evidence that every link needed that duration. Separate checks
validated one ordinary action at 20,004 ms and two ordinary actions at 35,008 ms.
Destinations were returned but not opened or downloaded; some are further hosting,
storefront, or shortened-link pages, not asserted original file bytes.

Direct page-origin CORS fetch read the API JSON in Chrome probes. No arbitrary
privileged background fetcher is needed. `www.rekonise.com` returned HTTP 200 rather
than a redirect in a public metadata-only request. The native custom-route API method
is source-established (`getByUsernameAndCustomSlug`); matching username/custom slug
fixtures cover it, but no live custom route was found in the sampled profile's twelve
links (all had null custom slugs). Watch-video timing, other action codes, uploaded-file
and email-list live evidence are distinguished from this sixteen-link matrix.

## Hydration and native route recognition

A fresh real-browser check found `script#ng-state` still present both at DOMContentLoaded
and after three seconds; no consumed-state bug was observed in that check. The native
widget's gate-page ancestor was `app-social-unlock-detail-page`, while homepage demos
also reuse `app-social-unlock` and must not be accepted from that widget alone.

The adapter now has a defensive, network-free fallback only when transfer state is
absent and the nearest `app-*` ancestor of the widget is that exact native gate-detail
component. An intervening homepage component, or an unwrapped demo widget, is rejected.
Present but malformed/mismatched transfer state still fails closed. Fresh metadata
is requested only after the user starts resolution.

For custom aliases, gate identity is always the requested `username/custom-slug` route
key, so transfer-state removal cannot change identity and abort a running wait. The
fresh metadata response must match that username/custom slug, and its canonical slug
is used only for the native unlock endpoint. Four additional tests cover consumed
state, homepage demos, stable alias identity, and wrong-owner metadata.

The latest public `main-NECCLACJ.js` maps the custom route to `chunk-DOog0uEO.js`. That
wrapper declares `app-social-unlock-custom-slug-detail-page` and directly renders the
shared `app-social-unlock-detail-page`, confirming the same strict marker works for
the native custom-route structure. This is source evidence, not a live custom-alias
download result.
