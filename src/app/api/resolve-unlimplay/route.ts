import { NextRequest, NextResponse } from "next/server";
import { resolveUnlimplay } from "@/services/unlimplay/resolver";
import { assertAllowedExternalUrl } from "@/lib/urlPolicy";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "El parámetro 'url' es requerido." },
        { status: 400 }
      );
    }

    if (!url.startsWith("https://unlimplay.com/embed/")) {
      return NextResponse.json(
        { error: "La URL provista no es un enlace de embed válido de Unlimplay." },
        { status: 400 }
      );
    }

    await assertAllowedExternalUrl(url);

    console.log(`[API Resolve] Resolving: ${url}`);
    const resolvedData = await resolveUnlimplay(url);
    
    // Return resolved HLS configuration
    return NextResponse.json({
      success: true,
      data: resolvedData
    });
  } catch (error: any) {
    console.error("Error in resolve-unlimplay API:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al resolver el enlace de Unlimplay." },
      { status: 500 }
    );
  }
}
