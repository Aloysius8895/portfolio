import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { fail } from './domain.mjs';
// Only the three advertised raster decoders are reachable, including during
// metadata inspection. This also applies the maintainers' mitigations for
// inherited libvips/libheif/librsvg advisories in the available Sharp build.
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: ['VipsForeignLoadJpegBuffer', 'VipsForeignLoadPngBuffer', 'VipsForeignLoadWebpBuffer'] });
export const MAX_IMAGE_BYTES = 3_000_000;
const SIZE = 1024, HOLE = 184 / 768;
const bounded = (value, min, max, fallback = 0) => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) fail(400, 'Artwork adjustment is outside its allowed range.');
  return value;
};
function solve(matrix, values) {
  const rows = matrix.map((row, i) => [...row, values[i]]), n = values.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    if (Math.abs(rows[i][i]) < 1e-10) fail(400, 'Could not fit the disk outline. Try Flat artwork or adjust the outline manually.');
    const factor = rows[i][i]; for (let k = i; k <= n; k++) rows[i][k] /= factor;
    for (let j = 0; j < n; j++) if (j !== i) { const f = rows[j][i]; for (let k = i; k <= n; k++) rows[j][k] -= f * rows[i][k]; }
  }
  return rows.map(row => row[n]);
}
function ellipse(points, width, height) {
  const scale = Math.max(width, height) / 2;
  const matrix = Array.from({ length: 5 }, () => Array(5).fill(0)), values = Array(5).fill(0);
  for (const [px, py] of points) {
    const x = (px - width / 2) / scale, y = (py - height / 2) / scale, v = [x * x, x * y, y * y, x, y];
    for (let i = 0; i < 5; i++) { values[i] += v[i]; for (let j = 0; j < 5; j++) matrix[i][j] += v[i] * v[j]; }
  }
  const [a, b, c, d, e] = solve(matrix, values), det = a * c - b * b / 4;
  if (det <= 0 || a <= 0 || c <= 0) fail(400, 'The image does not have a clear elliptical disk outline. Try Flat artwork or Manual outline.');
  const cx = -(c * d - b * e / 2) / (2 * det), cy = -(a * e - b * d / 2) / (2 * det);
  const k = 1 + a * cx * cx + b * cx * cy + c * cy * cy;
  const angle = .5 * Math.atan2(b, a - c), cosine = Math.cos(angle), sine = Math.sin(angle);
  const mid = (a + c) / 2, delta = Math.hypot(a - c, b) / 2;
  const rx = Math.sqrt(k / (mid + delta)) * scale, ry = Math.sqrt(k / (mid - delta)) * scale;
  if (![rx, ry].every(Number.isFinite) || Math.min(rx, ry) < 10) fail(400, 'Disk outline is too small. Use a larger disk image.');
  return { center: [width / 2 + cx * scale, height / 2 + cy * scale],
    S: [cosine * cosine * rx + sine * sine * ry, cosine * sine * (rx - ry), sine * sine * rx + cosine * cosine * ry] };
}
function components(mask, width, height) {
  const seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length), found = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let read = 0, end = 1; queue[0] = start; seen[start] = 1;
    while (read < end) {
      const index = queue[read++], x = index % width;
      for (const next of [x ? index - 1 : -1, x + 1 < width ? index + 1 : -1, index - width, index + width]) {
        if (next >= 0 && next < mask.length && mask[next] && !seen[next]) { seen[next] = 1; queue[end++] = next; }
      }
    }
    if (end > 30) found.push(Array.from(queue.subarray(0, end)));
  }
  return found.sort((a, b) => b.length - a.length);
}
function boundary(component, width, height) {
  const left = Array(height).fill(Infinity), right = Array(height).fill(-1), top = Array(width).fill(Infinity), bottom = Array(width).fill(-1);
  for (const index of component) { const x = index % width, y = Math.floor(index / width); left[y] = Math.min(left[y], x); right[y] = Math.max(right[y], x); top[x] = Math.min(top[x], y); bottom[x] = Math.max(bottom[x], y); }
  const points = [];
  for (let y = 0; y < height; y += 2) if (right[y] >= 0) points.push([left[y], y], [right[y], y]);
  for (let x = 0; x < width; x += 2) if (bottom[x] >= 0) points.push([x, top[x]], [x, bottom[x]]);
  return points;
}
function inverse(S, x, y) { const [a, b, c] = S, det = a * c - b * b; return [(c * x - b * y) / det, (a * y - b * x) / det]; }
async function measure(image, width, height) {
  const { data, info } = await sharp(image, { raw: { width, height, channels: 4 } }).resize({ width: 512, height: 512, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 100 && (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3 < 215 ? 1 : 0;
  const outer = components(mask, w, h)[0];
  if (!outer || outer.length < w * h * .08) fail(400, 'No clear disk was detected. Select Flat artwork or Manual outline.');
  const fitted = ellipse(boundary(outer, w, h), w, h), holeMask = new Uint8Array(mask.length);
  for (let i = 0; i < holeMask.length; i++) {
    const [nx, ny] = inverse(fitted.S, i % w - fitted.center[0], Math.floor(i / w) - fitted.center[1]);
    const values = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    holeMask[i] = nx * nx + ny * ny < .38 ** 2 && ((Math.min(...values) > 215 && Math.max(...values) - Math.min(...values) < 40) || data[i * 4 + 3] < 30) ? 1 : 0;
  }
  const holes = components(holeMask, w, h).filter(part => part.length > w * h * .0008);
  let hub = fitted.center;
  if (holes.length) {
    const candidates = holes.map(part => ellipse(boundary(part, w, h), w, h));
    candidates.sort((a, b) => Math.hypot(a.center[0] - w * .535, a.center[1] - h * .455) - Math.hypot(b.center[0] - w * .535, b.center[1] - h * .455));
    hub = candidates[0].center;
  } else fail(400, 'The disk center hole could not be detected. Use Manual outline to specify its center.');
  return { center: [fitted.center[0] / w, fitted.center[1] / h], S: [fitted.S[0] / w, fitted.S[1] / w, fitted.S[1] / h, fitted.S[2] / h], hub: [hub[0] / w, hub[1] / h] };
}
export async function prepareArtwork(input) {
  if (!input || typeof input.data !== 'string' || input.data.length > MAX_IMAGE_BYTES * 1.34 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) fail(400, 'Upload a PNG, JPEG or WebP image no larger than 3 MB.');
  const source = Buffer.from(input.data, 'base64');
  if (!source.length || source.length > MAX_IMAGE_BYTES) fail(413, 'Image must be no larger than 3 MB.');
  const png = source.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = source[0] === 255 && source[1] === 216 && source[2] === 255;
  const webp = source.subarray(0, 4).toString() === 'RIFF' && source.subarray(8, 12).toString() === 'WEBP';
  if (!png && !jpeg && !webp) fail(400, 'Only PNG, JPEG and WebP raster bytes are accepted.');
  let metadata, decoded;
  try {
    const loader = sharp(source, { limitInputPixels: 16_777_216, failOn: 'warning', animated: false });
    metadata = await loader.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) fail(400, 'Only non-animated PNG, JPEG and WebP images are accepted.');
    if (metadata.width < 128 || metadata.height < 128 || Math.max(metadata.width, metadata.height) > 4096) fail(400, 'Image dimensions must be between 128 and 4096 pixels.');
    decoded = await loader.autoOrient().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (error) { if (error.status) throw error; fail(400, 'This file could not be decoded as a supported raster image.'); }
  const { width, height } = decoded.info, pixels = decoded.data, calibration = input.calibration || {};
  if (!['auto', 'flat', 'manual'].includes(calibration.mode || 'auto')) fail(400, 'Unknown artwork fit mode.');
  let geometry;
  if (calibration.mode === 'flat') geometry = { center: [.5, .5], S: [.5, 0, 0, .5], hub: [.5, .5] };
  else if (calibration.mode === 'manual') {
    const o = calibration.outline || {}, cx = bounded(o.x, .05, .95, .5), cy = bounded(o.y, .05, .95, .5);
    const rx = bounded(o.rx, .05, .8, .4), ry = bounded(o.ry, .05, .8, .4), angle = bounded(o.angle, -180, 180) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    geometry = { center: [cx, cy], S: [c * rx, -s * ry, s * rx, c * ry], hub: [bounded(o.hx, .05, .95, cx), bounded(o.hy, .05, .95, cy)] };
  } else geometry = await measure(pixels, width, height);
  const [a, b, c, d] = geometry.S, determinant = a * d - b * c;
  const dx = geometry.hub[0] - geometry.center[0], dy = geometry.hub[1] - geometry.center[1];
  const offset = [(d * dx - b * dy) / determinant, (a * dy - c * dx) / determinant], length2 = offset[0] ** 2 + offset[1] ** 2;
  if (!Number.isFinite(length2) || length2 >= .5) fail(400, 'The center hole is outside the disk interior. Adjust the outline and hole center.');
  const gamma = Math.sqrt(1 - length2), factor = length2 > 1e-10 ? (1 - gamma) / length2 : 0;
  const boost = [gamma + factor * offset[0] ** 2, factor * offset[0] * offset[1], gamma + factor * offset[1] ** 2];
  const zoom = bounded(calibration.zoom, .5, 2, 1), angle = bounded(calibration.rotation, -180, 180) * Math.PI / 180;
  const shiftX = bounded(calibration.x, -.4, .4), shiftY = bounded(calibration.y, -.4, .4), cosine = Math.cos(angle), sine = Math.sin(angle);
  const output = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const nx = (x + .5) / SIZE * 2 - 1, ny = (y + .5) / SIZE * 2 - 1, radius = Math.hypot(nx, ny);
    if (radius > 1 || radius < HOLE) continue;
    const px = (cosine * nx - sine * ny) * .985 / zoom + shiftX, py = (sine * nx + cosine * ny) * .985 / zoom + shiftY;
    const divisor = 1 + offset[0] * px + offset[1] * py;
    const ux = (boost[0] * px + boost[1] * py + offset[0]) / divisor, uy = (boost[1] * px + boost[2] * py + offset[1]) / divisor;
    const sx = (geometry.center[0] + a * ux + b * uy) * width, sy = (geometry.center[1] + c * ux + d * uy) * height;
    const ix = Math.floor(sx), iy = Math.floor(sy);
    if (ix < 0 || iy < 0 || ix + 1 >= width || iy + 1 >= height) continue;
    const fx = sx - ix, fy = sy - iy, dest = (y * SIZE + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      const pos = (iy * width + ix) * 4 + channel;
      output[dest + channel] = (pixels[pos] * (1 - fx) + pixels[pos + 4] * fx) * (1 - fy) + (pixels[pos + width * 4] * (1 - fx) + pixels[pos + width * 4 + 4] * fx) * fy;
    }
  }
  const texture = await sharp(output, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ quality: 94, alphaQuality: 100 }).toBuffer();
  const digest = createHash('sha256').update(texture).digest('hex');
  return { source, texture, extension: metadata.format === 'jpeg' ? 'jpg' : metadata.format, geometry, digest, calibration };
}
