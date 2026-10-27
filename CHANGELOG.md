# Changelog

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
