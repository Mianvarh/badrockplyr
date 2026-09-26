"use server";

import { prisma } from "@/lib/prisma";
import { getStoredProxyConfig } from "@/lib/proxySettingsStore";
import { getLastProxyHealthReport } from "@/lib/proxyHealth";
import { flattenEnabledProxies } from "@/lib/proxyConfig";

export interface SystemCheckItem {
  id: string;
  title: string;
  description: string;
  status: "ok" | "warning" | "error" | "info";
  badge: string;
  details: { label: string; value: string; isHighlight?: boolean }[];
  message?: string;
  recommendation?: string;
}

export interface SetupDiagnosticsReport {
  timestamp: string;
  allOk: boolean;
  score: {
    passed: number;
    total: number;
    percent: number;
  };
  checks: {
    node: SystemCheckItem;
    database: SystemCheckItem;
    tmdb: SystemCheckItem;
    proxy: SystemCheckItem;
  };
}

export async function runSetupDiagnostics(): Promise<SetupDiagnosticsReport> {
  const timestamp = new Date().toISOString();

  // 1. Node.js Environment Check
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.replace(/^v/, "").split(".")[0], 10);
  const isNodeSupported = majorVersion >= 18;
  const memUsage = process.memoryUsage();
  const rssMb = Math.round(memUsage.rss / (1024 * 1024));
  const heapMb = Math.round(memUsage.heapUsed / (1024 * 1024));
  const uptimeSec = Math.round(process.uptime());

  const nodeCheck: SystemCheckItem = {
    id: "node",
    title: "Entorno de Ejecución Node.js",
    description: "Verificación de la versión del motor JavaScript y recursos del sistema",
    status: isNodeSupported ? "ok" : "error",
    badge: isNodeSupported ? `${nodeVersion} Compatible` : `${nodeVersion} Incompatible`,
    details: [
      { label: "Versión Node", value: nodeVersion, isHighlight: true },
      { label: "Plataforma / SO", value: `${process.platform} (${process.arch})` },
      { label: "Consumo de Memoria", value: `${rssMb} MB RSS (${heapMb} MB Heap)` },
      { label: "Tiempo Activo", value: `${uptimeSec}s` },
      { label: "Modo de Entorno", value: process.env.NODE_ENV || "development" },
    ],
    message: isNodeSupported
      ? "El entorno Node.js cumple con los requisitos para Badrockplyr PRO (Node 18.17+)."
      : "Se requiere Node.js 18.17 o superior (Recomendado Node 20 LTS o 22 LTS).",
    recommendation: isNodeSupported
      ? undefined
      : "Actualiza la versión de Node.js en tu servidor mediante nvm o tu gestor de paquetes.",
  };

  // 2. Database Connectivity Check (Prisma)
  let dbStatus: "ok" | "error" = "ok";
  let dbLatency = 0;
  let dbProvider = "SQLite";
  let dbError = "";
  let mediaCount = 0;
  let sourceCount = 0;

  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
    dbProvider = "PostgreSQL";
  } else if (dbUrl.startsWith("file:") || dbUrl.includes(".db")) {
    dbProvider = "SQLite (dev.db)";
  }

  try {
    const startDb = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1 as test_ping;");
    dbLatency = Date.now() - startDb;

    [mediaCount, sourceCount] = await Promise.all([
      prisma.mediaItem.count(),
      prisma.sourceSite.count(),
    ]);
  } catch (err: any) {
    dbStatus = "error";
    dbError = err?.message || "Error al conectar con la base de datos.";
  }

  const databaseCheck: SystemCheckItem = {
    id: "database",
    title: "Conectividad de Base de Datos (Prisma)",
    description: "Comprobación de consulta raw y tablas del esquema de Badrockplyr",
    status: dbStatus,
    badge: dbStatus === "ok" ? `${dbProvider} (${dbLatency}ms)` : "Sin Conexión",
    details: [
      { label: "Motor de Datos", value: dbProvider, isHighlight: true },
      { label: "Latencia de Consulta", value: dbStatus === "ok" ? `${dbLatency} ms` : "Fallo" },
      { label: "Títulos en Catálogo", value: `${mediaCount} ítems` },
      { label: "Proveedores Scraper", value: `${sourceCount} configurados` },
      { label: "Mapeo ORM", value: "Prisma Client Activo" },
    ],
    message: dbStatus === "ok"
      ? `Conexión establecida con éxito mediante query raw en ${dbLatency}ms.`
      : `No se pudo conectar a la base de datos: ${dbError}`,
    recommendation: dbStatus === "ok"
      ? undefined
      : "Verifica que el archivo dev.db tenga permisos de escritura o que tu DATABASE_URL en .env sea accesible.",
  };

  // 3. TMDB_API_KEY Presence in .env
  const rawTmdbKey = (process.env.TMDB_API_KEY || "").trim();
  const isPlaceholderKey =
    !rawTmdbKey ||
    rawTmdbKey.includes("replace-with") ||
    rawTmdbKey.includes("tu_api_key") ||
    rawTmdbKey.includes("your-tmdb-key");
  const isTmdbValid = !isPlaceholderKey && rawTmdbKey.length >= 16;

  let maskedKey = "No configurada";
  if (rawTmdbKey && !isPlaceholderKey) {
    if (rawTmdbKey.length > 8) {
      maskedKey = `${rawTmdbKey.slice(0, 4)}••••••••${rawTmdbKey.slice(-4)}`;
    } else {
      maskedKey = "••••••••";
    }
  } else if (isPlaceholderKey && rawTmdbKey) {
    maskedKey = "Clave de ejemplo (pendiente de configurar)";
  }

  const tmdbStatus: "ok" | "warning" = isTmdbValid ? "ok" : "warning";
  const tmdbCheck: SystemCheckItem = {
    id: "tmdb",
    title: "Clave de API TheMovieDatabase (TMDB_API_KEY)",
    description: "Permite importar sinopsis, pósters, metadatos y temporadas automáticamente",
    status: tmdbStatus,
    badge: isTmdbValid ? "Configurada y Activa" : "Pendiente / Valor de Ejemplo",
    details: [
      { label: "Estado en .env", value: isTmdbValid ? "Presente" : "Incompleta o Ausente", isHighlight: true },
      { label: "Clave Detectada", value: maskedKey },
      { label: "Longitud de Caracteres", value: isTmdbValid ? `${rawTmdbKey.length} caracteres` : "Inválida" },
      { label: "Proveedor", value: "TheMovieDatabase (v3 Auth)" },
    ],
    message: isTmdbValid
      ? "La clave TMDB_API_KEY está cargada en las variables de entorno del servidor."
      : "No se ha configurado una clave válida de TMDB. Sin ella, la extracción automática de pósters y metadatos no funcionará.",
    recommendation: isTmdbValid
      ? undefined
      : "Obtén una clave gratuita en themoviedb.org/settings/api y agrégala a tu archivo .env como TMDB_API_KEY=tu_clave.",
  };

  // 4. Webshare Proxy Pool Status
  let proxyStatus: "ok" | "info" | "warning" | "error" = "info";
  let proxyBadge = "Modo Directo";
  let activeProxiesCount = 0;
  let activeGroupsCount = 0;
  let healthSummaryText = "Sin proxies configurados (Operación directa)";
  let riskLevel = "good";

  try {
    const proxyConfig = await getStoredProxyConfig();
    const enabledProxies = flattenEnabledProxies(proxyConfig);
    activeProxiesCount = enabledProxies.length;
    activeGroupsCount = proxyConfig.groups.filter((g) => g.enabled).length;

    const lastReport = await getLastProxyHealthReport();

    if (proxyConfig.mode === "off") {
      proxyStatus = "info";
      proxyBadge = "Desactivado (Directo)";
      healthSummaryText = "Modo proxy desactivado explícitamente en configuración.";
    } else if (activeProxiesCount === 0) {
      if (proxyConfig.mode === "required") {
        proxyStatus = "error";
        proxyBadge = "Error: Sin Proxies";
        healthSummaryText = "Modo 'required' activo pero no hay proxies cargados.";
      } else {
        proxyStatus = "info";
        proxyBadge = "Modo Directo (Opcional)";
        healthSummaryText = "No hay proxies cargados. Las peticiones se resuelven con la IP del servidor.";
      }
    } else {
      // Proxies configured
      if (lastReport) {
        riskLevel = lastReport.summary.risk;
        const percent = lastReport.summary.healthyPercent;
        if (riskLevel === "critical") {
          proxyStatus = proxyConfig.mode === "required" ? "error" : "warning";
          proxyBadge = `${percent}% Salud (${lastReport.summary.ok}/${lastReport.summary.total} OK)`;
          healthSummaryText = `Riesgo Alto: La mayoría de proxies fallaron en el último test (${lastReport.summary.failed} caídos).`;
        } else if (riskLevel === "warning") {
          proxyStatus = "warning";
          proxyBadge = `${percent}% Salud (${lastReport.summary.ok}/${lastReport.summary.total} OK)`;
          healthSummaryText = `Alerta: Algunos proxies están caídos o lentos (${lastReport.summary.ok} de ${lastReport.summary.total} funcionales).`;
        } else {
          proxyStatus = "ok";
          proxyBadge = `${percent}% Salud (${lastReport.summary.ok}/${lastReport.summary.total} OK)`;
          healthSummaryText = `Óptimo: Pool de Webshare saludable con ${lastReport.summary.ok} proxies operativos.`;
        }
      } else {
        proxyStatus = "ok";
        proxyBadge = `${activeProxiesCount} Proxies Listos`;
        healthSummaryText = `${activeProxiesCount} proxies cargados en ${activeGroupsCount} grupo(s). Pendiente de test manual.`;
      }
    }
  } catch (err: any) {
    proxyStatus = "warning";
    healthSummaryText = `Error al leer configuración de proxies: ${err?.message}`;
  }

  const proxyCheck: SystemCheckItem = {
    id: "proxy",
    title: "Pool de Proxies Anti-Bloqueo (Webshare)",
    description: "Rotación de IPs para evitar bloqueos Cloudflare y limitaciones de tasa en proveedores",
    status: proxyStatus,
    badge: proxyBadge,
    details: [
      { label: "Cuentas / Grupos", value: `${activeGroupsCount} cuenta(s)` },
      { label: "Total Proxies Activos", value: `${activeProxiesCount} IPs`, isHighlight: true },
      { label: "Proveedor Integrado", value: "Webshare Residential / Datacenter" },
      { label: "Estado Operativo", value: healthSummaryText },
    ],
    message: healthSummaryText,
    recommendation:
      proxyStatus === "error" || (proxyStatus === "warning" && riskLevel === "critical")
        ? "Revisa tus credenciales de Webshare en Consola > Configuración > Proxies."
        : proxyStatus === "info"
        ? "Puedes agregar tus proxies de Webshare en Configuración para blindar tu IP pública contra bloqueos."
        : undefined,
  };

  // Calculate overall score
  const checksList = [nodeCheck, databaseCheck, tmdbCheck, proxyCheck];
  const passedCount = checksList.filter((c) => c.status === "ok" || c.status === "info").length;
  const totalCount = checksList.length;
  const percentScore = Math.round((passedCount / totalCount) * 100);
  const allOk = nodeCheck.status === "ok" && databaseCheck.status === "ok";

  return {
    timestamp,
    allOk,
    score: {
      passed: passedCount,
      total: totalCount,
      percent: percentScore,
    },
    checks: {
      node: nodeCheck,
      database: databaseCheck,
      tmdb: tmdbCheck,
      proxy: proxyCheck,
    },
  };
}
