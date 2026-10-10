# Architecture

## Contrats

- `src/index.js` : point d’entrée, SDK officiel, statut fournisseur et signaux de rafraîchissement.
- `src/integration.js` : commandes météo/widgets, maisons et limite de réponse de 12 secondes, sous les 15 secondes accordées par Gladys.
- `src/provider.js` : recherche d’une publication complète, ingestion, cache, préchargement et reprises.
- `src/http.js` : accès limité au domaine officiel et CSV Latin-1 en flux.
- `src/locations.js` : résolution locale des coordonnées vers les points postaux officiels.
- `src/forecast.js` : format pivot Gladys, unités, périodes et codes météo.
- `src/scenes.js` : seuils de prévisions par maison, transitions de risques et état persistant.
- `src/warnings.js` : client indépendant du flux officiel, versions, cache HTTP, validation et format pivot des alertes.
- `src/warning-regions.js` / `src/data/warning-regions.json` : rattachement local aux régions de la carte officielle.
- `src/warning-scenes.js` : nouvelle alerte, hausse du degré, déduplication persistante et capacité d’envoi réservée.
- `src/widgets.js` / `src/i18n.js` : contenu déclaratif et textes bilingues.

Le widget météo natif consomme `onWeatherGet`. Les trois widgets déclarés au manifeste consomment `onWidgetGet` : température, précipitations et vent sur 24 heures. Les prévisions sur huit jours restent fournies au widget météo natif. Aucun appareil factice ni capteur n’est créé. L’accès `location: true` sert à précharger les maisons et à choisir celle des widgets supplémentaires ; les commandes météo natives contiennent déjà les coordonnées.

Le réglage `location` de chaque widget prend priorité sur `house`. La ville ou le NPA est résolu localement dans les métadonnées postales officielles, sans géocodage tiers. Les noms sont comparés sans accents, sans distinction de casse, avec espaces/tirets normalisés. Une ville comportant plusieurs NPA utilise le plus petit NPA ; un NPA partagé entre des localités de noms différents demande une précision. Une erreur de saisie ne revient jamais à la maison. Le cache est indexé par le point officiel, donc les noms et NPA menant au même point partagent les données.

Les graphiques utilisent un titre limité à la localité et un sous-titre `caption` pour la source et l’heure des prévisions. Gladys affiche ce sous-titre en petit et grisé. Le lien vers le site est disponible dans la configuration.

## Données

Les quatre déclencheurs de prévisions utilisent `publishSceneEvent` du SDK 0.14.0. Le filtre `house` est un sélecteur dynamique `source: "houses"`, comparé au `selector` de `getHouses()`. Les champs `threshold_choice` et `horizon_choice` sont des listes obligatoires avec valeurs par défaut dans chaque déclencheur. Les filtres de scènes comparent des valeurs exactes et ne transmettent pas leurs règles au fournisseur : celui-ci surveille donc toutes les combinaisons finies proposées au manifeste. Chaque événement porte les deux choix sous forme de chaînes pour le filtrage et les valeurs numériques `threshold` / `horizon_hours` pour les actions. Aucun seuil partagé n’est défini dans `config_schema`. Aucun appareil supplémentaire n’est créé.

Les évaluations s’exécutent après les actualisations, au préchargement des maisons toutes les 15 minutes et lors des reprises après limitation de débit. Elles lisent le cache via `provider.get`, sans ajouter de téléchargement dédié. Elles sont sérialisées et suspendues pendant une déconnexion. Pour chaque risque, toutes les heures de la période doivent être présentes et le paramètre concerné fini. Les rafales du format pivot métrique (m/s) sont reconverties en km/h. Les valeurs exposées sont celles de la première heure atteignant le seuil, pas les extrêmes de la période.

Une transition inactive → active publie un événement, confirmé avant d’enregistrer l’état dans `/data/scene-state.json` par remplacement atomique. Une période complète sans risque réarme le déclencheur ; les erreurs et données périmées ne le réarment pas. L’identité inclut la maison, ses coordonnées, le déclencheur, son seuil et la période. Les états des maisons supprimées et des anciennes coordonnées sont purgés. La surveillance est par combinaison, pas par scène : créer une scène ne rejoue pas un événement déjà émis pour cette combinaison. L’état mémoire reste utilisable si le disque échoue. La livraison n’est pas exactement une fois : une réponse HTTP perdue ou un arrêt entre acceptation et persistance peut entraîner un doublon. L’arrêt attend l’évaluation en cours et empêche de nouvelles publications.

Les tentatives d’envoi sont limitées à 240 par minute glissante, sous la limite du cœur de 300. Le surplus est réévalué après une minute à partir des prévisions courantes, sans file d’événements périmés. Le timer de reprise est annulé à l’arrêt.

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

La lecture progressive conserve seulement les localités nécessaires. Les fichiers nationaux ne sont pas téléchargés en parallèle et aucune archive n’est extraite. Les requêtes et lectures ont un délai maximal de 90 secondes, s’exécutent en arrière-plan et sont annulées à l’arrêt. Les tentatives après erreur vont de 1 à 15 minutes avec jitter. Les demandes Gladys ne déclenchent pas une nouvelle rafale de téléchargements pendant ce délai.

Le cache disque est facultatif à l’exécution : si `/data` n’est pas accessible à l’utilisateur du conteneur, un avertissement est journalisé et le cache mémoire fonctionne. Gladys doit fournir un volume `/data` accessible en écriture pour conserver les prévisions entre redémarrages. Aucune écriture n’est nécessaire ailleurs dans le conteneur.

## Alertes officielles

Le cinquième déclencheur, `official_warning`, possède les filtres `house`, `phenomenon` et `minimum_level` dans la scène. Pour chaque alerte confirmée, il émet une combinaison par degré minimum atteint. La réception déclenche immédiatement, même avant le début de validité. L’identité inclut la maison, ses coordonnées, le phénomène, le début et le seuil choisi. Le maximum déjà envoyé est conservé : une hausse déclenche à nouveau, une baisse ou une modification de texte/fin reste silencieuse. L’absence confirmée ou l’expiration purge l’épisode ; l’indisponibilité du flux conserve son état. La persistance réutilise le mécanisme atomique de `SceneTriggers`, dans un fichier distinct `warning-scene-state.json`.

Le client consulte les index de version du produit public `danger/v3` au démarrage puis toutes les 60 secondes, en respectant les caches amont. Il vérifie que le format actif reste `v3`, télécharge uniquement les nouvelles versions des deux fichiers `dangers.json` français/anglais et conserve leurs descriptions. Les validateurs HTTP sont engagés après validation des deux fichiers. Les requêtes sont limitées à 15 secondes et 2 Mo, sans redirection ; les réponses 429/503 respectent Retry-After. Un échec entraîne des reprises après 1, 2, 4, puis 5 minutes. Les données deviennent indisponibles après trois minutes sans contrôle réussi de l’index, indépendamment de la date du dernier bulletin modifié. Aucun bulletin ancien n’est restauré au démarrage.

Le client est indépendant du fournisseur de prévisions. Les maisons sont rechargées chaque minute sans attendre les fichiers nationaux. Les régions simplifiées de la carte officielle sont embarquées et vérifiées localement ; les coordonnées ne sont pas transmises au site météo. Seuls vent, orages, pluie, neige, chaussées glissantes, canicule et gel, confirmés aux degrés 2–5, sont retenus. Préalertes, lacs/aérodromes et dangers d’autres organismes sont exclus.

Les alertes utilisent une capacité réservée de 50 tentatives par minute glissante, en plus des 240 de prévisions. Les reprises recalculent les événements sur le flux courant, sans rejouer une file périmée. La validité est revérifiée avant chaque envoi. Les alertes sont aussi ajoutées au format météo natif, avec correspondance 2–5 → `minor`/`moderate`/`severe`/`extreme` et dix alertes maximum, classées par degré. Les chaussées glissantes n’ont pas de type pivot équivalent. Le texte original est conservé ; au-delà de la limite Gladys, seul le lien source est fourni. Une donnée indisponible omet `alerts`, une donnée vérifiée sans alerte fournit `[]`.

`requestWeatherRefresh()` passe par une temporisation commune de 61 secondes pour éviter que Gladys ignore une alerte juste après un rafraîchissement de prévisions. Les événements directs de scènes ne sont pas soumis à cette temporisation et fonctionnent avant la disponibilité des prévisions. Le flux web n’est pas un canal push et son cache peut ajouter une minute au cycle local. La procédure de maintenance du produit et des régions est décrite dans [MAINTENANCE.md](MAINTENANCE.md).

## Vérification et limites

Le schéma `test/fixtures/manifest.schema.json` vient du cœur Gladys, consulté le 9 octobre 2026. Le paquet npm SDK **0.14.0** est la référence d’exécution : GitHub `main` contient déjà des aides de tests absentes du paquet publié. Notre adaptateur de test utilise donc le SDK installé et substitue uniquement ses entrées/sorties.

Les composants de chaque widget passent par `validateWidgetContent` dans les tests, en français/anglais et unités métriques/américaines. Le test réseau optionnel vérifie Lausanne et Zurich et rapporte le temps de chargement et le pic mémoire. La CI ne télécharge pas les données nationales.

L’attribution apparaît dans le sous-titre des graphiques et dans la configuration. Le format pivot météo ne possède pas de champ d’attribution ; aucun champ non reconnu n’y est ajouté.
