"use client";

import { ThemeProvider } from "./ThemeProvider";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">{children}</main>
      </div>
    </ThemeProvider>
  );
}
