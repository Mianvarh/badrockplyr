"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSourceSite(data: {
  name: string;
  allowedDomain: string;
  baseUrl: string;
  searchMode: string;
  active: boolean;
  priority: number;
  usePlaywright: boolean;
  videoSelector?: string;
  videoAttribute?: string;
  qualitySelector?: string;
  qualityAttribute?: string;
  languageSelector?: string;
  languageAttribute?: string;
  tmdbSelector?: string;
  tmdbAttribute?: string;
  subtitleSelector?: string;
  subtitleAttribute?: string;
}) {
  try {
    const source = await prisma.sourceSite.create({
      data: {
        name: data.name.trim(),
        allowedDomain: data.allowedDomain.trim(),
        baseUrl: data.baseUrl.trim(),
        searchMode: data.searchMode,
        active: data.active,
        priority: Number(data.priority) || 0,
        usePlaywright: data.usePlaywright,
        videoSelector: data.videoSelector?.trim() || null,
        videoAttribute: data.videoAttribute?.trim() || null,
        qualitySelector: data.qualitySelector?.trim() || null,
        qualityAttribute: data.qualityAttribute?.trim() || null,
        languageSelector: data.languageSelector?.trim() || null,
        languageAttribute: data.languageAttribute?.trim() || null,
        tmdbSelector: data.tmdbSelector?.trim() || null,
        tmdbAttribute: data.tmdbAttribute?.trim() || null,
        subtitleSelector: data.subtitleSelector?.trim() || null,
        subtitleAttribute: data.subtitleAttribute?.trim() || null
      }
    });

    revalidatePath("/dashboard/sources");
    revalidatePath("/dashboard/generated-links");

    return { success: true, source };
  } catch (err: any) {
    console.error("Error creating source site:", err);
    return { success: false, error: err.message || "Error al crear la fuente." };
  }
}

export async function deleteSourceSite(id: string) {
  try {
    await prisma.sourceSite.delete({ where: { id } });

    revalidatePath("/dashboard/sources");
    revalidatePath("/dashboard/generated-links");

    return { success: true };
  } catch (err: any) {
    console.error("Error deleting source site:", err);
    return { success: false, error: err.message || "Error al eliminar la fuente." };
  }
}
