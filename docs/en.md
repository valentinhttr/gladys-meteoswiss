# MeteoSwiss

Add **Forecast · 8 days** to see the entire week. Add the temperature, precipitation and wind widgets for hourly charts.

In each widget's settings:

- **Location**: a Swiss town or postcode, for example `Genève`, `1201` or `1201 Genève`. Accents are optional. For cities with several postcodes, use a postcode to choose the area.
- **House**: used when Location is empty. Leave both empty for the first located house, or enter the house name/selector to choose another one.

Add multiple copies of a widget to compare locations. A custom location works even without a located house. The native Gladys weather widget continues to use its selected house.

After upgrading from 1.0, add **Forecast · 8 days** from the dashboard editor. Existing hourly widgets retain their house settings. Edit their settings to choose another location.

First loading can take a few minutes. Up to 20 locations are tracked per integration process. An unknown or ambiguous location displays guidance instead of silently falling back to your house.

The large website buttons have been removed. The source remains visible; the website link is in the integration configuration. Gladys currently does not support links beside widget headings.

**Source: [Météo Suisse (MeteoSwiss)](https://www.meteosuisse.admin.ch).** This independent community integration is not an official service and has no affiliation with or endorsement from MeteoSwiss. No official warnings or radar are provided.
