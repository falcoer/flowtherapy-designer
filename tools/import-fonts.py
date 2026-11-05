#!/usr/bin/env python3
"""Ajoute à library/fonts/ une sélection de polices libres (OFL / Apache) pour la PAO du groupe.

Usage : python3 tools/import-fonts.py

Les fichiers viennent du dépôt google/fonts, copiés tels quels (sources immuables).
Les polices variables déclarent leur plage de graisse (weight … weightMax).
Relancer le script ne retélécharge pas un fichier déjà présent.
"""
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

LIB = Path(__file__).resolve().parent.parent / 'library' / 'fonts'
RAW = 'https://raw.githubusercontent.com/google/fonts/main/'

# id, famille, étiquettes, licence, fichiers : (chemin dans google/fonts, graisse, graisse max, style)
FONTS = [
    ('playfair', 'Playfair Display', ['titre', 'serif', 'elegant'], 'OFL-1.1', [('ofl/playfairdisplay/PlayfairDisplay[wght].ttf', 400, 900, 'normal'), ('ofl/playfairdisplay/PlayfairDisplay-Italic[wght].ttf', 400, 900, 'italic')]),
    ('fraunces', 'Fraunces', ['titre', 'serif', 'fantaisie'], 'OFL-1.1', [('ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf', 100, 900, 'normal'), ('ofl/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf', 100, 900, 'italic')]),
    ('oswald', 'Oswald', ['titre', 'condensee', 'affiche'], 'OFL-1.1', [('ofl/oswald/Oswald[wght].ttf', 200, 700, 'normal')]),
    ('rubik', 'Rubik', ['texte', 'sans-serif', 'arrondie'], 'OFL-1.1', [('ofl/rubik/Rubik[wght].ttf', 300, 900, 'normal'), ('ofl/rubik/Rubik-Italic[wght].ttf', 300, 900, 'italic')]),
    ('caveat', 'Caveat', ['manuscrite'], 'OFL-1.1', [('ofl/caveat/Caveat[wght].ttf', 400, 700, 'normal')]),
    ('anton', 'Anton', ['titre', 'condensee', 'affiche'], 'OFL-1.1', [('ofl/anton/Anton-Regular.ttf', 400, None, 'normal')]),
    ('bebas', 'Bebas Neue', ['titre', 'condensee', 'affiche'], 'OFL-1.1', [('ofl/bebasneue/BebasNeue-Regular.ttf', 400, None, 'normal')]),
    ('abril', 'Abril Fatface', ['titre', 'serif', 'affiche'], 'OFL-1.1', [('ofl/abrilfatface/AbrilFatface-Regular.ttf', 400, None, 'normal')]),
    ('pacifico', 'Pacifico', ['titre', 'script'], 'OFL-1.1', [('ofl/pacifico/Pacifico-Regular.ttf', 400, None, 'normal')]),
    ('lobster', 'Lobster', ['titre', 'script'], 'OFL-1.1', [('ofl/lobster/Lobster-Regular.ttf', 400, None, 'normal')]),
    ('shrikhand', 'Shrikhand', ['titre', 'script', 'affiche'], 'OFL-1.1', [('ofl/shrikhand/Shrikhand-Regular.ttf', 400, None, 'normal')]),
    ('marker', 'Permanent Marker', ['manuscrite', 'feutre'], 'Apache-2.0', [('apache/permanentmarker/PermanentMarker-Regular.ttf', 400, None, 'normal')]),
    ('bungee', 'Bungee', ['titre', 'enseigne'], 'OFL-1.1', [('ofl/bungee/Bungee-Regular.ttf', 400, None, 'normal')]),
    ('monoton', 'Monoton', ['titre', 'neon', 'enseigne'], 'OFL-1.1', [('ofl/monoton/Monoton-Regular.ttf', 400, None, 'normal')]),
]


def fetch(rel: str, dest: Path):
    if dest.exists():
        return
    url = RAW + urllib.parse.quote(rel)
    with urllib.request.urlopen(url) as r:
        dest.write_bytes(r.read())


def main():
    for id_, family, tags, lic, files in FONTS:
        d = LIB / id_
        d.mkdir(parents=True, exist_ok=True)
        out = []
        for rel, w, wmax, style in files:
            name = Path(rel).name.replace('[', '-').replace(']', '').replace(',', '-')
            fetch(rel, d / name)
            f = {'weight': w}
            if wmax:
                f['weightMax'] = wmax
            f.update({'style': style, 'path': name})
            out.append(f)
        lic_rel = str(Path(files[0][0]).parent / ('OFL.txt' if lic.startswith('OFL') else 'LICENSE.txt'))
        try:
            fetch(lic_rel, d / Path(lic_rel).name)
        except Exception:
            pass
        el = {'id': id_, 'type': 'font', 'title': family, 'family': family, 'files': out, 'tags': ['police', *tags],
              'origin': {'url': 'https://github.com/google/fonts/tree/main/' + str(Path(files[0][0]).parent), 'license': lic}}
        (d / 'element.yaml').write_text(yaml.safe_dump(el, allow_unicode=True, sort_keys=False, width=200))
    print(f'{len(FONTS)} polices dans {LIB}')


if __name__ == '__main__':
    main()
