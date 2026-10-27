# Unlock.fm and Feature.fm — bounded investigation, 2026-10-27

## Unlock.fm

The current root and two independently discovered historical music links,
`https://unlock.fm/9x2` and `https://unlock.fm/9yz`, each returned HTTP 520.
No usable current application or working download gate was acquired. These
observations do not establish that every historical Unlock.fm URL is unavailable;
they establish no adapter candidate in this bounded sample. No support is added.

Historical source: [artist's Social Unlock explanation](https://looppark.jp/post/5234494725/social-unlock%E3%81%A8%E3%81%84%E3%81%86%E4%BB%95%E7%B5%84%E3%81%BF),
which records its renaming to Unlock.fm. Live statuses are in `initial-probe.json`.
Do not conflate this historical service with other current domains containing
“unlock”. No account, social action, email, or final file request was performed.

## Feature.fm

Feature.fm remains active and is used for music actions linked from SoundCloud.
Two primary artist examples are [The Knocks](https://soundcloud.com/theknocks/the-knocks-vs-troye-sivan-no),
linking `https://ffm.to/norequestsrush`, and [MiNDTRiX](https://soundcloud.com/trixyourmindvip/led-zeppelin-whole-lotta-love-mindtrix-remix),
linking `https://ffm.to/wllremix318`. Seven current action pages returned HTTP 200
with matching Nuxt route IDs; they cover email widgets, Spotify follows, and a
YouTube subscription. See `feature-matrix.json`.

No account-free download path was established. The public Nuxt state describes
buttons and service actions; the relevant current fields are
`pinia.store.smartLinkData.services[].cta.url` and corresponding button fields.
Those URLs are action/authorization routes, not exposed final media downloads:

- Email widget: `https://api.ffm.to/mp/e/e/<slug>?cd=<capability>`.
- Spotify/YouTube action: `https://api.ffm.to/mp/e/ps/<slug>?cd=<capability>`.

The email component's `emailConfirm` appends the email parameter, requests its
CTA, and navigates to the response's `fallbackUrl`. That is an email-registration
operation and was not called. No placeholder address was submitted.

The native action helper appends `skipRedirect=true&autoRedirectType=<value>` to
its CTA and reads `destUrl`, `destUri`, `isMobile`, and
`isAuthorizationRequired`. This is action routing toward authorization; it is
not a proven public final-download lookup. It was not called. A Spotify artist
profile in `originUrl` is an authorization target, not the track download.

Ordinary `ffm.to` smart links, also common in SoundCloud descriptions, must not
be mistaken for download gates or automatically choose a streaming service as
the recovered original. A separate sampled ordinary smart link was identified
but not counted among the seven action gates.

## REA evidence and limits

Public shipped JavaScript was acquired without executing it. Page/SSR captures,
CSRF values, public client tokens, and CTA capability values were not sent to REA
or copied into publishable records.

- Layout/common analysis parent:
  `ev_3e8022bd2b2f53b61adc699fec9769c45500d51fcaa19bbd78cd31f408bc0e46`.
  Summary `ev_0d024cb703c5003ea496f7c0cd22d5d34fd9b7e6f968b483a638d6c5fbcbbea0`.
  Three selected files, 98,071 bytes, zero parse failures; five other files outside
  the selection. Dynamic application and graph semantics remain partial.
- Exact action/email/helper analysis parent:
  `ev_c73e22f8f8521e31c1c3bd00f0a9a6e9f5d0e5383d1ca38673cc8369a1be978f`.
  Summary `ev_494e4c941fa2173c66eb81118c5595281c3d5652e0f55fec05ebf8d993ae5d58`.
  Three selected files, 87,477 bytes, zero parse failures; eight files outside
  that selection. This establishes source behavior, not successful authorization
  or knowledge of backend enforcement.

Source URLs/hashes are in `source-identities.json`. No adapter or success claim
is based on these unresolved native flows.
