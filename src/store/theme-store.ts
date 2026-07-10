import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "midnight" | "sunshine";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "midnight",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "workspace-theme" }
  )
);
