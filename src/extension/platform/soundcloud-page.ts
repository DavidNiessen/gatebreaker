import type { SoundcloudRepostResult } from '../../core/domain/soundcloud';

/**
 * Serialized by scripting.executeScript into an owned SoundCloud main frame.
 * Keep all runtime dependencies inside this function. Only a state enum returns
 * to the extension; OAuth stays in the SoundCloud document and HTTP request.
 */
export async function performSoundcloudRepost(
  trackUrl: string,
  operation: string,
  mode: 'run' | 'cancel' = 'run',
): Promise<SoundcloudRepostResult> {
  interface State {
    operation: string;
    track: string;
    controller: AbortController;
    pending?: Promise<SoundcloudRepostResult>;
    complete?: boolean;
  }
  const scope = globalThis as typeof globalThis & { __gatebreakerRepost?: State };
  const failure = (state: SoundcloudRepostResult['state']): SoundcloudRepostResult => ({ state });
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const canonical = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length > 500) return null;
    try {
      const url = new URL(value);
      return url.origin === 'https://soundcloud.com' &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash &&
        /^\/[\w.-]{1,100}\/[\w.-]{1,200}\/?$/.test(url.pathname)
        ? url.origin + url.pathname.replace(/\/$/, '')
        : null;
    } catch {
      return null;
    }
  };
  const target = canonical(trackUrl);
  if (
    !target ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(operation) ||
    location.origin !== 'https://soundcloud.com' ||
    new URL(location.href).username ||
    new URL(location.href).password ||
    location.port ||
    window.top !== window
  )
    return failure('failed');
  const previous = scope.__gatebreakerRepost;
  if (mode === 'cancel') {
    if (previous?.operation === operation && previous.track === target) previous.controller.abort();
    return failure('cancelled');
  }
  if (mode !== 'run') return failure('failed');
  if (previous && (previous.operation !== operation || previous.track !== target))
    return failure('failed');
  if (previous?.controller.signal.aborted) return failure('cancelled');
  if (previous?.complete) return failure('complete');
  if (previous?.pending) return previous.pending;
  const state: State = previous ?? { operation, track: target, controller: new AbortController() };
  scope.__gatebreakerRepost = state;
  const run = async (): Promise<SoundcloudRepostResult> => {
    const tokenCookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith('oauth_token='));
    if (tokenCookie.length !== 1) return failure('login-required');
    let token: string;
    try {
      token = decodeURIComponent(tokenCookie[0]!.slice('oauth_token='.length));
    } catch {
      return failure('failed');
    }
    if (!/^[\x21-\x7e]{1,4096}$/.test(token)) return failure('login-required');
    const signal = state.controller.signal;
    const timer = setTimeout(() => state.controller.abort(), 15000);
    const read = async (response: Response, limit: number): Promise<string> => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing response');
      const decoder = new TextDecoder();
      let size = 0,
        text = '';
      try {
        for (;;) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) return text + decoder.decode();
          size += chunk.value.byteLength;
          if (size > limit) throw new Error('Oversized response');
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    };
    const hydrate = (doc: Document): unknown => {
      for (const script of doc.querySelectorAll('script:not([src])')) {
        const text = script.textContent ?? '';
        if (text.length > 2 * 1024 * 1024) continue;
        const match = /^\s*window\.__sc_hydration\s*=\s*(\[[\s\S]*\])\s*;?\s*$/.exec(text);
        if (match) return JSON.parse(match[1]!);
      }
      return null;
    };
    try {
      let hydration: unknown =
        canonical(location.href) === target
          ? (hydrate(document) ??
            (globalThis as typeof globalThis & { __sc_hydration?: unknown }).__sc_hydration)
          : null;
      if (!Array.isArray(hydration) || hydration.length === 0) {
        const response = await fetch(target, {
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          signal,
        });
        if (!response.ok) return failure(response.status === 429 ? 'rate-limited' : 'failed');
        const html = await read(response, 2 * 1024 * 1024);
        hydration = hydrate(new DOMParser().parseFromString(html, 'text/html'));
      }
      signal.throwIfAborted();
      if (!Array.isArray(hydration) || hydration.length > 128) return failure('failed');
      const tracks = hydration.filter(
        (record) => object(record) && record['hydratable'] === 'sound',
      );
      const clients = hydration.filter(
        (record) => object(record) && record['hydratable'] === 'apiClient',
      );
      if (tracks.length !== 1 || clients.length !== 1) return failure('failed');
      const track: unknown = tracks[0]['data'],
        client: unknown = clients[0]['data'];
      if (
        !object(track) ||
        !object(client) ||
        track['kind'] !== 'track' ||
        canonical(track['permalink_url']) !== target ||
        !Number.isSafeInteger(track['id']) ||
        Number(track['id']) < 1 ||
        track['urn'] !== `soundcloud:tracks:${track['id']}` ||
        typeof client['id'] !== 'string' ||
        !/^[a-zA-Z0-9]{32}$/.test(client['id'])
      )
        return failure('failed');
      const graph = async (
        operationName: string,
        query: string,
        variables: Record<string, unknown>,
      ): Promise<{ value: Record<string, unknown> } | SoundcloudRepostResult> => {
        signal.throwIfAborted();
        if (
          document.cookie
            .split(';')
            .map((part) => part.trim())
            .filter((part) => part.startsWith('oauth_token='))
            .join(';') !== tokenCookie[0]
        )
          return failure('login-required');
        const response = await fetch(
          `https://graph.soundcloud.com/graphql?client_id=${client['id']}`,
          {
            method: 'POST',
            credentials: 'include',
            redirect: 'error',
            cache: 'no-store',
            signal,
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              authorization: `OAuth ${token}`,
            },
            body: JSON.stringify({ operationName, query, variables }),
          },
        );
        const text = await read(response, 64 * 1024);
        signal.throwIfAborted();
        if (response.status === 401) return failure('login-required');
        if (response.status === 429) return failure('rate-limited');
        if (/captcha-delivery|datadome|captcha/i.test(text) && !response.ok)
          return failure('challenge-required');
        if (!response.ok) return failure('failed');
        const value: unknown = JSON.parse(text);
        if (!object(value)) return failure('failed');
        if (
          value['errors'] !== undefined &&
          (!Array.isArray(value['errors']) || value['errors'].length)
        ) {
          const errors = value['errors'];
          return failure(
            Array.isArray(errors) &&
              errors.some(
                (error: unknown) =>
                  object(error) &&
                  object(error['extensions']) &&
                  ['FORBIDDEN', 'UNAUTHENTICATED'].includes(String(error['extensions']['code'])),
              )
              ? 'login-required'
              : 'failed',
          );
        }
        return { value };
      };
      const existing = await graph(
        'GatebreakerTrackState',
        'query GatebreakerTrackState($urn: ID!) { allTracks(allTracksInput: {trackKeys: [{urn: $urn}]}) { __typename ... on Track { urn permalinkUrl engagement { hasReposted } } } }',
        { urn: track['urn'] },
      );
      if ('state' in existing) return existing;
      const currentData = existing.value['data'];
      const allTracks = object(currentData) && currentData['allTracks'];
      if (!Array.isArray(allTracks) || allTracks.length !== 1) return failure('failed');
      const current: unknown = allTracks[0];
      if (
        !object(current) ||
        current['__typename'] !== 'Track' ||
        current['urn'] !== track['urn'] ||
        canonical(current['permalinkUrl']) !== target
      )
        return failure('failed');
      const engagement = current['engagement'];
      if (!object(engagement) || typeof engagement['hasReposted'] !== 'boolean')
        return failure('login-required');
      if (engagement['hasReposted']) {
        state.complete = true;
        return failure('complete');
      }
      // RepostTrack sets reposted state. Never call the native toggle or UnrepostTrack.
      const posted = await graph(
        'RepostTrack',
        'mutation RepostTrack($trackUrn: ID!) { repostTrack(trackRepost: {urn: $trackUrn}) { __typename ... on Repost { caption } ... on TrackRepostFailedError { errorMessage } ... on TrackRepostCaptionFailedError { errorMessage } } }',
        { trackUrn: track['urn'] },
      );
      if ('state' in posted) return posted;
      const value = posted.value;
      const data = value['data'];
      const result = object(data) && data['repostTrack'];
      if (!object(result) || result['__typename'] !== 'Repost') return failure('failed');
      state.complete = true;
      return failure('complete');
    } catch {
      return failure(signal.aborted ? 'cancelled' : 'failed');
    } finally {
      clearTimeout(timer);
    }
  };
  const pending = run();
  state.pending = pending;
  try {
    return await pending;
  } finally {
    delete state.pending;
  }
}
