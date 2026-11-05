#!/usr/bin/env python3
"""Importe les sources du site bio (assets-src/) dans library/, classées et étiquetées.

Usage : python3 tools/import-bio-assets.py ../flowtherapy-bio-website

Les fichiers sont copiés tels quels (sources immuables) ; chaque élément reçoit un
element.yaml avec titre, description, crédit, étiquettes et provenance. Relancer le
script met à jour les métadonnées sans dupliquer les fichiers.
"""
import gzip
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

import yaml
from PIL import Image

BIO = Path(sys.argv[1] if len(sys.argv) > 1 else '../flowtherapy-bio-website').resolve()
SRC = BIO / 'assets-src'
LIB = Path(__file__).resolve().parent.parent / 'library'
REPO = 'https://github.com/falcoer/flowtherapy-bio-website/blob/main/assets-src/'

MEMBERS = ['betty', 'jenni', 'lauris']


def slug(s: str) -> str:
    s = s.lower()
    for a, b in [('é', 'e'), ('è', 'e'), ('ê', 'e'), ('à', 'a'), ('ç', 'c'), ('ô', 'o'), ('î', 'i'), ('œ', 'oe'), ('_', '-')]:
        s = s.replace(a, b)
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9-]', '-', s)).strip('-')


def dims(p: Path):
    if p.suffix.lower() == '.svg':
        m = re.search(r'viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)', p.read_text(errors='ignore'))
        return (round(float(m.group(1))), round(float(m.group(2)))) if m else None
    with Image.open(p) as im:
        return im.size


def image(id_: str, src: Path, title: str, tags: list, rel: str, **extra):
    d = LIB / 'images' / id_
    d.mkdir(parents=True, exist_ok=True)
    name = 'source' + src.suffix.lower().replace('.jpg', '.jpeg')
    if extra.get('crop'):
        # seule exception aux sources copiées telles quelles : la photo extraite d'une capture
        with Image.open(src) as im:
            im.crop(extra['crop']).convert('RGB').save(d / name, 'JPEG', quality=95)
    else:
        shutil.copyfile(src, d / name)
    el = {'id': id_, 'type': 'image', 'title': title}
    for k in ('description', 'credit', 'date'):
        if extra.get(k):
            el[k] = extra[k]
    el['source'] = name
    wh = dims(d / name)
    if wh:
        el['meta'] = {'width': wh[0], 'height': wh[1]}
    if extra.get('focus'):
        el['focus'] = extra['focus']
    el['tags'] = sorted(set(tags), key=tags.index)
    el['origin'] = {'url': REPO + rel, **({'crop': list(extra['crop'])} if extra.get('crop') else {})}
    (d / 'element.yaml').write_text(yaml.safe_dump(el, allow_unicode=True, sort_keys=False, width=200))
    return id_


def main():
    manifest = json.loads((SRC / 'manifest.json').read_text())
    site = json.loads((BIO / 'config' / 'site.json').read_text())
    media_meta = {m['asset']: m for m in site.get('media', {}).get('items', [])}
    done = []

    # photos du groupe : titres, descriptions et crédits repris de la galerie du site
    for m in manifest['medias']:
        rel = m['path']
        src = SRC / rel
        name = m.get('name') or slug(Path(rel).stem)
        meta = media_meta.get(name, {})
        text = ' '.join([name, meta.get('title', ''), meta.get('description', '')]).lower()
        kind = meta.get('type', '').lower()
        tags = ['photo']
        tags += ['concert'] if 'concert' in kind or 'concert' in text or 'scène' in text else []
        tags += ['portrait'] if 'portrait' in kind else []
        tags += ['groupe'] if 'groupe' in text or 'trio' in text else []
        tags += [x for x in MEMBERS if x in text]
        tags += ['noir-et-blanc'] if 'noir' in text else []
        tags += ['plein-air'] if 'plein air' in text or 'exterieur' in name or 'extérieur' in text else []
        tags += ['repetition'] if 'répétition' in text else []
        title = meta.get('title') or name.replace('-', ' ').capitalize()
        if m.get('mode') == 'excluded-source':
            # capture d'écran de galerie : on n'en garde que la photo du trio, recadrée
            done.append(image('trio-fevrier-2026', src, 'Le trio, février 2026', ['photo', 'groupe', 'portrait', 'lauris', 'jenni', 'betty'], rel,
                              description='Lauris, Jenni et Betty devant la banderole aux alpagas. Recadrée depuis une capture de galerie (774 × 513 px) : à remplacer par l’original si possible.',
                              date='2026-02-05', focus={'x': 0.5, 'y': 0.4}, crop=(74, 767, 848, 1280)))
            continue
        done.append(image(name, src, title, tags, rel, description=meta.get('description') or m.get('reason'), credit=meta.get('credit'), date=meta.get('date'), focus={'x': 0.5, 'y': 0.45}))

    # logos du groupe
    done.append(image('logo-ft', SRC / 'images/logo.svg', 'Logo Flow Therapy', ['logo', 'flow-therapy', 'typographie'], 'images/logo.svg'))
    done.append(image('logo-ft-transparent', SRC / 'images/logo_transparent.png', 'Logo Flow Therapy (fond transparent)', ['logo', 'flow-therapy', 'transparent'], 'images/logo_transparent.png'))
    done.append(image('logo-ft-jpeg', SRC / 'images/logo.jpg', 'Logo Flow Therapy (sur fond)', ['logo', 'flow-therapy'], 'images/logo.jpg'))

    # mascottes : alpagas costumés et sans costume
    for n in (1, 2, 3):
        done.append(image(f'alpaga-{n}', SRC / f'images/alpaga{n}.png', f'Alpaga n°{n}, costumé', ['mascotte', 'alpaga', 'transparent'], f'images/alpaga{n}.png'))
        done.append(image(f'alpaga-{n}-nu', SRC / f'images/alpaga{n}-nu.png', f'Alpaga n°{n}, sans costume', ['mascotte', 'alpaga', 'transparent'], f'images/alpaga{n}-nu.png'))

    # paysages à l'aquarelle (fonds de voyage du site)
    for file, id_, title in [
        ('fond-urbain-transparent.png', 'paysage-urbain', 'Paysage urbain'),
        ('eclat_himalayen_au_coucher_du_soleil.png', 'paysage-himalaya', 'Éclat himalayen au coucher du soleil'),
        ('panorama_aquarelle_d_une_métropole_lumineuse.png', 'paysage-metropole', 'Métropole lumineuse'),
        ('panorama_tropicale_en_aquarelle_vibrante.png', 'paysage-tropical', 'Panorama tropical'),
        ('plage_tropicale_aquarelle_au_coucher_du_soleil.png', 'paysage-plage', 'Plage tropicale au coucher du soleil'),
    ]:
        # noms accentués : la forme Unicode du disque peut différer
        found = next(x for x in (SRC / 'images').iterdir() if unicodedata.normalize('NFC', x.name) == unicodedata.normalize('NFC', file))
        done.append(image(id_, found, title, ['paysage', 'aquarelle', 'fond'], 'images/' + file))

    # QR code du site (les décors à la craie sont devenus les tampons de l'atelier : apps/atelier/src/stamps.ts)
    done.append(image('qr-flowtherapymusic', SRC / 'decorations/flowtherapymusic-qr.svg', 'QR code flowtherapymusic.com', ['qr', 'lien', 'flow-therapy'], 'decorations/flowtherapymusic-qr.svg'))
    done.append(image('qr-flowtherapymusic-png', SRC / 'decorations/flowtherapymusic-qr.png', 'QR code flowtherapymusic.com (image)', ['qr', 'lien', 'flow-therapy'], 'decorations/flowtherapymusic-qr.png'))

    # presse : logos des titres qui ont parlé du groupe
    for k, title in [('laprovence', 'La Provence'), ('maritima', 'Maritima'), ('musical', 'Musical'), ('reflets', 'Reflets')]:
        done.append(image(f'presse-{k}', SRC / f'references/{k}.png', f'Presse : {title}', ['presse', 'logo'], f'references/{k}.png'))
    done.append(image('presse-reflets-svg', SRC / 'references/reflets.svg', 'Presse : Reflets (vectoriel)', ['presse', 'logo'], 'references/reflets.svg'))

    # polices du site (OFL)
    fonts = [
        ('bangers', 'Bangers', [(400, 'bangers/Bangers-Regular.ttf')], ['titre', 'bd']),
        ('kalam', 'Kalam', [(400, 'kalam/Kalam-Regular.ttf'), (700, 'kalam/Kalam-Bold.ttf')], ['manuscrite', 'craie']),
        ('inter', 'Inter', [(400, 'inter/Inter-Variable.ttf.gz')], ['texte', 'sans-serif']),
    ]
    for id_, family, files, tags in fonts:
        d = LIB / 'fonts' / id_
        if (d / 'element.yaml').exists():
            # déjà dans la bibliothèque (et peut-être enrichie : italique, plage de graisse) : on n'y touche pas
            done.append(id_)
            continue
        d.mkdir(parents=True, exist_ok=True)
        out = []
        for w, rel in files:
            src = SRC / 'fonts' / rel
            name = Path(rel).name
            if name.endswith('.gz'):
                name = name[:-3]
                (d / name).write_bytes(gzip.decompress(src.read_bytes()))
            else:
                shutil.copyfile(src, d / name)
            out.append({'weight': w, 'style': 'normal', 'path': name})
        shutil.copyfile(SRC / 'fonts' / Path(files[0][1]).parent / 'OFL.txt', d / 'OFL.txt')
        el = {'id': id_, 'type': 'font', 'title': family, 'family': family, 'files': out, 'tags': ['police', *tags], 'origin': {'url': REPO + 'fonts/' + Path(files[0][1]).parent.name, 'license': 'OFL-1.1'}}
        (d / 'element.yaml').write_text(yaml.safe_dump(el, allow_unicode=True, sort_keys=False, width=200))
        done.append(id_)

    print(f'{len(done)} éléments importés dans {LIB}')


if __name__ == '__main__':
    main()
