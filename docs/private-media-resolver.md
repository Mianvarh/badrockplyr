# Private Media Resolver

Fase 1 agrega un servicio separado para fuentes propias economicas. Badrockplyr aun no lo usa para ordenar opciones; esa integracion queda para Fase 2.

## Arranque Local

```bash
npm run private-media:dev
```

Por defecto escucha en `http://localhost:3091`.

## Endpoints

```bash
curl http://localhost:3091/api/private-media/health
```

```bash
curl -X POST http://localhost:3091/api/private-media/import \
  -H "content-type: application/json" \
  -d "{\"tmdbId\":\"378064\",\"type\":\"movie\",\"language\":\"latino\",\"quality\":\"720p\",\"provider\":\"GOOGLE_DRIVE\",\"sourceUrl\":\"https://drive.google.com/file/d/FILE_ID/view\"}"
```

```bash
curl "http://localhost:3091/api/private-media/resolve?tmdbId=378064&type=movie"
```

## Seguridad De Datos

El servicio persiste solo metadatos estables:

- `tmdbId`
- `mediaType`
- `season`
- `episode`
- `language`
- `quality`
- `provider`
- `providerFileId`
- `status`

No guarda URLs temporales de Google Drive como permanentes. Cada `resolve` intenta obtener una URL reproducible nueva.

## Estado De Providers

Google Drive esta activo en esta fase. OneDrive queda modelado como provider, pero su resolucion real queda para Fase 4.
