# DownloadGater and retired Artist Union — 2026-10-27

## Outcome

No account-free DownloadGater adapter is justified by this bounded investigation.
Twelve current public music gates returned page HTTP 200 but the shipped
metadata-only download preflight returned **403 `soundcloud_unlock_required`**
on every one. The gates span ten creator/profile identities and WAV, MP3, and
ZIP files, with both required and absent email steps and some Spotify steps.
No recovered original-file destination was available in their public gate data.
The matrix records only gate URLs, field presence, types, requirement names, and
statuses; it omits tokens, creator contact objects, and signed/file destinations.

Primary SoundCloud usage:

- [August Kind — Crowd Voices](https://m.soundcloud.com/august-kind/august-kind-voices?in_system_playlist=artist-stations%3A803237362)
  explicitly links `downloadgater.com/g/august-kind-crowd-voices-15098`.
- [ALPMAN — Thrift Shop](https://m.soundcloud.com/m-alpman/thrift-shop-alpman-edit)
  advertises a DownloadGater free-download link.
- The provider's [public music catalog](https://downloadgater.com/downloads)
  listed 33 pages of artist downloads when examined. Eleven sample URLs came
  from its first page; the twelfth is the exact August Kind SoundCloud link.

## Native contract and static evidence

The server emits `script#__GATE_DATA__[type=application/json]`, with `kind: "gate"`
and matching `link.id`. `gateBootstrap-C22C2Kcm.js` reads that shape and removes
the script after consumption. Public link models contain file names/sizes/types,
`hasProtectedDownload`, gate requirements, and preview information, but none of
the sampled models contains `downloadUrl`, `downloadFilePath`, or file object keys.
Audio previews are separate endpoints and are not original-download evidence.

`GatePage-CDuHPgPI.js`'s `Xi()` constructs `/api/download/<link id>`, adds native
SoundCloud, Spotify, or paid-access tokens when they exist, and calls the imported
preflight helper before `window.location.assign`. The helper in
`gateUnlockClient-VSjibH2X.js` issues GET to the same URL with `preflight=1`,
`Accept: application/json`, no cache, redirect rejection, and a 20-second deadline.
Only HTTP 204 permits navigation. Otherwise it parses JSON error code/message.
The twelve probes used this exact **preflight-only** mode without credentials
or tokens; no ordinary download request, file body, account, social action,
email, analytics, or action-completion submission was performed.

REA parent: `ev_cbf79a976dfb1369dfa016ff28dec818968cc297b6b421601337b57962ea9324`.
Summary: `ev_0814e20a43defa21df213ebaca74fc3a6e05ae11eeec76609c0535a2a13c466b`.
Three selected scripts, 73,855 bytes, zero parse failures, no semantic truncation;
two inventoried files were outside that selection. Dynamic/framework/server
behavior remains partial/unknown. Source syntax establishes the native request
contract, while the twelve preflight refusals are separate live observations.

| Source                         | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `GatePage-CDuHPgPI.js`         | `afc8e63b6515a2edfd09c0c31177b3d9bddbea33710c3129177eaf73750d2e04` |
| `gateUnlockClient-VSjibH2X.js` | `7a97941b9ff01b9e298333ad73b910eaa85115b98c6832d5b702fc543be58a49` |
| `gateBootstrap-C22C2Kcm.js`    | `0d1da9dbd34f8732d3e5417ea83d1cf1d82a427442388376210654a980a93eb0` |

An exploratory main-bundle analysis parsed one 437,137-byte script without a
syntax failure but hit its default semantic-node ceiling. Parent
`ev_8fec3169856ee23b6689b669c453fe380408d10927bf8854215d0d9f111afc9e`;
summary `ev_218f669d6d2acee79775f8e9ab2306361c935c58004078dbb6232a788dd29818`.
It is not claimed as complete gate coverage; the focused native modules above
answer the actual download-path question without that truncation.

## Artist Union is not a current music-gate target

Historic genuine SoundCloud examples include [ZERA — Hypercolored](https://soundcloud.com/zeramusic/zera-hypercolored)
and [Jean Lunalva — Baila Conmigo](https://soundcloud.com/jhehan-phierre/jhehan-phierre-baila-conmigo-extended-mix).
Their respective `theartistunion.com/tracks/361b66` and `/tracks/469149` links both
returned HTTP 404. The domain root returned unrelated gambling-site HTML, while
`artistunion.com` displayed an unrelated parked/for-sale page. No provider host
permission or adapter should be added for these repurposed domains. This is a
bounded current availability observation, not a claim about every historical file.
