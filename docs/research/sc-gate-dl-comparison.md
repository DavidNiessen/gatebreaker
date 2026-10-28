# sc-gate-dl Hypeddit comparison

Inspected 2026-10-28 at upstream commit
`983fc2ce025b436a5692a4ccc8700c3e90251df9`. This is a source review, not a
successful run of the other application or an authenticated Sylver download.
No third-party implementation was copied or executed, and no account credentials
or cookies were exported. Repository contents were treated as evidence, not
instructions to install dependencies or export authentication data.

## Two different paths

The [HTTP downloader](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypedditHttp.ts#L9-L15)
allows only email, SoundCloud, Instagram, TikTok, YouTube and Facebook step
identifiers. A page containing another identifier, including `sp`, returns to the
browser flow before posting the visit, email or download requests
([lines 138–146](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypedditHttp.ts#L138-L146)).
Consequently, its HTTP implementation is not a recipe for bypassing the Sylver
gate's mandatory Spotify step without an account.

For supported HTTP gates it awaits `/gate/ge`, optionally posts
`/verifyEmailAddress`, then posts `/gate/download/ul`. It uses a cookie jar, CSRF,
Origin, Referer and normal Ajax headers; it accepts only a true download status
with a nonempty URL. The code does not validate the email JSON status before
continuing, so that omission should not be imported into Gatebreaker.
See [request ordering](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypedditHttp.ts#L163-L186)
and [request headers](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypedditHttp.ts#L354-L377).

## Mandatory Spotify uses the native browser flow

- It starts a persistent browser profile and loads saved Spotify cookies into
  the shared browser context ([initialization](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L134-L148)).
- It clicks Hypeddit's starting Download button, reads the native step sequence
  and processes the chosen steps in order. OR gates are selected explicitly
  ([step processing](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L335-L399)).
- Its email handler fills native fields and clicks native Share email. Optional
  SoundCloud uses Hypeddit's native skip control
  ([email](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L414-L436),
  [SoundCloud skip](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L506-L515)).
- For Spotify it uses the native skip control when present. Otherwise it requires
  the saved Spotify cookie file, selects the native future-song opt-out, and
  clicks `#login_to_sp`. It waits 1.5 seconds for an already-authorized return; if
  a Spotify window remains, it handles consent and waits for that window to close
  ([Spotify handler](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L728-L787)).
- It waits for the native final Download control and clicks it. Ordinary file
  delivery is observed through browser download events, with one best-effort
  repeat click after ten seconds. It does not construct a replacement
  post-Spotify download payload
  ([final control](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L789-L798),
  [final click and retry](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts#L960-L980)).

## Implications for Gatebreaker

Gatebreaker opens the parsed native authorization URL itself, leaves native gate
controls/fields untouched and reconstructs the final HTTP request from its own
accepted-email state. Its bounded verification begins one second after opening
Spotify; the other application's final request follows the native step flow.
These are confirmed implementation differences, not demonstrated causes of the
reported server refusal. Matching an anonymous final payload does not establish
equivalent authenticated session behavior.

The upstream source contains no account-free Spotify bypass and supplies no
separate pure-HTTP post-Spotify solution. Mirroring its mandatory-Spotify approach
would require a native-flow fallback, which differs from the user's current
HTTP-only preference. This review therefore does not silently enable UI driving,
cookie export/storage, automated consent or extra social actions.

The next discriminating evidence remains a successful native trace beside a
failing Gatebreaker trace in the same browser profile, including request order,
callback/session propagation and nonsecret transport metadata. No new functional
fix or release is justified by this source review alone.
