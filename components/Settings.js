"use client";
import { useState, useEffect } from "react";

export default function Settings() {
    const [config, setConfig] = useState({
        meetingLink: "https://calendly.com/renderbyte",
        whatsapp: "+1234567890",
        openaiKey: "",
        tursoUrl: "file:local.db",
        tursoToken: "",
        defaultDmLimit: "25",
        warmupEnabled: true,
    });
    const [saved, setSaved] = useState(false);

    const [loading, setLoading] = useState(true);

    // Load settings on mount
    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                if (Object.keys(data).length > 0) {
                    // Merge loaded settings with defaults, ensuring all keys exist
                    setConfig((prev) => ({ ...prev, ...data }));
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load settings:", err);
                setLoading(false);
            });
    }, []);

    async function handleSave() {
        setSaved(false);
        try {
            const payload = { ...config };
            delete payload.openaiKey; // Protegido, no se envía

            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                alert("Error al guardar los ajustes");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Error al guardar los ajustes");
        }
    }

    if (loading) {
        return <div className="p-8 text-center">Cargando ajustes...</div>;
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Ajustes</h1>
                <button className="btn btn-primary" onClick={handleSave}>
                    {saved ? "✓ Guardado" : "Guardar Cambios"}
                </button>
            </div>

            <div className="page-body">
                <div style={{ maxWidth: "640px" }}>
                    {/* AI Configuration */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                        <div className="card-header">
                            <span className="card-title">🧠 Configuración de IA</span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Clave API de OpenAI</label>
                            <input
                                className="input disabled"
                                type="password"
                                disabled
                                placeholder="•••••••••••••••• (Protegida en Servidor .env)"
                                value="Protegida por entorno (.env)"
                                style={{ backgroundColor: "rgba(255,255,255,0.05)", cursor: "not-allowed", color: "var(--text-muted)" }}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Enlace de Reunión</label>
                            <input
                                className="input"
                                placeholder="https://calendly.com/..."
                                value={config.meetingLink || ""}
                                onChange={(e) => setConfig({ ...config, meetingLink: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Número de WhatsApp</label>
                            <input
                                className="input"
                                placeholder="+1234567890"
                                value={config.whatsapp || ""}
                                onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Database */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                        <div className="card-header">
                            <span className="card-title">🗄️ Base de Datos (Turso)</span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">URL de Base de Datos</label>
                            <input
                                className="input"
                                placeholder="libsql://your-db.turso.io"
                                value={config.tursoUrl || ""}
                                onChange={(e) => setConfig({ ...config, tursoUrl: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Token de Autenticación</label>
                            <input
                                className="input"
                                type="password"
                                placeholder="eyJ..."
                                value={config.tursoToken || ""}
                                onChange={(e) => setConfig({ ...config, tursoToken: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Fleet Defaults */}
                    <div className="card" style={{ marginBottom: "16px" }}>
                        <div className="card-header">
                            <span className="card-title">🤖 Ajustes de la Flota</span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Límite Diario de DMs por Defecto</label>
                            <input
                                className="input"
                                type="number"
                                value={config.defaultDmLimit || ""}
                                onChange={(e) => setConfig({ ...config, defaultDmLimit: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <div className="toggle" onClick={() => setConfig({ ...config, warmupEnabled: !config.warmupEnabled })}>
                                <div className={`toggle-track ${config.warmupEnabled ? "active" : ""}`}>
                                    <div className="toggle-thumb"></div>
                                </div>
                                <span className="toggle-label">Activar Modo Calentamiento</span>
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
                                Aumenta gradualmente los límites de DMs con el tiempo para generar confianza en la cuenta.
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="card" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
                        <div className="card-header">
                            <span className="card-title" style={{ color: "var(--danger)" }}>⚠️ Zona Peligrosa</span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button className="btn btn-danger">Reiniciar Contadores de DMs</button>
                            <button className="btn btn-danger">Purgar Base de Datos</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
