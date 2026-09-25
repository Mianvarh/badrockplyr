function cleanString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_]/g, " ")
    .trim();
}

function getWords(str: string): string[] {
  const ignoredWords = new Set(["la", "de", "the", "and", "los", "les", "del", "con", "para", "por", "que", "una", "uno", "pelicula", "movie"]);
  return cleanString(str)
    .split(/\s+/)
    .map((w) => (/^\d+$/.test(w) ? String(Number(w)) : w))
    .filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !ignoredWords.has(w));
}

function extractNumbers(words: string[]): Set<string> {
  const nums = new Set<string>();
  const romanMap: Record<string, string> = {
    i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
  };
  for (const w of words) {
    if (/^\d+$/.test(w)) {
      const val = Number(w);
      if (val >= 1 && val <= 10) nums.add(String(val));
    } else if (romanMap[w]) {
      nums.add(romanMap[w]);
    }
  }
  return nums;
}

function hasMovieSignal(value: string) {
  const lower = value.toLowerCase();
  return ["movie", "pelicula", "film", "ova", "special", "especial", "gekijouban", "the-movie"]
    .some((keyword) => lower.includes(keyword));
}

export function computeMatchScore(
  candidateSlug: string,
  candidateTitle: string,
  targets: string[],
  isMovie: boolean,
  candidateType?: string
): number {
  if (targets.length === 0) return 0;

  const allTargetNumbers = new Set<string>();
  for (const t of targets) {
    extractNumbers(getWords(t)).forEach((n) => allTargetNumbers.add(n));
  }

  const candidateWordsList = [...getWords(candidateSlug), ...getWords(candidateTitle)];
  const candidateWords = new Set(candidateWordsList);
  const candidateNumbers = extractNumbers(candidateWordsList);
  const primaryWords = getWords(targets[0]);
  const targetCoverages = targets.map((target) => {
    const targetWords = getWords(target);
    if (targetWords.length === 0) return 0;
    const matches = targetWords.filter((tw) => (
      candidateWords.has(tw) || Array.from(candidateWords).some((cw) => cw.includes(tw) || tw.includes(cw))
    )).length;
    return matches / targetWords.length;
  });
  const bestTargetCoverage = Math.max(...targetCoverages);

  if (bestTargetCoverage < 0.67) return 0;

  if (isMovie && primaryWords.length >= 3 && !hasMovieSignal(`${candidateSlug} ${candidateTitle}`)) {
    if (bestTargetCoverage < 0.75) return 0;
  }

  if (allTargetNumbers.size > 0 && candidateNumbers.size > 0) {
    const hasSharedNumber = Array.from(candidateNumbers).some((n) => allTargetNumbers.has(n));
    if (!hasSharedNumber) return 0;
  }

  let maxScore = 0;
  const franchiseWords = new Set(["dragon", "ball", "z", "super", "gt", "kai", "naruto", "shippuden", "one", "piece", "bleach", "boruto"]);
  const uniqueCandidateWords = Array.from(candidateWords).filter((cw) => !franchiseWords.has(cw));

  for (const target of targets) {
    const targetWords = getWords(target);
    if (targetWords.length === 0) continue;

    const targetFranchiseWords = targetWords.filter((tw) => franchiseWords.has(tw));
    if (!targetFranchiseWords.every((tfw) => candidateWords.has(tfw))) continue;

    const uniqueTargetWords = targetWords.filter((tw) => !franchiseWords.has(tw));
    if (uniqueTargetWords.length > 0) {
      const hasUniqueMatch = uniqueTargetWords.some((utw) => (
        uniqueCandidateWords.includes(utw) || uniqueCandidateWords.some((ucw) => ucw.includes(utw) || utw.includes(ucw))
      ));
      if (!hasUniqueMatch) continue;
    }

    let matches = 0;
    for (const tw of targetWords) {
      if (candidateWords.has(tw) || Array.from(candidateWords).some((cw) => cw.includes(tw) || tw.includes(cw))) {
        matches++;
      }
    }
    let score = matches / targetWords.length;

    const hasSharedWordWithPrimary = targetWords.some((tw) => primaryWords.includes(tw));
    if (hasSharedWordWithPrimary) {
      const missingPrimaryWords = primaryWords.filter((pw) => !targetWords.includes(pw));
      if (missingPrimaryWords.length > 0) {
        const hasAnyMissingPrimaryMatch = missingPrimaryWords.some((mpw) => (
          candidateWords.has(mpw) || Array.from(candidateWords).some((cw) => cw.includes(mpw) || mpw.includes(cw))
        ));
        if (!hasAnyMissingPrimaryMatch) score *= 0.1;
      }
    }

    if (score > maxScore) maxScore = score;
  }

  if (maxScore === 0) return 0;

  const candidateSlugLower = candidateSlug.toLowerCase();
  const candidateTitleLower = candidateTitle.toLowerCase();
  const candidateTextLower = `${candidateSlugLower} ${candidateTitleLower}`;
  const targetTextLower = targets.join(" ").toLowerCase();
  const hasMovieKeywords = hasMovieSignal(candidateTextLower);
  const hasEpisodeTitleWord =
    isMovie &&
    (targetTextLower.includes("episode") || targetTextLower.includes("episodio")) &&
    (candidateTextLower.includes("episode") || candidateTextLower.includes("episodio"));
  const hasTVKeywords =
    candidateSlugLower.includes("serie") ||
    candidateSlugLower.includes("tv") ||
    candidateTitleLower.includes("serie") ||
    candidateTitleLower.includes("tv") ||
    candidateSlugLower.includes("season") ||
    candidateTitleLower.includes("season") ||
    candidateSlugLower.includes("temporada") ||
    candidateTitleLower.includes("temporada") ||
    candidateSlugLower.includes("capitulo") ||
    candidateTitleLower.includes("capitulo") ||
    (!hasEpisodeTitleWord && (
      candidateSlugLower.includes("episodio") ||
      candidateTitleLower.includes("episodio") ||
      candidateSlugLower.includes("episode") ||
      candidateTitleLower.includes("episode")
    ));

  const isCandidateTV = candidateType === "tv";
  const isCandidateMovieType = candidateType === "movie" || candidateType === "ova";

  if (isMovie) {
    if (candidateType) {
      if (isCandidateMovieType) maxScore *= 1.2;
      else if (isCandidateTV) maxScore *= 0.1;
    } else if (hasMovieKeywords) {
      maxScore *= 1.2;
    } else if (hasTVKeywords) {
      maxScore *= 0.1;
    }
  } else if (candidateType) {
    if (isCandidateTV) maxScore *= 1.2;
    else if (isCandidateMovieType) maxScore *= 0.1;
  } else if (hasMovieKeywords) {
    maxScore *= 0.1;
  } else if (hasTVKeywords) {
    maxScore *= 1.2;
  }

  const isLatino = candidateSlugLower.includes("latino") || candidateTitleLower.includes("latino");
  if (isLatino) maxScore *= 1.05;

  return maxScore;
}
