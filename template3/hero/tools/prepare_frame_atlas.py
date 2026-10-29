"""Predecode final.mp4 for continuous pointer-driven expression rendering.

Run from template3/: python hero/tools/prepare_frame_atlas.py
Original video and existing artwork are untouched. No model or synthetic facial
motion is generated: all atlas tiles are actual, aligned source-video frames.
"""
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from prepare_final import HERO, SOURCE, frames, matte, foreground_rgb, BACKGROUND

OUT = HERO / 'assets' / 'final-atlas'
GRID = 8
SIZES = {'desktop': 384, 'mobile': 256}
DEFAULT_FRAME = 12


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    prepared = json.loads((HERO / 'assets' / 'final' / 'manifest.json').read_text())
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != prepared['source_sha256']:
        raise ValueError('Source changed; run prepare_final.py to recalibrate the crop first')
    x0, y0, x1, y1 = prepared['source_bounds']
    side = max(x1 - x0, y1 - y0) + 64
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    scale = 640 / side
    transform = np.array([[scale, 0, 320 - cx * scale], [0, scale, 320 - cy * scale]], np.float32)
    variants = {name: {'cellSize': size, 'grid': GRID, 'urls': []} for name, size in SIZES.items()}
    sheets = {name: Image.new('RGB', (size * GRID, size * GRID), (BACKGROUND,) * 3) for name, size in SIZES.items()}
    count = 0

    def save_sheets(index):
        for name in SIZES:
            destination = OUT / f'{name}-{index}.webp'
            sheets[name].save(destination, quality=92, method=5)
            version = hashlib.sha256(destination.read_bytes()).hexdigest()[:10]
            variants[name]['urls'].append(f'/hero/assets/final-atlas/{destination.name}?v={version}')
            print(f'Prepared {name} atlas {index}', flush=True)

    for index, frame in enumerate(frames()):
        source_alpha = matte(frame)
        alpha = cv2.warpAffine(source_alpha, transform, (640, 640), flags=cv2.INTER_LINEAR)
        rgb = foreground_rgb(frame, source_alpha)
        rgb = cv2.warpAffine(rgb, transform, (640, 640), flags=cv2.INTER_LINEAR).astype(np.float32)
        rgb[alpha < 1 / 255] = 0
        composite = np.clip(rgb + BACKGROUND * (1 - alpha[:, :, None]), 0, 255).astype(np.uint8)
        image = Image.fromarray(composite)
        tile = index % (GRID * GRID)
        for name, size in SIZES.items():
            sheets[name].paste(image.resize((size, size), Image.Resampling.LANCZOS), ((tile % GRID) * size, (tile // GRID) * size))
        if index == DEFAULT_FRAME:
            foreground = np.divide(rgb, np.maximum(alpha[:, :, None], .001)).clip(0, 255).astype(np.uint8)
            foreground[alpha < 1 / 255] = 0
            Image.fromarray(np.dstack([foreground, (alpha * 255).astype(np.uint8)])).save(OUT / 'poster.webp', lossless=True)
        count = index + 1
        if tile == GRID * GRID - 1:
            save_sheets(index // (GRID * GRID))
            sheets = {name: Image.new('RGB', (size * GRID, size * GRID), (BACKGROUND,) * 3) for name, size in SIZES.items()}
    if count % (GRID * GRID):
        save_sheets((count - 1) // (GRID * GRID))
    manifest = {'source_sha256': digest, 'fps': prepared['fps'], 'frameCount': count,
                'defaultFrame': DEFAULT_FRAME, 'poster': '/hero/assets/final-atlas/poster.webp',
                'background': '#f2f2f2', 'variants': variants}
    for variant in variants.values():
        variant['textureBytes'] = len(variant['urls']) * (variant['cellSize'] * GRID) ** 2 * 4
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {count} real source frames; source unchanged.', flush=True)


if __name__ == '__main__':
    main()
