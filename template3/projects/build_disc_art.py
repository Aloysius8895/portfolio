"""Map the user's photographed discs onto the existing 3D disc surfaces.

Run from portfolio/: python template3/projects/build_disc_art.py
Requires OpenCV, NumPy and Playwright Chromium only when rebuilding artwork.
SVGs preserve editable projection geometry; WebP exports keep runtime texture
decoding fast. Source PNGs remain unchanged in portfolio/diskPic.
"""
import base64
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT.parent / 'diskPic'
OUTPUT = ROOT / 'site' / 'project-discs'
SIZE = 1536
FILES = {
    'kerjayaku': 'KerjayaKu cartoon career island.png',
    'itfits': 'ItFitS_ Tailored fit by AI.png',
    'seceff': 'SecEff_ Server clouds and construction.png',
    'ecolink': 'EcoLink_ Mentors and founders connected.png',
    'emptyclass': 'EmptyClass_ Quiet Study Spaces.png',
    'enervision-ai': 'EnerVision AI_ Smart Home Dusk.png',
    'daily-news': 'Daily News_ Newsprint Disc Study.png',
    'metrix-ai': 'MetriX AI smart sampling rover.png',
    'peer-tutoring': 'Peer Tutoring_ Learning in Sync.png',
}


def measure(image):
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = np.uint8(gray < 210) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outline = max(contours, key=cv2.contourArea)
    center, axes, degrees = cv2.fitEllipse(outline)
    angle = np.radians(degrees)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    scale = rotation @ np.diag(np.array(axes) / 2) @ rotation.T
    yy, xx = np.mgrid[:height, :width]
    normalized = np.linalg.inv(scale) @ np.stack([xx.ravel() - center[0], yy.ravel() - center[1]])
    near_center = np.sum(normalized ** 2, axis=0).reshape(height, width) < .38 ** 2
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hole_mask = np.uint8((gray > 215) & (hsv[:, :, 1] < 40) & near_center) * 255
    holes, _ = cv2.findContours(hole_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    holes = [contour for contour in holes if cv2.contourArea(contour) > 1000 and len(contour) > 5]
    if not holes:
        raise ValueError('Could not locate the photographed disc center hole')
    expected = np.array([width * .535, height * .455])
    hole = min(holes, key=lambda contour: np.linalg.norm(np.array(cv2.fitEllipse(contour)[0]) - expected))
    hub = np.array(cv2.fitEllipse(hole)[0])

    # A conic-preserving projective boost places the real hub at the origin.
    # Affine-only correction would leave the photographed metal hub off-center.
    offset = np.linalg.solve(scale, hub - center)
    length2 = float(offset @ offset)
    if length2 >= .5:
        raise ValueError('Disc center fit is outside the expected interior')
    inverse_gamma = np.sqrt(1 - length2)
    boost = np.eye(3)
    boost[:2, :2] = inverse_gamma * np.eye(2)
    if length2 > 1e-10:
        boost[:2, :2] += (1 - inverse_gamma) * np.outer(offset, offset) / length2
    boost[:2, 2] = offset
    boost[2, :2] = offset
    ellipse = np.eye(3)
    ellipse[:2, :2] = scale
    ellipse[:2, 2] = center
    return ellipse @ boost, {'outline_center': list(center), 'outline_axes': list(axes), 'hub': hub.tolist()}


def texture(source, transform):
    # SVG contains the unmodified PNG once, reused with local affine transforms.
    # Small triangles approximate the projective mapping without touching pixels.
    encoded = base64.b64encode(source.read_bytes()).decode('ascii')
    image = cv2.imdecode(np.fromfile(source, dtype=np.uint8), cv2.IMREAD_COLOR)
    height, width = image.shape[:2]
    definitions = [f'<image id="source" width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/>',
                   '<clipPath id="disc"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 768a768 768 0 1 0 1536 0a768 768 0 1 0 -1536 0M584 768a184 184 0 1 0 368 0a184 184 0 1 0 -368 0"/></clipPath>']
    pieces = []
    grid = np.linspace(-1, 1, 21)
    for row in range(len(grid) - 1):
        for col in range(len(grid) - 1):
            x0, x1, y0, y1 = grid[col], grid[col + 1], grid[row], grid[row + 1]
            if max(abs((x0 + x1) / 2) - .05, 0) ** 2 + max(abs((y0 + y1) / 2) - .05, 0) ** 2 > 1:
                continue
            for vertices in ([(x0, y0), (x1, y0), (x1, y1)], [(x0, y0), (x1, y1), (x0, y1)]):
                normalized = np.array(vertices)
                destination = (normalized + 1) * SIZE / 2
                # The physical mesh supplies its own metal edge: stop just
                # inside the photographed rim to avoid doubling that edge.
                projected = transform @ np.column_stack([normalized * .985, np.ones(3)]).T
                original = (projected[:2] / projected[2]).T
                affine = np.linalg.solve(np.column_stack([original, np.ones(3)]), destination)
                # Sub-pixel overlap avoids anti-alias seams along shared edges.
                centroid = destination.mean(axis=0)
                delta = destination - centroid
                clip = destination + delta / np.linalg.norm(delta, axis=1)[:, None] * 2.2
                polygon = ' '.join(f'{x:.3f},{y:.3f}' for x, y in clip)
                index = len(pieces)
                definitions.append(f'<clipPath id="t{index}"><polygon points="{polygon}"/></clipPath>')
                matrix = ' '.join(f'{value:.9f}' for value in (affine[0, 0], affine[0, 1], affine[1, 0], affine[1, 1], affine[2, 0], affine[2, 1]))
                pieces.append(f'<g clip-path="url(#t{index})"><use href="#source" transform="matrix({matrix})"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">'
            '<defs>' + ''.join(definitions) + '</defs><g clip-path="url(#disc)">' + ''.join(pieces) + '</g></svg>')


def main():
    missing = [name for name in FILES.values() if not (SOURCES / name).is_file()]
    if missing:
        raise FileNotFoundError(f'Missing source artwork: {missing}')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    data_path = ROOT / 'projects' / 'projects.json'
    data = json.loads(data_path.read_text(encoding='utf-8'))
    report = {}
    for project in data['projects']:
        slug = project['slug']
        source = SOURCES / FILES[slug]
        image = cv2.imdecode(np.fromfile(source, dtype=np.uint8), cv2.IMREAD_COLOR)
        transform, geometry = measure(image)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        svg = texture(source, transform)
        texture_digest = hashlib.sha256(svg.encode('utf-8')).hexdigest()
        (OUTPUT / f'{slug}.svg').write_text(svg, encoding='utf-8')
        project['disc'] = f'/project-discs/{slug}.svg?v={texture_digest[:10]}'
        report[slug] = {'source': source.name, 'sha256': digest, 'texture_sha256': texture_digest, 'texture': project['disc'], **geometry}
        print(f'Prepared {slug}', flush=True)
    # Export the vector texture once at build time. Sending hundreds of SVG
    # clipping primitives directly to WebGL can stall distant-disc selection.
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        for project in data['projects']:
            slug = project['slug']
            svg_data = base64.b64encode((OUTPUT / f'{slug}.svg').read_bytes()).decode('ascii')
            exported = page.evaluate('''async encoded => {
              const image = new Image();
              image.src = 'data:image/svg+xml;base64,' + encoded;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
              canvas.getContext('2d').drawImage(image, 0, 0);
              return canvas.toDataURL('image/webp', .96).split(',')[1];
            }''', svg_data)
            content = base64.b64decode(exported)
            (OUTPUT / f'{slug}.webp').write_bytes(content)
            digest = hashlib.sha256(content).hexdigest()
            project['disc'] = f'/project-discs/{slug}.webp?v={digest[:10]}'
            report[slug]['texture_sha256'] = digest
            report[slug]['texture'] = project['disc']
            print(f'Exported {slug}: {len(content)} bytes', flush=True)
        browser.close()
    data['_note'] = 'Edit here, then run python projects/build.py. Disc art comes from portfolio/diskPic; rebuild it with python projects/build_disc_art.py.'
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUTPUT / 'sources.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
