"use server";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultApiKey } from "@/lib/apiKeyAuth";

export async function listApiKeys() {
  const count = await prisma.apiKey.count();
  if (count === 0) {
    await getOrCreateDefaultApiKey();
  }
  return prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function generateApiKeyAction(data: {
  name: string;
  allowedDomains?: string;
  rateLimitPerMinute?: number;
}) {
  try {
    const name = data.name.trim();
    if (!name) {
      return { success: false, error: "El nombre de la API Key es requerido." };
    }

    const randomSuffix = crypto.randomBytes(20).toString("hex");
    const key = `bdrk_live_${randomSuffix}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name,
        allowedDomains: data.allowedDomains?.trim() || null,
        rateLimitPerMinute: data.rateLimitPerMinute ? Math.max(1, Number(data.rateLimitPerMinute)) : 60,
        active: true,
      },
    });

    revalidatePath("/dashboard/api-keys");
    return { success: true, apiKey, generatedKey: key };
  } catch (error: any) {
    console.error("[generateApiKeyAction] Error:", error);
    return { success: false, error: error.message || "Error al crear la API Key." };
  }
}

export async function revokeApiKeyAction(id: string) {
  try {
    await prisma.apiKey.update({
      where: { id },
      data: { active: false },
    });
    revalidatePath("/dashboard/api-keys");
    return { success: true };
  } catch (error: any) {
    console.error("[revokeApiKeyAction] Error:", error);
    return { success: false, error: error.message || "Error al revocar la API Key." };
  }
}

export async function activateApiKeyAction(id: string) {
  try {
    await prisma.apiKey.update({
      where: { id },
      data: { active: true },
    });
    revalidatePath("/dashboard/api-keys");
    return { success: true };
  } catch (error: any) {
    console.error("[activateApiKeyAction] Error:", error);
    return { success: false, error: error.message || "Error al activar la API Key." };
  }
}

export async function deleteApiKeyAction(id: string) {
  try {
    await prisma.apiKey.delete({
      where: { id },
    });
    revalidatePath("/dashboard/api-keys");
    return { success: true };
  } catch (error: any) {
    console.error("[deleteApiKeyAction] Error:", error);
    return { success: false, error: error.message || "Error al eliminar la API Key." };
  }
}
