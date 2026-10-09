# Releases

Le dépôt cible est `valentinhttr/gladys-meteoswiss` et l’image est `ghcr.io/valentinhttr/gladys-meteoswiss`.

## Première publication

1. Créer un dépôt GitHub **public** sous ce nom, puis y pousser le projet sur `main`.
2. Activer GitHub Actions et les permissions nécessaires : `contents: write`, `packages: write`. Une protection de `main` bloquant les pushes du bot doit autoriser ce workflow, ou être adaptée au processus choisi.
3. Dans **Actions → Release → Run workflow**, sélectionner `main` et **initial**. La version préparée sera `1.0.0`.
4. Après publication, ouvrir le package GitHub Container Registry et rendre sa visibilité **Public**. GitHub peut créer le premier package privé même si le dépôt est public. Vérifier qu’un `docker pull ghcr.io/valentinhttr/gladys-meteoswiss:1.0.0` fonctionne depuis un environnement sans identifiants GHCR avant de proposer l’installation dans Gladys.
5. Ajouter le topic GitHub `gladys-assistant-integration` au dépôt pour le référencement automatique dans le catalogue Gladys, conformément au guide développeur.

Le code local est prêt à être publié, mais un manifeste versionné ne suffit pas : l’image doit exister et être accessible anonymement. Ni la création du dépôt distant, ni un push, ni une release ne sont réalisés par les scripts de développement.

## Versions suivantes

Écrire des commits explicites, de préférence au format Conventional Commits :

```text
feat: add a forecast widget
fix: preserve Swiss dates at midnight
feat!: change a configuration field
docs: improve installation instructions
```

Relancer **Release** avec `patch`, `minor` ou `major` selon l’impact. La sélection est manuelle ; elle n’est pas déduite automatiquement des commits. Les commits avec `!` sont regroupés dans « Breaking changes / Changements incompatibles ». Les autres sont répartis entre fonctionnalités, corrections et maintenance. Les sujets de commit sont conservés dans leur langue d’origine ; ils ne sont pas traduits automatiquement.

Le workflow :

1. Installe les dépendances verrouillées, vérifie le manifeste, le style, les tests et les avis de sécurité des dépendances de production.
2. Met à jour `package.json`, `package-lock.json`, la version et l’image du manifeste.
3. Génère l’entrée `CHANGELOG.md` et les notes de cette seule release depuis les commits postérieurs au dernier tag.
4. Crée le commit et le tag localement, puis construit et publie les images `linux/amd64` et `linux/arm64` (Node.js 24 Alpine ne fournit pas d’image ARMv7).
5. Une fois l’image disponible, pousse **atomiquement** le commit sur `main` et le tag `vX.Y.Z`, puis crée la GitHub Release avec les notes.

Le manifeste pointe vers une version précise, jamais `latest`. Une seule release s’exécute à la fois. Le build est dans le même workflow : il ne dépend pas du déclenchement d’un autre workflow par un tag créé avec `GITHUB_TOKEN`.

## Échecs et reprise

- **Tests/build en échec** : pas de nouveau manifeste ni tag distant ; corriger et relancer.
- **Push refusé** (protection de branche ou nouveau commit concurrent) : le manifeste distant n’a pas changé. Corriger la permission ou repartir du dernier `main`, puis relancer. Une image non référencée peut déjà exister pour la version préparée.
- **Création de GitHub Release en échec après le push** : le tag et le changelog existent déjà. Créer la release depuis ce tag, avec la section correspondante du changelog. Ne pas refaire un bump uniquement pour réparer cette page.
- **Image inaccessible dans Gladys** : vérifier d’abord la visibilité publique du package et le tag du manifeste.

Changer de dépôt : `npm run setup:repository -- autre-compte/gladys-meteoswiss`, puis adapter les liens de documentation. Le workflow utilise automatiquement `GITHUB_REPOSITORY` pour les images suivantes.

## English quick guide

Create the public repository, push `main`, enable Actions write permissions, then run **Release → initial**. Make the GHCR package public and verify anonymous pulls. Add the `gladys-assistant-integration` repository topic for catalog discovery.

Use Conventional Commit subjects and select patch/minor/major manually for subsequent releases. The workflow synchronizes versions, generates the changelog, publishes the multiarchitecture image, atomically pushes the release commit/tag, and creates the GitHub Release. A failed image build never advances the public manifest. If only release-page creation fails, create it from the existing tag and changelog entry.
