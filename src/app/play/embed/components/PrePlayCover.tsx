"use client";

import React, { useState } from "react";
import { Play, ChevronDown, Check, AlertTriangle, Radio } from "lucide-react";
import ReportErrorModal from "./ReportErrorModal";

interface Subtitle {
  id: string;
  language: string;
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

interface PrePlayCoverProps {
  title: string;
  backdropUrl?: string | null;
  posterUrl?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string | null;
  variants: Variant[];
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
  onPlay: () => void;
}

export default function PrePlayCover({
  title,
  backdropUrl,
  posterUrl,
  season,
  episode,
  episodeTitle,
  variants,
  selectedVariantId,
  onSelectVariant,
  onPlay
}: PrePlayCoverProps) {
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const selectedIdx = variants.findIndex((v) => v.id === selectedVariantId);
  const currentVariant = variants[selectedIdx] || variants[0];
  const serverDisplayNumber = selectedIdx >= 0 ? selectedIdx + 1 : 1;

  const bgImage = backdropUrl || posterUrl;

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 flex items-center justify-center overflow-hidden select-none">
      {/* Background Poster / Backdrop with Deep Cinema Vignette */}
      {bgImage ? (
        <div className="absolute inset-0 z-0">
          <img
            src={bgImage}
            alt={title}
            className="w-full h-full object-cover filter brightness-[0.45] contrast-[1.1] scale-105 transition-transform duration-1000 ease-out"
          />
          {/* Multi-layered dark vignette to match Captura de pantalla 2026-09-25 101856.png */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_rgba(0,0,0,0.85)_100%)]" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-neutral-950 via-zinc-900 to-black" />
      )}

      {/* Top Left Floating Bar matching Reference 1 exactly */}
      <div className="absolute top-5 left-5 z-20 flex items-center gap-2.5">
        {/* Servidor 1 ▾ Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
            className="bg-black/75 hover:bg-black/90 text-white/90 hover:text-white border border-white/10 hover:border-white/20 px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold backdrop-blur-xl transition-all shadow-xl cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Servidor {serverDisplayNumber}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                isServerMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isServerMenuOpen && (
            <div
              className="absolute top-full left-0 mt-2 w-72 bg-neutral-950/95 border border-white/10 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-2 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                <span>Servidores Disponibles</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {variants.length} en vivo
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {variants.map((v, idx) => {
                  const isSelected = v.id === currentVariant?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onSelectVariant(v.id);
                        setIsServerMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? "bg-red-600/20 border border-red-500/40 text-white font-medium"
                          : "hover:bg-white/5 text-zinc-300 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 border border-white/5 shrink-0">
                          {v.language}
                        </span>
                        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          {v.quality}
                        </span>
                        <span className="text-[11px] text-zinc-400 truncate">
                          {v.sourceSite?.name || "Server"}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-red-500 shrink-0 ml-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 🚨 Reportar error button matching Reference 1 */}
        <button
          type="button"
          onClick={() => setIsReportOpen(true)}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/25 hover:border-red-500/40 px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-semibold backdrop-blur-xl transition-all shadow-lg shadow-red-950/20 cursor-pointer"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Reportar error</span>
        </button>
      </div>

      {/* Center "Ver ahora" Button matching Reference 1 exactly */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-3">
        <button
          type="button"
          onClick={onPlay}
          className="group relative bg-white hover:bg-zinc-200 active:scale-95 text-black font-bold text-sm sm:text-base px-8 sm:px-10 py-3 sm:py-3.5 rounded-xl shadow-[0_10px_35px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_45px_rgba(255,255,255,0.45)] flex items-center gap-2.5 transition-all transform hover:scale-105 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-black text-black group-hover:scale-110 transition-transform" />
          <span>Ver ahora</span>
        </button>

        {/* Subtle title info below button */}
        <div className="text-center mt-2 px-4 max-w-lg">
          <h2 className="text-xs sm:text-sm font-medium text-zinc-300 tracking-wide drop-shadow-md">
            {title}
            {season && episode ? ` — T${season} E${episode}` : ""}
            {episodeTitle ? `: "${episodeTitle}"` : ""}
          </h2>
          {currentVariant && (
            <div className="flex items-center justify-center gap-2 mt-1.5 text-[11px] text-zinc-400">
              <span className="font-mono">{currentVariant.language}</span>
              <span>·</span>
              <span className="font-mono">{currentVariant.quality}</span>
              <span>·</span>
              <span>{currentVariant.sourceSite?.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Report Error Modal */}
      <ReportErrorModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        title={title}
        serverName={`Servidor ${serverDisplayNumber} (${currentVariant?.sourceSite?.name})`}
      />
    </div>
  );
}
