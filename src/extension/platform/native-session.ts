/** Native storage belongs to the browser host; providers receive only the scoped SID. */
export function readNativeSession(
  document: Document,
  provider: string,
  gateId: string,
): string | null {
  if (provider !== 'droploud') return null;
  const view = document.defaultView;
  return (
    view?.localStorage?.getItem(`dw_sid:${gateId}`) ||
    view?.sessionStorage?.getItem('dw_sid') ||
    null
  );
}
