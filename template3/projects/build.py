"""Put the projects in projects.json onto the disc page and generate their pages.

    python projects/build.py

Rewrites site/index.html in place (disc data, Index dropdown, info labels,
title) and writes site/production/<slug>/index.html from the mirrored detail
page kept in projects/template-production.html. Safe to run repeatedly.
"""
import html, json, re, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get('PORTFOLIO_SITE', str(ROOT / 'site'))).resolve()
DATA = json.loads(Path(os.environ.get('PORTFOLIO_DATA', str(ROOT / 'projects' / 'projects.json'))).read_text(encoding='utf-8'))
TEMPLATE = (ROOT / 'projects' / 'template-production.html').read_text(encoding='utf-8')
PROJECTS = sorted((p for p in DATA['projects'] if p.get('status', 'published') == 'published'), key=lambda project: project.get('created_at', ''), reverse=True)
GITHUB = f"https://github.com/{DATA['owner']}"
esc = html.escape


def block_end(s, start):
    """Index just past the </div> that closes the <div> starting at `start`."""
    depth = 0
    for m in re.finditer(r'<div\b|</div>', s[start:]):
        depth += 1 if m.group(0) == '<div' else -1
        if depth == 0:
            return start + m.end()
    raise ValueError('unbalanced div')


def replace_block(s, opener, new):
    start = s.find(opener)
    if start < 0:
        raise ValueError(f'missing {opener}')
    return s[:start] + new + s[block_end(s, start):]


def sub_once(pattern, repl, s, flags=0):
    out, n = re.subn(pattern, repl, s, count=1, flags=flags)
    if n != 1:
        raise ValueError(f'pattern not found: {pattern}')
    return out


def repo_url(p):
    return f"https://github.com/{p.get('repo_owner', DATA['owner'])}/{p['repo']}"


# ---------- shared page chrome ----------

def brand(s):
    def wordmark(match):
        opening = re.sub(r'\s+aria-label="[^"]*"', '', match.group(1))
        return (opening[:-1] + ' aria-label="Chill · Back to home">'
                '<span class="chill-logo" aria-hidden="true">Chill</span></a>')
    s = re.sub(r'(<a\b[^>]*\bclass="[^"]*\bnav-logo\b[^"]*"[^>]*>).*?</a>',
               wordmark, s, flags=re.S)
    if 'href="/brand/chill.css"' not in s:
        s = s.replace('</head>', '<link rel="stylesheet" href="/brand/chill.css"></head>', 1)
    return s


def nav(s):
    s = brand(s)
    # Television is hidden: projects live on the Films page only.
    s = re.sub(r'<li>\s*<a[^>]*href="/television"[^>]*>.*?</a>\s*</li>\s*', '', s, flags=re.S)
    s = s.replace('<span data-hover-target="" class="nav-link__label">Films</span>',
                  '<span data-hover-target="" class="nav-link__label">Projects</span>')
    items = ''.join(
        f'<div role="listitem" class="w-dyn-item">\n'
        f'                            <a data-film-scroll="{esc(p["name"])}" href="/production/{p["slug"]}" class="nav-dropdown__link w-inline-block" data-barba-prevent="">\n'
        f'                              <div class="nav-dropdown__link-inner">\n'
        f'                                <h2 class="nav-dropdown__link-label">{esc(p["name"])}</h2><span class="nav-dropdown__link-label">{esc(p["year"])}</span>\n'
        f'                              </div>\n'
        f'                            </a>\n'
        f'                          </div>' for p in PROJECTS)
    opener = '<div role="list" class="nav-dropdown__content-li w-dyn-items">'
    return replace_block(s, opener, f'{opener}\n                          {items}\n                        </div>')


def head(s, title, description, canonical, ld):
    s = re.sub(r'<title>.*?</title>', lambda _: f'<title>{esc(title)}</title>', s, count=1, flags=re.S)
    for attr in ('og:title', 'twitter:title'):
        s = re.sub(rf'<meta content="[^"]*" (property|name)="{attr}">', lambda m: f'<meta content="{esc(title)}" {m.group(1)}="{attr}">', s)
    for attr in ('description', 'og:description', 'twitter:description'):
        s = re.sub(rf'<meta content="[^"]*" (property|name)="{attr}">', lambda m: f'<meta content="{esc(description)}" {m.group(1)}="{attr}">', s)
    s = re.sub(r'<script type="application/ld\+json">.*?</script>',
               lambda _: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026') + '</script>', s, count=1, flags=re.S)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{canonical}">', s)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{canonical}">', s)
    return s


# ---------- home page (disc gallery) ----------

def film_item(p):
    dyn = lambda field, values: (
        '<div class="w-dyn-list">\n                <div role="list" class="w-dyn-items">' +
        ''.join(f'<div role="listitem" class="w-dyn-item">\n                    <p data-film-field="{field}" class="paragraph-xxs">{esc(v)}</p>\n                  </div>' for v in values) +
        '\n                </div>\n              </div>')
    # One "review": the project's context and pitch. Rating 0 hides the stars.
    review = (f'<div data-review-source-item="" role="listitem" class="w-dyn-item">\n'
              f'                    <p data-film-field="review-publication" class="paragraph-xxs">{esc(p["context"])}</p>\n'
              f'                    <p data-film-field="review-testimonial" class="paragraph-xxs">{esc(p["pitch"])}</p>\n'
              f'                    <p data-film-field="review-stars" class="paragraph-xxs">0</p>\n'
              f'                  </div>')
    return (f'<div data-film-item="" role="listitem" class="collection-item w-dyn-item">\n'
            f'              <p data-film-field="title" class="paragraph-xxs">{esc(p["name"])}</p>\n'
            f'              {dyn("directors", [p["category"]])}\n'
            f'              <p data-film-field="year" class="paragraph-xxs">{esc(p["year"])}</p>\n'
            f'              {dyn("starring", p["stack"][:3])}\n'
            f'              <p data-film-field="disc-art-url" class="paragraph-xxs">{esc(p["disc"])}</p>\n'
            f'              <p data-film-field="disc-art-alt" class="paragraph-xxs">{esc(p["name"])} disc</p>\n'
            f'              <a data-film-field="detail-url" href="/production/{p["slug"]}" class="w-inline-block"></a>\n'
            f'              <div class="w-dyn-list">\n                <div role="list" class="w-dyn-items">{review}</div>\n              </div>\n'
            f'            </div>')


def build_home():
    path = SITE / 'index.html'
    s = path.read_text(encoding='utf-8')
    first = PROJECTS[0]
    s = head(s, 'Aloysius Ting Zi Heng — Projects', 'Projects by Aloysius Ting Zi Heng: machine learning, AI, computer vision and interactive prototypes.', '/', {
        '@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Aloysius Ting Zi Heng — Projects', 'url': '/',
        'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(PROJECTS), 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'url': f'/production/{p["slug"]}', 'name': p['name']}
            for i, p in enumerate(PROJECTS)]}})
    s = nav(s)
    s = re.sub(r'(<h1 class="sr-only">)[^<]*(</h1>)', r'\1Projects by Aloysius Ting Zi Heng\2', s, count=1)
    # Disc info labels and the first project's static text (JS rewrites on change).
    s = s.replace('>DIRECTED BY</p>', '>CATEGORY</p>').replace('>STARRING</p>', '>STACK</p>')
    s = sub_once(r'(data-film-target="title"[^>]*>)[^<]*(</p>)', lambda m: m.group(1) + esc(first['name']) + m.group(2), s)
    s = sub_once(r'(data-film-target="primary-credit"[^>]*>)[^<]*(</p>)', lambda m: m.group(1) + esc(first['category']) + m.group(2), s)
    s = sub_once(r'(data-film-target="year"[^>]*>)[^<]*(</p>)', lambda m: m.group(1) + esc(first['year']) + m.group(2), s)
    s = sub_once(r'(data-film-target="starring"[^>]*>).*?(</p>)', lambda m: m.group(1) + '<br>'.join(map(esc, first['stack'][:3])) + m.group(2), s, re.S)
    # Two review slots on the page: the first shows the project, the second stays empty.
    for field, first_text in (('review-publication', first['context']), ('review-testimonial', first['pitch'])):
        texts = iter([esc(first_text), ''])
        s = re.sub(rf'(data-film-target="{field}"[^>]*>)[^<]*(</p>)',
                   lambda m: f'{m.group(1)}{next(texts, "")}{m.group(2)}', s)
    items = '\n'.join(film_item(p) for p in PROJECTS)
    s = replace_block(s, '<div data-film-list=""',
        f'<div data-film-list="" class="film-data w-dyn-list">\n          <div role="list" class="w-dyn-items">\n            {items}\n          </div>\n        </div>')
    path.write_text(s, encoding='utf-8')


# ---------- project pages ----------

def P(text, cls, reveal='text', style='', balance=''):
    return (f'<p space-top="" space-bottom="" data-film-target="" style="{style}" data-balance-lines="{balance}" '
            f'data-reserve-lines="{balance}" data-reveal="{reveal}" class="custom-element {cls}">{text}</p>')


def btn(label, href, attrs=''):
    return (f'<a data-reveal="btn" data-hover="" href="{esc(href)}" class="btn w-inline-block" target="_blank" rel="noopener noreferrer"{attrs}>\n'
            f'                  <div class="btn__divider"></div><span class="btn__p-mask"><span class="btn__p heading-s">{esc(label)}</span></span>\n'
            f'                  <div class="btn__divider"></div>\n                </a>')


def credits(p):
    groups = [(k, v) for k, v in (('ROLE', [p['role']] if p.get('role') else []),
                                  ('TEAM', [p['team']] if p.get('team') else []),
                                  ('BUILT WITH', p['stack'])) if v]
    out = []
    for i, (label, values) in enumerate(groups):
        out.append(P(label, 'subheading-xs', style='' if i == 0 else 'margin-left: 0.5em;'))
        out.append('<div class="w-dyn-list">\n                    <div role="list" class="credits-item__list w-dyn-items">' + ''.join(
            f'<div role="listitem" class="w-dyn-item">\n                        {P(esc(v), "paragraph-m", style="line-height: 1;")}\n                      </div>'
            for v in values) + '</div>\n                  </div>')
    return '\n                  '.join(out)


def metadata(p):
    rows = [('YEAR', p['year']), ('CATEGORY', p['category']), ('CONTEXT', p['context']), ('REPOSITORY', p['repo'])]
    return '\n'.join(
        f'                  <div class="production-metadata__item">\n'
        f'                    <div data-reveal="rule" class="divider-horizontal"></div>\n'
        f'                    <div class="metadata-item__content">\n'
        f'                      {P(label, "subheading-xs")}\n'
        f'                      {P(esc(value), "paragraph-m", style="line-height: 1;")}\n'
        f'                    </div>\n                  </div>' for label, value in rows)


def next_list():
    return ''.join(
        f'<div data-scroll-next-item="" role="listitem" class="w-dyn-item">\n'
        f'                  <p data-scroll-next-field="title" class="">{esc(p["name"])}</p>\n'
        f'                  <p data-scroll-next-field="type" class="">Film</p>\n'
        f'                  <p data-scroll-next-field="disc-art-url" class="">{esc(p["disc"])}</p>\n'
        f'                  <p data-scroll-next-field="slug" class="">{p["slug"]}</p>\n'
        f'                  <p data-scroll-next-field="year" class="">{esc(p["year"])}</p>\n'
        f'                  <p data-scroll-next-field="genre" class="">{esc(p["category"])}</p>\n'
        f'                  <p data-scroll-next-field="runtime" class="">{esc(p["repo"])}</p>\n'
        f'                </div>' for p in PROJECTS)


def project_main(p):
    plus = ''.join(f'\n                <div data-reveal="pop" class="plus is--{c}">\n                  <div class="plus-stroke is--hor"></div>\n                  <div class="plus-stroke is--ver"></div>\n                </div>' for c in ('tl', 'tr', 'bl', 'br'))
    buttons = btn('VIEW ON GITHUB', repo_url(p)) + ('\n                ' + btn('LIVE DEMO', p['demo']) if p.get('demo') else '')
    rows = '\n'.join(
        f'                <div class="trailer-content__row">\n'
        + (f'                  <p data-trailer-quote-text="" class="custom-element heading-l">{esc(p["quote"])}</p>\n' if i == 0 else '')
        + '                  <div class="divider-horizontal"></div>\n'
        + (f'                  {btn("READ THE README", repo_url(p) + "#readme", " data-trailer-quote-btn=\"\"")}\n' if i == 2 else '')
        + '                </div>' for i in range(5))
    # Features reuse the hero's metadata rows (rule, label left, text right):
    # the template's inline "awards" flow is unreadable for Chinese sentences.
    features = '\n'.join(
        f'                  <div class="production-metadata__item">\n'
        f'                    <div class="divider-horizontal"></div>\n'
        f'                    <div class="metadata-item__content" style="gap: 2em; padding-block: .35em;">\n'
        f'                      {P(esc(label.upper()), "subheading-xs", reveal="", style="flex: none;")}\n'
        f'                      {P(esc(value), "paragraph-m", reveal="", style="line-height: 1.5; text-align: right;")}\n'
        f'                    </div>\n                  </div>' for label, value in p['features'])
    template_next = TEMPLATE[TEMPLATE.find('<section data-scroll-next'):TEMPLATE.find('</main>')]
    scroll_next = template_next.replace('>Next production</h2>', '>Next project</h2>').replace(
        'aria-label="Go to the next production"', 'aria-label="Go to the next project"')
    scroll_next = replace_block(scroll_next, '<div data-scroll-next-list=""',
        f'<div data-scroll-next-list="" class="film-data w-dyn-list">\n              <div role="list" class="w-dyn-items">\n                {next_list()}\n              </div>\n            </div>')
    return f'''<main data-barba-namespace="production" data-barba="container" class="main-wrapper">
      <div data-dissolve-track="" class="reveal-track">
        <section id="production_hero" data-dissolve="" data-production-hero="" data-theme-change="nav:dark" class="production-hero theme-base">
          <div class="container">
            <div class="production-content">
              <div class="production__info">
                <div class="production__title">
                  {P(esc(p["name"]), "heading-l text-align-center", reveal="lines", balance="2").replace("<p ", "<h1 ").replace("</p>", "</h1>")}
                </div>
                <div data-reveal="rule" class="divider-horizontal"></div>
                <div data-wrap-balance="2" data-wrap-flow="" class="production__credits">
                  {credits(p)}
                </div>
                <div class="production__metadata">
{metadata(p)}
                </div>
              </div>
              <div class="production__cta">{plus}
                {buttons}
              </div>
            </div>
          </div>
        </section>
        <section data-theme-change="nav:base" class="trailer theme-dark">
          <div data-dissolve-bleed="" data-parallax="trigger" class="trailer__vh">
            <div class="container">
              <div data-trailer-quote="" class="trailer__content">
{rows}
              </div>
            </div>
          </div>
        </section>
        <section id="production_desc" data-theme-change="nav:dark" class="production-description theme-base">
          <div class="container">
            <div class="description-content">
              <div id="w-node-_28e13e63-cd44-5695-3fd7-f20cb3ebcc24-e764e596" class="description__synopsis">
                {P(esc(p["synopsis"]), "paragraph-xl", reveal="", style="max-width: 28ch; text-wrap: pretty;")}
                {P(esc(p["intro"]), "paragraph-m project-intro", reveal="", style="max-width: 42em; margin-top: 2em; line-height: 1.75;")}
              </div>
              <div id="w-node-c2f429f7-1538-6d02-129e-f52c44ac5816-e764e596" class="description__awards-wrap">
                <div class="production__metadata" style="width: 100%;">
{features}
                </div>
              </div>
            </div>
          </div>
        </section>
        {scroll_next}</main>'''


def build_project(p):
    s = TEMPLATE
    s = head(s, f'{p["name"]} — Aloysius Ting Zi Heng', p['synopsis'], f'/production/{p["slug"]}', {
        '@context': 'https://schema.org', '@type': 'CreativeWork', 'name': p['name'],
        'url': f'/production/{p["slug"]}', 'description': p['synopsis'], 'dateCreated': p['year'],
        'keywords': ', '.join(p['stack']), 'codeRepository': repo_url(p)})
    s = nav(s)
    s = s[:s.find('<main')] + project_main(p) + s[s.find('</main>') + len('</main>'):]
    out = SITE / 'production' / p['slug'] / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s, encoding='utf-8')


if __name__ == '__main__':
    slugs = [p['slug'] for p in PROJECTS]
    assert len(set(slugs)) == len(slugs), 'duplicate slug'
    build_home()
    for p in PROJECTS:
        build_project(p)
    print(f'home + {len(PROJECTS)} project pages written')
