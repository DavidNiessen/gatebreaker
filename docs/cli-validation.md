# CLI validation — 2026-10-29

The CLI uses the same provider adapters as the extension. This
records CLI-host evidence separately from browser-account completion evidence.

Initial CLI validation passed 1,249 tests, including 64 CLI tests, strict TypeScript,
the core dependency boundary, a built Node core consumer and Firefox manifest lint.
The CLI tests cover arguments, JSON Lines, inspection, provider refusals, deadlines,
cookies, Set-Cookie, redirect policies, session imports, signed destinations,
streamed multi-file output, existing files and partial transfer cleanup.

`npm run test:cli:package` packs the workspace and installs that tarball into an
isolated consumer with production dependencies only and lifecycle scripts disabled.
It verifies the executable, npm command resolution, all thirteen provider names,
the core export, and a synthetic Boost resolution through the installed entrypoint.
Packed contents are restricted to compiled output and public metadata/docs.

Live CLI smoke tests used `--inspect --json --timeout 25` for each URL below.
All eight returned readable metadata for the expected provider. No account login,
email submission, CAPTCHA action, comment, repost or file download was performed.

| Provider   | Public gate                                                       | Inspection                             |
| ---------- | ----------------------------------------------------------------- | -------------------------------------- |
| Hypeddit   | `https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit`     | Passed; email/SoundCloud/Spotify steps |
| Sub2Unlock | `https://sub2unlock.com/Ucdex`                                    | Passed                                 |
| Boost.ink  | `https://boost.ink/oneu`                                          | Passed                                 |
| Rekonise   | `https://rekonise.com/drillas-drill-and-trap-sample-pack-xzsbm`   | Passed                                 |
| Valorizd   | `https://www.valorizd.app/gates/cerrone-remix`                    | Passed                                 |
| PUSH.fm    | `https://push.fm/cu/corridafree`                                  | Passed                                 |
| GateRush   | `https://gaterush.me/-nEKJb`                                      | Passed                                 |
| Droploud   | `https://droploud.com/track/e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89` | Passed                                 |

The same Sub2Unlock and Boost URLs also resolved with `--json --quiet` through
their `embedded-link` method. Their destination URLs were not fetched or retained
in this report. Other providers' live unlocks were not tested through the CLI.
Inspection alone does not verify download completion or account/session reuse.

CI additionally checks the CLI package on Windows/Node 22 and Linux/Node 26,
and retains the existing Linux/Node 24 full core/extension/browser regression job.
See [CI runs](https://github.com/DavidNiessen/gatebreaker/actions) for actual results.

## Interactive browser host

`npm run test:cli:browser` uses a separate headless Chromium profile and fully
intercepted, authored pages. It verifies browser inspection, public-link resolution,
a manual Spotify-style consent/callback with an HttpOnly native session cookie,
no final request before approval, no native gate clicks, no browser media delivery,
persistent sign-in reuse after closing/reopening the browser and changing the
bundled extension directory, manual CAPTCHA completion followed by email/final
request continuation, and cancellation that closes the owned context while keeping
its profile. No real Spotify account, Google challenge, production email or audio
file is used in these fixtures. Live CLI account authorization remains unverified;
the extension's existing live account evidence is a separate record.

## Automatic fallback in 0.11.0

The CLI tests now verify HTTP success without browser creation, automatic fallback
on required verification or initial HTTP 401/403/419, rendered metadata fallback,
read-only inspection without fallback, canonical URL use, one shared browser host
across inputs, terminal file delivery after approval, interruption, installation
failure and on-demand installation only when the compatible executable is absent.
Refusals for missing input, rate limits, unsafe output, malformed recognized-gate
responses, unavailable gates and network failures remain failures. Browser mode is
not selected by a `--browser` option; that removed flag is rejected.

The isolated browser fixture also runs the actual CLI host through an HTTP
Hypeddit attempt and automatic browser handoff, reuses its owned sign-in profile,
then verifies one terminal JSON result with no native gate clicks or media GETs.
These remain authored fixtures, not new live-account completion evidence.

## Headless preparation and isolated interaction in 0.13.0

`npm run check` passes 1,451 tests across 48 files, TypeScript, the core boundary,
the production package consumer and Firefox lint. Fifteen new unit cases cover
account-origin recognition, spoofed/malformed addresses, CLI-owned window scope,
headless operation and verification-window reuse without repeated focus changes.

The authored CLI browser suite additionally runs actual windowed Chromium on
Windows and on Linux under Xvfb. It verifies headless preparation, closing that
process before opening the same profile for interaction, a minimized gate in a
different window from native account consent, automatic private action activation,
persistent-profile reuse and in-memory session-only cookie reuse across inputs.
An official-widget-shaped authored CAPTCHA is solved manually in the isolated
controller window while the original gate remains minimized. Cancellation closes
all owned pages; browser media delivery remains disabled and only the terminal
host receives the approved result.

A second authored fixture exercises PumpYourSound's native SoundCloud SDK handoff,
including a requirement discovered during the initial request. It checks automatic
authorization opening, a separate account popup, the minimized gate, a native
callback, credentials confined to the page's MAIN world, final provider approval,
zero native gate clicks and zero media GETs. Test cookies and approvals are synthetic.
No real SoundCloud login, production CAPTCHA or account action was retried. The
previous real-account block and unverified provider completions remain recorded
in the separate live evidence.
