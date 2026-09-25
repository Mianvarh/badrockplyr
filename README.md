# Badrockplyr

Badrockplyr es una plataforma académica tipo API y reproductor *embed* inspirada en sistemas multi-fuente. Permite la generación de enlaces de reproducción a partir de IDs de TMDB (Películas, Series y Animes), extrayendo automáticamente los streams de video desde diversas fuentes para ofrecer un reproductor unificado, limpio y sin publicidad intrusiva.

## 🚀 Características Principales

- **Generador de URLs**: Crea enlaces de reproducción (`/play/embed/...`) y recolección (`/f/embed/...`) utilizando directamente el ID de TMDB.
- **Resolución Automática de TMDB**: Obtiene metadatos (título, año, pósters) directamente desde TMDB, incluyendo una lógica inteligente de auto-corrección de tipos (si una "película" es en realidad una "serie" para TMDB).
- **Web Scraping y Extracción de Video**: Busca y analiza fuentes de video en sitios configurados. Extrae iframes y resuelve enlaces directos de servidores de alojamiento de video (ej. Filemoon, StreamWish, Voe).
- **Reproductor Embed Limpio**: Un reproductor HTML5 unificado que elimina pop-ups, overlays y publicidad de terceros. Soporta selección de idioma, calidad y subtítulos.
- **Gestión Inteligente de Variantes**: Clasifica y ordena los videos encontrados según idioma (prioridad: Latino > Inglés > Castellano > Japonés) y calidad (2160p > 1080p > HD > 720p > SD > CAM).
- **Adición Manual de Enlaces**: Permite ingresar manualmente URLs de video para reemplazar opciones fallidas o no encontradas por el scraper.

## 🛠 Stack Tecnológico

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS
- **Base de Datos**: SQLite (entorno de desarrollo `dev.db`) a través de **Prisma ORM**
- **Scraping**: Cheerio

## 🏗 Arquitectura y Flujo de Trabajo

### 1. Generación de Enlaces y Metadata
El usuario ingresa un ID de TMDB en el dashboard. El sistema (`tmdbService.ts`) consulta la API de TMDB. Si hay un error de clasificación (ej. buscar un anime como película), el sistema hace un *fallback* automático, corrige el `mediaType` y guarda la información correcta en la base de datos para evitar duplicados.

### 2. Scraping y Resolución de Streams
Una vez guardado el `MediaItem`, el scraper de Badrockplyr busca coincidencias en los sitios fuente configurados.
- Se buscan slugs y se navega a las páginas correspondientes.
- Se extraen los reproductores integrados.
- Se utiliza el módulo `streamResolver.ts` para desofuscar y extraer los enlaces directos `.mp4` o `.m3u8` desde servidores como Filemoon, Voe y StreamWish.

### 3. Reproducción
El endpoint `/play/embed/...` renderiza el reproductor de Badrockplyr. Consulta la base de datos por las variantes de video (`VideoVariant`) disponibles, selecciona la de mejor calidad en el idioma prioritario y permite al usuario interactuar y cambiar de opciones según la disponibilidad.

## 🗄 Modelos de Datos Principales (Prisma)

- **`MediaItem`**: Almacena toda la metadata de la película o episodio obtenida desde TMDB.
- **`GeneratedLink`**: Relaciona un `MediaItem` con las URLs generadas para el reproductor y el recolector.
- **`VideoVariant`**: Almacena cada enlace de video encontrado (directo o iframe), clasificado por calidad, idioma y servidor.
- **`ManualLink` / Opciones Manuales**: Permite al usuario reescribir o añadir variantes de video manualmente.

## ⚙️ Instalación y Uso Local

1. Clona el repositorio e instala las dependencias:
   ```bash
   npm install
   ```

2. Configura tus variables de entorno en el archivo `.env` (incluyendo tu API Key de TMDB).

3. Genera el cliente de Prisma y aplica las migraciones a la base de datos SQLite:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

5. Abre [http://localhost:3000](http://localhost:3000) en tu navegador para acceder al Dashboard.

## 📝 Notas de Desarrollo

- **Auto-corrección de tipos**: El scraper fue mejorado para manejar IDs que no coinciden estrictamente con su tipo (ej. el ID 372058 clasificado inicialmente como película pero reconocido como TV en TMDB).
- **Soporte Host de Video**: La lógica de `streamResolver.ts` se actualiza constantemente para soportar cambios en el DOM o scripts de ofuscación de los hosts de video soportados (Filemoon, etc).
