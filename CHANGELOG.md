# Changelog

## 0.9.3 — 2026-10-29

- Accept Droploud's approved `type:r2` hosted-file response instead of reporting
  unreadable download details. Keep external rewards as pages and unknown types
  unsupported.
- Preserve the complete signed URL through automatic file delivery, including
  encoded filename/query parameters. Retain all destination safety checks.
- Add synthetic response and Chrome/Firefox delivery coverage without retaining
  or fetching the reported signed URL. No new permissions.

## 0.9.2 — 2026-10-29

- Automatically acknowledge Droploud's declared Instagram honor step through its
  native HTTP endpoint after Download and required SoundCloud checks. Fix the
  reported Hecki gate's `Instagram step not completed` refusal without opening
  Instagram, submitting a handle or accessing an Instagram account.
- Require the exact supported step ID/type, a valid acknowledgment and final
  server approval. Preserve already-approved sessions, cancellation and changed
  session protection; leave unknown steps unsupported.
- Verify the live anonymous Instagram acknowledgment on the reported gate and
  confirm that SoundCloud requirements remain enforced. Add unit and installed
  Chrome/Firefox coverage for Instagram-only and combined gates.

## 0.9.1 — 2026-10-29

- Use a blue palette throughout the page panel, extension popup and toolbar icon.
- Follow the system's light/dark setting in both surfaces, including live changes
  while open. Keep entered comments, focus and active download/sign-in state.
- Theme fields, selection, focus, disabled/secondary buttons and errors consistently;
  keep the injected panel independent of the host website's colors. Fix dark popup
  secondary controls inheriting the primary button's dark text.
- Theme the CAPTCHA wrapper and choose Google's documented widget theme when
  creating a challenge, without resetting an active challenge on a system change.
- Verify light/dark rendering, live switching, narrow layouts and text contrast in
  Chrome and Firefox, plus installed dark CAPTCHA flows. No new permissions or
  stored theme preference.

## 0.9.0 — 2026-10-29

- Automatically perform missing required Droploud reposts through SoundCloud's
  first-party HTTP protocol after Download and required sign-in. Read existing
  repost state first, never toggle or unrepost, then require Droploud's own fresh
  verification and final download approval. No manual Repost click is needed.
- Open an owned SoundCloud window, reuse its normal browser session and resume
  automatically after login. Keep the account token inside that page; return only
  a fixed result state to the extension. Bind requests to the declared track,
  parent tab/document, operation nonce and bounded lifetime.
- Abort remaining work on cancellation, navigation, disabling, lost heartbeat or
  changed native session. Close orphaned owned tabs after worker restart without
  resuming mutations. Wait briefly for native repost propagation without repeating
  the account action. Never fabricate like attestation or accept blocked responses.
- Add `scripting` and `https://soundcloud.com/*` permissions for the packaged
  page-local HTTP performer. Document real public account actions and the privacy
  boundary. Other provider flows retain their existing behavior.
- Add the optional repost capability to the reusable core for future CLI/API hosts,
  and verify real HTTP serialization plus login resume in installed Chrome/Firefox
  fixtures. First-party source and anonymous read-only GraphQL evidence are
  documented; actual authenticated SoundCloud repost completion remains unverified.

## 0.8.0 — 2026-10-28

- Add reusable, user-configured SoundCloud comment text in the popup and required
  page panel. Prepare Droploud and GateRush comments before native authorization;
  include configured text only in declared, unskipped Hypeddit comment fields.
- Handle Droploud repost settling and native verification separately from sign-in.
  Open the matching SoundCloud track when a real manual action is required and
  resume only after provider verification. Never fabricate like attestation.
- Isolate authorization and track windows, bind prepared text and pending requests
  to the native session, retry the exact native comment refusal once, and cancel
  stale work when preferences or sessions change. Fix Firefox Save and continue
  ordering by waiting for its storage-change receipt.
- Separate `src/core` provider engines and HTTP protocols from `src/extension`
  browser capabilities, account windows, storage, CAPTCHA, delivery and UI.
  Export a typed `gatebreaker/core` session API with injected HTTP/HTML/session
  capabilities for future CLI/API hosts; add neutral ESM and NodeNext declarations.
- Enforce the core dependency/browser-I/O boundary and validate independent Node
  sessions, cancellation and metadata isolation. Check twelve public gates through
  the built core with restricted read-only transport, plus authored Chrome/Firefox
  comment, repost and existing-provider flows.
- Real authenticated SoundCloud publication/repost completion remains unverified.
  Hypeddit's historical SoundCloud OAuth address is still unproven and unsupported;
  unknown provider action drivers remain failures.

## 0.7.9 — 2026-10-28

- Recognize Droploud track gates after deployment changes their JavaScript chunk
  filenames. Keep exact origin, native markup and bounded matching Flight-model
  validation. Verify the reported Hecki track in the installed Chrome panel and
  popup; authenticated completion of its required SoundCloud comment remains unverified.
- Preserve the native manual flow on every provider. Website buttons no longer
  trigger Gatebreaker, and the extension no longer hides website controls or
  marks them for interception. Automatic processing starts only from a Gatebreaker
  panel or popup action.
- Add installed Chrome/Firefox checks that native Hypeddit and Droploud controls
  run their own handlers without extension requests. Update all provider visibility
  fixtures and pass 968 unit tests.

## 0.7.8 — 2026-10-28

- Automatically reuse a confirmed Hypeddit Spotify browser session after later
  Download actions. First sign-in remains explicit; expired sessions or new consent
  still need the user. Keep only a scoped nonsecret timestamp preference.
- Bind native Spotify callback documents to owned popup/tab/operation records.
  Isolate concurrent gates, recover after background-worker restart, and handle
  cancellation, closure/retry and mixed required-account completion without early POSTs.
- Support native OR groups, optional Spotify skip flags, revealed next controls
  and the native donation skip spelling. Prefer the verified Spotify alternative
  when an unskippable YouTube path refuses the download.
- Add source-confirmed Mixcloud/Deezer native handoffs and repair Firefox's
  non-iterable query-key enumeration. Real completion of five sampled account
  gates remains unverified, as documented.
- Test 82 public URLs and 40 combinations across 14 declared step codes. Verify
  file access on 71 of 76 active download gates: 47 without accounts and 24 with
  Spotify. Exclude three unavailable pages and three unsupported Link Gates.
- Verify real Spotify reuse on three gates, including a diagnostic-browser restart:
  one initial Sign in click, then Download only, with no premature final requests.
- Add 961 unit tests total plus installed Chrome/Firefox reuse, concurrency,
  callback, cancellation and worker-recovery fixtures. Keep the configured Proton
  email, future-song enrollment off and all existing permission scopes.

## 0.7.7 — 2026-10-28

- Fix Hypeddit's Sylver download refusal by discovering required sign-in before
  sending the first final download request. Preserve automatic email processing.
- Wait for the native callback's slide/control update, callback path or storage
  event. A timer, focus change or COOP-closed handle cannot trigger an early POST.
- Retain final server approval, safe destinations, bounded retries and cancellation.
  Keep the configured Proton email and future-song enrollment off.
- Verify a real Chrome Sylver download with the final implementation: zero early
  POSTs, one successful post-callback request and a complete 77,792,480-byte WAV.
- Pass 825 unit tests, TypeScript, Prettier, Firefox validation and the full installed
  Chrome/Firefox suites, including slow consent that rejects any premature POST.
  Other gates and live Firefox authorization are not universally verified.

## 0.7.6 — 2026-10-28

- Match Hypeddit's full native Ajax payload after sign-in: omit undefined service
  flags, include declared empty comment fields and use the native track timestamp.
- Correct v0.7.5's standalone serializer assumption. A disposable anonymous Chrome
  replay now matches all 19 Sylver final-request fields with every POST blocked.
  Include the reproducible research script and a comparison without field values.
- Keep the fixed Proton email and future-song opt-outs. Never forward comment text.
- Verify 822 unit tests plus installed Chrome/Firefox HTTP, sign-in and CAPTCHA
  fixtures. The actual authenticated Sylver download still needs live confirmation;
  request parity alone does not establish successful backend authorization.

## 0.7.5 — 2026-10-28

- Display required Hypeddit reCAPTCHA inline in the Gatebreaker box and inside the
  extension popup, with compact sizing in narrow layouts and a gate-page fallback.
- Resume email and the original Download after manual completion and native HTTP
  acceptance. Handle expiry, loading errors, cancellation and stale frame receipts.
- Match the native attempt threshold; unreadable counter data gets a clear error
  instead of a false CAPTCHA claim. No solver, counter reset or token export is used.
- Match native empty lifetime-service fields when those services are absent,
  while retaining zero opt-in values for declared services.
- Replace exhausted Spotify waiting with a clear download refusal and a bounded
  HTTP retry without another login window. Preserve the native sp_popup name.
- Add CAPTCHA and HttpOnly-session fixtures in installed Chrome and Firefox.
  Verify 812 unit tests and render the real unchecked Google widget on both Chrome
  surfaces without solving it or submitting email/download requests.
- The real Sylver server refusal remains unresolved; these checks do not claim a
  successful authenticated download or universal gate coverage.

## 0.7.4 — 2026-10-27

- Restore the native page-scoped external identifier and attribution fields to the
  final website-session request. Parse only bounded literal JSON for the current
  gate; keep OAuth credentials excluded and lifetime-follow enrollment off.

- Recheck Hypeddit after explicit sign-in activation or delayed session updates without
  requiring another callback/focus signal. Back off at 1, 4 and 16 seconds while
  reserving capacity for later native signals within the existing six-check budget.
- Show a disabled waiting state on Hypeddit sign-in buttons in the panel and popup, with
  Cancel still available. Keep final server approval necessary for download.
- Cover silent success-and-close returns, native audio exceptions and delayed server
  readiness in both installed-browser suites; verify 789 unit tests.
- The reported HTTP 200/download_status false still represents a server refusal;
  real authenticated Sylver delivery remains unverified.

## 0.7.3 — 2026-10-27

- Retain pending Hypeddit sign-ins after an early closed-window download refusal,
  so a late native callback can still confirm the final download.
- Preserve callbacks arriving during HTTP verification; cancel pending checks when
  cancelled, disabled or the gate session changes, and ignore stale failures.
- Bound verification requests and report session, server, rate-limit and download
  errors without incorrectly asserting that Spotify sign-in failed.
- Add unit races and a real COOP popup regression to both installed-browser suites.
  Real authenticated Sylver delivery remains unverified.

## 0.7.2 — 2026-10-27

- Use gatebreakeros@proton.me for every automatic Hypeddit and GateRush email
  submission, including retries. Derive Hypeddit email notices from the shared address.

## 0.7.1 — 2026-10-27

- Always use test@icloud.com for automatic Hypeddit and GateRush email submissions,
  including explicit retries. Remove random word generation and candidate rotation.
- Distinguish Hypeddit email rejection from unknown verification responses; do not
  suggest CAPTCHA unless an actual challenge or attempt limit is detected.

## 0.7.0 — 2026-10-27

- Replace Hypeddit email/button and PUSH sign-in button driving with source-confirmed
  HTTP requests and direct provider consent addresses. Leave native inputs and slides unchanged.
- Try current server sessions before introducing required sign-in; bind new receipts
  to owned consent windows and require final server approval for delivery.
- Handle fast-closing Hypeddit consent windows through a bounded final JSON check;
  reuse its successful response in the same page/session without a duplicate POST.
- Add partial GateRush support: direct email/name and ordinary confirmations, native
  SoundCloud consent, and attachment-only original-file HEAD validation.
- Add partial Droploud support: read-only native saved-session reuse, native status
  requests, explicit SoundCloud consent, optional skip ACK, and file/external rewards.
- Record 24 GateRush and 17 Droploud public-page investigations. Fresh mandatory-comment
  gates still refuse access; GateRush link rewards and real authenticated delivery remain unverified.
- Honor explicit page reward types over legacy file-method inference. Expand HTTP,
  session, cancellation and installed-browser fixtures; run Chrome and Firefox in CI.
- Verify 765 unit tests and complete installed Chrome/Firefox suites. Fix Firefox
  content-script URLSearchParams iterator incompatibility in HTTP email verification.
- Keep manual-install prerelease packages and unsigned Firefox installation boundaries.

## 0.6.0 — 2026-10-27

- Start validated files automatically after the requested gate succeeds, including
  every file in a multi-file reward. Open URL rewards as pages and retain retry links.
- Add a bounded private delivery message and the browser downloads permission;
  validate the full set, keep operations bound to the current tab/gate, and stop
  remaining starts on cancellation, navigation, or disabling.
- Use a normal disabled cursor and clear unavailable styling for Download.
- Remove routine completion/progress logs and generated email from the bottom
  section; present only actionable failures as compact light/dark inline alerts.
- Reuse PUSH.fm's exact existing same-gate receipt only when its native Spotify
  control also confirms completion. Keep cross-gate authorization user initiated.
- Expand to 685 unit tests and installed-browser delivery/restoration scenarios;
  test the real Chrome download manager with an authored text fixture and intercept
  synthetic provider destinations without fetching real media.
- Retain manual-install prerelease boundaries, unsigned Firefox packages, partial
  provider coverage, and unverified real-account authorization.

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
