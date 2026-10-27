# Hypeddit sign-in return investigation — 2026-10-27

The user reported that Spotify finished and closed on the Sylver gate in Chrome,
but Gatebreaker 0.7.2 reported an unconfirmed sign-in or unreleased download.
The actual authenticated tab was unavailable through the browser connection.
No authenticated end-to-end success is claimed by this investigation.

## Public source evidence

A fresh anonymous GET of
<https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit> returned HTTP 200.
Its native Spotify control remains `login_to_sp`, with native window name
`sp_popup` and callback `/spotify_callback`. SoundCloud is optional on this sample.
The initial anonymous Spotify login response had no COOP header; that observation
does not establish the headers or behavior of an authenticated consent flow.

The public page consumes the nonsecret `hypeChildWindow` localStorage flag,
advances the relevant native step, and removes that flag. Its retained listener
fragment has SHA-256
`7133ba6652036d60b6115a2c1ca53befff73389d2bf5b2f5b0f5cec91d454fb7`.
REA analyzed that exact inert fragment, without executing it:

- Parent Evidence: `ev_8ea416cadc1060462c16293e66c0e20f6b2fa48ef695f7c671eb13358395d816`.
- Summary Evidence: `ev_bdde0a7b1f38bcd2ceea29430abe44131da8b22fd37b1b807d1ed8e95c7f2bbb`.
- Scope: one JavaScript source, 224 AST nodes, no parse failures. Static graph
  coverage is partial and dynamic callback execution remains unobserved.

Storage events expose an origin/path but no source Window. An active pending
attempt, exact native control ID, trusted event and native callback path constrain
the signal; they do not prove authentication or authorize a file.

## Reproduced extension defects

The previous implementation discarded an attempt after one refused final request
when its owned popup handle reported closed. That loses a later native callback.
Browser isolation can sever an opener and make its handle report closed while the
popup remains alive; see [MDN Window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open).
This is a reproduced extension failure, not proof that Spotify used this policy
in the user's actual session.

An installed-browser fixture supplies a real `Cross-Origin-Opener-Policy:
same-origin` response from an authored consent origin. It verifies that the live
popup loses its opener, an early refused HTTP check in Chrome retains the pending attempt,
and the later native storage event triggers a new final request and delivery.
The fixture uses no real accounts, credentials, email or media. Website buttons,
inputs and slide state remain untouched. Firefox severs the opener without an early closed-handle check in the fixture; its later callback still triggers final HTTP verification.

Review also found two related races: a callback during an earlier in-flight
request could lose its queued recheck, and delayed response-body cancellation
could discard a replacement sign-in. Dedicated unit regressions cover both.

## Implemented behavior and limits

The pending attempt lasts at most two minutes. Only new return/focus signals or
their queued recheck issue HTTP verification: at most six requests, spaced at
least one second apart, each with a twelve-second timeout. Repeated polling of a
closed handle does not repeatedly POST. A refused response remains pending for a
late native callback. HTTP failures, invalid response shapes and deadline expiry
produce specific errors instead of asserting that Spotify login failed.

A native callback may provisionally complete its own step so other required
steps can proceed. Only the final server response with a validated destination
authorizes delivery. A successful result is reused for thirty seconds within the
same document/gate/session. Cancel, disabling and native session changes abort
pending checks and prevent stale completion. Requests already accepted by the
provider cannot be recalled.

The fixed email remains `gatebreakeros@proton.me`. No OAuth tokens are read or
saved, no CAPTCHA/verification is bypassed, and no authentication success or
server access is fabricated. The real Sylver authenticated download still needs
confirmation with the updated extension.

Version 0.7.4 adds bounded HTTP fallback checks when no further native signal
arrives; see [the silent-return follow-up](silent-return-followup.md) for the
updated schedule, console-error evidence and remaining server-refusal boundary.
