import React from "react";

interface BadrockLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export default function BadrockLogo({
  className = "",
  size = "md",
  showText = true,
}: BadrockLogoProps) {
  const iconDimensions = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  }[size];

  const textSizes = {
    sm: "text-base tracking-wider",
    md: "text-lg tracking-wider",
    lg: "text-2xl tracking-widest",
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Geometric Modern Cinema Play Icon */}
      <div
        className={`relative ${iconDimensions} rounded-xl bg-gradient-to-br from-cyan-500/20 via-cyan-950/40 to-black/80 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.35)] backdrop-blur-md group-hover:border-cyan-400/70 transition-all`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)]"
        >
          {/* Stylized Modern Playmark Polygon */}
          <path
            d="M5 4.5L19 12L5 19.5V4.5Z"
            fill="url(#badrock-gradient)"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.5L19 12L12 15.5"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
          <defs>
            <linearGradient id="badrock-gradient" x1="5" y1="4.5" x2="19" y2="19.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#06b6d4" />
              <stop offset="0.6" stopColor="#0891b2" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Wordmark */}
      {showText && (
        <div className="flex items-center font-black">
          <span
            className={`font-black ${textSizes} bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent`}
          >
            BADROCK
          </span>
          <span
            className={`font-extrabold ${textSizes} bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent ml-0.5`}
          >
            PLYR
          </span>
          <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
            PRO
          </span>
        </div>
      )}
    </div>
  );
}
