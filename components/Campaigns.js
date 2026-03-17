"use client";
import { useState, useEffect } from "react";

export default function Campaigns() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        name: "",
        niche: "",
        target_source: "",
        daily_limit: "20",
        niche_context: "",
        search_keyword: "",
    });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchCampaigns();
        const interval = setInterval(fetchCampaigns, 10000);
        return () => clearInterval(interval);
    }, []);

    async function fetchCampaigns() {
        try {
            const res = await fetch("/api/campaigns");
            const data = await res.json();
            setCampaigns(data.campaigns || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function createCampaign(e) {
        e.preventDefault();
        try {
            const res = await fetch("/api/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    niche: form.niche,
                    target_source: form.target_source,
                    daily_limit: parseInt(form.daily_limit) || 20,
                    niche_context: form.niche_context,
                    search_keyword: form.search_keyword,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                alert("Error: " + (data.error || "No se pudo crear"));
                return;
            }
            setShowModal(false);
            setForm({ name: "", niche: "", target_source: "", daily_limit: "20", niche_context: "", search_keyword: "" });
            fetchCampaigns();
        } catch (err) {
            console.error(err);
        }
    }

    async function toggleCampaign(id, currentStatus) {
        const newStatus = currentStatus === "active" ? "paused" : "active";
        try {
            await fetch("/api/campaigns", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: newStatus }),
            });
            fetchCampaigns();
        } catch (err) {
            console.error(err);
        }
    }

    if (!mounted) return null;

    if (loading) {
        return <div className="p-8 text-center">Cargando campañas...</div>;
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Campañas</h1>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + Nueva Campaña
                </button>
            </div>

            {/* Info card */}
            <div className="card" style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "24px" }}>📋</span>
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: "4px" }}>Gestor de Nichos</div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                            Organizá tu prospección por nichos. Activá una campaña y el sistema busca,
                            filtra y contacta solo ese segmento durante el día.
                        </div>
                    </div>
                </div>
            </div>

            {campaigns.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-text">
                            Sin campañas creadas. Creá tu primera campaña para organizar la prospección por nichos.
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
                    {campaigns.map((campaign) => (
                        <div
                            key={campaign.id}
                            className="card"
                            style={{
                                borderColor: campaign.status === "active" ? "var(--primary)" : "var(--border)",
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            {/* Active indicator bar */}
                            {campaign.status === "active" && (
                                <div style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: "3px",
                                    background: "var(--primary)",
                                }}></div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>
                                        {campaign.name}
                                    </div>
                                    {campaign.niche && (
                                        <span style={{
                                            fontSize: "11px",
                                            padding: "2px 8px",
                                            borderRadius: "12px",
                                            background: "rgba(168, 85, 247, 0.15)",
                                            color: "var(--primary)",
                                            fontWeight: 500,
                                        }}>
                                            {campaign.niche}
                                        </span>
                                    )}
                                </div>

                                {/* Toggle */}
                                <div
                                    onClick={() => toggleCampaign(campaign.id, campaign.status)}
                                    className="toggle-wrapper"
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className={`toggle-track ${campaign.status === "active" ? "active" : ""}`}>
                                        <div className="toggle-thumb"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Source & Keyword */}
                            {campaign.target_source && (
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                                    🎯 {campaign.target_source}
                                </div>
                            )}
                            {campaign.search_keyword && (
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    🔍 <span style={{
                                        padding: "2px 8px",
                                        borderRadius: "12px",
                                        background: "rgba(59, 130, 246, 0.15)",
                                        color: "#60a5fa",
                                        fontSize: "11px",
                                        fontWeight: 500,
                                    }}>Keyword: {campaign.search_keyword}</span>
                                </div>
                            )}

                            {/* Stats */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: "8px",
                                padding: "10px",
                                borderRadius: "8px",
                                background: "rgba(255,255,255,0.03)",
                            }}>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "18px", fontWeight: 700 }}>{campaign.pending_count || 0}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>Pendientes</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "18px", fontWeight: 700 }}>{campaign.dms_sent || 0}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>DMs</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "18px", fontWeight: 700 }}>{campaign.daily_limit}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>Límite/día</div>
                                </div>
                            </div>

                            {/* Status badge & Log */}
                            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className={`dot ${campaign.status === "active" ? "dot-active" : (campaign.status_message?.includes("Sin prospectos") ? "dot-warning" : "dot-inactive")}`}></span>
                                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                                        {campaign.status === "active" ? "Activa — prospectando" : (campaign.status_message?.includes("Sin prospectos") ? "Pausada — Sin prospectos en cola" : "Pausada")}
                                    </span>
                                </div>
                                
                                {campaign.status_message && (
                                    <div style={{
                                        fontSize: "11px",
                                        padding: "8px 10px",
                                        borderRadius: "6px",
                                        background: "rgba(0,0,0,0.2)",
                                        color: "var(--text-secondary)",
                                        fontFamily: "var(--font-mono)",
                                        borderLeft: campaign.status === "active" ? "2px solid var(--primary)" : "2px solid var(--warning)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px"
                                    }}>
                                        <span className={campaign.status === "active" ? "spinner spinner-sm" : ""}></span>
                                        {campaign.status_message}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Nueva Campaña</span>
                            <button className="btn btn-icon btn-secondary" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>
                        <form onSubmit={createCampaign}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Nombre de la Campaña</label>
                                    <input
                                        className="input"
                                        placeholder="Ej: Tatuadores de Córdoba"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Nicho / Segmento</label>
                                    <input
                                        className="input"
                                        placeholder="Ej: Tatuadores, Odontólogos, Inmobiliarias"
                                        value={form.niche}
                                        onChange={(e) => setForm({ ...form, niche: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fuente de Instagram</label>
                                    <input
                                        className="input"
                                        placeholder="@cuenta_competencia o #hashtag"
                                        value={form.target_source}
                                        onChange={(e) => setForm({ ...form, target_source: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Palabra Clave de Filtro (Opcional)</label>
                                    <input
                                        className="input"
                                        placeholder="Ej: tattoo, diseño, ink"
                                        value={form.search_keyword}
                                        onChange={(e) => setForm({ ...form, search_keyword: e.target.value })}
                                    />
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                                        Se escribe en la lupita del modal de seguidores de Instagram para filtrar antes de scrapear.
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Límite Diario de DMs</label>
                                    <input
                                        className="input"
                                        type="number"
                                        placeholder="20"
                                        value={form.daily_limit}
                                        onChange={(e) => setForm({ ...form, daily_limit: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Contexto para la IA</label>
                                    <textarea
                                        className="input"
                                        style={{ minHeight: "80px", resize: "vertical" }}
                                        placeholder="Ej: Mencioná los prototipos de patotattoomg. El dolor principal es que pierden clientes por no tener web profesional."
                                        value={form.niche_context}
                                        onChange={(e) => setForm({ ...form, niche_context: e.target.value })}
                                    />
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                                        Este contexto se inyecta al prompt de Brandon para personalizar los openers al nicho.
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    📋 Crear Campaña
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
