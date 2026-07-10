"use client";

import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme-store";

/**
 * Applies data-theme attribute and dark/light class to <html>
 * based on the persisted theme selection.
 * Render this once inside the root layout body.
 */
export function ThemeProvider() {
  const { theme } = useThemeStore();
  const hasAppliedTheme = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    const shouldAnimate =
      hasAppliedTheme.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (shouldAnimate) {
      root.classList.add("theme-transitioning");
      root.getBoundingClientRect();
    }

    root.setAttribute("data-theme", theme);
    if (theme === "sunshine") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }

    hasAppliedTheme.current = true;

    if (!shouldAnimate) return;

    const timeout = window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, 520);

    return () => {
      window.clearTimeout(timeout);
      root.classList.remove("theme-transitioning");
    };
  }, [theme]);

  return null;
}
