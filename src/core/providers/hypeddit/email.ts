import type { ProviderContext } from '../../domain/provider';
import { automaticEmail } from '../shared/automatic-email';
import { readLimitedText } from '../shared/read-text';
/** Visible native declarations are data; host cookie access stays outside core. */
export function declaredHypedditCaptcha(document: Document): boolean {
  const widget = document.querySelector<HTMLElement>('#gatePreviewCaptcha');
  return !!(
    (widget &&
      !widget.hidden &&
      !widget.classList.contains('hide') &&
      widget.style.display !== 'none') ||
    document.querySelector<HTMLElement>('#captchalog')?.dataset['attempts'] === 'over'
  );
}
function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
/** Verify the native email contract using only the supplied DOM and HTTP transport. */
export async function verifyHypedditEmail(
  document: Document,
  url: URL,
  email: string,
  context: Pick<ProviderContext, 'fetch' | 'signal'>,
): Promise<{ email: string; name: string }> {
  const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
  const gate = field(document, 'fan_gate_id');
  if (!csrf || !/^[\x21-\x7e]{16,4096}$/.test(csrf) || !/^\d{1,16}$/.test(gate))
    throw new Error('Reload Hypeddit to refresh this email verification session.');
  const name = document.querySelector('#email_name')
    ? field(document, 'email_name') || 'Listener'
    : '';
  const body = new URLSearchParams({
    validateEmailAddress: email,
    fan_gate_id: gate,
    email_name: name,
    adcode: field(document, 'adcode'),
    hypesource: field(document, 'hypesource'),
  });
  // Firefox content-script URLSearchParams iterators may be non-iterable.
  let oversized = false;
  body.forEach((value) => {
    if (value.length > 2048) oversized = true;
  });
  if (oversized) throw new Error('Hypeddit’s email request contains unsupported data.');
  const endpoint = new URL('/verifyEmailAddress', url);
  const response = await context.fetch(endpoint.href, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrf,
    },
    body,
  });
  if ([401, 403, 419].includes(response.status))
    throw new Error(
      'Hypeddit rejected this session. Reload and complete any browser check yourself.',
    );
  if (response.status === 429)
    throw new Error('Hypeddit is limiting email attempts. Wait before trying again.');
  if (!response.ok) throw new Error('Hypeddit could not process the email verification request.');
  if (
    response.redirected ||
    (response.url && response.url !== endpoint.href) ||
    !response.headers.get('content-type')?.toLowerCase().includes('application/json')
  )
    throw new Error('Hypeddit returned a browser check or unexpected email response.');
  const value: unknown = JSON.parse(await readLimitedText(response, 32 * 1024));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Hypeddit returned unreadable email verification data.');
  const status = (value as Record<string, unknown>)['status'];
  if (status === 'F')
    throw new Error(
      `Hypeddit rejected ${automaticEmail}. Gatebreaker cannot complete this required email step.`,
    );
  if (status !== 'T')
    throw new Error('Hypeddit returned an unknown email verification result. Reload the page.');

  return { email, name };
}
