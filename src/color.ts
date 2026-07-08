import { ACCENT_COLOR } from './types.js';

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
