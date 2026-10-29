# Reference-provider expansion, 2026-10-29

The comparison uses [sc-gate-dl](https://github.com/D3SOX/sc-gate-dl) at commit
`983fc2ce025b436a5692a4ccc8700c3e90251df9`. Its native source and shipped website
artifacts were read as evidence, not instructions. No GPL implementation code was
copied into this MIT project. Each new adapter is original TypeScript based on
current first-party request/response contracts analyzed with REA.

## Comparison

| Reference target                                          | Gatebreaker status                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hypeddit, Droploud, GateRush                              | Already present; retained                                                           |
| DownloadGater                                             | Added native gate/email/consent and original-download preflight                     |
| StillHype                                                 | Added native fan session, email/ordinary/SoundCloud steps and final unlock          |
| PumpYourSound                                             | Added native form, ordinary steps and native SDK SoundCloud handoff                 |
| MyPressKit                                                | Added native step/email/consent, verifier and original grant                        |
| Bandcamp                                                  | Added artist-issued free/original grants and generation status                      |
| Direct files, SoundCloud/yt-dlp, transcoding and metadata | Reference transport/media-processing features, outside this gate-provider expansion |

Existing Sub2Unlock, Boost.ink, Rekonise, Valorizd and PUSH.fm adapters remain.
Both registries now contain thirteen adapters and the CLI packages the same core
and extension host. Required account sessions automatically use the CLI's owned
browser fallback; HTTP-only users still receive an explicit server requirement.
The library requires a host to supply browser/session capabilities.

## Live checks

| Provider                                                   | Sample                            | Observed result                                                                            |
| ---------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| [DownloadGater](providers/downloadgater/README.md)         | 12 current gates                  | 12 recognized; all anonymous preflights refused with SoundCloud required                   |
| [StillHype](providers/stillhype/README.md)                 | 11 current gates                  | 11 recognized; SoundCloud/comment requirements deliberately not submitted                  |
| [PumpYourSound](providers/pumpyoursound/implementation.md) | 10 current gates                  | 10 recognized; mixed SoundCloud/comment/Spotify/ordinary requirements                      |
| [MyPressKit](providers/mypresskit/README.md)               | One creator-linked gate           | Recognized; native verifier required all five SoundCloud steps, no grant                   |
| [Bandcamp](providers/bandcamp/README.md)                   | One free album, two paid products | Free original generation approved after one native renewal; paid products remained blocked |

No real account login, public social mutation or full media download was performed
for this expansion. These checks establish current formats and honest server
refusals, not broad authenticated download success. Required comments always use
user-provided text. Unsupported challenges, paid access and provider refusals are
not bypassed. StillHype manual-action verification and PumpYourSound's non-
SoundCloud account branches may still require their native flow.

## Validation boundaries

Unit tests use authored models and responses for unsafe or malformed metadata,
required inputs, refused/missing grants, cancellation, restricted message senders,
owned callbacks and exact final endpoints. Installed-browser fixtures intercept
network/account endpoints and never use real social accounts or media. They check
native controls remain manual and processing begins only after Gatebreaker
Download. Real authenticated completion remains unverified as stated above.

The extension requires explicit page-host access for the new providers and
Bandcamp artist subdomains. New private background messages are not externally
connectable and expose no generic fetch, token, script or account proxy. The
repository's core-boundary check verifies the provider engine remains independent
of extension/browser runtime globals.

## Authored results

- `npm run check`: 1,431 tests passed across 47 files, core boundary and Node
  import passed, clean production CLI installation passed, Firefox add-on lint
  reported zero errors, notices or warnings.
- New-provider installed fixtures passed in isolated Chrome and Firefox builds:
  DownloadGater five cases (including both COOP account callbacks), StillHype and
  MyPressKit HTTP grants/refusals and SoundCloud continuation, PumpYourSound four
  native-form/SDK cases, and Bandcamp eight original-grant cases.
- `npm run test:cli:browser` passed HTTP-to-browser fallback, persistent profile
  reuse, manual sign-in/CAPTCHA continuation, cancellation and terminal output.

These fixtures intercept account and file-delivery endpoints. They do not upgrade
the live account evidence stated above.
