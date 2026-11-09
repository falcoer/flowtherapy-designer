# Icônes des applications Flow Therapy

Une série commune pour Gestion, Designer, Manager et Composer : carré arrondi bleu nuit, halo de la couleur d'accent de l'app, pictogramme crème et la vague du logo Flow Therapy en signature.

| App | Accent | Pictogramme |
| --- | --- | --- |
| Gestion | orange `#FF8A00` | planchette cochée |
| Designer | rose `#FF3B9D` | plume |
| Manager | bleu `#19A7EF` | agenda étoilé |
| Composer | violet `#9A48F0` | double croche |

`node branding/app-icons/generate.mjs` régénère `dist/<app>/` : SVG (complet, favicon sans vague, maskable), favicons 16/32/48, apple-touch-icon 180, icônes PWA 192/512/1024 et maskable 192/512. Le rendu PNG passe par Playwright (Chromium) : `playwright` s'il est installé, sinon `playwright-core` du dépôt avec un Chromium installé (`npx playwright-core install chromium`) ou désigné par `CHROMIUM_PATH`.
