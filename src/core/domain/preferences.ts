export interface GatePreferences {
  readonly soundcloudComment?: string;
}

/** Text is supplied by the user and may be published by a gate's SoundCloud app. */
export function soundcloudComment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= 2 &&
    text.length <= 1000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    ? text
    : null;
}
