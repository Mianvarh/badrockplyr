import { describe, it, expect } from "vitest";

describe("Player Controls Logic", () => {
  describe("Volume & Mute handling", () => {
    function createVolumeController(initialVolume = 1) {
      let volume = initialVolume;
      let isMuted = initialVolume === 0;
      let prevVolume = initialVolume > 0 ? initialVolume : 1;

      return {
        getVolume: () => volume,
        getIsMuted: () => isMuted,
        setVolume: (newVol: number) => {
          const clamped = Math.max(0, Math.min(1, newVol));
          volume = clamped;
          isMuted = clamped === 0;
          if (clamped > 0) {
            prevVolume = clamped;
          }
        },
        toggleMute: () => {
          if (isMuted || volume === 0) {
            const restore = prevVolume > 0 ? prevVolume : 1;
            isMuted = false;
            volume = restore;
          } else {
            prevVolume = volume > 0 ? volume : 1;
            isMuted = true;
            volume = 0;
          }
        },
      };
    }

    it("clamps volume between 0 and 1", () => {
      const controller = createVolumeController(0.8);
      controller.setVolume(1.5);
      expect(controller.getVolume()).toBe(1);
      expect(controller.getIsMuted()).toBe(false);

      controller.setVolume(-0.2);
      expect(controller.getVolume()).toBe(0);
      expect(controller.getIsMuted()).toBe(true);
    });

    it("mutes and remembers previous volume", () => {
      const controller = createVolumeController(0.7);
      controller.toggleMute();
      expect(controller.getIsMuted()).toBe(true);
      expect(controller.getVolume()).toBe(0);

      controller.toggleMute();
      expect(controller.getIsMuted()).toBe(false);
      expect(controller.getVolume()).toBe(0.7);
    });

    it("restores to 1.0 when unmuting from initial 0 volume", () => {
      const controller = createVolumeController(0);
      expect(controller.getIsMuted()).toBe(true);
      controller.toggleMute();
      expect(controller.getIsMuted()).toBe(false);
      expect(controller.getVolume()).toBe(1);
    });
  });

  describe("Brightness calculation (0.2 to 1.5 range)", () => {
    const toBrightness = (ratio: number) => 0.2 + ratio * 1.3;
    const toFillRatio = (brightness: number) => Math.max(0, Math.min(1, (brightness - 0.2) / 1.3));

    it("maps 0% slider ratio to minimum brightness 0.2", () => {
      expect(toBrightness(0)).toBeCloseTo(0.2, 5);
      expect(toFillRatio(0.2)).toBeCloseTo(0, 5);
    });

    it("maps 100% slider ratio to maximum brightness 1.5", () => {
      expect(toBrightness(1)).toBeCloseTo(1.5, 5);
      expect(toFillRatio(1.5)).toBeCloseTo(1, 5);
    });

    it("maps normal default brightness 1.0 to ~61.5% fill ratio", () => {
      expect(toFillRatio(1.0)).toBeCloseTo(0.8 / 1.3, 5);
    });
  });

  describe("Screen Lock Guard", () => {
    function simulateKeypress(code: string, isLocked: boolean, isFullscreen: boolean) {
      if (isLocked) {
        if (code === "Escape" && isFullscreen) {
          return "EXIT_FULLSCREEN";
        }
        return "BLOCKED";
      }

      switch (code) {
        case "Space":
          return "TOGGLE_PLAY";
        case "ArrowLeft":
          return "SKIP_BACK";
        case "ArrowRight":
          return "SKIP_FORWARD";
        case "ArrowUp":
          return "VOLUME_UP";
        case "ArrowDown":
          return "VOLUME_DOWN";
        case "KeyM":
          return "TOGGLE_MUTE";
        case "KeyF":
          return "TOGGLE_FULLSCREEN";
        default:
          return "IGNORED";
      }
    }

    it("blocks all playback and volume hotkeys while isLocked is true", () => {
      expect(simulateKeypress("Space", true, false)).toBe("BLOCKED");
      expect(simulateKeypress("ArrowLeft", true, false)).toBe("BLOCKED");
      expect(simulateKeypress("ArrowRight", true, false)).toBe("BLOCKED");
      expect(simulateKeypress("ArrowUp", true, false)).toBe("BLOCKED");
      expect(simulateKeypress("KeyM", true, false)).toBe("BLOCKED");
      expect(simulateKeypress("KeyF", true, false)).toBe("BLOCKED");
    });

    it("allows Escape to exit fullscreen even when locked", () => {
      expect(simulateKeypress("Escape", true, true)).toBe("EXIT_FULLSCREEN");
    });

    it("executes hotkeys when not locked", () => {
      expect(simulateKeypress("Space", false, false)).toBe("TOGGLE_PLAY");
      expect(simulateKeypress("KeyM", false, false)).toBe("TOGGLE_MUTE");
      expect(simulateKeypress("ArrowUp", false, false)).toBe("VOLUME_UP");
      expect(simulateKeypress("ArrowDown", false, false)).toBe("VOLUME_DOWN");
    });
  });
});
