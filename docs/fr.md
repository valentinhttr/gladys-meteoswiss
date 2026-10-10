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

**Source : [Météo Suisse (MeteoSwiss)](https://www.meteosuisse.admin.ch).** Cette intégration communautaire indépendante n’est pas un service officiel et n’est ni affiliée, ni liée, ni approuvée par Météo Suisse. Les déclencheurs reposent sur des prévisions et ne remplacent pas un capteur local pour protéger un équipement. Elle ne fournit pas d’alertes officielles ni de radar.
