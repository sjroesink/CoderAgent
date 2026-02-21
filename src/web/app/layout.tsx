import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCoder",
  description: "AI Agent Orchestration Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-icon">🤖</span>
              <span className="brand-text">AgentCoder</span>
            </div>
            <nav className="nav-menu">
              <a href="/sessions" className="nav-link">📋 Sessions</a>
              <a href="/sessions/new" className="nav-link">➕ New Session</a>
              <a href="/channels" className="nav-link">📡 Channels</a>
            </nav>
          </aside>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
