# Déploiement VICE VERSA

Cible : un VPS européen (Hetzner Falkenstein ou Scaleway Paris, 2 vCPU / 4 Go / 40 Go), Docker Compose avec trois services : `app` (Next.js), `db` (PostgreSQL 16), `caddy` (TLS automatique, HTTP/2 et HTTP/3, médias statiques). Référence : `docs/conception/01-architecture.md`.

## 1. Préparer le serveur (une fois)

```bash
# Ubuntu 24.04, utilisateur avec sudo
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER   # se reconnecter ensuite
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
git clone https://github.com/Scott-SK2/vice-versa.git && cd vice-versa
cp .env.production.example .env.production
```

Remplir `.env.production` :

| Variable | Valeur |
|---|---|
| `DOMAIN` | le nom DNS (enregistrement A et AAAA vers le serveur, posé avant le premier démarrage pour le certificat) |
| `APP_BASE_URL` | `https://<DOMAIN>` : sert aux URL des QR codes et à l'écran de projection |
| `MEDIA_BASE_URL` | `/media` (fichiers dans `deploy/data/media`, servis par Caddy) ou l'URL du CDN |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | premier compte admin, créé au premier démarrage si la table est vide ; mot de passe temporaire à changer à la première connexion |
| `APP_IMAGE` | `ghcr.io/scott-sk2/vice-versa:latest` (publiée par la CI depuis `main`) ou une étiquette précise (`:<sha>`) |

Si le dépôt GitHub est privé, l'image GHCR l'est aussi : `docker login ghcr.io` avec un jeton personnel `read:packages`, ou construire sur place en remplaçant `image:` par `build:` dans `docker-compose.prod.yml`.

## 2. Déposer le contenu et les médias

```bash
mkdir -p deploy/data/media deploy/data/content deploy/data/backups
cp -r content/vv26 deploy/data/content/           # stations, questions, médias, jetons QR figés
cp content/vv26/map.svg deploy/data/media/
# Vidéos, posters, sous-titres : produits par pnpm media encode / pnpm media sync-captions (noms de media.json)
pnpm media check                                   # vérification locale avant envoi
rsync -av public/media/ user@serveur:~/vice-versa/deploy/data/media/
#   → deploy/data/media/VV-V10_appartement-membre.mp4, VV-V10.jpg, captions/VV-V10.fr.json, captions/VV-V10.fr.vtt, …
# Puis, depuis n'importe quel poste : MEDIA_BASE_URL=https://<DOMAIN>/media pnpm media check
```

Le dossier `deploy/data/content` est monté dans l'application : « Recharger le contenu » dans `/admin/content` relit ce dossier, sans reconstruire l'image. Au démarrage, l'application charge aussi le contenu si sa version diffère de celle en base (`SEED_CONTENT_ON_START`).

## 3. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f app
```

Au démarrage, `app` applique les migrations (`drizzle/`), crée le premier admin, charge le contenu, puis planifie la tâche de rétention quotidienne. Vérifier :

```bash
curl -s https://<DOMAIN>/api/health      # {"ok":true,"db":true,"live_run":null,"version":"<sha>"}
```

Puis se connecter sur `https://<DOMAIN>/admin/login`, changer le mot de passe temporaire, créer les comptes animateur et modérateur dans `/admin/users`, et une première séance de test dans `/admin`.

## 4. Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production pull app
docker compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Les migrations s'appliquent toutes seules. Pour revenir en arrière : `APP_IMAGE=ghcr.io/scott-sk2/vice-versa:<sha précédent>` puis `up -d app` (les migrations sont additives ; aucune n'est détruite par un retour d'image).

**Gel des déploiements** : à partir du vendredi 9 octobre 18 h, plus aucune mise à jour hors correctif bloquant validé par la CI.

## 5. Sauvegardes

```bash
./deploy/backup.sh nuit                 # → deploy/data/backups/vv_<date>_nuit.sql.gz (30 fichiers gardés)
./deploy/restore.sh deploy/data/backups/vv_20261010_1330_avant-live.sql.gz
```

Cron conseillé (`crontab -e`) : `15 3 * * * cd ~/vice-versa && ./deploy/backup.sh nuit >> deploy/data/backups/backup.log 2>&1`. Copier régulièrement `deploy/data/backups` hors du serveur (`rclone`, `scp`).

Juste avant de lancer la séance Live du 10 octobre : `./deploy/backup.sh avant-live`.

## 6. Exploitation le jour J

| Besoin | Commande ou écran |
|---|---|
| Santé | `curl -s https://<DOMAIN>/api/health` ; ping externe toutes les minutes (UptimeRobot ou équivalent) |
| Logs | `docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200 app` |
| Séance | `/admin` : Lancer, phases, Stopper ; `/animateur` et `/moderation` pour les postes dédiés |
| Projection | lien « Écran de la salle » dans l'onglet Projection, navigateur en plein écran (F11) |
| Médias indisponibles sur le CDN | passer `MEDIA_BASE_URL=/media` dans `.env.production`, `up -d app`, « Recharger le contenu » (les fichiers doivent être dans `deploy/data/media`) |
| Base corrompue | `./deploy/restore.sh <dernier dump>` puis créer et lancer une nouvelle séance |
| Redémarrage complet | `docker compose -f docker-compose.prod.yml --env-file .env.production restart` |
| Export des résultats | onglet Export de la séance (CSV, JSON) ; `./deploy/backup.sh soir-10-oct` |

## 7. Sécurité en place

- TLS et HSTS par Caddy ; HTTP redirigé vers HTTPS ; `Content-Security-Policy` à nonce par requête (scripts autorisés uniquement par nonce, `object-src 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` posés par l'application. La CSP autorise automatiquement l'origine de `MEDIA_BASE_URL` pour les médias.
- Conteneur `app` sans privilèges (utilisateur `app`), ports de la base non exposés, journaux limités en taille.
- Cookies `Secure` + `HttpOnly` + `SameSite=Lax` en production ; limite de débit par jeton participant et par IP (l'IP réelle vient de `X-Forwarded-For` posé par Caddy).
- Rétention automatique : séances clôturées archivées après `RETENTION_MONTHS` mois (résumé agrégé conservé), journal purgé après 24 mois.

## 8. Variante : médias sur un CDN

Déposer `dist/` sur une zone de stockage européenne (Bunny CDN Falkenstein, Cloudflare R2) avec `Cache-Control: public, max-age=31536000, immutable`, activer les requêtes de plage (vidéo), puis `MEDIA_BASE_URL=https://cdn.example.net/vv26` et « Recharger le contenu ». La CSP de l'application autorise automatiquement l'origine de `MEDIA_BASE_URL`.
