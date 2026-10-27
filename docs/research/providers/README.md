# Additional providers — REA investigation, 2026-10-27

This investigation considers four common social/download gate providers. Only
evidence-backed account-free paths are implementation candidates. Exposing a gate's
destination is distinct from verifying or downloading the destination's file.

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

## ToneDen and Rekonise

ToneDen's fourteen sampled live gates returned `401 notAuthenticated` from the native
download endpoint, including file and redirect-link configurations across twelve
creators. A bounded native anonymous-session unlock also required login. Rekonise's
sixteen sampled music/sample-pack gates exposed public metadata but rejected the
current native token-bearing unlock with HTTP 403; an old tokenless recipe returned 400. No working anonymous adapter was established for either provider, and neither
is advertised as supported. Their separate reports retain source identities,
REA evidence and sanitized URL matrices.

## Boundaries

Public source/metadata inspection and installed-extension checks do not connect
accounts, submit email, follow/save/join/like/comment, accept marketing preferences,
create gates, or bypass a CAPTCHA. Full media/archive/application files are not
downloaded. Signed/capability URLs, cookies, creator contact objects and raw public
page/API captures remain outside published reports and test fixtures. Recovered
links are only offered for the user to open; destination execution is never part
of resolution. Existing Hypeddit behavior and limitations remain separate.
