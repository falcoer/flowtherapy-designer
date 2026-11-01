# Déploiement sur le VPS Hetzner

Cible : `https://designer.flowtherapymusic.com`, Node.js 22 derrière le reverse proxy déjà en place.

Le VPS héberge déjà Odoo (ports 8069/8072 en général) : FT Designer écoute seulement sur `127.0.0.1:4310` et passe par le même nginx qu'Odoo, dans un bloc `server` à part. N'installe pas Caddy sur ce serveur : il voudrait les ports 80/443 déjà pris par nginx.

Pour vérifier ce qui tourne avant de commencer :
```bash
sudo ss -tlnp | grep -E ':(80|443|4310)\b'   # qui écoute sur 80/443, et 4310 doit être libre
docker ps 2>/dev/null                          # si Odoo tourne dans Docker, le proxy peut être un conteneur
node -v                                        # Node 22 requis
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
   cd /opt/ft-designer && sudo npm ci && sudo npm run build
   sudo mkdir -p /srv/ft-designer && sudo cp -r library /srv/ft-designer/
   sudo chown -R ftdesigner /srv/ft-designer
   ```
   La bibliothèque vit hors du dépôt (`/srv/ft-designer/library`) pour que les mises à jour du code n'y touchent pas. On peut la versionner avec git à part.
4. **Mot de passe** : `echo 'FTD_PASSWORD=…' | sudo tee /etc/ft-designer.env && sudo chmod 600 /etc/ft-designer.env` (utilisateur `ft`).
5. **Service** :
   ```bash
   sudo cp deploy/ft-designer.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now ft-designer
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/ft-designer
   sudo ln -s /etc/nginx/sites-available/ft-designer /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d designer.flowtherapymusic.com
   ```
   `nginx -t` vérifie la configuration avant de recharger : Odoo n'est pas interrompu si une erreur s'y glisse.

`deploy/Caddyfile` reste fourni pour un serveur sans reverse proxy existant.
6. **Mise à jour** : `git pull && npm ci && npm run build && sudo systemctl restart ft-designer`.
