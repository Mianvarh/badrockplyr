# Private Media Resolver

Servicio separado para resolver fuentes propias economicas sin mezclar PHP dentro de Badrockplyr.

## Endpoints

- `GET /api/private-media/health`
- `GET /api/private-media/list`
- `GET /api/private-media/folders`
- `POST /api/private-media/import`
- `POST /api/private-media/folders/preview`
- `POST /api/private-media/folders/confirm`
- `GET /api/private-media/resolve?tmdbId=&type=&season=&episode=`

## Ejemplo De Importacion

```bash
curl -X POST http://localhost:3091/api/private-media/import \
  -H "content-type: application/json" \
  -d "{\"tmdbId\":\"378064\",\"type\":\"movie\",\"language\":\"latino\",\"quality\":\"720p\",\"provider\":\"GOOGLE_DRIVE\",\"sourceUrl\":\"https://drive.google.com/file/d/FILE_ID/view\"}"
```

```bash
curl -X POST http://localhost:3091/api/private-media/import \
  -H "content-type: application/json" \
  -d "{\"tmdbId\":\"11235\",\"type\":\"tv\",\"season\":1,\"episode\":1,\"language\":\"latino\",\"quality\":\"720p\",\"provider\":\"ONEDRIVE\",\"sourceUrl\":\"https://1drv.ms/v/s!...\"}"
```

El servicio guarda el `providerFileId`, no guarda URLs temporales de reproduccion. La URL directa se resuelve al pedir `resolve`.

## Ejemplo De Preview De Carpeta

```bash
curl -X POST http://localhost:3091/api/private-media/folders/preview \
  -H "content-type: application/json" \
  -d "{\"provider\":\"GOOGLE_DRIVE\",\"sourceUrl\":\"https://drive.google.com/drive/folders/FOLDER_ID\"}"
```

El preview detecta temporadas, episodios, idioma y calidad desde nombres de carpetas y archivos. La confirmacion guarda los archivos como fuentes propias, pero no crea `GeneratedLink`; quedan listos para cuando agregues ese TMDB ID al generador/scraper.

## Variables

- `PRIVATE_MEDIA_RESOLVER_PORT`: puerto del servicio. Default `3091`.
- `PRIVATE_MEDIA_STORE_PATH`: ruta del JSON de datos. Default `services/private-media-resolver/data/private-media.json`.
- `GOOGLE_DRIVE_API_KEY`: requerido para preview de carpetas Google Drive.
- `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_TENANT_ID`: requeridos para preview de carpetas OneDrive con Microsoft Graph.

Los proxies del dashboard siguen aplicando a scrapers externos; Google Drive/OneDrive propios se consumen directo desde el VPS/app porque sus URLs temporales quedan firmadas para la IP que las resuelve.
