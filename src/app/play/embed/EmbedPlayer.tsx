"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Hls from "hls.js";
import { Loader2, AlertCircle, RefreshCw, Unlock } from "lucide-react";
import {
  isCleanPlaybackUrl,
  isDirectStreamUrl,
  isPrivateMediaUrl,
  isResolvableEmbedUrl,
  MAX_VIDEO_OPTIONS,
} from "@/lib/playbackUrlPolicy";
import PrePlayCover from "./components/PrePlayCover";
import CinemaOverlay from "./components/CinemaOverlay";
import EpisodesModal, { EpisodeItem } from "./components/EpisodesModal";
import AudioSubtitlesModal from "./components/AudioSubtitlesModal";
import SpeedModal from "./components/SpeedModal";

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
  candidateUrl?: string | null;
  language: string;
  quality: string;
  sourceSite: {
    name: string;
    allowedDomain: string;
  };
  subtitleTracks: Subtitle[];
}

interface EmbedPlayerProps {
  title: string;
  originalTitle?: string;
  mediaType?: "movie" | "tv" | "anime";
  season?: number;
  episode?: number;
  episodeTitle?: string | null;
  backdropPath?: string | null;
  posterPath?: string | null;
  overview?: string | null;
  variants: Variant[];
  initialVariantId?: string;
  mediaItemId?: string;
  allEpisodes?: EpisodeItem[];
  nextEpisodeUrl?: string | null;
}

export default function EmbedPlayer({
  title,
  season,
  episode,
  episodeTitle,
  backdropPath,
  posterPath,
  variants,
  initialVariantId,
  allEpisodes = [],
  nextEpisodeUrl,
}: EmbedPlayerProps) {
  const playbackVariants = useMemo(
    () => variants.filter((v) => isCleanPlaybackUrl(v.videoUrl)).slice(0, MAX_VIDEO_OPTIONS),
    [variants]
  );

  const [hasStartedPlaying, setHasStartedPlaying] = useState<boolean>(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    () => playbackVariants.find((v) => v.id === initialVariantId) || playbackVariants[0] || null
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const prevVolumeRef = useRef<number>(1);
  const [brightness, setBrightness] = useState<number>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [activeSub, setActiveSub] = useState<string>("none");

  // Modals state
  const [isSpeedModalOpen, setIsSpeedModalOpen] = useState<boolean>(false);
  const [isEpisodesModalOpen, setIsEpisodesModalOpen] = useState<boolean>(false);
  const [isAudioSubtitlesModalOpen, setIsAudioSubtitlesModalOpen] = useState<boolean>(false);

  // Resolution and stream state
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [iframeFallbackUrl, setIframeFallbackUrl] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [failedVariantIds, setFailedVariantIds] = useState<Set<string>>(() => new Set());
  const [resolveRefreshKey, setResolveRefreshKey] = useState<number>(0);
  const iframeFallbackUrlRef = useRef<string | null>(null);

  // Overlay visibility & auto-hide controls
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (!isSpeedModalOpen && !isEpisodesModalOpen && !isAudioSubtitlesModalOpen && !isLocked) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    }
  }, [isSpeedModalOpen, isEpisodesModalOpen, isAudioSubtitlesModalOpen, isLocked, isPlaying]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimeout]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn("[Player] Fullscreen toggle error:", err);
    }
  };

  // Helper functions for URL resolution
  const isIframeUrl = (url: string): boolean => {
    if (!url) return false;
    if (url.trim().startsWith("<")) return true;
    if (isDirectStreamUrl(url) || url.includes("/api/proxy-stream")) return false;
    return true;
  };

  const isResolvableUrl = (url: string): boolean => {
    if (!url) return false;
    if (isPrivateMediaUrl(url)) return true;
    if (url.includes("vimeus.com/e/")) return false;
    if (isDirectStreamUrl(url)) return false;
    return isResolvableEmbedUrl(url);
  };

  const playUrl = selectedVariant
    ? resolvedVideoUrl || iframeFallbackUrl || (isResolvableUrl(selectedVariant.videoUrl) ? "" : selectedVariant.videoUrl)
    : "";
  const isIframe = selectedVariant && playUrl ? isIframeUrl(playUrl) : false;

  const getIframeSrc = (url: string): string => {
    if (!url) return "";
    if (url.trim().startsWith("<")) return "";
    const lower = url.toLowerCase();
    const isVoe =
      lower.includes("voe.sx") ||
      lower.includes("voe.network") ||
      lower.includes("jessicayeahcatch.com") ||
      lower.includes("lindalastattack.com");
    const isUnlimplay = lower.includes("unlimplay.com/embed/") || lower.includes("unlimplay.com/play.php/embed/");
    if (isVoe || isUnlimplay) {
      return `/api/proxy-embed?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // Resolve URLs dynamically
  useEffect(() => {
    if (!selectedVariant) return;

    const url = selectedVariant.videoUrl;
    setIframeFallbackUrl(null);
    iframeFallbackUrlRef.current = null;

    const canRefreshFromCandidate = selectedVariant.candidateUrl && selectedVariant.candidateUrl !== "MANUAL";
    const shouldResolveUrl = isResolvableUrl(url) || (resolveRefreshKey > 0 && canRefreshFromCandidate);

    if (shouldResolveUrl) {
      setIsLoadingSource(true);
      setResolvedVideoUrl(null);
      setResolveError(null);
      iframeFallbackUrlRef.current = url;

      const params = new URLSearchParams({ url });
      if (selectedVariant.candidateUrl && selectedVariant.candidateUrl !== "MANUAL") {
        params.set("candidateUrl", selectedVariant.candidateUrl);
      }
      if (resolveRefreshKey > 0) {
        params.set("refresh", "1");
      }

      fetch(`/api/resolve-video?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.resolvedUrl && data.resolvedUrl !== url) {
            setResolvedVideoUrl(data.resolvedUrl);
          } else {
            if (data.playbackMode !== "rejected" && iframeFallbackUrlRef.current) {
              setIframeFallbackUrl(iframeFallbackUrlRef.current);
            } else {
              setResolveError("No se pudo extraer una transmisión directa limpia.");
            }
          }
          setIsLoadingSource(false);
        })
        .catch(() => {
          if (iframeFallbackUrlRef.current) {
            setIframeFallbackUrl(iframeFallbackUrlRef.current);
          } else {
            setResolveError("Error conectando con el servidor de reproducción.");
          }
          setIsLoadingSource(false);
        });
    } else {
      setResolvedVideoUrl(null);
      setIsLoadingSource(false);
      setResolveError(null);
    }
  }, [selectedVariant?.id, resolveRefreshKey]);

  // HLS and Direct video playback binding
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isIframe || !selectedVariant || !hasStartedPlaying) return;
    if (isResolvableUrl(selectedVariant.videoUrl) && !resolvedVideoUrl) return;

    const streamUrl = resolvedVideoUrl || selectedVariant.videoUrl;
    let hls: Hls | null = null;

    const isHls = streamUrl.toLowerCase().includes(".m3u8") || streamUrl.includes("unlimplay.com/hls/");

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              if (iframeFallbackUrlRef.current) {
                setIframeFallbackUrl(iframeFallbackUrlRef.current);
              }
              break;
          }
        }
      });
    } else {
      video.src = streamUrl;
      video.play().catch(() => setIsPlaying(false));
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBufferedTime(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration || 0);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      if (hls) {
        hls.destroy();
      }
    };
  }, [hasStartedPlaying, resolvedVideoUrl, selectedVariant?.id, isIframe]);

  // Video playback controls
  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSkipBack10 = () => {
    const video = videoRef.current;
    if (video) {
      const target = Math.max(0, video.currentTime - 10);
      video.currentTime = target;
      setCurrentTime(target);
    }
  };

  const handleSkipForward10 = () => {
    const video = videoRef.current;
    if (video) {
      const target = Math.min(duration || Infinity, video.currentTime + 10);
      video.currentTime = target;
      setCurrentTime(target);
    }
  };

  const handleVolumeChange = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (clamped > 0) {
      prevVolumeRef.current = clamped;
    }
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
  };

  const handleToggleMute = () => {
    if (isMuted || volume === 0) {
      const restore = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1;
      setIsMuted(false);
      setVolume(restore);
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = restore;
      }
    } else {
      prevVolumeRef.current = volume > 0 ? volume : 1;
      setIsMuted(true);
      setVolume(0);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.volume = 0;
      }
    }
  };

  // Sync video element properties across variant and source changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = isMuted ? 0 : volume;
    v.muted = isMuted;
    v.playbackRate = playbackSpeed;
  }, [volume, isMuted, playbackSpeed, selectedVariant?.id, resolvedVideoUrl, hasStartedPlaying]);

  const handleBrightnessChange = (b: number) => {
    const clamped = Math.max(0.2, Math.min(1.5, b));
    setBrightness(clamped);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Subtitle track selection
  const handleSelectSubtitle = (subId: string) => {
    setActiveSub(subId);
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        if (subId === "none") {
          tracks[i].mode = "disabled";
        } else {
          const matchSub = selectedVariant?.subtitleTracks.find((s) => s.id === subId);
          if (matchSub && tracks[i].language.toLowerCase() === matchSub.language.toLowerCase()) {
            tracks[i].mode = "showing";
          } else {
            tracks[i].mode = "disabled";
          }
        }
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    if (!hasStartedPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // When locked, block controls except Escape to exit fullscreen
      if (isLocked) {
        if (e.code === "Escape" && isFullscreen) {
          toggleFullscreen();
        }
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handleTogglePlay();
          resetControlsTimeout();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSkipBack10();
          resetControlsTimeout();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkipForward10();
          resetControlsTimeout();
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange(volume + 0.1);
          resetControlsTimeout();
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(volume - 0.1);
          resetControlsTimeout();
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "KeyM":
          e.preventDefault();
          handleToggleMute();
          resetControlsTimeout();
          break;
        case "Escape":
          if (isSpeedModalOpen || isEpisodesModalOpen || isAudioSubtitlesModalOpen) {
            setIsSpeedModalOpen(false);
            setIsEpisodesModalOpen(false);
            setIsAudioSubtitlesModalOpen(false);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStartedPlaying, volume, isMuted, isLocked, isFullscreen, isPlaying, duration, resetControlsTimeout]);

  // Construct backdrop and poster URLs
  const backdropUrl = backdropPath
    ? backdropPath.startsWith("http")
      ? backdropPath
      : `https://image.tmdb.org/t/p/w1280${backdropPath}`
    : null;

  const posterUrl = posterPath
    ? posterPath.startsWith("http")
      ? posterPath
      : `https://image.tmdb.org/t/p/w500${posterPath}`
    : null;

  // 1. EMPTY STATE IF NO VARIANTS
  if (playbackVariants.length === 0) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-red-500">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-zinc-100">Contenido no disponible</h2>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm leading-relaxed">
          No se encontraron fuentes de video reproducibles disponibles para este título.
        </p>
      </div>
    );
  }

  // 2. PRE-PLAY COVER STATE (Matches Reference 1: Captura de pantalla 2026-09-25 101856.png)
  if (!hasStartedPlaying) {
    return (
      <PrePlayCover
        title={title}
        backdropUrl={backdropUrl}
        posterUrl={posterUrl}
        season={season}
        episode={episode}
        episodeTitle={episodeTitle}
        variants={playbackVariants}
        selectedVariantId={selectedVariant?.id || playbackVariants[0].id}
        onSelectVariant={(id) => {
          const v = playbackVariants.find((item) => item.id === id);
          if (v) setSelectedVariant(v);
        }}
        onPlay={() => setHasStartedPlaying(true)}
      />
    );
  }

  // 3. ACTIVE PLAYBACK STATE (Matches Reference 2: 4U47OTN5PVBRNIQGHK4WZYVQPE.png)
  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseEnter={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
      onClick={resetControlsTimeout}
      className={`fixed inset-0 bg-black text-white font-sans select-none overflow-hidden ${
        showControls ? "cursor-default" : "cursor-none"
      }`}
    >
      {/* Viewport: Video Tag or Sandboxed Iframe */}
      <div className="w-full h-full absolute inset-0 flex items-center justify-center bg-black">
        {isIframe ? (
          playUrl.trim().startsWith("<") ? (
            <iframe
              key={`iframe-doc-${selectedVariant?.id || "none"}-${playUrl}`}
              srcDoc={playUrl}
              className="w-full h-full border-0 absolute inset-0 bg-black"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <iframe
              key={`iframe-url-${selectedVariant?.id || "none"}-${getIframeSrc(playUrl)}`}
              src={getIframeSrc(playUrl)}
              className="w-full h-full border-0 absolute inset-0 bg-black"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <video
            key={`video-${selectedVariant?.id || "none"}-${playUrl}`}
            ref={videoRef}
            className="w-full h-full object-contain"
            preload="auto"
            playsInline
            crossOrigin="anonymous"
            style={{ filter: `brightness(${brightness})` }}
            onClick={handleTogglePlay}
          >
            {selectedVariant?.subtitleTracks.map((track) => (
              <track
                key={track.id}
                kind="subtitles"
                src={track.url}
                srcLang={track.language.toLowerCase()}
                label={track.label || track.language}
                default={activeSub === track.id}
              />
            ))}
            Tu navegador no soporta video HTML5.
          </video>
        )}
      </div>

      {/* Floating Center Loader */}
      {(isLoadingSource || !selectedVariant) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="bg-neutral-950/90 border border-white/10 rounded-2xl px-6 py-5 shadow-2xl flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Cargando transmisión...
            </span>
          </div>
        </div>
      )}

      {/* Elegant Fallback Modal on Error */}
      {resolveError && selectedVariant && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-neutral-950/95 border border-red-500/30 rounded-2xl p-6 shadow-2xl max-w-sm text-center flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-100">Transmisión no disponible</h3>
            <p className="text-xs text-zinc-400">{resolveError}</p>
            <div className="flex items-center gap-2 mt-2 w-full">
              <button
                type="button"
                onClick={() => setResolveRefreshKey((k) => k + 1)}
                className="flex-1 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 font-medium rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </button>
              {playbackVariants.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const failed = new Set(failedVariantIds);
                    failed.add(selectedVariant.id);
                    setFailedVariantIds(failed);
                    const next = playbackVariants.find((v) => !failed.has(v.id)) || playbackVariants[0];
                    if (next) setSelectedVariant(next);
                  }}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 text-xs text-white font-semibold rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  Siguiente servidor
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Screen Lock Layer (Only visible when isLocked is true) */}
      {isLocked && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto bg-transparent select-none cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Central hover target zone (generous hitbox) - Button only appears when cursor moves over this center area */}
          <div className="group/unlock p-16 sm:p-24 flex items-center justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
                resetControlsTimeout();
              }}
              className="opacity-0 pointer-events-none group-hover/unlock:opacity-100 group-hover/unlock:pointer-events-auto transition-all duration-300 transform scale-95 group-hover/unlock:scale-100 bg-black/90 hover:bg-black text-white border border-cyan-500/40 px-6 py-4 rounded-full flex flex-col items-center gap-1.5 shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur-2xl cursor-pointer"
              title="Desbloquear controles"
            >
              <Unlock className="w-6 h-6 text-cyan-400 animate-pulse" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-cyan-200">
                Desbloquear
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Netflix Cinema Overlay Controls (Visible on hover/touch when not locked) */}
      {!isLocked && (
        <div
          className={`transition-opacity duration-300 ease-out ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          <CinemaOverlay
            title={title}
            season={season}
            episode={episode}
            episodeTitle={episodeTitle}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            onSeek={handleSeek}
            onSkipBack10={handleSkipBack10}
            onSkipForward10={handleSkipForward10}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            brightness={brightness}
            onBrightnessChange={handleBrightnessChange}
            playbackSpeed={playbackSpeed}
            onOpenSpeedModal={() => setIsSpeedModalOpen(true)}
            onOpenEpisodesModal={() => setIsEpisodesModalOpen(true)}
            onOpenAudioSubtitlesModal={() => setIsAudioSubtitlesModalOpen(true)}
            onNextEpisode={() => {
              if (nextEpisodeUrl) {
                window.location.href = nextEpisodeUrl;
              }
            }}
            hasNextEpisode={Boolean(nextEpisodeUrl)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            isLocked={isLocked}
            onToggleLock={() => {
              setIsLocked(true);
              setShowControls(false);
            }}
            onBack={() => setHasStartedPlaying(false)}
            variants={playbackVariants}
            selectedVariantId={selectedVariant?.id || playbackVariants[0].id}
            onSelectVariant={(id) => {
              const v = playbackVariants.find((item) => item.id === id);
              if (v) {
                setSelectedVariant(v);
                setActiveSub("none");
              }
            }}
            isIframe={isIframe}
          />
        </div>
      )}

      {/* Modals */}
      <SpeedModal
        isOpen={isSpeedModalOpen}
        onClose={() => setIsSpeedModalOpen(false)}
        currentSpeed={playbackSpeed}
        onSelectSpeed={handleSpeedChange}
      />

      <EpisodesModal
        isOpen={isEpisodesModalOpen}
        onClose={() => setIsEpisodesModalOpen(false)}
        title={title}
        season={season}
        currentEpisode={episode}
        episodes={allEpisodes}
      />

      <AudioSubtitlesModal
        isOpen={isAudioSubtitlesModalOpen}
        onClose={() => setIsAudioSubtitlesModalOpen(false)}
        variants={playbackVariants}
        selectedVariantId={selectedVariant?.id || playbackVariants[0].id}
        onSelectVariant={(id) => {
          const v = playbackVariants.find((item) => item.id === id);
          if (v) {
            setSelectedVariant(v);
            setActiveSub("none");
          }
        }}
        subtitles={selectedVariant?.subtitleTracks || []}
        activeSubtitleId={activeSub}
        onSelectSubtitle={handleSelectSubtitle}
      />
    </div>
  );
}
