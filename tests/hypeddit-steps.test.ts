import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeOptionalSteps,
  hypedditChoices,
  unselectedHypedditSteps,
  optionalHypedditStep,
} from '../src/providers/hypeddit/steps';
import { captureWebsiteRequest, buildWebsiteRequest } from '../src/providers/hypeddit/request';
import { hypeddit } from '../src/providers/hypeddit';
import { hypedditState } from '../src/providers/hypeddit/session';
const url = new URL('https://hypeddit.com/authored/choices');
let serial = 0;
function fixture(choices: string) {
  serial++;
  document.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML = `<a id="downloadProcess"></a><input id="current_download_file_listner" value="choice${serial}"><input id="fan_gate_id" value="${9000 + serial}"><input id="wrndk" value="authored"><input id="is_unlimited" value="1"><input id="is_skippable" value="0"><input id="nwSteps" value="email,sc,sp,ap,dn,ig,tk"><input id="steps_select"><section class="fangate-slider-content"><a id="login_to_sp"></a></section>`;
  document.querySelector<HTMLInputElement>('#steps_select')!.value = choices;
}
const fields = () => JSON.parse(captureWebsiteRequest(document));
afterEach(() => vi.restoreAllMocks());
describe('Hypeddit native path variants', () => {
  it('chooses the ordinary TikTok alternative without requiring Spotify', () => {
    fixture('dw,email,sc,ig,sp|tk');
    hypedditState(document).acceptedEmail = 'gatebreakeros@proton.me';
    expect(hypedditChoices(document)).toEqual([{ alternatives: ['sp', 'tk'], selected: 'tk' }]);
    expect(unselectedHypedditSteps(document)).toEqual(['sp']);
    expect(
      hypeddit.actions!(document, url).find((action) => action.id === 'sign-in-spotify')?.required,
    ).toBe(false);
    expect(fields()['is_skippable']).toBe('0');
    expect(fields()['skip_gate_steps[]']).toEqual(['sp']);
  });
  it('uses an offered donation skip in a three-service OR group and preserves its native spelling', () => {
    fixture('dw,email,sp|ap|dn,ig|sc');
    document.body.insertAdjacentHTML('beforeend', '<a id="skipper_dn" data-step="donation"></a>');
    expect(hypedditChoices(document).map((group) => group.selected)).toEqual(['dn', 'ig']);
    expect(fields()['skip_gate_steps[]']).toEqual(['donation', 'sp', 'ap', 'sc']);
    expect(fields()['is_skippable']).toBe('0');
  });
  it('selects supported Spotify auth over an unsupported SoundCloud login', () => {
    fixture('dw,sc|sp');
    document.querySelector('section')!.insertAdjacentHTML('beforeend', '<a id="login_to_sc"></a>');
    hypedditState(document).authRequired = true;
    expect(hypedditChoices(document)[0]!.selected).toBe('sp');
    expect(
      hypeddit.actions!(document, url)
        .filter((action) => action.required)
        .map((action) => action.id),
    ).toEqual(['sign-in-spotify']);
  });
  it('prefers supported Spotify auth over the unskippable YouTube alternative', () => {
    fixture('dw,email,yt|sp,ig,th');
    expect(hypedditChoices(document)[0]!.selected).toBe('sp');
    expect(unselectedHypedditSteps(document)).toEqual(['yt']);
    expect(hypeddit.inspect(document, url)!.metadata['requiredSignIn']).toBe('1');
  });
  it('retains an explicit YouTube skip over a Spotify login', () => {
    fixture('dw,email,yt|sp');
    document.body.insertAdjacentHTML('beforeend', '<a id="skipper_yt" data-step="yt"></a>');
    expect(hypedditChoices(document)[0]!.selected).toBe('yt');
  });
  it('retains mandatory Spotify when it is not an alternative', () => {
    fixture('dw,email,sc,sp');
    hypedditState(document).authRequired = true;
    expect(optionalHypedditStep(document, 'sp')).toBe(false);
    expect(hypeddit.inspect(document, url)!.metadata['requiredSignIn']).toBe('1');
  });
  it('matches the native explicit Spotify skip flag without changing its DOM field', () => {
    fixture('dw,email,sp');
    document.body.insertAdjacentHTML('beforeend', '<a id="skipper" data-step="sp"></a>');
    const gate = hypeddit.inspect(document, url)!;
    expect(buildWebsiteRequest(gate).get('is_skippable')).toBe('1');
    expect(document.querySelector<HTMLInputElement>('#is_skippable')!.value).toBe('0');
  });
  it('does not infer the Spotify skip flag from an existing OR skip field', () => {
    fixture('dw,email,sp');
    document.body.insertAdjacentHTML('beforeend', '<input name="skip_gate_steps[]" value="sp">');
    expect(fields()['is_skippable']).toBe('0');
  });
  it.each(['sc', 'yt', 'ig', 'tw', 'tk', 'bc'])(
    'recognizes a revealed native %s next control without activating it',
    (step) => {
      fixture('dw,' + step);
      const node = document.createElement('a');
      node.id = 'skipper_' + step + '_next';
      node.dataset['step'] = step;
      document.body.append(node);
      const click = vi.spyOn(node, 'click');
      expect(nativeOptionalSteps(document)).toContain(step);
      expect(click).not.toHaveBeenCalled();
      node.classList.add('hide');
      expect(nativeOptionalSteps(document)).not.toContain(step);
    },
  );
  it('rejects mismatched, disabled and unrelated skip controls', () => {
    fixture('dw,sc');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<a id="skipper_sc_next" data-step="sp"></a><a id="skipper_ig" data-step="ig" aria-disabled="true"></a><a data-step="yt"></a>',
    );
    expect(nativeOptionalSteps(document)).toEqual([]);
  });
  it.each(['sp|unknown', 'sp|sp', 'sp|tk,sp|ig', 'sp|', 'sp|tk|' + 'x'.repeat(2050)])(
    'does not invent an OR plan for malformed or ambiguous groups: %s',
    (choices) => {
      fixture(choices);
      expect(hypedditChoices(document)).toEqual([]);
      expect(unselectedHypedditSteps(document)).toEqual([]);
    },
  );
});
