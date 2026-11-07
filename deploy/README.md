# Déploiement sur le VPS Hetzner

Cible : `https://designer.flowtherapymusic.com`, Node.js 22 derrière le reverse proxy déjà en place.

Le VPS héberge déjà Odoo dans Docker (`/opt/flowtherapy-odoo`), derrière un **Caddy lui aussi dans Docker** qui tient les ports 80/443. Il n'y a pas de nginx. FT Designer tourne hors Docker (systemd) et écoute sur `172.18.0.1:4310`, la passerelle du réseau Docker `flowtherapy-odoo_default`, pour que le conteneur Caddy puisse le joindre. Odoo est servi sur `gestion.flowtherapymusic.com`.

Pour vérifier ce qui tourne avant de commencer :
```bash
sudo ss -tlnp | grep -E ':(80|443|4310)\b'   # 80/443 pris par docker-proxy (Caddy), 4310 libre
docker ps                                      # flowtherapy-odoo-caddy-1, Odoo, Postgres
node -v                                        # Node 22.13 ou plus récent requis (SQLite intégré)
```

1. **DNS** : ajouter un enregistrement `A` `designer` → IP du VPS (et `AAAA` si IPv6).
2. **Node 22** (Debian/Ubuntu), si `node -v` ne donne pas déjà v22 :
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
   ```
   Attention si un autre outil du serveur dépend d'une version précise de Node : vérifier avant de mettre à jour.
3. **Code** :
   ```bash
   sudo useradd --system --home /opt/ft-designer ftdesigner
   sudo git clone https://github.com/falcoer/flowtherapy-designer /opt/ft-designer
   sudo apt install -y python3-pil   # vignettes de la bibliothèque de l'atelier, au build
   cd /opt/ft-designer && sudo npm ci && sudo npm run build
   sudo PLAYWRIGHT_BROWSERS_PATH=/opt/ft-designer/.browsers npx playwright-core install --with-deps chromium   # exports PNG/PDF
   sudo mkdir -p /srv/ft-designer/cache /srv/ft-designer/ateliers && sudo cp -r library /srv/ft-designer/
   sudo chown -R ftdesigner /srv/ft-designer
   ```
   La bibliothèque vit hors du dépôt (`/srv/ft-designer/library`) pour que les mises à jour du code n'y touchent pas. On peut la versionner avec git à part. Le cache (`/srv/ft-designer/cache`) n'a pas besoin de sauvegarde. Les compositions de l'atelier (`/srv/ft-designer/ateliers`, un fichier JSON et une vignette par composition) sont à sauvegarder avec la bibliothèque.

   Chromium va dans `/opt/ft-designer/.browsers`, le chemin que le service systemd déclare. On peut aussi pointer vers un Chromium existant avec `FTD_CHROMIUM_PATH`.
4. **Connexion** : configure Google et/ou Apple en suivant [AUTH.md](AUTH.md). En dépannage seulement, un mot de passe unique reste possible avec `FTD_PASSWORD` (utilisateur `ft`), utilisé quand aucun fournisseur n'est configuré.
5. **Service** : dans `/etc/ft-designer.env` (droits 600), mettre `HOST=172.18.0.1`, `FTD_SESSION_SECRET`, `FTD_PUBLIC_URL=https://designer.flowtherapymusic.com` et la connexion (étape 4).
   ```bash
   sudo cp deploy/ft-designer.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now ft-designer
   ```
6. **Caddy** : ajouter ce bloc à `/opt/flowtherapy-odoo/caddy/Caddyfile` (garder une copie avant), puis recharger sans couper Odoo :
   ```
   designer.flowtherapymusic.com {
   	encode zstd gzip
   	reverse_proxy 172.18.0.1:4310
   	request_body {
   		max_size 200MB
   	}
   }
   ```
   ```bash
   docker exec flowtherapy-odoo-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   Le certificat HTTPS est obtenu automatiquement. Dans Cloudflare, l'enregistrement `designer` reste en « DNS only ».

L'atelier est servi à la racine (`https://designer.flowtherapymusic.com/`) ; l'ancien éditeur YAML reste sous `/editeur/`.

`deploy/Caddyfile` sert pour un serveur sans reverse proxy existant ; `deploy/nginx.conf` pour un serveur qui a déjà nginx.

7. **Mise à jour** :
   ```bash
   cd /opt/ft-designer && sudo git pull && sudo npm ci && sudo npm run build && sudo systemctl restart ft-designer
   ```

Taille des imports : Caddy limite à 200 Mo par requête (`request_body max_size`), comme le serveur.
