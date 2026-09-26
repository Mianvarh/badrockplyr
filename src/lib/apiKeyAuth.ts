import { prisma } from "@/lib/prisma";
import type { ApiKey } from "@prisma/client";

export type { ApiKey };

export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  apiKey?: ApiKey;
}

const keyRateBuckets = new Map<string, number[]>();

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
    return { valid: false, error: "API Key es requerida. Proporciona el header X-Badrock-Key o Authorization: Bearer <key>." };
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
        error: `Límite de solicitudes por minuto excedido (${apiKey.rateLimitPerMinute} req/min).`,
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
