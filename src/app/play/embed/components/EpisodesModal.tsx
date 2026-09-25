"use client";

import React from "react";
import { X, Play, Tv } from "lucide-react";

export interface EpisodeItem {
  id: string;
  season: number;
  episode: number;
  episodeTitle?: string | null;
  episodeStillPath?: string | null;
  overview?: string | null;
  url?: string;
}

interface EpisodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  season?: number;
  currentEpisode?: number;
  episodes: EpisodeItem[];
  onSelectEpisode?: (episodeNumber: number) => void;
}

export default function EpisodesModal({
  isOpen,
  onClose,
  title,
  season = 1,
  currentEpisode = 1,
  episodes,
  onSelectEpisode
}: EpisodesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-neutral-950/95 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-white max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-100">{title}</h3>
              <p className="text-xs text-zinc-400">
                Temporada {season} · {episodes.length} episodios disponibles
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 overflow-y-auto space-y-3 flex-1 pr-1">
          {episodes.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">
              No hay más episodios indexados en esta temporada.
            </p>
          ) : (
            episodes.map((ep) => {
              const isCurrent = ep.episode === currentEpisode;
              const thumbUrl = ep.episodeStillPath
                ? ep.episodeStillPath.startsWith("http")
                  ? ep.episodeStillPath
                  : `https://image.tmdb.org/t/p/w500${ep.episodeStillPath}`
                : null;

              return (
                <div
                  key={ep.id || `${ep.season}-${ep.episode}`}
                  onClick={() => {
                    if (ep.url) {
                      window.location.href = ep.url;
                    } else if (onSelectEpisode) {
                      onSelectEpisode(ep.episode);
                      onClose();
                    }
                  }}
                  className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer group ${
                    isCurrent
                      ? "bg-red-600/15 border-red-500/40 shadow-lg"
                      : "bg-white/5 hover:bg-white/10 border-white/5"
                  }`}
                >
                  <div className="relative w-full sm:w-36 h-20 rounded-xl overflow-hidden bg-neutral-900 shrink-0 border border-white/10 flex items-center justify-center">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`Episodio ${ep.episode}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-zinc-600 font-mono text-xs font-bold">
                        T{ep.season} E{ep.episode}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg">
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      </div>
                    </div>
                    {isCurrent && (
                      <div className="absolute bottom-1.5 left-1.5 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded font-mono shadow">
                        EN REPRODUCCIÓN
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-400 font-mono">
                        Episodio {ep.episode}
                      </span>
                      {ep.episodeTitle && (
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          "{ep.episodeTitle}"
                        </span>
                      )}
                    </div>
                    {ep.overview && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                        {ep.overview}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
