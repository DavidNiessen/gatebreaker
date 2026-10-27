# Rekonise timer follow-up — 2026-10-27

The source-backed timer-only hypothesis succeeded on one gate. This supersedes the
initial inference from immediate HTTP 403 responses; it does not establish all-gate
support or file integrity.

## Source evidence

The native `app-social-unlock` widget lives in `chunk-LRlLUPdV.js`, explicitly imported
by the public gate route. SHA-256:
`c0631b664fe4f372b71259f06143ebce3b933231a5cb116b017441cd1f4e4f5d`.
All references are line 1 of the minified source, with UTF-8 byte offsets:

| Offset | Observation                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 6437   | Helper `st` selects a random real value between its supplied bounds.                                                                     |
| 33780  | `unlockedAfterSeconds` input defaults to 10 seconds.                                                                                     |
| 40967  | `handleAction` refuses concurrent ordinary actions and starts one action.                                                                |
| 41095  | `startUnlocking` stores `startedAt`/`requiredMs` and schedules local completion.                                                         |
| 41714  | `completeRealAction` marks the step complete and also invokes step/action analytics. Those analytics were not invoked in this follow-up. |
| 44491  | `getUnlockSeconds` uses 30–45 seconds for YouTube watch-video; otherwise it uses the default lower bound and 15-second upper bound.      |

Drillas declares two ordinary YouTube-subscribe actions. With unchanged input defaults,
their sequential UI wait is 20–30 seconds. A single 35-second wait covered that full
native UI interval plus a small margin. This is not a literal server-documented 35s
minimum and does not identify the server's exact validation rule.

REA parent `ev_2fc5b1122bc6c06b8f9429af0288595724f1f4fec504f4c0bb3ec30a8a0edd7f`,
summary `ev_aabfd16f7eac7ea1ed86715d5231c64ece0c57c6980523dd5a75dd1a503fabd5`.
Two selected files parsed, 61,513 text bytes, zero failures; dynamic semantics remain
partial and 39 inventoried files were outside this selection.

## One live recheck

Public gate: `https://rekonise.com/drillas-drill-and-trap-sample-pack-xzsbm`.

- Public metadata GET: HTTP 200; two action-type-1 requirements; unmodified token present.
- Wait: 35,008 ms with token held only in process memory.
- Native unlock GET using that exact token: HTTP 200, keys `url` and `pass`.
- Destination present: yes; origin `https://payhip.com`.

Only those two provider API GETs were made by this probe. No website script loading,
account, action-completion, analytics, ads, social mutations, email, CAPTCHA, destination
opening, or file download was performed. Gate tokens, returned passes and full
destination URLs are omitted from `wait-probe.json` and this report.

The initial sixteen immediate-request results remain a valid observation of early
refusal, but cannot classify the delayed path as unsupported. The implemented adapter
has a bounded wait/progress model. A follow-up recheck of all sixteen link gates
returned HTTP 200 destinations: see `timed-matrix.json`. That batch waited about
50.7 seconds to cover its longest gate; each row distinguishes intended and actual
waits. Separate one-action and two-action checks establish 20- and 35-second paths.
This is not a promise that every gate has a 20-second minimum or always succeeds.
