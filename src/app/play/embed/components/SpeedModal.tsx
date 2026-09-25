"use client";

import React from "react";
import { Check, X, Gauge } from "lucide-react";

interface SpeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpeed: number;
  onSelectSpeed: (speed: number) => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function SpeedModal({
  isOpen,
  onClose,
  currentSpeed,
  onSelectSpeed
}: SpeedModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs bg-neutral-950/95 border border-white/10 rounded-2xl p-5 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-zinc-100">Velocidad de reproducción</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5 pt-3">
          {SPEEDS.map((speed) => {
            const isSelected = currentSpeed === speed;
            return (
              <button
                key={speed}
                type="button"
                onClick={() => {
                  onSelectSpeed(speed);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-red-600/20 border border-red-500/40 text-red-300 font-semibold"
                    : "hover:bg-white/5 text-zinc-300 border border-transparent"
                }`}
              >
                <span>{speed === 1 ? "1x (Normal)" : `${speed}x`}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
