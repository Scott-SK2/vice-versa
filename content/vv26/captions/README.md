# Sous-titres

Un fichier `VV-Vxx.<lang>.json` (segments et mots horodatés, format du cahier § « Format des sous-titres ») et un fichier `VV-Vxx.<lang>.vtt` par clip et par langue (`fr`, `nl`, `en`), produits par `scripts/captions/` avant l'événement, puis relus.

Un média vidéo ne peut passer `consent_status: granted` dans `media.json` que si ses trois langues sont présentes ici (`pnpm content:validate` le vérifie).
