// Original geometric Gatebreaker mark. Deterministic PNGs, no image dependency.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = fileURLToPath(new URL('../static/icons/', import.meta.url));
await mkdir(directory, { recursive: true });
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size,
        py = (y + 0.5) / size;
      // Two gate posts, an open lintel, and a small exit bar.
      const mark =
        (px >= 0.22 && px < 0.34 && py >= 0.2 && py < 0.8) ||
        (px >= 0.34 && px < 0.76 && py >= 0.2 && py < 0.32) ||
        (px >= 0.64 && px < 0.76 && py >= 0.5 && py < 0.8) ||
        (px >= 0.46 && px < 0.76 && py >= 0.5 && py < 0.62) ||
        (px >= 0.34 && px < 0.64 && py >= 0.68 && py < 0.8);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw.set(mark ? [244, 246, 251, 255] : [37, 85, 166, 255], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    path.join(directory, `${size}.png`),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
