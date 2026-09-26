"use client";

import React, { useState, useTransition } from "react";
import {
  Key,
  Plus,
  Copy,
  Check,
  Shield,
  Trash2,
  Power,
  RefreshCw,
  Globe,
  Gauge,
  Code2,
  Play,
  Terminal,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
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
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState(false);

  // Live API Tester State
  const [testKey, setTestKey] = useState<string>(keys[0]?.key || "");
  const [testId, setTestId] = useState<string>("tt15398776");
  const [testType, setTestType] = useState<"movie" | "tv" | "anime">("movie");
  const [testSeason, setTestSeason] = useState<number>(1);
  const [testEpisode, setTestEpisode] = useState<number>(1);
  const [testAuthMode, setTestAuthMode] = useState<"header_x" | "header_bearer" | "query_param">("header_x");
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testerTab, setTesterTab] = useState<"json" | "preview">("json");

  // Code Snippet Tab
  const [codeSnippetTab, setCodeSnippetTab] = useState<"curl" | "wordpress" | "js" | "iframe">("curl");

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
        if (!testKey) {
          setTestKey(res.generatedKey);
        }
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

  const copyToClipboard = (text: string, isSnippet = false) => {
    navigator.clipboard.writeText(text);
    if (isSnippet) {
      setCopiedCodeSnippet(true);
      setTimeout(() => setCopiedCodeSnippet(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const executeLiveTest = async () => {
    const keyToUse = testKey.trim() || keys[0]?.key;
    if (!keyToUse) {
      alert("Por favor selecciona o introduce una API Key para probar.");
      return;
    }

    setTestLoading(true);
    setTestResult(null);
    setTestStatus(null);
    setTestLatency(null);

    const startTime = performance.now();

    try {
      let targetUrl = `${baseUrl}/api/v1/media/${encodeURIComponent(testId)}?type=${testType}`;
      if (testType !== "movie") {
        targetUrl += `&season=${testSeason}&episode=${testEpisode}`;
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (testAuthMode === "header_x") {
        headers["X-Badrock-Key"] = keyToUse;
      } else if (testAuthMode === "header_bearer") {
        headers["Authorization"] = `Bearer ${keyToUse}`;
      } else {
        targetUrl += `&api_key=${encodeURIComponent(keyToUse)}`;
      }

      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
      });

      const latencyMs = Math.round(performance.now() - startTime);
      setTestLatency(latencyMs);
      setTestStatus(response.status);

      const json = await response.json();
      setTestResult(json);
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setTestLatency(latencyMs);
      setTestStatus(500);
      setTestResult({
        success: false,
        error: err.message || "Error al conectar con la API.",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const activeCount = keys.filter((k) => k.active).length;
  const totalRequests = keys.reduce((acc, k) => acc + k.requestCount, 0);

  const selectedOrFirstKey = testKey || keys[0]?.key || "bdrk_live_xxxxxxxxxxxxxxxx";

  // Code Snippet Generators
  const getCodeSnippet = () => {
    switch (codeSnippetTab) {
      case "curl":
        return `# 1. Autenticación por Header Recomendada:
curl -X GET "${baseUrl}/api/v1/media/${testId}?type=${testType}" \\
  -H "X-Badrock-Key: ${selectedOrFirstKey}"

# 2. Opcional mediante Query Parameter:
curl -X GET "${baseUrl}/api/v1/media/${testId}?type=${testType}&api_key=${selectedOrFirstKey}"`;

      case "wordpress":
        return `<?php
// WordPress PHP Integration:
$response = wp_remote_get("${baseUrl}/api/v1/media/${testId}?type=${testType}", [
    'timeout' => 20,
    'headers' => [
        'X-Badrock-Key' => '${selectedOrFirstKey}',
        'Accept' => 'application/json'
    ]
]);

if (!is_wp_error($response)) {
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if ($data['success']) {
        $embed_iframe = $data['data']['embedIframe'];
        $servers = $data['data']['servers'];
        // Servidor VIP siempre es el último servidor en la lista
    }
}`;

      case "js":
        return `// JavaScript / Node.js fetch:
const response = await fetch("${baseUrl}/api/v1/media/${testId}?type=${testType}", {
  headers: {
    "X-Badrock-Key": "${selectedOrFirstKey}",
    "Accept": "application/json"
  }
});

const result = await response.json();
console.log("Servidores disponibles:", result.data.servers);`;

      case "iframe":
        return `<!-- Direct Badrock Embed Player -->
<iframe
  src="${baseUrl}/play/embed/${testType === "movie" ? "movie" : "tv"}/${testId}${testType !== "movie" ? `/${testSeason}/${testEpisode}` : ""}"
  width="100%"
  height="100%"
  style="border: none; aspect-ratio: 16/9; border-radius: 12px;"
  allow="autoplay; encrypted-media; fullscreen"
  allowfullscreen>
</iframe>`;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Key className="h-6 w-6 text-cyan-400" />
            Gestión de API Keys (REST API v1)
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Genera y administra credenciales seguras para consultar títulos, streams de Google Drive y embeds de Badrockplyr.
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
            <p className="text-xs font-medium text-zinc-400">Peticiones Totales</p>
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
            Copia esta clave ahora. Por seguridad, utilízala en tus llamadas HTTP mediante el header <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">X-Badrock-Key</code>, <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code> o como parámetro <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">?api_key=&lt;key&gt;</code>.
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

      {/* Interactive Live API Tester Widget */}
      <div className="bg-zinc-900/90 border border-cyan-500/30 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-cyan-950/30 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950/70 border border-cyan-500/30 rounded-lg text-cyan-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Consola Interactiva de Pruebas (Live API Tester)
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  REST v1
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Prueba consultas en tiempo real con tus API Keys para verificar resolución de servidores y embed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTestId("tt15398776");
                setTestType("movie");
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Oppenheimer (tt15398776)
            </button>
            <button
              onClick={() => {
                setTestId("550");
                setTestType("movie");
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Fight Club (550)
            </button>
            <button
              onClick={() => {
                setTestId("tt0903747");
                setTestType("tv");
                setTestSeason(1);
                setTestEpisode(1);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Breaking Bad S01E01
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Controls Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">API Key a Utilizar</label>
              <select
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                {keys.map((k) => (
                  <option key={k.id} value={k.key}>
                    {k.name} ({k.key.slice(0, 12)}...) {k.active ? "" : "[Revocada]"}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">ID (TMDb / IMDb)</label>
              <input
                type="text"
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                placeholder="tt15398776 o 550"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Tipo de Contenido</label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="movie">Película (Movie)</option>
                <option value="tv">Serie (TV Show)</option>
                <option value="anime">Anime</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Método de Autenticación</label>
              <select
                value={testAuthMode}
                onChange={(e) => setTestAuthMode(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="header_x">Header X-Badrock-Key</option>
                <option value="header_bearer">Header Authorization: Bearer</option>
                <option value="query_param">Query Param (?api_key=...)</option>
              </select>
            </div>
          </div>

          {/* Conditional Season & Episode if TV */}
          {testType !== "movie" && (
            <div className="flex items-center gap-4 p-3 bg-zinc-950/50 border border-zinc-800/80 rounded-xl">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">Temporada:</label>
                <input
                  type="number"
                  min="1"
                  value={testSeason}
                  onChange={(e) => setTestSeason(Number(e.target.value))}
                  className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">Episodio:</label>
                <input
                  type="number"
                  min="1"
                  value={testEpisode}
                  onChange={(e) => setTestEpisode(Number(e.target.value))}
                  className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* Run Button */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-zinc-400">
              Endpoint:{" "}
              <code className="text-cyan-300 bg-zinc-950 px-2 py-0.5 rounded font-mono">
                GET /api/v1/media/{testId}?type={testType}
                {testAuthMode === "query_param" ? `&api_key=...` : ""}
              </code>
            </div>

            <button
              onClick={executeLiveTest}
              disabled={testLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 via-cyan-500 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-950/60 border border-cyan-400/30 transition-all cursor-pointer disabled:opacity-60"
            >
              {testLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Ejecutando Petición...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Probar API Key en Vivo
                </>
              )}
            </button>
          </div>

          {/* Result Section */}
          {testResult && (
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
              {/* Result Header Bar */}
              <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {testStatus === 200 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      200 OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-500/30">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {testStatus} Error
                    </span>
                  )}

                  {testLatency !== null && (
                    <span className="text-xs text-zinc-400 font-mono">
                      Latencia: <strong className="text-zinc-200">{testLatency} ms</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTesterTab("json")}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      testerTab === "json"
                        ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 font-semibold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    JSON
                  </button>
                  {testResult.success && (
                    <button
                      onClick={() => setTesterTab("preview")}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        testerTab === "preview"
                          ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 font-semibold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Servidores & Embed ({testResult.data?.servers?.length || 0})
                    </button>
                  )}
                </div>
              </div>

              {/* JSON View */}
              {testerTab === "json" && (
                <div className="p-4 relative">
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2))}
                    className="absolute top-4 right-4 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] flex items-center gap-1 border border-zinc-700"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar JSON
                  </button>
                  <pre className="font-mono text-xs text-zinc-300 max-h-96 overflow-y-auto overflow-x-auto whitespace-pre leading-relaxed">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}

              {/* Preview & Servidores View */}
              {testerTab === "preview" && testResult.data && (
                <div className="p-5 space-y-5">
                  {/* Media Metadata Card */}
                  <div className="flex items-start gap-4 p-4 bg-zinc-900/60 rounded-xl border border-zinc-800/80">
                    {testResult.data.posterUrl && (
                      <img
                        src={testResult.data.posterUrl}
                        alt={testResult.data.title}
                        className="w-20 rounded-lg shadow object-cover shrink-0"
                      />
                    )}
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {testResult.data.title}
                        <span className="text-zinc-400 text-xs font-normal">
                          ({testResult.data.year || "N/A"})
                        </span>
                      </h4>
                      <p className="text-xs text-zinc-400 line-clamp-2">
                        {testResult.data.overview || "Sin descripción."}
                      </p>
                      <div className="flex items-center gap-2 pt-2 text-[11px]">
                        <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                          TMDb ID: {testResult.data.tmdbId}
                        </span>
                        {testResult.data.imdbId && (
                          <span className="font-mono bg-amber-950/60 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                            IMDb ID: {testResult.data.imdbId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Servidores Table */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                      <Server className="h-4 w-4 text-cyan-400" />
                      Servidores de Video Resueltos (Garantía Servidor VIP al final):
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {testResult.data.servers?.map((srv: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border flex flex-col justify-between ${
                            srv.isVip
                              ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                              : "bg-zinc-900/80 border-zinc-800 text-zinc-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-xs flex items-center gap-1.5">
                              {srv.isVip && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
                              {srv.name}
                            </span>
                            {srv.isVip ? (
                              <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/40">
                                VIP Propio
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {srv.source}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-white/5">
                            <span>{srv.language}</span>
                            <span className="font-mono font-medium text-cyan-400">{srv.quality}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Embed Iframe Preview */}
                  {testResult.data.embedPlayerUrl && (
                    <div className="space-y-2 pt-2">
                      <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                        <Play className="h-4 w-4 text-cyan-400" />
                        Vista Previa de Reproductor Incrustado:
                      </h5>
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-black">
                        <iframe
                          src={testResult.data.embedPlayerUrl}
                          className="w-full h-full border-0"
                          allow="autoplay; encrypted-media; fullscreen"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Code Integration Hub */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950/60 border border-cyan-800/30 rounded-xl text-cyan-400">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Hub de Integración (Snippets)</h3>
              <p className="text-xs text-zinc-400">
                Ejemplos listos para copiar y pegar en WordPress, cURL o tus aplicaciones web.
              </p>
            </div>
          </div>

          {/* Snippet Tabs */}
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setCodeSnippetTab("curl")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                codeSnippetTab === "curl"
                  ? "bg-cyan-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              cURL
            </button>
            <button
              onClick={() => setCodeSnippetTab("wordpress")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                codeSnippetTab === "wordpress"
                  ? "bg-cyan-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              WordPress PHP
            </button>
            <button
              onClick={() => setCodeSnippetTab("js")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                codeSnippetTab === "js"
                  ? "bg-cyan-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              JavaScript
            </button>
            <button
              onClick={() => setCodeSnippetTab("iframe")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                codeSnippetTab === "iframe"
                  ? "bg-cyan-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              Embed iFrame
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono text-zinc-300">
              Snippet dinámico con clave: <strong className="text-cyan-300 font-mono">{selectedOrFirstKey.slice(0, 16)}...</strong>
            </span>
            <button
              onClick={() => copyToClipboard(getCodeSnippet(), true)}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              {copiedCodeSnippet ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedCodeSnippet ? "Copiado al portapapeles" : "Copiar Snippet"}
            </button>
          </div>
          <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
            {getCodeSnippet()}
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
                  Valida cabeceras <code className="text-zinc-400">Origin</code> / <code className="text-zinc-400">Referer</code> para prevenir uso no autorizado.
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
