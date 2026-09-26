# Badrockplyr PRO — Multi-Source Video Streaming Engine & API Platform

**Badrockplyr PRO** es una solución comercial todo-en-uno de alto rendimiento diseñada para webmasters, desarrolladores y plataformas de streaming. Permite generar reproductores embed ultrarrápidos, limpios y libres de publicidad a partir de IDs de TMDB o IMDb, extrayendo automáticamente streams reproducibles desde múltiples proveedores en alta definición (1080p / 720p / HLS), además de soportar fuentes privadas (Google Drive / Wasabi / S3 / Direct MP4) con proxy de streaming integrado.

---

## 💎 Características Principales para Comercialización

- 🎬 **Multi-Source Scraping Engine**: Integra múltiples proveedores de alta confiabilidad (Cuevana3, PelisFlix, Pelis Juanita, CineCalidad, JKAnime, TioAnime, AnimeFLV, MonosChinos, Gnula).
- ⚡ **Direct Stream De-obfuscator**: Extrae streams directos 1080p MP4 y manifests HLS (.m3u8) desde hosts populares (VOE, Filemoon, StreamWish, Niramirus, Hanerix, Fembed) para una reproducción nativa sin publicidad de terceros.
- 📺 **Cinema Experience Player**: Reproductor responsive inspirado en interfaces de cine moderno con control de volumen, auto-ocultamiento de brillo, pantalla bloqueable no invasiva, selector de servidores con badge VIP, control de velocidad y selector de audio/subtítulos.
- ⭐ **Soporte de Fuentes Propias & Servidor VIP**: Carga enlaces privados de Google Drive o servidores propios con protección mediante proxy en chunks y rotación de proxies Webshare, configurándose automáticamente como la opción final (Servidor VIP).
- 🔌 **REST API & WordPress Ready**: Endpoints JSON documentados para consultar embeds y enlaces directos mediante API Keys con restricción de dominio y límites de consulta. Compatible con temas de WordPress (DooPlay, ToroPlay o temas estándar) mediante Child Theme complementario.
- 🛡️ **Anti-Bloqueo & Proxy Rotativo**: Soporte para grupos de proxies (Webshare 1 y 2) con failover automático en caso de saturación o límite de peticiones.
- 🎯 **Detección Acústica de Idioma**: Análisis automático de audio y pistas para etiquetar de manera precisa el idioma (Latino, Castellano, Japonés, Inglés).
- 🧩 **100% Sin Publicidad Intrusiva**: Elimina redirecciones, banners maliciosos y pop-ups de los servidores de origen.

---

## 🛠 Stack Tecnológico

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Lenguaje**: TypeScript 5+ (100% Type-safe)
- **Estilos**: Tailwind CSS & Lucide Icons (Tema Dark Obsidian Moderno)
- **ORM / Base de Datos**: Prisma ORM con soporte dual para SQLite (desarrollo rápido) y PostgreSQL / Supabase (producción de alta concurrencia)
- **Scraping & Parsing**: Cheerio, Undici HTTP Client con timeout adaptativo y retries por proxy

---

## 🚀 Instalación y Despliegue Rápido

### Requisitos Previos
- Node.js 18.17+ o 20+
- Clave de API de TheMovieDatabase (TMDB API Key gratis)

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/Mianvarh/badrockplyr.git
cd badrockplyr
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo de ejemplo y configura tus credenciales:
```bash
cp .env.example .env
```
Configura en `.env`:
```env
DATABASE_URL="file:./dev.db"
TMDB_API_KEY="tu_api_key_de_tmdb"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Inicializar Base de Datos
```bash
npx prisma generate
npx prisma db push
```

### 4. Iniciar en Modo Producción
```bash
npm run build
npm start
```
El panel estará disponible en `http://localhost:3000/dashboard` y los reproductores en `http://localhost:3000/play/embed/...`.

---

## 📋 Endpoints de Reproducción Embed

| Tipo | URL del Embed |
| :--- | :--- |
| **Película** | `/play/embed/movie/{tmdbId}` |
| **Serie / Anime** | `/play/embed/tv/{tmdbId}/{temporada}/{episodio}` |

---

## 📄 Licencia Comercial & Distribución
Este software está empaquetado para distribución comercial en marketplaces autorizados. Todos los derechos reservados bajo la marca Badrockplyr PRO.
