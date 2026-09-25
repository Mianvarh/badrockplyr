import React from "react";
import { prisma } from "@/lib/prisma";
import SourcesManager from "./SourcesManager";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await prisma.sourceSite.findMany({
    orderBy: { priority: "desc" }
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fuentes Scraper</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Administra las webs externas autorizadas de las cuales se extraerán y verificarán los videos.
        </p>
      </div>

      <SourcesManager initialSources={sources} />
    </div>
  );
}
