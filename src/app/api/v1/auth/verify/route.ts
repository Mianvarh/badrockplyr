import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, validateApiKey } from "@/lib/apiKeyAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleVerification(request);
}

export async function POST(request: NextRequest) {
  return handleVerification(request);
}

async function handleVerification(request: NextRequest) {
  try {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: "API Key requerida. Pasa el header X-Badrock-Key, Bearer token, o el parámetro ?api_key=...",
        },
        { status: 401 }
      );
    }

    const origin =
      request.headers.get("origin") || request.headers.get("referer") || undefined;
    const authResult = await validateApiKey(apiKey, origin);

    if (!authResult.valid) {
      const isRateLimit = authResult.error?.includes("Límite");
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: authResult.error,
        },
        { status: isRateLimit ? 429 : 403 }
      );
    }

    const keyData = authResult.apiKey!;

    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        id: keyData.id,
        name: keyData.name,
        key: `${keyData.key.slice(0, 14)}...${keyData.key.slice(-4)}`,
        active: keyData.active,
        allowedDomains: keyData.allowedDomains || "*",
        rateLimitPerMinute: keyData.rateLimitPerMinute,
        requestCount: keyData.requestCount,
        lastUsedAt: keyData.lastUsedAt,
        message: "API Key válida y lista para operar con Badrock REST API.",
      },
    });
  } catch (error: any) {
    console.error("[API v1 Auth Verify] Error:", error);
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: error.message || "Error interno al verificar la API Key.",
      },
      { status: 500 }
    );
  }
}
