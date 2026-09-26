# Guía Comercial de Instalación y Conexión — Badrockplyr PRO & WordPress

Bienvenido a la documentación oficial de **Badrockplyr PRO**. Esta guía detalla paso a paso cómo desplegar tu servidor Badrockplyr y cómo conectar tu sitio de WordPress en menos de 5 minutos mediante el **Child Theme Universal**.

---

## 📦 Contenido del Paquete

1. **`badrockplyr-engine/`**: Servidor completo Next.js 15, Prisma ORM, motores de scraping y REST API.
2. **`dist/badrock-child-theme.zip`**: Tema hijo para WordPress con auto-importador por IMDb/TMDb y reproductor responsive integrado.
3. **`wordpress/presets/`**: Snippets y ganchos directos para temas populares como DooPlay y ToroFlix.

---

## 🚀 Paso 1: Despliegue del Servidor Badrockplyr

Puedes desplegar Badrockplyr en cualquier VPS con Ubuntu (mediante Docker o PM2), o plataformas PaaS (Vercel, Coolify, Railway).

### Requisitos Mínimos
- Node.js 18.17+ o Node.js 20+
- 1 GB RAM (recomendado 2 GB)
- Clave gratuita de API de TMDb ([themoviedb.org](https://www.themoviedb.org/settings/api))

### Instalación en VPS / Local
```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
```
Edita tu `.env`:
```env
DATABASE_URL="file:./dev.db" # O postgresql://... para producción
TMDB_API_KEY="tu_api_key_de_tmdb"
NEXT_PUBLIC_APP_URL="https://tu-dominio-badrock.com"
```

```bash
# 3. Inicializar base de datos
npx prisma generate
npx prisma db push

# 4. Compilar y arrancar en producción
npm run build
npm start
```

---

## 🔑 Paso 2: Generar tu API Key en Badrock

1. Abre tu navegador e ingresa al dashboard: `https://tu-dominio-badrock.com/dashboard`.
2. Dirígete a **Consola > API Keys**.
3. Haz clic en **"Generar Nueva API Key"**.
4. Asigna un nombre a tu clave (ej. `Mi Sitio WordPress`) y opcionalmente añade tu dominio en la lista blanca de seguridad.
5. Copia tu clave generada (comienza con `bdrk_live_...`).

---

## 🌐 Paso 3: Instalar y Conectar el Child Theme en WordPress

1. En tu panel de administración de WordPress (`wp-admin`), ve a **Apariencia > Temas > Añadir nuevo > Subir tema**.
2. Selecciona el archivo `badrock-child-theme.zip` ubicado en la carpeta `dist/` y haz clic en **Instalar ahora**.
3. Haz clic en **Activar**.
4. En el menú lateral izquierdo de WordPress, verás la nueva pestaña **Badrock Player**.
5. Configura los siguientes campos:
   - **URL del Servidor Badrock**: La dirección de tu plataforma (ej: `https://tu-dominio-badrock.com`).
   - **Badrock API Key**: Pega la clave que copiaste en el Paso 2 (`bdrk_live_...`).
   - **Modo de Reproductor**: Selecciona entre *Reproductor Embed Incrustado* o *Pestañas de Enlaces Crudos*.
   - **Anular API de IMDb Nativa**: Márcala si tu tema padre tiene un importador antiguo que cause conflicto.
6. Haz clic en **"Probar Conexión con Badrock"**. Si todo está correcto, verás un mensaje verde de confirmación.
7. Guarda los cambios.

---

## 🎬 Paso 4: Cómo Publicar Contenido en 1 Clic con IMDb / TMDb

1. Ve a **Entradas > Añadir nueva** (o a tu tipo de contenido de Películas/Series).
2. Verás el panel **⚡ Badrock Auto-Importador (IMDb / TMDb)**.
3. Ingresa cualquier ID de IMDb (ej: `tt15398776` para Oppenheimer) o TMDb numérico (ej: `872585`).
4. Haz clic en **"📥 Importar con Badrock"**.
5. En segundos:
   - Se completará automáticamente el título y sinopsis.
   - Badrock extraerá y verificará todas las fuentes de video activas (Cuevana3, PelisFlix, etc.).
   - Si tienes cargada una fuente propia (Google Drive), se vinculará automáticamente como el **⭐ Servidor VIP** al final de las opciones.
6. Publica la entrada. El reproductor responsive aparecerá listo para tus usuarios sin anuncios molestos.

---

## 🛡️ Preguntas Frecuentes y Soporte

### ¿Puedo usar la API en sitios sin WordPress?
¡Sí! Badrockplyr PRO ofrece una REST API estándar en `/api/v1/media/{id}` compatible con cualquier lenguaje (Node.js, Python, PHP, React, Vue, aplicaciones móviles Android/iOS). Solo debes incluir el header `X-Badrock-Key: tu_api_key`.

### ¿Cómo funcionan los proxies de Webshare?
Badrockplyr incluye un sistema de balanceo que soporta dos grupos gratuitos de 10 proxies de Webshare. Si un bloque alcanza el límite de peticiones de Google Drive, el sistema conmuta automáticamente al segundo bloque para que tus videos de fuentes propias nunca se detengan.

---
© 2026 Badrockplyr PRO. Todos los derechos reservados.
