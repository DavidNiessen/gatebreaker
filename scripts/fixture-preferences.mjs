export async function prepareChromePreferences(worker, preferences) {
  await worker.evaluate(async (value) => {
    if (Object.keys(value).length)
      await chrome.storage.local.set({ gatebreakerPreferences: value });
    else await chrome.storage.local.remove('gatebreakerPreferences');
  }, preferences);
}

export async function prepareFirefoxPreferences(debug, preferences) {
  const operation = Object.keys(preferences).length
    ? `set(${JSON.stringify({ gatebreakerPreferences: preferences })})`
    : 'remove("gatebreakerPreferences")';
  await debug.evaluateJSON(
    `(()=>{globalThis.gatebreakerFixturePreferencesReady=false;void (globalThis.browser??chrome).storage.local.${operation}.then(()=>{globalThis.gatebreakerFixturePreferencesReady=true});return true})()`,
  );
  for (let n = 0; n < 60; n++) {
    if (await debug.evaluateJSON('globalThis.gatebreakerFixturePreferencesReady')) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error('Fixture preference preparation timed out');
}
