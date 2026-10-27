# Native gate controls — 2026-10-26

Gatebreaker now controls supported native Hypeddit actions from its starting-page
panel and Chrome popup. Individual gate forms remain hidden. This adds a way to
complete website requirements; it is not evidence that all sixteen previously
blocked gates can now be bypassed.

While enabled, the website's starting Download button is routed through Gatebreaker
and a scoped stylesheet keeps its native gate carousel hidden, including if the
website removes its own hiding class. Disabling removes this stylesheet and restores
normal website controls. The injected panel is placed outside the hidden carousel.

## REA findings used

The retained public scripts (`160.0.10`) were inspected as inert source with REA.
Relevant earlier evidence is recorded in [the blocked-gate follow-up](blocked-followup.md).

- `custom.js:1893–1945`: `PopupCenterDual` calls the website's `window.open`, retains
  its handle, and may use current-page navigation for selected in-app clients.
- `inline-8.js:1–50`: the page's `hypeChildWindow` storage callback advances the
  originating control's slide and clears the website callback flags.
- `verify-email-ul.js`: the native handler validates the fields and posts to
  `/verifyEmailAddress`; status `T` advances the email slide, while other statuses
  show a validation error. The handler can invoke the website's smart-link logic.
- Sylver's source includes Hypeddit's own Spotify authorization client/callback.
  Gatebreaker does not register a separate app or read the returned credentials.

These observations led to invoking actual native controls rather than building a
replacement OAuth exchange. Gatebreaker never reads callback storage values or
OAuth tokens. A native completed slide is progress evidence, not proof that the
server will issue a download.

## Implemented behavior

Inspection is inert. A requested anonymous resolution first probes the fixed
public original-file path and then tries the observed skip request. A rejection
automatically submits required email once. Optional email requires its button.
The placeholder has thirty cryptographically random hexadecimal characters at
`gmail.com`; it does not create a mailbox. An empty first-name field receives
`Listener`, while existing names are preserved.

Spotify/SoundCloud buttons synchronously click recognized native controls. Native
sign-in/consent windows appear; the website retains its opener and callback flow.
Progress, errors, and timeouts appear in Gatebreaker. The native email button is
disabled while its submission is pending and after completion, preventing repeats.
No comments are fabricated or submitted.

After a native action, Download posts a separate whitelist of ordinary website
fields using the existing same-origin session. Only native optional skip controls
and already-recorded skips are included; required steps are not blanket-skipped.
Future-library marketing flags stay zero. No native final-download button is
clicked, and a nonempty validated download URL is still required.

## Validation and limits

The automated suite has **213 passing tests** covering provider boundaries,
credential exclusion, native actions, progress/errors, lifecycle, and requests.
Installed Chrome and Firefox fixture tests exercise email submission/rejection,
native Spotify/SoundCloud windows and callbacks, session downloads, and hidden
forms. Chrome also verifies popup-originated sign-in with normal popup blocking.
The fixture callback preserves the original page opener; no real provider account
is authorized. Firefox popup documents are outside this Playwright check.

Two bounded real Sylver checks used isolated profiles on 2026-10-26. Both anonymous
download requests returned HTTP 200 with `download_status: false` and no destination.
Both native email requests returned HTTP 200 with `status: F`; the website displayed
“Please enter a valid email address.” The initial forty-character placeholder was
shortened to Gmail's thirty-character maximum before the second check. Rejection
persisted, so length alone does not explain the server's validation. The panel
reported that rejection, and the original gate wrapper remained hidden in both
checks. No social account was connected and no music was downloaded.

Real Spotify/SoundCloud authorization and successful post-login downloads remain
unverified. Hypeddit may reject random addresses, require inbox verification or a
CAPTCHA, expire sessions, or enforce further steps. Browser/provider session reuse
is not a guarantee of one login across all gates or providers. The previous 9/25
anonymous baseline remains the only live original-file success count.

Developer `check:live` remains anonymous-only: it explicitly disables native-action
fallback, so batch diagnostics do not submit email or open sign-in windows.
