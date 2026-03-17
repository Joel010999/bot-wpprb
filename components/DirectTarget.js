"use client";
import { useState, useRef, useEffect } from "react";

export default function DirectTarget() {
    const [handle, setHandle] = useState("");
    const [bioData, setBioData] = useState("");
    const [firing, setFiring] = useState(false);
    const [phase, setPhase] = useState(null); // engagement | ai | dm_ready
    const [result, setResult] = useState(null);
    const [logs, setLogs] = useState([]);
    const [history, setHistory] = useState([]);
    const [waitProgress, setWaitProgress] = useState(null); // { elapsed, total }
    const logContainerRef = useRef(null);

    // Auto-scroll logs to bottom
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Parse wait messages to extract progress
    useEffect(() => {
        if (logs.length === 0) return;
        const lastLog = logs[logs.length - 1];
        if (!lastLog) return;

        // Detect "Iniciando espera estratégica (Xm Ys)"
        const startMatch = lastLog.msg.match(/Iniciando espera estratégica \((\d+)m (\d+)s\)/);
        if (startMatch) {
            const totalSec = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
            setWaitProgress({ elapsed: 0, total: totalSec });
            return;
        }

        // Detect "Esperando... Xm Ys restantes"
        const waitMatch = lastLog.msg.match(/Esperando\.\.\. (\d+)m (\d+)s restantes/);
        if (waitMatch) {
            const remaining = parseInt(waitMatch[1]) * 60 + parseInt(waitMatch[2]);
            setWaitProgress((prev) => prev ? { ...prev, elapsed: prev.total - remaining } : null);
            return;
        }

        // Detect completion
        if (lastLog.msg.includes("Espera completada")) {
            setWaitProgress(null);
        }
    }, [logs]);

    async function fireShot(e) {
        e.preventDefault();
        if (!handle.trim()) return;

        setFiring(true);
        setResult(null);
        setPhase(null);
        setWaitProgress(null);
        setLogs([{ time: new Date().toLocaleTimeString("es-AR", { hour12: false }), msg: `🎯 Preparando disparo a @${handle.trim()}...` }]);

        try {
            const res = await fetch("/api/bots/trigger-manual", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ig_handle: handle.trim(),
                    bio_data: bioData.trim() || null,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Error desconocido" }));
                setResult({ error: errData.error || `HTTP ${res.status}` });
                setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString("es-AR", { hour12: false }), msg: `❌ Error: ${errData.error}` }]);
                setFiring(false);
                return;
            }

            // ── Consumir SSE Stream ──
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                let currentEvent = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        currentEvent = line.slice(7);
                    } else if (line.startsWith("data: ")) {
                        const data = JSON.parse(line.slice(6));

                        switch (currentEvent) {
                            case "log":
                                setLogs((prev) => [...prev, { time: data.time, msg: data.msg }]);
                                break;
                            case "phase":
                                setPhase(data.phase);
                                break;
                            case "done":
                                setResult(data);
                                setHistory((prev) => [
                                    {
                                        handle: handle.replace(/^@/, "").trim(),
                                        time: new Date().toLocaleTimeString("es-AR", { hour12: false }),
                                        status: data.sessionStatus,
                                        bot: data.bot,
                                        opener: data.ai?.opener || "—",
                                    },
                                    ...prev,
                                ]);
                                setHandle("");
                                setBioData("");
                                break;
                            case "error":
                                setResult({ error: data.error });
                                break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setResult({ error: err.message });
            setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString("es-AR", { hour12: false }), msg: `❌ Error de red: ${err.message}` }]);
        } finally {
            setFiring(false);
            setPhase(null);
        }
    }

    const phaseLabel = {
        engagement: "🤝 Engagement Social...",
        ai: "🧠 Generando con IA...",
        dm_ready: "✅ DM Listo",
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">🎯 Francotirador</h1>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Modo Supervisado</span>
            </div>

            {/* Info */}
            <div className="card" style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "28px" }}>🔬</span>
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: "4px" }}>Laboratorio de Apertura</div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                            Brandon sigue al objetivo, likea su último post, espera 8-12 minutos de forma aleatoria
                            y recién entonces genera el DM personalizado. Todo visible en el browser.
                        </div>
                    </div>
                </div>
            </div>

            {/* Fire form */}
            <div className="card" style={{ marginBottom: "20px" }}>
                <form onSubmit={fireShot}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Objetivo de Instagram</label>
                            <input
                                className="input"
                                placeholder="@usuario_objetivo"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                required
                                style={{ fontSize: "16px" }}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Bio / Contexto (opcional)</label>
                            <textarea
                                className="input"
                                placeholder="Pegá la bio o descripción del lead para que Brandon analice el perfil y personalice el opener"
                                value={bioData}
                                onChange={(e) => setBioData(e.target.value)}
                                style={{ minHeight: "60px", resize: "vertical" }}
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={firing || !handle.trim()}
                            style={{
                                fontSize: "15px",
                                padding: "12px 24px",
                                background: firing ? "var(--primary)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                                border: "none",
                            }}
                        >
                            {firing ? (
                                <>
                                    <span className="spinner" style={{ width: "14px", height: "14px", marginRight: "8px" }}></span>
                                    {phaseLabel[phase] || "Brandon operando..."}
                                </>
                            ) : (
                                "🔥 Iniciar Ataque"
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Wait Progress Bar */}
            {waitProgress && (
                <div className="card" style={{ marginBottom: "20px", borderColor: "rgba(234, 179, 8, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                        <span style={{ fontSize: "20px" }}>⏳</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>Espera Estratégica</div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                Brandon simula comportamiento humano natural antes de enviar el DM
                            </div>
                        </div>
                        <div style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: "18px", fontWeight: 700, color: "var(--warning)" }}>
                            {Math.floor((waitProgress.total - waitProgress.elapsed) / 60)}:{String((waitProgress.total - waitProgress.elapsed) % 60).padStart(2, "0")}
                        </div>
                    </div>
                    <div style={{
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "8px",
                        height: "8px",
                        overflow: "hidden",
                    }}>
                        <div style={{
                            height: "100%",
                            borderRadius: "8px",
                            background: "linear-gradient(90deg, #eab308, #f59e0b)",
                            width: `${waitProgress.total > 0 ? (waitProgress.elapsed / waitProgress.total) * 100 : 0}%`,
                            transition: "width 1s ease",
                        }} />
                    </div>
                </div>
            )}

            {/* AI Reasoning Panel */}
            {result && result.ai && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                    {/* Razonamiento */}
                    <div className="card" style={{ borderColor: "rgba(168, 85, 247, 0.3)" }}>
                        <div style={{ fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🧠</span> Razonamiento de Brandon
                        </div>
                        <div style={{
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: "8px",
                            padding: "14px",
                            fontSize: "13px",
                            lineHeight: "1.7",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            whiteSpace: "pre-wrap",
                            color: "var(--text-secondary)",
                            maxHeight: "300px",
                            overflowY: "auto",
                        }}>
                            {result.ai.reasoning}
                        </div>
                    </div>

                    {/* Opener generado */}
                    <div className="card" style={{ borderColor: "rgba(34, 197, 94, 0.3)" }}>
                        <div style={{ fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>💬</span> Opener Generado
                        </div>
                        <div style={{
                            background: "rgba(34, 197, 94, 0.08)",
                            borderRadius: "8px",
                            padding: "16px",
                            fontSize: "15px",
                            lineHeight: "1.6",
                            borderLeft: "3px solid var(--success)",
                        }}>
                            {result.ai.opener}
                        </div>
                        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className={`dot ${result.sessionStatus === "browser_open" ? "dot-active" : "dot-warning"}`}></span>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                {result.sessionStatus === "browser_open"
                                    ? "Browser abierto — supervisando"
                                    : result.sessionStatus === "no_bot_available"
                                        ? "Sin bot activo — solo IA"
                                        : result.sessionStatus}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Error */}
            {result && result.error && (
                <div className="card" style={{ marginBottom: "20px", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                    <div style={{ color: "var(--danger)" }}>⚠️ {result.error}</div>
                </div>
            )}

            {/* Live Log Console */}
            {logs.length > 0 && (
                <div className="card" style={{ marginBottom: "20px" }}>
                    <div className="card-header">
                        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📡</span> Log en Vivo
                            {firing && <span className="spinner" style={{ width: "12px", height: "12px" }}></span>}
                        </span>
                    </div>
                    <div
                        ref={logContainerRef}
                        style={{
                            background: "rgba(0,0,0,0.4)",
                            borderRadius: "8px",
                            padding: "12px",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: "11px",
                            lineHeight: "1.8",
                            maxHeight: "300px",
                            overflowY: "auto",
                        }}
                    >
                        {logs.map((entry, i) => (
                            <div key={i} style={{ display: "flex", gap: "8px" }}>
                                <span style={{ color: "var(--text-muted)", minWidth: "70px", flexShrink: 0 }}>{entry.time}</span>
                                <span style={{
                                    color: entry.msg.includes("❌") || entry.msg.includes("💀") ? "var(--danger)"
                                        : entry.msg.includes("⚠️") ? "var(--warning)"
                                            : entry.msg.includes("✅") || entry.msg.includes("❤️") ? "var(--success)"
                                                : entry.msg.includes("⏳") ? "#eab308"
                                                    : entry.msg.includes("🧠") ? "#a855f7"
                                                        : entry.msg.includes("🤝") ? "#3b82f6"
                                                            : "var(--text-secondary)"
                                }}>
                                    {entry.msg}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* History */}
            {history.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">📜 Historial de Ataques</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Hora</th>
                                <th>Objetivo</th>
                                <th>Bot</th>
                                <th>Opener</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((shot, i) => (
                                <tr key={i}>
                                    <td style={{ fontSize: "13px", color: "var(--text-muted)" }}>{shot.time}</td>
                                    <td style={{ fontWeight: 600 }}>@{shot.handle}</td>
                                    <td>@{shot.bot || "—"}</td>
                                    <td style={{ fontSize: "12px", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {shot.opener}
                                    </td>
                                    <td>
                                        <span
                                            className={`status-badge ${shot.status === "browser_open"
                                                ? "status-active"
                                                : shot.status?.includes("error")
                                                    ? "status-error"
                                                    : "status-cooldown"
                                                }`}
                                        >
                                            {shot.status === "browser_open"
                                                ? "🟢 Activo"
                                                : shot.status === "no_bot_available"
                                                    ? "⚠️ Sin bot"
                                                    : "🔴 Error"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
