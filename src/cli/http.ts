import { CookieJar } from 'tough-cookie';
import { safeHttpsUrl } from '../core';

const redirects = new Set([301, 302, 303, 307, 308]);

/** A host-owned cookie jar; Node fetch itself does not maintain browser sessions. */
export class HttpClient {
  readonly jar = new CookieJar();
  constructor(
    private readonly transport: typeof fetch,
    private readonly signal: AbortSignal,
  ) {}

  async request(address: string, init: RequestInit = {}, origin?: string): Promise<Response> {
    let url = address;
    let method = init.method ?? 'GET';
    let body = init.body;
    const headers = new Headers(init.headers);
    const mode = init.redirect ?? 'follow';
    for (let hop = 0; hop <= 5; hop++) {
      this.signal.throwIfAborted();
      if (!safeHttpsUrl(url)) throw new Error('The request destination is not a public HTTPS URL.');
      const target = new URL(url);
      const authenticated =
        init.credentials === 'include' || (init.credentials !== 'omit' && target.origin === origin);
      headers.delete('cookie');
      if (authenticated) {
        const cookie = await this.jar.getCookieString(url);
        if (cookie) headers.set('cookie', cookie);
      }
      if (method !== 'GET' && method !== 'HEAD' && origin) headers.set('origin', origin);
      const response = await this.transport(url, {
        ...init,
        method,
        body: body ?? null,
        headers,
        redirect: 'manual',
        signal: init.signal ? AbortSignal.any([this.signal, init.signal]) : this.signal,
      });
      if (authenticated)
        for (const cookie of response.headers.getSetCookie())
          await this.jar.setCookie(cookie, url, { ignoreError: true });
      if (!redirects.has(response.status) || mode === 'manual') return response;
      await response.body?.cancel();
      if (mode === 'error')
        throw new Error('The provider redirected a request that forbids redirects.');
      const location = response.headers.get('location');
      if (!location || hop === 5) throw new Error('The server returned an invalid redirect chain.');
      const next = new URL(location, url);
      if (next.origin !== target.origin) {
        headers.delete('authorization');
        headers.delete('origin');
        // Never replay a provider form or authentication body to a different origin.
        if (method !== 'GET' && method !== 'HEAD')
          throw new Error('A form request redirected to a different origin.');
      }
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET';
        body = undefined;
        headers.delete('content-type');
        headers.delete('content-length');
      }
      url = next.href;
    }
    throw new Error('Too many redirects.');
  }

  forPage(origin: string): typeof fetch {
    return (async (input, init) => {
      if (input instanceof Request)
        throw new Error('This host expects URL-based provider requests.');
      return this.request(String(input), init, origin);
    }) as typeof fetch;
  }
}
