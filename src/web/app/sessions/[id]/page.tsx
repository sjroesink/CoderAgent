"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
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
  isActive: boolean;
  channels: { channelType: string }[];
}

interface Message {
  sender: string;
  message?: string;
  content?: string;
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

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [msgList, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sendMode, setSendMode] = useState<SendMode>("send");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [msgList]);

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
  };

  if (!session) return <div>Loading...</div>;

  const statusBadge = session.status.toLowerCase();
  const badgeClass =
    statusBadge === "running" || statusBadge === "initializing"
      ? "badge badge-active"
      : statusBadge === "completed"
        ? "badge badge-completed"
        : statusBadge === "failed"
          ? "badge badge-failed"
          : "badge badge-pending";

  return (
    <div className="session-page">
      <div className="session-header">
        <div className="flex-between mb-1">
          <h1>Session Detail</h1>
          <span className={badgeClass}>{session.status}</span>
        </div>

        <div className="card">
          <div className="meta-grid">
            <div className="meta-item">
              <div className="meta-label">Task</div>
              <div className="meta-value">{session.task}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Repository</div>
              <div className="meta-value">{session.repoPath}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Branch</div>
              <div className="meta-value">{session.branch ?? "—"}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Backend</div>
              <div className="meta-value">{session.backendType}</div>
            </div>
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
                    {session.prUrl}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {session.isActive && (
          <div className="quick-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => sendMessage("status")}>
              Status
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => sendMessage("stop")}>
              Stop
            </button>
          </div>
        )}
      </div>

      <div className="chat-container">
        <div className="message-log" ref={logRef}>
          {msgList.map((msg, i) => {
            const text = msg.message ?? msg.content ?? "";
            return (
              <div key={i} className={messageClass(msg.messageType, msg.sender)}>
                <div className="message-sender">
                  {msg.sender}
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
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
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
              No messages yet.
            </div>
          )}
        </div>

        {session.isActive && (
          <div className="input-area">
            <input
              type="text"
              placeholder={SEND_MODES.find((m) => m.mode === sendMode)!.placeholder}
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
                {SEND_MODES.find((m) => m.mode === sendMode)!.label}
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
