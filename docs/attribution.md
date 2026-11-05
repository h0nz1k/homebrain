# Attribution (third-party data bundled in HomeBrain)

HomeBrain bundles all map data; the browser never contacts a map or tile server.

| Data | Where | Source | Licence |
|---|---|---|---|
| Radar reflectivity (recoloured, smoothed) | Weather → radar | ČHMÚ (Czech Hydrometeorological Institute) open data | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| ORP and kraj boundaries | radar basemap, warning filter | ČÚZK RÚIAN | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Place names | radar basemap labels | GeoNames `cities5000` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Rivers, lakes, roads, motorways, built-up areas, country border | radar basemap | Natural Earth 10m | public domain |
| Forecast models | Weather | Open-Meteo.com | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

In the UI the radar card shows a one-line credit (`© ČHMÚ, ČÚZK, GeoNames · CC BY 4.0`) and the
full list behind the (i) button. Basemap build: `scripts/build_weather_basemap.py`.
