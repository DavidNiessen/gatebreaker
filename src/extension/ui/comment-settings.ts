import {
  clearSoundcloudComment,
  readPreferences,
  saveSoundcloudComment,
} from '../platform/preferences';

export function createCommentSettings(options: { required?: boolean; saved?: () => void } = {}) {
  const element = document.createElement('details');
  const style = document.createElement('style');
  style.textContent = `.comment-settings{margin-top:18px;padding-top:16px;border-top:1px solid var(--line,#cbd3df)}.comment-settings summary{cursor:pointer;font-weight:600}.comment-settings form{margin-top:12px}.comment-settings label{display:block;font-weight:600}.comment-settings textarea{display:block;width:100%;min-height:90px;margin:6px 0 8px;padding:10px;resize:vertical;border:1px solid var(--control-line,var(--line,#cbd3df));border-radius:7px;background:var(--paper,#f4f6fb);color:var(--ink,#202b3d);caret-color:var(--accent,#2555a6);font:inherit}.comment-settings p{margin:8px 0 12px;font-size:12px}.comment-settings button{margin-top:8px}.comment-settings textarea:focus-visible,.comment-settings summary:focus-visible{outline:3px solid var(--focus,#a65313);outline-offset:3px}`;
  element.className = 'comment-settings';
  element.open = options.required === true;
  const summary = document.createElement('summary');
  summary.textContent = options.required
    ? 'SoundCloud comment required'
    : 'SoundCloud comment settings';
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.textContent = 'Reusable comment';
  const input = document.createElement('textarea');
  input.rows = 3;
  input.required = true;
  input.minLength = 2;
  input.maxLength = 1000;
  input.autocomplete = 'off';
  label.append(input);
  const hint = document.createElement('p');
  hint.textContent =
    'Posted publicly from your SoundCloud account when a gate requires a comment. Saved on this browser.';
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = options.required ? 'Save and continue' : 'Save comment';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.dataset['secondary'] = 'true';
  clear.textContent = 'Clear saved comment';
  clear.hidden = true;
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  const report = (message: string, error = false) => {
    notice.textContent = message;
    notice.hidden = false;
    input.setAttribute('aria-invalid', String(error));
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.isTrusted || save.disabled) return;
    save.disabled = clear.disabled = true;
    void saveSoundcloudComment(input.value)
      .then(() => {
        report('Comment saved.');
        clear.hidden = false;
        options.saved?.();
      })
      .catch((error) =>
        report(
          error instanceof Error ? error.message : 'The comment could not be saved. Try again.',
          true,
        ),
      )
      .finally(() => {
        save.disabled = clear.disabled = false;
      });
  });
  clear.addEventListener('click', (event) => {
    if (!event.isTrusted || clear.disabled) return;
    save.disabled = clear.disabled = true;
    void clearSoundcloudComment()
      .then(() => {
        input.value = '';
        clear.hidden = true;
        report('Saved comment cleared.');
      })
      .catch(() => report('The comment could not be cleared. Try again.', true))
      .finally(() => {
        save.disabled = clear.disabled = false;
      });
  });
  form.append(label, hint, save, clear, notice);
  element.append(style, summary, form);
  let edited = false;
  input.addEventListener('input', () => {
    edited = true;
    notice.hidden = true;
    input.removeAttribute('aria-invalid');
  });
  void readPreferences()
    .then((value) => {
      if (!edited) input.value = value.soundcloudComment ?? '';
      clear.hidden = !value.soundcloudComment;
    })
    .catch(() => report('Your saved comment could not be read. Enter it again.', true));
  return element;
}
