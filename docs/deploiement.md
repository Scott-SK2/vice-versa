# Déploiement VICE VERSA

Trois façons d'héberger, de la plus simple à la plus maîtrisée :

| Option | Pour qui | Ce qui tourne où |
|---|---|---|
| **A. Render (tout-en-un)** | Mise en ligne en quelques clics, sans serveur à administrer | Application en conteneur Docker + PostgreSQL managé, dans la même région (Francfort) |
| **B. Vercel + Render** | Préférence pour Vercel côté application | Application sur Vercel (fonctions sans état, région `fra1`), PostgreSQL managé sur Render |
| **C. VPS Docker Compose** | Contrôle total pendant l'astreinte | `app`, `db`, `caddy` sur une machine européenne |

Dans les trois cas, les **médias** (vidéos, posters, sous-titres, plan) sont versionnés dans `public/media/` et servis par l'hébergeur avec son CDN ; `MEDIA_BASE_URL=/media`. Un fichier vidéo encodé pèse environ 7 Mo pour 45 s : 24 clips restent sous 200 Mo, acceptable dans le dépôt (limite GitHub : 100 Mo par fichier). Un bucket externe (Bunny, Cloudflare R2) reste possible en changeant `MEDIA_BASE_URL`.

**Recommandation** : l'option A. L'architecture (limites de débit en mémoire, migrations et contenu au démarrage, tâche de rétention intégrée) est conçue pour une instance unique, et Render la respecte telle quelle. L'option B fonctionne aussi : le projet détecte Vercel et bascule les compteurs sensibles en base, applique migrations et contenu au build, et confie la rétention à Vercel Cron.

## A. Render : application + base de données

1. Pousser le dépôt sur GitHub (`main` à jour), puis sur Render : **New → Blueprint**, choisir le dépôt. Le fichier `render.yaml` crée le service web (Docker, Francfort, plan Starter) et la base PostgreSQL 16 (plan Basic 256 Mo ; le plan gratuit est supprimé après 30 jours, à éviter pour l'événement).
2. Render demande les variables marquées `sync: false` : `APP_BASE_URL` (`https://<service>.onrender.com`, ou le domaine personnalisé une fois ajouté dans Settings → Custom Domains, avec son enregistrement DNS), `ADMIN_BOOTSTRAP_EMAIL` et `ADMIN_BOOTSTRAP_PASSWORD` (mot de passe temporaire, à changer à la première connexion). `SESSION_SECRET` et `CRON_SECRET` sont générés par Render.
3. Au démarrage, le conteneur applique les migrations, crée le premier admin, charge `content/vv26/`, puis lance la rétention quotidienne. Vérifier `https://<service>.onrender.com/api/health`, puis `/admin/login`.
4. Mise à jour : chaque push sur `main` redéploie (`autoDeploy`). Retour arrière : Render → Deploys → Rollback.
5. Sauvegardes : Render → base → Backups (quotidiennes sur les plans payants) ; en plus, avant la séance Live : `pg_dump "$(render psql url)" | gzip > avant-live.sql.gz` depuis un poste, ou l'onglet Recovery.
6. Test de charge depuis n'importe quel poste : `pnpm load --vus 80 --duration 1800 --base https://<service>.onrender.com`.

Le plan Starter n'a pas de « mise en veille » : l'application reste réactive. Le disque du conteneur est éphémère, ce qui ne pose pas de problème car les médias sont dans l'image et les données dans PostgreSQL.

## B. Vercel (application) + Render (base de données)

1. **Base** : sur Render, New → PostgreSQL (Francfort, PostgreSQL 16, plan Basic 256 Mo). Copier l'**External Database URL** (avec `?sslmode=require` si absent).
2. **Vercel** : New Project → importer le dépôt. Framework Next.js détecté ; le script `vercel-build` applique les migrations et charge le contenu avant `next build` (`scripts/predeploy.ts`). Région des fonctions : `fra1` (`vercel.json`).
3. Variables d'environnement (Settings → Environment Variables, environnement **Production** seulement, pour qu'un aperçu ne touche pas la base) :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | URL externe Render |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `CRON_SECRET` | `openssl rand -hex 32` (Vercel l'envoie aux crons) |
   | `APP_BASE_URL` | `https://<projet>.vercel.app` ou le domaine personnalisé |
   | `MEDIA_BASE_URL` | `/media` |
   | `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | premier compte admin, créé à la première connexion |
   | `EVENT_SLUG` | `vv26` |

4. Déployer. Vérifier `/api/health` puis `/admin/login`. Le cron `15 3 * * *` de `vercel.json` appelle `/api/cron/maintenance` (rétention et purge des compteurs).
5. Ce que Vercel change, pris en charge par le code : compteurs sensibles (connexion, clé de projection, codes devinés, jetons inconnus) stockés en base (`RATE_LIMIT_STORE=db` automatique) ; compteurs à fort volume par instance (limite effective plus large, jamais plus stricte) ; pool PostgreSQL réduit à 3 connexions par instance ; « Recharger le contenu » indisponible dans la console (le contenu se charge à chaque déploiement : modifier `content/`, pousser).
6. Test de charge : `pnpm load --vus 80 --duration 1800 --base https://<projet>.vercel.app`.

## C. VPS Docker Compose

Cible : un VPS européen (Hetzner Falkenstein ou Scaleway Paris, 2 vCPU / 4 Go / 40 Go), Docker Compose avec trois services : `app` (Next.js), `db` (PostgreSQL 16), `caddy` (TLS automatique, HTTP/2 et HTTP/3, médias statiques). Référence : `docs/conception/01-architecture.md`.

### C.1 Préparer le serveur (une fois)

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

### C.2 Déposer le contenu et les médias

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

### C.3 Démarrer

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

### C.4 Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production pull app
docker compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

Les migrations s'appliquent toutes seules. Pour revenir en arrière : `APP_IMAGE=ghcr.io/scott-sk2/vice-versa:<sha précédent>` puis `up -d app` (les migrations sont additives ; aucune n'est détruite par un retour d'image).

**Gel des déploiements** : à partir du vendredi 9 octobre 18 h, plus aucune mise à jour hors correctif bloquant validé par la CI.

### C.5 Sauvegardes

```bash
./deploy/backup.sh nuit                 # → deploy/data/backups/vv_<date>_nuit.sql.gz (30 fichiers gardés)
./deploy/restore.sh deploy/data/backups/vv_20261010_1330_avant-live.sql.gz
```

Cron conseillé (`crontab -e`) : `15 3 * * * cd ~/vice-versa && ./deploy/backup.sh nuit >> deploy/data/backups/backup.log 2>&1`. Copier régulièrement `deploy/data/backups` hors du serveur (`rclone`, `scp`).

Juste avant de lancer la séance Live du 10 octobre : `./deploy/backup.sh avant-live`.

## Exploitation le jour J (toutes options)

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

## Sécurité en place (toutes options)

- TLS et HSTS par Caddy ; HTTP redirigé vers HTTPS ; `Content-Security-Policy` à nonce par requête (scripts autorisés uniquement par nonce, `object-src 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` posés par l'application. La CSP autorise automatiquement l'origine de `MEDIA_BASE_URL` pour les médias.
- Conteneur `app` sans privilèges (utilisateur `app`), ports de la base non exposés, journaux limités en taille.
- Cookies `Secure` + `HttpOnly` + `SameSite=Lax` en production ; limite de débit par jeton participant et par IP (l'IP réelle vient de `X-Forwarded-For` posé par Caddy).
- Rétention automatique : séances clôturées archivées après `RETENTION_MONTHS` mois (résumé agrégé conservé), journal purgé après 24 mois.

## Variante : médias sur un CDN

Déposer `dist/` sur une zone de stockage européenne (Bunny CDN Falkenstein, Cloudflare R2) avec `Cache-Control: public, max-age=31536000, immutable`, activer les requêtes de plage (vidéo), puis `MEDIA_BASE_URL=https://cdn.example.net/vv26` et « Recharger le contenu ». La CSP de l'application autorise automatiquement l'origine de `MEDIA_BASE_URL`.
