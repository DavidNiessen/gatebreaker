# sc-gate-dl CLI authentication comparison

Source inspected on 2026-10-29 at
[`983fc2ce025b436a5692a4ccc8700c3e90251df9`](https://github.com/D3SOX/sc-gate-dl/tree/983fc2ce025b436a5692a4ccc8700c3e90251df9).
This is source analysis only: no reference-project dependencies were installed,
and no account or browser job was run. No reference implementation code is copied.

- [`src/hypedditHttp.ts`](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypedditHttp.ts)
  implements an HTTP fast path. Its supported step set excludes Spotify. An
  unsupported step or a refused final download returns no file so its caller can
  use the browser implementation.
- [`src/browserLaunch.ts`](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/browserLaunch.ts)
  launches a browser through CloakBrowser/Puppeteer, with a persistent user-data
  directory and headed/headless/Xvfb choices. A remote browser view still represents
  a controlled browser session, not an independent browser receiving a login URL.
- [`src/soundcloudLogin.ts`](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/soundcloudLogin.ts)
  detects login in a browser page, waits for manual completion in interactive mode,
  then saves that browser context's SoundCloud cookies. Noninteractive mode refuses
  a required login instead of treating an opened URL as approval.
- [`src/hypeddit.ts`](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/hypeddit.ts)
  loads saved SoundCloud and optional Spotify cookies into its browser context.
  Its Spotify handler requires a saved Spotify cookie file.
- [`src/droploud.ts`](https://github.com/D3SOX/sc-gate-dl/blob/983fc2ce025b436a5692a4ccc8700c3e90251df9/src/droploud.ts)
  launches a browser, imports SoundCloud cookies and uses provider authorization
  pages/callbacks. Its required-login path waits for login in that browser.

The inspected code does not establish a general URL-only OAuth/device-login
protocol that authenticates an unrelated Node HTTP cookie jar. Matching its
architecture means retaining a browser fallback and reusing its authenticated
state. Removing browser automation instead requires provider-specific portable
handoffs or explicit website continuation; these are different product choices.
