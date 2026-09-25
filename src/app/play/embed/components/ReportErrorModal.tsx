"use client";

import React, { useState } from "react";
import { AlertTriangle, Check, X, Send } from "lucide-react";

interface ReportErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  serverName?: string;
}

const REPORT_REASONS = [
  "El video no reproduce o se queda cargando",
  "Audio desincronizado con respecto al video",
  "El idioma no coincide con la etiqueta",
  "Subtítulos desincronizados o ausentes",
  "Mala calidad o video pixelado",
  "El enlace está roto o caído"
];

export default function ReportErrorModal({
  isOpen,
  onClose,
  title,
  serverName
}: ReportErrorModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-neutral-950/95 border border-white/10 rounded-2xl p-6 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {isSubmitted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-in zoom-in-75">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100">
              Reporte enviado con éxito
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs">
              Gracias por avisarnos. El equipo técnico revisará el servidor{" "}
              <span className="text-white font-medium">{serverName || "actual"}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Reportar problema en el reproductor
                </h3>
                <p className="text-xs text-zinc-400 truncate max-w-[280px]">
                  {title} {serverName ? `(${serverName})` : ""}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                ¿Qué problema presenta el video?
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className={`w-full text-left text-xs p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                      selectedReason === reason
                        ? "bg-red-500/15 border-red-500/40 text-red-200"
                        : "bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    <span>{reason}</span>
                    {selectedReason === reason && (
                      <Check className="w-3.5 h-3.5 text-red-400 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Detalles adicionales (opcional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe brevemente el fallo (ej. segundo 04:30 se detiene)..."
                rows={2}
                className="w-full text-xs bg-white/5 border border-white/10 rounded-xl p-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40 transition-colors resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-3 rounded-xl border border-white/10 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-950/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Enviar reporte
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
