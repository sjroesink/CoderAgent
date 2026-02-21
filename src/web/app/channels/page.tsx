"use client";

import { useState, useEffect } from "react";
import { ChannelIcon } from "../../components/ChannelIcon";

interface GlobalChannel {
  id: number;
  channelType: string;
  name: string;
  isEnabled: boolean;
  configurationJson: string;
  createdAt: string;
}

interface ConfigField {
  key: string;
  label: string;
  inputType: string;
  required: boolean;
  placeholder: string;
}

const CHANNEL_CONFIG_FIELDS: Record<string, ConfigField[]> = {
  Telegram: [
    { key: "botToken", label: "Bot Token", inputType: "text", required: true, placeholder: "Token from @BotFather" },
    { key: "chatId", label: "Chat ID", inputType: "text", required: true, placeholder: "Numeric chat ID" },
  ],
  Teams: [
    { key: "webhookUrl", label: "Webhook URL", inputType: "url", required: true, placeholder: "Incoming Webhook URL" },
  ],
};

const CHANNEL_TYPES = ["Telegram", "Teams"];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<GlobalChannel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState("Telegram");
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState(false);

  const fetchChannels = async () => {
    const res = await fetch("/api/channels");
    setChannels(await res.json());
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormType("Telegram");
    setFormEnabled(true);
    setFormConfig({});
    setShowSecrets(false);
  };

  const startEdit = (ch: GlobalChannel) => {
    setEditingId(ch.id);
    setFormType(ch.channelType);
    setFormName(ch.name);
    setFormEnabled(ch.isEnabled);
    setFormConfig(JSON.parse(ch.configurationJson));
    setShowForm(true);
  };

  const handleSave = async () => {
    const configJson = JSON.stringify(formConfig);

    if (editingId) {
      await fetch(`/api/channels/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          configurationJson: configJson,
          isEnabled: formEnabled,
        }),
      });
    } else {
      await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelType: formType,
          name: formName,
          configurationJson: configJson,
        }),
      });
    }

    resetForm();
    fetchChannels();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    fetchChannels();
  };

  const handleToggle = async (id: number) => {
    await fetch(`/api/channels/${id}`, { method: "PATCH" });
    fetchChannels();
  };

  const fields = CHANNEL_CONFIG_FIELDS[formType] ?? [];

  return (
    <div>
      <div className="flex-between mb-1">
        <h1>Global Channels</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          ➕ Add Channel
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Type</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.id}>
                <td>
                  <span className={ch.isEnabled ? "badge badge-enabled" : "badge badge-disabled"}>
                    {ch.isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td>{ch.name}</td>
                <td>
                  <span className="channel-chip">
                    <ChannelIcon channelType={ch.channelType} size={14} />
                    {ch.channelType}
                  </span>
                </td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {new Date(ch.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(ch)}>
                      Edit
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(ch.id)}>
                      {ch.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ch.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No channels configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="card">
          <h2>{editingId ? "Edit Channel" : "Add Channel"}</h2>

          {!editingId && (
            <div className="form-group">
              <label>Channel Type</label>
              <select value={formType} onChange={(e) => { setFormType(e.target.value); setFormConfig({}); }}>
                {CHANNEL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="My Telegram Bot"
            />
          </div>

          {editingId && (
            <div className="checkbox-group">
              <input
                type="checkbox"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
              />
              <span>Enabled</span>
            </div>
          )}

          <div className="checkbox-group">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => setShowSecrets(e.target.checked)}
            />
            <span>Show secret values</span>
          </div>

          {fields.map((f) => (
            <div key={f.key} className="form-group">
              <label>{f.label} {f.required && "*"}</label>
              <input
                type={showSecrets ? f.inputType : "password"}
                value={formConfig[f.key] ?? ""}
                onChange={(e) => setFormConfig({ ...formConfig, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingId ? "Save" : "Create"}
            </button>
            <button className="btn btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
