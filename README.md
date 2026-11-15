# Sunkeeper — La cloche du dernier soleil

Un jeu d'action-plateforme original dans l'esprit des grands jeux Super Nintendo de fin de vie.
Il tourne dans le navigateur et sur Android.

Ione, dernière gardienne des cloches, traverse cinq royaumes pour reprendre les cinq éclats
de la Cloche-Soleil et ramener le jour.

## Contenu

- **5 royaumes** : Bois de Mousseveille, Aqueduc Englouti, Dunes de Verre, Flèche des Rouages,
  Citadelle de l'Éclipse. Chacun a son décor peint, sa parallaxe, sa musique et son effet de
  lignes de balayage (eau ondulante, mirage de chaleur, rouages en rotation, éclipse).
- **15 ennemis**, 3 par royaume, chacun avec son comportement : patrouille, vol sinusoïdal,
  tir en cloche, bouclier frontal, chute du plafond, piqué, téléportation, tourelle, saut,
  roue, chevalier qui charge, œil à projectiles à tête chercheuse, molosse.
- **5 boss** : le Sanglier-Scarabée (carapace, vulnérable quand il est étourdi), l'Anguille
  des Cloches (serpent segmenté qui jaillit de l'eau), le Colosse de Verre (mains à briser,
  laser balayant), l'Horloge (aiguilles rotatives mortelles, cœur qui s'ouvre), le Roi de
  l'Éclipse (deux phases, la seconde avec motifs de projectiles).
- **Capacités gagnées** auprès des gardiens, qui changent la façon de jouer : double saut,
  dash, saut mural, tir solaire chargé.
- **Carte du monde en Mode 7** : survol en planeur d'une mer et de cinq îles, avec perspective
  et brouillard de distance.
- **Secrets** : 15 motes solaires cachées (murs friables, faux murs, corniches hautes) et des
  vases de cœur qui augmentent les PV max.
- **13 morceaux** : titre, carte, 5 thèmes de royaume, boss, boss final, victoire, fin,
  game over, sanctuaire. Ils sont joués par un synthé façon SPC700 (tables d'ondes, ADSR,
  écho à rétroaction filtré).
- **Combat** : combo à 3 coups, attaque aérienne, coup vers le haut, coup plongeant qui
  rebondit sur les ennemis et les pics, projectiles renvoyables à l'épée, hit-stop et
  secousses d'écran.

## Jouer

### Navigateur
Servez le dossier avec n'importe quel serveur statique, puis ouvrez `index.html` :

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

| Action | Clavier | Manette |
|---|---|---|
| Bouger | Flèches / WASD | Croix / stick |
| Sauter (Bas+Saut : traverser une corniche) | Z / Espace | A |
| Épée (Haut / Bas en l'air pour varier) | X | X |
| Dash | C / Maj | B / R |
| Tir solaire (maintenir pour charger) | V | Y / L |
| Start / pause | Entrée | Start |

Sur écran tactile, une croix et quatre boutons s'affichent automatiquement.
`F` passe en plein écran, `M` coupe le son, `F2` affiche les FPS.

### Android
Le dossier `android/` contient une application Android en Kotlin :
- plein écran immersif en paysage ;
- manettes physiques (croix, sticks, gâchettes) ;
- vibrations ;
- pause avec le bouton Retour et quand on quitte l'application ;
- écran maintenu allumé ;
- fonctionnement 100 % hors ligne.

Le moteur du jeu est le même code que la version web. Il est embarqué dans l'APK et servi
localement par `WebViewAssetLoader`.

- **APK prêt à installer** : le workflow GitHub Actions `Android APK` compile un APK debug et
  un APK release à chaque push. Il se télécharge dans l'onglet *Actions* → dernière exécution
  → artefact `sunkeeper-apk`.
- **En local** : `cd android && ./gradlew assembleDebug` (avec Android SDK), ou ouvrez le
  dossier `android/` dans Android Studio.

## Comment c'est fait

Tout est généré par le code, sans aucun fichier image ni son :

- `src/ppu.js` — modèle de l'unité graphique SNES. Tampon 256×224, effets par ligne de
  balayage façon HDMA, color math (addition), luminosité maître, mosaïque, fenêtre circulaire
  et rendu **Mode 7** (plan affine en perspective).
- `src/gfx.js` — un petit modeleur 3D par champs de distance (SDF) : sphères, ellipsoïdes,
  capsules, boîtes, cylindres et tores, avec union lisse. Il rend chaque pose en sprite
  éclairé, avec dégradés de couleur décalés en teinte, tramage Bayer et contours sélectifs.
  C'est l'équivalent du « rendu station de travail → sprites » des jeux de fin de vie.
- `src/art/` — modèles d'Ione (plus de 30 poses), des ennemis, des boss, et le peintre de
  terrain qui ombre chaque pixel selon sa distance à l'air libre.
- `src/levelgen.js` — niveaux assemblés à partir de segments conçus à la main. Chaque segment
  respecte l'enveloppe de saut des capacités déjà acquises, et la génération est figée par
  une graine.
- `src/audio.js`, `src/music.js` — synthé et séquenceur. Les morceaux sont écrits comme
  grilles d'accords + mélodies, et l'accompagnement est généré par motifs.
- `tools/playtest.mjs` — un bot qui joue chaque niveau du début à la fin, affronte chaque
  boss et mesure le coût par image (moins de 1 ms en moyenne, soit plus de 15 fois la marge
  à 60 Hz).

```bash
node tools/playtest.mjs all     # bot de test (Playwright requis)
node tools/smoke.mjs <dossier>  # captures d'écran de chaque scène
node tools/print-levels.mjs     # affiche les niveaux en ASCII
```
