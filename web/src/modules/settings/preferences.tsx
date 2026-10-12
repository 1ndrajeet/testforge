// app/(dashboard)/settings/preferences/page.tsx
//
// TODO(integration): This page is a self-contained preferences UI.
// Before shipping:
//   1. Replace `applyThemeToDocument` with the app's real theme mechanism
//      (next-themes `setTheme` / a custom ThemeProvider / etc.).
//   2. Replace `applyFontSizeToDocument` with the app's real font-size mechanism.
//   3. Replace the localStorage load/save with the app's persistence model
//      (Supabase row / user_metadata / cookie).
//   4. Confirm the route group: this file assumes `(dashboard)`, but the
//      URL you provided is `/exam-center/...`. Move it if the group differs.

'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  Check,
  Info,
  LayoutGrid,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Type as TypeIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

import { PageHeader } from '@/components/layout/page-layout';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ThemeChoice = 'system' | 'light' | 'dark';
type FontSize = 'compact' | 'default' | 'comfortable';
type LayoutDensity = 'compact' | 'comfortable';

interface Preferences {
  theme: ThemeChoice;
  fontSize: FontSize;
  density: LayoutDensity;
}

const STORAGE_KEY = 'testforge:preferences:v1';

const DEFAULTS: Preferences = {
  theme: 'system',
  fontSize: 'default',
  density: 'comfortable',
};

// ────────────────────────────────────────────────────────────
// Application hooks — replace these when wiring to the real app.
// ────────────────────────────────────────────────────────────

function applyThemeToDocument(theme: ThemeChoice) {
  // TODO(integration): if the app uses next-themes, this whole function
  // should be `setTheme(theme)` from `useTheme()`. If it uses a custom
  // provider, call the provider's setter instead.
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  root.classList.toggle('dark', effective === 'dark');
}

function applyFontSizeToDocument(size: FontSize) {
  // TODO(integration): replace with the app's real mechanism. If font size
  // is stored as a CSS variable, set it here. If it's a class on <html>,
  // swap classes instead.
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.fontSize = size;
}

// ────────────────────────────────────────────────────────────
// Persistence — replace with the app's real store.
// ────────────────────────────────────────────────────────────

function loadPreferences(): Preferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULTS.theme,
      fontSize:
        parsed.fontSize === 'compact' ||
        parsed.fontSize === 'default' ||
        parsed.fontSize === 'comfortable'
          ? parsed.fontSize
          : DEFAULTS.fontSize,
      density:
        parsed.density === 'compact' || parsed.density === 'comfortable'
          ? parsed.density
          : DEFAULTS.density,
    };
  } catch {
    return DEFAULTS;
  }
}

function savePreferences(prefs: Preferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or security exceptions: silently ignore. The toggle still works
    // for the current session; persistence will be repaired on next load.
  }
}

// ────────────────────────────────────────────────────────────
// Option card
// ────────────────────────────────────────────────────────────

function OptionCard<T extends string>({
  id,
  value,
  label,
  description,
  icon: Icon,
  selected,
  onSelect,
}: {
  id: string;
  value: T;
  label: string;
  description: string;
  icon: React.ElementType;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors motion-reduce:transition-none',
        'focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-emerald-400 dark:focus-within:ring-offset-neutral-950',
        selected
          ? 'border-emerald-700/40 bg-emerald-500/[0.05] dark:border-emerald-400/40 dark:bg-emerald-500/[0.08]'
          : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700',
      )}
    >
      <input
        id={id}
        type="radio"
        name={id.split('-')[0]}
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none',
          selected
            ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-400'
            : 'border-neutral-300 dark:border-neutral-600',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-neutral-950" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0',
              selected ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-500',
            )}
          />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{description}</p>
      </div>
    </label>
  );
}

// ────────────────────────────────────────────────────────────
// Section
// ────────────────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <p className="font-mono text-[11px] tracking-[0.18em] text-neutral-500 uppercase dark:text-neutral-400">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const router = useRouter();
  const baseId = useId();

  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Load once, on mount.
  useEffect(() => {
    const stored = loadPreferences();
    setPreferences(stored);
    applyThemeToDocument(stored.theme);
    applyFontSizeToDocument(stored.fontSize);
    setLoaded(true);
  }, []);

  // Reapply the theme when the OS preference changes, if the user chose "system".
  useEffect(() => {
    if (!loaded) return;
    if (preferences.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyThemeToDocument('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [preferences.theme, loaded]);

  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      if (key === 'theme') applyThemeToDocument(next.theme);
      if (key === 'fontSize') applyFontSizeToDocument(next.fontSize);
      return next;
    });
  }, []);

  const isModified = useMemo(
    () =>
      preferences.theme !== DEFAULTS.theme ||
      preferences.fontSize !== DEFAULTS.fontSize ||
      preferences.density !== DEFAULTS.density,
    [preferences],
  );

  const handleReset = useCallback(() => {
    setPreferences(DEFAULTS);
    savePreferences(DEFAULTS);
    applyThemeToDocument(DEFAULTS.theme);
    applyFontSizeToDocument(DEFAULTS.fontSize);
    toast.success('Preferences reset to defaults.');
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        title="Preferences"
        description="Appearance and layout options for your TestForge workspace."
        icon={Monitor}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isModified}
            className="h-8 gap-1.5"
          >
            <RotateCcw
              aria-hidden
              className="h-3.5 w-3.5"
            />
            Reset
          </Button>
        }
      />

      <div className="mt-10 space-y-10">
        {/* Theme */}
        <Section
          eyebrow="Appearance"
          title="Theme"
          description="Choose how TestForge looks. System follows your operating system setting."
        >
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            <OptionCard<ThemeChoice>
              id={`${baseId}-theme-system`}
              value="system"
              label="System"
              description="Match OS setting"
              icon={Monitor}
              selected={preferences.theme === 'system'}
              onSelect={(v) => update('theme', v)}
            />
            <OptionCard<ThemeChoice>
              id={`${baseId}-theme-light`}
              value="light"
              label="Light"
              description="Always light"
              icon={Sun}
              selected={preferences.theme === 'light'}
              onSelect={(v) => update('theme', v)}
            />
            <OptionCard<ThemeChoice>
              id={`${baseId}-theme-dark`}
              value="dark"
              label="Dark"
              description="Always dark"
              icon={Moon}
              selected={preferences.theme === 'dark'}
              onSelect={(v) => update('theme', v)}
            />
          </div>
        </Section>

        {/* Font size */}
        <Section
          eyebrow="Typography"
          title="Text size"
          description="Adjust the size of body text across operational pages like the timetable and seating chart."
        >
          <div
            role="radiogroup"
            aria-label="Text size"
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            <OptionCard<FontSize>
              id={`${baseId}-font-compact`}
              value="compact"
              label="Compact"
              description="More rows per screen"
              icon={TypeIcon}
              selected={preferences.fontSize === 'compact'}
              onSelect={(v) => update('fontSize', v)}
            />
            <OptionCard<FontSize>
              id={`${baseId}-font-default`}
              value="default"
              label="Default"
              description="Balanced readability"
              icon={TypeIcon}
              selected={preferences.fontSize === 'default'}
              onSelect={(v) => update('fontSize', v)}
            />
            <OptionCard<FontSize>
              id={`${baseId}-font-comfortable`}
              value="comfortable"
              label="Comfortable"
              description="Easier on the eyes"
              icon={TypeIcon}
              selected={preferences.fontSize === 'comfortable'}
              onSelect={(v) => update('fontSize', v)}
            />
          </div>
        </Section>

        {/* Layout density */}
        <Section
          eyebrow="Layout"
          title="Density"
          description="How much breathing room to give tables and lists."
        >
          <div
            role="radiogroup"
            aria-label="Layout density"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <OptionCard<LayoutDensity>
              id={`${baseId}-density-compact`}
              value="compact"
              label="Compact"
              description="Dense rows, tighter spacing"
              icon={LayoutGrid}
              selected={preferences.density === 'compact'}
              onSelect={(v) => update('density', v)}
            />
            <OptionCard<LayoutDensity>
              id={`${baseId}-density-comfortable`}
              value="comfortable"
              label="Comfortable"
              description="Relaxed spacing"
              icon={LayoutGrid}
              selected={preferences.density === 'comfortable'}
              onSelect={(v) => update('density', v)}
            />
          </div>
        </Section>

        {/* Save behaviour note */}
        <div
          role="status"
          className="flex items-start gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800"
        >
          <Info
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <p>
            Theme and text size apply immediately. Density takes effect on the next page you open.
            Preferences are stored on this browser only.
          </p>
        </div>
      </div>
    </div>
  );
}
