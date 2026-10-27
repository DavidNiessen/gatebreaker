# Changelog

## 0.5.0 — 2026-10-27

- Start automatic processing after Download. Opening a gate only inspects it.
- Automatically submit Hypeddit email as a single random dictionary word at
  `icloud.com`, including optional email. Remove the email button, await native
  acceptance, stop on rejection, and select a different word on explicit retry.
- Show only required native logins and disable Download until all are confirmed.
  Automatically continue after a running attempt discovers and completes a login;
  cancellation, disabling, and navigation prevent stale continuation.
- Automate PUSH.fm's source-confirmed account-free click acknowledgements without
  profile popups or social API calls. Three previously refused live gates now
  resolve, including a two-file reward. A fourth still needs two Spotify logins.
- Add PUSH.fm native Spotify controls and memory-only opaque gate receipts. Native
  account consent remains explicit; real authenticated Spotify remains unverified.
- Expand to 636 unit tests and five new Chrome/Firefox automation scenarios, with
  sanitized REA provenance and installed-Chrome live observations. Keep anonymous
  diagnostics free of email, acknowledgements, and sign-in.
- Retain manual-install prerelease packages. Universal support, browser stores,
  Mozilla signing, and Sylver's account-free unlock remain outside verified coverage.

## 0.4.0 — 2026-10-27

- Add Valorizd public URL/uploaded-file rewards through an exact-slug, projected
  read-only query; recover all ten current music samples, including email gates.
- Handle Next.js removing route scripts after hydration using exact owned script
  resource evidence, with native gate structure and matching canonical identity.
- Add partial PUSH.fm Reward Links through its native empty-action final lookup:
  five of ten sampled rewards released; four required-action refusals and one
  server error remain failures. URL, single-file and multi-file responses supported.
- Add a shared keyboard-accessible file chooser in panel and popup, retaining one
  explicit opening action, signed query values, and selection across state updates.
- Expand to 590 unit tests and add 28 installed Chrome/Firefox fixture scenarios,
  including consumed script tags, file choices, cancellation and no social writes.
- Publish REA source identities and sanitized matrices for current SoundCloud gate
  candidates, with separate availability/authentication/challenge limits.
- Keep browser-store publication, Mozilla signing, and universal coverage outside
  this manual-install prerelease.

## 0.3.0 — 2026-10-27

- Add Sub2Unlock, Boost.ink (including German/Dutch hosts), and Rekonise adapters
  from REA analysis of their current shipped code and public gate formats.
- Recover embedded destinations without social actions. Preserve MEGA fragment
  keys and distinguish a recovered destination from a verified download.
- Support Rekonise link and uploaded-file responses after a cancellable countdown,
  including sampled email-list gates without submitting an address or using accounts.
- Add provider-neutral progress/results, Cancel check in the panel and popup,
  trusted-click checks, shared explicit host configuration, and bounded body readers.
- Validate 38 new-provider URLs (including two locale variants), plus 14 ToneDen
  gates whose native download flow required authentication. Publish sanitized matrices.
- Expand to 396 unit tests and 22 new-provider installed-browser fixture scenarios,
  preserving existing Hypeddit coverage. Add real-duration Rekonise timer checks.
- Keep ToneDen, Rekonise snippets, and server-enforced Hypeddit cases outside the
  verified support boundary. Browser-store publication and signing remain separate.

## 0.2.0 — 2026-10-27

- Manage native Spotify/SoundCloud sign-in from Gatebreaker's starting-page panel
  and popup, using Hypeddit's own authorization flow without collecting tokens.
- Submit required random-email placeholders after a requested anonymous attempt
  fails; show native acceptance, rejection, progress, and timeout states.
- Keep individual gate forms hidden while enabled and route the site's initial
  Download button through Gatebreaker. Restore normal controls when disabled.
- Add a separate website-session download request with known fields, optional
  skips, and future-library marketing flags disabled.
- Add provider presentation/action hooks and 88 additional unit tests; verify
  installed Chrome/Firefox native flows against intercepted fixtures.
- Keep batch live diagnostics anonymous-only and document real Sylver email
  rejection. Real-account unlocks and all-gate coverage remain unverified.

## 0.1.0 — 2026-10-26

- Add Chrome and Firefox Manifest V3 packages and user-initiated download controls.
- Add an extensible provider contract and a Hypeddit provider using public-file
  checks and the observed skip request.
- Validate destinations, reject empty-success responses, and report server-enforced gates.
- Add local enable controls, request cancellation, and protection against stale results.
- Add strict TypeScript, Prettier, offline regression tests, browser integration,
  Mozilla validation, reproducible ZIPs, checksums, and CI.
- Publish REA findings and a 28-URL live coverage report: 9 verified working
  downloads, 16 blocked live gates, and 3 unavailable URLs.

This initial release has partial Hypeddit support. The supplied Sylver gate
remains blocked. Browser-store publication and Firefox signing are not included.
