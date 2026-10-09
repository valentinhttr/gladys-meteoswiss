# Météo Suisse / MeteoSwiss pour Gladys

[English documentation](docs/README.en.md)

Intégration externe **de type météo** pour Gladys Assistant **5.1.0 ou ultérieur**, utilisant le SDK JavaScript **0.14.0** et les données ouvertes officielles de MétéoSuisse. Aucun compte ni clé d’API nécessaire. Projet communautaire indépendant, sans affiliation avec MétéoSuisse.

## Fonctionnalités

- Widget météo natif Gladys : prévision de l’heure courante, 24 heures et 8 jours, icônes jour/nuit, températures minimales/maximales, précipitations, vent et rafales.
- Trois widgets supplémentaires : **Température · 24 heures**, **Précipitations · 24 heures**, **Vent · 24 heures**.
- Français et anglais, avec prise en charge des variantes comme `fr-CH` ; langue inconnue : anglais.
- Maisons multiples, unités métriques ou américaines, dates calendaires suisses (`Europe/Zurich`).
- Cache mémoire et disque, téléchargement progressif, reprises automatiques et arrêt propre.
- Releases GitHub versionnées, changelog automatique et images Docker multiarchitecture.

Les conditions actuelles sont des **prévisions**, pas des observations de station. Cette version ne fournit **ni alertes officielles, ni radar, ni humidité/pression** : ces données ne figurent pas dans la collection utilisée. Les scènes d’alerte météo ne sont donc pas alimentées. Le widget natif utilise le moteur de rendu de Gladys ; les widgets supplémentaires utilisent ses composants déclaratifs et suivent son thème, sa langue et son affichage mobile.

Gladys impose actuellement une chaîne unique pour `name` dans le manifeste. Le catalogue affiche donc **Météo Suisse / MeteoSwiss** dans toutes les langues. Les titres à l’intérieur des widgets affichent **Météo Suisse** en français et **MeteoSwiss** en anglais ; descriptions, réglages et états sont également traduits.

## Installation

La première release et son image Docker doivent avoir été publiées avant l’installation. Voir [le guide de publication](docs/RELEASING.md).

1. Dans Gladys, ouvrez les intégrations externes et ajoutez le dépôt `https://github.com/valentinhttr/gladys-meteoswiss`.
2. Autorisez la lecture de la localisation des maisons. Elle sert au préchargement et aux widgets supplémentaires.
3. Vérifiez les coordonnées de vos maisons dans Gladys.
4. Ajoutez le widget météo natif, puis sélectionnez ce fournisseur si plusieurs sont installés.
5. Ajoutez au besoin les widgets de l’intégration. Le réglage **Maison** accepte le nom exact ou le `selector` de la maison. Vide : première maison localisée, dans l’ordre renvoyé par Gladys. Un nom inconnu ou ambigu affiche une aide.

Le premier chargement peut prendre quelques minutes. Les widgets affichent un état de chargement ; les demandes météo natives échouent rapidement pendant ce temps, afin que Gladys puisse utiliser un autre fournisseur. Une notification de rafraîchissement est envoyée quand les données sont prêtes.

La localité postale la plus proche est sélectionnée parmi les points officiels ; les stations et sommets ne sont pas utilisés pour éviter une prévision de montagne pour une maison en vallée. Au-delà de **20 km** d’une localité couverte, la demande est refusée. Ce critère de proximité n’est pas une frontière administrative : certains domiciles frontaliers sont acceptés, avec une prévision suisse voisine. Jusqu’à **20 localités distinctes** par démarrage.

## Données et fonctionnement

Source : **MétéoSuisse / MeteoSwiss**.

- [Prévisions locales et conditions d’utilisation](https://opendatadocs.meteoswiss.ch/e-forecast-data/e4-local-forecast-data)
- [API STAC officielle](https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting)
- [Exemples officiels et descriptions des symboles](https://github.com/MeteoSwiss/opendata-localforecast-demos)

L’API distribue un fichier national par paramètre, actualisé chaque heure. L’intégration vérifie les nouvelles publications toutes les 15 minutes et télécharge dix paramètres uniquement si une nouvelle exécution complète du modèle est disponible ou qu’une maison manque au cache. Les fichiers sont lus en flux, un à la fois ; seules les localités suivies sont conservées. **Le transfert réseau peut représenter plusieurs centaines de Mo par actualisation** : cette version vise une connexion fixe, pas une connexion à quota réduit. Le test `npm run smoke` effectue également ces téléchargements.

Les coordonnées sont comparées localement aux métadonnées nationales : elles ne sont pas envoyées dans une requête de géocodage externe. Les requêtes sortantes de données vont exclusivement à `data.geo.admin.ch`. Le cache `/data/forecasts.json` contient les prévisions et la localité sélectionnée, jamais les jetons Gladys.

Les prévisions d’une même réponse viennent d’une exécution cohérente du modèle. Après une panne, le dernier résultat reste utilisable jusqu’à **6 heures après l’heure d’émission**, puis le fournisseur refuse de servir des prévisions trop anciennes. La supervision signale une dégradation et les nouvelles tentatives sont espacées avec délai croissant. Les dates horaires OGD désignent la **fin** de l’intervalle ; les cumuls de précipitations incluent l’heure en cours et les 23 suivantes. Le symbole horaire résume les trois heures précédant son horodatage, selon le format source.

Les données sont réutilisées avec attribution. Les pictogrammes propriétaires de MétéoSuisse ne sont pas redistribués : les codes sont convertis vers les conditions et icônes de Gladys.

## Développement

Node.js 22 ou 24 ; le conteneur utilise Node.js 24.

```sh
npm ci
npm test
npm run check
# Facultatif : test réel réseau (téléchargement des fichiers nationaux)
npm run smoke
docker build -t gladys-meteoswiss:local .
```

Pour une exécution connectée, Gladys injecte les variables `GLADYS_HOST_API_URL`, `GLADYS_INTEGRATION_TOKEN` et `GLADYS_INTEGRATION_SELECTOR`. Le jeton doit être celui attribué à cette intégration par Gladys. En développement hors conteneur, définissez `DATA_DIR=.data` pour le cache, puis lancez `npm start`.

Les tests hors ligne couvrent les conversions, les codes météo, les dates et changements d’heure, les CSV Latin-1, les pannes, les caches, les localités, les widgets et les acquittements du **SDK npm 0.14.0 réel**. Le schéma de manifeste Gladys est conservé dans `test/fixtures` pour que les vérifications restent reproductibles sans réseau. La préparation des releases est testée dans des dépôts Git temporaires. Les tests ne remplacent pas une recette visuelle sur une instance Gladys.

## Publication

[Guide de release](docs/RELEASING.md) : première publication, permissions GitHub/GHCR, version initiale puis patch/minor/major, changelog, et récupération après échec. Aucune release n’est créée par un simple lancement de l’application.

Architecture et choix : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence et références

Code sous licence [MIT](LICENSE). Le SDK Gladys et le schéma de validation du cœur Gladys sont sous Apache-2.0 ; voir [NOTICE](NOTICE).

Références consultées : [guide Gladys](https://gladysassistant.com/fr/docs/dev/external-integrations/), [SDK officiel](https://github.com/GladysAssistant/integration-sdk-js), [intégration Météo France de William-De71](https://github.com/William-De71/gladys-meteo-france). Cette dernière a servi de référence fonctionnelle et de publication. Le fournisseur, les conversions, le cache, les widgets et les scripts de ce projet sont implémentés indépendamment.
