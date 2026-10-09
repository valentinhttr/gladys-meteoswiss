# Architecture

## Contrats

- `src/index.js` : point d’entrée, SDK officiel, statut fournisseur et signaux de rafraîchissement.
- `src/integration.js` : commandes météo/widgets, maisons et limite de réponse de 12 secondes, sous les 15 secondes accordées par Gladys.
- `src/provider.js` : recherche d’une publication complète, ingestion, cache, préchargement et reprises.
- `src/http.js` : accès limité au domaine officiel et CSV Latin-1 en flux.
- `src/locations.js` : résolution locale des coordonnées vers les points postaux officiels.
- `src/forecast.js` : format pivot Gladys, unités, périodes et codes météo.
- `src/widgets.js` / `src/i18n.js` : contenu déclaratif et textes bilingues.

Le widget météo natif consomme `onWeatherGet`. Les quatre widgets déclarés au manifeste consomment `onWidgetGet` : une liste des huit jours et trois graphiques horaires. Aucun appareil factice ni capteur n’est créé. L’accès `location: true` sert à précharger les maisons et à choisir celle des widgets supplémentaires ; les commandes météo natives contiennent déjà les coordonnées.

Le réglage `location` de chaque widget prend priorité sur `house`. La ville ou le NPA est résolu localement dans les métadonnées postales officielles, sans géocodage tiers. Les noms sont comparés sans accents, sans distinction de casse, avec espaces/tirets normalisés. Une ville comportant plusieurs NPA utilise le plus petit NPA ; un NPA partagé entre des localités de noms différents demande une précision. Une erreur de saisie ne revient jamais à la maison. Le cache est indexé par le point officiel, donc les noms et NPA menant au même point partagent les données.

La liste hebdomadaire utilise `card-list` en mode `list`, sans défilement interne. Les jours sont formatés dans le fuseau suisse. Les champs `date` sont omis car Gladys les afficherait à la place des sous-titres contenant les températures et précipitations. Le contrat Gladys ne permet pas de lien dans les titres ; les boutons de site sont retirés et le lien est disponible dans la configuration, avec attribution dans chaque widget.

## Données

Collection : `ch.meteoschweiz.ogd-local-forecasting`.

| Paramètre               | Usage                                               | Unité source |
| ----------------------- | --------------------------------------------------- | ------------ |
| `tre200h0`              | Température horaire                                 | °C           |
| `jww003i0`              | Condition sur les 3 heures précédentes, pas horaire | code         |
| `rre150h0`              | Précipitations horaires                             | mm           |
| `fu3010h0`              | Vent horaire                                        | km/h         |
| `fu3010h1`              | Rafales horaires                                    | km/h         |
| `dkl010h0`              | Direction du vent                                   | degrés       |
| `tre200pn` / `tre200px` | Minimum / maximum du jour local                     | °C           |
| `jp2000d0`              | Condition diurne du jour                            | code         |
| `rka150p0`              | Précipitations du jour local                        | mm           |

Le couple `(point_type_id, point_id)` identifie une localité. Le seul `point_id` n’est pas unique. Toutes les séries d’un instantané proviennent du même run. Les valeurs absentes et sentinelles ne deviennent pas des zéros. Les paramètres non fournis restent absents du résultat. La probabilité sur trois heures n’est pas présentée comme une probabilité horaire.

La lecture progressive conserve seulement les localités nécessaires. Aucun téléchargement en parallèle ni extraction d’archive. Les requêtes et lectures ont un délai maximal de 90 secondes, s’exécutent en arrière-plan et sont annulées à l’arrêt. Les tentatives après erreur vont de 1 à 15 minutes avec jitter. Les demandes Gladys ne déclenchent pas une nouvelle rafale de téléchargements pendant ce délai.

Le cache disque est facultatif à l’exécution : si `/data` n’est pas accessible à l’utilisateur du conteneur, un avertissement est journalisé et le cache mémoire fonctionne. Gladys doit fournir un volume `/data` accessible en écriture pour conserver les prévisions entre redémarrages. Aucune écriture n’est nécessaire ailleurs dans le conteneur.

## Vérification et limites

Le schéma `test/fixtures/manifest.schema.json` vient du cœur Gladys, consulté le 9 octobre 2026. Le paquet npm SDK **0.14.0** est la référence d’exécution : GitHub `main` contient déjà des aides de tests absentes du paquet publié. Notre adaptateur de test utilise donc le SDK installé et substitue uniquement ses entrées/sorties.

Les composants de chaque widget passent par `validateWidgetContent` dans les tests, en français/anglais et unités métriques/américaines. Le test réseau optionnel vérifie Lausanne et Zurich et rapporte le temps de chargement et le pic mémoire. La CI ne télécharge pas les données nationales.

L’attribution apparaît dans les widgets supplémentaires et la configuration. Le format pivot météo ne possède pas de champ d’attribution ; aucun champ non reconnu n’y est ajouté.
