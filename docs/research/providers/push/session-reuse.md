# Same-gate native Spotify step restoration

## Supported improvement

PUSH.fm's existing native mobile flow can persist an **opaque receipt for one
gate action**. The `ta.saveCookie(slug, 'cu/', driver, token)` helper writes a
seven-day cookie named exactly for the gate slug. Its JSON entries contain
`link`, `serviceId`, and `status: {driver, token}`. This is a native gate receipt,
not a Spotify OAuth credential. The Reward component's `Ha.updated` reads that
same slug cookie, restores its receipts to `completedActions`, and the native
Spotify button becomes disabled.

The staged provider recognizes this existing native restoration only when:

- The current gate is already bound through the validated PUSH provider.
- The specific recognized Spotify control is natively disabled.
- The cookie name, entry key, `cu/<slug>` link, service ID, and driver all match
  this exact gate and action.
- The receipt/status objects have the exact known native shape; token text and
  total cookie length stay bounded.

It never writes cookies, invokes sign-in, reads other cookie payloads, or saves
credentials/receipts to extension storage. The unchanged native receipt stays in
the active document's existing memory-only map. Download still makes the final
server lookup: a stale or invalid native receipt cannot produce success.

The integration has 18 native-session unit tests and an installed-browser authored
restoration case. No real account authorization was performed.

## Source and REA coverage

The retained public product bundle SHA-256 is
`0427647237121605eb00e10421d9e4ec1ff17837834fbe1f6660d69650d29d01`.
`session-reuse-provenance.json` records exact public-source byte ranges and identities.

- Reward `Ha`, source byte range 768460–773452: recorded REA parent
  `ev_0be0fb4d9bab342059040d01a5f4c684584c88e37bffc6fde9d7982b4ab7c7db`,
  summary `ev_ef8676a0cf2084193747b506b068080dbc9991c9b40744020ebed20e847c84eb`.
  Its `updated` hook supplies the native restoration observation.
- Action-list `ea`: recorded REA parent
  `ev_24d6b70fd30b5d9faa47597ac1229f348c8d920d7cbd4cebcf29538fde9ba2de`,
  summary `ev_6d79ec789e6d8972a922065328ecbbf0024ce57c689858b4e2ca4243129266c0`.
  Its native completion handler calls `ta.saveCookie` on mobile.
- Utility `ta`, source byte range 740654–741698, was manually checked as inert
  source in this follow-up. No fresh REA execution was available: the REA namespace
  was removed from this child task's live tool set. Existing Evidence is reused;
  no new evidence ID or account/runtime behavior is claimed.

These are bounded static observations plus authored unit fixtures. They do not
establish real authenticated account behavior, cookie availability on desktop,
or successful reward delivery after an actual Spotify sign-in.

## What cannot be promised

This restores a **previously completed same gate**, when the website already
retained its native receipt. It does not establish that Spotify is currently
signed in across other websites or that another gate's requested follow/save has
been authorized. A remembered extension boolean cannot prove either condition.

The retained Hypeddit public scripts (`160.0.10`) expose native completed slides
and a transient `hypeChildWindow` callback, not a reusable nonsecret Spotify login
flag. `gate-ul-preview.js:1370–1398` uses `inapp_<gate-id>` only as mobile navigation
state; it is not authentication evidence. Native completion already recognized
by Gatebreaker remains usable, but the in-app flag must not unlock Download.

Spotify documents that existing application approval may permit an automatic
redirect when `show_dialog` is false/default. Being logged in and having granted
an application's requested access are separate conditions. This extension should
preserve each gate site's native OAuth parameters and consent behavior; it has no
observed silent session-check contract to call here. See the
[Spotify authorization-code documentation](https://developer.spotify.com/documentation/web-api/tutorials/code-flow).

Native `window.open` calls also need direct user activation and normally one
gesture for each popup. Opening every required Spotify gate on page load or
after an asynchronous check can be blocked, and no account is available here to
validate an alternative. See [MDN window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open).

Do not replace required sign-in with guessed cookies, rewrite the website's
OAuth request, automatically authorize new follows/saves, or create a stored
"Spotify is logged in" flag. For a different gate without native completion,
the site may still require its normal sign-in/consent control.

## Suggested privacy text

PUSH.fm may restore a completed action from its own existing cookie for the
current gate, but only when its native control also shows completion. Gatebreaker
reads only that exact gate's known receipt shape, keeps the unchanged opaque gate
receipt in active page memory, and still requires the final server lookup. It
does not create the cookie, store a Spotify login flag, collect OAuth credentials,
or transfer completion to another gate. An existing Spotify session alone does
not guarantee that another site's required authorization can be skipped.
