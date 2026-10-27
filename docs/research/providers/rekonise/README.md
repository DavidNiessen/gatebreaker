# Rekonise investigation — 2026-10-27

## Outcome

No working anonymous resolver was established. Sixteen live public music/sample-pack
gates returned metadata HTTP 200, but every native token-bearing unlock request returned
HTTP 403 with no destination. A tokenless request returned HTTP 400. No production
adapter or offline success fixture was fabricated from the obsolete tokenless approach.

`live-matrix.json` is the publish-safe corpus and outcome record. It includes sixteen
public gate URLs, metadata/unlock statuses, action codes, and destination-presence flags.
It contains no gate token, unlock pass, cookie, credential, or destination URL.

This is not proof that all Rekonise bypasses are impossible. It shows the tested
anonymous native request sequence did not work on this sample and at this time.

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

The cause of server refusal remains unknown: this evidence does not distinguish
all anti-abuse, token binding, action verification, deployment, and session rules.
The correct integration decision is **unsupported for anonymous resolution in this
sample**, rather than claiming full Rekonise support based on a stale API example.

## Potential integration boundary if a path is later verified

An eventual adapter would need only the exact public site origins and the fixed
API origin, validate slugs before constructing its own endpoint, ignore SSR response
URLs, keep the token ephemeral, reject unsafe/empty destinations and unexpected
redirects, and distinguish link/file/snippet/email gate types. Direct page-origin
fetch could read the API's JSON in the browser probes; no arbitrary privileged
background fetcher is justified by this research.
