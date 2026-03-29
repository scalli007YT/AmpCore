"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const STORAGE_KEY = "theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "dark"
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = false,
  disableTransitionOnChange = false
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme as Theme;
    return (localStorage.getItem(STORAGE_KEY) as Theme) || (defaultTheme as Theme);
  });

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  // Apply theme class to <html>
  React.useEffect(() => {
    const root = document.documentElement;

    if (disableTransitionOnChange) {
      root.style.setProperty("transition", "none", "important");
    }

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(attribute, resolvedTheme);
    }

    if (disableTransitionOnChange) {
      // Force reflow then restore transitions
      void root.offsetHeight;
      root.style.removeProperty("transition");
    }
  }, [resolvedTheme, attribute, disableTransitionOnChange]);

  // Listen for system theme changes
  React.useEffect(() => {
    if (!enableSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") setThemeState("system"); // triggers re-resolve
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [enableSystem, theme]);

  const value = React.useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, setTheme, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
