import { prisma } from "@/lib/prisma";
import type { ApiKey } from "@prisma/client";
import crypto from "node:crypto";

export type { ApiKey };

export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  apiKey?: ApiKey;
}

const keyRateBuckets = new Map<string, number[]>();

/**
 * Extracts API key from headers (X-Badrock-Key, Bearer) or query params (api_key, key).
 */
export function extractApiKey(request: Request | {
  headers: Headers;
  searchParams?: URLSearchParams;
  nextUrl?: { searchParams: URLSearchParams };
  url?: string;
}): string | null {
  // 1. Check Headers (X-Badrock-Key, Authorization: Bearer ...)
  const headers = request.headers;
  if (headers) {
    const xApiKey = headers.get("x-badrock-key") || headers.get("X-Badrock-Key");
    if (xApiKey?.trim()) {
      return xApiKey.trim();
    }

    const authHeader = headers.get("authorization") || headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) return token;
    }
  }

  // 2. Check query parameters
  if ("nextUrl" in request && request.nextUrl?.searchParams) {
    const paramKey = request.nextUrl.searchParams.get("api_key") || request.nextUrl.searchParams.get("key");
    if (paramKey?.trim()) return paramKey.trim();
  }

  if ("searchParams" in request && request.searchParams) {
    const paramKey = request.searchParams.get("api_key") || request.searchParams.get("key");
    if (paramKey?.trim()) return paramKey.trim();
  }

  if ("url" in request && typeof request.url === "string") {
    try {
      const parsedUrl = new URL(request.url, "http://localhost:3000");
      const paramKey = parsedUrl.searchParams.get("api_key") || parsedUrl.searchParams.get("key");
      if (paramKey?.trim()) return paramKey.trim();
    } catch {
      // Ignore URL parse error
    }
  }

  return null;
}

export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const xApiKey = headers.get("x-badrock-key") || headers.get("X-Badrock-Key");
  if (xApiKey?.trim()) {
    return xApiKey.trim();
  }

  const authHeader = headers.get("authorization") || headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  return null;
}

export function matchesAllowedDomain(origin: string, allowedDomainsStr: string): boolean {
  if (!allowedDomainsStr.trim() || allowedDomainsStr.trim() === "*") {
    return true;
  }

  let originHost = origin.trim().toLowerCase();
  try {
    if (originHost.startsWith("http://") || originHost.startsWith("https://")) {
      originHost = new URL(originHost).hostname.toLowerCase();
    }
  } catch {
    // Keep raw string
  }

  // Strip ports if present
  originHost = originHost.split(":")[0];

  const allowedList = allowedDomainsStr
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0])
    .filter(Boolean);

  if (allowedList.length === 0) return true;

  return allowedList.some((allowed) => {
    if (allowed === originHost) return true;
    if (allowed.startsWith("*.") && originHost.endsWith(allowed.slice(1))) return true;
    if (originHost.endsWith(`.${allowed}`)) return true;
    return false;
  });
}

export async function validateApiKey(key: string, origin?: string): Promise<ApiKeyValidationResult> {
  const cleanKey = key?.trim();
  if (!cleanKey) {
    return {
      valid: false,
      error: "API Key es requerida. Proporciona el header X-Badrock-Key, Authorization: Bearer <key>, o el parámetro ?api_key=<key>.",
    };
  }

  // Check master key from env if configured
  const envMasterKey = process.env.BADROCK_API_KEY || process.env.BADROCK_MASTER_KEY;
  if (envMasterKey && cleanKey === envMasterKey) {
    return {
      valid: true,
      apiKey: {
        id: "env-master",
        key: envMasterKey,
        name: "Master Key (Environment)",
        allowedDomains: "*",
        rateLimitPerMinute: 1000,
        requestCount: 0,
        lastUsedAt: new Date(),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: cleanKey },
    });

    if (!apiKey) {
      return { valid: false, error: "API Key inválida o inexistente." };
    }

    if (!apiKey.active) {
      return { valid: false, error: "API Key inactiva o revocada." };
    }

    if (apiKey.allowedDomains && origin) {
      const allowed = matchesAllowedDomain(origin, apiKey.allowedDomains);
      if (!allowed) {
        return {
          valid: false,
          error: `Origen no autorizado ('${origin}'). Esta API Key solo permite peticiones desde: ${apiKey.allowedDomains}`,
        };
      }
    }

    // Rate limiting: sliding window 60s
    const now = Date.now();
    const windowMs = 60_000;
    const timestamps = (keyRateBuckets.get(apiKey.id) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= apiKey.rateLimitPerMinute) {
      keyRateBuckets.set(apiKey.id, timestamps);
      return {
        valid: false,
        error: `Límite de solicitudes por minuto excedido (${apiKey.rateLimitPerMinute} req/min). Por favor espera unos momentos.`,
      };
    }

    timestamps.push(now);
    keyRateBuckets.set(apiKey.id, timestamps);

    // Update requestCount and lastUsedAt
    try {
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: {
          requestCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } catch (updateErr) {
      console.warn("[apiKeyAuth] No se pudo actualizar estadísticas de uso:", updateErr);
    }

    return { valid: true, apiKey };
  } catch (error: any) {
    console.error("[apiKeyAuth] Error validando API Key:", error);
    return { valid: false, error: "Error interno al validar la API Key." };
  }
}

/**
 * Ensures there is at least one active API Key in the database on first run.
 */
export async function getOrCreateDefaultApiKey(): Promise<ApiKey> {
  const existing = await prisma.apiKey.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  const defaultKey = `bdrk_live_master_${crypto.randomBytes(16).toString("hex")}`;
  const created = await prisma.apiKey.create({
    data: {
      key: defaultKey,
      name: "Master API Key (Predeterminada)",
      allowedDomains: "*",
      rateLimitPerMinute: 120,
      active: true,
    },
  });

  return created;
}
