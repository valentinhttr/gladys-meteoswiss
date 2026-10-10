# MeteoSwiss

Use the native Gladys **Weather** widget for the eight-day forecast. Add the temperature, precipitation and wind widgets for hourly charts.

In each widget's settings:

- **Location**: a Swiss town or postcode, for example `Genève`, `1201` or `1201 Genève`. Accents are optional. For cities with several postcodes, use a postcode to choose the area.
- **House**: used when Location is empty. Leave both empty for the first located house, or enter the house name/selector to choose another one.

Add multiple copies of a widget to compare locations. A custom location works even without a located house. The native Gladys weather widget continues to use its selected house.

The extra **Forecast · 8 days** widget has been removed. If you added it, remove it from your dashboard and use the native **Weather** widget instead. The three chart widgets retain their settings.

First loading can take a few minutes. Up to 20 locations are tracked per integration process. An unknown or ambiguous location displays guidance instead of silently falling back to your house.

The heading shows only the location. The source and forecast time appear below the location in a small, muted subtitle. The website link is available in the integration configuration.

## Scene triggers

Add a scene trigger from **Integrations → Météo Suisse / MeteoSwiss**:

| Trigger                   | Default threshold             | Example use         |
| ------------------------- | ----------------------------- | ------------------- |
| Precipitation expected    | At least 0.2 mm in one hour   | Suspend irrigation  |
| Frost risk                | Temperature at or below 0 °C  | Notify about plants |
| High temperature expected | Temperature at or above 30 °C | Close shutters      |
| Strong gusts expected     | Gusts at or above 50 km/h     | Retract awnings     |

Select a **House**, or leave the filter empty for events from all located houses. Each house needs coordinates in Gladys and must be covered by Swiss forecasts. Custom locations used only in widgets do not trigger scenes.

In **each scene trigger**, choose the threshold and the **Forecast window**: 1, 3, 6, 12 or 24 hours (default: 6). Each scene has its own settings; there are no thresholds to set in the integration configuration. For example, one scene can retract awnings at 40 km/h within 3 hours, while another sends a notification at 80 km/h within 12 hours.

Thresholds are selected from lists:

- **Precipitation**: 0.2, 1, 2, 5 or 10 mm in one hour.
- **Frost**: −5, −2, 0, 2 or 5 °C, to anticipate risk for sensitive plants.
- **Heat**: 25, 28, 30, 32 or 35 °C.
- **Gusts**: 30, 40, 50, 60, 80 or 100 km/h.

Arbitrary numeric input is not offered. Units remain °C, mm and km/h even when widgets use US units. Precipitation includes rain and snow; its threshold applies to one hour, not the total over the window.

Forecasts are checked at loading and every 15 minutes, even without widgets. The window includes the current hour: MeteoSwiss timestamps mark the end of each hourly interval. An event fires when any hour reaches the threshold, including the first load if a risk already exists. Another event requires a complete forecast window without that risk first. Missing data and forecasts older than six hours neither fire events nor rearm triggers.

State is stored in `/data/scene-state.json` to prevent repeats after reconnecting or restarting. Without a writable volume, this protection is kept only in memory. Each house/threshold/window combination is monitored independently. A scene created or edited during an already reported risk for its combination waits for the next occurrence. Changing a house's coordinates restarts its monitoring. For installations with many houses, events are spread over several minutes to respect Gladys's rate limit. Failed sends are retried on a later check; if Gladys received an event but its response was lost, a duplicate remains possible.

Following actions can use `{{triggerEvent.data.house_name}}`, `{{triggerEvent.data.location}}`, `{{triggerEvent.data.value}}`, `{{triggerEvent.data.unit}}`, `{{triggerEvent.data.threshold}}` and `{{triggerEvent.data.horizon_hours}}`. `{{triggerEvent.data.forecast_at}}` is the UTC end of the first hour reaching the threshold; `{{triggerEvent.data.house}}` is the house selector.

**Source: [Météo Suisse (MeteoSwiss)](https://www.meteosuisse.admin.ch).** This independent community integration is not an official service and has no affiliation with or endorsement from MeteoSwiss. Triggers use forecasts and do not replace a local sensor for equipment protection. No official warnings or radar are provided.
