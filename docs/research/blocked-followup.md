# Blocked gates: deeper investigation — 2026-10-26

This follow-up revisits all 16 previously blocked gates. The original-file
bypass remains unproven for those gates; no ineffective fallback was added to
the extension.

## New observations

REA's fresh controlled Sylver observation
`ev_0dadb313856f84ef288d6b7ffd2fe70412952e8186a576980cdb2ac39bcdaadf`
loaded the real page and clicked its original Download button. All declared
browser actions completed and capture coverage was complete. It did not submit an email,
connect an account, or download the song.

The shipped configuration distinguishes requirements that the old `nwSteps`
list does not: Sylver declares **Email**, **SoundCloud (Optional)**, and
**Spotify**. Only SoundCloud exposes a visible skip control. These labels are
evidence of the intended flow, not proof of every server rule.

The mobile/in-app script records skips using `/setGatePathway` and retrieves
them with `/getGatePathway`. A fresh anonymous Sylver session accepted and
returned all three skip codes, but still returned no download destination.
Both the original skip flag and mobile request field were also tested after
recording the pathway; neither produced a destination.

The same session-pathway method was tested once on each of the other 15
previously blocked gates. All 15 recorded the supplied skips, and all 15
remained blocked. See `blocked-session-matrix.json` and
`sylver-session-followup.json`. This distinguishes accepting a session-state
update from granting access to a file.

An intercepted native final-button request established its field structure
without sending that request to the server. The request contains blank email
and tracking fields, one Spotify target array, and the original skip flag.
Adding blank nonpersonal fields to our anonymous request did not unlock Sylver.
`sylver-native-payload.json` records field names, counts, and empty/nonempty
shapes; it omits tokens, target values, and tracking identifiers.

## Alternate chart flow

The public chart script contains a different handler that posts to
`/gate/download/sc` with the public file UID and `page=single`. A real request
to that exact handler returned HTTP 405, with `Allow: GET, HEAD`, and no
redirect. Thus the shipped POST handler does not establish a working alternate
download path on the current service. See `sylver-chart-followup.json`.

## Preview boundary

The player scripts expect a separately cut preview: playback time is offset
into the full waveform, and the media element's native ended event ends the
clip. Sylver's declared preview is 90 seconds within a 294-second original.
The full waveform length does not establish that the preview audio contains
the entire song. A later browser metadata check confirmed that this media
actually lasts **90 seconds**, matching the declared excerpt and differing
from the 294-second original. No audio was played and the original file was not
fetched. See `sylver-preview-metadata.json`. A preview must not be reported as
the original download.

## Additional bounded experiments

| Hypothesis                                                     | Scope                                                                                                                                                                                              | Observed result                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A nonempty email field is sufficient without verification      | Reserved, non-deliverable `example.invalid` placeholder; all 16 blocked gates                                                                                                                      | No destination returned                        |
| Missing native fields explain Sylver's failure                 | Intercepted native payload, including its public Spotify target-list shape and page tracking field; fresh anonymous session; optional future-library preference disabled; both observed skip flags | No destination returned                        |
| Loading the actual mobile page establishes a different session | Fresh Pixel 7 and iPhone 13 emulations; native mobile page fields and recorded skip pathway                                                                                                        | Both rejected; no destination returned         |
| The legacy chart endpoint moved to its advertised GET method   | Exact endpoint and same public file parameters; HTTP method advertised by its 405 response                                                                                                         | GET returned HTTP 404 and HTML, not a download |

The placeholder test used the existing **file DOWNLOAD** action. It did not
invoke email verification, email delivery, subscription, or OAuth endpoints.
It supplied no real person's address. No placeholder-based method was added to
the extension. The native-payload comparison likewise used no connected social
account and does not establish that sending profile arrays is appropriate for
an extension running in an authenticated user's session.

The mobile checks are Chromium device emulations, not certification of mobile
Chrome, Firefox, Safari, or browser-extension behavior on those devices.

Sanitized records: `blocked-reserved-field-matrix.json`,
`sylver-reserved-field.json`, `sylver-native-parity.json`,
`sylver-mobile-followup.json`, and `sylver-chart-followup.json`.

## Evidence and limits

[Static source findings](blocked-static.md) contain exact source ranges,
SHA-256 identities, REA evidence IDs, and remaining unknowns for the gate,
session, preview, and chart code. Static observations do not reveal the server
implementation. The session experiments used fresh anonymous browser contexts,
not logged-in user accounts.

No email-verification/delivery/subscription, OAuth, social follow/save/comment,
donation, rating, CAPTCHA, password, or payment endpoint was invoked. No original music files, cookies, CSRF
values, signed URLs, or raw evidence bundles are committed.

These results rule out the tested methods on the sampled gates at the stated
times. They do not prove that every possible bypass is impossible.

## Implementation decision

No new original-file bypass was established in this follow-up, so production
resolution behavior and the 0.1.0 release are unchanged. Accepted skip-state
updates, outdated chart handlers, mobile emulation, and shorter preview media
must not be reported as successful downloads. The server implementation and
complete authorization checks remain unknown.

## Final account-free check

The [2026-10-27 bounded follow-up](account-free-final.md) found no additional verified account-free route and records the stopping point and remaining limits.
