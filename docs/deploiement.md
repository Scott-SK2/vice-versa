# Déploiement VICE VERSA

Trois façons d'héberger, de la plus simple à la plus maîtrisée :

| Option | Pour qui | Ce qui tourne où |
|---|---|---|
| **A. Render (tout-en-un)** | Mise en ligne en quelques clics, sans serveur à administrer | Application en conteneur Docker + PostgreSQL managé, dans la même région (Francfort) |
| **B. Vercel + Render** | Préférence pour Vercel côté application | Application sur Vercel (fonctions sans état, région `fra1`), PostgreSQL managé sur Render |
| **C. VPS Docker Compose** | Contrôle total pendant l'astreinte | `app`, `db`, `caddy` sur une machine européenne |

Dans les trois cas, les **médias** (vidéos, posters, sous-titres, plan) sont versionnés dans `public/media/` et servis par l'hébergeur avec son CDN ; `MEDIA_BASE_URL=/media`. Un fichier vidéo encodé pèse environ 7 Mo pour 45 s : 24 clips restent sous 200 Mo, acceptable dans le dépôt (limite GitHub : 100 Mo par fichier). Un bucket externe (Bunny, Cloudflare R2) reste possible en changeant `MEDIA_BASE_URL`.

**Recommandation** : l'option A. L'architecture (limites de débit en mémoire, migrations et contenu au démarrage, tâche de rétention intégrée) est conçue pour une instance unique, et Render la respecte telle quelle. L'option B fonctionne aussi : le projet détecte Vercel et bascule les compteurs sensibles en base, applique migrations et contenu au build, et confie la rétention à Vercel Cron.

## A. Render : base de données à la main, application par le blueprint

La base est créée **à la main** et n'apparaît pas dans `render.yaml` : aucun redéploiement ne peut la recréer, la modifier ou la supprimer. Le blueprint ne gère que le service web.

### A.1 Créer la base PostgreSQL (une fois)

1. Render → **New → PostgreSQL**.
2. Name : `vice-versa-db` · Database : `viceversa` · User : `viceversa` · Region : **Frankfurt (EU Central)** · PostgreSQL Version : **16** · Plan : **Basic-256mb** (premier plan payant ; le plan gratuit est supprimé après 30 jours).
3. Create Database. Attendre « Available ».
4. Dans la page de la base, section **Connections**, copier l'**Internal Database URL** (`postgresql://viceversa:…@dpg-…-a/viceversa`). C'est elle qu'on donnera à l'application (même région, pas de passage par Internet). Garder aussi l'**External Database URL** sous la main pour les sauvegardes depuis un poste.
5. Backups : onglet **Backups** (quotidiens sur ce plan). Avant la séance Live : **Create backup** ou, depuis un poste, `pg_dump "<External Database URL>" | gzip > avant-live.sql.gz`.

### A.2 Créer l'application

1. Render → **New → Blueprint** → connecter GitHub → choisir `Scott-SK2/vice-versa`, branche `main`. Render lit `render.yaml` et propose un seul service : `vice-versa` (Docker, Frankfurt, plan Starter, healthcheck `/api/health`).
2. Render demande les variables marquées `sync: false` :

   | Variable | Valeur à saisir |
   |---|---|
   | `DATABASE_URL` | l'**Internal Database URL** copiée en A.1 |
   | `APP_BASE_URL` | `https://vice-versa.onrender.com` (le nom exact est affiché par Render ; si le nom est pris, Render en propose un autre : reprendre celui-là). À remplacer par le domaine personnalisé plus tard |
   | `ADMIN_BOOTSTRAP_EMAIL` | votre e-mail, par exemple `scott@…` |
   | `ADMIN_BOOTSTRAP_PASSWORD` | un mot de passe **temporaire** de 12 caractères minimum |

   `SESSION_SECRET` et `CRON_SECRET` sont générés par Render automatiquement. Les autres valeurs (`MEDIA_BASE_URL=/media`, `EVENT_SLUG=vv26`, limites) sont déjà dans le blueprint.
3. **Apply**. Render construit l'image Docker (3 à 5 minutes la première fois) puis démarre le conteneur, qui applique les migrations, crée le compte admin de démarrage, charge `content/vv26/` et lance la rétention quotidienne.
4. Vérifier : `https://<service>.onrender.com/api/health` doit répondre `{"ok":true,"db":true,…}`.

**À quoi servent `ADMIN_BOOTSTRAP_EMAIL` et `ADMIN_BOOTSTRAP_PASSWORD`** : la console `/admin` n'a aucun compte au départ, et il n'y a pas de formulaire d'inscription (volontairement). Ces deux variables créent le **premier compte admin** au premier démarrage, uniquement si la table des comptes est vide. Le mot de passe est marqué temporaire : à la première connexion, la console vous oblige à en choisir un nouveau. Ensuite les variables ne servent plus à rien (elles sont ignorées dès qu'un compte existe) et peuvent être supprimées de Render. Les autres comptes (animateur, modérateur, second admin) se créent dans `/admin/users`.

### A.3 Première connexion

1. `https://<service>.onrender.com/admin/login` avec l'e-mail et le mot de passe temporaire.
2. Choisir le mot de passe définitif (la console le demande d'office).
3. `/admin/users` : créer les autres comptes. `/admin` : créer une séance de test, la lancer, scanner l'accueil avec un téléphone (`https://<service>.onrender.com/vv26`).

### A.4 Déposer les fichiers médias

Les médias sont versionnés dans `public/media/` et servis par Render sous `/media/`. Il n'y a rien à transférer sur le serveur : on ajoute les fichiers au dépôt et on pousse.

1. Voir ce qui est attendu et ce qui manque : `pnpm media list` (noms exacts tirés de `content/vv26/media.json`).
2. Pour chaque clip monté : `pnpm media encode VV-V10 --in source/VV-V10.mp4` (vidéo et poster écrits dans `public/media/`), puis sous-titres (`pnpm captions …`, relecture, `pnpm media sync-captions`), ligne dans `content/vv26/consents.csv`, `pnpm media grant VV-V10`.
3. Pour une photo : copier le JPEG sous le nom attendu dans `public/media/`, ligne de consentement, `pnpm media grant VV-P05`.
4. `pnpm media check`, puis `git add public/media content && git commit -m "Médias : VV-V10" && git push`. Render redéploie et recharge le contenu au démarrage.

Un **clip de test** (`VV-V12`, mire + bip, 15 s, sous-titres FR/NL/EN d'exemple) est déjà dans le dépôt et publié sur la station d'accueil : il permet de vérifier le lecteur et les sous-titres sur de vrais téléphones dès le premier déploiement. Il sera écrasé par le vrai clip avec `pnpm media encode VV-V12 --in …` et la vraie ligne de consentement.

### A.5 Mettre à jour, revenir en arrière, tester la charge

- Chaque push sur `main` redéploie (`autoDeploy`). Retour arrière : Render → service → **Deploys → Rollback**. La base n'est jamais touchée par un déploiement (migrations additives seulement).
- Gel des déploiements à partir du vendredi 9 octobre 18 h.
- Test de charge depuis un poste : `pnpm load --vus 80 --duration 1800 --base https://<service>.onrender.com`.
- Domaine personnalisé : service → Settings → **Custom Domains**, suivre l'enregistrement DNS indiqué, puis mettre `APP_BASE_URL` à jour et régénérer les QR (`APP_BASE_URL=https://<domaine> pnpm qr:render --pdf`) **avant** le gel des jetons et l'impression.

## B. Vercel (application) + Render (base de données)

1. **Base** : comme en A.1, mais copier l'**External Database URL** (Vercel n'est pas dans le réseau Render), avec `?sslmode=require` si absent.
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
