"use client";

import React, { useState } from "react";
import { createSourceSite, deleteSourceSite } from "@/app/actions/sourceActions";
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings2,
  X,
  Save,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface SourceSiteData {
  id: string;
  name: string;
  allowedDomain: string;
  baseUrl: string;
  searchMode: string;
  active: boolean;
  priority: number;
  usePlaywright: boolean;
  videoSelector: string | null;
  videoAttribute: string | null;
  qualitySelector: string | null;
  qualityAttribute: string | null;
  languageSelector: string | null;
  languageAttribute: string | null;
  tmdbSelector: string | null;
  tmdbAttribute: string | null;
  subtitleSelector: string | null;
  subtitleAttribute: string | null;
}

interface SourcesManagerProps {
  initialSources: SourceSiteData[];
}

export default function SourcesManager({ initialSources }: SourcesManagerProps) {
  const [sources, setSources] = useState<SourceSiteData[]>(initialSources);
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [searchMode, setSearchMode] = useState("TMDB_ID");
  const [priority, setPriority] = useState("5");
  const [active, setActive] = useState(true);
  const [usePlaywright, setUsePlaywright] = useState(false);

  // Selectors State
  const [videoSelector, setVideoSelector] = useState("");
  const [videoAttribute, setVideoAttribute] = useState("");
  const [qualitySelector, setQualitySelector] = useState("");
  const [qualityAttribute, setQualityAttribute] = useState("");
  const [languageSelector, setLanguageSelector] = useState("");
  const [languageAttribute, setLanguageAttribute] = useState("");
  const [tmdbSelector, setTmdbSelector] = useState("");
  const [tmdbAttribute, setTmdbAttribute] = useState("");
  const [subtitleSelector, setSubtitleSelector] = useState("");
  const [subtitleAttribute, setSubtitleAttribute] = useState("");

  const resetForm = () => {
    setName("");
    setAllowedDomain("");
    setBaseUrl("");
    setSearchMode("TMDB_ID");
    setPriority("5");
    setActive(true);
    setUsePlaywright(false);
    setVideoSelector("");
    setVideoAttribute("");
    setQualitySelector("");
    setQualityAttribute("");
    setLanguageSelector("");
    setLanguageAttribute("");
    setTmdbSelector("");
    setTmdbAttribute("");
    setSubtitleSelector("");
    setSubtitleAttribute("");
    setShowAdvanced(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !allowedDomain || !baseUrl) {
      setToast({ type: "error", text: "Por favor llena los campos Nombre, Dominio y URL Base." });
      return;
    }

    setIsLoading(true);
    setToast(null);

    const res = await createSourceSite({
      name,
      allowedDomain,
      baseUrl,
      searchMode,
      active,
      priority: Number(priority),
      usePlaywright,
      videoSelector,
      videoAttribute,
      qualitySelector,
      qualityAttribute,
      languageSelector,
      languageAttribute,
      tmdbSelector,
      tmdbAttribute,
      subtitleSelector,
      subtitleAttribute
    });

    setIsLoading(false);
    if (res.success && res.source) {
      // Cast the prisma output to matches our interface
      const newSource: SourceSiteData = {
        ...res.source,
        priority: Number(res.source.priority)
      };
      setSources((prev) => [...prev, newSource]);
      setToast({ type: "success", text: "Fuente de scrapeo creada exitosamente." });
      setIsOpen(false);
      resetForm();
    } else {
      setToast({ type: "error", text: res.error || "Error al crear la fuente." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta fuente?")) return;

    const res = await deleteSourceSite(id);
    if (res.success) {
      setSources((prev) => prev.filter((s) => s.id !== id));
      setToast({ type: "success", text: "Fuente eliminada exitosamente." });
    } else {
      setToast({ type: "error", text: res.error || "Error al intentar eliminar la fuente." });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`p-4 rounded-lg flex items-start gap-3 border animate-in fade-in duration-200 ${
          toast.type === "success"
            ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400"
            : "bg-rose-950/20 border-rose-500/20 text-rose-400"
        }`}>
          {toast.type === "success" ? (
            <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="text-xs leading-normal font-medium">{toast.text}</div>
        </div>
      )}

      {/* Header action button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-zinc-50 text-xs font-semibold rounded-lg shadow-lg border border-cyan-500/30 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva Fuente
        </button>
      </div>

      {/* Sources List Table */}
      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
          <AlertCircle className="h-9 w-9 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No hay fuentes configuradas aún</p>
          <p className="text-xs text-zinc-500 mt-1">
            Crea tu primera fuente haciendo clic en el botón superior derecho.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl bg-zinc-900/25 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Nombre</th>
                  <th className="p-4">Dominio Permitido</th>
                  <th className="p-4">URL Base</th>
                  <th className="p-4">Modo Búsqueda</th>
                  <th className="p-4">Prioridad</th>
                  <th className="p-4">Playwright</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 text-sm">
                {sources.map((source) => (
                  <tr
                    key={source.id}
                    className="hover:bg-zinc-900/40 transition-colors align-middle"
                  >
                    <td className="p-4 font-semibold text-zinc-200">
                      {source.name}
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-400">
                      {source.allowedDomain}
                    </td>
                    <td className="p-4 font-mono text-xs text-cyan-400">
                      {source.baseUrl}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-300">
                        {source.searchMode}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-300">
                      {source.priority}
                    </td>
                    <td className="p-4 text-xs text-zinc-400">
                      {source.usePlaywright ? "Sí" : "No"}
                    </td>
                    <td className="p-4">
                      {source.active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-950/20 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle className="h-3 w-3" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-zinc-500 text-xs font-medium bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                          <XCircle className="h-3 w-3" /> Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(source.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-rose-400 cursor-pointer"
                        title="Eliminar fuente"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal / Slide-Over for New Source */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-800 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-cyan-400" />
                Registrar Nueva Fuente Scraper
              </h2>
              <button
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
                className="p-1 hover:bg-zinc-850 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* General details */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Nombre de la Fuente</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Cuevana 3"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-750 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium">Dominio Permitido</label>
                    <input
                      type="text"
                      required
                      value={allowedDomain}
                      onChange={(e) => setAllowedDomain(e.target.value)}
                      placeholder="Ej. cuevana3.cl"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-750 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 transition-colors font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium">Prioridad</label>
                    <input
                      type="number"
                      required
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      placeholder="Ej. 10"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 transition-colors font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium">URL Base</label>
                  <input
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="Ej. https://cuevana3.cl"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-750 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 transition-colors font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-medium">Modo de Búsqueda</label>
                  <select
                    value={searchMode}
                    onChange={(e) => setSearchMode(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="TMDB_ID">TMDB_ID (Búsqueda por ID directo)</option>
                    <option value="TITLE_YEAR">TITLE_YEAR (Búsqueda por nombre y año)</option>
                    <option value="INDEX_JSON">INDEX_JSON (Buscar en archivo index.json)</option>
                    <option value="SITEMAP">SITEMAP (Escanear XML Sitemap)</option>
                    <option value="MANUAL_URL">MANUAL_URL (Ingresar URL del scraper manualmente)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-cyan-600 focus:ring-cyan-500/10 h-4 w-4"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Fuente Activa</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePlaywright}
                      onChange={(e) => setUsePlaywright(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-cyan-600 focus:ring-cyan-500/10 h-4 w-4"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Usar JS (Playwright)</span>
                  </label>
                </div>
              </div>

              {/* Collapsible Advanced Section */}
              <div className="border-t border-zinc-850 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-xs text-zinc-400 hover:text-zinc-200 font-semibold uppercase tracking-wider cursor-pointer"
                >
                  <span>Selectores HTML Avanzados</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-1 gap-4 mt-4 p-4 rounded-lg bg-zinc-950/60 border border-zinc-850 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Selector Video</label>
                        <input
                          type="text"
                          value={videoSelector}
                          onChange={(e) => setVideoSelector(e.target.value)}
                          placeholder="Ej. video source"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Atributo Video</label>
                        <input
                          type="text"
                          value={videoAttribute}
                          onChange={(e) => setVideoAttribute(e.target.value)}
                          placeholder="Ej. src"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Selector Calidad</label>
                        <input
                          type="text"
                          value={qualitySelector}
                          onChange={(e) => setQualitySelector(e.target.value)}
                          placeholder="Ej. video"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Atributo Calidad</label>
                        <input
                          type="text"
                          value={qualityAttribute}
                          onChange={(e) => setQualityAttribute(e.target.value)}
                          placeholder="Ej. data-quality"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Selector Idioma</label>
                        <input
                          type="text"
                          value={languageSelector}
                          onChange={(e) => setLanguageSelector(e.target.value)}
                          placeholder="Ej. video"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Atributo Idioma</label>
                        <input
                          type="text"
                          value={languageAttribute}
                          onChange={(e) => setLanguageAttribute(e.target.value)}
                          placeholder="Ej. data-language"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>

            {/* Footer actions */}
            <div className="h-16 border-t border-zinc-800 flex items-center justify-end px-6 gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !name || !allowedDomain || !baseUrl}
                className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-zinc-50 disabled:text-zinc-500 font-semibold rounded-lg shadow-lg border border-cyan-500/30 transition-all cursor-pointer disabled:cursor-not-allowed text-xs"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Registrar Fuente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
