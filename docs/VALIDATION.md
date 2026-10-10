# Validation

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
