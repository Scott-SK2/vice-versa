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
| `pnpm db:generate` | Génère une migration SQL à partir de `src/db/schema/` |
| `pnpm db:migrate` | Applique les migrations |
| `pnpm db:studio` | Explorateur de base de données |
| `pnpm content:validate` | Valide `content/vv26/` sans toucher à la base |
| `pnpm qr:tokens` | Attribue les jetons QR et codes courts manquants |
| `pnpm db:seed` | Charge (ou recharge) le contenu en base, de façon idempotente |
| `pnpm admin:create` | Crée un compte d'administration |

## Organisation

```
content/vv26/        contenu versionné : événement, stations, questions, médias, mots interdits, plan
docs/conception/     dossier de conception
drizzle/             migrations SQL
scripts/             seed, validation, jetons QR, création d'admin
src/db/              client et schéma Drizzle (enums, contenu, administration, séances)
src/lib/domain/      règles métier pures : phases, progression, réponses, mots, jetons
src/lib/content/     schémas et chargement du dossier content/
src/app/             pages Next.js (participant /vv26, admin /admin, projection)
tests/unit/          tests Vitest
```
