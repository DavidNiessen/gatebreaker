# SoundCloud comment and repost handling — 2026-10-28

Updated 2026-10-29: [automatic HTTP reposting](soundcloud-repost-http.md) replaces
the manual repost handoff described below for Droploud extension Downloads.
Existing native verification and final server approval still apply. Manual likes
remain separate, and real authenticated repost completion remains unverified.

The referenced [sc-gate-dl revision](https://github.com/D3SOX/sc-gate-dl/tree/983fc2ce025b436a5692a4ccc8700c3e90251df9)
does not universally bypass authenticated SoundCloud requirements. Its Droploud
adapter supplies configured comment text before connecting an account. For manual
reposts it attempts real account actions and asks for user help when verification
or browser challenges prevent completion. GateRush also supplies configured text;
modern Hypeddit channel buttons differ from its historical OAuth flow.

Gatebreaker's implementation follows the providers' own HTTP contracts. It does
not vendor the reference tool or copy account credentials from SoundCloud.

| Provider                              | Implemented behavior                                                                                                                                                                                                                                       | Remaining boundary                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Droploud                              | Save configured text through `/api/gate/<id>/step` with `step:sc_comment` before native authorization; retry the exact native comment refusal once; wait for API repost settling; verify manual repost/like state through `/api/soundcloud/verify-repost`. | A required real repost/like must exist. The extension can open the matching track and verify when the user returns; it never fabricates a like attestation. Final file delivery still requires server approval. |
| GateRush                              | Preserve an already-authorized HEAD; prepare configured text through `/save-comment/<slug>` with the native CSRF contract before SoundCloud authorization.                                                                                                 | The provider's final authenticated HEAD remains authoritative.                                                                                                                                                  |
| Hypeddit                              | Supply explicitly configured text only in a declared, unskipped `sc_comment_text` field; keep native-input and forged-metadata comments excluded.                                                                                                          | No live legacy SoundCloud OAuth address was established by the inspected pages. That historical handoff remains unsupported; modern channel/skip handling is unchanged.                                         |
| PUSH.fm                               | Preserve known native acknowledgment and authorization contracts.                                                                                                                                                                                          | Unknown comment/repost drivers are not converted into fake acknowledgments.                                                                                                                                     |
| Rekonise, Valorizd, Sub2Unlock, Boost | Preserve their existing public timer/query/embedded-destination behavior.                                                                                                                                                                                  | These adapters do not submit SoundCloud comments or reposts.                                                                                                                                                    |

The comment is supplied by the user, saved locally in `gatebreakerPreferences`,
and can be cleared in the popup. It is never inferred from native website inputs.
Only a Gatebreaker action can start processing. Changing preferences cancels active
operations and invalidates prepared comments and owned account-action windows.
Only the required provider receives the comment; inspection does not submit it.

## Evidence and validation

- Reference source: [Droploud](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/droploud.ts),
  [GateRush](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/gaterush.ts),
  [Hypeddit](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts).
- Droploud's current first-party component `1d0l2-pz5xzsu.js` and API client were
  parsed as inert source by REA:
  `ev_843b42dc405e6d9d4797328c4fc2fd6e86d4c33368e460ff934efa156d0b8398`.
  Two selected scripts parsed without errors; nineteen inventoried files were
  outside analysis and dynamic/backend semantics remain unknown.
- GateRush's retained first-party `gate-liquid.js` confirms `commentText`, `_csrf`
  and `X-CSRF-Token` before `/auth/soundcloud` navigation.
- Hypeddit's retained native handler validates comment text and serializes
  `sc_comment_text`; the mobile helper `/setSC` is not evidence of an OAuth URL.
- Unit cases cover invalid text, exact serialization, preparation order, refusal,
  duplicate prevention, cancellation, identity changes, settling and negative
  repost/like verification. Installed browser fixtures use authored account and
  repost windows, never real accounts or public comments.

No real SoundCloud account authorization, comment publication or repost was performed
for these changes. Authored success is not evidence that every real gate or
provider account configuration releases a file.
