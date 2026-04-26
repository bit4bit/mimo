const NORMALIZE_SEP = /\\/g;

export const IMPACT_EXCLUDED_PATH_PREFIXES = [
  ".mimo/",
  ".fossil/",
  ".git/",
];

export const IMPACT_EXCLUDED_PATHS = [
  ".mimo",
  ".sccignore",
  ".jscpdignore",
  "_FOSSIL_",
  ".fslckout",
  ".fslckout-journal",
];

export function normalizeImpactPath(path: string): string {
  return path.replace(NORMALIZE_SEP, "/");
}

export function shouldIncludeImpactPath(path: string): boolean {
  const normalized = normalizeImpactPath(path);

  if (IMPACT_EXCLUDED_PATHS.includes(normalized)) {
    return false;
  }

  for (const prefix of IMPACT_EXCLUDED_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return false;
    }
  }

  return true;
}

export function buildImpactIgnorePatterns(): string[] {
  return [
    ".mimo",
    ".mimo/**",
    ".sccignore",
    ".jscpdignore",
    "_FOSSIL_",
    ".fslckout",
    ".fslckout-journal",
  ];
}
