# Hypeddit live sign-in ordering

Investigated 2026-10-28 on the public Sylver example in a separate Chrome for
Testing profile, with the user's manual Spotify sign-in. The normal browser was
not controlled through desktop input. The recorder retained only nonsecret flags,
field names, response booleans and ephemeral keyed fingerprints. Authentication
queries, cookie values, credentials and signed download URLs are excluded here.

## Observations

- The native flow accepted the configured Proton email, skipped optional SoundCloud,
  opted out of future Spotify songs and returned HTTP 200 with a true download
  status and a destination. The user confirmed delivery.
- Released v0.7.6 submitted its first final download request before the native
  Spotify callback. Its subsequent requests returned false, including later checks
  after the successful callback.
- The final ordinary fields matched, apart from the expected page-specific nonce,
  external identifier and random track timestamp. In the failing page, the captured
  external identifier also matched the runtime native value.
- Retrying from the page's main context, with native Accept/Content-Type headers,
  and with native jQuery Ajax all still returned false. Those transport changes
  alone did not repair that session.
- The attempted same-page native comparison also returned false. The user's first
  success report described reaching the last screen; the recorder did not record
  a successful download on that page. A later fresh-page native attempt succeeded.
- A local diagnostic build offered sign-in immediately after accepted email,
  avoiding the initial final POST. Its real callback preceded its first final
  request. That request returned true with future-song enrollment set to zero,
  and automatic delivery produced a 77,792,480-byte RIFF/WAVE file.
- A proposed route-delay experiment was attached after that successful attempt;
  it held and released zero requests. The successful result came from the local
  sign-in discovery change, not a substituted response or intercepted auth proof.

The evidence supports changing request order. The server's exact refusal rule,
including whether a failed early attempt consumes or invalidates a nonce, remains
unknown. Header parity and an OAuth success screen alone were insufficient.

The final source implementation was then exercised again in the same diagnostic
profile with ordinary browser controls limited to Gatebreaker's own Download and
sign-in buttons. The existing Spotify session returned without new consent. The
recorder observed zero premature POSTs, one post-callback final POST, and a true
status with a destination. The browser's downloads API reported completion and
an existing 77,792,480-byte file; a 12-byte local read confirmed RIFF/WAVE.
Future-song enrollment remained zero. This final check used no request interception.

## Callback behavior

Literal-redacted native callback source shows that normal success advances the
opener's native slide or enables its legacy final control, then closes. If opener
access throws, it writes the existing hypeChildWindow storage flag before closing.
A successful opener path need not emit a storage event. COOP can also make a
content-script popup handle appear closed while sign-in remains open.

Gatebreaker therefore waits for those native return effects, the observed callback
path, or the native storage event before making a final check. None authorizes a
file by itself: the server must return true with a validated destination.
Elapsed time, focus and a closed/opaque handle cannot trigger the first check.
After a return, retries retain the existing backoff, cancellation and request limit.

Mandatory native sign-ins are discovered without a failing final POST. Email is
still submitted only after the user's Download action. Public-file HEAD discovery
and gates without mandatory native sign-ins retain their existing paths.

## Regression coverage

Unit tests cover slow sign-in, opaque/closed handles, native slide changes, repeated
callbacks, safe destinations, bounded retries, cancellation and stale sessions.
Installed Chrome and Firefox scenarios model the native opener callback and the
COOP storage fallback. Their fixture permanently refuses after any premature final
POST, and checks that none is sent during delayed consent.

The live result covers this Sylver gate in Chrome. It does not establish universal
Hypeddit coverage or live Firefox authorization, and does not remove real account,
CAPTCHA, comment or other server-enforced requirements.
