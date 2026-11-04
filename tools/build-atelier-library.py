#!/usr/bin/env python3
"""Prépare la bibliothèque pour l'atelier : versions web légères, vignettes et index.

Lit library/**/element.yaml (sources immuables) et écrit dans
apps/atelier/public/library/ (généré, non versionné) :
  - <id>.jpeg | <id>.webp | <id>.svg : image à 1600 px au plus ;
  - <id>-thumb.webp : vignette du tiroir ;
  - index.json : titres, étiquettes, rayon du tiroir et, pour les images à fond
    transparent, la découpe qui suit leur silhouette (coordonnées 0..1).
"""
import json
import re
import shutil
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / 'library'
OUT = ROOT / 'apps' / 'atelier' / 'public' / 'library'
MAX = 1600
THUMB = 360

# rayons du tiroir, par étiquette (la première qui correspond l'emporte)
SHELVES = [('photo', 'photos'), ('mascotte', 'illustrations'), ('paysage', 'illustrations'), ('decor', 'decors'), ('qr', 'logos'), ('presse', 'logos'), ('logo', 'logos')]


def shelf(tags):
    for t, s in SHELVES:
        if t in tags:
            return s
    return 'illustrations'


def silhouette(im: Image.Image, cells=140):
    """Contour de l'opacité (marching squares) : anneaux fermés en coordonnées 0..1."""
    a = im.getchannel('A')
    w, h = a.size
    k = cells / max(w, h)
    gw, gh = max(2, round(w * k)), max(2, round(h * k))
    small = a.resize((gw, gh), Image.BILINEAR)
    px = small.load()
    # bord transparent autour pour fermer les contours
    v = lambda x, y: 1 if 0 <= x < gw and 0 <= y < gh and px[x, y] > 60 else 0
    segs = {}
    for y in range(-1, gh):
        for x in range(-1, gw):
            c = (v(x, y) << 3) | (v(x + 1, y) << 2) | (v(x + 1, y + 1) << 1) | v(x, y + 1)
            if c in (0, 15):
                continue
            T, R, B, L = (x + 0.5, y), (x + 1, y + 0.5), (x + 0.5, y + 1), (x, y + 0.5)
            table = {1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(R, T)], 5: [(L, T), (R, B)], 6: [(B, T)], 7: [(L, T)],
                     8: [(T, L)], 9: [(T, B)], 10: [(T, R), (B, L)], 11: [(T, R)], 12: [(R, L)], 13: [(R, B)], 14: [(B, L)]}
            for p, q in table[c]:
                segs[p] = q
    rings = []
    while segs:
        start, nxt = segs.popitem()
        ring = [start]
        p = nxt
        while p != start and p in segs:
            ring.append(p)
            p = segs.pop(p)
        if len(ring) >= 6:
            # centres des pixels → coordonnées de la couche
            rings.append([[round((x + 0.5) / gw, 4), round((y + 0.5) / gh, 4)] for x, y in ring])
    # on écarte les miettes
    def area(r):
        return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
    rings = [r for r in rings if area(r) > 0.0015]
    return rings


def transparent(im: Image.Image) -> bool:
    if im.mode not in ('RGBA', 'LA', 'PA'):
        return False
    lo, _ = im.getchannel('A').getextrema()
    return lo < 250


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    items = []
    for f in sorted(LIB.glob('images/*/element.yaml')):
        el = yaml.safe_load(f.read_text())
        src = f.parent / el['source']
        id_ = el['id']
        tags = el.get('tags', [])
        item = {'id': id_, 'title': el.get('title', id_), 'tags': tags, 'shelf': shelf(tags)}
        for k in ('description', 'credit', 'date'):
            if el.get(k):
                item[k] = el[k]
        if src.suffix == '.svg':
            # sans déclaration DOCTYPE : inutile au navigateur et refusée par certains hébergeurs
            text = re.sub(r'<!DOCTYPE[^>]*>\s*', '', src.read_text())
            (OUT / f'{id_}.svg').write_text(text)
            item['src'] = item['thumb'] = f'library/{id_}.svg'
            item['w'], item['h'] = el.get('meta', {}).get('width', 100), el.get('meta', {}).get('height', 100)
            # décors à la craie : traits noirs, recolorés à l'insertion
            item['tint'] = 'masque' in tags
            item['vector'] = True
        else:
            im = Image.open(src)
            im.load()
            alpha = transparent(im.convert('RGBA') if im.mode == 'P' else im)
            im = im.convert('RGBA' if alpha else 'RGB')
            k = min(1, MAX / max(im.size))
            big = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS) if k < 1 else im
            if alpha:
                big.save(OUT / f'{id_}.webp', 'WEBP', quality=86, method=5)
                item['src'] = f'library/{id_}.webp'
                item['rings'] = silhouette(big)
            else:
                big.save(OUT / f'{id_}.jpeg', 'JPEG', quality=84, optimize=True, progressive=True)
                item['src'] = f'library/{id_}.jpeg'
            t = THUMB / max(im.size)
            im.resize((max(1, round(im.width * t)), max(1, round(im.height * t))), Image.LANCZOS).save(OUT / f'{id_}-thumb.webp', 'WEBP', quality=78)
            item['thumb'] = f'library/{id_}-thumb.webp'
            item['w'], item['h'] = big.size
        items.append(item)
    order = {'photos': 0, 'illustrations': 1, 'decors': 2, 'logos': 3}
    items.sort(key=lambda x: (order[x['shelf']], x.get('date', '') == '', x['title']))
    (OUT / 'index.json').write_text(json.dumps({'items': items}, ensure_ascii=False, separators=(',', ':')))
    size = sum(p.stat().st_size for p in OUT.iterdir())
    print(f'{len(items)} éléments, {size / 1e6:.1f} Mo dans {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
