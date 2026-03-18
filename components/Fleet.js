"use client";
import { useState, useEffect } from "react";

export default function Fleet() {
    const [bots, setBots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({ username: "", proxy_endpoint: "", daily_dm_limit: "25" });

    useEffect(() => {
        fetchBots();
        const interval = setInterval(fetchBots, 15000);
        return () => clearInterval(interval);
    }, []);

    async function fetchBots() {
        try {
            const res = await fetch("/api/bots");
            const data = await res.json();
            setBots(data.bots || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function addBot(e) {
        e.preventDefault();
        try {
            const res = await fetch("/api/bots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: form.username,
                    proxy_endpoint: form.proxy_endpoint,
                    daily_dm_limit: parseInt(form.daily_dm_limit) || 25,
                }),
            });

            // AGREGÁ ESTO: Si la respuesta no es OK, no cerramos el modal
            if (!res.ok) {
                const errorData = await res.json();
                alert("Error: " + (errorData.error || "No se pudo desplegar"));
                return;
            }

            setShowModal(false);
            setForm({ username: "", proxy_endpoint: "", daily_dm_limit: "25" });
            fetchBots();
        } catch (err) {
            console.error("Error de red:", err);
        }
    }

    async function updateBotStatus(id, status) {
        try {
            await fetch("/api/bots", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            });
            fetchBots();
        } catch (err) {
            console.error(err);
        }
    }

    const [startingBot, setStartingBot] = useState(null);
    const [injectingBot, setInjectingBot] = useState(null);
    const [sessionJson, setSessionJson] = useState("");

    async function startBotSession(id) {
        setStartingBot(id);
        try {
            const res = await fetch("/api/bots/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                const err = await res.json();
                alert("Error al iniciar sesión: " + (err.error || "Error desconocido"));
            } else {
                alert("✅ Sesión logueada y guardada correctamente.");
            }
        } catch (err) {
            console.error(err);
            alert("Error de red al iniciar sesión.");
        } finally {
            setStartingBot(null);
            fetchBots();
        }
    }

    async function injectSession() {
        if (!injectingBot || !sessionJson) return;
        try {
            const res = await fetch("/api/bots/inject-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: injectingBot.username,
                    session_json: sessionJson
                }),
            });
            if (res.ok) {
                alert("✅ Sesión inyectada correctamente.");
                setInjectingBot(null);
                setSessionJson("");
            } else {
                const err = await res.json();
                alert("❌ Error: " + err.error);
            }
        } catch (err) {
            alert("Error al conectar con la API.");
        }
    }

    const statusDot = (status) => {
        switch (status) {
            case "active": return "dot-active";
            case "shadowbanned": return "dot-warning";
            case "dead": return "dot-danger";
            default: return "";
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">La Flota</h1>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + Desplegar Bot
                </button>
            </div>

            <div className="page-body">
                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ margin: "0 auto" }}></div>
                    </div>
                ) : bots.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🤖</div>
                        <div className="empty-state-text">
                            No hay bots desplegados. Agrega tu primera cuenta bot para iniciar la flota.
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
                        {bots.map((bot) => (
                            <div className="card" key={bot.id} style={{ position: "relative" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                                    <div style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "12px",
                                        background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "20px",
                                    }}>
                                        🤖
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "15px" }}>@{bot.username}</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                                            <span className={`dot ${statusDot(bot.status)}`}></span>
                                            <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                                                {bot.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* DM Progress */}
                                <div style={{ marginBottom: "12px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>DMs Hoy</span>
                                        <span style={{ fontSize: "12px", fontWeight: 600 }}>
                                            {bot.daily_dm_count}/{bot.daily_dm_limit || 25}
                                        </span>
                                    </div>
                                    <div style={{
                                        height: "4px",
                                        background: "var(--bg-input)",
                                        borderRadius: "2px",
                                        overflow: "hidden",
                                    }}>
                                        <div style={{
                                            height: "100%",
                                            width: `${Math.min((bot.daily_dm_count / (bot.daily_dm_limit || 25)) * 100, 100)}%`,
                                            background: bot.daily_dm_count >= (bot.daily_dm_limit || 25)
                                                ? "var(--danger)"
                                                : "var(--accent)",
                                            borderRadius: "2px",
                                            transition: "width 0.5s ease",
                                        }} />
                                    </div>
                                </div>

                                {/* Proxy */}
                                <div style={{
                                    fontSize: "12px",
                                    color: "var(--text-muted)",
                                    background: "var(--bg-input)",
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    marginBottom: "12px",
                                    fontFamily: "monospace",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    🔒 {bot.proxy_endpoint}
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => startBotSession(bot.id)}
                                        disabled={startingBot === bot.id}
                                        style={{ flex: "1 1 auto" }}
                                    >
                                        {startingBot === bot.id ? "⏳ Abriendo..." : "▶ Iniciar Sesión"}
                                    </button>

                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setInjectingBot(bot)}
                                        title="Inyectar Sesión JSON"
                                        style={{ padding: "0 10px" }}
                                    >
                                        🔑
                                    </button>
                                    
                                    {bot.status === "active" ? (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => updateBotStatus(bot.id, "dead")}
                                        >
                                            Eliminar
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => updateBotStatus(bot.id, "active")}
                                        >
                                            Reactivar
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => updateBotStatus(bot.id, "shadowbanned")}
                                    >
                                        Marcar
                                    </button>
                                </div>

                                {/* Last active */}
                                <div style={{
                                    marginTop: "12px",
                                    paddingTop: "12px",
                                    borderTop: "1px solid var(--border-subtle)",
                                    fontSize: "11px",
                                    color: "var(--text-muted)",
                                }}>
                                    Última actividad: {bot.last_active ? new Date(bot.last_active).toLocaleString() : "Nunca"}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Bot Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Desplegar Cuenta Bot</span>
                            <button className="btn btn-icon btn-secondary" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>
                        <form onSubmit={addBot}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Usuario de Instagram</label>
                                    <input
                                        className="input"
                                        placeholder="bot_account_01"
                                        value={form.username}
                                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Endpoint de Proxy Móvil</label>
                                    <input
                                        className="input"
                                        placeholder="Opcional — usa IP local si vacío"
                                        value={form.proxy_endpoint}
                                        onChange={(e) => setForm({ ...form, proxy_endpoint: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Límite Diario de DMs</label>
                                    <input
                                        className="input"
                                        type="number"
                                        placeholder="25"
                                        value={form.daily_dm_limit}
                                        onChange={(e) => setForm({ ...form, daily_dm_limit: e.target.value })}
                                    />
                                </div>
                            </div>
                            {error && (
                                <div style={{
                                    margin: "0 20px",
                                    padding: "10px 14px",
                                    background: "rgba(239, 68, 68, 0.1)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                    color: "var(--danger)",
                                }}>
                                    ⚠️ {error}
                                </div>
                            )}
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setError(""); }} disabled={deploying}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={deploying}>
                                    {deploying ? (
                                        <><span className="spinner" style={{ width: "14px", height: "14px", marginRight: "8px" }}></span> Desplegando...</>
                                    ) : "🚀 Desplegar"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Inject Session Modal */}
            {injectingBot && (
                <div className="modal-overlay" onClick={() => setInjectingBot(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Inyectar Sesión JSON — @{injectingBot.username}</span>
                            <button className="btn btn-icon btn-secondary" onClick={() => setInjectingBot(null)}>
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                                Pegá el contenido del archivo JSON de sesión generado localmente. 
                                Esto permitirá al bot usar las cookies sin login manual.
                            </p>
                            <div className="form-group">
                                <label className="form-label">JSON de Sesión (Playwright storageState)</label>
                                <textarea
                                    className="input"
                                    style={{ height: "200px", fontFamily: "monospace", fontSize: "11px", resize: "none" }}
                                    placeholder='{ "cookies": [...], "origins": [...] }'
                                    value={sessionJson}
                                    onChange={(e) => setSessionJson(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setInjectingBot(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={injectSession} disabled={!sessionJson}>
                                💉 Inyectar Sesión
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
