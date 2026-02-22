"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../../lib/socket";

interface Session {
  id: string;
  task: string;
  status: string;
  repoPath: string;
  branch: string | null;
  backendType: string;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case "running":
    case "initializing":
      return "badge badge-active";
    case "completed":
      return "badge badge-completed";
    case "failed":
      return "badge badge-failed";
    default:
      return "badge badge-pending";
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const router = useRouter();

  const fetchSessions = async () => {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    setSessions(data);
  };

  useEffect(() => {
    fetchSessions();

    const socket = getSocket();
    socket.on("sessionListUpdated", fetchSessions);

    return () => {
      socket.off("sessionListUpdated", fetchSessions);
    };
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Sessions</h1>
        <button className="btn btn-primary" onClick={() => router.push("/sessions/new")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New Session
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Task</th>
              <th>Repository</th>
              <th>Branch</th>
              <th>Backend</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="clickable"
                onClick={() => router.push(`/sessions/${s.id}`)}
              >
                <td>
                  <span className={statusBadgeClass(s.status)}>{s.status}</span>
                </td>
                <td style={{ fontWeight: 500 }}>
                  {s.task.length > 60 ? s.task.substring(0, 60) + "..." : s.task}
                </td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {s.repoPath.split(/[/\\]/).pop()}
                </td>
                <td>
                  {s.branch ? (
                    <code style={{ fontSize: "0.8rem", background: "var(--bg-input)", padding: "0.15rem 0.4rem", border: "1px solid var(--border-subtle)" }}>
                      {s.branch}
                    </code>
                  ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>—</span>
                  )}
                </td>
                <td>
                  <span className="channel-chip">{s.backendType}</span>
                </td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {new Date(s.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M7 9h10M7 13h6" />
                      </svg>
                    </div>
                    <div className="empty-state-text">No sessions yet. Create one to get started.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
