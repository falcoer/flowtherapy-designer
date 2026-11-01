# Déploiement sur le VPS Hetzner

Cible : `https://designer.flowtherapymusic.com`, Node.js 22 derrière Caddy.

1. **DNS** : ajouter un enregistrement `A` `designer` → IP du VPS (et `AAAA` si IPv6).
2. **Node et Caddy** (Debian/Ubuntu) :
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
   sudo apt install -y caddy
   ```
   Si nginx tourne déjà sur le serveur, remplacer Caddy par un bloc `server` équivalent avec `proxy_pass http://127.0.0.1:4310;`.
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
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```
6. **Mise à jour** : `git pull && npm ci && npm run build && sudo systemctl restart ft-designer`.
