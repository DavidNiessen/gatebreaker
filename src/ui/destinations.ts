import type { Resolution } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';

/** Keep multiple released files behind one explicit, user-operated opening action. */
export function createDestinationPicker(link: HTMLAnchorElement): {
  readonly element: HTMLLabelElement;
  update(result: Resolution | null, disabled: boolean): void;
} {
  const element = document.createElement('label');
  element.className = 'destination-picker';
  element.hidden = true;
  const caption = document.createElement('span');
  caption.textContent = 'Choose a file';
  const select = document.createElement('select');
  element.append(caption, select);
  let key = '';
  let options: { label: string; url: string }[] = [];
  const apply = () => {
    const selected = options[select.selectedIndex];
    if (!selected) return;
    link.href = selected.url;
    link.textContent = 'Open selected file';
  };
  select.addEventListener('change', apply);
  return {
    element,
    update(result, disabled) {
      const destinations = result?.ok ? result.destinations : undefined;
      const next: { label: string; url: string }[] = [];
      if (Array.isArray(destinations) && destinations.length >= 2 && destinations.length <= 20) {
        for (const item of destinations) {
          const url =
            typeof item?.url === 'string' && item.url.length <= 16384
              ? safeHttpsUrl(item.url)
              : null;
          if (
            !url ||
            typeof item.label !== 'string' ||
            !item.label.trim() ||
            item.label.length > 200 ||
            next.some((option) => option.url === url)
          ) {
            next.length = 0;
            break;
          }
          next.push({ label: item.label, url });
        }
      }
      if (next[0]?.url !== (result?.ok ? safeHttpsUrl(result.url) : null)) next.length = 0;
      const nextKey = JSON.stringify(next);
      if (nextKey !== key) {
        key = nextKey;
        options = next;
        select.replaceChildren();
        for (const item of options) {
          const option = document.createElement('option');
          option.textContent = item.label;
          select.append(option);
        }
        select.selectedIndex = options.length ? 0 : -1;
      }
      element.hidden = options.length < 2;
      select.disabled = disabled;
      if (!element.hidden) apply();
    },
  };
}
