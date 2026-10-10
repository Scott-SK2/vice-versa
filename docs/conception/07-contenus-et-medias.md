# 07 — Contenus, QR codes, médias et sous-titres

Le back-office de contenu est hors MVP (cahier v3). Le contenu vit donc dans un **dossier versionné** `content/vv26/`, validé par schéma, chargé en base par un script ou par le bouton « Recharger » de l'admin. C'est la source de vérité ; la base n'en est qu'une copie indexée.

## 1. Arborescence

```
content/vv26/
├── event.json
├── stations.json
├── questions.json
├── media.json
├── consents.csv              # suivi des consentements (non chargé en base, sert à remplir media.json)
├── banned-words.txt          # un mot par ligne, FR/NL/EN, normalisés sans accents
├── map.svg
└── captions/
    ├── VV-V10.fr.json  VV-V10.fr.vtt
    ├── VV-V10.nl.json  VV-V10.nl.vtt
    └── VV-V10.en.json  VV-V10.en.vtt
```

## 2. Formats

### `event.json`

```json
{ "slug": "vv26", "name": "VICE VERSA — Deux regards, deux continents", "languages": ["fr", "nl", "en"], "default_lang": "fr", "required_stations": 8,
  "map": { "file": "map.svg", "width": 1000, "height": 1333 } }
```

### `stations.json`

```json
[
  { "code": "A", "position": 0, "slug": "accueil", "counts_in_progress": false,
    "title": { "fr": "Accueil", "nl": "Onthaal", "en": "Welcome" },
    "qr_token": "K4M7P2XQ", "short_code": "K4M7", "x_pct": 8, "y_pct": 50 },
  { "code": "1", "position": 1, "slug": "image-de-l-autre", "counts_in_progress": true,
    "title": { "fr": "L’image de l’autre", "nl": "Het beeld van de ander", "en": "The image of the other" },
    "intro": { "fr": "…", "nl": "…", "en": "…" },
    "qr_token": "7Q2M9XKD", "short_code": "7Q2M", "x_pct": 22, "y_pct": 30 }
]
```

### `questions.json`

```json
[
  { "key": "avant_futur", "phase": "avant", "type": "single_choice", "position": 1,
    "text": { "fr": "Si tu pouvais construire ton avenir n’importe où…", "nl": "…", "en": "…" },
    "choices": [ { "key": "afrique", "label": { "fr": "Afrique", "nl": "Afrika", "en": "Africa" } },
                 { "key": "europe", "label": { "fr": "Europe", "nl": "Europa", "en": "Europe" } },
                 { "key": "ailleurs", "label": { "fr": "Ailleurs", "nl": "Elders", "en": "Elsewhere" } },
                 { "key": "nsp", "label": { "fr": "Je ne sais pas", "nl": "Ik weet het niet", "en": "I don’t know" } } ] },
  { "key": "apres_futur", "phase": "apres", "type": "single_choice", "position": 1, "paired_with": "avant_futur",
    "text": { "fr": "Et maintenant : si tu pouvais construire ton avenir n’importe où…", "nl": "…", "en": "…" },
    "choices": "same_as_paired" },
  { "key": "s1_qui_parle", "phase": "station", "station": "1", "type": "guess_reveal", "required": true,
    "text": { "fr": "Qui parle ?", "nl": "Wie spreekt?", "en": "Who is speaking?" },
    "choices": [ { "key": "kinshasa", "label": { "fr": "Kinshasa", "nl": "Kinshasa", "en": "Kinshasa" }, "is_correct": true },
                 { "key": "belgique", "label": { "fr": "Belgique", "nl": "België", "en": "Belgium" }, "is_correct": false } ] },
  { "key": "s5_facteurs", "phase": "station", "station": "5", "type": "multi_choice", "min_choices": 2, "max_choices": 2, "…": "…" },
  { "key": "s6_tradition", "phase": "station", "station": "6", "type": "short_text", "max_length": 140, "…": "…" },
  { "key": "trace", "phase": "trace", "type": "short_text", "max_length": 140,
    "text": { "fr": "Après VICE VERSA, je repars avec…", "nl": "…", "en": "…" } }
]
```

### `media.json`

```json
[
  { "ref": "VV-V10", "station": "3", "type": "video", "position": 1,
    "file": "VV-V10_appartement-membre.mp4", "poster": "VV-V10.jpg", "duration_s": 56, "orientation": "portrait",
    "consent_status": "granted", "credits": "Groupe VICE VERSA, Kinshasa, sept. 2026",
    "captions": { "fr": { "status": "reviewed" }, "nl": { "status": "reviewed" }, "en": { "status": "auto" } } }
]
```

Les URL finales sont `MEDIA_BASE_URL + file`. Le script de chargement refuse un média `granted` dont un fichier de sous-titres manque dans une langue de l'événement.

## 3. Chargement et validation

- `pnpm content:validate` : schémas Zod, unicité des `code`/`key`/`qr_token`/`short_code`, chaque question `station` pointe une station existante, `paired_with` pointe une question `avant`, chaque langue de `event.json` présente dans tous les `*_i18n` (avertissement si repli FR), fichiers de sous-titres présents, mots interdits en minuscules.
- `pnpm content:seed` : upsert idempotent par `(event.slug, station.code)`, `(event.slug, question.key)`, `(question, choice.key)`, `(station, media.ref)`. Les suppressions dans `content/` désactivent (`active = false`) au lieu de supprimer, pour ne pas casser les réponses des séances passées.
- Le bouton « Recharger » de `/admin/content` exécute la même logique et affiche le diff avant application. Si `tokens_frozen_at` est posé et qu'un `qr_token`/`short_code` diffère, le rechargement est refusé avec la liste des écarts.

## 4. Génération des QR codes

Deux scripts :

1. `pnpm qr:tokens` : pour chaque station sans `qr_token`, tire un jeton de 8 caractères et un code court de 4 caractères (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, sans `0/O`, `1/I/L`), vérifie l'unicité, écrit dans `stations.json`. Il ne retire jamais un jeton existant : une régénération se fait en supprimant explicitement la valeur dans le fichier.
2. `pnpm qr:render --pdf` : génère `qr/<code>.png` (niveau de correction **H**, 1200 px, marge 4 modules) et `qr/<code>.svg` pour l'URL `APP_BASE_URL/vv26/s/<code>?k=<token>` ; pour l'accueil, l'URL `APP_BASE_URL/vv26`. Puis `qr/planche.html` et `qr/planche.pdf` : une page A4 par station (QR, repère, titre FR/NL/EN, URL courte, code à 4 caractères lisible à 2 m) et une page récapitulative pour les organisateurs. Le test `tests/unit/qr.test.ts` décode les PNG produits et vérifie l'URL.

Avant l'impression du 7 octobre : `APP_BASE_URL=https://<domaine> pnpm qr:render --pdf`, test de scan de chaque PNG sur iPhone et Android, **Geler les jetons** dans `/admin/content`, puis envoi de `qr/planche.pdf` à l'imprimeur.

## 5. Pipeline médias

Outillé par `pnpm media` (`scripts/media.ts`) :

| Étape | Commande | Ce qu'elle fait |
|---|---|---|
| Montage | Équipe éditoriale, 30–60 s par station | `source/<ref>.mp4` |
| Encodage | `pnpm media encode VV-V10 --in source/VV-V10.mp4 [--out public/media]` | `ffmpeg` selon le cahier : 720×1280 portrait (recadrage avec bandes si besoin), H.264 high 4.0 à 1,2 Mbit/s, 30 i/s, AAC 96 kbit/s, `loudnorm` −16 LUFS, `+faststart` ; poster JPEG extrait ; durée réécrite dans `media.json` ; nom de fichier tiré de `media.json` |
| Clip de test | `pnpm media sample --ref VV-V12` | Mire portrait + bip encodés par la même chaîne, avec sous-titres FR/NL/EN d'exemple : pour tester le lecteur sur de vrais téléphones avant les clips |
| Sous-titres | `pnpm captions …` puis `pnpm media sync-captions [--out public/media]` | Génération (§ 6) puis copie des `.json`/`.vtt` dans le dossier servi sous `MEDIA_BASE_URL/captions/` |
| Consentement | `pnpm media grant VV-V10` | Vérifie la ligne de `consents.csv` (consentement écrit ou message, autorisation de diffusion, accord parental si mineur) et la présence des trois langues de sous-titres, puis passe `consent_status: granted` et déclare les sous-titres dans `media.json`. `revoke` retire le média. |
| Publication | `rsync -av public/media/ serveur:~/vice-versa/deploy/data/media/` ou `rclone sync` vers le CDN | `Cache-Control: public, max-age=31536000, immutable` |
| Vérification | `pnpm media check [--dir …]` ou `MEDIA_BASE_URL=https://cdn… pnpm media check` | Chaque média publié : fichier, poster, sous-titres déclarés et présents ; en local `ffprobe` (H.264, 720×1280, durée) ; à distance en-têtes HTTP (`Content-Type`, requêtes de plage) |
| Chargement | `pnpm db:seed` ou « Recharger le contenu » dans la console | Les médias `granted` deviennent visibles dans les stations |

Le repli « médias locaux » (01 § 7) consiste à copier le dossier dans `deploy/data/media` (servi par Caddy sous `/media/`) et à mettre `MEDIA_BASE_URL=/media`.

Vérifié de bout en bout avec un clip de test : lecture sans autoplay, sélecteur FR/NL/EN, sous-titres mot à mot par-dessus l'image, progression envoyée à 25 / 50 / 80 %, station à média seul terminée à 80 % puis écran « Station terminée ».

## 6. Sous-titres

Chaîne exécutée **une fois, avant l'événement**, sur un poste de l'équipe (clé Groq hors application), par la commande `pnpm captions` (`scripts/captions.ts`, bibliothèque `src/lib/captions/`) :

| Étape | Commande | Ce qu'elle fait |
|---|---|---|
| 1. Extraction audio | `pnpm captions extract VV-V10 --in dist/VV-V10_….mp4` | `ffmpeg -ar 16000 -ac 1 -c:a flac` → `work/captions/VV-V10.flac` (≈ 1 Mo par minute) |
| 2. Transcription | `pnpm captions transcribe VV-V10` | Groq `whisper-large-v3`, `verbose_json`, horodatages par mot et par segment, `prompt.txt` pour les noms propres → `captions/VV-V10.fr.json` (`status: auto`) et `.vtt`. Refuse d'écraser un fichier déjà relu sans `--force`. |
| 3. Relecture humaine (obligatoire) | édition du `.fr.json` | Noms, mots mal entendus, passages en lingala transcrits par un locuteur puis traduits ; passer `"status": "reviewed"`. |
| 4. Traduction NL / EN | `pnpm captions translate VV-V10 --to nl,en` | Modèle de langage (Groq, `llama-3.3-70b-versatile` par défaut, tout point d'accès compatible OpenAI via `GROQ_API_BASE` / `TRANSLATE_MODEL`) : segments envoyés en JSON `{id, text}`, réponse JSON stricte avec les mêmes ids, horodatages conservés, mots répartis au prorata des caractères. Refuse une réponse incomplète. |
| 5. Relecture des traductions | édition des `.nl.json` / `.en.json` | Au minimum une vérification rapide ; `"status": "reviewed"`. |
| 6. Génération des fichiers | `pnpm captions emit VV-V10` | Régénère les `.vtt` après toute modification manuelle. |
| 7. Vérification | `pnpm captions check` | Valide chaque fichier (schéma, ids, chronologie, mots dans leur segment, `.vtt` présent) et croise avec `media.json` (langues déclarées, statuts). `pnpm content:validate` refuse un média dont un fichier de sous-titres déclaré manque. |

Format `captions.<lang>.json` : celui du cahier (`media`, `lang`, `source`, `status`, `segments[{id,start,end,text,words[{w,start,end}]}]`), validé par `src/lib/captions/schema.ts`. Le lecteur regroupe les mots par 3 au moment de l'affichage ; pour NL/EN, les horodatages de mots viennent de la répartition proportionnelle.

Le lecteur ne dépend que de ces fichiers statiques : si Groq est remplacé par `faster-whisper` en local (même format `verbose_json`), seule la variable `GROQ_API_BASE` change. Les tests `tests/unit/captions.test.ts` couvrent le format, la répartition, le VTT et les appels (serveur simulé).

## 7. Consentements

`consents.csv` : `media_ref, personnes_reconnaissables, consentement (ecrit|message|aucun), mineur, accord_parent, logos_partenaires, autorisation_diffusion, autorisation_reseaux, date, note`. Règle d'or : `media.json.consent_status = granted` uniquement si la ligne est complète ; le script `content:validate` croise les deux fichiers et liste les médias `pending` qui seraient exclus de l'application.
