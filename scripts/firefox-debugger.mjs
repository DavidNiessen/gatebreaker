// Small Firefox Remote Debugging Protocol adapter used only by browser tests.
// Installs the unpacked build in an isolated temporary browser profile.
import net from 'node:net';

export async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

export async function installFirefoxAddon(port, addonPath, setupScript, existingAddonId) {
  const socket = await new Promise((resolve, reject) => {
    const connection = net.connect(port, '127.0.0.1');
    connection.once('connect', () => resolve(connection));
    connection.once('error', reject);
  });
  let buffered = Buffer.alloc(0);
  const requests = new Map();
  const targetEvents = [];
  const evaluationResults = new Map();
  const evaluationListeners = new Map();
  let targetListener;
  let keepConnection = false;
  socket.on('data', (data) => {
    buffered = Buffer.concat([buffered, data]);
    for (;;) {
      const separator = buffered.indexOf(58);
      if (separator < 0) return;
      const length = Number(buffered.subarray(0, separator).toString());
      if (buffered.length < separator + 1 + length) return;
      const message = JSON.parse(
        buffered.subarray(separator + 1, separator + 1 + length).toString(),
      );
      buffered = buffered.subarray(separator + 1 + length);
      if (process.env.GATEBREAKER_DEBUG)
        console.log('Firefox RDP:', message.from, Object.keys(message).join(','));
      if (message.applicationType && !message.addonsActor) continue;
      if (message.type === 'evaluationResult') {
        const pending = evaluationListeners.get(message.resultID);
        if (pending) {
          evaluationListeners.delete(message.resultID);
          pending(message);
        } else evaluationResults.set(message.resultID, message);
        continue;
      }
      if (message.type === 'target-available-form') {
        targetEvents.push(message.target);
        targetListener?.(message.target);
        continue;
      }
      if (message.type && !message.error) continue;
      const pending = requests.get(message.from);
      if (pending) {
        requests.delete(message.from);
        pending(message);
      }
    }
  });
  function request(to, type, extra = {}) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        requests.delete(to);
        reject(new Error(`Firefox ${type} timed out`));
      }, 10000);
      requests.set(to, (message) => {
        clearTimeout(timeout);
        if (message.error) reject(new Error(`${message.error}: ${message.message}`));
        else resolve(message);
      });
      const packet = JSON.stringify({ to, type, ...extra });
      socket.write(`${Buffer.byteLength(packet)}:${packet}`);
    });
  }
  async function evaluate(actor, text) {
    const scheduled = await request(actor, 'evaluateJSAsync', { text });
    const id = scheduled.resultID;
    if (!id) throw Error('Fixture evaluation ID unavailable');
    if (evaluationResults.has(id)) {
      const value = evaluationResults.get(id);
      evaluationResults.delete(id);
      return value;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        evaluationListeners.delete(id);
        reject(Error('Fixture evaluation timed out'));
      }, 10000);
      evaluationListeners.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }
  try {
    const root = await request('root', 'getRoot');
    const result = addonPath
      ? await request(root.addonsActor, 'installTemporaryAddon', { addonPath, openDevTools: false })
      : { addon: { id: existingAddonId } };
    if (setupScript) {
      const inventory = await request('root', 'listAddons');
      const addon = inventory.addons.find((item) => item.id === result.addon.id);
      if (!addon?.actor) throw Error('Fixture extension debug target unavailable');
      const watcher = await request(addon.actor, 'getWatcher', {
        isServerTargetSwitchingEnabled: true,
      });
      const actor = watcher.actor ?? watcher.watcher?.actor;
      if (!actor) throw Error('Fixture extension watcher unavailable');
      await request(actor, 'watchTargets', { targetType: 'frame' });
      const target =
        targetEvents.find(
          (value) => value.consoleActor && value.url?.startsWith('moz-extension://'),
        ) ??
        (await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            targetListener = undefined;
            reject(Error('Fixture background target timed out'));
          }, 10000);
          targetListener = (value) => {
            if (value.consoleActor && value.url?.startsWith('moz-extension://')) {
              clearTimeout(timer);
              targetListener = undefined;
              resolve(value);
            }
          };
        }));
      const consoleActor = target.consoleActor;
      if (!consoleActor) throw Error('Fixture background console unavailable');
      const evaluated = await evaluate(consoleActor, setupScript);
      if (evaluated.exception)
        throw Error(
          'Fixture delivery API setup failed: ' + evaluated.exceptionMessage + ' at ' + target.url,
        );
      keepConnection = true;
      return {
        ...result,
        close: () => socket.end(),
        evaluateJSON: async (expression) => {
          const value = await evaluate(consoleActor, 'JSON.stringify((' + expression + '))');
          if (value.exception || typeof value.result !== 'string')
            throw Error('Fixture JSON evaluation failed');
          return JSON.parse(value.result);
        },
        deliverySummary: async () => {
          const summary = await evaluate(
            consoleActor,
            'JSON.stringify({files:globalThis.gatebreakerFixtureDeliveries.filter(v=>v.kind==="file").length,pages:globalThis.gatebreakerFixtureDeliveries.filter(v=>v.kind==="page").length})',
          );
          if (typeof summary.result !== 'string')
            throw Error('Fixture delivery summary unavailable');
          return JSON.parse(summary.result);
        },
      };
    }
    return result;
  } finally {
    if (!keepConnection) socket.end();
  }
}

export function configureFirefoxAddon(port, addonId, setupScript) {
  return installFirefoxAddon(port, undefined, setupScript, addonId);
}
