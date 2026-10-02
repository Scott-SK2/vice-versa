# Médias publiés

Ce dossier est servi tel quel sous `/media/` par l'hébergeur (Render, Vercel ou Caddy). Il contient le plan (`map.svg`), les vidéos encodées, les posters et les sous-titres, **avec exactement les noms définis dans `content/vv26/media.json`**.

- Liste de ce qui est attendu et de ce qui manque : `pnpm media list`
- Encoder un clip source : `pnpm media encode VV-V10 --in source/VV-V10.mp4` (écrit ici la vidéo et le poster)
- Sous-titres : `pnpm captions …` puis `pnpm media sync-captions` (copie `captions/VV-V10.<lang>.json` et `.vtt` ici)
- Publier : ligne dans `content/vv26/consents.csv`, `pnpm media grant VV-V10`, `pnpm media check`, puis `git add public/media content && git commit && git push`

Taille indicative : 7 Mo par clip de 45 s ; ne pas dépasser 100 Mo par fichier (limite GitHub).
