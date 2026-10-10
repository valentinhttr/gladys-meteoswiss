# Validation

## Alertes officielles — 10 octobre 2026

- `npm test` : **63 tests réussis**, dont 13 nouveaux tests pour le flux officiel, les régions, le ciblage par maison, les seuils par scène, les alertes futures, l’escalade, l’expiration, les erreurs, la reprise, la persistance et les rafraîchissements natifs différés. Les tests utilisent le SDK npm 0.14.0 avec ses entrées/sorties substituées.
- `npm run check` et `git diff --check` : réussis. Le manifeste et ses traductions comprennent le déclencheur `official_warning` ; les versions de publication restent synchronisées.
- `npm audit --omit=dev` : aucune vulnérabilité de production signalée.
- Image locale `gladys-meteoswiss:official-warnings-check` construite avec Node.js 24 Alpine. Chargement des modules d’alertes et des régions vérifié sans réseau, sans droits root et avec racine en lecture seule.
- Contrôle réel du flux web le 10 octobre 2026 à 15:29 UTC : format actif `v3`, publication `20261010_1429`, prochaine vérification de l’index prévue après 60 secondes. Les fichiers français et anglais sont accessibles. Les réponses pour Lausanne, Zurich et Genève contiennent une liste vide d’alertes météo confirmées retenues. Le contrôle n’a pas attendu le cycle suivant : le délai a été vérifié dans `nextCheck` et dans les tests.
- Import des 491 polygones de la carte officielle, avec URL source conservée dans `src/data/warning-regions.json`. Points représentatifs vérifiés pour Lausanne, Zurich, Genève et Berne ; coordonnées extérieures et limites partagées couvertes par les tests.
- Aucun épisode météo actif ni notification sur une instance Gladys réelle n’a été observé durant ce contrôle. Les alertes actives, annulations et escalades sont simulées. Le délai d’environ une à deux minutes est une estimation fondée sur le cycle local et le cache amont de 60 secondes, pas une mesure de bout en bout ni une garantie.
- Aucune nouvelle release, image distante ou étiquette de version publiée pour cette implémentation.

## Maintenance et génération des releases — 10 octobre 2026

- `npm test` : **50 tests réussis**, dont 8 tests de release exécutés dans des dépôts Git temporaires.
- Couverture : notes en anglais, liens vers les commits, attribution Git/GitHub, génération initiale/patch/minor/major, détection des changements incompatibles et refus des versions trop petites. Les appels GitHub des tests sont simulés, sans réseau.
- `npm run check` et `git diff --check` : réussis.
- Aucun nouveau tag, aucune image et aucune release publiés pour cette modification de l’outillage.

## Déclencheurs de scènes — 10 octobre 2026

- `npm test` : **43 tests réussis**, dont 17 tests couvrant les seuils, les périodes, les réglages indépendants par scène, le contrat SDK, les données manquantes, la persistance, les reprises et la limitation des événements.
- `npm run check` et `git diff --check` : manifeste, traductions, versions, syntaxe, formatage et espaces validés.
- `npm audit --omit=dev` : aucune vulnérabilité signalée dans les dépendances de production lors de la préparation.
- Pas de recette sur une instance Gladys réelle : les tests utilisent le SDK installé avec ses entrées/sorties substituées.

## Validation initiale du 9 octobre 2026

### Vérifications exécutées

- `npm test` : **22 tests réussis**, dont les commandes du SDK npm 0.14.0 et les releases initiale/patch dans un dépôt Git temporaire.
- `npm run check` : manifeste validé avec le schéma Gladys conservé dans le projet, versions synchronisées, traductions présentes, syntaxe JavaScript et formatage corrects.
- Audit npm : **aucune vulnérabilité connue signalée** pour les versions verrouillées au moment de la vérification.
- `docker build -t gladys-meteoswiss:local .` : image construite avec succès.
- API officielle en direct : Lausanne et Zurich, unités métriques et américaines, 24 heures et 8 jours par résultat. Les trois widgets passent la validation SDK en français et en anglais.

### Mesures ponctuelles

| Environnement                             | Temps de chargement | Pic RSS |
| ----------------------------------------- | ------------------: | ------: |
| Node.js 22 local                          |              10,9 s | 128 Mio |
| Node.js 24 dans Docker, 0,5 CPU / 256 Mio |              24,0 s | 104 Mio |

Le conteneur a tourné sans droits root, avec racine en lecture seule, toutes les capacités Linux retirées, `no-new-privileges` et un espace `/data` accessible à son utilisateur. Les mesures portent sur deux localités dans une même ingestion des fichiers nationaux ; elles dépendent du matériel, de la connexion et des publications disponibles. Elles ne constituent pas une garantie de performances sur Raspberry Pi.

### Non exécuté

- Recette visuelle et installation complète sur une instance Gladys réelle.
- Publication GitHub/GHCR et téléchargement anonyme de l’image publiée.
- Exécution réelle du workflow GitHub Actions et build croisé de toutes les architectures ; l’image de base a été vérifiée pour AMD64 et ARM64, et le build local a réussi.

La première publication doit suivre [RELEASING.md](RELEASING.md), notamment la visibilité publique du package GHCR.
