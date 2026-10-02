# 08 — Tests, planning et critères d'acceptation

## 1. Stratégie de test

| Niveau | Outil | Périmètre |
|---|---|---|
| Unitaire | Vitest | Progression, complétion de station, matrice phase × écriture, machine à états des séances, normalisation des mots, filtre de mots interdits, validation `value` par type, agrégats, découpage des sous-titres NL/EN, génération des codes (alphabet, unicité) |
| API | Vitest + base PostgreSQL éphémère (Docker) | Chaque route de 04 : cas nominal, erreurs (`401/403/409/423/429`), concurrence (deux scans simultanés, deux réponses simultanées, deux lancements simultanés), changement de séance (`RUN_CHANGED`), réinitialisation, clôture avec `summary` |
| E2E | Playwright, viewport 360×780 (participant) et 1280×800 (admin), Chromium + WebKit | Parcours complet : accueil → Avant → scan de 3 stations (URL avec jeton et code court) → réponses → phase `apres` déclenchée par l'admin → Après → bilan → trace → merci ; console admin : créer, lancer, phases, modérer, projeter, stopper ; tablette prêtée : `/vv26/reset` |
| Charge | k6 | 80 utilisateurs virtuels, 30 min : création de session, polling 10 s, 8 scans, lecture simulée (requêtes de sous-titres), 10 réponses, 3 questions Après ; seuils : p95 < 300 ms sur l'API, 0 erreur 5xx |
| Appareils | Manuel, grille | iPhone Safari (deux générations), Android Chrome, Samsung Internet, tablette prêtée : scan par appareil photo natif, vidéo `playsinline`, plein écran, retour après verrouillage, sous-titres, saisie du code |
| Réseau | Manuel + Playwright `offline` | 4G bridée (DevTools « Slow 4G »), coupure de 20 s pendant une réponse → renvoyée automatiquement, réponse hors-ligne puis changement de phase → message clair |
| Sur place (9 oct.) | Répétition générale | Scan de chaque affiche à 1 m et 2 m en éclairage faible, Wi-Fi invités et 4G, séance de type `repetition` lancée puis stoppée, export vérifié |

Intégration continue (GitHub Actions) : lint, typecheck, unitaire, API, E2E Chromium, `content:validate`. Le déploiement sur le VPS se fait à la main (`docker compose pull && up -d`) après le feu vert de la CI ; **gel des déploiements à partir du 9 octobre 18 h**, hors correctif bloquant.

## 2. Scénarios de test des séances (nouveaux)

| ID | Scénario | Résultat attendu |
|---|---|---|
| T-S01 | Lancer une séance alors qu'une autre est live | `409 ANOTHER_RUN_LIVE`, message avec le nom de la séance live |
| T-S02 | Téléphone avec jeton de la séance A ; A stoppée, B lancée ; ouverture de l'app | Nouvelle session sur B, langue conservée, accueil affiché, aucune donnée de A visible |
| T-S03 | Téléphone avec jeton de A ; A stoppée, rien de live | Écran « Merci, l'atelier est terminé » |
| T-S04 | Scan d'un QR sans séance live | « Aucun atelier en cours », re-sonde toutes les 10 s, bascule automatique quand une séance est lancée |
| T-S05 | Stopper une séance live de type `live` | Confirmation par libellé, `summary` figé, écran Merci côté participants en < 15 s, écritures refusées `409 RUN_CLOSED` |
| T-S06 | Réinitialiser une séance de test avec 20 sessions | Compteurs à 0, phase `accueil`, les 20 téléphones repartent de zéro (`SESSION_UNKNOWN`) |
| T-S07 | Réinitialiser une séance `live` qui a des sessions | Refusé |
| T-S08 | Animateur tente Stopper / Lancer / Export | `403 FORBIDDEN`, boutons absents de l'interface |
| T-S09 | Modérateur tente de changer de phase | `403 FORBIDDEN` |
| T-S10 | Deux admins cliquent Lancer sur deux séances en même temps | Une seule passe `live` (index unique), l'autre reçoit `409` |
| T-S11 | Séance de test live | Bandeau « Séance de test » côté participant, titre d'onglet admin préfixé |
| T-S12 | Journal d'audit après une séance complète | Lignes `run.create`, `run.start`, `run.phase` ×5, `answer.moderate`, `slide.set`, `run.close`, `export`, chacune avec l'auteur |
| T-S13 | URL de projection d'une séance de test après lancement de la séance live | L'ancienne URL n'affiche que sa propre séance (clé différente), jamais la live |
| T-S14 | Rechargement du contenu après gel des jetons avec un `short_code` modifié | Refusé avec la liste des écarts |

## 3. Planning mis à jour (développement)

Le travail « séances + comptes » s'insère tôt : il structure le modèle de données et sert dès les premiers tests internes.

| Jour | Développement | Contenu et logistique (inchangé du cahier) |
|---|---|---|
| Ven 2 – sam 3 oct | Projet, Docker, modèle de données complet (y compris `runs`, `admin_*`), sessions participants, scan QR, **comptes admin + connexion + création / lancement / arrêt de séance (console minimale)**, première séance de test lancée | Valider la v3 ; réponses aux questions ouvertes ; brief aux témoins |
| Dim 4 – lun 5 oct | Pages de station, 7 types de questions, lecteur + sous-titres, carte SVG, progression, outbox hors-ligne | Tournage ; réception des vidéos de Kinshasa (lundi 5) |
| Mar 6 oct | Console de séance complète (phases, vue d'ensemble, projection), `/projection`, script Groq, export, `summary` | Montage ; transcription |
| Mer 7 oct | Traductions de l'interface, modération, comptes (gestion), journal, écran « Aucun atelier en cours », bandeau test, gel des jetons | Relecture sous-titres ; **jetons figés et affiches à l'impression** |
| Jeu 8 oct | Intégration des contenus, `media:check`, tests appareils, test de charge, correctifs | Consentements complets ; catalogue vérifié |
| Ven 9 oct | Corrections ; **répétition générale** avec une séance `repetition` lancée et stoppée depuis l'admin ; sauvegarde ; gel des déploiements 18 h | Pose des affiches, Wi-Fi, scan de chaque QR |
| Sam 10 oct | Astreinte ; dump avant lancement ; séance `live` lancée par un admin ; export le soir | Événement |

Charge estimée du périmètre « séances + comptes » : environ 1,5 jour-développeur sur l'ensemble, dont la moitié réutilise des écrans déjà prévus (tableau de bord, projection).

## 4. Critères d'acceptation

Les critères MVP-01 à MVP-15 du cahier restent inchangés. S'y ajoutent :

| ID | Critère |
|---|---|
| ADM-01 | Un compte admin se connecte avec e-mail et mot de passe ; le code d'accès partagé n'existe plus |
| ADM-02 | Un admin crée une séance, la lance, la fait avancer de phase, la stoppe ; chaque action apparaît dans le journal avec son nom |
| ADM-03 | Il est impossible d'avoir deux séances live pour le même événement, même en cliquant simultanément |
| ADM-04 | Après le lancement d'une nouvelle séance, un téléphone de la séance précédente repart de zéro sans manipulation |
| ADM-05 | Sans séance live, les QR mènent à « Aucun atelier en cours » et l'application bascule seule quand une séance est lancée |
| ADM-06 | Une séance stoppée n'accepte plus aucune écriture et conserve ses résultats agrégés et son export |
| ADM-07 | Une séance de test peut être réinitialisée ou supprimée sans toucher au contenu ni aux autres séances |
| ADM-08 | Un animateur ne peut ni lancer ni stopper ; un modérateur ne peut que modérer |
| ADM-09 | Les données affichées dans la console et en projection restent agrégées et anonymes, et les textes projetés sont tous validés |
| ADM-10 | Le rechargement du contenu après le gel des jetons ne peut pas changer un QR ou un code court |

## 5. Décisions à prendre par les organisateurs (complément du cahier)

| Question | Réponse par défaut appliquée si pas de décision le 3 octobre |
|---|---|
| Qui détient les comptes `admin` ? | Responsable technique + référent organisateur |
| L'animateur a-t-il son propre compte ? | Oui, rôle `animateur`, créé le 8 octobre |
| Nom de domaine | Sous-domaine de l'organisateur ; l'URL courte des affiches est `https://<domaine>/vv26/s/3` |
| Hébergeur | VPS Hetzner Falkenstein (UE) ; alternative Scaleway Paris |
| CDN | Bunny CDN zone de stockage Falkenstein |
| Que voit un participant quand la séance est stoppée ? | Écran « Merci » avec le nombre de stations explorées ; pas de bilan Avant/Après si la phase `apres` n'a jamais été atteinte |
