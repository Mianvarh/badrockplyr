export type NormalizedQuality = "2160p" | "1080p" | "HD" | "720p" | "SD" | "CAM";

export function normalizeQuality(input: string): NormalizedQuality {
  const clean = input.toLowerCase().trim();

  if (clean.includes("2160") || clean.includes("4k")) {
    return "2160p";
  }

  if (
    clean === "fullhd" ||
    clean === "fhd" ||
    clean === "1080" ||
    clean.includes("1080p")
  ) {
    return "1080p";
  }

  if (
    clean === "hd" ||
    clean === "alta" ||
    clean === "high definition"
  ) {
    return "HD";
  }

  if (clean === "720" || clean.includes("720p")) {
    return "720p";
  }

  if (
    clean === "sd" ||
    clean === "baja" ||
    clean === "standard definition"
  ) {
    return "SD";
  }

  if (clean === "cam" || clean.includes("camrip")) {
    return "CAM";
  }

  // Default fallback
  return "HD";
}
