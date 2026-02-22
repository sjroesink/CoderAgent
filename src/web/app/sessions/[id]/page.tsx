"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "../../../lib/socket";
import { MarkdownMessage } from "../../../components/MarkdownMessage";
import { ChannelIcon } from "../../../components/ChannelIcon";

interface SessionDetail {
  id: string;
  task: string;
  status: string;
  repoPath: string;
  branch: string | null;
  backendType: string;
  prUrl: string | null;
  githubRepo: string | null;
  baseBranch: string | null;
  isActive: boolean;
  channels: { channelType: string }[];
}

interface Message {
  sender: string;
  message?: string;
  content?: string;
  channelType?: string;
  messageType: string;
  timestamp: string;
}

type SendMode = "send" | "steer" | "queue" | "feedback";

const SEND_MODES: {
  mode: SendMode;
  label: string;
  shortcut: string;
  description: string;
  prefix: string;
  placeholder: string;
}[] = [
  {
    mode: "send",
    label: "Send",
    shortcut: "Enter",
    description: "Send message directly to agent",
    prefix: "",
    placeholder: "Type a message...",
  },
  {
    mode: "steer",
    label: "Steer",
    shortcut: "Alt+Enter",
    description: "Course correction for the agent",
    prefix: "steer ",
    placeholder: "Type a course correction...",
  },
  {
    mode: "queue",
    label: "Queue",
    shortcut: "Shift+Enter",
    description: "Add to message queue (send later with flush)",
    prefix: "queue ",
    placeholder: "Type a message to queue...",
  },
  {
    mode: "feedback",
    label: "Feedback",
    shortcut: "Ctrl+Enter",
    description: "Send human feedback to agent",
    prefix: "feedback ",
    placeholder: "Type feedback for the agent...",
  },
];

function messageClass(type: string, sender: string): string {
  if (type === "Status") return "message message-status";
  if (type === "Completion") return "message message-completion";
  if (sender === "User") return "message message-user";
  return "message message-agent";
}

function shouldRenderMarkdown(type: string, sender: string): boolean {
  return sender === "Agent" || type === "Completion";
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [msgList, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sendMode, setSendMode] = useState<SendMode>("send");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [metaCollapsed, setMetaCollapsed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Smart auto-scroll: stick to bottom unless user scrolled up
  const isUserScrolledUp = useRef(false);
  const lastScrollTop = useRef(0);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!logRef.current) return;
    const el = logRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;

    // If user scrolled up (scrollTop decreased and not near bottom)
    if (el.scrollTop < lastScrollTop.current && !atBottom) {
      isUserScrolledUp.current = true;
    }

    // If near bottom, re-enable auto-scroll
    if (atBottom) {
      isUserScrolledUp.current = false;
    }

    lastScrollTop.current = el.scrollTop;
  }, []);

  const fetchSession = async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) setSession(await res.json());
  };

  const fetchMessages = async () => {
    const res = await fetch(`/api/sessions/${sessionId}/messages`);
    if (res.ok) setMessages(await res.json());
  };

  useEffect(() => {
    fetchSession();
    fetchMessages();

    const socket = getSocket();
    socket.emit("joinSession", sessionId);

    socket.on("receiveMessage", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("sessionStatusChanged", ({ status }: { status: string }) => {
      setSession((prev) => (prev ? { ...prev, status, isActive: status === "Running" } : prev));
    });

    return () => {
      socket.emit("leaveSession", sessionId);
      socket.off("receiveMessage");
      socket.off("sessionStatusChanged");
    };
  }, [sessionId]);

  // Auto-scroll on new messages (unless user scrolled up)
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      scrollToBottom();
    }
  }, [msgList, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSend = (modeOverride?: SendMode) => {
    if (!input.trim()) return;
    const mode = modeOverride ?? sendMode;
    const option = SEND_MODES.find((m) => m.mode === mode)!;
    sendMessage(option.prefix + input);
  };

  const sendMessage = async (msg: string) => {
    if (!msg.trim()) return;
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    setInput("");
    inputRef.current?.focus();
    // Force scroll to bottom when user sends a message
    isUserScrolledUp.current = false;
    requestAnimationFrame(scrollToBottom);
  };

  const restartSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSession();
      } else {
        const err = await res.json();
        alert(`Failed to restart session: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Failed to restart session: ${err.message}`);
    }
  };

  if (!session) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        Loading session...
      </div>
    );
  }

  const statusBadge = session.status.toLowerCase();
  const badgeClass =
    statusBadge === "running" || statusBadge === "initializing"
      ? "badge badge-active"
      : statusBadge === "completed"
        ? "badge badge-completed"
        : statusBadge === "failed"
          ? "badge badge-failed"
          : "badge badge-pending";

  const currentMode = SEND_MODES.find((m) => m.mode === sendMode)!;

  return (
    <div className="session-page">
      <div className="session-header">
        {/* Top bar with back, title, status, actions */}
        <div className="session-topbar">
          <div className="session-topbar-left">
            <button className="btn btn-icon" onClick={() => router.push("/sessions")} title="Back to sessions">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
            <div className="session-title-group">
              <h1 className="session-title">{session.task.length > 80 ? session.task.substring(0, 80) + "..." : session.task}</h1>
              <div className="session-subtitle">
                <span className={badgeClass}>{session.status}</span>
                <span className="session-subtitle-sep">|</span>
                <span className="session-subtitle-text">{session.backendType}</span>
                {session.githubRepo && (
                  <>
                    <span className="session-subtitle-sep">|</span>
                    <a href={`https://github.com/${session.githubRepo}`} target="_blank" rel="noopener noreferrer" className="session-subtitle-link">
                      {session.githubRepo}
                    </a>
                  </>
                )}
                {session.branch && (
                  <>
                    <span className="session-subtitle-sep">|</span>
                    <code className="session-subtitle-branch">{session.branch}</code>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="session-topbar-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMetaCollapsed(!metaCollapsed)}
              title={metaCollapsed ? "Show details" : "Hide details"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 5v2M8 9h.01" />
              </svg>
              {metaCollapsed ? "Show" : "Hide"} Details
            </button>
            {session.isActive ? (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => sendMessage("status")}>
                  Status
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => sendMessage("stop")}>
                  Stop
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={restartSession}>
                Restart
              </button>
            )}
          </div>
        </div>

        {/* Collapsible metadata card */}
        {!metaCollapsed && (
          <div className="card session-meta-card">
            <div className="meta-grid">
              {!session.githubRepo && (
                <div className="meta-item">
                  <div className="meta-label">Repository</div>
                  <div className="meta-value">{session.repoPath}</div>
                </div>
              )}
              {session.baseBranch && (
                <div className="meta-item">
                  <div className="meta-label">Base Branch</div>
                  <div className="meta-value">{session.baseBranch}</div>
                </div>
              )}
              <div className="meta-item">
                <div className="meta-label">Channels</div>
                <div className="meta-value channel-chips">
                  {session.channels.length > 0
                    ? session.channels.map((c) => (
                        <span key={c.channelType} className="channel-chip">
                          <ChannelIcon channelType={c.channelType} size={14} />
                          {c.channelType}
                        </span>
                      ))
                    : "—"}
                </div>
              </div>
              {session.prUrl && (
                <div className="meta-item">
                  <div className="meta-label">Pull Request</div>
                  <div className="meta-value">
                    <a href={session.prUrl} target="_blank" rel="noopener noreferrer">
                      View PR
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="chat-container">
        <div className="message-log" ref={logRef} onScroll={handleScroll}>
          {msgList.map((msg, i) => {
            const text = msg.message ?? msg.content ?? "";
            return (
              <div key={i} className={messageClass(msg.messageType, msg.sender)}>
                <div className="message-sender">
                  {msg.channelType && msg.channelType !== "WebUI" && (
                    <ChannelIcon channelType={msg.channelType} size={14} />
                  )}
                  {msg.sender}
                  <span className="message-time">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div className="message-content">
                  {shouldRenderMarkdown(msg.messageType, msg.sender) ? (
                    <MarkdownMessage content={text} />
                  ) : (
                    text
                  )}
                </div>
              </div>
            );
          })}
          {msgList.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="empty-state-text">No messages yet. Waiting for agent to start...</div>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom indicator */}
        {isUserScrolledUp.current && msgList.length > 0 && (
          <button
            className="scroll-to-bottom-btn"
            onClick={() => {
              isUserScrolledUp.current = false;
              scrollToBottom();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l5 5 5-5" />
            </svg>
            New messages
          </button>
        )}

        {session.isActive && (
          <div className="input-area">
            <input
              ref={inputRef}
              type="text"
              placeholder={currentMode.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.altKey) {
                  e.preventDefault();
                  handleSend("steer");
                } else if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  handleSend("queue");
                } else if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  handleSend("feedback");
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="send-action-group" ref={dropdownRef}>
              <button className="btn btn-primary send-action-main" onClick={() => handleSend()}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2L7 9M14 2l-4 12-3-5.5L2 6z" />
                </svg>
                {currentMode.label}
              </button>
              <button
                className="btn btn-primary send-action-toggle"
                onClick={() => setDropdownOpen((prev) => !prev)}
              >
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="send-action-dropdown">
                  {SEND_MODES.map((option) => (
                    <button
                      key={option.mode}
                      className={`send-action-option${option.mode === sendMode ? " active" : ""}`}
                      onClick={() => {
                        setSendMode(option.mode);
                        setDropdownOpen(false);
                        inputRef.current?.focus();
                      }}
                    >
                      <div className="send-action-option-info">
                        <span className="send-action-option-label">{option.label}</span>
                        <span className="send-action-option-desc">{option.description}</span>
                      </div>
                      <kbd className="send-action-kbd">{option.shortcut}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
