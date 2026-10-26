# Blocked gates: deeper investigation — 2026-10-26

This follow-up revisits all 16 previously blocked gates. The original-file
bypass remains unproven for those gates; no ineffective fallback was added to
the extension.

## New observations

REA's fresh controlled Sylver observation
`ev_0dadb313856f84ef288d6b7ffd2fe70412952e8186a576980cdb2ac39bcdaadf`
loaded the real page and clicked its original Download button. All declared
steps completed and capture coverage was complete. It did not submit an email,
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
the entire song. A preview must not be reported as the original download.

## Evidence and limits

[Static source findings](blocked-static.md) contain exact source ranges,
SHA-256 identities, REA evidence IDs, and remaining unknowns for the gate,
session, preview, and chart code. Static observations do not reveal the server
implementation. The session experiments used fresh anonymous browser contexts,
not logged-in user accounts.

No email, OAuth, social follow/save/comment, donation, rating, CAPTCHA, password,
or payment operation was performed. No original music files, cookies, CSRF
values, signed URLs, or raw evidence bundles are committed.

These results rule out the tested methods on the sampled gates at the stated
times. They do not prove that every possible bypass is impossible.
