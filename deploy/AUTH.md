# Connexion avec Google et Apple

Les membres du groupe se connectent avec leur compte Google ou Apple. Seules les adresses listées dans `FTD_ALLOWED_EMAILS` peuvent entrer. Chaque enregistrement de projet note qui l'a fait (`meta.updatedBy` dans le YAML).

Adresse de retour à déclarer chez chaque fournisseur :

| Fournisseur | URL de retour |
| --- | --- |
| Google | `https://designer.flowtherapymusic.com/auth/callback/google` |
| Apple | `https://designer.flowtherapymusic.com/auth/callback/apple` |

## Google (gratuit, environ 10 minutes)

1. Sur [console.cloud.google.com](https://console.cloud.google.com), crée un projet « FT Designer ».
2. **APIs et services → Écran de consentement OAuth** : type « Externe », nom « FT Designer », ton adresse en contact. Les champs d'application `email`, `profile` et `openid` suffisent. Publie l'application, ou ajoute les membres comme utilisateurs de test.
3. **Identifiants → Créer des identifiants → ID client OAuth** : type « Application Web », puis ajoute l'URL de retour Google ci-dessus dans « URI de redirection autorisés ».
4. Note l'ID client et le code secret.

## Apple (nécessite l'Apple Developer Program, 99 $ par an)

1. Sur [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles → Identifiers** : crée un **App ID** et coche « Sign in with Apple ».
2. Crée ensuite un **Services ID** (ex. `com.flowtherapymusic.designer`). C'est l'identifiant client. Coche « Sign in with Apple » → Configure : domaine `designer.flowtherapymusic.com` et URL de retour Apple ci-dessus.
3. **Keys** : crée une clé avec « Sign in with Apple », rattachée à l'App ID. Télécharge le fichier `.p8` (Apple ne le donne qu'une fois) et note le **Key ID**.
4. Ton **Team ID** est affiché en haut à droite du compte développeur.

Point d'attention : à la première connexion, Apple propose « Masquer mon adresse e-mail ». Les membres doivent choisir **Partager mon adresse**, sinon Apple transmet une adresse relais (`…@privaterelay.appleid.com`) qu'il faudrait ajouter à la liste.

## Configuration sur le VPS

```bash
sudo install -m 600 -o ftdesigner AuthKey_XXXXXXXXXX.p8 /etc/ft-designer-apple.p8
sudo nano /etc/ft-designer.env && sudo chmod 600 /etc/ft-designer.env
```

```ini
FTD_PUBLIC_URL=https://designer.flowtherapymusic.com
FTD_ALLOWED_EMAILS=lauris@exemple.fr,membre2@exemple.fr
# openssl rand -hex 32
FTD_SESSION_SECRET=...

FTD_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
FTD_GOOGLE_CLIENT_SECRET=...

FTD_APPLE_CLIENT_ID=com.flowtherapymusic.designer
FTD_APPLE_TEAM_ID=...
FTD_APPLE_KEY_ID=...
FTD_APPLE_PRIVATE_KEY_FILE=/etc/ft-designer-apple.p8
```

Puis `sudo systemctl restart ft-designer`. Un fournisseur sans variables n'apparaît pas : on peut démarrer avec Google seul et ajouter Apple plus tard. Pour ajouter un membre, complète `FTD_ALLOWED_EMAILS` et redémarre le service.
