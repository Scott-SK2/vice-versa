# 04 — Contrats API

Toutes les routes sont sous `/api`, répondent en JSON, et portent `Cache-Control: no-store` sauf mention contraire. Les corps de requête sont validés par des schémas Zod partagés avec le front. Les routes du cahier sont conservées, renommées `spots → stations`, et complétées.

## 1. Authentification et conventions

| Espace | Mécanisme | Transport |
|---|---|---|
| Participant | Jeton anonyme `v1.<run_id>.<aléa 128 bits>` remis par `POST /api/sessions` | En-tête `Authorization: Bearer <jeton>` ; le client le garde en `localStorage` et en cookie `vv_session` de secours (lu seulement si l'en-tête est absent) |
| Projection | `projection_key` de la séance | Paramètre `?key=` |
| Administration | Session serveur | Cookie `vv_admin` `httpOnly; Secure; SameSite=Lax; Path=/`, 12 h glissantes |

### Format d'erreur

```json
{ "error": { "code": "PHASE_LOCKED", "message": "Cette étape est fermée.", "details": { "phase": "discussion" } } }
```

| HTTP | `code` | Sens |
|---|---|---|
| 400 | `VALIDATION` | Corps ou paramètre invalide (`details.issues` de Zod) |
| 401 | `SESSION_UNKNOWN` / `ADMIN_UNAUTHENTICATED` | Jeton participant inconnu / cookie admin absent ou expiré |
| 403 | `FORBIDDEN` / `STATION_LOCKED` | Rôle insuffisant / station jamais scannée dans cette session |
| 404 | `NOT_FOUND` / `UNKNOWN_CODE` | Ressource inconnue / jeton QR ou code court inconnu |
| 409 | `RUN_CHANGED` / `RUN_CLOSED` / `NO_RUN_LIVE` / `ANOTHER_RUN_LIVE` / `INVALID_TRANSITION` | Voir 02 § 4 et § 2 |
| 423 | `PHASE_LOCKED` | Écriture interdite dans la phase courante |
| 429 | `RATE_LIMITED` | En-tête `Retry-After` |

### Limites de débit

- Participant : 120 requêtes / minute / jeton, et 30 / minute / IP pour `POST /api/sessions` (pour couvrir un Wi-Fi partagé derrière une seule IP, la limite par IP est volontairement haute).
- Admin : 5 tentatives de connexion / 15 minutes / (IP + e-mail), puis 60 secondes de blocage progressif.
- Implémentation : compteur en mémoire par processus (une seule instance) avec fenêtre glissante ; aucun Redis nécessaire.

## 2. Routes participant

| Méthode | Route | Rôle | Phases autorisées |
|---|---|---|---|
| `GET` | `/api/runs/current` | Séance live et phase, interrogée toutes les 10 s. **Sans jeton.** | toutes |
| `POST` | `/api/sessions` | Crée la session anonyme sur la séance live, renvoie le jeton | sauf `cloture` |
| `GET` | `/api/me` | Session, langue, séance, phase, prochain écran conseillé | toutes |
| `PATCH` | `/api/me` | Change la langue | toutes |
| `GET` | `/api/me/progress` | Stations avec état, `last_station_id`, pourcentage | toutes |
| `POST` | `/api/stations/{code}/scan` | Corps `{ "token": "7Q2M9XKD" }` ou `{ "short_code": "7Q2M" }` ; débloque et met à jour `last_station_id` | voir matrice 02 § 3 |
| `GET` | `/api/stations/{code}` | Contenu d'une station débloquée : médias, sous-titres, questions, réponse déjà donnée | toutes (403 si jamais scannée) |
| `POST` | `/api/stations/{code}/media-progress` | `{ "media_ref": "VV-V10", "progress": 0.83 }` ; termine une station `media_only` à ≥ 0,8 | `parcours`, `apres` |
| `GET` | `/api/questions?phase=avant` | Questions d'une phase hors station (`avant`, `apres`, `trace`) avec réponses déjà données | toutes |
| `PUT` | `/api/answers/{question_key}` | Crée ou remplace la réponse ; recalcule l'état de la station | matrice 02 § 3 |
| `GET` | `/api/questions/{question_key}/aggregate` | Agrégat simple montré après la réponse (questions fermées uniquement ; 403 si pas encore répondu) | toutes |
| `GET` | `/api/me/summary` | Bilan Avant/Après personnel et mots de départ | `apres` et suivantes |

### `GET /api/runs/current`

```json
{ "status": "live", "run_id": "0a3f…", "kind": "live", "phase": "parcours", "event": "vv26", "server_time": "2026-10-10T14:21:03Z" }
```
ou `{ "status": "none" }`. Réponse légère, `ETag` fourni, le client envoie `If-None-Match` pour obtenir `304`.

### `POST /api/sessions`

Requête `{ "lang": "fr" }`. Réponse `201` :

```json
{ "token": "v1.0a3f….k9Qz…", "session_id": "9d1c…", "run": { "id": "0a3f…", "kind": "live", "phase": "accueil", "label": "Atelier 10 octobre" }, "lang": "fr" }
```

Si une séance `test` est live, le champ `run.kind` permet d'afficher le bandeau.

### `POST /api/stations/{code}/scan`

```json
// requête (depuis l'URL /vv26/s/3?k=7Q2M9XKD)
{ "token": "7Q2M9XKD" }
// requête (onglet « Saisir un code »)
{ "short_code": "7Q2M" }
```

Réponse `200` :

```json
{
  "station": { "code": "3", "title": "Pourquoi aller en Afrique ?", "state": "in_progress", "is_here": true, "first_open": true },
  "progress": { "completed": 2, "required": 8, "percent": 25 },
  "run": { "phase": "parcours" },
  "needs_before_questions": false
}
```

`needs_before_questions = true` quand la session vient d'être créée par un scan de station et que les questions « Avant » n'ont pas été remplies : le client les propose après la station (règle 6 du cahier). Le code court est comparé insensible à la casse et aux caractères ambigus (`0/O`, `1/I/L` ne sont jamais générés).

### `GET /api/stations/{code}`

```json
{
  "station": { "code": "3", "title": "…", "intro": "…", "state": "in_progress", "is_here": true },
  "media": [
    { "ref": "VV-V10", "type": "video", "url": "https://cdn…/VV-V10.mp4", "poster_url": "…", "duration_s": 56,
      "captions": { "fr": { "words": "…/VV-V10.fr.json", "vtt": "…/VV-V10.fr.vtt" }, "nl": { "…": "…" }, "en": { "…": "…" } } }
  ],
  "questions": [
    { "key": "s3_motivation", "type": "single_choice", "text": "Selon toi, quelle est leur principale motivation ?", "required": true,
      "choices": [ { "key": "etudes", "label": "Les études" }, { "key": "famille", "label": "La famille" } ],
      "answer": null, "locked": false }
  ]
}
```

Les textes sont renvoyés **déjà résolus dans la langue de la session** (`text_i18n[lang]` avec repli `fr`). Les médias dont `consent_status ≠ granted` ne sont jamais renvoyés.

### `PUT /api/answers/{question_key}`

Requête : `{ "value": { "choice_id": 12 }, "client_ts": "2026-10-10T14:22:10Z" }`. `client_ts` sert à ignorer un renvoi hors-ligne plus ancien que la réponse déjà enregistrée. Réponse :

```json
{ "saved": true, "station": { "code": "3", "state": "completed" }, "progress": { "completed": 3, "required": 8, "percent": 38 }, "aggregate_available": true }
```

Pour `guess_reveal`, la réponse ajoute `"reveal": { "correct": false, "correct_choice_key": "kinshasa" }`.

### `GET /api/questions/{question_key}/aggregate`

```json
{ "type": "tri_state", "total": 61, "choices": [ { "key": "oui", "label": "Oui", "count": 14, "percent": 23 }, { "key": "non", "label": "Non", "count": 9, "percent": 15 }, { "key": "depend", "label": "Ça dépend", "count": 38, "percent": 62 } ] }
```

Renvoyé uniquement pour `single_choice`, `multi_choice`, `tri_state`, `guess_reveal` (pour celle-ci : `% de bonnes réponses`). Masqué (`total` seulement) tant que `total < 5`, pour ne pas révéler une réponse individuelle.

## 3. Route projection (écran de la salle)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/projection/{run_id}/current?key=…` | Diapositive courante (`runs.current_slide`) et ses données, interrogée toutes les 5 s |

```json
{ "slide": { "kind": "before_after", "question_key": "avant_futur" },
  "data": { "before": { "total": 71, "choices": [ … ] }, "after": { "total": 58, "choices": [ … ] } },
  "run": { "label": "Atelier 10 octobre", "phase": "discussion" }, "version": 17 }
```

`kind ∈ { blank, before_after, tri_state_columns, words, approved_texts, overview }`. Les textes ne sortent que si `moderation_status = 'approved'`. `version` s'incrémente à chaque changement de diapositive ou toutes les 5 s pour rafraîchir les comptes.

## 4. Routes administration

Toutes exigent le cookie `vv_admin`. La colonne « Rôle » indique le rôle minimal (`admin` peut tout). Les mutations exigent l'en-tête `X-Requested-With: vv-admin` (protection CSRF en plus de `SameSite=Lax`).

### 4.1 Authentification

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `POST` | `/api/admin/auth/login` | — | `{ email, password }` → pose le cookie ; `must_change_password` dans la réponse |
| `POST` | `/api/admin/auth/logout` | tous | Supprime la session |
| `GET` | `/api/admin/auth/me` | tous | Utilisateur courant, rôle, séance live |
| `POST` | `/api/admin/auth/password` | tous | `{ current_password, new_password }` |

### 4.2 Séances

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `GET` | `/api/admin/runs` | tous | Liste (statut, type, phase, sessions, créée par, dates) ; filtre `?status=` |
| `POST` | `/api/admin/runs` | admin | `{ label, kind, scheduled_at?, notes? }` → `draft` |
| `GET` | `/api/admin/runs/{id}` | tous | Détail + compteurs |
| `PATCH` | `/api/admin/runs/{id}` | admin | Libellé, type (seulement en `draft`), date, notes |
| `POST` | `/api/admin/runs/{id}/start` | admin | `draft → live`, phase `accueil`. `409 ANOTHER_RUN_LIVE` sinon |
| `POST` | `/api/admin/runs/{id}/phase` | animateur | `{ phase, confirm_backwards?: true }` ; `409 INVALID_TRANSITION` si saut de plus d'une phase en avant ou retour sans confirmation |
| `POST` | `/api/admin/runs/{id}/close` | admin | **Stopper** : fige `summary`, `live → closed` |
| `POST` | `/api/admin/runs/{id}/reopen` | admin | `closed → live` pour `test`/`repetition` seulement |
| `POST` | `/api/admin/runs/{id}/reset` | admin | Purge sessions/visites/réponses, phase `accueil` ; `{ confirm_label }` doit égaler le libellé ; refusé sur `live` avec sessions |
| `POST` | `/api/admin/runs/{id}/archive` | admin | Purge et garde `summary` |
| `DELETE` | `/api/admin/runs/{id}` | admin | `draft`, ou `test` quel que soit le statut |
| `GET` | `/api/admin/runs/live` | tous | Raccourci vers la séance live (404 sinon) ; utilisé par `/animateur` |

### 4.3 Suivi, modération, projection, export

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `GET` | `/api/admin/runs/{id}/dashboard` | tous | Sessions actives (vues < 2 min), total, progression moyenne, « Avant » remplies, textes à modérer, fréquentation par station, réponses « Après » reçues |
| `GET` | `/api/admin/runs/{id}/answers?status=pending&cursor=` | moderateur | Textes libres (`short_text`, commentaires `tri_state`, trace) avec question, station, horodatage, **jamais l'identifiant de session en clair** |
| `POST` | `/api/admin/answers/{id}/moderate` | moderateur | `{ decision: "approved" \| "rejected" }` |
| `GET` | `/api/admin/runs/{id}/projection/{kind}?question=` | animateur | Aperçu des données d'une diapositive |
| `PUT` | `/api/admin/runs/{id}/projection` | animateur | `{ kind, question_key? }` → `current_slide` |
| `GET` | `/api/admin/runs/{id}/export.csv` | admin | Une ligne par réponse : `session_hash, station, question_key, type, value_json, moderation_status, updated_at` (`session_hash` = hachage tronqué, pour relier les réponses d'une même session sans identifier le jeton) |
| `GET` | `/api/admin/runs/{id}/export.json` | admin | `summary` (recalculé si la séance est encore live) |
| `GET` | `/api/admin/runs/{id}/audit` | admin | Journal filtré sur la séance |

### 4.4 Comptes et contenu

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `GET` | `/api/admin/users` | admin | Liste |
| `POST` | `/api/admin/users` | admin | `{ email, display_name, role, temporary_password }` → `must_change_password = true` |
| `PATCH` | `/api/admin/users/{id}` | admin | Rôle, `active`, réinitialisation de mot de passe (`temporary_password`) ; un admin ne peut pas se désactiver lui-même ni retirer le dernier `admin` |
| `GET` | `/api/admin/content/status` | admin | Version chargée, version du dossier `content/`, différences détectées |
| `POST` | `/api/admin/content/reload` | admin | Recharge `content/` (upsert par `code`/`key`) ; refuse de modifier `qr_token`/`short_code` si `tokens_frozen_at` est posé |
| `POST` | `/api/admin/content/freeze-tokens` | admin | Pose `tokens_frozen_at` (à faire avant l'impression du 7 octobre) |
| `GET` | `/api/health` | — | `{ ok, db, live_run: { id, phase } \| null, version }` |

## 5. Transactions sensibles

- **Scan** : `select … for update` sur la session, `insert … on conflict do nothing` sur `station_visits`, mise à jour de `last_station_id`, le tout dans une transaction. Deux scans simultanés du même QR sont idempotents.
- **Réponse** : vérification de phase, de visite, validation du `value` selon le type, normalisation, `insert … on conflict (session_id, question_id) do update where excluded.updated_at > answers.updated_at`, puis complétion de la visite. Une seule transaction.
- **Lancer / Stopper** : `select … for update` sur la séance ; l'index unique partiel protège contre deux lancements concurrents de séances différentes.
- **Réinitialiser** : suppression en cascade dans une transaction, puis journal.
