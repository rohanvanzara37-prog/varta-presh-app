import type { ColorPalette, ThemeMode } from '../types/news';

export function normalizeHex(hex: string): string {
  const cleaned = hex.trim().replace(/[^0-9a-fA-F#]/g, '');
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#1d4ed8';
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHex(hex).slice(1);
  const num = parseInt(safe, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function mixHex(hexA: string, hexB: string, weightA: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex(
    a.r * w + b.r * (1 - w),
    a.g * w + b.g * (1 - w),
    a.b * w + b.b * (1 - w)
  );
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function getContrastText(bgHex: string): string {
  const lum = getRelativeLuminance(bgHex);
  return lum > 0.34 ? '#0f172a' : '#ffffff';
}

export function getContrastGrade(ratio: number): 'AAA' | 'AA' | 'AA Large' | 'Low' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Low';
}

/**
 * Derives a cohesive full ColorPalette from user-chosen Primary, Secondary,
 * Accent colors and light/dark canvas mode, keeping surface contrast delta
 * crisp and WCAG-readable.
 */
export function buildPaletteFromTriad(params: {
  id: string;
  name: string;
  mode: ThemeMode;
  primary: string;
  secondary: string;
  accent: string;
  customCanvas?: string;
  customText?: string;
  isCustom?: boolean;
}): ColorPalette {
  const primary = normalizeHex(params.primary);
  const secondary = normalizeHex(params.secondary);
  const accent = normalizeHex(params.accent);

  if (params.mode === 'dark') {
    const canvas = params.customCanvas
      ? normalizeHex(params.customCanvas)
      : mixHex(primary, '#0b0e14', 0.08);
    const surface = mixHex(secondary, '#141923', 0.14);
    const elevated = mixHex(secondary, '#1d2432', 0.2);
    const text = params.customText ? normalizeHex(params.customText) : '#f3f5f8';
    const mutedText = mixHex(text, canvas, 0.65);

    return {
      id: params.id,
      name: params.name,
      isCustom: params.isCustom ?? true,
      mode: 'dark',
      primary,
      secondary,
      accent,
      canvas,
      surface,
      elevated,
      text,
      mutedText,
      msgSelfBg: primary,
      msgOtherBg: elevated,
      createdAt: Date.now(),
    };
  }

  const canvas = params.customCanvas
    ? normalizeHex(params.customCanvas)
    : mixHex(secondary, '#f7f8fa', 0.06);
  const surface = '#ffffff';
  const elevated = mixHex(secondary, '#f0f2f6', 0.16);
  const text = params.customText ? normalizeHex(params.customText) : '#111827';
  const mutedText = mixHex(text, canvas, 0.58);

  return {
    id: params.id,
    name: params.name,
    isCustom: params.isCustom ?? true,
    mode: 'light',
    primary,
    secondary,
    accent,
    canvas,
    surface,
    elevated,
    text,
    mutedText,
    msgSelfBg: primary,
    msgOtherBg: mixHex(secondary, '#edf1f7', 0.35),
    createdAt: Date.now(),
  };
}
