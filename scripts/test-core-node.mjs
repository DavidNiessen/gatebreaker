import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

for (const name of ['chrome', 'browser', 'window', 'document', 'DOMParser'])
  assert.equal(name in globalThis, false, 'Unexpected browser global: ' + name);
const { createGatebreaker, providers } = await import('gatebreaker/core');
assert.equal(providers.length, 8);
const windows = [];
let requests = 0;
const engine = createGatebreaker({
  providers,
  fetch: async () => {
    requests++;
    throw new Error('No HTTP is expected for this authored embedded-link fixture');
  },
  parseHtml(html, url) {
    const dom = new JSDOM(html, { url: url.href });
    windows.push(dom.window);
    return dom.window.document;
  },
});
const destination = 'https://mega.nz/file/authoredCore#preserved-key';
const model = {
  page: '/[uniquer]',
  props: {
    pageProps: {
      sink: {
        data: {
          uniquer: 'Ab3xY',
          title: 'Standalone core fixture',
          deleted_at: null,
          unlocked_link: destination,
          blocks: [],
        },
      },
    },
  },
};
try {
  const page = engine.createSession({
    url: 'https://sub2unlock.com/Ab3xY',
    html: `<div id="__next"><h3>Standalone core fixture</h3></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(model)}</script>`,
  });
  assert.equal(page.inspect().title, 'Standalone core fixture');
  assert.equal('metadata' in page.inspect(), false);
  assert.deepEqual(await page.resolve(), { ok: true, url: destination, method: 'embedded-link' });
  assert.equal(requests, 0);
  console.log(
    'Built gatebreaker/core imported and resolved in Node: injected DOM, no browser globals, no HTTP or delivery',
  );
} finally {
  for (const window of windows) window.close();
}
