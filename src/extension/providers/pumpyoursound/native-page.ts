export type PumpNativeState = 'complete' | 'failed' | 'cancelled';

/** Serialized into the provider's MAIN world. No credential leaves that world. */
export async function performPumpNativeAction(
  gate: string,
  operation: string,
  comment: string,
): Promise<{ state: PumpNativeState }> {
  type Request = {
    done(callback: (value: unknown) => void): Request;
    fail(callback: () => void): Request;
    abort?(): void;
  };
  type Page = Window & {
    SC?: {
      options?: { client_id?: string; redirect_uri?: string };
      connect(options: { window: Window; connected(): void }): unknown;
    };
    $?: { nette?: { ajax(options: { url: string; method: string }): Request } };
    __gatebreakerPumpJobs?: Map<string, { stop(): void }>;
  };
  const page = window as Page;
  const expectedPath = location.pathname;
  const origin = location.origin;
  const form = document.querySelector<HTMLFormElement>('#frm-freeDownloadForm');
  const api = document.querySelector('#soundcloud-api');
  const activeGate = () =>
    location.origin === origin &&
    location.pathname === expectedPath &&
    document.querySelector('#frm-freeDownloadForm') === form;
  if (
    !/^\d{1,12}$/.test(gate) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operation) ||
    !/^https:\/\/(?:www\.)?pumpyoursound\.com$/.test(origin) ||
    !new RegExp('^/f/[A-Za-z0-9_-]{1,64}/[A-Za-z0-9_-]{1,200}/' + gate + '/?$').test(
      expectedPath,
    ) ||
    form?.querySelector<HTMLInputElement>('input[name="_do"]')?.value !==
      'freeDownloadForm-submit' ||
    form.getAttribute('data-gatebreaker-pys-operation') !== operation ||
    api?.getAttribute('data-client-id') !== 'QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq' ||
    api.getAttribute('data-redirect-url') !== 'http://pumpyoursound.com/?do=soundConnectAuth' ||
    page.SC?.options?.client_id !== 'QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq' ||
    page.SC.options.redirect_uri !== 'http://pumpyoursound.com/?do=soundConnectAuth' ||
    typeof page.SC.connect !== 'function' ||
    typeof page.$?.nette?.ajax !== 'function'
  )
    return { state: 'failed' };
  const follow = !!document.querySelector('.fangateStep--soundcloud:not(.done)');
  const requiredComment = !!document.querySelector('.fangateStep--comment:not(.done)');
  if (!follow && !requiredComment) return { state: 'complete' };
  const declared = (selector: string, path: string) => {
    try {
      const element = document.querySelector(selector);
      const url = new URL(element?.getAttribute('data-href') ?? '', origin);
      let allowed = true;
      url.searchParams.forEach((_value, key) => {
        if (
          !['fangateId', 'accessToken', 'text'].includes(key) ||
          url.searchParams.getAll(key).length !== 1
        )
          allowed = false;
      });
      return (
        !!element &&
        allowed &&
        url.origin === origin &&
        url.pathname === path &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.searchParams.get('fangateId') === gate &&
        url.searchParams.get('accessToken') === 'access_token'
      );
    } catch {
      return false;
    }
  };
  if (
    (follow &&
      !declared('.socBtn__soundcloud.sn-connect-with-soundcloud', '/auth/soundcloud-events/')) ||
    (requiredComment &&
      !declared('#fangate-send-comment.sn-connect-with-soundcloud', '/auth/sc-comment/'))
  )
    return { state: 'failed' };
  const text = comment.trim();
  if (
    requiredComment &&
    (text.length < 2 ||
      text.length > 1000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
  )
    return { state: 'failed' };
  const jobs = (page.__gatebreakerPumpJobs ??= new Map());
  if (jobs.has(operation)) return { state: 'failed' };
  // The content adapter preopens this owned blank window during the user's
  // trusted sign-in click, preserving popup activation through background IPC.
  const popup = window.open('', `gatebreaker-pys-${operation}`);
  if (!popup || popup.closed) return { state: 'failed' };
  return new Promise((resolve) => {
    let settled = false;
    let request: Request | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (state: PumpNativeState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      jobs.delete(operation);
      if (form.getAttribute('data-gatebreaker-pys-operation') === operation)
        form.removeAttribute('data-gatebreaker-pys-operation');
      request?.abort?.();
      try {
        popup.close();
      } catch {
        /* Owned authorization window may already have closed. */
      }
      resolve({ state });
    };
    jobs.set(operation, { stop: () => finish('cancelled') });
    timer = setTimeout(() => finish('failed'), 120000);
    const ajax = (address: string) =>
      new Promise<unknown>((accept, reject) => {
        if (settled || !activeGate()) {
          reject(new Error('inactive'));
          return;
        }
        try {
          request = page.$!.nette!.ajax({ url: address, method: 'GET' });
          request.done((value) => accept(value)).fail(() => reject(new Error('request failed')));
        } catch {
          reject(new Error('request failed'));
        }
      });
    try {
      page.SC!.connect({
        window: popup,
        connected() {
          void (async () => {
            try {
              if (settled || !activeGate()) return finish('cancelled');
              // The provider's callback owns token exchange. Read only its access
              // token endpoint; native gate URLs do not use refresh-token fields.
              const token = await ajax('/?do=mySoundcloudAccessToken');
              if (
                typeof token !== 'string' ||
                !token ||
                token.length > 8192 ||
                /[\x00-\x20\x7f]/.test(token)
              )
                return finish('failed');
              for (const path of [
                ...(follow ? ['/auth/soundcloud-events/'] : []),
                ...(requiredComment ? ['/auth/sc-comment/'] : []),
              ]) {
                if (settled || !activeGate()) return finish('cancelled');
                const address = new URL(path, origin);
                address.searchParams.set('fangateId', gate);
                if (path === '/auth/sc-comment/') address.searchParams.set('text', text);
                address.searchParams.set('accessToken', token);
                await ajax(address.pathname + address.search);
              }
              finish('complete');
            } catch {
              finish('failed');
            }
          })();
        },
      });
    } catch {
      finish('failed');
    }
  });
}

/** Serialized into the same MAIN world, and usable only through private IPC. */
export function cancelPumpNativeAction(operation: string): void {
  const page = window as Window & { __gatebreakerPumpJobs?: Map<string, { stop(): void }> };
  page.__gatebreakerPumpJobs?.get(operation)?.stop();
}
