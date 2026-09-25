import React from "react";
import { Save, ShieldAlert } from "lucide-react";
import ProxySettingsForm from "@/app/dashboard/settings/ProxySettingsForm";
import { getStoredProxyConfig } from "@/lib/proxySettingsStore";
import { getLastProxyHealthReport } from "@/lib/proxyHealth";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const proxyConfig = await getStoredProxyConfig();
  const proxyHealth = await getLastProxyHealthReport();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración del Sistema</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Configura los valores globales del scraper, la API y servicios externos.
        </p>
      </div>

      <ProxySettingsForm initialConfig={proxyConfig} initialHealth={proxyHealth} />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">The Movie Database (TMDB)</h3>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Clave API (TMDB_API_KEY)</label>
            <input
              type="password"
              placeholder="••••••••••••••••••••••••"
              disabled
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-700 opacity-60 cursor-not-allowed focus:outline-none focus:border-cyan-500"
            />
            <p className="text-[10px] text-zinc-500">
              Se utiliza para importar metadatos, posters e información oficial de películas y series.
            </p>
          </div>
        </div>

        <hr className="border-zinc-850" />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">Parámetros del Scraper</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Timeout de búsqueda (ms)</label>
              <input
                type="number"
                defaultValue={15000}
                disabled
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 opacity-60 cursor-not-allowed focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Reintentos por fuente</label>
              <input
                type="number"
                defaultValue={2}
                disabled
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 opacity-60 cursor-not-allowed focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        <hr className="border-zinc-850" />

        <div className="flex justify-end">
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-zinc-50 text-xs font-semibold rounded-lg shadow-lg border border-cyan-500/30 opacity-60 cursor-not-allowed transition-colors"
          >
            <Save className="h-4 w-4" />
            Guardar Configuración
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-amber-400">Configuración dinámica</p>
          <p className="text-zinc-400 mt-0.5">
            Los proxies se guardan en la base de datos y se aplican sin tocar el código. Si no hay configuración guardada, se usan los valores de `.env`.
          </p>
        </div>
      </div>
    </div>
  );
}
