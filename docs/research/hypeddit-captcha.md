# Hypeddit manual CAPTCHA integration — 2026-10-27

The user requested an actual CAPTCHA inside both the injected Gatebreaker box and
the browser extension popup, with automatic continuation after manual completion.
No real CAPTCHA was solved by the agent. Authored browser fixtures stand in for
the Google widget; live human challenge completion remains to be confirmed.

## Native evidence

A fresh anonymous Sylver page returned HTTP 200, declared Google's reCAPTCHA API
and a native site key, and used a maximum attempt count of 10. Its response had
neither X-Frame-Options nor Content-Security-Policy. This framing observation is
specific to that response; authenticated sessions and browser policies can differ.

The native `verify-email-ul.js?v=160.0.22` SHA-256 is
`17f2707bc0a7ae918caf90573b8d51b576c514ad1ba31b45ebabcbdfe578264e`.
REA parent Evidence:
`ev_0b419491167e7ffb56ce6d50ba4910233e0cabf1ca14dffa70ef3683f307ce26`;
summary: `ev_018ec5e9d9ae88148c8c9c052d744000811111281c648c5378a685d0d9902dfc`.
One JavaScript file and 1,406 AST nodes parsed without errors. Static extraction
does not establish server implementation or CAPTCHA validation.

- Lines 78–91 call ordinary email verification first, then display a widget when
  the existing count equals maximum minus one. Gatebreaker previously blocked
  before this last ordinary attempt, one request earlier than the native flow.
- Lines 126–151 display a challenge on modal opening at count >= maximum or the
  explicit native `data-attempts="over"` declaration.
- Lines 186–193 require a nonempty response from the native Google widget.
- The CAPTCHA branch still sends only `validateEmailAddress`, `fan_gate_id`,
  `email_name`, `adcode`, and `hypesource` to `/verifyEmailAddress`. The retained
  script does not send a CAPTCHA token in that POST. Only JSON `status === "T"`
  advances the email step. Backend validation and counter-reset behavior are unknown.

## Design and trust boundaries

Google keys normally belong to their configured domains. The challenge therefore
runs in a Hypeddit-origin iframe, rather than rendering its key on an extension
origin. The same frame view appears inline in the page box and inside the toolbar
popup; both are available while the current Download is paused. Popup framing
failure offers a gate-page fallback. The frame is sandboxed without navigation,
popup or download permission. See [Google domain validation](https://developers.google.com/recaptcha/docs/domain_validation)
and [explicit widget rendering](https://developers.google.com/recaptcha/docs/display).

Two packaged scripts run only for explicit CAPTCHA subframes on Hypeddit. The
MAIN-world script invokes the page's existing Google API with its declared site
key and retains its own widget ID. No remote script is injected by the extension.
The isolated frame helper checks the parent origin, gate ID and ephemeral nonce.
The widget exports only ready/expired/error/completed state, never its response
token. A bounded layout signal expands the frame when Google's image challenge
needs room. [Mozilla documents MAIN-world support from Firefox 128](https://blog.mozilla.org/addons/2024/07/10/manifest-v3-updates-landed-in-firefox-128/);
Gatebreaker's supported Firefox minimum is 140. No additional extension permissions
or Google host permissions are requested.

Parent messages require trusted browser events from the exact owned frame,
Hypeddit origin, current gate and nonce. Synthetic messages cannot advance the
flow. The original content script alone sends the ordinary email POST after
manual completion. Only its accepted HTTP result completes the CAPTCHA/email
interaction; final download approval and destination validation are still required.
Cancellation, disabling, gate/session changes and expiry discard pending receipts
and abort outstanding email verification where possible. No counter cookie is
deleted, modified or fabricated to avoid a challenge.

Unreadable attempt data now yields an attempt-data error, not an invented CAPTCHA
claim. The last ordinary attempt remains allowed. The application retains an
automatic CAPTCHA action's completion even after the provider removes that action,
so the original Download can resume without an extra click.

## Spotify refusal follow-up

The user reports v0.7.4 still receives `download_status: false` after Spotify
returns. Exhausted bounded checks now show a download-refusal error and a Check
download again action, instead of indefinitely labelling the state Waiting for
Spotify. Retrying checks the pending website session without opening another
Spotify window; a later native callback can still resume a validated download.
Consent windows now also preserve Hypeddit's native `sp_popup` target name.

Installed Chrome and Firefox fixtures set an authored Secure/HttpOnly/SameSite=Lax
cookie on the callback and require it on final checks. Both send that cookie and
Origin `https://hypeddit.com`; website JavaScript cannot read it. This does not
reproduce a missing-cookie or wrong-Origin cause for the real refusal. The real
Sylver extension download is still unresolved; no successful delivery is claimed.

## Render-only live preview — 2026-10-28

A disposable Chrome profile rendered the actual Google widget from the public
Sylver page in both Gatebreaker surfaces. Only an authored requirement signal in
the fetched public HTML forced display; no real attempt cookie was changed. All
email/final-download POSTs, other submissions and media/social requests were
blocked in this preview. No Google control was clicked, no challenge was solved,
and no response API was read by the test.

Both widgets reached ready with no sitekey/domain/sandbox error. The initial
narrow panel clipped the normal widget, so frames under 340 pixels now request
Google's supported compact size. The final unchecked compact widget measured
164×144 inside a 291.61×260 page frame; the popup normal widget measured 304×78
inside a 436×180 frame. Image challenges can expand the frame separately.

The user confirmed the v0.7.4 refusal includes a nonempty native external identifier
and skips only sc. The identifier value is intentionally not retained here. This
rules out that field's absence; it does not explain the remaining server refusal.

## Service-field follow-up superseded by browser replay

Version 0.7.5 changed absent service flags to empty strings based on standalone
jQuery 2.1.4 param serialization. That experiment did not include the Ajax
options merge and was insufficient to establish the native wire contract.
The full browser replay below corrects that conclusion.

## Full native request replay — 2026-10-28

The affected Chrome tab was observed sending the expected fixed email, gvf=0,
is_skippable=0, lifetime_fan_spotify=0, steps=email,sc,sp and skip_gate_steps[]=sc.
Its captured HTTP 200 response was download_status=false, URL empty and
genre_slug empty. It supplied no specific refusal reason. No cookies, tokens,
external identifier values or destination URLs were copied into this report.
A native comparison in that tab stopped when an autofill overlay blocked
browser automation; Gatebreaker was re-enabled and the gate reloaded afterward.
No real email was submitted during that partial native comparison.

A separate disposable anonymous Chrome replay captured the native final request
with every POST intercepted and stubbed. Unlike the earlier standalone
serializer probe, this ran the website's complete jQuery Ajax path. Its options
merge drops undefined scalar values before serialization. On Sylver, absent
Deezer/Apple lifetime flags and the undeclared YouTube comment disappear; the
declared SoundCloud comment flag produces an empty sc_comment_text field even
though SoundCloud is skipped. The native time field is a random position within
the track duration, with a three-minute default for missing/zero duration.

Gatebreaker now omits absent service flags, sends only native-declared empty
comment fields and uses that timestamp calculation. It never forwards populated
comment text or enables future-song enrollment. A finite positive safe-number
bound prevents malformed duration data from producing an invalid timestamp.

After the correction, all 19 final-request fields match the intercepted native
request in the deterministic replay, including field presence, multiplicity,
empty strings and values. A controlled Math.random=0.5 makes only this disposable
replay's timestamp comparison reproducible. No live verification proof or cookie
was modified. See [the sanitized comparison](sylver-browser-request-parity.json)
and scripts/research-hypeddit-parity.mjs; run the latter manually with Playwright
browsers installed. It performs public GETs, blocks every POST and never uses an
existing browser profile, signs in, solves a CAPTCHA or starts a media download.

The native gate-ul-preview.js?v=160.0.22 still has SHA-256
02fc60d5bf1ec571009231cc1a05d4fdd2b3540cabef2826c91d7396a295528d.
REA parent Evidence ev_2bf1158cfaa24dc1f18b4b742af5a927733ab5db1be5f2eae1f21024a435c490;
summary ev_1b9886f7f7b13cfcf30191a76423bee9c4ed0c7b9a03d846c507a7be9c7a3a0b.
One file and 7,314 AST nodes parsed without errors; relationship coverage is
partial and the server's validation logic is not established by these bytes.

Installed-browser fixtures additionally enforce omitted flags, empty comments,
timestamp range and untouched native controls. Request parity on this anonymous
sample does not prove authenticated delivery. The real Sylver refusal remains
unconfirmed until a live attempt with the corrected package succeeds. Initial
request ordering, the actual callback session and backend side effects remain
possible causes without supporting evidence; no speculative workaround was added.
