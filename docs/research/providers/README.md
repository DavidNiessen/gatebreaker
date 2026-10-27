# Additional providers — REA investigation, 2026-10-27

This investigation covers current social/download gate providers and historical
SoundCloud download links. Evidence-backed account-free adapters are implemented
for the formats described below. Exposing a gate's
destination is distinct from verifying or downloading the destination's file.

## SoundCloud-oriented additions in 0.4.0

- **Valorizd:** ten current catalog music gates all expose a URL/file reward in
  their native public lookup, including two with email capture enabled. The
  adapter uses a projected exact-slug read, never a profile query or write.
  See [source contract](valorizd/README.md) and [matrix](valorizd/live-matrix.json).
- **PUSH.fm:** the native empty-action final lookup released five of ten sampled
  rewards: two single files, two URL rewards, and one two-file reward. This includes
  a public example and an already ungated multi-file reward; four required-action
  gates refused access and one returned a server error. See [source contract](push/README.md)
  and [matrix](push/live-matrix.json). No action tokens or email were submitted by
  the adapter. Multiple files remain separate choices before one opening action.
- **Other candidates:** [PumpYourSound](pumpyoursound/README.md),
  [Droploud](droploud/README.md), [DownloadGater, Beltergate, Fangate.eu and Artist Union](soundcloud-candidates/candidate-board.md),
  [Show.co](showco/README.md), [Unlock.fm/Feature.fm](unlockfm/README.md),
  [Hive](hive/README.md), and [Click.dj](clickdj/README.md) have bounded reports.
  They are not registered as working adapters. Distinguish native server refusal,
  a challenge that was not attempted, an unverified email/authorization path, and
  availability errors; those are different findings.

Real installed Chrome checks cover all ten Valorizd corpus gates and three PUSH.fm
URL/single-file/multiple-file examples. Real Firefox checks cover two Valorizd gates
after their script tags were consumed, plus three PUSH.fm examples with file
selection. These complement, rather than replace, the HTTP/static corpora and
28 new synthetic Chrome/Firefox browser cases. No final file was requested.
See `soundcloud-installed-browser-live.json` for sanitized runtime records.

## Sub2Unlock

The current Next.js gate page uses `__NEXT_DATA__` with
`props.pageProps.sink.data.unlocked_link`. The shipped `/[uniquer]` component passes
that exact value to the final browser navigation. Its social-step state is client
UI state; `/api/actions` records step/unlock events. Gatebreaker can read the known
public destination directly without clicking social steps or sending those events.
Creator objects are not retained: the public page model includes creator contact
fields that are unrelated to resolution.

REA analyzed the gate page bundle and its selected shared chunk as inert code:

- Parent `ev_8d4f81f8ca2bcd26f0b0f6ff357d584b50b57beee40e07287253f27b7a1f7307`.
- Summary `ev_da8fe2b602925c2ccb477fbeb61cc59436a5435d90493fb27b03badda313eb8e`.
- Two scripts, 24,664 bytes, zero parse failures. Both selected files were parsed;
  graph/semantic coverage remains partial for dynamic framework behavior and does
  not include every Next.js/vendor dependency or server implementation.

Ten independently discovered live gates returned HTTP 200 with matching gate IDs
and nonempty HTTPS destinations. They cover one, two, and five social blocks with
YouTube, Instagram, and custom actions. One supplies a MEGA file key in its fragment;
preserving the fragment is necessary. This HTML-only corpus does not establish
file availability or safety. No final destination was fetched.

## Boost.ink

The current `unlock.js?v=3.5.10` reads a Base64 destination from an attribute on its
own script tag, removes that attribute synchronously, and later decodes the value
for the final navigation. The native step state is in local storage and is not
needed to recover this destination. The adapter must account for attribute removal
before an extension's `document_idle`: on user request it can read a fresh inert copy
of the same public gate HTML. No native step click or completion event is necessary.

REA analyzed `unlock.js` and `main.js`:

- Parent `ev_6427de47308ab07fa48f7780551613444393770d2306bd64938656bdd03f635d`.
- Summary `ev_e2b7d6003e612bebfa432ff14f347446a05032123322953a73ff10fa4d845dfd`.
- Two scripts, 4,353 bytes, zero parse failures. HTML is inventoried but not parsed
  by that selection; dynamic graph semantics remain partial.

The locale logic in `main.js` explicitly selects English at `boost.ink`, German at
`de.boost.ink`, and Dutch at `nl.boost.ink`. Unverified lookalike/alias domains are not
included. This is destination recovery from the observed format, not a promise that
every destination remains online or that other domains with a similar name work.

## Rekonise

Immediate unlock attempts on sixteen gates initially returned HTTP 403; that was
not evidence of an account requirement. REA traced the native widget's randomized
timers: ordinary actions take 10–15 seconds and watch-video actions 30–45 seconds,
sequentially. A fresh public metadata token, unchanged-token unlock GET, and a real
wait established the account-free path. All sixteen link gates resolved after a
bounded wait. Three uploaded-file gates and one email-list gate also resolved.
No action-completion, social, email-submission, analytics, or login API was used.

The adapter waits the timer upper bounds plus five seconds, adding a conservative
15-second allowance for an email UI step. That extra email interval is an
implementation allowance, not a native email timer. Its 30-action schema bound
is distinct from the current creator UI's 20-action limit. Link type 1 and file
type 2 are supported; snippet type 3 is deliberately unsupported in a URL UI.

One returned file URL also passed HEAD 200 without credentials or referrer.
No file body was requested. Signed storage URLs and public gate tokens remain
in memory and are omitted from published records.

- Native service/detail parent: `ev_d998f84f3925be419daf068948214c6d8e2996cf7d0a5ebad89ceceb2bd47eaf`.
- Timer parent: `ev_2fc5b1122bc6c06b8f9429af0288595724f1f4fec504f4c0bb3ec30a8a0edd7f`.
- [Timer follow-up](rekonise/timer-followup.md), [timed matrix](rekonise/timed-matrix.json),
  [file/email/status evidence](rekonise/file-modes.md), and [adapter checks](rekonise/README.md).

## ToneDen

ToneDen's fourteen sampled live gates returned `401 notAuthenticated` from the native
download endpoint, including file and redirect-link configurations across twelve
creators. A bounded native anonymous-session unlock also required login. No working
anonymous adapter was established, and ToneDen is not advertised as supported.
Its separate report retains source identities, REA evidence, and a sanitized matrix.

## Installed browsers and sample counts

Real installed Chrome checks resolved ten Sub2Unlock and eight Boost URLs, plus
three Rekonise link/file/email examples. A separate real Firefox check resolved
a Rekonise link in 20.758 seconds and an uploaded-file gate in 35.674 seconds.
These complement the HTTP/static corpus and
the synthetic Chrome/Firefox integration cases; they do not relabel the entire
corpus as installed-browser live testing. Records: `installed-browser-live.json`.

New-provider corpus total: **38 URLs** — 10 Sub2Unlock, 8 Boost (six IDs plus two
locale variants), and 20 Rekonise. ToneDen adds 14 investigated but login-required
URLs. Repeated token/timer/header probes are not counted as additional gates.

## Boundaries

Public source/metadata inspection and installed-extension checks do not connect
accounts, submit email, follow/save/join/like/comment, accept marketing preferences,
create gates, or bypass a CAPTCHA. Full media/archive/application files are not
downloaded. Signed/capability URLs, cookies, creator contact objects and raw public
page/API captures remain outside published reports and test fixtures. Recovered
links are only offered for the user to open; destination execution is never part
of resolution. Existing Hypeddit behavior and limitations remain separate.
