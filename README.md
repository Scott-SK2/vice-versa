# VICE VERSA — « Deux regards, deux continents »

Application web de l'atelier VICE VERSA (Mix'Up, 10 octobre 2026) : parcours de 8 stations débloquées par QR code, vidéos sous-titrées FR / NL / EN, questions Avant / Après, tableau de bord animateur, projection des résultats, et **administration des séances** (tests, répétition, événement, éditions futures).

- Cahier de concept fonctionnel v3 : document de référence fonctionnel (fourni par les organisateurs).
- **Dossier de conception technique : [`docs/conception/`](docs/conception/README.md)**.

## Démarrer en local

Prérequis : Node 22, pnpm 10, PostgreSQL 16 (ou Docker).

```bash
cp .env.example .env            # adapter DATABASE_URL et SESSION_SECRET
docker compose up -d db         # ou une instance PostgreSQL locale
pnpm install
pnpm db:migrate                 # applique drizzle/ sur la base
pnpm qr:tokens                  # attribue jetons QR et codes courts manquants (déjà faits pour vv26)
pnpm db:seed                    # charge content/vv26/ en base
pnpm admin:create --email vous@exemple.be --name "Prénom Nom" --role admin
pnpm dev                        # http://localhost:3000
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Qualité |
| `pnpm test:e2e` | Parcours participant complet dans Chromium contre un serveur démarré (`BASE`, `PW_CHROMIUM`, `OUT`) |
| `pnpm db:generate` | Génère une migration SQL à partir de `src/db/schema/` |
| `pnpm db:migrate` | Applique les migrations |
| `pnpm db:studio` | Explorateur de base de données |
| `pnpm content:validate` | Valide `content/vv26/` sans toucher à la base |
| `pnpm qr:tokens` | Attribue les jetons QR et codes courts manquants |
| `pnpm db:seed` | Charge (ou recharge) le contenu en base, de façon idempotente |
| `pnpm admin:create` | Crée un compte d'administration |
| `pnpm seance list\|create\|start\|phase\|close\|reopen\|reset\|delete` | Pilote les séances en ligne de commande, en attendant la console admin |

## Application participant

Routes sous `/vv26` : accueil et choix de langue, questions « Avant », parcours (liste des 8 stations), carte, saisie de code, station (`/vv26/s/{code}`, arrivée QR avec `?k=<jeton>`), station terminée, questions « Après », bilan Avant/Après, trace finale, merci. `/vv26/reset` efface la session d'une tablette prêtée.

L'application interroge `/api/runs/current` toutes les 10 s : un changement de phase déplace le participant vers le bon écran, une séance stoppée l'envoie sur « Merci », une nouvelle séance le fait repartir de zéro en gardant sa langue. Les réponses envoyées sans réseau sont mises en file et renvoyées automatiquement.

En local, les médias sont servis depuis `public/media/` (`MEDIA_BASE_URL=/media`) : le plan `map.svg` y est copié ; les vidéos, posters et sous-titres y seront déposés avec les mêmes noms que dans `content/vv26/media.json`.

## Console d'administration

- `/admin/login` : connexion par e-mail et mot de passe (compte créé avec `pnpm admin:create`, ou `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` au premier démarrage).
- `/admin` : séances (créer, lancer, piloter les phases, stopper, rouvrir, réinitialiser, archiver, supprimer), tableau de bord, modération, projection, export, journal.
- `/admin/users` et `/admin/content` : comptes et rechargement du contenu (admin uniquement).
- `/animateur` et `/moderation` : raccourcis vers la console de la séance en cours.
- `/projection/<id>?key=…` : écran de la salle, lien affiché dans l'onglet Projection.

Rôles : **admin** (tout), **animateur** (phases, projection, modération), **modérateur** (modération et lecture).

## Tester l'API participant à la main

```bash
pnpm seance create --label "Test interne 1"      # séance en brouillon
pnpm seance start --id <uuid>                    # la séance passe live, phase accueil
pnpm seance phase --id <uuid> --to parcours
curl -s localhost:3000/api/runs/current
TOKEN=$(curl -s -X POST localhost:3000/api/sessions -H 'content-type: application/json' -d '{"lang":"fr"}' | jq -r .token)
curl -s -X POST localhost:3000/api/scan -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"short_code":"XEDU"}'
curl -s localhost:3000/api/stations/3 -H "authorization: Bearer $TOKEN"
pnpm seance close --id <uuid>                    # stopper : résultats figés, participants sur « Merci »
```

Les routes et leurs contrats sont décrits dans [`docs/conception/04-api.md`](docs/conception/04-api.md). Les tests d'intégration (`tests/api/`) exigent une base migrée et seedée.

## Organisation

```
content/vv26/        contenu versionné : événement, stations, questions, médias, mots interdits, plan
docs/conception/     dossier de conception
drizzle/             migrations SQL
scripts/             seed, validation, jetons QR, création d'admin
src/db/              client et schéma Drizzle (enums, contenu, administration, séances)
src/lib/domain/      règles métier pures : phases, progression, réponses, mots, jetons
src/lib/content/     schémas et chargement du dossier content/, catalogue en base
src/lib/participant/ API participant : résolution du jeton, scan, stations, réponses, agrégats
src/lib/runs/        cycle de vie des séances (créer, lancer, phases, stopper, résumé)
src/lib/admin/       authentification admin, services de la console, client fetch
src/components/      console (admin/), diapositives (projection/), application participant (participant/)
src/lib/participant/client/  état client participant : jeton, séance, langue, file hors-ligne, textes FR/NL/EN
messages/            textes d'interface fr.json, nl.json, en.json
src/lib/api/         erreurs, enveloppe des Route Handlers, limite de débit
src/app/api/         Route Handlers Next.js
src/app/             pages Next.js (participant /vv26, admin /admin, projection)
tests/unit/          tests unitaires (règles métier, contenu)
tests/api/           tests d'intégration de l'API contre PostgreSQL
```
