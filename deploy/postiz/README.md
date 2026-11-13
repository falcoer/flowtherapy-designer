# Postiz : planification des publications

Postiz tourne sur son propre VPS, séparé d'Odoo et du Designer, pour qu'une panne ou
une mise à jour de l'un ne touche pas les autres. Le Designer ne lui parle que par son
API publique (`https://postiz.flowtherapymusic.com/api/public/v1`).

| | |
| --- | --- |
| Serveur | Hetzner CX23 `ubuntu-4gb-hel1-1`, 2 vCPU, 4 Go, 40 Go, Helsinki |
| Adresse | 204.168.139.108 (IPv6 2a01:4f9:c013:9fd::/64) |
| Domaine | postiz.flowtherapymusic.com |
| Dossier | `/opt/postiz` (compose, Caddyfile, `.env` en 600) |
| Conteneurs | caddy, postiz, postiz-postgres, postiz-redis, temporal, temporal-postgresql |

Temporal tourne sans Elasticsearch (visibilité dans sa base Postgres) pour tenir dans
4 Go ; `install.sh` ajoute 2 Go de swap.

## Installation

1. **DNS** : dans Cloudflare, enregistrement `A postiz → 204.168.139.108` (et `AAAA`
   si voulu), en « DNS only » comme `designer`, pour que Caddy obtienne son certificat.
2. **Serveur** : copier ce dossier sur le VPS puis, en root :
   ```sh
   scp -r deploy/postiz root@204.168.139.108:/root/postiz-install
   ssh root@204.168.139.108 'bash /root/postiz-install/install.sh'
   ```
   Le premier démarrage prend 2 à 3 minutes (Temporal crée ses tables).
3. **Compte admin** : ouvrir https://postiz.flowtherapymusic.com, créer le compte,
   puis fermer les inscriptions :
   ```sh
   sed -i 's/^DISABLE_REGISTRATION=.*/DISABLE_REGISTRATION=true/' /opt/postiz/.env
   cd /opt/postiz && docker compose up -d
   ```
4. **Clé API** : dans Postiz, Réglages › API publique, copier la clé de l'organisation.
   Elle se range ensuite dans la fiche de l'activité du Designer (jamais dans le dépôt).

## Applications des réseaux

Chaque réseau demande une application développeur à nous, dont l'identifiant et le
secret vont dans `/opt/postiz/.env`, suivi de `docker compose up -d`.
Adresse de retour OAuth : `https://postiz.flowtherapymusic.com/integrations/social/<réseau>`.

- **Facebook et Instagram** : une app Meta (developers.facebook.com), produits
  « Facebook Login for Business » et « Instagram Graph API » → `FACEBOOK_APP_ID` /
  `FACEBOOK_APP_SECRET`. Instagram doit être un compte professionnel relié à la page.
  En mode développement, l'app publie sur les pages de ses propres administrateurs ;
  pour des clients extérieurs, il faudra la revue d'app Meta.
- **YouTube** : un projet Google Cloud avec l'API YouTube Data v3 et un client OAuth
  web → `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.

## Exploitation

- Mise à jour : changer `POSTIZ_VERSION` dans `.env`, puis
  `cd /opt/postiz && docker compose pull && docker compose up -d`.
  Revenir en arrière = remettre l'ancienne version.
- Journaux : `docker compose logs -f postiz`.
- Sauvegarde : activer les Backups Hetzner du serveur, et au besoin
  `docker compose exec postiz-postgres pg_dump -U postiz postiz > postiz.sql`.
- Interface Temporal (débogage) : `docker compose --profile debug up -d temporal-ui`,
  puis `ssh -L 8080:127.0.0.1:8080 root@204.168.139.108`.

Licence : Postiz est sous AGPL-3.0. On l'utilise sans modification ; toute
modification offerte à des clients devrait être publiée.
