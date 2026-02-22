"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 8.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5M8 11v3" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const navItems = [
    {
      href: "/sessions",
      label: "Sessions",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="16" height="14" rx="2" />
          <path d="M6 7h8M6 10h5" />
        </svg>
      ),
      active: pathname === "/sessions" || pathname === "/",
    },
    {
      href: "/sessions/new",
      label: "New Session",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v8M6 10h8" />
        </svg>
      ),
      active: pathname === "/sessions/new",
    },
    {
      href: "/channels",
      label: "Channels",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2v3M10 15v3M3.93 6L6.6 7.5M13.4 12.5l2.67 1.5M3.93 14l2.67-1.5M13.4 7.5l2.67-1.5" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      ),
      active: pathname === "/channels",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 7l6-4 6 4v6l-6 4-6-4V7z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="10" cy="10" r="2.5" fill="white" opacity="0.8" />
          </svg>
        </div>
        <span className="brand-text">AgentCoder</span>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`nav-link${item.active ? " active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="theme-toggle">
          <button
            className={`theme-toggle-btn${theme === "light" ? " active" : ""}`}
            onClick={() => setTheme("light")}
            title="Light"
          >
            <SunIcon />
          </button>
          <button
            className={`theme-toggle-btn${theme === "system" ? " active" : ""}`}
            onClick={() => setTheme("system")}
            title="System"
          >
            <MonitorIcon />
          </button>
          <button
            className={`theme-toggle-btn${theme === "dark" ? " active" : ""}`}
            onClick={() => setTheme("dark")}
            title="Dark"
          >
            <MoonIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
