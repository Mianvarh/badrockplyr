# Pelis Juanita

Badrockplyr consulta estas rutas de Pelis Juanita:

- `/movies/movies.php` para buscar títulos.
- `/movies/pelicula/*` para opciones de películas.
- `/series/serieInfo.php` para opciones de episodios.

Cloudflare debe permitir estas peticiones cuando incluyan un secreto compartido:

```text
X-Badrockplyr-Token: <secreto-largo-y-aleatorio>
```

Configura el mismo valor en Badrockplyr:

```env
PELISJUANITA_BASE_URL=https://pelisjuanita.com
PELISJUANITA_API_TOKEN=<secreto-largo-y-aleatorio>
```

En Cloudflare crea una regla WAF `Skip` limitada a las tres rutas anteriores y al valor exacto del header. No desactives la protección del dominio completo. La regla debe omitir el challenge/bot check para esas solicitudes; el servidor de origen puede validar también el header y devolver `403` cuando no coincida.

Los archivos de video no pasan por esta integración. Badrockplyr solo obtiene las URLs de los reproductores y prioriza servidores que puede resolver para reproducir desde el host externo.
