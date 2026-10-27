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

## Remaining native service-field difference

The public Sylver page declares lifetime_fan_sp but not lifetime_fan_dz or
lifetime_fan_ap. Native code reads those missing inputs as undefined and jQuery
2.1.4 serializes their scalar values as empty strings. Gatebreaker instead supplied
zero for all three services. Website-session requests now preserve native empty
values for absent services, and still force declared lifetime opt-ins to zero.
This is a confirmed serialization difference; whether it explains the real server
refusal remains unverified. See the [jQuery 2.1.4 serializer](https://github.com/jquery/jquery/blob/2.1.4/src/serialize.js).
