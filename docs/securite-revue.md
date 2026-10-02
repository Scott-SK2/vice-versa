# Revue de sécurité — 2 octobre 2026

Périmètre : l'ensemble du code de la branche (API participant, console d'administration, écrans, déploiement, scripts). Méthode : audit des dépendances, recherche de motifs à risque, relecture adversariale des points d'authentification, d'autorisation, de limites de débit, de rendu et de configuration, puis correction immédiate et tests. Référence des exigences : `docs/conception/06-admin-securite-rgpd.md`.

## 1. Corrigé dans cette revue

| # | Constat | Risque | Correction |
|---|---|---|---|
| S1 | Le plan SVG était injecté inline (`dangerouslySetInnerHTML`) après un simple retrait des balises `<script>`. Un SVG compromis sur le CDN pouvait porter des attributs `onload` et la CSP autorise les scripts inline. | XSS côté participant via un fichier média | Le plan est affiché dans une balise `<img>` : aucun script ni gestionnaire d'événement ne s'exécute, quelle que soit la CSP. |
| S2 | La limite de débit de l'écran de projection était partagée par séance (120 requêtes/min). L'identifiant de séance est visible de tous les participants (`/api/runs/current`) : un tiers pouvait épuiser la limite et faire disparaître l'affichage de la salle. | Déni de service de la projection le jour J | Limite par adresse IP, plus 10 essais de clé erronée par 10 minutes et par IP. |
| S3 | Comparaison de la clé de projection par `!==`. | Attaque temporelle (théorique, clé de 24 caractères) | `timingSafeEqual`. |
| S4 | Connexion admin limitée par couple (IP, e-mail) seulement : une attaque distribuée sur un même compte n'était pas freinée ; un e-mail inconnu répondait plus vite qu'un e-mail connu (pas de vérification Argon2). | Force brute distribuée, énumération des comptes | Limites supplémentaires : 20 essais / 15 min par e-mail toutes IP confondues, 30 / 15 min par IP ; vérification factice Argon2id pour un e-mail inconnu (durée identique). |
| S5 | Jetons participants inventés : chaque essai interrogeait la base sans limite par IP. | Charge inutile, énumération | 60 jetons inconnus / min / IP. |
| S6 | Codes courts de station (4 caractères, ~20 bits) devinables à 120 essais / min / jeton, multipliés par le nombre de sessions créables. | Déblocage de stations sans être devant l'affiche | 10 échecs / min / session et 40 / min / IP, en plus de la limite par jeton. |
| S7 | Aucun plafond au nombre de sessions par séance. | Remplissage de la base depuis plusieurs IP | `MAX_SESSIONS_PER_RUN` (2 000 par défaut), au-delà `429`. |
| S8 | Création de session limitée à 30 / min / IP alors qu'un Wi-Fi de salle présente une seule IP (trouvé par le test de charge). | Blocage des vrais participants | 120 / min / IP, configurable (`RATE_LIMIT_SESSIONS_PER_IP_PER_MIN`). |

Tests ajoutés : `tests/api/security.test.ts` (codes devinés, jetons inventés, clé de projection et IP légitime épargnée, limite par e-mail, plafond de sessions).

## 2. Vérifié, conforme

- **Mots de passe** : Argon2id (64 Mio, 3 passes), minimum 12 caractères, mot de passe temporaire à changer avant toute action, sessions révoquées à la désactivation ou à la réinitialisation.
- **Sessions admin** : jeton 256 bits stocké haché (HMAC-SHA256 avec `SESSION_SECRET`), cookie `HttpOnly` + `SameSite=Lax` + `Secure` en production, 12 h glissantes plafonnées à 24 h, déconnexion = suppression.
- **CSRF** : en-tête `X-Requested-With: vv-admin` exigé sur toute mutation admin, contrôle de l'`Origin` quand présent ; les routes GET ne modifient rien d'autre que le journal.
- **Autorisations** : rôles hiérarchiques vérifiés côté serveur sur chaque route (`adminRoute(min)`), boutons masqués côté interface en plus ; un admin ne peut ni se désactiver ni retirer le dernier admin ; le type d'une séance ne change qu'en brouillon ; réinitialisation interdite sur une séance Live avec participants.
- **Participants** : jeton 128 bits d'aléa stocké haché, un jeton n'accède qu'à ses propres données, aucune énumération (UUID, pas de liste), agrégats masqués sous 5 réponses, textes libres jamais montrés aux autres participants, projection limitée aux textes validés.
- **Entrées** : tout corps validé par Zod, valeurs de réponse validées selon le type de question, textes bornés à 140 caractères, mots interdits filtrés, requêtes SQL paramétrées (Drizzle ; les fragments `sql` n'interpolent que des références de colonnes).
- **Sorties** : React échappe tout ; aucun HTML non échappé après S1 ; textes libres rendus comme texte en projection ; export CSV sans cellule commençant par un caractère de formule (empreinte, codes, JSON entre guillemets).
- **En-têtes** : CSP (`default-src 'self'`, médias et `connect-src` limités à l'origine de `MEDIA_BASE_URL`, `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra, micro, géolocalisation refusés), `X-Frame-Options`, HSTS par Caddy, `X-Powered-By` retiré.
- **Secrets** : aucun secret dans le dépôt ni dans l'image (variables de build factices) ; `.env*` ignorés par git ; clé Groq utilisée uniquement par les scripts sur le poste de l'équipe.
- **Journalisation** : pas de jeton, de mot de passe ni de texte libre dans les logs ; erreurs internes renvoyées comme `500` générique.
- **Déploiement** : conteneur non root, PostgreSQL non exposé, journaux bornés, sauvegardes avec rotation, migrations additives.
- **Dépendances** : `pnpm audit --prod` sans vulnérabilité connue. Une vulnérabilité modérée en développement seulement (`esbuild` ≤ 0.24 via `drizzle-kit`, exposition du serveur de développement local) : absente de l'image de production, à suivre lors des mises à jour de `drizzle-kit`.

## 3. Risques résiduels acceptés et recommandations

| Sujet | État | Recommandation |
|---|---|---|
| CSP avec `script-src 'unsafe-inline'` | Nécessaire à l'hydratation Next.js sans nonce | Passer à une CSP avec nonce (middleware) après le 10 octobre ; aucune donnée personnelle n'est exposée côté participant, le risque est limité à la session admin, protégée par `HttpOnly`. |
| Limites de débit en mémoire | Correctes pour une instance unique | Si plusieurs instances un jour : Redis ou limite au niveau de Caddy. |
| Pas de second facteur sur les comptes admin | Hors périmètre du 10 octobre | Mots de passe longs, peu de comptes, journal d'audit ; envisager un second facteur pour les éditions futures. |
| Clé de projection dans l'URL | Donne accès à des agrégats et textes validés seulement | Régénérer la clé après la séance (bouton dans la console) ; ne pas partager le lien hors de l'équipe. |
| Codes courts à 4 caractères | Imposés par le cahier (lisibilité à 2 m) | Les limites S6 rendent l'énumération impraticable pendant la durée de l'atelier ; l'enjeu reste faible (voir une vidéo avant d'être devant l'affiche). |
| Sauvegardes en clair sur le serveur | `deploy/data/backups` | Copier hors du serveur avec chiffrement (`rclone crypt` ou `age`) ; supprimer après 12 mois comme les réponses. |
| Rechargement du contenu depuis le disque | Réservé aux admins, dossier monté en lecture seule | Garder `deploy/data/content` sous contrôle de l'équipe technique uniquement. |

## 4. Avant le jour J

1. Changer tous les mots de passe temporaires, vérifier qu'il reste exactement les comptes prévus dans `/admin/users`.
2. Geler les jetons QR, puis vérifier dans `/admin/content` qu'aucun rechargement ne les change.
3. Régénérer la clé de projection de la séance Live juste avant de l'afficher dans la salle.
4. Dump de la base avant le lancement (`./deploy/backup.sh avant-live`).
5. Après l'événement : export des résultats, nouvelle régénération de la clé de projection, archivage de la séance quand les analyses sont faites.
