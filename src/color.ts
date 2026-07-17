import { ACCENT_COLOR } from './types.js';

export interface BranchColorRule {
  pattern: string;
  color: number;
}

export function parseHexColor(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return undefined;
  }

  return Number.parseInt(hex, 16);
}

export function parseBranchColors(
  input: string,
  onWarning?: (message: string) => void,
): BranchColorRule[] {
  if (!input.trim()) {
    return [];
  }

  const rules: BranchColorRule[] = [];

  for (const entry of input.split(/[,\n]/)) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const pattern = trimmedEntry.slice(0, separatorIndex).trim();
    const colorInput = trimmedEntry.slice(separatorIndex + 1).trim();
    if (!pattern || !colorInput) {
      continue;
    }

    const color = parseHexColor(colorInput);
    if (color === undefined) {
      onWarning?.(
        `Invalid hex color "${colorInput}" in branch-colors entry "${trimmedEntry}"; skipping.`,
      );
      continue;
    }

    rules.push({ pattern, color });
  }

  return rules;
}

export function matchBranchPattern(branch: string, pattern: string): boolean {
  const DOUBLE_STAR_PLACEHOLDER = '\0DOUBLESTAR\0';
  let regexSource = '';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === '*' && pattern[index + 1] === '*') {
      regexSource += DOUBLE_STAR_PLACEHOLDER;
      index += 1;
      continue;
    }

    if (character === '*') {
      regexSource += '[^/]*';
      continue;
    }

    if (/[$^()+.|\\[\]{}]/.test(character)) {
      regexSource += `\\${character}`;
      continue;
    }

    regexSource += character;
  }

  regexSource = regexSource.replaceAll(DOUBLE_STAR_PLACEHOLDER, '.*');
  return new RegExp(`^${regexSource}$`).test(branch);
}

export function resolveAccentColor(
  branch: string,
  branchColors: BranchColorRule[],
  accentColor?: number,
  repoFullName?: string,
): number {
  for (const rule of branchColors) {
    if (matchBranchPattern(branch, rule.pattern)) {
      return rule.color;
    }
  }

  if (accentColor !== undefined) {
    return accentColor;
  }

  return colorFromRepoName(repoFullName ?? '');
}

function hslToAccentColor(hue: number, saturation: number, lightness: number): number {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const intermediate =
    chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = intermediate;
  } else if (hue < 120) {
    red = intermediate;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (hue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (hue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  const r = Math.round((red + match) * 255);
  const g = Math.round((green + match) * 255);
  const b = Math.round((blue + match) * 255);

  return (r << 16) | (g << 8) | b;
}

export function colorFromRepoName(repoName: string): number {
  if (!repoName) {
    return ACCENT_COLOR;
  }

  let hash = 0;
  for (const character of repoName) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const hue = hash % 360;
  return hslToAccentColor(hue, 0.55, 0.55);
}
