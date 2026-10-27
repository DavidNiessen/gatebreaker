# Silent Hypeddit success-window follow-up — 2026-10-27

The user reports a briefly visible authentication-success message, a closing
Spotify window and an unchanged Gatebreaker UI. They confirmed the originating
tab sends `POST /gate/download/ul` and receives HTTP 200 with
`download_status: false`. This proves the request runs and the server still
refuses the download; it does not prove the cause or a successful gate release.

## Console errors

Chromium defines `ERR_BLOCKED_BY_CLIENT` as a request blocked by the client.
The reported Spotify events request alone does not identify the blocking
component or prove that authentication failed. Gatebreaker declares no network
blocking permission or rules. No browser protection was disabled for this fix.
See [Chromium's error definitions](https://github.com/chromium/chromium/blob/main/net/base/net_error_list.h).

The exact public Hypeddit asset
<https://hypeddit.com/js/multiple-player-wave.js?v=160.0.22> returned HTTP 200;
SHA-256 `92468ef1b126b6a60bdcf1a6bb843b219749c23c709274e100aa51f27ff9f76c`.
It initializes `webAudioContext` to numeric zero at line 8, creates an audio
context only for player type `WEB` at lines 329–331, but its body click handler
unconditionally calls `webAudioContext.createBuffer` at line 346. That path can
produce the reported exception without proving an extension or privacy blocker
caused it. REA analyzed the inert public asset, not an authenticated page:

- Parent Evidence: `ev_2999c74f9b8b409dccc343629f1036ab0ff7683248681a8b81c4c8cac792d119`.
- Summary Evidence: `ev_c6efb189540e40fc4e4f331cc806e9c1237c4ceb7734042db5ae1a79f638dc57`.
- One parsed JavaScript file, 1,714 AST nodes, no parse failures; dynamic behavior
  and external dependencies remain unknown.

## Extension gap and correction

Version 0.7.3 retained early refused checks, but required another return/focus
signal to request the final download again. A lost flag or disconnected popup
handle could therefore leave the UI waiting even after the callback completed.

After an observed return or closed-handle hint, ordinary refusals or transient
request failures now schedule bounded rechecks with 1-, 4- and 16-second delays.
Four checks including the initial hint check exhaust this automatic fallback;
two of the existing six-request budget remain available for later native signals.
The two-minute attempt lifetime, one-second minimum spacing, twelve-second
request timeout, safe destination checks and cancellation guards still apply.
The total number of checks remains six. No unbounded polling, extra login window,
OAuth credential capture, form driving or fabricated authentication is introduced.

Panel and popup Hypeddit sign-in buttons show a disabled `Waiting for Spotify…` state
while confirmation is pending. Cancel remains available. Only failures appear in
the bottom notice, as previously requested.

Installed-browser fixtures cover real opener isolation, native storage returns,
a silent success-and-close callback with delayed server readiness, the same
body-capture audio exception, clear waiting controls and untouched native buttons.
All responses and rewards in those fixtures are authored; no real accounts,
emails or media are used. Unit regressions verify recovery without native flags
and backoff that reserves capacity for a later callback.

The captured final request schema has no proven missing Spotify-token field.
Attribution fields and synthetic verification values were not added speculatively.
The real Sylver authenticated download remains unverified. If its server continues
to return false, these changes cannot create access or establish which native
requirement remains unsatisfied.
