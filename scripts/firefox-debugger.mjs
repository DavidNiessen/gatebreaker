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

export async function installFirefoxAddon(port, addonPath) {
  const socket = await new Promise((resolve, reject) => {
    const connection = net.connect(port, '127.0.0.1');
    connection.once('connect', () => resolve(connection));
    connection.once('error', reject);
  });
  let buffered = Buffer.alloc(0);
  const requests = new Map();
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
  try {
    const root = await request('root', 'getRoot');
    const result = await request(root.addonsActor, 'installTemporaryAddon', {
      addonPath,
      openDevTools: false,
    });
    return result;
  } finally {
    socket.end();
  }
}
