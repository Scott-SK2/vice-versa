# 06 — Administration, sécurité, données personnelles

## 1. Comptes et rôles

Le cahier prévoyait un simple « code d'accès animateur ». L'exigence nouvelle (gérer, lancer et stopper plusieurs séances, dont des tests) impose des comptes nominatifs : on sait qui a lancé quoi, on peut retirer un accès, et un animateur ne peut pas clôturer la séance par erreur.

| Capacité | `admin` | `animateur` | `moderateur` |
|---|:-:|:-:|:-:|
| Voir la liste des séances et les tableaux de bord | ✔ | ✔ | ✔ |
| Créer, modifier, supprimer une séance | ✔ | ✘ | ✘ |
| **Lancer** une séance | ✔ | ✘ | ✘ |
| Changer de phase (avant / arrière) | ✔ | ✔ | ✘ |
| Choisir la diapositive projetée | ✔ | ✔ | ✘ |
| Modérer les textes libres | ✔ | ✔ | ✔ |
| **Stopper**, rouvrir, réinitialiser, archiver | ✔ | ✘ | ✘ |
| Exporter CSV / JSON | ✔ | ✘ | ✘ |
| Gérer les comptes | ✔ | ✘ | ✘ |
| Recharger le contenu, geler les jetons | ✔ | ✘ | ✘ |
| Consulter le journal d'audit | ✔ | ✘ | ✘ |

Recommandation pour le 10 octobre : deux comptes `admin` (responsable technique, référent organisateur), un compte `animateur`, un compte `moderateur` (personne dédiée, distincte de l'animateur, conformément à la réponse par défaut du cahier). Un même poste peut rester connecté sur deux onglets (console + projection).

## 2. Authentification

- **Mot de passe** : Argon2id (`m=64 Mio, t=3, p=1`), longueur minimale 12 caractères, pas de règle de composition, vérification contre une courte liste de mots de passe triviaux. Le premier mot de passe est temporaire (`must_change_password`) : la console refuse toute autre action tant qu'il n'est pas changé.
- **Session** : jeton aléatoire 256 bits, stocké haché (SHA-256) dans `admin_sessions`, cookie `vv_admin` `httpOnly; Secure; SameSite=Lax; Path=/`, expiration 12 h glissantes (prolongée à chaque requête, plafond 24 h). Déconnexion = suppression de la ligne. Changement de mot de passe = suppression des autres sessions de l'utilisateur.
- **Anti-force brute** : 5 échecs / 15 min par couple (IP, e-mail), puis délai croissant ; chaque échec journalisé (`auth.failed`).
- **CSRF** : `SameSite=Lax` + en-tête `X-Requested-With: vv-admin` obligatoire sur toute mutation ; les Route Handlers vérifient aussi `Origin` quand il est présent.
- **Premier compte** : au démarrage, si `admin_users` est vide et que `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` sont définis, le compte est créé avec `must_change_password = true`. Alternative : `pnpm create-admin`.
- **Pas de réinitialisation par e-mail** en MVP : un `admin` pose un mot de passe temporaire à un collègue depuis `/admin/users`.
- **Projection** : pas de cookie ; la clé `projection_key` (24 caractères aléatoires) est dans l'URL affichée dans la console. Elle ne donne accès qu'à des données agrégées et modérées. Un bouton « Régénérer la clé » invalide l'ancienne URL.

## 3. Écrans d'administration

### `/admin` — Séances

Tableau : libellé, type (badge Test / Répétition / Live), statut, phase, sessions actives / total, créée par, lancée le, clôturée le. La séance `live` est épinglée en haut avec un accès direct à sa console. Bouton « Nouvelle séance » (admin).

### `/admin/runs/new`

Libellé (obligatoire), type (`test` par défaut ; `live` demande une confirmation « Il s'agit de l'événement réel »), date prévue, notes. Création en `draft`.

### `/admin/runs/{id}` — Console de séance

En-tête : libellé, badge type, statut, phase, compteur de sessions, horodatages, auteur. Actions selon statut et rôle :

| Action | Confirmation | Effet |
|---|---|---|
| **Lancer** | « Lancer “Atelier 10 octobre” ? Les téléphones ayant participé à une séance précédente repartiront de zéro. » Si une autre séance est live : message bloquant avec son nom et un lien vers sa console | `draft → live` |
| **Phase suivante** / clic sur une phase | Aucune en avant d'une phase ; confirmation en arrière | `phase` |
| **Stopper** | Saisir le libellé de la séance. Rappel : « Les participants verront l'écran Merci. Cette action est définitive pour une séance Live. » | `live → closed`, `summary` figé |
| **Rouvrir** (test / répétition) | Simple | `closed → live` |
| **Réinitialiser** | Saisir le libellé ; interdit si `live` de type `live` avec des sessions | Purge, phase `accueil` |
| **Archiver** | Simple | Purge, `summary` conservé |
| **Supprimer** | Saisir le libellé | Suppression |

Onglets :

1. **Phases** : les 6 boutons (jaune = en cours, vert pâle = passées), durée indicative, durée écoulée dans la phase courante, rappel « Côté participant » / « Côté animateur » du cahier.
2. **Vue d'ensemble** : 4 indicateurs (sessions, progression moyenne, questions « Avant » remplies, textes à modérer), barre de fréquentation par station (ouvertes / terminées), courbe des sessions créées par tranche de 5 min, réponses « Après » reçues. Rafraîchi toutes les 10 s. Données agrégées uniquement (MVP-07).
3. **Modération** : file des textes en attente (source, station ou phase, texte, horodatage), boutons Valider / Refuser, filtres En attente / Validés / Refusés, raccourcis clavier, compteur. Un texte refusé peut être revalidé.
4. **Projection** : liste des diapositives à gauche (Avant/Après par question pairée, Oui/Non/Ça dépend par question `tri_state`, mots associés Europe / Afrique, messages validés par question, vue d'ensemble, écran vide), aperçu 16:9 à droite, bouton **Projeter**, lien « Ouvrir l'écran de projection » avec la clé, bouton « Régénérer la clé ».
5. **Export** : CSV des réponses, JSON du résumé, bouton « Sauvegarde de la base » (déclenche `pg_dump` dans un volume, admin seulement).
6. **Journal** : actions sur la séance avec auteur et horodatage.

### `/admin/users`

Liste, création (e-mail, nom affiché, rôle, mot de passe temporaire affiché une seule fois), désactivation, changement de rôle, réinitialisation du mot de passe. Garde-fous : impossible de se désactiver soi-même ou de supprimer le dernier `admin`.

### `/admin/content`

Version du contenu chargée vs dossier `content/`, bouton Recharger (diff affiché avant application), bouton « Geler les jetons QR » avec la date, lien de téléchargement de la planche de QR, état des consentements par média (compteur `granted` / `pending`), liste des médias exclus de l'application faute de consentement.

## 4. Sécurité applicative

- **Transport** : HTTPS seulement, HSTS (`max-age=31536000`), redirection HTTP → HTTPS par Caddy.
- **En-têtes** : `Content-Security-Policy` avec **nonce par requête** posé par `src/proxy.ts` (`default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; media-src / img-src / connect-src 'self' + origine du CDN; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), ce qui impose un rendu par requête de toutes les pages ; `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (la caméra sert au scanner de QR intégré à l’application), `X-Frame-Options: DENY`.
- **Jetons participants** : 128 bits d'aléa, stockés hachés ; un jeton ne donne accès qu'à ses propres données ; aucune énumération possible (identifiants UUID, pas de liste).
- **Jetons QR** : 8 caractères alphabet `A-Z2-9` sans `O/0/I/1` (≈ 40 bits), codes courts 4 caractères du même alphabet (≈ 20 bits, protégés par la limite de débit : 120 essais / min / jeton rendent l'énumération impraticable pendant l'atelier) ; `404 UNKNOWN_CODE` a le même temps de réponse qu'un succès.
- **Validation** : tout corps passe par Zod ; `value` est validé selon le type de question ; longueur des textes bornée ; mots filtrés.
- **Injection / XSS** : requêtes paramétrées (Drizzle) ; les textes libres sont rendus comme texte, jamais comme HTML, y compris en projection.
- **Journalisation** : pas de jeton ni de texte libre dans les logs ; identifiants de session tronqués.
- **Dépendances** : `pnpm audit` en CI ; image Docker non-root ; secrets uniquement en variables d'environnement.
- **Séparation des espaces** : les Route Handlers `/api/admin/*` passent par un middleware unique (`requireRole`) ; les pages `/admin/*` sont rendues côté serveur après vérification du cookie (redirection vers `/admin/login`).

## 5. Données personnelles (RGPD)

| Point | Choix |
|---|---|
| Base légale participants | Aucune donnée personnelle collectée (MVP-01) : jeton aléatoire, langue, réponses à des questions non identifiantes. Les textes libres sont modérés avant projection et bornés à 140 caractères ; l'écran de saisie demande de ne pas écrire de nom. |
| Mineurs | Hypothèse « oui par précaution » : aucun média de participant, textes courts modérés, aucune donnée de contact. |
| Adresse IP | Utilisée en mémoire pour la limite de débit, non stockée côté participant. Stockée pour les sessions admin (sécurité), purgée avec la session. |
| Cookies | `vv_session` (secours technique, strictement nécessaire) et `vv_admin` : pas de bandeau de consentement requis ; mention dans l'accueil et la page « Confidentialité » (`/vv26/confidentialite`, lien discret dans le pied d'accueil). |
| Hébergement | UE (voir 01). CDN avec zone de stockage EU. |
| Conservation | 12 mois pour les réponses brutes (séance archivée automatiquement), résumés agrégés sans limite, journal 24 mois. |
| Droit de retrait | Sans identifiant, un participant ne peut pas être retrouvé ; la page de confidentialité l'explique. Les personnes filmées exercent leur retrait via le tableau de consentements : passer `consent_status` à `refused` retire le média de l'application au prochain rechargement. |
| Sous-traitants | Hébergeur, CDN, Groq (hors application, avant l'événement, mentionné dans le formulaire de consentement). |
| Registre | Une fiche de traitement « Atelier VICE VERSA » à rédiger par l'organisateur à partir de ce tableau. |
