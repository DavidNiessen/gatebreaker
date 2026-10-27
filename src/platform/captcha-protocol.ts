export const captchaFrameMessage = 'gatebreaker:captcha-frame';
export const captchaPageRequest = 'gatebreaker:captcha-render';
export const captchaPageResult = 'gatebreaker:captcha-result';
export const captchaNoncePattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const captchaStates = ['ready', 'solved', 'expired', 'error'] as const;
export function captchaFragment(value: string): string | null {
  const match = /^#gatebreaker-captcha=([a-f0-9-]{36})$/.exec(value);
  return match && captchaNoncePattern.test(match[1]!) ? match[1]! : null;
}
