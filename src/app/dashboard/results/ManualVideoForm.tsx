"use client";

import React, { useState } from "react";
import {
  addManualVideoVariant,
  deleteVideoVariant,
  addMultipleManualVideoVariants,
  moveVideoVariantOrder
} from "@/app/actions/generatorActions";
import { Sparkles, Trash2, Plus, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";

interface ManualVideoFormProps {
  mediaItemId: string;
  initialVariants?: {
    id: string;
    language: string;
    quality: string;
    siteName: string;
  }[];
}

export function ManualVideoForm({ mediaItemId, initialVariants = [] }: ManualVideoFormProps) {
  const [videoUrl, setVideoUrl] = useState("");
  const [language, setLanguage] = useState("LATINO");
  const [quality, setQuality] = useState("HD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [replaceVariantId, setReplaceVariantId] = useState("new");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = videoUrl
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      setError("Por favor ingresa al menos un enlace de video o script válido.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await addMultipleManualVideoVariants(mediaItemId, urls, language, quality, replaceVariantId);
      if (res.success) {
        setVideoUrl("");
        setReplaceVariantId("new");
        setSuccess(true);
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || "Ocurrió un error al guardar el enlace.");
      }
    } catch (err: any) {
      setError(err.message || "Error de red al procesar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 backdrop-blur-sm shadow-xl space-y-4">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
        <Sparkles className="h-4.5 w-4.5 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Agregar Opción de Video Manual (Script / Enlace Externo)</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Replace Select */}
        {initialVariants && initialVariants.length > 0 && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
              Acción / Opción a Reemplazar
            </label>
            <select
              value={replaceVariantId}
              onChange={(e) => {
                const val = e.target.value;
                setReplaceVariantId(val);
                if (val !== "new") {
                  const target = initialVariants.find((v) => v.id === val);
                  if (target) {
                    setLanguage(target.language);
                    setQuality(target.quality);
                  }
                }
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/80 transition-colors font-medium cursor-pointer"
            >
              <option value="new">Agregar como nueva opción (Sin reemplazar)</option>
              {initialVariants.map((v, idx) => (
                <option key={v.id} value={v.id}>
                  {`Reemplazar Opción ${idx + 1}: ${v.language} — ${v.quality} (${v.siteName})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Enlace Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            URLs de Video / Códigos de Iframe (Uno por línea)
          </label>
          <textarea
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://streamwish.to/e/...&#10;https://filemoon.sx/e/...&#10;(Puedes introducir varios enlaces, uno por línea)"
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/80 transition-colors resize-y min-h-[90px]"
          />
        </div>

        {/* Dropdowns row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/80 transition-colors"
            >
              <option value="LATINO">LATINO (Audio Latino)</option>
              <option value="JAPANESE">JAPANESE (Subtítulo en Español)</option>
              <option value="CASTELLANO">CASTELLANO (Audio España)</option>
              <option value="ENGLISH">ENGLISH (Audio Inglés / Subs)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Calidad</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/80 transition-colors"
            >
              <option value="1080p">1080p (Full HD)</option>
              <option value="HD">HD (Alta Definición)</option>
              <option value="720p">720p (Estándar)</option>
              <option value="2160p">2160p (Ultra HD / 4K)</option>
            </select>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
            <span>¡Video manual agregado correctamente!</span>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg hover:shadow-cyan-500/10 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
        >
          {loading ? (
            <span>Guardando...</span>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              <span>Guardar Opción de Video</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

interface DeleteVariantButtonProps {
  variantId: string;
  mediaItemId: string;
}

export function DeleteVariantButton({ variantId, mediaItemId }: DeleteVariantButtonProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta opción de video?")) {
      return;
    }
    setDeleting(true);
    try {
      await deleteVideoVariant(variantId, mediaItemId);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar la opción.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center justify-center p-1.5 bg-zinc-950 border border-zinc-800 hover:border-rose-500/30 hover:bg-rose-950/20 text-zinc-500 hover:text-rose-400 rounded-lg transition-all disabled:opacity-55 cursor-pointer"
      title="Eliminar esta opción de video"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

interface MoveVariantOrderButtonsProps {
  variantId: string;
  isFirst: boolean;
  isLast: boolean;
}

export function MoveVariantOrderButtons({ variantId, isFirst, isLast }: MoveVariantOrderButtonsProps) {
  const [loading, setLoading] = useState(false);

  const handleMove = async (direction: "up" | "down") => {
    setLoading(true);
    try {
      const res = await moveVideoVariantOrder(variantId, direction);
      if (!res.success) {
        alert(res.error || "Ocurrió un error al cambiar el orden.");
      }
    } catch (err: any) {
      alert(err.message || "Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={() => handleMove("up")}
        disabled={isFirst || loading}
        className="inline-flex items-center justify-center p-1.5 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-950/20 text-zinc-500 hover:text-cyan-400 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
        title="Subir opción (Priorizar)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => handleMove("down")}
        disabled={isLast || loading}
        className="inline-flex items-center justify-center p-1.5 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-950/20 text-zinc-500 hover:text-cyan-400 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
        title="Bajar opción"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

