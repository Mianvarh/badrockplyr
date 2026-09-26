"use client";

import React, { useState, useTransition } from "react";
import {
  Key,
  Plus,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  Trash2,
  Power,
  RefreshCw,
  Globe,
  Gauge,
  Clock,
  ExternalLink,
  Code2
} from "lucide-react";
import type { ApiKey } from "@prisma/client";
import {
  generateApiKeyAction,
  revokeApiKeyAction,
  activateApiKeyAction,
  deleteApiKeyAction,
} from "./actions";

interface ApiKeyManagerClientProps {
  initialKeys: ApiKey[];
  baseUrl: string;
}

export default function ApiKeyManagerClient({ initialKeys, baseUrl }: ApiKeyManagerClientProps) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  // New key form state
  const [name, setName] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [errorMsg, setErrorMsg] = useState("");

  // Newly generated key display
  const [justGeneratedKey, setJustGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Debes ingresar un nombre identificador.");
      return;
    }
    setErrorMsg("");

    startTransition(async () => {
      const res = await generateApiKeyAction({
        name,
        allowedDomains: allowedDomains || undefined,
        rateLimitPerMinute: rateLimit,
      });

      if (res.success && res.apiKey && res.generatedKey) {
        setKeys((prev) => [res.apiKey!, ...prev]);
        setJustGeneratedKey(res.generatedKey);
        setName("");
        setAllowedDomains("");
        setRateLimit(60);
        setShowCreateModal(false);
      } else {
        setErrorMsg(res.error || "Error al crear la API Key.");
      }
    });
  };

  const handleToggleActive = (keyItem: ApiKey) => {
    startTransition(async () => {
      if (keyItem.active) {
        const res = await revokeApiKeyAction(keyItem.id);
        if (res.success) {
          setKeys((prev) =>
            prev.map((k) => (k.id === keyItem.id ? { ...k, active: false } : k))
          );
        }
      } else {
        const res = await activateApiKeyAction(keyItem.id);
        if (res.success) {
          setKeys((prev) =>
            prev.map((k) => (k.id === keyItem.id ? { ...k, active: true } : k))
          );
        }
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Estás seguro de eliminar permanentemente esta API Key?")) return;

    startTransition(async () => {
      const res = await deleteApiKeyAction(id);
      if (res.success) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      }
    });
  };

  const copyToClipboard = (text: string, isCurl = false) => {
    navigator.clipboard.writeText(text);
    if (isCurl) {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const activeCount = keys.filter((k) => k.active).length;
  const totalRequests = keys.reduce((acc, k) => acc + k.requestCount, 0);

  const sampleCurl = `curl -X GET "${baseUrl}/api/v1/media/550" \\
  -H "X-Badrock-Key: ${keys[0]?.key || "bdrk_live_xxxxxxxxxxxxxxxx"}"`;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Key className="h-6 w-6 text-cyan-400" />
            Gestión de API Keys (REST API v1)
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Administra credenciales de acceso para consultar media, streams limpios y embeds externamente.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg("");
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-950/50 border border-cyan-400/30 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva API Key
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-zinc-400">Total API Keys</p>
            <p className="text-2xl font-bold text-white mt-1">{keys.length}</p>
          </div>
          <div className="p-3 bg-cyan-950/40 border border-cyan-800/30 rounded-xl text-cyan-400">
            <Key className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-zinc-400">Claves Activas</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/30 rounded-xl text-emerald-400">
            <Shield className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-zinc-400">Consultas Totales</p>
            <p className="text-2xl font-bold text-cyan-300 mt-1">{totalRequests.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-cyan-950/40 border border-cyan-800/30 rounded-xl text-cyan-300">
            <Gauge className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Just Generated Key Banner */}
      {justGeneratedKey && (
        <div className="p-5 bg-gradient-to-r from-emerald-950/40 to-zinc-900 border border-emerald-500/40 rounded-2xl space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-emerald-300">
                ¡Nueva API Key Generada Exitosamente!
              </h3>
            </div>
            <button
              onClick={() => setJustGeneratedKey(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          <p className="text-xs text-zinc-300">
            Copia esta clave ahora. Por seguridad, utilízala en tus llamadas HTTP mediante el header <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">X-Badrock-Key</code> o <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code>.
          </p>

          <div className="flex items-center gap-2 bg-zinc-950/90 border border-emerald-500/30 rounded-xl p-2.5">
            <code className="text-xs font-mono text-emerald-400 flex-1 break-all select-all">
              {justGeneratedKey}
            </code>
            <button
              onClick={() => copyToClipboard(justGeneratedKey)}
              className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/30 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey ? "Copiada" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {/* Table of Keys */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Claves Registradas</h2>
          <span className="text-xs text-zinc-500">{keys.length} clave(s)</span>
        </div>

        {keys.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Key className="h-10 w-10 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-400">No hay API Keys generadas.</p>
            <p className="text-xs text-zinc-600">
              Crea una nueva API Key para permitir acceso seguro a temas de WordPress o clientes externos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-zinc-400 font-medium">
                  <th className="py-3 px-4">Nombre / ID</th>
                  <th className="py-3 px-4">Clave</th>
                  <th className="py-3 px-4">Dominios</th>
                  <th className="py-3 px-4">Rate Limit</th>
                  <th className="py-3 px-4">Peticiones</th>
                  <th className="py-3 px-4">Último Uso</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {k.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-300">
                      <div className="flex items-center gap-1.5">
                        <span>{k.key.slice(0, 14)}...{k.key.slice(-4)}</span>
                        <button
                          onClick={() => copyToClipboard(k.key)}
                          title="Copiar clave completa"
                          className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">
                      {k.allowedDomains ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px]">
                          <Globe className="h-3 w-3 text-cyan-400" />
                          {k.allowedDomains}
                        </span>
                      ) : (
                        <span className="text-zinc-500 italic">Todos (*)</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300 font-mono">
                      {k.rateLimitPerMinute} req/min
                    </td>
                    <td className="py-3.5 px-4 text-cyan-300 font-mono font-semibold">
                      {k.requestCount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {k.lastUsedAt
                        ? new Intl.DateTimeFormat("es", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(k.lastUsedAt))
                        : "Nunca"}
                    </td>
                    <td className="py-3.5 px-4">
                      {k.active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/50 text-emerald-400 border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/50 text-rose-400 border border-rose-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                          Revocada
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        disabled={isPending}
                        onClick={() => handleToggleActive(k)}
                        title={k.active ? "Revocar API Key" : "Reactivar API Key"}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          k.active
                            ? "hover:bg-amber-950/40 text-amber-400 border-amber-500/30"
                            : "hover:bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => handleDelete(k.id)}
                        title="Eliminar permanentemente"
                        className="p-1.5 hover:bg-rose-950/40 text-rose-400 border border-rose-500/30 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick API Docs Card */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400">
          <Code2 className="h-5 w-5" />
          <h3 className="text-sm font-semibold text-white">Integración con REST API v1</h3>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Consulta metadatos, fuentes resueltas (incluyendo el <b>Servidor VIP</b>) y código embed para reproductores mediante el endpoint <code className="text-cyan-300">/api/v1/media/[id]</code>. Soporta TMDB ID numérico o IMDb ID (<code className="text-cyan-300">tt...</code>).
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono">Ejemplo de consulta cURL:</span>
            <button
              onClick={() => copyToClipboard(sampleCurl, true)}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              {copiedCurl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedCurl ? "Copiado" : "Copiar comando"}
            </button>
          </div>
          <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto">
            {sampleCurl}
          </pre>
        </div>
      </div>

      {/* Modal Nueva API Key */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-cyan-400" />
                Generar Nueva API Key
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-500 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Nombre / Identificador *</label>
                <input
                  type="text"
                  placeholder="Ej: DooPlay WordPress, App Móvil, Sitio Espejo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Dominios Permitidos <span className="text-zinc-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: misitio.com, *.miproveedor.net (vacío = cualquiera)"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-zinc-500">
                  Valida cabeceras <code className="text-zinc-400">Origin</code> / <code className="text-zinc-400">Referer</code> para prevenir robo de clave.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Límite de Consultas / Minuto</label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl shadow-lg border border-cyan-400/30 transition-all flex items-center gap-1.5"
                >
                  {isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Generar Clave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
