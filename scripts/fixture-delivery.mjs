// Isolated browser fixture only: retain API-boundary calls, never fetch synthetic
// signed production-host URLs or open reward pages while testing provider formats.
export const deliveryFixtureScript = `(() => {
  const api=globalThis.browser??globalThis.chrome;
  globalThis.gatebreakerFixtureDeliveries=[];
  setInterval(()=>{void api.runtime.getPlatformInfo();},20000);
  api.downloads.download=async options=>{
    globalThis.gatebreakerFixtureDeliveries.push({kind:'file',...options});
    return globalThis.gatebreakerFixtureDeliveries.length;
  };
  api.tabs.create=async options=>{
    globalThis.gatebreakerFixtureDeliveries.push({kind:'page',...options});
    return {id:10000+globalThis.gatebreakerFixtureDeliveries.length};
  };
  return true;
})()`;

export async function setupChromeDeliveries(worker) {
  // Exercise the real downloads API once with an authored data fixture. The
  // browser uses the temporary profile's downloads directory, never user files.
  await worker.evaluate(async () => {
    const id = await chrome.downloads.download({
      url: 'data:text/plain,Gatebreaker%20download%20fixture',
      filename: 'gatebreaker-fixture.txt',
      saveAs: false,
    });
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const [item] = await chrome.downloads.search({ id });
      if (item?.state === 'complete') {
        await chrome.downloads.removeFile(id);
        await chrome.downloads.erase({ id });
        return;
      }
      if (item?.state === 'interrupted') throw Error('Authored download fixture interrupted');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await chrome.downloads.cancel(id);
    throw Error('Authored download fixture timed out');
  });
  await worker.evaluate(deliveryFixtureScript);
}
