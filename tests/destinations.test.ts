import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDestinationPicker } from '../src/extension/ui/destinations';
import type { Resolution } from '../src/core/domain/provider';

const first = 'https://files.example.invalid/first.wav?token=fixture-one';
const second = 'https://files.example.invalid/second.wav?token=fixture-two#key';
function result(): Resolution {
  return {
    ok: true,
    url: first,
    method: 'provider-request',
    destinations: [
      { label: 'First.wav', url: first },
      { label: 'Second.wav', url: second },
    ],
  };
}
beforeEach(() => document.body.replaceChildren());
describe('released-file chooser', () => {
  it('changes only the explicit opening link and retains the selection across status updates', () => {
    const link = document.createElement('a');
    const picker = createDestinationPicker(link);
    document.body.append(picker.element, link);
    const open = vi.spyOn(window, 'open');
    picker.update(result(), false);
    const select = picker.element.querySelector('select')!;
    expect(picker.element.hidden).toBe(false);
    expect(link.href).toBe(first);
    expect(link.textContent).toBe('Open selected file');
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    expect(link.href).toBe(second);
    picker.update(result(), true);
    expect(select.disabled).toBe(true);
    expect(select.selectedIndex).toBe(1);
    expect(link.href).toBe(second);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
  it('clears old file choices on cancellation/failure and resets a new result', () => {
    const link = document.createElement('a');
    const picker = createDestinationPicker(link);
    picker.update(result(), false);
    const select = picker.element.querySelector('select')!;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    picker.update({ ok: false, code: 'network-error', message: 'Fixture failed' }, false);
    expect(picker.element.hidden).toBe(true);
    expect(select.options).toHaveLength(0);
    picker.update(result(), false);
    expect(select.selectedIndex).toBe(0);
    expect(link.href).toBe(first);
    picker.update(null, false);
    expect(picker.element.hidden).toBe(true);
  });
  it('keeps single-destination results on the existing opening control', () => {
    const link = document.createElement('a');
    link.href = first;
    link.textContent = 'Open destination';
    const picker = createDestinationPicker(link);
    picker.update({ ok: true, url: first, method: 'embedded-link' }, false);
    expect(picker.element.hidden).toBe(true);
    expect(link.href).toBe(first);
    expect(link.textContent).toBe('Open destination');
  });
  it('inserts filenames as text, preserving native keyboard selection', () => {
    const link = document.createElement('a');
    const picker = createDestinationPicker(link);
    const value = result();
    if (!value.ok) throw Error('Fixture');
    picker.update(
      {
        ...value,
        destinations: [
          { label: '<img src=x onerror=alert(1)>', url: first },
          { label: 'Second.wav', url: second },
        ],
      },
      false,
    );
    expect(picker.element.querySelector('option')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(picker.element.querySelector('img')).toBeNull();
    expect(picker.element.querySelector('span')?.textContent).toBe('Choose a file');
  });
  it.each(
    [
      [
        { label: 'First', url: first },
        { label: 'Unsafe', url: 'javascript:alert(1)' },
      ],
      [
        { label: 'First', url: first },
        { label: 'Duplicate', url: first },
      ],
      [
        { label: 'First', url: first },
        { label: ' ', url: second },
      ],
      [
        { label: 'First', url: first },
        { label: 'X'.repeat(201), url: second },
      ],
      [
        { label: 'Wrong primary', url: second },
        { label: 'First', url: first },
      ],
      Array.from({ length: 21 }, (_, index) => ({
        label: String(index),
        url: `https://files.example.invalid/${index}`,
      })),
    ].map((destinations) => ({ destinations })),
  )(
    'rejects malformed or unbounded choice lists without installing unsafe links (%#)',
    ({ destinations }) => {
      const link = document.createElement('a');
      link.href = first;
      const picker = createDestinationPicker(link);
      picker.update({ ok: true, url: first, method: 'provider-request', destinations }, false);
      expect(picker.element.hidden).toBe(true);
      expect(picker.element.querySelectorAll('option')).toHaveLength(0);
      expect(link.href).toBe(first);
    },
  );
});
