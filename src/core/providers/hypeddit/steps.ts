/** Native skip and OR-path metadata. This module never drives page controls. */
const known = new Set([
  'email',
  'sc',
  'yt',
  'sp',
  'ap',
  'dz',
  'mc',
  'tw',
  'th',
  'ig',
  'tk',
  'bc',
  'fb',
  'dn',
  'fbmsgr',
  'fb_msgr',
]);
const ordinary = [
  'ig',
  'tk',
  'tw',
  'fb',
  'fbmsgr',
  'fb_msgr',
  'yt',
  'bc',
  'mc',
  'th',
  'sc',
  'email',
];
const nextControls = new Set([
  'skipper_yt_next',
  'skipper_sc_next',
  'skipper_ig_next',
  'skipper_tw_next',
  'skipper_fb_button',
  'skipper_tk_next',
  'skipper_bc_next',
]);

export function nativeOptionalSteps(document: Document): readonly string[] {
  const steps: string[] = [];
  for (const control of document.querySelectorAll<HTMLElement>('[data-step]')) {
    const step = control.dataset['step'];
    if (
      !step ||
      !/^[a-zA-Z0-9_-]{1,32}$/.test(step) ||
      control.hidden ||
      control.classList.contains('hide') ||
      control.hasAttribute('disabled') ||
      control.getAttribute('aria-disabled') === 'true'
    )
      continue;
    if (
      control.id === 'skipper' ||
      control.id === 'skipper_' + step ||
      (nextControls.has(control.id) && control.id.split('_')[1] === step) ||
      (control.id === 'skipper_dn' && step === 'donation')
    )
      steps.push(step);
  }
  return [...new Set(steps)];
}

export interface HypedditChoice {
  readonly alternatives: readonly string[];
  readonly selected: string;
}
/** Match jumpGate's unselected siblings, preferring an existing optional path. */
export function hypedditChoices(document: Document): readonly HypedditChoice[] {
  const raw = document.querySelector<HTMLInputElement>('[id="steps_select"]')?.value ?? '';
  if (raw.length > 2048) return [];
  const groups = raw.split(',');
  if (groups.length > 32) return [];
  const optional = new Set(
    nativeOptionalSteps(document).map((step) => (step === 'donation' ? 'dn' : step)),
  );
  const choices: HypedditChoice[] = [];
  const seen = new Set<string>();
  const score = (step: string): number => {
    if (optional.has(step)) return 0;
    if (step !== 'sp' && document.querySelector('#login_to_' + step + ', #login_' + step))
      return 80;
    // An unskippable YouTube alternative refused the live mixed-gate test;
    // its supported Spotify sign-in alternative released the same file.
    if (step === 'yt') return 60;
    const index = ordinary.indexOf(step);
    if (index >= 0) return 10 + index;
    if (step === 'sp') return 50;
    return 90;
  };
  for (const group of groups) {
    if (!group.includes('|')) continue;
    const alternatives = group.split('|');
    if (
      alternatives.length < 2 ||
      alternatives.length > 16 ||
      new Set(alternatives).size !== alternatives.length ||
      alternatives.some((step) => !known.has(step) || seen.has(step))
    )
      return [];
    alternatives.forEach((step) => seen.add(step));
    const selected = alternatives.reduce((best, step) => (score(step) < score(best) ? step : best));
    choices.push({ alternatives, selected });
  }
  return choices;
}
export function unselectedHypedditSteps(document: Document): readonly string[] {
  return hypedditChoices(document).flatMap((group) =>
    group.alternatives.filter((step) => step !== group.selected),
  );
}
export function optionalHypedditStep(document: Document, step: string): boolean {
  return (
    nativeOptionalSteps(document).includes(step) || unselectedHypedditSteps(document).includes(step)
  );
}
