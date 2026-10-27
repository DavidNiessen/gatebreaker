# Droploud investigation — 2026-10-27

## Result

Droploud is an active SoundCloud-oriented download gate. Its current homepage lists
recent public tracks, and SoundCloud creators link both legacy `/gate/<uuid>` and
current `/track/<uuid>` routes. Legacy gate routes redirect with HTTP 308 to the
same UUID's track route.

Thirteen unique tracks were inspected: ten from the current provider homepage and
three from SoundCloud descriptions. Eleven returned valid gate pages; two recent
SoundCloud-linked UUIDs returned Track Not Found/404. The valid models cover
Instagram, required SoundCloud follow/like/repost/comment, Spotify follow/save,
email, and Droploud-follow configurations. All eleven declare `sc_optional: false`.

The exact native anonymous destination POST returned **403 `Gate not completed` on
all eleven valid gates**. No response contained a destination. This establishes
server rejection for fresh incomplete sessions; it does not identify every backend
validation rule or prove universal account requirements. No working account-free
adapter was established, and this provider should not be advertised as supported.

## Native contract

Current track HTML embeds Next.js React Flight data with `gateData` and `trackId`.
`gateData` includes a stripped track presentation model and steps, not the original
file URL. The model was parsed as data; embedded JavaScript was never evaluated.
Creator objects and fan-prefill fields were not retained in published records.

The shipped gate component creates a random UUID and stores it as `dw_sid` in
sessionStorage. Its download handler posts JSON `{session_id}` to:

```text
POST https://api.droploud.com/api/gate/<trackId>/download
```

It then uses a successful `download_url` in a browser link, with optional external
link handling. Native social completion is separately recorded through
`POST /gate/<trackId>/step`; SoundCloud and Spotify have their own sign-in/status
flows. None of these completion or account endpoints was invoked here. Native code
has no ordinary pre-download wait in this handler; its short delays are preview
stubs, not evidence of a Rekonise-style timer path.

Probes used fresh random UUIDs, no cookies or credentials, no saved native pass,
no completion values, and no email/social data. The native API response is JSON;
no full file URL was opened or requested. A required step's visual metadata alone
is not proof of a released original file.

## REA and source identity

REA parent: `ev_1c656985d4be4c34cd9deda48f7e2443a984ee2d3eaff4b283eb35546c884170`.
Summary: `ev_1026301a01f235a7ec69108adf724263a00242761b6ca4717db549b29a730ed7`.
Three selected public scripts, 112,770 bytes, zero parse failures. Seventeen
inventoried files were outside selection. Application and semantic coverage remain
partial for dynamic framework/module behavior; static syntax does not establish
execution, server code, or authorization.

| Shipped chunk      | SHA-256                                                            | Relevant behavior                                            |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `2hzo_gvdx8sta.js` | `cdec885b07154e4f1b343fb1584f5c2cd203295415b2342867451b12595b2fd8` | Gate steps, session UUID, native destination POST/navigation |
| `3xe2y0ql_4op8.js` | `c400a39c1b99e2bef045a8f9a956e45cf232feb5800689a8e214b34d9c7c22c4` | API base `https://api.droploud.com/api`, Axios client        |
| `0-hb8f4s000te.js` | `1d5fe44f77cfbc74a9494f3f55bb1f4e8c2acc3cf5d2eeed8b667c32d14f3b70` | Current public track/card support code                       |

`tracks-inventory.json` records track status/source, page hashes, and shipped script
identities. `model-matrix.json` records only route matching, step IDs/types, and
field names. `unlock-matrix.json` records statuses, error text, and absence of
destinations. These are publish-safe; raw HTML/Flight data, creator objects, and
the acquired full scripts remain private working artifacts.

## Remaining boundary

Real-account unlocks, optional-SoundCloud gates, and unknown future formats were
not exercised. The eleven anonymous failures should not be converted into fake
successes by marking steps complete locally, submitting false social completion,
reusing someone else's session, or treating stream previews as originals.
