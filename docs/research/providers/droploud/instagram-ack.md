# Droploud Instagram acknowledgment — 2026-10-29

The reported [Hecki gate](https://droploud.com/track/e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89)
declares `id:instagram`, `type:instagram_follow`. Gatebreaker previously omitted
its ordinary acknowledgment and reached the final request with that step incomplete.

## Native contract

The first-party client distinguishes SoundCloud verification and Spotify OAuth
from ordinary honor steps. Both the legacy Instagram confirmation and v2 card
call `complete(step.id)` without a value. The shared function serializes:

```text
POST https://api.droploud.com/api/gate/<gate UUID>/step
Content-Type: application/json
{"session_id":"<native session UUID>","step":"instagram"}
```

No Instagram username, password, token or consent field is sent. Client link-opening
state controls the native button; it is not an account receipt in the HTTP body.
Gatebreaker performs this gate acknowledgment after Download and required SoundCloud
checks, without opening Instagram or claiming a follow. Only the exact observed
ID/type pair is supported, alongside the existing `droploud_follow` pair.
Unknown or contradictory declarations are not acknowledged.

The adapter requires HTTP success and exactly `{"ok":true}` before a final retry.
A receipt does not itself release the file. Already server-approved sessions return
without resubmission. Cancellation and the native-session fence still apply.

## First-party evidence

Public HTML and assets were fetched without an account. REA also loaded the gate
in an owned fresh headless browser, waited for hydration and closed the browser.
No native controls or sign-ins were activated there.

| Asset                                                                                   | Relevant behavior                                        | SHA-256                                                            |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| [1d0l2-pz5xzsu.js](https://droploud.com/_next/static/immutable/chunks/1d0l2-pz5xzsu.js) | Honor-step set, completion serializer and final request  | `8ecd3e8cdb8872e5a00038e544774173f3628ade443ce4ce28794783756fe051` |
| [2u6c6cc74gz9j.js](https://droploud.com/_next/static/immutable/chunks/2u6c6cc74gz9j.js) | Legacy honor confirmation and shared completion callback | `2099817cdea19e0bedf305131c3f0d5c4e6757a0648e68cb32e9c3889a8261fd` |
| [2yso-voawivvc.js](https://droploud.com/_next/static/immutable/chunks/2yso-voawivvc.js) | V2 Instagram honor card calls completion without a value | `e107eeb055ac1459322ae2d7e5a6ccf30f38e75c6b16a937a882b5ad49e6401b` |

- REA load/wait: `ev_893032811b0cf5898df50471a15946d11ec74c75778afc67f6e727c5c0080c17`.
- Shared/legacy source: `ev_332b6a0f54e7085c14cf4214bb6e9352acdfb41532f50e42d22fa08e061a2bc7`.
  Three selected scripts, 119893 bytes, no parse errors; eighteen scripts outside analysis.
- V2 loader/card source: `ev_706478bec5cfd43ebeedf0290fcc65755225e70ee1f0191fb545cb8759ffb4f1`.
  Two selected scripts, 87221 bytes, no parse errors; twenty-one scripts outside analysis.
  Static relationships remain partial and do not prove execution.

A separate live replay used a fresh anonymous UUID and the exact native body.
It received HTTP 200 and exactly `{"ok":true}`. The final check then returned
HTTP 403, `SoundCloud follow step not completed`, with no download URL. Instagram
was accepted while remaining account requirements stayed enforced. No Instagram
API, account, email, comment, SoundCloud action or file fetch was involved.
See [the sanitized result](instagram-live.json).

Unit coverage includes exact serialization, refusal recovery, unsupported declarations,
malformed receipts, final refusal, cancellation and changed sessions. Installed
Chrome/Firefox fixtures cover Instagram-only and combined Instagram/SoundCloud
gates with intercepted delivery. Real-account SoundCloud completion remains unverified.
