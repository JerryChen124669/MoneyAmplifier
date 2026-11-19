// Renders icons/icon-source.svg (or icon-source.png) into every size a phone home screen needs.
// Usage: npm run icons
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'icons');
const source = ['icon-source.png', 'icon-source.svg'].map((f) => path.join(dir, f)).find(existsSync);
if (!source) throw new Error('Put icon-source.png or icon-source.svg in the icons folder.');

const bg = '#f4d3a6'; // background colour used for the safe-zone padding of the maskable icon
const plain = (size, name) => sharp(source, { density: 384 }).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, name));

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await plain(180, 'apple-touch-icon.png'); // iOS home screen icon
// Maskable: Android may crop to a circle/squircle, so shrink the art to 80% inside a coloured square.
const inner = await sharp(source, { density: 384 }).resize(410, 410, { fit: 'cover' }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(dir, 'icon-maskable-512.png'));

console.log('Icons written from', path.basename(source));
