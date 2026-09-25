import React from "react";
import { HardDrive } from "lucide-react";
import PrivateMediaManager from "./PrivateMediaManager";
import { listPrivateMediaSources } from "./actions";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function PrivateMediaPage() {
  const result = await listPrivateMediaSources();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center">
          <HardDrive className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuentes Propias</h1>
          <p className="text-sm text-zinc-400 mt-1.5">
            Importa videos propios para que Badrockplyr los use como opción limpia antes de los scrapers externos.
          </p>
        </div>
      </div>

      <PrivateMediaManager
        initialItems={result.items}
        initialFolders={result.folders}
        initialHealth={result.health}
        initialError={result.success ? null : result.error}
      />
    </div>
  );
}
