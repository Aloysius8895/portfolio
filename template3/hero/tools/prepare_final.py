"""Prepare independent native-playback expression clips from portfolio/final.mp4.

The original stays untouched. Light studio backgrounds are estimated from the
side margins; black sources are supported too. Enclosed facial details stay solid.
"""
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image

HERO = Path(__file__).resolve().parents[1]
SOURCE = HERO.parent.parent / 'final.mp4'
OUT = HERO / 'assets' / 'final'
SIZE = 640
BACKGROUND = 242
# Exclude the short neutral resets between expressions, so each held final
# frame still represents the requested expression (rather than the next one).
RANGES = {'center': (0, 39), 'left': (39, 77), 'down': (77, 125), 'right': (136, 183), 'up': (196, 240)}


def source_background(frame):
    # Reconstruct the light studio gradient from unobstructed side margins.
    if float(np.median(frame[:30, :80])) < 80:
        return np.zeros_like(frame, dtype=np.float32)
    width = frame.shape[1]
    left = np.median(frame[:, :80], axis=1)[:, None, :]
    right = np.median(frame[:, -80:], axis=1)[:, None, :]
    mix = np.linspace(0, 1, width, dtype=np.float32)[None, :, None]
    return left * (1 - mix) + right * mix


def foreground_rgb(frame, alpha):
    background = source_background(frame)
    premultiplied = np.clip(frame.astype(np.float32) - background * (1 - alpha[:, :, None]), 0, 255)
    premultiplied[alpha < 1 / 255] = 0
    return premultiplied[:, :, ::-1].copy()


def matte(frame):
    background = source_background(frame)
    difference = np.max(np.abs(frame.astype(np.float32) - background), axis=2)
    threshold = 28 if background.max() > 80 else 12
    support = np.uint8(difference > threshold) * 255
    support = cv2.morphologyEx(support, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    flood = support.copy()
    cv2.floodFill(flood, None, (0, 0), 255)
    support |= 255 - flood
    alpha = cv2.GaussianBlur(support.astype(np.float32) / 255, (0, 0), .65)
    return np.clip((alpha - .02) / .96, 0, 1)


def frames():
    capture = cv2.VideoCapture(str(SOURCE))
    if not capture.isOpened():
        raise RuntimeError(f'Cannot read {SOURCE}')
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            yield frame
    finally:
        capture.release()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(SOURCE))
    fps = capture.get(cv2.CAP_PROP_FPS)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.release()
    if abs(fps - 24) > .01 or count < 240:
        raise ValueError(f'Expected the inspected 24fps, 240-frame source; got {fps}, {count}')

    bounds = []
    for frame in frames():
        ys, xs = np.where(matte(frame) > .1)
        bounds.append((xs.min(), ys.min(), xs.max(), ys.max()))
    x0, y0 = min(b[0] for b in bounds), min(b[1] for b in bounds)
    x1, y1 = max(b[2] for b in bounds), max(b[3] for b in bounds)
    side = max(x1 - x0, y1 - y0) + 64
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    scale = SIZE / side
    transform = np.array([[scale, 0, SIZE / 2 - cx * scale], [0, scale, SIZE / 2 - cy * scale]], np.float32)
    report = {'source': str(SOURCE), 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'fps': fps, 'size': [SIZE, SIZE], 'source_bounds': [int(x0), int(y0), int(x1), int(y1)],
              'background': '#f2f2f2', 'clips': {}}
    encoder = None
    active = None
    last_rgba = None
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        for index, frame in enumerate(frames()):
            key = next((key for key, (start, end) in RANGES.items() if start <= index < end), None)
            if key is None:
                continue
            if key != active:
                if encoder:
                    encoder.stdin.close()
                    if encoder.wait() != 0:
                        raise RuntimeError(f'Encoding failed for {active}')
                    Image.fromarray(last_rgba).save(OUT / f'{active}-end.webp', lossless=True)
                    print(f'Prepared {active}', flush=True)
                active = key
                command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                           '-s', f'{SIZE}x{SIZE}', '-r', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264',
                           '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-g', '12', '-keyint_min', '12',
                           '-sc_threshold', '0', '-movflags', '+faststart', str(OUT / f'{key}.mp4')]
                encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
                start, end = RANGES[key]
                report['clips'][key] = {'start_frame': start, 'end_frame_exclusive': end, 'frames': end - start,
                                        'duration': (end - start) / fps, 'src': f'/hero/assets/final/{key}.mp4'}
            source_alpha = matte(frame)
            alpha = cv2.warpAffine(source_alpha, transform, (SIZE, SIZE), flags=cv2.INTER_LINEAR)
            rgb = foreground_rgb(frame, source_alpha)
            rgb = cv2.warpAffine(rgb, transform, (SIZE, SIZE), flags=cv2.INTER_LINEAR).astype(np.float32)
            rgb[alpha < 1 / 255] = 0
            composite = np.clip(rgb + BACKGROUND * (1 - alpha[:, :, None]), 0, 255).astype(np.uint8)
            encoder.stdin.write(composite.tobytes())
            foreground = np.divide(rgb, np.maximum(alpha[:, :, None], .001)).clip(0, 255).astype(np.uint8)
            last_rgba = np.dstack([foreground, (alpha * 255).astype(np.uint8)])
            if index == RANGES[key][0]:
                Image.fromarray(last_rgba).save(OUT / f'{key}-start.webp', lossless=True)
        if encoder:
            encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError(f'Encoding failed for {active}')
            Image.fromarray(last_rgba).save(OUT / f'{active}-end.webp', lossless=True)
            print(f'Prepared {active}', flush=True)
    finally:
        if encoder and encoder.poll() is None:
            encoder.kill()
    (OUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('Prepared all five clips; source unchanged.', flush=True)


if __name__ == '__main__':
    main()
