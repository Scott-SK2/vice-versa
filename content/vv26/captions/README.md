# Sous-titres

Un fichier `VV-Vxx.<lang>.json` (segments et mots horodatés, format du cahier) et un fichier `VV-Vxx.<lang>.vtt` par clip et par langue (`fr`, `nl`, `en`), produits par `pnpm captions` **avant l'événement**, puis relus.

Chaîne (voir `docs/conception/07-contenus-et-medias.md` § 6) :

```bash
export GROQ_API_KEY=...                      # sur le poste de l'équipe, jamais sur le serveur
pnpm captions extract VV-V10 --in dist/VV-V10_appartement-membre.mp4   # ffmpeg → work/captions/VV-V10.flac
pnpm captions transcribe VV-V10              # Groq whisper-large-v3 → VV-V10.fr.json (status: auto) + .vtt
#   → relecture humaine obligatoire : corriger le texte, les noms, les passages en lingala,
#     puis passer "status": "reviewed" dans VV-V10.fr.json
pnpm captions translate VV-V10 --to nl,en    # modèle de langage, segment par segment → VV-V10.nl.json, VV-V10.en.json
#   → relecture des traductions (au minimum une vérification rapide), puis "status": "reviewed"
pnpm captions emit VV-V10                    # régénère les .vtt après toute modification manuelle
pnpm captions check                          # valide tous les fichiers et croise avec media.json
```

`prompt.txt` contient les noms propres soufflés à Whisper pour qu'ils soient bien orthographiés : ajouter les prénoms des intervenants avant de transcrire.

Un média vidéo ne peut passer `consent_status: granted` dans `media.json` que si ses trois langues sont présentes ici et déclarées dans son champ `captions` (`pnpm content:validate` le vérifie).
