"use client";
import { useState, useEffect, useRef } from "react";

export default function Inbox() {
    const [conversations, setConversations] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [aiEnabled, setAiEnabled] = useState(true);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [togglingPause, setTogglingPause] = useState(false);
    const messagesEndRef = useRef(null);

    const isAutomationPaused = selectedLead?.automation_paused === 1;

    useEffect(() => {
        fetchConversations();
        const interval = setInterval(fetchConversations, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedLead) {
            fetchMessages(selectedLead.id);
            const interval = setInterval(() => fetchMessages(selectedLead.id), 5000);
            return () => clearInterval(interval);
        }
    }, [selectedLead]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function fetchConversations() {
        try {
            const res = await fetch("/api/prospects?type=leads&limit=50");
            const data = await res.json();
            setConversations(data.leads || []);
            // Refresh selectedLead data if it exists
            if (selectedLead) {
                const updated = (data.leads || []).find((l) => l.id === selectedLead.id);
                if (updated) setSelectedLead(updated);
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }

    async function fetchMessages(leadId) {
        try {
            const res = await fetch(`/api/messages?lead_id=${leadId}`);
            const data = await res.json();
            setMessages((data.messages || []).reverse());
        } catch (err) {
            console.error(err);
        }
    }

    async function toggleAutomation() {
        if (!selectedLead) return;
        setTogglingPause(true);
        try {
            const newState = !isAutomationPaused;
            await fetch("/api/prospects", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lead_id: selectedLead.id,
                    automation_paused: newState,
                }),
            });
            setSelectedLead({ ...selectedLead, automation_paused: newState ? 1 : 0 });
            fetchConversations();
        } catch (err) {
            console.error(err);
        } finally {
            setTogglingPause(false);
        }
    }

    async function sendMessage(e) {
        e.preventDefault();
        if (!newMessage.trim() || !selectedLead) return;

        try {
            await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lead_id: selectedLead.id,
                    content: newMessage,
                    role: "human",
                }),
            });
            setNewMessage("");
            fetchMessages(selectedLead.id);
        } catch (err) {
            console.error(err);
        }
    }

    async function handleSyncChat() {
        if (!selectedLead || syncing) return;
        setSyncing(true);
        try {
            const res = await fetch("/api/sync-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lead_id: selectedLead.id }),
            });
            const data = await res.json();
            if (data.success) {
                fetchMessages(selectedLead.id);
                setLastSync(new Date().toLocaleTimeString());
            } else {
                alert("Error al sincronizar: " + (data.error || "Turno ocupado"));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSyncing(false);
        }
    }

    async function generateAIReply() {
        if (!selectedLead) return;
        setGenerating(true);
        try {
            const action = messages.length === 0 ? "opener" : "reply";
            const res = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    lead_id: selectedLead.id,
                }),
            });
            const data = await res.json();
            if (data.message) {
                setNewMessage(data.message);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Bandeja Global</h1>
            </div>

            <div className="inbox-layout">
                {/* Conversation List */}
                <div className="inbox-sidebar">
                    <div className="inbox-search">
                        <input className="input" placeholder="Buscar prospectos..." />
                    </div>

                    {loading ? (
                        <div className="empty-state" style={{ padding: "20px" }}>
                            <div className="spinner" style={{ margin: "0 auto" }}></div>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="empty-state" style={{ padding: "30px" }}>
                            <div className="empty-state-text">Sin conversaciones aún</div>
                        </div>
                    ) : (
                        conversations.map((lead) => (
                            <div
                                key={lead.id}
                                className={`conversation-item ${selectedLead?.id === lead.id ? "active" : ""}`}
                                onClick={() => setSelectedLead(lead)}
                            >
                                <div className="conversation-avatar">
                                    {(lead.ig_handle || "?")[0].toUpperCase()}
                                </div>
                                <div className="conversation-info">
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span className="conversation-name">@{lead.ig_handle}</span>
                                        {lead.automation_paused === 1 && (
                                            <span style={{
                                                fontSize: "9px",
                                                background: "rgba(239, 68, 68, 0.2)",
                                                color: "#ef4444",
                                                padding: "1px 5px",
                                                borderRadius: "4px",
                                                fontWeight: 700,
                                            }}>
                                                MANUAL
                                            </span>
                                        )}
                                    </div>
                                    <div className="conversation-preview">
                                        <span className={`badge badge-${lead.status}`} style={{ padding: "1px 6px", fontSize: "10px" }}>
                                            {lead.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Chat Area */}
                <div className="chat-area">
                    {selectedLead ? (
                        <>
                            <div className="chat-header">
                                <div>
                                    <span style={{ fontWeight: 600 }}>@{selectedLead.ig_handle}</span>
                                    <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                                        {selectedLead.followers_count?.toLocaleString() || 0} seguidores
                                    </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    {/* Botón Detener/Reactivar Brandon */}
                                    <button
                                        onClick={toggleAutomation}
                                        disabled={togglingPause}
                                        style={{
                                            padding: "6px 14px",
                                            borderRadius: "8px",
                                            border: isAutomationPaused
                                                ? "1px solid rgba(34, 197, 94, 0.5)"
                                                : "1px solid rgba(239, 68, 68, 0.5)",
                                            background: isAutomationPaused
                                                ? "rgba(34, 197, 94, 0.1)"
                                                : "rgba(239, 68, 68, 0.1)",
                                            color: isAutomationPaused ? "#22c55e" : "#ef4444",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            fontWeight: 700,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        {togglingPause ? (
                                            <span className="spinner" style={{ width: "12px", height: "12px" }}></span>
                                        ) : isAutomationPaused ? (
                                            <>▶ Reactivar Brandon</>
                                        ) : (
                                            <>⏸ Detener Brandon</>
                                        )}
                                    </button>

                                    {/* Botón Sincronizar */}
                                    <button
                                        onClick={handleSyncChat}
                                        disabled={syncing}
                                        style={{
                                            padding: "6px 14px",
                                            borderRadius: "8px",
                                            border: syncing 
                                                ? "1px solid rgba(59, 130, 246, 0.5)" 
                                                : "1px solid rgba(255, 255, 255, 0.1)",
                                            background: syncing
                                                ? "rgba(59, 130, 246, 0.1)"
                                                : "rgba(255, 255, 255, 0.05)",
                                            color: syncing ? "#3b82f6" : "var(--text-light)",
                                            cursor: syncing ? "wait" : "pointer",
                                            fontSize: "12px",
                                            fontWeight: 700,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        <svg 
                                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                                        >
                                            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        {syncing ? "Sincronizando..." : "Sincronizar"}
                                    </button>

                                    <div className="toggle" onClick={() => setAiEnabled(!aiEnabled)}>
                                        <div className={`toggle-track ${aiEnabled ? "active" : ""}`}>
                                            <div className="toggle-thumb"></div>
                                        </div>
                                        <span className="toggle-label">AI {aiEnabled ? "ON" : "OFF"}</span>
                                    </div>
                                </div>
                            </div>

                            {lastSync && !syncing && (
                                <div style={{
                                    padding: "6px 20px",
                                    fontSize: "11px",
                                    color: "#3b82f6",
                                    background: "rgba(59, 130, 246, 0.05)",
                                    borderBottom: "1px solid rgba(59, 130, 246, 0.1)",
                                    fontWeight: 600
                                }}>
                                    ✨ Última sincronización con Instagram: {lastSync}
                                </div>
                            )}

                            {/* Automation paused banner */}
                            {isAutomationPaused && (
                                <div style={{
                                    margin: "0 20px",
                                    padding: "8px 14px",
                                    background: "rgba(239, 68, 68, 0.08)",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                    borderRadius: "8px",
                                    fontSize: "12px",
                                    color: "#ef4444",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                }}>
                                    ⛔ Brandon tiene prohibido escribirle a este prospecto. Control manual activado.
                                </div>
                            )}

                            {/* Lead bio card */}
                            {selectedLead.bio_data && (
                                <div style={{
                                    margin: "12px 20px 0",
                                    padding: "10px 14px",
                                    background: "var(--accent-subtle)",
                                    border: "1px solid rgba(138, 43, 226, 0.2)",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                    color: "var(--text-secondary)",
                                }}>
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        Bio
                                    </span>
                                    <div style={{ marginTop: "4px" }}>{selectedLead.bio_data}</div>
                                </div>
                            )}

                            <div className="chat-messages">
                                {messages.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">💬</div>
                                        <div className="empty-state-text">
                                            Sin mensajes aún. Usa la IA para generar un mensaje inicial abajo.
                                        </div>
                                    </div>
                                ) : (
                                    messages.map((msg) => (
                                        <div key={msg.id} className={`message-bubble message-${msg.role}`}>
                                            <div>{msg.content}</div>
                                            <div className="message-meta">
                                                {msg.role === "bot" && "🤖 Bot"}
                                                {msg.role === "human" && "👤 Humano"}
                                                {msg.role === "lead" && "📩 Prospecto"}
                                                {" · "}
                                                {new Date(msg.sent_at).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="chat-input-area">
                                <form onSubmit={sendMessage} style={{ display: "flex", gap: "8px", flex: 1 }}>
                                    <input
                                        className="input"
                                        placeholder="Escribe un mensaje o usa la IA..."
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                    />
                                    <button type="submit" className="btn btn-primary">
                                        Enviar
                                    </button>
                                </form>
                                <button
                                    className="btn btn-secondary"
                                    onClick={generateAIReply}
                                    disabled={generating}
                                >
                                    {generating ? (
                                        <span className="spinner" style={{ width: "14px", height: "14px" }}></span>
                                    ) : "🧠 AI"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                            <div className="empty-state-icon">💬</div>
                            <div className="empty-state-text">Selecciona un prospecto para ver la conversación</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
