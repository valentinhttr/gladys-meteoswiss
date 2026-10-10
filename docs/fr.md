# Météo Suisse

Utilisez le widget **Météo** natif de Gladys pour les prévisions sur huit jours. Les widgets température, précipitations et vent affichent les courbes horaires.

Dans les réglages de chaque widget :

- **Localité** : une ville ou un NPA suisse, par exemple `Genève`, `1201` ou `1201 Genève`. Les accents sont facultatifs. Pour une ville avec plusieurs NPA, indiquez le NPA pour choisir le quartier.
- **Maison** : utilisée si Localité est vide. Laissez les deux champs vides pour la première maison localisée, ou indiquez le nom/identifiant d’une autre maison.

Ajoutez plusieurs exemplaires d’un widget pour comparer des lieux. Une localité personnalisée fonctionne même sans maison localisée. Le widget météo natif de Gladys conserve la maison sélectionnée.

Le widget supplémentaire **Prévisions · 8 jours** a été retiré. Si vous l’aviez ajouté, supprimez-le de votre tableau de bord et utilisez le widget **Météo** natif à sa place. Les trois widgets graphiques conservent leurs réglages.

Le premier chargement peut prendre quelques minutes. Jusqu’à 20 localités sont suivies par démarrage. Une localité inconnue ou ambiguë affiche une aide, sans revenir silencieusement à la maison.

Le titre affiche uniquement la localité. La source et l’heure des prévisions figurent en petit et grisé sous la localité, sans bouton. Le lien vers le site est disponible dans la configuration de l’intégration.

## Déclencheurs de scènes

Dans une scène, ajoutez un déclencheur depuis **Intégrations → Météo Suisse / MeteoSwiss** :

| Déclencheur            | Seuil par défaut              | Exemple d’utilisation     |
| ---------------------- | ----------------------------- | ------------------------- |
| Précipitations prévues | Au moins 0,2 mm sur une heure | Suspendre l’arrosage      |
| Risque de gel          | Température à 0 °C ou moins   | Prévenir pour les plantes |
| Forte chaleur prévue   | Température à 30 °C ou plus   | Fermer les volets         |
| Fortes rafales prévues | Rafales à 50 km/h ou plus     | Rentrer les stores        |

Choisissez une **Maison**, ou laissez ce filtre vide pour recevoir les événements de toutes les maisons localisées. Chaque maison doit avoir des coordonnées dans Gladys et être couverte par les prévisions suisses. Les localités choisies uniquement dans les widgets ne déclenchent pas de scènes.

Dans **chaque déclencheur de scène**, choisissez le seuil et la **Période à surveiller** : 1, 3, 6, 12 ou 24 heures (6 par défaut). Chaque scène a ses propres réglages ; aucun seuil n’est à renseigner dans la configuration de l’intégration. Par exemple, une scène peut rentrer les stores dès 40 km/h sur 3 heures, et une autre envoyer une notification dès 80 km/h sur 12 heures.

Les seuils se choisissent dans des listes :

- **Précipitations** : 0,2, 1, 2, 5 ou 10 mm sur une heure.
- **Gel** : −5, −2, 0, 2 ou 5 °C, pour anticiper selon la sensibilité des plantes.
- **Chaleur** : 25, 28, 30, 32 ou 35 °C.
- **Rafales** : 30, 40, 50, 60, 80 ou 100 km/h.

La saisie d’un seuil arbitraire n’est pas proposée. Les unités restent °C, mm et km/h, même si les widgets utilisent les unités américaines. Les précipitations incluent pluie et neige ; le seuil porte sur une heure, pas sur le cumul de la période.

L’intégration vérifie les prévisions au chargement, puis toutes les 15 minutes, même sans widget affiché. La période inclut l’heure en cours : les dates MétéoSuisse désignent la fin de chaque intervalle horaire. Un événement est émis dès qu’une heure de la période atteint le seuil, y compris au premier chargement si le risque est déjà présent. Une nouvelle émission nécessite d’abord une période complète sans ce risque. Les données manquantes ou les prévisions datant de plus de six heures ne déclenchent ni événement ni réarmement.

L’état est conservé dans `/data/scene-state.json` pour éviter les répétitions après reconnexion ou redémarrage. Si le volume n’est pas accessible en écriture, cette protection reste en mémoire uniquement. Chaque combinaison maison/seuil/période est surveillée indépendamment. Une scène créée ou modifiée pendant un risque déjà signalé pour sa combinaison attendra sa prochaine apparition. Modifier les coordonnées d’une maison recommence sa surveillance. Sur une installation avec de nombreuses maisons, les envois sont répartis sur plusieurs minutes pour respecter la limite de Gladys. Une erreur d’envoi est retentée lors d’une prochaine vérification ; si Gladys a reçu l’événement mais que sa réponse a été perdue, un doublon reste possible.

Les actions suivantes peuvent utiliser les variables `{{triggerEvent.data.house_name}}`, `{{triggerEvent.data.location}}`, `{{triggerEvent.data.value}}`, `{{triggerEvent.data.unit}}`, `{{triggerEvent.data.threshold}}` et `{{triggerEvent.data.horizon_hours}}`. `{{triggerEvent.data.forecast_at}}` est la fin, en UTC, de la première heure atteignant le seuil ; `{{triggerEvent.data.house}}` est l’identifiant de la maison.

## Alertes officielles

Dans une scène, ajoutez **Intégrations → Météo Suisse → Alerte officielle MétéoSuisse**, puis choisissez :

- **Maison** : une maison, ou laissez vide pour toutes les maisons localisées.
- **Phénomène** : vent, orages, pluie, neige, chaussées glissantes, canicule ou gel. Laissez vide pour les sept phénomènes.
- **Degré de danger minimum** : 2 (limité), 3 (marqué), 4 (fort) ou 5 (très fort). Le choix 3 accepte aussi les degrés 4 et 5.

Par exemple, **Maison = Domicile, Phénomène = Orages, Minimum = 3** peut envoyer une notification dès réception d’une alerte d’orage confirmée. Une autre scène **Vent, Minimum = 2** peut rentrer les stores. Le degré officiel est une catégorie de danger, pas un seuil en km/h ; les déclencheurs de prévisions ci-dessus restent disponibles pour les seuils chiffrés.

Le flux de la carte officielle est vérifié dès le démarrage, puis toutes les **60 secondes**, même sans widget et indépendamment des téléchargements de prévisions. Son index amont possède aussi un cache de 60 secondes : comptez environ **une à deux minutes après publication sur le web** en fonctionnement normal, plus le transport réseau et la livraison. Il s’agit d’une interrogation périodique, pas du canal push de l’application MétéoSuisse. Un cache amont plus long, un délai imposé par le serveur ou une panne peut allonger ce délai ; les erreurs sont retentées après 1, 2, 4, puis 5 minutes. L’intégration ne peut pas recevoir une alerte avant sa publication par MétéoSuisse.

Un événement est émis à réception d’une nouvelle alerte confirmée, même si elle commence plus tard, puis si son degré dépasse le maximum déjà signalé pour cette alerte. Une baisse, une modification du texte ou une prolongation de la fin ne répète pas l’événement. Les alertes expirées, préalertes, alertes pour les lacs/aérodromes et dangers d’autres organismes (crues, avalanches, incendies de forêt, sécheresse) sont exclus. Les coordonnées des maisons sont comparées localement aux limites simplifiées de la carte officielle, sans utiliser la ville de prévision la plus proche. Près d’une limite, consultez la carte officielle ; l’information est régionale, pas mesurée à la maison. Les changements de maisons sont vérifiés chaque minute.

Variables disponibles : `{{triggerEvent.data.house_name}}`, `{{triggerEvent.data.phenomenon}}` (code stable, par exemple `thunderstorm`), `{{triggerEvent.data.level}}`, `{{triggerEvent.data.starts_at}}`, `{{triggerEvent.data.ends_at}}` (UTC) et `{{triggerEvent.data.source_url}}` pour la carte officielle. Exemple de notification : « Alerte MétéoSuisse : {{triggerEvent.data.phenomenon}}, degré {{triggerEvent.data.level}} pour {{triggerEvent.data.house_name}}. »

L’état des alertes est conservé séparément dans `/data/warning-scene-state.json`. Une reconnexion ou un redémarrage ne rejoue pas les alertes confirmées par Gladys si ce volume est accessible en écriture. Créer une scène pendant une alerte déjà signalée ne la rejoue pas non plus. Les envois échoués sont retentés ; un accusé de réception perdu peut néanmoins entraîner un doublon. Une annulation confirmée réarme l’alerte. Des données indisponibles n’effacent pas cet état. Après trois minutes sans vérification réussie du flux, l’intégration cesse de publier à partir de l’ancien flux. Les grandes installations sont limitées à 50 tentatives d’événements d’alerte par minute ; le surplus est réévalué avec les données courantes.

Les alertes sont également incluses dans les réponses météo natives Gladys, avec leur description originale française/anglaise et le lien source. Les degrés 2–5 correspondent aux niveaux Gladys `minor`, `moderate`, `severe`, `extreme` ; les chaussées glissantes n’ont pas de type Gladys équivalent. Le déclencheur d’intégration ci-dessus est le chemin le plus rapide et fonctionne pendant le chargement des prévisions. La météo native partage la limite Gladys d’un rafraîchissement par minute et nécessite une prévision disponible. Des alertes indisponibles restent absentes de la réponse, sans être remplacées par une liste vide. Si une description dépasse la limite Gladys, le lien source remplace le texte.

**Source : [Météo Suisse (MeteoSwiss)](https://www.meteosuisse.admin.ch).** Cette intégration communautaire indépendante n’est pas un service officiel et n’est ni affiliée, ni liée, ni approuvée par Météo Suisse. Les prévisions et alertes régionales complètent un capteur local pour protéger un équipement. Aucun radar n’est fourni.
