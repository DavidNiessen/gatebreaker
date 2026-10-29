/** Native storage belongs to the browser host; providers receive only the scoped SID. */
export function readNativeSession(
  document: Document,
  provider: string,
  gateId: string,
): string | null {
  const view = document.defaultView;
  if (provider === 'stillhype') return view?.localStorage?.getItem(`sh_fan_${gateId}`) ?? null;
  if (provider !== 'droploud') return null;
  return (
    view?.localStorage?.getItem(`dw_sid:${gateId}`) ||
    view?.sessionStorage?.getItem('dw_sid') ||
    null
  );
}
