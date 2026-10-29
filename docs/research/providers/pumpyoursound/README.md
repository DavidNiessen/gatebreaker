# PumpYourSound

The current adapter is documented in [implementation.md](implementation.md), with
fresh public parsing results in [adapter-matrix.json](adapter-matrix.json). Ten of
ten current gates were recognized. Real account completion remains unverified;
fixture coverage does not change that boundary.

The report below records the earlier anonymous investigation before the adapter
was implemented. Its form-refusal evidence remains valid and is covered by tests.

## Historical native-form investigation (2026-10-27)

Eight music/FLP/sample-pack gates linked by their creators on SoundCloud remain
available as public HTML. Every tested anonymous native download-form submission
was rejected with a provider flash message requiring a SoundCloud, YouTube, or
Spotify action. No account-free destination was established. No adapter or host permission was added in that earlier investigation.

## Observed native contract

The page has `form#frm-freeDownloadForm`, POSTing to its own gate URL with hidden
`_do=freeDownloadForm-submit` and `send=Download`. The request tests sent only those
two fields, with `X-Requested-With: XMLHttpRequest`, omitted credentials, and manual
redirect handling. No comment, address, account credential, or social-action field
was submitted. No `/auth/*`, mark-complete, follow, analytics, or media endpoint was
called.

The server returned HTTP 200 JSON `{redirect: <same gate with _fid>}`. A separate
GET of only that exact same-origin/same-path flash page, using the fresh anonymous
response cookie in memory, exposed `#flashMessages li[data-type=error]`. This is
an error redirect, not a successfully unlocked URL. The normal gate form remained.
No original download URL or `.fangateDownload[data-redirect-link]` appeared.

Shipped `main.min.js` reads the native flash elements and handles Nette's
`response.redirect` with `window.location`. `internal_components.min.js` separately
shows the genuine successful-page contract: `.fangateDownload` has a
`data-redirect-link` that is navigated to after ten seconds. This successful-page
branch was observed statically, not reached by the live tests. The gate's
`data-stream` belongs to the audio preview player; it must not be passed off as
the original download. An archived-track warning also proves neither success
nor permanent unavailability of its external original.

## Corpus and boundary

`live-matrix.json` records the eight gate URLs, native refusal messages, declared
steps, and absent destination flags. The creator sources are:

- [Eso o New Gen Tool](https://soundcloud.com/uptempoesoo/esoo-new-gen-tool)
- [CREMATED AUDIO FLP](https://soundcloud.com/crematedaudio/free-phonk-flp)
- [Fastore 2026 pack](https://m.soundcloud.com/user-201887433/pack-free-2026-by-fastore)
- [Flow Music Latin pack](https://soundcloud.com/flowmusic-latin/free-pack-vol-24)
- [BbY WOW mashup](https://soundcloud.com/prodjpool/bby-wow-mashup-1)
- [KENAJ FLP](https://soundcloud.com/kenajmusic/free-flp-stock-plugins)
- [DJ GreenWhite](https://soundcloud.com/dj-greenwhite)
- [Enrique extended edit](https://soundcloud.com/dj-enrique-arregues/emilia-callejero-fino-big-one-en-la-intimidad-extended-enrique)

This is a bounded negative result for the observed anonymous native request. It
does not establish every possible PumpYourSound configuration or claim no other
path could exist. No full files, preview audio, social steps, or account sessions
were used. Raw HTML, anonymous cookies, and flash-query values are not published.

## REA evidence

Parent: `ev_ca5e7a219d62cd92cbeabdf0f7f28a0e554b25f192b6e3d45c1c51aae7a75bb9`.
Summary: `ev_01bd5b607b311bc887f7d0919d54f2f4dc1267ec5c1e0c30a60c1948c3d79efb`.
Two selected public scripts, 125,039 bytes, zero parse failures; three HTML files
outside source selection. Dynamic/jQuery graph semantics remain partial; static
analysis does not establish backend implementation or successful runtime unlock.

| Native source                                   | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `/js/main.min.js?csv=1792946038`                | `5a24a8333e5605aadade253809e8e6aba0addb9814f946a676220f7961b88dd0` |
| `/js/internal_components.min.js?csv=1792946038` | `6bfc30f95a211b8d3b53278f8c9af2edaf2b2d3b18103d35a64aba7f3c8f84cd` |
