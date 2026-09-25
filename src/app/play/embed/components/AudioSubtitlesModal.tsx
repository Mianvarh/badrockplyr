"use client";

import React, { useState } from "react";
import { Check, X, Volume2, MessageSquare } from "lucide-react";

interface Subtitle {
  id: string;
  url: string;
  language: string;
  format: string;
  label: string | null;
}

interface Variant {
  id: string;
  videoUrl: string;
  language: string;
  quality: string;
  sourceSite: {
    name: string;
  };
  subtitleTracks: Subtitle[];
}

interface AudioSubtitlesModalProps {
  isOpen: boolean;
  onClose: () => void;
  variants: Variant[];
  selectedVariantId: string;
  onSelectVariant: (id: string) => void;
  subtitles: Subtitle[];
  activeSubtitleId: string;
  onSelectSubtitle: (id: string) => void;
}

export default function AudioSubtitlesModal({
  isOpen,
  onClose,
  variants,
  selectedVariantId,
  onSelectVariant,
  subtitles,
  activeSubtitleId,
  onSelectSubtitle
}: AudioSubtitlesModalProps) {
  const [activeTab, setActiveTab] = useState<"audio" | "subtitles">("audio");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-neutral-950/95 border border-white/10 rounded-2xl p-6 shadow-2xl text-white max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("audio")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "audio"
                  ? "bg-red-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" /> Audio / Servidores
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("subtitles")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "subtitles"
                  ? "bg-red-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Subtítulos
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 overflow-y-auto space-y-2 flex-1">
          {activeTab === "audio" && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                Opciones de audio y servidores disponibles ({variants.length})
              </span>
              {variants.map((v, idx) => {
                const isSelected = selectedVariantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSelectVariant(v.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? "bg-red-600/15 border-red-500/40 text-white shadow-sm"
                        : "bg-white/5 hover:bg-white/10 border-white/5 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-zinc-400 font-mono">
                        Servidor {idx + 1}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-zinc-200">
                        {v.language}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {v.quality}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {v.sourceSite?.name}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === "subtitles" && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                Pistas de subtítulos
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectSubtitle("none");
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border cursor-pointer ${
                  activeSubtitleId === "none"
                    ? "bg-red-600/15 border-red-500/40 text-white shadow-sm"
                    : "bg-white/5 hover:bg-white/10 border-white/5 text-zinc-300"
                }`}
              >
                <span className="text-xs font-medium">Desactivados</span>
                {activeSubtitleId === "none" && (
                  <Check className="w-4 h-4 text-red-500 shrink-0" />
                )}
              </button>

              {subtitles.length === 0 ? (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  No hay subtítulos externos registrados para este servidor.
                </p>
              ) : (
                subtitles.map((sub) => {
                  const isSelected = activeSubtitleId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        onSelectSubtitle(sub.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border cursor-pointer ${
                        isSelected
                          ? "bg-red-600/15 border-red-500/40 text-white shadow-sm"
                          : "bg-white/5 hover:bg-white/10 border-white/5 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {sub.label || sub.language}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {sub.format}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
