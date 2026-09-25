export type NormalizedLanguage = "LATINO" | "ENGLISH" | "CASTELLANO" | "JAPANESE";

export function normalizeRelayLanguage(
  input: string | null | undefined,
  originalLanguage?: string | null
): NormalizedLanguage {
  const clean = (input || "").toLowerCase().trim();

  if (clean.includes("latino") || clean === "lat" || clean.includes("es-419")) return "LATINO";
  if (clean.includes("cast") || clean.includes("españ") || clean.includes("españa")) return "CASTELLANO";
  if (clean.includes("jap") || clean === "ja") return "JAPANESE";
  if (clean.includes("ing") || clean === "en" || clean.includes("english")) return "ENGLISH";

  if (clean.includes("sub")) {
    return originalLanguage?.toLowerCase() === "ja" ? "JAPANESE" : "ENGLISH";
  }

  return "LATINO";
}

export function normalizeLanguage(input: string): NormalizedLanguage {
  const clean = input.toLowerCase().trim();

  // Latino mappings
  if (
    clean === "latino" ||
    clean === "es-latam" ||
    clean === "es-419" ||
    clean.includes("español latino") ||
    clean.includes("audio latino")
  ) {
    return "LATINO";
  }

  // English mappings
  if (
    clean === "ingles" ||
    clean === "inglés" ||
    clean === "english" ||
    clean === "en"
  ) {
    return "ENGLISH";
  }

  // Castellano mappings
  if (
    clean === "castellano" ||
    clean === "españa" ||
    clean === "es-es" ||
    clean.includes("español españa")
  ) {
    return "CASTELLANO";
  }

  // Japanese mappings
  if (
    clean === "japones" ||
    clean === "japonés" ||
    clean === "japanese" ||
    clean === "ja" ||
    clean === "sub" ||
    clean.includes("subtitulado") ||
    clean.includes("subtitulos") ||
    clean.includes("subtítulos")
  ) {
    return "JAPANESE";
  }

  // Default fallback
  return "LATINO";
}
