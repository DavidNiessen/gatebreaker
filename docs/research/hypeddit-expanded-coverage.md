# Expanded Hypeddit validation — 2026-10-28

Checked **82 public URLs** with the installed Chrome extension: **76 active download
gates**, three Link Gates outside this adapter, and three unavailable pages.
The active download sample covered **14 declared step codes** and
**40 step combinations**. It is a purposive sample, not a population success rate.

| Outcome                                                                    | Gates |
| -------------------------------------------------------------------------- | ----: |
| Validated destination and one-byte file access without account sign-in     |    47 |
| Validated destination and one-byte file access after Spotify sign-in       |    24 |
| Mixcloud/Deezer native handoff offered; real account completion unverified |     5 |
| Link Gates outside the current download adapter                            |     3 |
| Unavailable pages                                                          |     3 |

Thus **71 of the 76 active download gates released accessible files** in these runs.
All 24 attempted Spotify handoffs succeeded without an early final POST. An approved
existing browser session was used; no credentials or consent buttons were automated.
Future-service enrollment flags remained zero when present, and absent flags were omitted.

## What changed

- Treat native pipe-separated groups in steps_select as alternatives. Do not demand
  every service in an OR group. Prefer offered skips and supported paths, retaining
  mandatory Spotify when it is the selected requirement.
- Match native optional skip controls, including revealed next controls and the
  donation skip's literal data-step spelling. Explicit Spotify skip sets the native
  is_skippable flag; an unselected OR sibling alone does not.
- Prefer the verified Spotify path over an unskippable YouTube alternative. The
  mixed fuz864 gate refused the YouTube choice and released a file after Spotify.
- Add source-confirmed Mixcloud and Deezer native consent handoffs after ordinary
  server refusal. Keep initial anonymous resolution available for gates that allow it.
- Use iterator-compatible query validation for Firefox. Its installed fixture exposed
  a non-iterable URLSearchParams.keys() result; forEach enumeration repairs that path.

The Mikey Sky and Oppidan OR gates changed from unnecessary Spotify prompts to
verified account-free resolution. A mixed gate declaring all 14 sampled codes also
resolved. This does not prove that every mandatory action for each of those services
is implemented: for example the four mandatory Mixcloud and one mandatory Deezer
cases still need real-account completion testing.

## Method and limits

The sample combines the earlier 28-URL baseline, 49 newly inspected distinct public
gates, and additional OR examples found on current first-party pages. Public URLs
and metadata were deduplicated by gate ID before submissions. All current sampled
download pages used the modern unlimited layout, including older /track/ routes;
a separate legacy visual layout was not observed.

The pinned live candidate content bundle was
`9ebcbb823138a241e1578ed9c3cdfdc2eadc41349d91897fe4d1e07eab6ab075` (manifest 0.7.7). Subsequent Firefox query
enumeration repair preserves the observed URL contracts and is covered by installed
Firefox fixtures. The later Spotify automatic-reuse feature has separate validation.

Each live run used real provider HTTP responses and the installed extension's own
Download flow. Final delivery was deliberately intercepted at the extension API
boundary. A success here requires the server's true download status, a destination
accepted by the extension, and a real GET with Range: bytes=0-0 returning HTTP 206
and exactly one retained byte. The large files were not bulk-downloaded; this does
not establish complete file integrity. The earlier Sylver investigation separately
verified a complete original WAV download.

The anonymous pass stopped at required accounts or CAPTCHA. The approved Spotify
pass clicked only Gatebreaker's sign-in control and reused the native browser
session; no credential entry, grant acceptance, cookie copying or token export was
performed. The five Mixcloud/Deezer pages were checked again to verify their actual
sign-in prompts, without opening those account flows. Their source-derived contracts
and callback/session behavior also have authored installed-browser fixtures.

REA snapshots passively corroborate the public OR, 14-step and Mixcloud surfaces.
They do not contain earlier network events or establish that REA performed the live
requests. The browser harness records those request outcomes separately. First-party
JavaScript analysis has partial dynamic jQuery and unknown server-code coverage.
Evidence identifiers and public metadata are retained in the accompanying JSON;
cookies, CSRF/visit values, OAuth state/URLs, account identifiers and signed file URLs
are excluded.

No actual CAPTCHA appeared in this sample. Existing CAPTCHA fixtures and earlier
widget validation are separate evidence. Payment/password gates, custom domains,
unobserved legacy layouts, and universal provider support are not established.

## Reproduce the anonymous pass

Build the extension, install Playwright's Chromium, then run:

```sh
npm run build
npx playwright install chromium
npm run check:hypeddit -- docs/research/hypeddit-expanded-urls.json --allow-email --verify-files
```

This opt-in command submits the configured fixed email, stops at required accounts,
intercepts delivery and optionally verifies only byte zero. It uses a fresh temporary
profile and writes a dated sanitized report beneath work/hypeddit-live. Account-required
completion must be checked with the installed extension and manual sign-in; the runner
does not import or export account sessions.

## Per-URL results

| Public gate                                                                              | Declared steps                               | Final observed result         |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| [2789v0](https://hypeddit.com/2789v0)                                                    | sc,sp,dn                                     | Verified after Spotify        |
| [402dzu](https://hypeddit.com/402dzu)                                                    | sp                                           | Verified after Spotify        |
| [4yynp6](https://hypeddit.com/4yynp6)                                                    | yt                                           | Verified; no account          |
| [6bvcze](https://hypeddit.com/6bvcze)                                                    | sp                                           | Verified after Spotify        |
| [6ldvuo](https://hypeddit.com/6ldvuo)                                                    | sc                                           | Verified; no account          |
| [7meokt](https://hypeddit.com/7meokt)                                                    | sc,yt,sp,ig                                  | Verified; no account          |
| [857xli](https://hypeddit.com/857xli)                                                    | sc,sp                                        | Verified after Spotify        |
| [9na0wo](https://hypeddit.com/9na0wo)                                                    | email,ig,sp,ap,bc,yt,sc                      | Verified; no account          |
| [ansqrr](https://hypeddit.com/ansqrr)                                                    | email,sp,sc,ig,tw,tk                         | Verified after Spotify        |
| [aog8w1](https://hypeddit.com/aog8w1)                                                    | sc                                           | Verified; no account          |
| [8jqgyu](https://hypeddit.com/astro/miumiuxfiglidellestelleastromashup)                  | email,sc,ig,tk                               | Verified; no account          |
| [zava2t](https://hypeddit.com/atomicotroway/tedecampanaflavaoneremix)                    | sc,dn                                        | Verified; no account          |
| [4oqw1l](https://hypeddit.com/belka/tiktokraverfreedownload)                             | email,sc                                     | Verified; no account          |
| [bevg6x](https://hypeddit.com/bevg6x)                                                    | sc,sp,dn                                     | Verified after Spotify        |
| [64fjsi](https://hypeddit.com/bizarrapftquevedo/session52)                               | fb,yt                                        | Link Gate outside adapter     |
| [30pkz2](https://hypeddit.com/bounceandbass/without-you)                                 | email,sc,sp                                  | Verified after Spotify        |
| [k0nw0c](https://hypeddit.com/cajjmerewray/kmpadam-cajjmerewrayrecon)                    | sc,ig,sp,fb                                  | Verified; no account          |
| [vxgo48](https://hypeddit.com/damianbrix/meltremix)                                      | email,sc,ig,bc                               | Verified; no account          |
| [utnl0k](https://hypeddit.com/djaxonal/alphawave059)                                     | mc                                           | Verified; no account          |
| [565mlk](https://hypeddit.com/djchannel6sunil/sleepawayverma)                            | email,sc,yt,ap,sp,dz,mc,tw,th,ig,tk,bc,fb,dn | Verified; no account          |
| [xjl3j3](https://hypeddit.com/djmarkcutz/getlikememarkcutzfunkremix)                     | sc,ig,mc                                     | Account completion unverified |
| [kw1co8](https://hypeddit.com/djsandersville/selecta-remix)                              | email,sc,sp,tk                               | Verified; no account          |
| [e1n0t5](https://hypeddit.com/e1n0t5)                                                    | email,sc                                     | Verified; no account          |
| [5ehywo](https://hypeddit.com/email-take)                                                | email,sc,ig                                  | Verified; no account          |
| [kidntu](https://hypeddit.com/ennem/lambada)                                             | ig                                           | Verified; no account          |
| [k6fd0b](https://hypeddit.com/evagadd/presave)                                           | sp                                           | Verified after Spotify        |
| [g8um6c](https://hypeddit.com/g8um6c)                                                    | mc                                           | Account completion unverified |
| [wdsnbn](https://hypeddit.com/isgwan/freedlneverletugobootlegdubpackavailableonbandcamp) | sc,sp                                        | Verified after Spotify        |
| [gbax4f](https://hypeddit.com/jgmzschranz/innahotjgmzschranzreworkfreedl)                | sc                                           | Verified; no account          |
| [p0qfcy](https://hypeddit.com/jonasty/freedownload)                                      | email,sc,sp                                  | Verified after Spotify        |
| [o4i1cs](https://hypeddit.com/katofeatjon/turnthelightsoffdjdarkremix)                   | yt,sp,dn                                     | Verified; no account          |
| [n0n4j4](https://hypeddit.com/keilo/elaliento)                                           | email,sc,sp,ap,dz                            | Verified; no account          |
| [55lhpa](https://hypeddit.com/legacychill/hypnotized)                                    | sc,sp,ig                                     | Verified after Spotify        |
| [0kpjcb](https://hypeddit.com/makeitbounce)                                              | email,sc,sp,fb,ig,tw,bc                      | Verified; no account          |
| [f1wza9](https://hypeddit.com/makeme/restrictededit)                                     | sc,ig,sp                                     | Verified after Spotify        |
| [3xis1a](https://hypeddit.com/mikeysky/sexyandiknowit-followme-presave)                  | email,sp,ap,dn,ig,sc                         | Verified; no account          |
| [nokppt](https://hypeddit.com/mikeyskydantronix/noescape-download)                       | dn,sp,ap,email,sc,ig                         | Verified; no account          |
| [hn155b](https://hypeddit.com/mitm1/theclassicsreimagined)                               | sc,bc                                        | Verified; no account          |
| [s0t1g1](https://hypeddit.com/mntll%20/mntllaprsskipack02)                               | sc,ig,tk,sp                                  | Verified; no account          |
| [mwgjys](https://hypeddit.com/mwgjys)                                                    | dz                                           | Account completion unverified |
| [r95xzp](https://hypeddit.com/nickiminaj/superfreakygirlrionremix)                       | sc,dn,ig,sp                                  | Verified after Spotify        |
| [6dutgx](https://hypeddit.com/oppidan/circlesbootleg)                                    | email,sc,ig,sp,tk                            | Verified; no account          |
| [oynu8i](https://hypeddit.com/oynu8i)                                                    | sc                                           | Verified; no account          |
| [qugar2](https://hypeddit.com/qugar2)                                                    | sc                                           | Verified; no account          |
| [54fl6m](https://hypeddit.com/radicalone/radicalonepresentsglobalclubeditsremixesvol1-1) | email,sc,ig,bc,dn                            | Verified; no account          |
| [s11n28](https://hypeddit.com/s11n28)                                                    | sc                                           | Verified; no account          |
| [tifjbb](https://hypeddit.com/sonegr/claptonefeatnathannicholsonheartbeatsonegrremix)    | email,sc,sp,dn                               | Verified after Spotify        |
| [fcmkxx](https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit)                    | email,sc,sp                                  | Verified after Spotify        |
| [wgda66](https://hypeddit.com/techhouseremixmashupeditbootlegmix/malatotmtocani)         | sc,dn                                        | Verified; no account          |
| [](https://hypeddit.com/track/05764d)                                                    | —                                            | Unavailable page              |
| [09z1oz](https://hypeddit.com/track/09z1oz)                                              | sc,ig,sp                                     | Verified after Spotify        |
| [0igssh](https://hypeddit.com/track/0igssh)                                              | email,ig                                     | Verified; no account          |
| [0nv7py](https://hypeddit.com/track/0nv7py)                                              | email,sc                                     | Verified; no account          |
| [](https://hypeddit.com/track/0zzzv4)                                                    | —                                            | Unavailable page              |
| [](https://hypeddit.com/track/11wo3r)                                                    | —                                            | Unavailable page              |
| [1c5sev](https://hypeddit.com/track/1c5sev)                                              | sc                                           | Verified; no account          |
| [1lpp65](https://hypeddit.com/track/1lpp65)                                              | sc                                           | Verified; no account          |
| [223t1d](https://hypeddit.com/track/223t1d)                                              | email,sc                                     | Verified; no account          |
| [233f4q](https://hypeddit.com/track/233f4q)                                              | sc,sp                                        | Verified after Spotify        |
| [48qqna](https://hypeddit.com/track/48qqna)                                              | email,sc,sp,ig                               | Verified after Spotify        |
| [4nc8zm](https://hypeddit.com/track/4nc8zm)                                              | email,sc,ig,dn,bc                            | Verified; no account          |
| [62ssod](https://hypeddit.com/track/62ssod)                                              | sc,sp                                        | Verified after Spotify        |
| [6na1gj](https://hypeddit.com/track/6na1gj)                                              | sc,sp                                        | Verified; no account          |
| [8csdl1](https://hypeddit.com/track/8csdl1)                                              | sc                                           | Verified; no account          |
| [8r0u39](https://hypeddit.com/track/8r0u39)                                              | sc,sp,ig                                     | Verified after Spotify        |
| [b0buu5](https://hypeddit.com/track/b0buu5)                                              | email,sc                                     | Verified; no account          |
| [fuz864](https://hypeddit.com/track/fuz864)                                              | email,yt,ig,sp,th                            | Verified after Spotify        |
| [gryixw](https://hypeddit.com/track/gryixw)                                              | dn                                           | Verified; no account          |
| [gyjb4n](https://hypeddit.com/track/gyjb4n)                                              | mc                                           | Account completion unverified |
| [cszdwh](https://hypeddit.com/track/mc/cszdwh)                                           | mc                                           | Account completion unverified |
| [omqdqa](https://hypeddit.com/track/omqdqa)                                              | yt,dn                                        | Verified; no account          |
| [WE1pIM5DlMkLd4xXbHLW](https://hypeddit.com/track/sc/WE1pIM5DlMkLd4xXbHLW)               | email,sc                                     | Verified; no account          |
| [sutzbg](https://hypeddit.com/track/sutzbg)                                              | email,sc,sp                                  | Verified after Spotify        |
| [xryy2z](https://hypeddit.com/track/xryy2z)                                              | sc                                           | Verified; no account          |
| [zu6q59](https://hypeddit.com/track/zu6q59)                                              | sp,ig,dn                                     | Verified after Spotify        |
| [bpv7xh](https://hypeddit.com/tunamelt/ghostsnstuff)                                     | sc                                           | Verified; no account          |
| [d75fxx](https://hypeddit.com/twistedmelodiez/imgood)                                    | sc,sp,ap                                     | Verified; no account          |
| [uls0rs](https://hypeddit.com/uls0rs)                                                    | yt                                           | Verified; no account          |
| [xnenbf](https://hypeddit.com/url/xnenbf)                                                | email,tw,ig,sp                               | Link Gate outside adapter     |
| [vawyb4](https://hypeddit.com/vawyb4)                                                    | yt,ig,dn                                     | Link Gate outside adapter     |
| [vzck88](https://hypeddit.com/vzck88)                                                    | email                                        | Verified; no account          |
| [nr49k1](https://hypeddit.com/yussi/yussihigherfreedownload)                             | sc,sp                                        | Verified after Spotify        |
