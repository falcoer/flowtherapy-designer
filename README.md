# FT Designer

Outil de composition de publications (affiches, flyers, posts, stories, mailings) pour Flow Therapy. Chaque projet est entièrement décrit en YAML : il référence des éléments de bibliothèque, les accroche à des points d'ancrage proportionnels et n'enregistre que des écarts (deltas). La même composition se décline ainsi sur plusieurs formats sans être refaite.

Proposition d'architecture complète : voir le document partagé dans le projet (« FT Designer — Proposition d'architecture et MVP »).

## État : phase 0 (socle)

- `packages/core` : schémas YAML (zod), référentiels d'ancrage (répartition, nombre d'or, armature harmonique, grille), deltas, couleurs OKLCH et harmonies, balises `{{…}}`, calcul de mise en page. Partagé entre navigateur et serveur.
- `apps/server` : API Fastify qui lit et écrit la bibliothèque (`library/`) et les projets YAML, connexion avec Google ou Apple réservée aux membres listés (voir [`deploy/AUTH.md`](deploy/AUTH.md)).
- `apps/web` : surface de travail tactile (React + SVG) : changement de format, repères, glisser-déposer depuis la bibliothèque vers un ancrage, pastilles d'attributs et curseur de delta centré, palette et suggestions d'harmonies, aperçu du YAML.
- `library/` : bibliothèque d'exemple (logo et photo issus du site bio, palette, textes, formats, un projet).

## Démarrer

```bash
npm install
npm run dev        # serveur sur :4310 + interface sur http://localhost:5173
npm test           # tests du cœur et de l'API
npm run build && npm start   # mode production sur http://localhost:4310
```

## Ancrages

| Référentiel | Exemple | Sens |
| --- | --- | --- |
| Répartition | `h1/2 v2/3` | milieu de la largeur, deux tiers de la hauteur (fractions libres) |
| Nombre d'or | `h-or-a × v-or-b` | croisement des sections dorées 0,382 et 0,618 |
| Armature harmonique | `d1 × r1` | croisement d'une diagonale et d'une réciproque ; suit le rapport largeur/hauteur |
| Grille | `c2 r3`, `c2 r3 nw` | centre ou coin de la cellule colonne 2, rangée 3 |

Chaque référentiel est un jeu de lignes caractéristiques ; ses ancrages sont leurs intersections, nommées par les lignes qui les forment. En ajouter un (spirale dorée, tracés à racine de 2…) revient à déclarer de nouvelles lignes dans `packages/core/src/anchors.ts`.

Sur un format autre que le premier du projet, les déplacements et deltas s'enregistrent comme `overrides` propres à ce format.

## Déploiement

Voir [`deploy/README.md`](deploy/README.md) (VPS Hetzner partagé avec Odoo, nginx, `designer.flowtherapymusic.com`).

## Limites connues de la phase 0

- Pas encore d'upload ni de cache de rendus (`sharp`), ni d'index SQLite : la recherche lit les YAML directement.
- L'enregistrement réécrit le YAML et perd les commentaires.
- Un SVG affiché comme image ne charge pas les polices web : le logo s'affiche avec une police de repli.
- Pas encore d'export PNG/PDF, de générateurs ni d'effets.
