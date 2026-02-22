"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GlobalChannel {
  id: number;
  channelType: string;
  name: string;
  isEnabled: boolean;
  configurationJson: string;
}

interface GitHubRepo {
  nameWithOwner: string;
  description: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
}

interface GitHubBranch {
  name: string;
}

type RepoSource = "local" | "github";

export default function NewSessionPage() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [repoSource, setRepoSource] = useState<RepoSource>("local");
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [noPr, setNoPr] = useState(false);
  const [backendType, setBackendType] = useState("copilot");
  const [globalChannels, setGlobalChannels] = useState<GlobalChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // GitHub-specific state
  const [ghAuthenticated, setGhAuthenticated] = useState<boolean | null>(null);
  const [ghUsername, setGhUsername] = useState<string>("");
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [ghReposLoading, setGhReposLoading] = useState(false);
  const [ghSelectedRepo, setGhSelectedRepo] = useState<string>("");
  const [ghRepoSearch, setGhRepoSearch] = useState("");
  const [ghBranches, setGhBranches] = useState<GitHubBranch[]>([]);
  const [ghBranchesLoading, setGhBranchesLoading] = useState(false);
  const [ghSelectedBranch, setGhSelectedBranch] = useState<string>("");

  // GitHub connect dialog state
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [tokenSubmitting, setTokenSubmitting] = useState(false);

  // Fetch global channels
  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setGlobalChannels(data.filter((c: GlobalChannel) => c.isEnabled)));
  }, []);

  // Check GitHub auth status on mount
  const checkGitHubAuth = useCallback(() => {
    fetch("/api/github")
      .then((r) => r.json())
      .then((data) => {
        setGhAuthenticated(data.authenticated);
        if (data.username) setGhUsername(data.username);
        if (data.authenticated) setRepoSource("github");
      })
      .catch(() => setGhAuthenticated(false));
  }, []);

  useEffect(() => {
    checkGitHubAuth();
  }, [checkGitHubAuth]);

  // Fetch repos when switching to GitHub mode
  useEffect(() => {
    if (repoSource === "github" && ghAuthenticated && ghRepos.length === 0) {
      fetchRepos();
    }
  }, [repoSource, ghAuthenticated]);

  const fetchRepos = useCallback(async (query?: string) => {
    setGhReposLoading(true);
    try {
      const url = query ? `/api/github/repos?q=${encodeURIComponent(query)}` : "/api/github/repos";
      const res = await fetch(url);
      if (res.ok) {
        setGhRepos(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setGhReposLoading(false);
    }
  }, []);

  // Debounced repo search
  useEffect(() => {
    if (repoSource !== "github") return;
    const timeout = setTimeout(() => {
      fetchRepos(ghRepoSearch || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [ghRepoSearch, repoSource, fetchRepos]);

  // Fetch branches when a repo is selected
  useEffect(() => {
    if (!ghSelectedRepo) {
      setGhBranches([]);
      return;
    }
    setGhBranchesLoading(true);
    fetch(`/api/github/repos/${ghSelectedRepo}/branches`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGhBranches(data);
          // Auto-select default branch
          const repo = ghRepos.find((r) => r.nameWithOwner === ghSelectedRepo);
          if (repo && data.some((b: GitHubBranch) => b.name === repo.defaultBranch)) {
            setGhSelectedBranch(repo.defaultBranch);
          } else if (data.length > 0) {
            setGhSelectedBranch(data[0].name);
          }
        }
      })
      .catch(() => {})
      .finally(() => setGhBranchesLoading(false));
  }, [ghSelectedRepo]);

  const toggleChannel = (id: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConnectGitHub = async () => {
    if (!tokenInput.trim()) {
      setTokenError("Please enter a token.");
      return;
    }

    setTokenSubmitting(true);
    setTokenError("");

    try {
      const res = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTokenError(data.error || "Failed to connect.");
        return;
      }

      // Success
      setGhAuthenticated(true);
      setGhUsername(data.username);
      setShowTokenDialog(false);
      setTokenInput("");
      setRepoSource("github");
      fetchRepos();
    } catch (err: any) {
      setTokenError(err.message);
    } finally {
      setTokenSubmitting(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    await fetch("/api/github", { method: "DELETE" });
    setGhAuthenticated(false);
    setGhUsername("");
    setGhRepos([]);
    setGhSelectedRepo("");
    setGhSelectedBranch("");
    setRepoSource("local");
  };

  const handleSubmit = async () => {
    if (!task.trim()) {
      setError("Task is required.");
      return;
    }

    if (repoSource === "local" && !repoPath.trim()) {
      setError("Repository Path is required.");
      return;
    }

    if (repoSource === "github" && !ghSelectedRepo) {
      setError("Please select a GitHub repository.");
      return;
    }

    if (repoSource === "github" && !ghSelectedBranch) {
      setError("Please select a branch.");
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
      const payload: Record<string, unknown> = {
        task,
        autoApprove,
        noPr,
        backendType,
        globalChannels: selectedGC,
      };

      if (repoSource === "github") {
        payload.githubRepo = ghSelectedRepo;
        payload.baseBranch = ghSelectedBranch;
      } else {
        payload.repoPath = repoPath;
        payload.branch = branch || undefined;
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

        {/* Repository Source Selector */}
        <div className="form-group">
          <label>Repository Source</label>
          <div className="source-toggle">
            <button
              type="button"
              className={`btn btn-sm ${repoSource === "local" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setRepoSource("local")}
            >
              Local Path
            </button>
            <button
              type="button"
              className={`btn btn-sm ${repoSource === "github" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                if (ghAuthenticated) {
                  setRepoSource("github");
                } else {
                  setShowTokenDialog(true);
                }
              }}
            >
              GitHub {ghAuthenticated && ghUsername ? `(${ghUsername})` : ""}
            </button>
          </div>
        </div>

        {repoSource === "local" && (
          <>
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
          </>
        )}

        {repoSource === "github" && ghAuthenticated && (
          <>
            <div className="form-group">
              <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
                <label style={{ margin: 0 }}>
                  GitHub Repository * <span style={{ fontWeight: "normal", color: "var(--text-muted)" }}>({ghUsername})</span>
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleDisconnectGitHub}
                  style={{ fontSize: "0.75rem" }}
                >
                  Disconnect
                </button>
              </div>
              <input
                type="text"
                value={ghRepoSearch}
                onChange={(e) => setGhRepoSearch(e.target.value)}
                placeholder="Search repositories..."
                style={{ marginBottom: "0.5rem" }}
              />
              {ghReposLoading ? (
                <div style={{ color: "var(--text-muted)", padding: "0.5rem 0" }}>Loading repositories...</div>
              ) : (
                <select
                  value={ghSelectedRepo}
                  onChange={(e) => setGhSelectedRepo(e.target.value)}
                  size={Math.min(ghRepos.length + 1, 8)}
                  style={{ width: "100%" }}
                >
                  <option value="">Select a repository...</option>
                  {ghRepos.map((repo) => (
                    <option key={repo.nameWithOwner} value={repo.nameWithOwner}>
                      {repo.nameWithOwner} {repo.isPrivate ? "(private)" : ""} {repo.description ? `- ${repo.description.substring(0, 60)}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {ghSelectedRepo && (
              <div className="form-group">
                <label>Base Branch *</label>
                {ghBranchesLoading ? (
                  <div style={{ color: "var(--text-muted)", padding: "0.5rem 0" }}>Loading branches...</div>
                ) : (
                  <select
                    value={ghSelectedBranch}
                    onChange={(e) => setGhSelectedBranch(e.target.value)}
                  >
                    {ghBranches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <small style={{ color: "var(--text-muted)", display: "block", marginTop: "0.25rem" }}>
                  A new <code>coderagent/*</code> branch will be created from this branch. A draft PR will be opened automatically.
                </small>
              </div>
            )}
          </>
        )}

        {/* Connect with GitHub dialog */}
        {(showTokenDialog || (repoSource === "github" && !ghAuthenticated)) && (
          <div className="github-connect-card">
            <div className="github-connect-header">
              <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              <span>Connect with GitHub</span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Enter a <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Personal Access Token</a> with <code>repo</code> scope to connect your GitHub account.
            </p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              onKeyDown={(e) => e.key === "Enter" && handleConnectGitHub()}
            />
            {tokenError && <div className="error" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{tokenError}</div>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConnectGitHub}
                disabled={tokenSubmitting}
              >
                {tokenSubmitting ? "Connecting..." : "Connect"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowTokenDialog(false);
                  setTokenInput("");
                  setTokenError("");
                  if (!ghAuthenticated) setRepoSource("local");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

        {repoSource === "local" && (
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
        )}

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
