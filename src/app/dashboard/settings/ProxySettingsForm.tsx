"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Activity, AlertTriangle, Check, Clock3, FileUp, Plus, RefreshCw, Save, Trash2, WifiOff } from "lucide-react";
import { saveProxySettings, testProxyHealth } from "@/app/dashboard/settings/actions";
import type { ProxyGroup, ProxyMode, StoredProxyConfig } from "@/lib/proxyConfig";
import type { ProxyHealthReport, ProxyHealthStatus } from "@/lib/proxyHealth";

function uid() {
  return `proxy-group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseProxyList(input: string) {
  const normalize = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const parts = trimmed.split(":").map((part) => part.trim());
    if (parts.length >= 4) {
      const [host, port, username, ...passwordParts] = parts;
      const password = passwordParts.join(":");
      if (!host || !port || !username || !password) return null;
      return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/`;
    }
    return null;
  };

  return Array.from(new Set(
    input
      .split(/[\n,]+/)
      .map((line) => normalize(line))
      .filter((value): value is string => Boolean(value))
  ));
}

function redact(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "usuario";
      url.password = "clave";
    }
    return url.toString();
  } catch {
    return value;
  }
}

type Props = {
  initialConfig: StoredProxyConfig;
  initialHealth: ProxyHealthReport | null;
};

function statusLabel(status: ProxyHealthStatus) {
  if (status === "ok") return "OK";
  if (status === "slow") return "Lento";
  if (status === "limited") return "Limitado";
  return "Falla";
}

function statusClass(status: ProxyHealthStatus) {
  if (status === "ok") return "bg-emerald-950/50 text-emerald-300 border-emerald-500/20";
  if (status === "slow") return "bg-amber-950/50 text-amber-300 border-amber-500/20";
  if (status === "limited") return "bg-orange-950/50 text-orange-300 border-orange-500/20";
  return "bg-rose-950/50 text-rose-300 border-rose-500/20";
}

function formatDate(value?: string) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ProxySettingsForm({ initialConfig, initialHealth }: Props) {
  const [mode, setMode] = useState<ProxyMode>(initialConfig.mode);
  const [groups, setGroups] = useState<ProxyGroup[]>(initialConfig.groups);
  const [selectedGroupId, setSelectedGroupId] = useState(initialConfig.groups[0]?.id || "");
  const [pasteValue, setPasteValue] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState<ProxyHealthReport | null>(initialHealth);
  const [isPending, startTransition] = useTransition();
  const [isHealthPending, startHealthTransition] = useTransition();

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0];
  const totalProxies = useMemo(
    () => groups.filter((group) => group.enabled).reduce((sum, group) => sum + group.proxies.length, 0),
    [groups]
  );

  const updateGroup = (id: string, updater: (group: ProxyGroup) => ProxyGroup) => {
    setGroups((current) => current.map((group) => group.id === id ? updater(group) : group));
  };

  const addGroup = () => {
    const next = { id: uid(), name: `Cuenta ${groups.length + 1}`, enabled: true, proxies: [] };
    setGroups((current) => [...current, next]);
    setSelectedGroupId(next.id);
    setPasteValue("");
  };

  const addProxiesToSelected = (text: string) => {
    if (!selectedGroup) return;
    const parsed = parseProxyList(text);
    updateGroup(selectedGroup.id, (group) => ({
      ...group,
      proxies: Array.from(new Set([...group.proxies, ...parsed])),
    }));
    setPasteValue("");
    setMessage(`${parsed.length} proxies cargados en ${selectedGroup.name}.`);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    addProxiesToSelected(text);
  };

  const save = () => {
    setMessage("");
    startTransition(async () => {
      const result = await saveProxySettings({ mode, groups });
      setGroups(result.config.groups);
      setMode(result.config.mode);
      setSelectedGroupId(result.config.groups[0]?.id || "");
      setMessage("Configuración de proxies guardada.");
    });
  };

  const runHealthCheck = () => {
    setMessage("");
    startHealthTransition(async () => {
      const result = await testProxyHealth();
      setHealth(result.report);
      const summary = result.report.summary;
      setMessage(`Chequeo completado: ${summary.ok + summary.slow}/${summary.total} proxies utilizables.`);
    });
  };

  const healthTone = health?.summary.risk === "good"
    ? "border-emerald-500/20 bg-emerald-950/10 text-emerald-300"
    : health?.summary.risk === "warning"
      ? "border-amber-500/20 bg-amber-950/10 text-amber-300"
      : "border-rose-500/20 bg-rose-950/10 text-rose-300";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Proxies de scraping</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Activos: {totalProxies} proxies en {groups.filter((group) => group.enabled).length} cuentas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as ProxyMode)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="optional">Optional</option>
            <option value="required">Required</option>
            <option value="off">Off</option>
          </select>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
        </div>
      </div>

      <div className={`border rounded-xl p-4 space-y-4 ${healthTone}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {health?.summary.risk === "critical" ? (
              <WifiOff className="h-5 w-5 shrink-0 mt-0.5" />
            ) : health?.summary.risk === "warning" ? (
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            ) : (
              <Activity className="h-5 w-5 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-semibold">Estado de proxies</h4>
              <p className="text-xs text-zinc-400 mt-1">
                {health
                  ? `${health.summary.healthyPercent}% saludable. Último chequeo: ${formatDate(health.checkedAt)}.`
                  : "Aún no hay chequeos guardados. Ejecuta una prueba para ver el estado antes de que el scraper falle."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={isHealthPending || totalProxies === 0}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/50 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-100 text-xs font-semibold rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${isHealthPending ? "animate-spin" : ""}`} />
            Probar proxies ahora
          </button>
        </div>

        {health && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Total</div>
                <div className="text-lg font-bold text-zinc-100">{health.summary.total}</div>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">OK</div>
                <div className="text-lg font-bold text-emerald-300">{health.summary.ok}</div>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Lentos</div>
                <div className="text-lg font-bold text-amber-300">{health.summary.slow}</div>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Limitados</div>
                <div className="text-lg font-bold text-orange-300">{health.summary.limited}</div>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Fallas</div>
                <div className="text-lg font-bold text-rose-300">{health.summary.failed}</div>
              </div>
            </div>

            {health.summary.risk !== "good" && (
              <div className="flex items-start gap-2 text-xs text-zinc-300 bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
                <Clock3 className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
                <span>
                  Señal preventiva: si aparecen muchos proxies limitados o fallando, conviene cargar otra cuenta antes de hacer búsquedas masivas.
                  Esto no mide el tráfico exacto de Webshare; lo estima por salud real, límites y errores.
                </span>
              </div>
            )}

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-72 overflow-auto">
              {health.results.map((result, index) => (
                <div key={`${result.groupId}-${result.redactedProxy}-${index}`} className="grid grid-cols-1 lg:grid-cols-[140px_1fr_90px_90px] gap-2 px-3 py-2 border-b border-zinc-900 last:border-b-0 text-xs">
                  <span className="font-medium text-zinc-300 truncate">{result.groupName}</span>
                  <span className="text-zinc-400 truncate">{result.redactedProxy}</span>
                  <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(result.status)}`}>
                    {statusLabel(result.status)}
                  </span>
                  <span className="text-zinc-500 text-right">
                    {result.latencyMs == null ? "--" : `${result.latencyMs} ms`}
                  </span>
                  {(result.error || result.ip) && (
                    <span className="lg:col-span-4 text-[10px] text-zinc-500 truncate">
                      {result.ip ? `IP detectada: ${result.ip}` : result.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-2">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                setSelectedGroupId(group.id);
                setPasteValue("");
              }}
              className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                selectedGroup?.id === group.id
                  ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-100"
                  : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{group.name}</span>
                <span className={group.enabled ? "text-emerald-400" : "text-zinc-600"}>
                  {group.enabled ? "ON" : "OFF"}
                </span>
              </span>
              <span className="block text-[10px] text-zinc-500 mt-0.5">{group.proxies.length} proxies</span>
            </button>
          ))}
          <button
            type="button"
            onClick={addGroup}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-800 text-xs text-zinc-300 hover:border-cyan-500/50"
          >
            <Plus className="h-4 w-4" />
            Nueva cuenta
          </button>
        </div>

        {selectedGroup ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                value={selectedGroup.name}
                onChange={(event) => updateGroup(selectedGroup.id, (group) => ({ ...group, name: event.target.value }))}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <label className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 cursor-pointer hover:border-cyan-500/50">
                <input
                  type="checkbox"
                  checked={selectedGroup.enabled}
                  onChange={(event) => updateGroup(selectedGroup.id, (group) => ({ ...group, enabled: event.target.checked }))}
                  className="accent-cyan-500"
                />
                Activa
              </label>
              <button
                type="button"
                onClick={() => {
                  setGroups((current) => current.filter((group) => group.id !== selectedGroup.id));
                  setSelectedGroupId(groups.find((group) => group.id !== selectedGroup.id)?.id || "");
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-950/30 border border-rose-500/30 rounded-lg text-xs text-rose-200 hover:bg-rose-950/50"
              >
                <Trash2 className="h-4 w-4" />
                Borrar
              </button>
            </div>

            <div className="space-y-2">
              <textarea
                value={pasteValue}
                onChange={(event) => setPasteValue(event.target.value)}
                placeholder="host:puerto:usuario:clave o http://usuario:clave@host:puerto"
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => addProxiesToSelected(pasteValue)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                  Agregar pegados
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded-lg cursor-pointer">
                  <FileUp className="h-4 w-4" />
                  Cargar TXT
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-56 overflow-auto">
              {selectedGroup.proxies.length === 0 ? (
                <div className="p-4 text-xs text-zinc-500">No hay proxies cargados en esta cuenta.</div>
              ) : (
                selectedGroup.proxies.map((proxy) => (
                  <div key={proxy} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-900 last:border-b-0">
                    <span className="text-xs text-zinc-300 truncate">{redact(proxy)}</span>
                    <button
                      type="button"
                      onClick={() => updateGroup(selectedGroup.id, (group) => ({ ...group, proxies: group.proxies.filter((item) => item !== proxy) }))}
                      className="text-zinc-500 hover:text-rose-300"
                      aria-label="Eliminar proxy"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 text-xs text-zinc-500">
            Crea una cuenta de proxies para empezar.
          </div>
        )}
      </div>

      {message && (
        <div className="inline-flex items-center gap-2 text-xs text-emerald-300">
          <Check className="h-4 w-4" />
          {message}
        </div>
      )}
    </div>
  );
}
