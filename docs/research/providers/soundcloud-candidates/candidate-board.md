# Additional SoundCloud gate candidates — 2026-10-27

| Provider         | Primary evidence of actual music gates                                       | Current bounded result                                                                                             | Adapter decision                                                                                |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| DownloadGater    | SoundCloud August Kind / ALPMAN download links; live provider catalog        | 12 public models; all native JSON-only preflights 403 `soundcloud_unlock_required`                                 | No account-free adapter established                                                             |
| Beltergate       | Native chart and SoundCloud track models; provider SoundCloud buy-link guide | 10 matching public models; all configure OAuth/manual-profile + Turnstile; no file URL; verification not submitted | No account-free adapter established; do not mislabel unattempted verification as server refusal |
| Fangate.eu       | Native Top 30 music gates and session-provided SoundCloud action metadata    | 10 chart sessions HTTP 201 then JSON link HTTP 403; all require SoundCloud, four also Spotify                      | No account-free adapter established                                                             |
| The Artist Union | Historical genuine SoundCloud track descriptions                             | Two original `/tracks/<id>` pages 404; domain root repurposed to unrelated gambling content                        | Do not register repurposed domain                                                               |
| ArtistUnion.com  | No current music-gate evidence                                               | Parked / for-sale unrelated page                                                                                   | Do not register domain                                                                          |

Publish-safe deliverables in this directory:

- `downloadgater-report.md`, `downloadgater-live-matrix.json`.
- `beltergate-report.md`, `beltergate-live-matrix.json`.
- `fangate-report.md`, `fangate-live-matrix.json`, `fangate-source-provenance.json`.
- This candidate board.

All other HTML, scripts, and session artifacts in this work directory are private
investigation material and are outside the handoff/publication list. Do not copy
the directory recursively into the repository. No target repository files were
edited and no fabricated-support adapter or fixture was created.
