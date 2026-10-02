# VICE VERSA — Dossier de conception technique

Ce dossier traduit le **Cahier de concept fonctionnel v3** (2 octobre 2026) en une conception prête à développer. Il ajoute une exigence nouvelle par rapport au cahier : **des comptes administrateur qui créent, lancent, pilotent, stoppent et réinitialisent des séances**, parce que l'atelier sera joué plusieurs fois (tests internes, répétition générale du 9 octobre, événement du 10 octobre, éditions futures).

En cas d'écart entre ce dossier et le cahier, le cahier prime sur le **fonctionnel participant** ; ce dossier prime sur **l'architecture, le modèle de données, l'API et l'administration**.

## Sommaire

| Fichier | Contenu |
|---|---|
| [01-architecture.md](01-architecture.md) | Vue d'ensemble, stack, hébergement, arborescence, configuration, exploitation |
| [02-seances-et-cycle-de-vie.md](02-seances-et-cycle-de-vie.md) | Concepts (Événement, Séance, Session participant), machines à états, règles de gestion |
| [03-modele-de-donnees.md](03-modele-de-donnees.md) | Schéma PostgreSQL complet (DDL), index, invariants |
| [04-api.md](04-api.md) | Contrats API participant, projection et administration ; erreurs ; limites de débit |
| [05-frontend.md](05-frontend.md) | Routes, écrans, composants, lecteur vidéo et sous-titres, polling, hors-ligne, i18n |
| [06-admin-securite-rgpd.md](06-admin-securite-rgpd.md) | Comptes et rôles, authentification, écrans d'administration, sécurité, données personnelles |
| [07-contenus-et-medias.md](07-contenus-et-medias.md) | Dossier de contenu versionné, format JSON, génération des QR, pipeline médias et sous-titres |
| [08-tests-et-livraison.md](08-tests-et-livraison.md) | Stratégie de test, test de charge, planning mis à jour, critères d'acceptation |

## Glossaire (à utiliser tel quel dans le code)

| Terme (doc) | Nom dans le code | Définition |
|---|---|---|
| Événement | `Event` | Le contenu configuré : stations, questions, médias, QR, langues. Un seul pour 2026 : `vv26`. Stable entre les séances. |
| **Séance** | `Run` | **Une exécution de l'atelier** (un test, la répétition, le jour J). Porte la phase en cours, les sessions participants et les réponses. C'est ce que l'organisateur appelle « une session » quand il parle de lancer ou stopper. |
| Session participant | `ParticipantSession` | Le jeton anonyme d'un téléphone pendant une séance. Rattachée à une séance, jamais à l'événement directement. |
| Phase | `Run.phase` | `accueil`, `parcours`, `apres`, `discussion`, `trace`, `cloture`. Pilotée à la main depuis le tableau de bord. |
| Station | `Station` | Les 8 stations thématiques plus les repères A (accueil) et Z (clôture). Le mot « spot » du cahier v2 n'existe plus, y compris dans les routes. |
| Compte admin | `AdminUser` | Compte nominatif avec mot de passe, rôle `admin`, `animateur` ou `moderateur`. |

## Décisions structurantes (résumé)

1. **Une séance = un conteneur isolé** de sessions et de réponses. On peut en créer autant qu'on veut ; une seule peut être `live` à la fois pour un événement donné.
2. **Les affiches QR ne changent jamais** entre les séances : les jetons appartiennent à l'événement, pas à la séance. Un scan rejoint automatiquement la séance `live` du moment.
3. **Un téléphone qui a participé à une séance précédente repart de zéro** quand une nouvelle séance est lancée : le serveur répond `409 RUN_CHANGED`, le client jette son jeton et en recrée un. Aucun nettoyage manuel sur les tablettes prêtées.
4. **Stopper = clôturer** : la séance passe en `closed`, plus aucune écriture n'est acceptée, les agrégats sont figés dans `runs.summary`, les participants voient l'écran « Merci ». On ne rouvre pas une séance `live` clôturée ; on en crée une autre. Les séances de test peuvent être rouvertes ou purgées.
5. **Comptes nominatifs** (e-mail + mot de passe, Argon2id, session serveur en cookie `httpOnly`) remplacent le « code d'accès animateur » du cahier. Trois rôles. Un journal d'audit trace chaque action de pilotage.
6. **Monolithe Next.js + PostgreSQL**, déployé en Docker sur un VPS européen, médias statiques derrière un CDN. Pas de WebSocket pour le 10 octobre : polling toutes les 10 s (MVP-12 exige moins de 15 s).
7. **Le jour J, aucune dépendance externe en chemin critique** : pas d'IA, pas de service tiers hors CDN et base de données.
