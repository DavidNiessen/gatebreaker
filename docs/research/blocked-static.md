# Blocked-gate static follow-up — 2026-10-26

Scope: retained shipped Hypeddit JavaScript version `160.0.10`, retained Sylver
HTML, and two additional scripts referenced by that HTML. No live POSTs,
account connections, email submissions, or target-repository changes were made
in this static subtask.

## Evidence and limits

The previous analysis reference was not retained in this REA connection. A new,
narrowly broadened analysis added `inline-8.js` to the original three selected
sources rather than silently assuming the old record was available.

- REA parent: `ev_fb7336f9c7f04ba6314fbb698e5a2f3fe94be3b90e62232bc86b559a02f4db71`.
- Summary: `ev_ab7c8acb412cfbeca22611ce6127782277c2c8746ab8bd84938f5afa22f153bb`.
- Four JavaScript files parsed; zero parse failures. Thirteen inventoried files
  remain outside this selection. Dynamic jQuery and server semantics remain
  unknown.
- Backward provenance trace for `skip_gate_steps`:
  `ev_2aa940684f013af09c12ecee559e7a9de72aa526f1ae1bf0725b70f0c5e21e13`.
  It found one property node with zero traversed relations and partial coverage;
  it does **not** establish server behavior.
- Newly fetched `scripts.js` and `custom.script.js` analyzed separately:
  `ev_7834c8bc531e12341921b4dd95c4526b7f2c38644c4ea53970e3ba31cc5522d9`.
  Two files parsed, no parse failures. These static observations are not runtime
  execution evidence.

All source line references below refer to retained, unformatted artifacts. The
report deliberately omits page token values, cookie values, OAuth URLs, and
signed file URLs.

## Observations

### Required versus optional steps are distinct

Retained Sylver HTML line 2086 declares three display groups: Email, SoundCloud
(Optional), and Spotify. Lines 646–647 show the original skip flag is zero and
the machine step list is `email,sc,sp`; line 673 declares the AND sequence
`dw,email,sc,sp`. Only SoundCloud has an actual visible skip link (line 516).

`nwSteps` alone therefore cannot establish whether a requirement is optional.
This is a meaningful data distinction for diagnostics and any future provider
metadata, not proof that changing the metadata unlocks anything.

### The mobile/in-app skip flow has a server-side pathway contract

`gate-ul-preview.js` lines 165–210:

- The ordinary skip listener reads the clicked control's `data-step`.
- It adds a hidden `skip_gate_steps[]` input holding that code.
- The `sp` case changes `is_skippable` to 1; other cases do not.
- The `email` case exposes final email-entry controls rather than establishing
  a verified email identity.
- In the mobile/in-app condition, the same listener also posts to the observed
  `/setGatePathway` endpoint with `fan_gate_id` and `stepName`.

Lines 941–958 show the final mobile/in-app download flow reading
`/getGatePathway` with `fan_gate_id`; on `action == 1`, it replaces the locally
collected skip array with `res.skip_gate_steps` before the final request.

`inline-10.js` lines 102–145 contains a related OR-group contract:
`jumpGate` uses the pipe-separated group in `steps_select`, removes the selected
type, adds other alternatives to the skip list, and in the mobile/in-app case
posts `/setGatePathwayOr` with `fan_gate_id`, `skipSteps`, and `selectedStep`.
The Sylver sample is not declared as an OR group.

These are observed first-party state contracts. Static code does not establish
their current server validation, whether they apply to required groups, or
whether using them changes a rejected download response.

### Final payload parity has not yet been established

`gate-ul-preview.js` lines 971–1005 construct the real final payload. In addition
to the fields already sent by Gatebreaker, it includes:

- `email` (read from the email field, even when blank);
- `is_mobile`;
- `external_id` from the page's gate configuration;
- `hypesource` and `adcode`;
- populated `additional_*` profile arrays and the `additional_dz_type_array`, `additional_ap_type_array`, and `additional_th_type_array` fields;
- optional comment text fields when their inputs exist.

The current provider omits these fields. Exact nonpersonal, anonymous request
parity is a bounded hypothesis worth checking before inferring additional
server rules. Empty arrays may already be omitted by jQuery serialization, so
array-field absence is not automatically a discrepancy. Neither this source
nor REA proves that any missing field explains the failure.

The action values observed in lines 769–788 are `DOWNLOAD`, `EMAIL`, and
`LINK_GATE`. The latter two have different product semantics; they are not
alternative file-download bypasses. The email branch can deliver mail and
should not be invoked by an anonymous no-email experiment.

### The trust flag is not a download request field in these bytes

Lines 674–680 and 713–726 compute a native-event `isTrusted` value. A bounded
search of this captured handler finds no subsequent read or field carrying it
to the download request. The request body at 971–1005 has no trust flag.
Synthesizing trusted events is not a source-supported explanation for the
observed rejection.

### Email verification is a separate submission

`verify-email-ul.js` lines 161–182 gather email/name/gate data. Lines 197–200
and 245–250 post it to `/verifyEmailAddress`; only a response with `status === T`
advances the gate (215–232 and 262–282). CAPTCHA handling is separate in the
same file. The skip listener does not invoke verification. These bytes do not
show how the backend stores the verification result or checks it later.

### The public Spotify preview is not a separate file path

`gate-ul-preview.js` lines 602–654 poll `/check_sp_user_playback` for a track and
advance the carousel after a 30-second timeout. This is a UI/playback flow.
The captured bytes do not contain a separate original-file destination or
download request behind the preview's Download-labelled control.

### No alternate file endpoint found in the two additional referenced scripts

`https://hypeddit.com/js/scripts.js?v=160.0.10` (299 bytes) only installs/removes
the CSRF AJAX header. `https://hypeddit.com/js/custom.script.js` (8,963 bytes)
contains interface widgets/animation code. A bounded text search of those two
files found no `gate/download`, `social_currency`, skip-pathway, or original-file
download helper. This is an absence claim about these two files only.

No selected source handles the response field `social_currency`. Thus the
meaning of its observed zero value is not explained by these client bytes.

## Prioritized hypotheses for bounded runtime checks

1. Compare the ordinary anonymous final request field-for-field with the
   extension request, retaining only empty/nonpersonal values and the current
   page's own fields. Verify the actual file response if a destination appears.
2. Compare local skip metadata with the observed server-stored pathway in a
   fresh anonymous session, without invoking a social service or email action.
   The mobile/in-app source provides the concrete contract to investigate.
3. Preserve required-versus-optional labels in research results, and compare
   blocked gates by declared required groups rather than service code alone.
4. Do not spend further work on `isTrusted` spoofing or the Spotify preview
   carousel unless new runtime evidence identifies a request not visible here.

No new bypass is established by this static subtask. In particular, no claim is
made that `/setGatePathway` accepts unsupported skips or grants file access.

## Source digests

| File               | SHA-256                                                            |
| ------------------ | ------------------------------------------------------------------ |
| gate-ul-preview.js | `02fc60d5bf1ec571009231cc1a05d4fdd2b3540cabef2826c91d7396a295528d` |
| verify-email-ul.js | `17f2707bc0a7ae918caf90573b8d51b576c514ad1ba31b45ebabcbdfe578264e` |
| inline-10.js       | `2ce2f13e19b9da191918858827fb3710adbc0f2beabb0a0325d3caff3a1d516d` |
| inline-8.js        | `7133ba6652036d60b6115a2c1ca53befff73389d2bf5b2f5b0f5cec91d454fb7` |
| scripts.js         | `68a5d922726e88c259ca0a489d19cbd6921a6f70966b2705917523bdbce95f88` |
| custom.script.js   | `c72b837f807a19096438c3117266d2d845d32cae13548e5d5015627a34a14665` |

## Preview audio follow-up

The three player scripts referenced by Sylver's HTML expect a separately cut
preview. `gate-wave.js` lines 26–36 read preview/full ranges separately; lines
59–61 map preview audio time to original-track time by adding the clip offset;
lines 66–77 reverse that mapping when seeking. `peakcontrol.js` line 88 assigns
the preview URL directly to the audio element. `soundplayeraudiotag.js` lines
18–20 use native `onended`; its update interval only reports playhead position.
No 90-second playback timer was found in the three selected files.

The retained Sylver metadata describes a 90-second excerpt starting at
174.056780 seconds within a 294-second original. The full waveform's frame
length therefore is not evidence that the preview media is full length.
Actual preview bytes remain a separate runtime/media-metadata question; this
subtask requested no audio body. Do not offer it as the original main file.

REA parent `ev_f0da91b5a04cd461d5d70c0849e6c799aef87d933f1efa15740008f64ede88ff`;
three sources parsed, zero failures, semantic coverage partial/unknown.
Full details are in `preview-audio-findings.md`.

| Player script          | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| gate-wave.js           | `64f81b8dae93d80ce809d03135af9598b1017ccf2558d91f06f06117ca8c1635` |
| peakcontrol.js         | `ad1b77f8b7d73aeab4dcf9564fe687852d5fbb239a426a0d99211987960ee908` |
| soundplayeraudiotag.js | `0565ffe1563bb600d00a6017ccee5b0fb24581a9a1c2ecbb8f6f436f70c2fe58` |

## Chart/Arcade download follow-up

### Concrete alternate chart-download request found

Sylver's page contains a link to
`https://hypeddit.com/music/genre/hardcore-hard-techno` (retained HTML line 622).
That public chart page references
`https://hypeddit.com/js/musicLanding.js?v=160.0.10` at captured line 1546.

In the fetched `musicLanding.js` lines 423–447,
`TopHundredDownload.topTrackDownload(downloadlink)` sends:

- Method: POST.
- Path: `/gate/download/sc`.
- Format: form data; response parsed as JSON.
- Body fields: `file` is `encodeURIComponent(downloadlink)`;
  `download_visit=true`, `profile_downloads=true`, and `page=single`.
- Call sites in generated chart markup pass `tracksData[i].uid`, so the input
  is the gate's public UID rather than its numeric internal gate ID.
- The handler itself performs no email, OAuth, vote, follow, save, or comment.
- The client then navigates only if `res.URL` is a nonempty relative path
  beginning with one slash (not a protocol-relative double slash).

This is an observed first-party alternative to `/gate/download/ul`, not an
invented endpoint. The chart markup initially hides `.downloadArea` and shows
`GET THIS TRACK` links; activation and server-side session requirements are not
established by the handler alone. No anonymous success is claimed here.

### Arcade does not itself expose a second file URL in the selected bytes

`choose-music.js` lines 188–203 posts an empty body to
`/arcade_previous_download`, ignores the response, and navigates to the
control's `data-href`. The Sylver markup's destination is its ordinary
`/track/fcmkxx` gate (HTML line 1302). This could change session navigation state,
but the source does not return or parse a file URL.

The Hot/Not controls at `choose-music.js` lines 66–139 post a vote action to
`/setarcadetrack` using `fangate_id`, `spotlight_id`, `action`, `stats_id`, and an
attempt/trust indicator. This is an actual rating action, not a file download;
it should not be silently invoked for a download-only experiment.

`multiple-player-wave.js` lines 421–422 optionally calls the externally defined
`activateDowload` callback when custom playback starts. No definition was found
in the selected player, Arcade, chart, global utility, or retained gate sources.
The callback is not itself evidence of a download URL.

### REA and source identity

REA parent: `ev_b97262c712f3fecb79464e8e87bbe70466f39c5b4a15b03341da92fb8a980480`.
Summary: `ev_652ab9b59614743d72b5a3358bcdf23d7283c947ffb8ad971013c594465eff97`.
Four selected JavaScript files parsed, zero failures. The captured chart HTML is
inventoried but not analyzed by this selection; semantic coverage remains
partial/unknown. No POSTs were made and no script was executed in this subtask.

| Script                  | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| choose-music.js         | `35902ec673c42e5a9c893900e527175b7ba4bdf0a664ff4912b427325977089f` |
| multiple-player-wave.js | `92468ef1b126b6a60bdcf1a6bb843b219749c23c709274e100aa51f27ff9f76c` |
| musicLanding.js         | `60ded07feebcb67ca74023d76271dd245bee36fdf48df0042428d89ddf98e1b4` |
| spotlightCustom.js      | `f3fb29f79aac91d630d444fcf1621f3028af5b8bb7e736b93099a0e8e1ecfd74` |
