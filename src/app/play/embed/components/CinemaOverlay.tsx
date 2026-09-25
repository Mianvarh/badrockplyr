"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Cast,
  Maximize,
  Minimize,
  Sun,
  Play,
  Pause,
  Gauge,
  Lock,
  Unlock,
  Layers,
  MessageSquare,
  SkipForward,
  Video,
  Radio,
  AlertTriangle,
  ChevronDown,
  Check,
  Volume2,
  Volume1,
  VolumeX
} from "lucide-react";
import ReportErrorModal from "./ReportErrorModal";

function SkipBack10Icon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 4A8 8 0 1 0 20 12" />
      <path d="M12 1v6l-4-3 4-3z" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        10
      </text>
    </svg>
  );
}

function SkipForward10Icon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 4a8 8 0 1 1-8 8" />
      <path d="M12 1v6l4-3-4-3z" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        10
      </text>
    </svg>
  );
}

interface Variant {
  id: string;
  language: string;
  quality: string;
  sourceSite: {
    name: string;
  };
}

interface CinemaOverlayProps {
  title: string;
  season?: number;
  episode?: number;
  episodeTitle?: string | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  bufferedTime: number;
  onSeek: (time: number) => void;
  onSkipBack10: () => void;
  onSkipForward10: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  brightness: number;
  onBrightnessChange: (b: number) => void;
  playbackSpeed: number;
  onOpenSpeedModal: () => void;
  onOpenEpisodesModal: () => void;
  onOpenAudioSubtitlesModal: () => void;
  onNextEpisode?: () => void;
  hasNextEpisode: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isLocked: boolean;
  onToggleLock: () => void;
  onBack: () => void;
  variants: Variant[];
  selectedVariantId: string;
  onSelectVariant: (id: string) => void;
  isIframe?: boolean;
}

export default function CinemaOverlay({
  title,
  season,
  episode,
  episodeTitle,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  bufferedTime,
  onSeek,
  onSkipBack10,
  onSkipForward10,
  volume,
  onVolumeChange,
  isMuted = false,
  onToggleMute,
  brightness,
  onBrightnessChange,
  playbackSpeed,
  onOpenSpeedModal,
  onOpenEpisodesModal,
  onOpenAudioSubtitlesModal,
  onNextEpisode,
  hasNextEpisode,
  isFullscreen,
  onToggleFullscreen,
  isLocked,
  onToggleLock,
  onBack,
  variants,
  selectedVariantId,
  onSelectVariant,
  isIframe = false
}: CinemaOverlayProps) {
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [isBrightnessDragging, setIsBrightnessDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const verticalSliderRef = useRef<HTMLDivElement>(null);

  const selectedIdx = variants.findIndex((v) => v.id === selectedVariantId);
  const serverDisplayNumber = selectedIdx >= 0 ? selectedIdx + 1 : 1;
  const currentVariant = variants[selectedIdx] || variants[0];

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    setIsScrubbing(true);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    setScrubTime(newTime);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isScrubbing || !timelineRef.current || duration <= 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setScrubTime(ratio * duration);
    };

    const handleMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
        onSeek(scrubTime);
      }
    };

    if (isScrubbing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing, scrubTime, duration, onSeek]);

  const fillRatio = Math.max(0, Math.min(1, (brightness - 0.2) / 1.3));

  const handleVerticalSliderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsBrightnessDragging(true);
    const rect = verticalSliderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height));
    onBrightnessChange(0.2 + ratio * 1.3);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isBrightnessDragging || !verticalSliderRef.current) return;
      const rect = verticalSliderRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (rect.bottom - e.clientY) / rect.height));
      onBrightnessChange(0.2 + ratio * 1.3);
    };

    const handleMouseUp = () => {
      if (isBrightnessDragging) {
        setIsBrightnessDragging(false);
      }
    };

    if (isBrightnessDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isBrightnessDragging, onBrightnessChange]);

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const progressRatio = duration > 0 ? Math.max(0, Math.min(1, displayTime / duration)) : 0;
  const bufferRatio = duration > 0 ? Math.max(0, Math.min(1, bufferedTime / duration)) : 0;
  const remainingSeconds = Math.max(0, duration - displayTime);
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between p-4 sm:p-6 pointer-events-auto select-none bg-gradient-to-t from-black/80 via-transparent to-black/80">
      {/* 1. TOP HEADER (Matching Reference 2) */}
      <div className="flex items-start justify-between w-full">
        {/* Left: Back button */}
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/90 hover:text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer"
          title="Regresar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Center: Network Stats + Title + Video On Badge */}
        <div className="flex flex-col items-center text-center max-w-[60vw]">
          {/* Simulated throughput stats */}
          <span className="text-[10px] sm:text-xs font-mono text-zinc-400 tracking-wider">
            D: 1.2 MB/s &nbsp; U: 24 KB/s
          </span>

          {/* Episode / Movie Title */}
          <h1 className="text-sm sm:text-base font-bold text-white drop-shadow-md truncate max-w-full mt-0.5">
            {season && episode ? `S${season}:E${episode}` : ""}
            {episodeTitle ? ` "${episodeTitle}"` : title}
          </h1>

          {/* Video On pill badge */}
          <div className="mt-1 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-[11px] font-semibold">
            <Video className="w-3.5 h-3.5 fill-white" />
            <span>Video On</span>
          </div>
        </div>

        {/* Right Actions: Server Selector + Report + Cast + Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Servidor 1 ▾ Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
              className="bg-black/60 hover:bg-black/80 text-white/90 border border-white/15 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium backdrop-blur-md transition-all cursor-pointer shadow-lg"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Servidor</span> {serverDisplayNumber}
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                  isServerMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isServerMenuOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-64 bg-neutral-950/95 border border-white/10 rounded-2xl shadow-2xl p-2 z-50 space-y-1 backdrop-blur-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1 border-b border-white/5 text-[10px] text-zinc-400 font-mono flex items-center justify-between">
                  <span>Cambiar Servidor</span>
                  <span>{variants.length} disp.</span>
                </div>
                {variants.map((v, idx) => {
                  const isSelected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onSelectVariant(v.id);
                        setIsServerMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-red-600/20 border border-red-500/40 text-white font-semibold"
                          : "hover:bg-white/5 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-zinc-400 text-[11px]">
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10">
                          {v.language}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {v.quality}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 🚨 Report Error button */}
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 backdrop-blur-md transition-all cursor-pointer"
            title="Reportar problema"
          >
            <AlertTriangle className="w-4 h-4" />
          </button>

          {/* Volume Control for Iframe mode */}
          {isIframe && (
            <div className="flex items-center gap-1.5 bg-black/60 border border-white/15 px-2.5 py-1.5 rounded-xl backdrop-blur-md">
              <button
                type="button"
                onClick={onToggleMute}
                className="text-zinc-300 hover:text-white transition-colors cursor-pointer p-0.5"
                title={isMuted || volume === 0 ? "Activar sonido" : "Silenciar"}
              >
                <VolumeIcon className={`w-4 h-4 ${isMuted || volume === 0 ? "text-red-500" : "text-white/90"}`} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-1 bg-white/25 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
                title={`Volumen: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              />
            </div>
          )}

          {/* Cast Icon */}
          <button
            type="button"
            className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-white/90 hover:text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer"
            title="Transmitir pantalla (Chromecast/Airplay)"
          >
            <Cast className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-white/90 hover:text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. MIDDLE AREA: Vertical Slider (Left) + Center Controls (10s Back, Play/Pause, 10s Forward) */}
      <div className="relative w-full flex items-center justify-between my-auto">
        {/* Left: Vertical Brightness Slider - Only visible when hovering over this area or dragging */}
        {!isIframe ? (
          <div className="group/bright relative flex flex-col items-center gap-2 pl-1 sm:pl-2 py-4 select-none">
            {/* Sun icon indicator button */}
            <button
              type="button"
              className="p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/80 group-hover/bright:text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer shadow-lg"
              title={`Brillo: ${Math.round(fillRatio * 100)}%`}
            >
              <Sun className="w-4 h-4 text-white/80 group-hover/bright:text-white transition-colors" />
            </button>

            {/* Vertical slider bar: completely hidden unless cursor hovers over this part or dragging */}
            <div
              className={`flex flex-col items-center gap-1.5 transition-all duration-200 ${
                isBrightnessDragging
                  ? "opacity-100 pointer-events-auto scale-100"
                  : "opacity-0 pointer-events-none group-hover/bright:opacity-100 group-hover/bright:pointer-events-auto scale-95 group-hover/bright:scale-100"
              }`}
            >
              <span className="text-[10px] font-mono text-zinc-300 font-bold bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-md shadow">
                {Math.round(fillRatio * 100)}%
              </span>
              <div
                ref={verticalSliderRef}
                onMouseDown={handleVerticalSliderMouseDown}
                className="relative w-2 sm:w-2.5 h-24 sm:h-32 bg-white/20 hover:bg-white/35 rounded-full overflow-hidden cursor-pointer backdrop-blur-md transition-all shadow-lg"
              >
                <div
                  className="absolute bottom-0 inset-x-0 bg-white rounded-full transition-all duration-75 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                  style={{ height: `${Math.round(fillRatio * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-6" />
        )}

        {/* Center Playback Controls matching Reference 2 */}
        {!isIframe ? (
          <div className="flex items-center justify-center gap-8 sm:gap-14 mx-auto">
            {/* 10s Back */}
            <button
              type="button"
              onClick={onSkipBack10}
              className="p-3 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
              title="Retroceder 10 segundos"
            >
              <SkipBack10Icon className="w-9 h-9 sm:w-11 sm:h-11" />
            </button>

            {/* Main Play / Pause Button */}
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all shadow-2xl backdrop-blur-md cursor-pointer"
              title={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 sm:w-9 sm:h-9 fill-white" />
              ) : (
                <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-white ml-1" />
              )}
            </button>

            {/* 10s Forward */}
            <button
              type="button"
              onClick={onSkipForward10}
              className="p-3 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
              title="Adelantar 10 segundos"
            >
              <SkipForward10Icon className="w-9 h-9 sm:w-11 sm:h-11" />
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Right spacing balance */}
        <div className="w-6" />
      </div>

      {/* 3. BOTTOM CONTROLS (Timeline + Actions Bar) */}
      <div className="w-full space-y-3">
        {/* Scrubber Timeline (Only for Direct Stream) */}
        {!isIframe && (
          <div className="flex items-center gap-3 w-full">
            <div
              ref={timelineRef}
              onMouseDown={handleTimelineMouseDown}
              className="relative flex-1 h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all duration-150 group"
            >
              {/* Buffered Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/40 rounded-full transition-all"
                style={{ width: `${bufferRatio * 100}%` }}
              />
              {/* Progress Bar (Netflix Red) */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-red-600 rounded-full"
                style={{ width: `${progressRatio * 100}%` }}
              />
              {/* Red Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-red-600 rounded-full shadow-[0_0_10px_rgba(229,9,20,0.9)] transform -translate-x-1/2 scale-100 group-hover:scale-125 transition-transform"
                style={{ left: `${progressRatio * 100}%` }}
              />
            </div>

            {/* Volume Control (Standard in modern players) */}
            <div className="group/vol flex items-center gap-1.5 shrink-0 bg-black/40 hover:bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/10 backdrop-blur-md transition-all">
              <button
                type="button"
                onClick={onToggleMute}
                className="text-zinc-300 hover:text-white transition-colors cursor-pointer p-0.5"
                title={isMuted || volume === 0 ? "Activar sonido (M)" : "Silenciar (M)"}
              >
                <VolumeIcon className={`w-4 h-4 ${isMuted || volume === 0 ? "text-red-500" : "text-white/90"}`} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                aria-label="Volumen"
                className="w-16 sm:w-20 h-1 sm:h-1.5 bg-white/25 hover:bg-white/40 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none transition-all"
                title={`Volumen: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              />
              <span className="text-[10px] font-mono text-zinc-400 w-7 text-right">
                {Math.round((isMuted ? 0 : volume) * 100)}%
              </span>
            </div>

            {/* Remaining time matching Reference 2 */}
            <span className="text-xs sm:text-sm font-semibold font-mono text-zinc-200 tracking-wider shrink-0">
              {formatTime(remainingSeconds > 0 ? remainingSeconds : duration)}
            </span>
          </div>
        )}

        {/* Bottom Action Row matching Reference 2 exactly */}
        <div className="flex items-center justify-between sm:justify-around w-full pt-1 text-zinc-300">
          {/* Speed (1x) */}
          <button
            type="button"
            onClick={onOpenSpeedModal}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 px-2 rounded-lg hover:bg-white/10"
          >
            <Gauge className="w-4 h-4 text-red-500" />
            <span>Speed ({playbackSpeed}x)</span>
          </button>

          {/* Lock */}
          <button
            type="button"
            onClick={onToggleLock}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 px-2 rounded-lg hover:bg-white/10"
          >
            <Lock className="w-4 h-4 text-zinc-400" />
            <span>Lock</span>
          </button>

          {/* Episodes */}
          {season && (
            <button
              type="button"
              onClick={onOpenEpisodesModal}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 px-2 rounded-lg hover:bg-white/10"
            >
              <Layers className="w-4 h-4 text-zinc-400" />
              <span>Episodes</span>
            </button>
          )}

          {/* Audio & Subtitles */}
          <button
            type="button"
            onClick={onOpenAudioSubtitlesModal}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 px-2 rounded-lg hover:bg-white/10"
          >
            <MessageSquare className="w-4 h-4 text-zinc-400" />
            <span>Audio & Subtitles</span>
          </button>

          {/* Next Ep. */}
          {hasNextEpisode && onNextEpisode && (
            <button
              type="button"
              onClick={onNextEpisode}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 px-2 rounded-lg hover:bg-white/10 text-red-400 hover:text-red-300"
            >
              <SkipForward className="w-4 h-4" />
              <span>Next Ep.</span>
            </button>
          )}
        </div>
      </div>

      {/* Report Modal */}
      <ReportErrorModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        title={title}
        serverName={`Servidor ${serverDisplayNumber} (${currentVariant?.sourceSite?.name})`}
      />
    </div>
  );
}
