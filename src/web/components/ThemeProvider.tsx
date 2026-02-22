"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  const applyTheme = useCallback((t: Theme) => {
    const resolved = t === "system" ? getSystemTheme() : t;
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem("theme", t);
      applyTheme(t);
    },
    [applyTheme]
  );

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const initial = saved ?? "system";
    setThemeState(initial);
    applyTheme(initial);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if ((saved ?? "system") === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
