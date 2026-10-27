# Beltergate — bounded public gate investigation, 2026-10-27

## Outcome

Ten current chart/fresh-drop gate IDs returned matching public metadata, with
one or two follow targets, repost/like/comment variants, and optional link steps.
All ten configured SoundCloud connect and a Turnstile sitekey. None returned an
original-download URL or download token in its public gate model. No account-free
adapter was established. This is metadata and shipped-source evidence, not a
live claim that the server rejected an attempted account-free verification.

Only GET `/api/gate?id=<native gate id>` was used. No `/api/verify` POST,
Turnstile solve, fake profile, account login, social action, email submission,
analytics request, file GET, or media download was attempted.

The provider's [live catalog](https://beltergate.com/) supplies the tested gate
IDs. Its [own guide](https://beltergate.com/guides/soundcloud-buy-link) explicitly
describes SoundCloud buy-link usage, and gate metadata supplies actual SoundCloud
track URLs. One track uses SoundCloud's short-link host rather than its main
host. Secret/private track links and creator objects are not retained in reports.

## Native source contract

Public `app.js` reads the query `id`, fetches `/api/gate?id=...&ref=...`, and renders
the support requirements. Its one-tap path opens
`/api/fan/soundcloud/start?gate=<id>`, then receives an opaque `dl` query value on
the return page. Its manual path requires a public SoundCloud profile and sends
`{gateId, profileUrl, email, turnstileToken}` to POST `/api/verify`. A configured
Turnstile widget uses action `verify`. The response must supply successful native
verification data; local UI state does not produce a download capability.

`showSuccess(token)` builds `/api/download?token=<encoded opaque token>` and
configures the Download now control. The public profile/metadata route never
constructs that token. A server-reported SoundCloud outage may produce an
honor-system result, but no such result was induced or claimed here.

REA parent: `ev_edb6dc5c7224face5c15a7b4288de167005f100cf5de9d5895c4cbba09035647`.
Summary: `ev_43d7d5ab11498060262fea424e8d41610f0a6c2437367970bde287a424b3fc88`.
One selected script, 30,916 bytes, zero parse failures and no truncation.
Application extraction was complete within this artifact; dynamic semantic
relationships remain partial/unknown. The source was inert and never executed
by REA. `app.js` SHA-256:
`ecff3cc93d3433f24644a5c53a48a12328d922d193650c6a009e3fa5e283c0b4`.
Relevant native source lines: verify POST 129–150; SoundCloud connect 421;
optional email submission 486 (not called); signed download construction 567;
public metadata GET 678; callback `dl` handling 716–722.

`beltergate-live-matrix.json` stores only gate URLs, statuses and requirement
counts/booleans. It contains no account token, signed file URL, personal profile,
creator contact object, or full original-file path.
