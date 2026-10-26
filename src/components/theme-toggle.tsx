"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
];

/**
 * Tombol pilihan tema. Tombol yang aktif ditandai lewat CSS (atribut data-theme-pref di <html>),
 * sehingga hasil render server dan browser selalu sama (tidak ada hydration error).
 */
export function ThemeToggle() {
  function choose(pref: ThemePreference) {
    if (window.__setTheme) {
      window.__setTheme(pref);
      return;
    }
    // Cadangan bila script tema di <head> belum berjalan
    const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme-pref", pref);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {}
  }

  return (
    <div role="group" aria-label="Pilihan tema" className="flex rounded-lg bg-subtle p-0.5 ring-1 ring-border">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          data-theme-option={value}
          onClick={() => choose(value)}
          title={`Tema ${label}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
