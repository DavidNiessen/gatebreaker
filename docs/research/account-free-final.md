# Final account-free Sylver check — 2026-10-27

No additional working account-free original-file path was established. Investigation
stops here at the user's request. No extension behavior or release was changed.
This is a bounded negative result, not proof that every possible bypass is impossible.

## Freshness and runtime boundary

REA opened the public Sylver page in a fresh anonymous browser, clicked its initial
Download control, and captured the page structure/accessibility without account
authorization or email submission. Evidence
`ev_c33de1aad5e02575ab84c9f0e50ed4577e386087f89ad529b6bafe0ba7e62fcd`
has complete coverage for its requested actions and page artifacts; network events
were intentionally excluded. The page still presents email and Spotify requirements
and an optional SoundCloud skip. This is UI evidence, not a server authorization test.

The page now references `160.0.22`, compared with `160.0.10` in retained evidence.
Fresh public GETs verified that the three relevant external scripts are byte-for-byte
identical to the retained versions:

| Script               | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `custom.js`          | `b36b178cf81d5c8e3b698e0192ecd2e2f0be53e2841f7fea7b510c63976c0ff8` |
| `gate-ul-preview.js` | `02fc60d5bf1ec571009231cc1a05d4fdd2b3540cabef2826c91d7396a295528d` |
| `verify-email-ul.js` | `17f2707bc0a7ae918caf90573b8d51b576c514ad1ba31b45ebabcbdfe578264e` |

A metadata-only check of the native `nxstp=1000` resume URL showed the ordinary
starting Download control, with no original-file link exposed. Evidence
`ev_04cfe3c74ae55e8940eb01c1c7b13b43ac26e10abc40497a5eba0de5ce167848`
is complete for its requested accessibility/URL artifacts. The final download
control was not clicked, and this does not establish a server result for that path.

An earlier fresh capture's network coverage was incomplete because event/transaction
budgets were exceeded (`ev_54e58d57a4c038713f3735f163a06cb5870103b769075241d65ebd3cdb782693`).
It is not used to claim exhaustive network coverage. The later requested page-only
captures above provide the bounded runtime observations.

## Additional source audit

The retained Sylver HTML and 26 JavaScript files were reviewed for original-file
destinations, request branches, navigation consumers, and download callbacks.
Previously tested public S3, preview, skip/pathway, native-payload, mobile, and chart
paths were excluded from being presented as new findings.

| Candidate                  | Source                                               | Closure                                                                                                                                             |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared-data download       | `custom.js:961–982`                                  | `/downloadshareddata/save` promises an emailed export; no track-file URL consumer. Not invoked.                                                     |
| Modal pass-through         | `custom.js:2321–2340,2361–2429`                      | Navigates an already supplied `data-url`; does not derive a new original-file URL.                                                                  |
| Chart library save         | `musicLanding.js:708–768`                            | `/smartlink/chartsave` performs an account/library action, with no file URL consumer. Not invoked.                                                  |
| `LINK_GATE`                | `gate-ul-preview.js:769–788,930,1007–1012,1123–1133` | Uses the already-tested `/gate/download/ul` endpoint; Sylver declares this mode off. No evidence that changing the action grants its original file. |
| Visit/mobile helpers       | `gate-ul-preview.js:686–707,743–763,812–837,847–870` | Visit registration and restoration of email/comment text; no alternate file destination.                                                            |
| `activateDowload` callback | `multiple-player-wave.js:421–422`                    | Optional playback callback has no definition in the retained set. Unresolved, with no concrete endpoint justified by its name alone.                |

One new narrow REA pass closed the previously unselected `custom.js` analysis gap:

- Parent `ev_074940775f9a08107177dd366295f540fd37edc2b6cd6aca4d95612b39c71ac2`.
- Summary `ev_2391fb1ee7e3204581ff5f4aace43b2fa842bf5773d357a9055d08fc9d373f7d`.
- One file, 85,327 text bytes, zero parse failures; other files remained explicitly
  outside this narrow pass and were covered by prior evidence/source review.

Static extraction remains partial for dynamic JavaScript and cannot inspect the
server implementation. Direct source ranges support the closures above; no-match
graph traces are not treated as proof of absence.

## Stopping point and operational limit

The previous [blocked-gate experiments](blocked-followup.md) and
[native-flow validation](native-gate-actions.md) remain unchanged: no verified
account-free original download for Sylver, and random email was rejected. The only
live original-file success count remains the earlier 9/25 anonymous sample.

Automatic approval review rejected one proposed final-download capture because its
request/response body collection could expose signed URLs, session data, or file
content to REA. That proposed action was not executed or reproduced indirectly.
The safer follow-up inspected only page metadata and did not click the final control.

No sign-in, email submission, library mutation, rating, CAPTCHA action, original
music download, or new live download POST was performed in this pass. No cookies,
tokens, signed URLs, raw page captures, or file content are published in this report.
With no new evidenced route, no speculative fallback was added to the extension.
