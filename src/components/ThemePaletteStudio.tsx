import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { DEFAULT_TYPOGRAPHY, FONT_OPTIONS, PRESET_PALETTES } from '../data/newsData';
import type {
  ColorPalette,
  FontOptionId,
  MessageBubbleStyle,
  ThemeMode,
  TypographySettings,
} from '../types/news';
import {
  buildPaletteFromTriad,
  getContrastGrade,
  getContrastRatio,
  getContrastText,
  normalizeHex,
} from '../utils/colorContrast';

interface ThemePaletteStudioProps {
  isOpen: boolean;
  onClose: () => void;
  activePalette: ColorPalette;
  customPalettes: ColorPalette[];
  onSelectPalette: (palette: ColorPalette) => void;
  onSaveCustomPalette: (palette: ColorPalette) => void;
  onDeleteCustomPalette: (paletteId: string) => void;
  typography: TypographySettings;
  onUpdateTypography: (next: TypographySettings) => void;
}

const SWATCH_SUGGESTIONS = {
  primary: ['#1d4ed8', '#0f766e', '#9a3412', '#6d28d9', '#be123c', '#15803d'],
  secondary: ['#dbeafe', '#ccfbf1', '#ffedd5', '#ede9fe', '#1e293b', '#27272a'],
  accent: ['#d97706', '#06b6d4', '#e11d48', '#10b981', '#f59e0b', '#38bdf8'],
};

export const ThemePaletteStudio: React.FC<ThemePaletteStudioProps> = ({
  isOpen,
  onClose,
  activePalette,
  customPalettes,
  onSelectPalette,
  onSaveCustomPalette,
  onDeleteCustomPalette,
  typography,
  onUpdateTypography,
}) => {
  const [studioTab, setStudioTab] = useState<'palettes' | 'typography'>('palettes');

  // Custom Palette Builder State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paletteName, setPaletteName] = useState('My Custom Palette');
  const [mode, setMode] = useState<ThemeMode>(activePalette.mode);
  const [primaryHex, setPrimaryHex] = useState(activePalette.primary);
  const [secondaryHex, setSecondaryHex] = useState(activePalette.secondary);
  const [accentHex, setAccentHex] = useState(activePalette.accent);
  const [useAdvancedCanvas, setUseAdvancedCanvas] = useState(false);
  const [customCanvasHex, setCustomCanvasHex] = useState(activePalette.canvas);
  const [customTextHex, setCustomTextHex] = useState(activePalette.text);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !editingId) {
      setMode(activePalette.mode);
      setPrimaryHex(activePalette.primary);
      setSecondaryHex(activePalette.secondary);
      setAccentHex(activePalette.accent);
      setCustomCanvasHex(activePalette.canvas);
      setCustomTextHex(activePalette.text);
    }
  }, [isOpen, activePalette, editingId]);

  const draftPalette = useMemo(
    () =>
      buildPaletteFromTriad({
        id: editingId ?? `custom-${Date.now()}`,
        name: paletteName.trim() || 'Custom Palette',
        mode,
        primary: primaryHex,
        secondary: secondaryHex,
        accent: accentHex,
        customCanvas: useAdvancedCanvas ? customCanvasHex : undefined,
        customText: useAdvancedCanvas ? customTextHex : undefined,
        isCustom: true,
      }),
    [
      editingId,
      paletteName,
      mode,
      primaryHex,
      secondaryHex,
      accentHex,
      useAdvancedCanvas,
      customCanvasHex,
      customTextHex,
    ]
  );

  const textContrastRatio = useMemo(
    () => getContrastRatio(draftPalette.text, draftPalette.surface),
    [draftPalette.text, draftPalette.surface]
  );
  const primaryBtnContrast = useMemo(
    () =>
      getContrastRatio(
        getContrastText(draftPalette.primary),
        draftPalette.primary
      ),
    [draftPalette.primary]
  );
  const textGrade = getContrastGrade(textContrastRatio);

  if (!isOpen) return null;

  const loadPaletteIntoBuilder = (p: ColorPalette, asEdit: boolean) => {
    setEditingId(asEdit ? p.id : null);
    setPaletteName(asEdit ? p.name : `${p.name} Remix`);
    setMode(p.mode);
    setPrimaryHex(p.primary);
    setSecondaryHex(p.secondary);
    setAccentHex(p.accent);
    setCustomCanvasHex(p.canvas);
    setCustomTextHex(p.text);
    setUseAdvancedCanvas(false);
  };

  const handleSavePalette = (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId ?? `custom-${Date.now()}`;
    const saved = buildPaletteFromTriad({
      id,
      name: paletteName.trim() || 'Untitled Palette',
      mode,
      primary: primaryHex,
      secondary: secondaryHex,
      accent: accentHex,
      customCanvas: useAdvancedCanvas ? customCanvasHex : undefined,
      customText: useAdvancedCanvas ? customTextHex : undefined,
      isCustom: true,
    });
    onSaveCustomPalette(saved);
    onSelectPalette(saved);
    setEditingId(saved.id);
    setSaveFeedback(`Saved "${saved.name}" and applied to app`);
    setTimeout(() => setSaveFeedback(null), 2800);
  };

  const handleApplyDraftLive = () => {
    onSelectPalette({ ...draftPalette, id: `preview-${Date.now()}` });
  };

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Theme Palette and Typography Studio"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-xl flex-col border-l shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
          color: 'var(--vp-text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Studio Header */}
        <div
          className="flex items-center justify-between gap-4 border-b px-5 py-4 shrink-0"
          style={{ borderColor: 'var(--vp-border)' }}
        >
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">
              Reading & Color Studio
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
              Create unique UI palettes and customize article & message fonts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close personalization studio"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors cursor-pointer"
            style={{
              borderColor: 'var(--vp-border)',
              backgroundColor: 'var(--vp-elevated)',
              color: 'var(--vp-text)',
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Studio Mode Tabs */}
        <div
          className="grid grid-cols-2 gap-1 p-1.5 mx-5 mt-4 rounded-xl shrink-0"
          style={{ backgroundColor: 'var(--vp-elevated)' }}
        >
          <button
            type="button"
            onClick={() => setStudioTab('palettes')}
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: studioTab === 'palettes' ? 'var(--vp-surface)' : 'transparent',
              color: studioTab === 'palettes' ? 'var(--vp-primary)' : 'var(--vp-muted)',
              boxShadow: studioTab === 'palettes' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Palette className="h-4 w-4 shrink-0" />
            <span>Color Palettes</span>
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('typography')}
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: studioTab === 'typography' ? 'var(--vp-surface)' : 'transparent',
              color: studioTab === 'typography' ? 'var(--vp-primary)' : 'var(--vp-muted)',
              boxShadow: studioTab === 'typography' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Type className="h-4 w-4 shrink-0" />
            <span>Text & Message Fonts</span>
          </button>
        </div>

        {/* Scrollable Studio Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {studioTab === 'palettes' ? (
            <>
              {/* Curated Preset Themes */}
              <section aria-labelledby="preset-themes-heading">
                <div className="flex items-center justify-between mb-3">
                  <h3 id="preset-themes-heading" className="text-sm font-semibold">
                    Curated Reading Themes
                  </h3>
                  <span className="text-xs" style={{ color: 'var(--vp-muted)' }}>
                    {PRESET_PALETTES.length} presets
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PRESET_PALETTES.map((preset) => {
                    const isActive = activePalette.id === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between gap-2 rounded-xl border p-3 transition-all"
                        style={{
                          backgroundColor: isActive ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                          borderColor: isActive ? 'var(--vp-primary)' : 'var(--vp-border)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectPalette(preset)}
                          className="flex flex-1 items-center gap-3 text-left min-h-[40px] cursor-pointer"
                        >
                          <span className="flex -space-x-1.5 shrink-0">
                            <span
                              className="h-5 w-5 rounded-full border border-white/40"
                              style={{ backgroundColor: preset.primary }}
                            />
                            <span
                              className="h-5 w-5 rounded-full border border-white/40"
                              style={{ backgroundColor: preset.secondary }}
                            />
                            <span
                              className="h-5 w-5 rounded-full border border-white/40"
                              style={{ backgroundColor: preset.accent }}
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold truncate">
                              {preset.name}
                            </span>
                            <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                              {preset.mode === 'dark' ? 'Dark' : 'Light'} surface
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          title={`Customize from ${preset.name}`}
                          onClick={() => loadPaletteIntoBuilder(preset, false)}
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-xs transition-colors cursor-pointer"
                          style={{ color: 'var(--vp-muted)' }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Saved Custom Palettes */}
              <section aria-labelledby="saved-palettes-heading">
                <div className="flex items-center justify-between mb-3">
                  <h3 id="saved-palettes-heading" className="text-sm font-semibold">
                    Your Saved Custom Palettes
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setPaletteName(`Unique Palette ${customPalettes.length + 1}`);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    style={{ color: 'var(--vp-primary)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Blank</span>
                  </button>
                </div>

                {customPalettes.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed p-4 text-xs leading-relaxed"
                    style={{
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-muted)',
                    }}
                  >
                    No custom palettes saved yet. Pick your Primary, Secondary, and Accent colors below and save your first personalized palette.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customPalettes.map((cp) => {
                      const isActive = activePalette.id === cp.id;
                      return (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between gap-2 rounded-xl border p-3"
                          style={{
                            backgroundColor: isActive ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                            borderColor: isActive ? 'var(--vp-primary)' : 'var(--vp-border)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectPalette(cp)}
                            className="flex flex-1 items-center gap-3 text-left min-h-[40px] cursor-pointer"
                          >
                            <span className="flex items-center gap-1 shrink-0">
                              <span
                                className="h-5 w-5 rounded-md"
                                style={{ backgroundColor: cp.primary }}
                                title={`Primary: ${cp.primary}`}
                              />
                              <span
                                className="h-5 w-5 rounded-md"
                                style={{ backgroundColor: cp.secondary }}
                                title={`Secondary: ${cp.secondary}`}
                              />
                              <span
                                className="h-5 w-5 rounded-md"
                                style={{ backgroundColor: cp.accent }}
                                title={`Accent: ${cp.accent}`}
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold truncate">
                                {cp.name}
                              </span>
                              <span className="block text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                                {cp.primary} · {cp.secondary} · {cp.accent}
                              </span>
                            </span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => loadPaletteIntoBuilder(cp, true)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                              style={{
                                backgroundColor: 'var(--vp-elevated)',
                                color: 'var(--vp-text)',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${cp.name}`}
                              onClick={() => onDeleteCustomPalette(cp.id)}
                              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Custom Palette Creator Form */}
              <section
                aria-labelledby="custom-creator-heading"
                className="rounded-2xl border p-4 sm:p-5 space-y-5"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 id="custom-creator-heading" className="text-sm font-bold">
                      {editingId ? 'Edit Custom Palette' : 'Create Custom Color Palette'}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                      Select Primary, Secondary, and Accent colors to craft your reading theme
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyDraftLive}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--vp-surface)',
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-text)',
                    }}
                  >
                    Preview Live
                  </button>
                </div>

                <form onSubmit={handleSavePalette} className="space-y-4">
                  {/* Name & Surface Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="palette-name-input" className="block text-xs font-semibold mb-1.5">
                        Palette Name
                      </label>
                      <input
                        id="palette-name-input"
                        type="text"
                        value={paletteName}
                        onChange={(e) => setPaletteName(e.target.value)}
                        placeholder="e.g. Saffron Sunset"
                        maxLength={32}
                        className="w-full min-h-[42px] rounded-xl border px-3 text-sm outline-none"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          borderColor: 'var(--vp-border)',
                          color: 'var(--vp-text)',
                        }}
                      />
                    </div>
                    <div>
                      <span className="block text-xs font-semibold mb-1.5">Surface Mode</span>
                      <div
                        className="grid grid-cols-2 gap-1 rounded-xl p-1 border"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          borderColor: 'var(--vp-border)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setMode('light')}
                          className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: mode === 'light' ? 'var(--vp-primary)' : 'transparent',
                            color: mode === 'light' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                          }}
                        >
                          <Sun className="h-3.5 w-3.5" />
                          <span>Light</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('dark')}
                          className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: mode === 'dark' ? 'var(--vp-primary)' : 'transparent',
                            color: mode === 'dark' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                          }}
                        >
                          <Moon className="h-3.5 w-3.5" />
                          <span>Dark</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Primary, Secondary, Accent Pickers */}
                  {(
                    [
                      {
                        key: 'primary',
                        label: 'Primary Color',
                        hint: 'Navigation, primary buttons, sender messages',
                        value: primaryHex,
                        setter: setPrimaryHex,
                        suggestions: SWATCH_SUGGESTIONS.primary,
                      },
                      {
                        key: 'secondary',
                        label: 'Secondary Color',
                        hint: 'Elevated panels, publisher cards, subtle tints',
                        value: secondaryHex,
                        setter: setSecondaryHex,
                        suggestions: SWATCH_SUGGESTIONS.secondary,
                      },
                      {
                        key: 'accent',
                        label: 'Accent Color',
                        hint: 'Breaking markers, live highlights, interactive focus',
                        value: accentHex,
                        setter: setAccentHex,
                        suggestions: SWATCH_SUGGESTIONS.accent,
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="rounded-xl border p-3"
                      style={{
                        backgroundColor: 'var(--vp-surface)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <label htmlFor={`color-${item.key}`} className="block text-xs font-semibold">
                            {item.label}
                          </label>
                          <span className="text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                            {item.hint}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            id={`color-${item.key}`}
                            type="color"
                            value={normalizeHex(item.value)}
                            onChange={(e) => item.setter(e.target.value)}
                            className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                          />
                          <input
                            type="text"
                            aria-label={`${item.label} hex code`}
                            value={item.value}
                            onChange={(e) => item.setter(e.target.value)}
                            onBlur={(e) => item.setter(normalizeHex(e.target.value))}
                            className="w-20 rounded-lg border px-2 py-1.5 text-xs font-mono-tabular uppercase"
                            style={{
                              backgroundColor: 'var(--vp-elevated)',
                              borderColor: 'var(--vp-border)',
                              color: 'var(--vp-text)',
                            }}
                          />
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        {item.suggestions.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Set ${item.label} to ${hex}`}
                            onClick={() => item.setter(hex)}
                            className="h-6 w-6 rounded-full border transition-transform hover:scale-110 cursor-pointer"
                            style={{
                              backgroundColor: hex,
                              borderColor:
                                normalizeHex(item.value) === hex
                                  ? 'var(--vp-text)'
                                  : 'rgba(128,128,128,0.25)',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Optional Manual Canvas & Text Override */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setUseAdvancedCanvas((v) => !v)}
                      className="text-xs font-semibold underline underline-offset-4 cursor-pointer"
                      style={{ color: 'var(--vp-primary)' }}
                    >
                      {useAdvancedCanvas
                        ? 'Hide custom background & text overrides'
                        : 'Fine-tune canvas background & reading ink'}
                    </button>

                    {useAdvancedCanvas && (
                      <div
                        className="mt-3 grid grid-cols-2 gap-3 rounded-xl border p-3"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          borderColor: 'var(--vp-border)',
                        }}
                      >
                        <label className="block text-xs">
                          <span className="font-semibold block mb-1">Canvas Background</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={normalizeHex(customCanvasHex)}
                              onChange={(e) => setCustomCanvasHex(e.target.value)}
                              className="h-8 w-10 rounded cursor-pointer"
                            />
                            <span className="font-mono-tabular text-[11px]">{customCanvasHex}</span>
                          </div>
                        </label>
                        <label className="block text-xs">
                          <span className="font-semibold block mb-1">Reading Ink</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={normalizeHex(customTextHex)}
                              onChange={(e) => setCustomTextHex(e.target.value)}
                              className="h-8 w-10 rounded cursor-pointer"
                            />
                            <span className="font-mono-tabular text-[11px]">{customTextHex}</span>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Live Miniature UI & Contrast Check */}
                  <div
                    className="rounded-xl border p-3.5 space-y-3"
                    style={{
                      backgroundColor: draftPalette.canvas,
                      borderColor: 'rgba(128,128,128,0.25)',
                      color: draftPalette.text,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold">Live Palette Preview</span>
                      <span className="font-mono-tabular">
                        Contrast {textContrastRatio}:1 ({textGrade}) · CTA {primaryBtnContrast}:1
                      </span>
                    </div>

                    <div
                      className="rounded-xl p-3 space-y-2 border"
                      style={{
                        backgroundColor: draftPalette.surface,
                        borderColor: 'rgba(128,128,128,0.18)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: draftPalette.accent }}
                        >
                          Breaking Dispatch · 4m ago
                        </span>
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: draftPalette.secondary,
                            color: getContrastText(draftPalette.secondary),
                          }}
                        >
                          Trusted Desk
                        </span>
                      </div>
                      <p
                        className="text-sm font-bold leading-snug"
                        style={{ fontFamily: getFontFamily(typography.headlineFont) }}
                      >
                        Clean infrastructure corridors expand across 18 cities
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span
                          className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: draftPalette.msgSelfBg,
                            color: getContrastText(draftPalette.msgSelfBg),
                            fontFamily: getFontFamily(typography.messageFont),
                          }}
                        >
                          Shared message preview
                        </span>
                        <span
                          className="rounded-lg px-3 py-1 text-[11px] font-semibold"
                          style={{
                            backgroundColor: draftPalette.primary,
                            color: getContrastText(draftPalette.primary),
                          }}
                        >
                          Read Story
                        </span>
                      </div>
                    </div>
                  </div>

                  {saveFeedback && (
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--vp-primary)',
                        color: 'var(--vp-primary-fg)',
                      }}
                    >
                      <Check className="h-4 w-4 shrink-0" />
                      <span>{saveFeedback}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="submit"
                      className="flex-1 min-h-[44px] rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-transform active:scale-[0.98] cursor-pointer"
                      style={{
                        backgroundColor: 'var(--vp-primary)',
                        color: 'var(--vp-primary-fg)',
                      }}
                    >
                      {editingId ? 'Update & Save Palette' : 'Save & Apply Palette'}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          const cloned = {
                            ...draftPalette,
                            id: `custom-${Date.now()}`,
                            name: `${paletteName.trim() || 'Palette'} Copy`,
                          };
                          onSaveCustomPalette(cloned);
                          onSelectPalette(cloned);
                          setEditingId(cloned.id);
                          setSaveFeedback(`Saved as "${cloned.name}"`);
                          setTimeout(() => setSaveFeedback(null), 2500);
                        }}
                        className="min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          borderColor: 'var(--vp-border)',
                          color: 'var(--vp-text)',
                        }}
                      >
                        Save as New
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </>
          ) : (
            /* TYPOGRAPHY & MESSAGE FONT STUDIO */
            <div className="space-y-6">
              {/* Article Headline Font */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Headline Font</h3>
                  <button
                    type="button"
                    onClick={() => onUpdateTypography(DEFAULT_TYPOGRAPHY)}
                    className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                    style={{ color: 'var(--vp-primary)' }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset defaults</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FONT_OPTIONS.map((font) => {
                    const active = typography.headlineFont === font.id;
                    return (
                      <button
                        key={`head-${font.id}`}
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, headlineFont: font.id })
                        }
                        className="flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                          borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                          boxShadow: active ? '0 0 0 1px var(--vp-primary)' : 'none',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-base font-bold transition-colors"
                          style={{
                            fontFamily: font.cssFamily,
                            backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                            color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                            borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                          }}
                        >
                          Aa
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-sm font-bold truncate"
                            style={{ fontFamily: font.cssFamily }}
                          >
                            {font.label}
                          </span>
                          <span className="block text-[11px] mt-0.5 truncate" style={{ color: 'var(--vp-muted)' }}>
                            {font.category}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Article Body Font & Size */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Article Reading Font & Scale</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FONT_OPTIONS.map((font) => {
                    const active = typography.articleFont === font.id;
                    const scaledAa = Math.min(20, Math.max(13, Math.round(typography.articleFontSize * 0.92)));
                    return (
                      <button
                        key={`body-${font.id}`}
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, articleFont: font.id })
                        }
                        className="flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                          borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                          boxShadow: active ? '0 0 0 1px var(--vp-primary)' : 'none',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-semibold transition-all"
                          style={{
                            fontFamily: font.cssFamily,
                            fontSize: `${scaledAa}px`,
                            lineHeight: typography.articleLineHeight,
                            backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                            color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                            borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                          }}
                        >
                          Aa
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-sm font-semibold truncate"
                            style={{ fontFamily: font.cssFamily }}
                          >
                            {font.label}
                          </span>
                          <span
                            className="block text-[11px] mt-0.5 line-clamp-1"
                            style={{ color: 'var(--vp-muted)', fontFamily: font.cssFamily }}
                          >
                            {font.sampleText}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="rounded-xl border p-4 space-y-4"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <label htmlFor="article-size-slider">Article Text Size</label>
                      <span className="font-mono-tabular">{typography.articleFontSize}px</span>
                    </div>
                    <input
                      id="article-size-slider"
                      type="range"
                      min={14}
                      max={24}
                      step={1}
                      value={typography.articleFontSize}
                      onChange={(e) =>
                        onUpdateTypography({
                          ...typography,
                          articleFontSize: Number(e.target.value),
                        })
                      }
                      className="w-full accent-current cursor-pointer"
                      style={{ color: 'var(--vp-primary)' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <label htmlFor="article-lh-slider">Line Spacing</label>
                      <span className="font-mono-tabular">{typography.articleLineHeight.toFixed(2)}</span>
                    </div>
                    <input
                      id="article-lh-slider"
                      type="range"
                      min={1.4}
                      max={1.9}
                      step={0.05}
                      value={typography.articleLineHeight}
                      onChange={(e) =>
                        onUpdateTypography({
                          ...typography,
                          articleLineHeight: Number(e.target.value),
                        })
                      }
                      className="w-full accent-current cursor-pointer"
                      style={{ color: 'var(--vp-primary)' }}
                    />
                  </div>
                </div>
              </section>

              {/* Message & Chat Font Studio */}
              <section
                className="rounded-2xl border p-4 space-y-4"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <div>
                  <h3 className="text-sm font-bold">Message & Reader Chat Font</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                    Customize font family, size, bubble shape, and unique colors for news messages
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FONT_OPTIONS.map((font) => {
                    const active = typography.messageFont === font.id;
                    const msgBubbleRadius =
                      typography.messageBubbleStyle === 'rounded'
                        ? '10px 10px 3px 10px'
                        : typography.messageBubbleStyle === 'editorial'
                          ? '8px'
                          : '4px';
                    return (
                      <button
                        key={`msg-${font.id}`}
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, messageFont: font.id })
                        }
                        className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? 'var(--vp-surface)' : 'var(--vp-surface)',
                          color: 'var(--vp-text)',
                          borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                          boxShadow: active ? '0 0 0 1px var(--vp-primary)' : 'none',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-9 shrink-0 items-center justify-center font-semibold transition-all"
                          style={{
                            fontFamily: font.cssFamily,
                            fontSize: `${typography.messageFontSize}px`,
                            borderRadius: msgBubbleRadius,
                            backgroundColor: active ? 'var(--vp-msg-self-bg)' : 'var(--vp-msg-other-bg)',
                            color: active ? 'var(--vp-msg-self-fg)' : 'var(--vp-msg-other-fg)',
                          }}
                        >
                          Aa
                        </span>
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ fontFamily: font.cssFamily }}
                        >
                          {font.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <label htmlFor="msg-size-slider">Message Font Size</label>
                    <span className="font-mono-tabular">{typography.messageFontSize}px</span>
                  </div>
                  <input
                    id="msg-size-slider"
                    type="range"
                    min={12}
                    max={18}
                    step={1}
                    value={typography.messageFontSize}
                    onChange={(e) =>
                      onUpdateTypography({
                        ...typography,
                        messageFontSize: Number(e.target.value),
                      })
                    }
                    className="w-full accent-current cursor-pointer"
                    style={{ color: 'var(--vp-primary)' }}
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold mb-1.5">Bubble Geometry</span>
                  <div
                    className="grid grid-cols-3 gap-1 rounded-xl p-1 border"
                    style={{
                      backgroundColor: 'var(--vp-surface)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    {(
                      [
                        { id: 'rounded', label: 'Rounded' },
                        { id: 'editorial', label: 'Editorial' },
                        { id: 'compact', label: 'Sharp' },
                      ] as { id: MessageBubbleStyle; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, messageBubbleStyle: opt.id })
                        }
                        className="min-h-[36px] rounded-lg text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor:
                            typography.messageBubbleStyle === opt.id
                              ? 'var(--vp-primary)'
                              : 'transparent',
                          color:
                            typography.messageBubbleStyle === opt.id
                              ? 'var(--vp-primary-fg)'
                              : 'var(--vp-muted)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Message Bubble Colors */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Message Bubble Colors</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, messageColorMode: 'palette' })
                        }
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor:
                            typography.messageColorMode === 'palette'
                              ? 'var(--vp-primary)'
                              : 'var(--vp-surface)',
                          color:
                            typography.messageColorMode === 'palette'
                              ? 'var(--vp-primary-fg)'
                              : 'var(--vp-muted)',
                        }}
                      >
                        Match Theme
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTypography({ ...typography, messageColorMode: 'custom' })
                        }
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor:
                            typography.messageColorMode === 'custom'
                              ? 'var(--vp-primary)'
                              : 'var(--vp-surface)',
                          color:
                            typography.messageColorMode === 'custom'
                              ? 'var(--vp-primary-fg)'
                              : 'var(--vp-muted)',
                        }}
                      >
                        Custom Colors
                      </button>
                    </div>
                  </div>

                  {typography.messageColorMode === 'custom' && (
                    <div
                      className="grid grid-cols-2 gap-3 rounded-xl border p-3"
                      style={{
                        backgroundColor: 'var(--vp-surface)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      <label className="text-xs">
                        <span className="block font-semibold mb-1">Your Bubble</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={normalizeHex(typography.customMsgSelfBg)}
                            onChange={(e) =>
                              onUpdateTypography({
                                ...typography,
                                customMsgSelfBg: e.target.value,
                              })
                            }
                            className="h-8 w-10 cursor-pointer"
                          />
                          <span className="font-mono-tabular text-[11px]">
                            {typography.customMsgSelfBg}
                          </span>
                        </div>
                      </label>
                      <label className="text-xs">
                        <span className="block font-semibold mb-1">Reader Bubble</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={normalizeHex(typography.customMsgOtherBg)}
                            onChange={(e) =>
                              onUpdateTypography({
                                ...typography,
                                customMsgOtherBg: e.target.value,
                              })
                            }
                            className="h-8 w-10 cursor-pointer"
                          />
                          <span className="font-mono-tabular text-[11px]">
                            {typography.customMsgOtherBg}
                          </span>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                {/* Live Message & Article Typography Preview */}
                <div
                  className="rounded-xl border p-3.5 space-y-2.5"
                  style={{
                    backgroundColor: 'var(--vp-surface)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    Live Reader & Message Preview
                  </span>
                  <p
                    style={{
                      fontFamily: getFontFamily(typography.articleFont),
                      fontSize: `${typography.articleFontSize}px`,
                      lineHeight: typography.articleLineHeight,
                    }}
                  >
                    Clean metro corridors cut morning commute delays across 18 metropolitan hubs.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    <div
                      className="self-start max-w-[85%] px-3 py-2"
                      style={{
                        fontFamily: getFontFamily(typography.messageFont),
                        fontSize: `${typography.messageFontSize}px`,
                        backgroundColor: 'var(--vp-msg-other-bg)',
                        color: 'var(--vp-msg-other-fg)',
                        borderRadius:
                          typography.messageBubbleStyle === 'rounded'
                            ? '16px 16px 16px 4px'
                            : typography.messageBubbleStyle === 'editorial'
                              ? '10px'
                              : '4px',
                      }}
                    >
                      Reader note: Great news for daily rail commuters!
                    </div>
                    <div
                      className="self-end max-w-[85%] px-3 py-2"
                      style={{
                        fontFamily: getFontFamily(typography.messageFont),
                        fontSize: `${typography.messageFontSize}px`,
                        backgroundColor: 'var(--vp-msg-self-bg)',
                        color: 'var(--vp-msg-self-fg)',
                        borderRadius:
                          typography.messageBubbleStyle === 'rounded'
                            ? '16px 16px 4px 16px'
                            : typography.messageBubbleStyle === 'editorial'
                              ? '10px'
                              : '4px',
                      }}
                    >
                      Sharing this dispatch to our local news room.
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
