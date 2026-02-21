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
      <div className="flex-between mb-1">
        <h1>Sessions</h1>
        <button className="btn btn-primary" onClick={() => router.push("/sessions/new")}>
          ➕ New Session
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Task</th>
              <th>Repo</th>
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
                <td>{s.task.length > 60 ? s.task.substring(0, 60) + "..." : s.task}</td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {s.repoPath.split(/[/\\]/).pop()}
                </td>
                <td>{s.branch ?? "—"}</td>
                <td>{s.backendType}</td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {new Date(s.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No sessions yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
