"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface GlobalChannel {
  id: number;
  channelType: string;
  name: string;
  isEnabled: boolean;
  configurationJson: string;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [noPr, setNoPr] = useState(false);
  const [backendType, setBackendType] = useState("copilot");
  const [globalChannels, setGlobalChannels] = useState<GlobalChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setGlobalChannels(data.filter((c: GlobalChannel) => c.isEnabled)));
  }, []);

  const toggleChannel = (id: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!task.trim() || !repoPath.trim()) {
      setError("Task and Repository Path are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    const selectedGC = globalChannels
      .filter((gc) => selectedChannels.has(gc.id))
      .map((gc) => ({
        channelType: gc.channelType,
        configurationJson: gc.configurationJson,
      }));

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          repoPath,
          branch: branch || undefined,
          autoApprove,
          noPr,
          backendType,
          globalChannels: selectedGC,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create session.");
        return;
      }

      const { sessionId } = await res.json();
      router.push(`/sessions/${sessionId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1>New Session</h1>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="form-group">
          <label>Task Description *</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the coding task for the agent..."
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Repository Path *</label>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/path/to/your/repo"
          />
        </div>

        <div className="form-group">
          <label>Branch (optional)</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="feature/my-branch"
          />
        </div>

        <div className="form-group">
          <label>Agent Backend</label>
          <select value={backendType} onChange={(e) => setBackendType(e.target.value)}>
            <option value="copilot">GitHub Copilot</option>
            <option value="claude">Claude</option>
          </select>
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="autoApprove"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
          />
          <label htmlFor="autoApprove" style={{ margin: 0 }}>
            Auto-approve permissions (use with caution)
          </label>
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="noPr"
            checked={noPr}
            onChange={(e) => setNoPr(e.target.checked)}
          />
          <label htmlFor="noPr" style={{ margin: 0 }}>
            Skip PR creation
          </label>
        </div>

        {globalChannels.length > 0 && (
          <div className="form-group">
            <label>Additional Channels</label>
            {globalChannels.map((gc) => (
              <div key={gc.id} className="checkbox-group">
                <input
                  type="checkbox"
                  checked={selectedChannels.has(gc.id)}
                  onChange={() => toggleChannel(gc.id)}
                />
                <span>
                  {gc.name} ({gc.channelType})
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create Session"}
        </button>
      </div>
    </div>
  );
}
