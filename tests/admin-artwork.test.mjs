import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { prepareArtwork } from '../lib/admin/artwork.mjs';
test('photographed artwork normalizes to a circular WebP with a transparent hole without touching its source', async () => {
  const source = await readFile(new URL('../diskPic/ItFitS_ Tailored fit by AI.png', import.meta.url));
  const image = await prepareArtwork({ data: source.toString('base64') });
  assert.deepEqual(image.source, source);
  const decoded = await sharp(image.texture).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 1024); assert.equal(decoded.info.height, 1024);
  const alpha = (x, y) => decoded.data[(y * 1024 + x) * 4 + 3];
  assert.equal(alpha(512, 512), 0); assert.equal(alpha(0, 0), 0); assert.ok(alpha(512, 180) > 240);
  assert.ok(image.geometry.hub[0] > .4 && image.geometry.hub[0] < .7);
});
test('flat artwork has a supported explicit fallback and rejects malformed or oversized sources', async () => {
  const source = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#749166' } }).png().toBuffer();
  const image = await prepareArtwork({ data: source.toString('base64'), calibration: { mode: 'flat' } });
  assert.ok(image.texture.length > 0);
  await assert.rejects(() => prepareArtwork({ data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"/>').toString('base64') }));
  await assert.rejects(() => prepareArtwork({ data: Buffer.from('fake').toString('base64') }));
  await assert.rejects(() => prepareArtwork({ data: source.toString('base64'), calibration: { mode: 'flat', zoom: 99 } }));
});
test('unsupported decoder families are disabled before metadata inspection', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128"/></svg>');
  await assert.rejects(() => sharp(svg).metadata(), /blocked|unsupported|not a known/i);
  await assert.rejects(() => prepareArtwork({ data: Buffer.from('GIF89a' + 'x'.repeat(100)).toString('base64') }), /Only PNG/);
});
