import React from "react";
import { prisma } from "@/lib/prisma";
import { Clock, Play, AlertCircle, RefreshCw } from "lucide-react";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const logs = await prisma.refreshJobLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tareas & Workers</h1>
          <p className="text-sm text-zinc-400 mt-1.5">
            Monitoreo de tareas en segundo plano (BullMQ + Redis) para verificar la disponibilidad de enlaces y fallback.
          </p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700 opacity-60 cursor-not-allowed transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar Ahora
        </button>
      </div>

      {/* BullMQ status info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-mono text-zinc-500 block uppercase">Redis Connection</span>
          <span className="text-sm font-semibold text-zinc-300 block mt-2">redis://localhost:6379</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-medium bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 mt-3">
            Offline (Using SQLite dev context)
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-mono text-zinc-500 block uppercase">Frecuencia de revisión</span>
          <span className="text-sm font-semibold text-zinc-300 block mt-2">Cada hora (1h)</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-medium bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 mt-3">
            Programado vía Cron
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-mono text-zinc-500 block uppercase">Total Jobs Ejecutados</span>
          <span className="text-sm font-semibold text-zinc-300 block mt-2">{logs.length}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-medium bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 mt-3">
            Historial local
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-200 mb-4">Registro de Ejecuciones (Logs)</h2>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
            <Clock className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 font-medium">No hay logs de tareas aún</p>
            <p className="text-xs text-zinc-500 mt-1">
              Las ejecuciones se registrarán una vez que se inicialicen los workers de actualización.
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/25 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs font-semibold">
                    <th className="p-4">ID Job</th>
                    <th className="p-4">Inicio</th>
                    <th className="p-4">Fin</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850 text-sm">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="p-4 font-mono text-xs text-zinc-400">
                        {log.id.substring(0, 8)}...
                      </td>
                      <td className="p-4 text-xs text-zinc-400">
                        {new Date(log.startedAt).toLocaleString("es-ES")}
                      </td>
                      <td className="p-4 text-xs text-zinc-500">
                        {log.finishedAt ? new Date(log.finishedAt).toLocaleString("es-ES") : "—"}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono border ${
                          log.status === "COMPLETED"
                            ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                            : log.status === "RUNNING"
                            ? "bg-amber-950/20 text-amber-400 border-amber-500/20"
                            : "bg-rose-950/20 text-rose-400 border-rose-500/20"
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-zinc-450">
                        {log.message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
