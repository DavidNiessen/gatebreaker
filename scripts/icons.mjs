// Original geometric Gatebreaker mark. Deterministic PNGs, no image dependency.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { format } from 'prettier';

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
const blue = [37, 85, 166];
const white = [244, 246, 251];
const ice = [188, 217, 255];
const stroke = 5;
function segment(x, y, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= stroke;
}
function portal(x, y) {
  return (
    segment(x, y, 30, 86, 30, 40) ||
    segment(x, y, 40, 30, 88, 30) ||
    segment(x, y, 98, 40, 98, 86) ||
    (x <= 40 && y <= 40 && Math.abs(Math.hypot(x - 40, y - 40) - 10) <= stroke) ||
    (x >= 88 && y <= 40 && Math.abs(Math.hypot(x - 88, y - 40) - 10) <= stroke)
  );
}
function arrow(x, y) {
  return (
    segment(x, y, 64, 48, 64, 95) || segment(x, y, 48, 80, 64, 96) || segment(x, y, 64, 96, 80, 80)
  );
}
function background(x, y) {
  const dx = Math.max(Math.abs(x - 64) - 32, 0),
    dy = Math.max(Math.abs(y - 64) - 32, 0);
  return Math.hypot(dx, dy) <= 28;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
  <title>Gatebreaker</title>
  <desc>An open gate with a downward download arrow.</desc>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#2555a6" />
  <path d="M30 86V40a10 10 0 0 1 10-10h48a10 10 0 0 1 10 10v46" fill="none" stroke="#f4f6fb" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M64 48v47M48 80l16 16 16-16" fill="none" stroke="#bcd9ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
await writeFile(
  path.join(directory, 'gatebreaker.svg'),
  await format(svg, { parser: 'html', printWidth: 100 }),
);
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const samples = size <= 48 ? 8 : size <= 256 ? 4 : 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const channels = [0, 0, 0];
      let coverage = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = ((x + (sx + 0.5) / samples) * 128) / size;
          const py = ((y + (sy + 0.5) / samples) * 128) / size;
          if (!background(px, py)) continue;
          coverage++;
          const color = arrow(px, py) ? ice : portal(px, py) ? white : blue;
          for (let channel = 0; channel < 3; channel++) channels[channel] += color[channel];
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw.set(
        [
          ...channels.map((value) => (coverage ? Math.round(value / coverage) : 0)),
          Math.round((255 * coverage) / (samples * samples)),
        ],
        offset,
      );
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
      chunk(
        'tEXt',
        Buffer.from(
          'Source\0Original Gatebreaker vector geometry, scripts/icons.mjs; MIT licensed.',
        ),
      ),
      chunk(
        'tEXt',
        Buffer.from(
          'impeccable:prompt\0Original Gatebreaker vector mark, rasterized from scripts/icons.mjs and static/icons/gatebreaker.svg; MIT licensed, no generated imagery.',
        ),
      ),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
