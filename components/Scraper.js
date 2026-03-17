"use client";
import { useState, useEffect } from "react";

export default function Scraper() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        target_url: "",
        scrape_type: "followers",
        minFollowers: "",
        bioKeywords: "",
    });

    useEffect(() => {
        fetchJobs();
    }, []);

    async function fetchJobs() {
        try {
            const res = await fetch("/api/scrape");
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function startScrape(e) {
        e.preventDefault();
        try {
            const filters = {};
            if (form.minFollowers) filters.minFollowers = parseInt(form.minFollowers);
            if (form.bioKeywords) filters.bioKeywords = form.bioKeywords.split(",").map((k) => k.trim());

            await fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_url: form.target_url,
                    scrape_type: form.scrape_type,
                    filters,
                }),
            });
            setShowModal(false);
            setForm({ target_url: "", scrape_type: "followers", minFollowers: "", bioKeywords: "" });
            fetchJobs();
        } catch (err) {
            console.error(err);
        }
    }

    const statusIcon = (status) => {
        switch (status) {
            case "pending": return "⏳";
            case "running": return "🔄";
            case "completed": return "✅";
            case "failed": return "❌";
            default: return "⏳";
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Buscador Sigiloso</h1>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + Nueva Búsqueda
                </button>
            </div>

            <div className="page-body">
                {/* Info card */}
                <div className="card" style={{ marginBottom: "24px", borderColor: "rgba(138, 43, 226, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "24px" }}>🔍</span>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Motor de Búsqueda de Prospectos</div>
                            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                                Busca seguidores, personas que dieron like y comentaristas de cualquier URL de Instagram.
                                Los prospectos se deduplican y filtran automáticamente.
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ margin: "0 auto" }}></div>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🔍</div>
                        <div className="empty-state-text">
                            Sin trabajos de búsqueda aún. Crea tu primer trabajo para empezar a buscar prospectos.
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Estado</th>
                                    <th>URL Objetivo</th>
                                    <th>Tipo</th>
                                    <th>Prospectos Encontrados</th>
                                    <th>Filtros</th>
                                    <th>Creado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map((job) => {
                                    let filters = {};
                                    try { filters = JSON.parse(job.filters || "{}"); } catch { }
                                    return (
                                        <tr key={job.id}>
                                            <td>
                                                <span style={{ fontSize: "18px" }}>{statusIcon(job.status)}</span>
                                                <span style={{ marginLeft: "8px", textTransform: "capitalize" }}>{job.status}</span>
                                            </td>
                                            <td style={{ maxWidth: "250px" }}>
                                                <div style={{
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    fontFamily: "monospace",
                                                    fontSize: "12px",
                                                }}>
                                                    {job.target_url}
                                                </div>
                                            </td>
                                            <td style={{ textTransform: "capitalize" }}>{job.scrape_type}</td>
                                            <td style={{ fontWeight: 600 }}>{job.leads_found}</td>
                                            <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                                {filters.minFollowers ? `Mín: ${filters.minFollowers}` : "—"}
                                                {filters.bioKeywords?.length > 0 && ` · Kw: ${filters.bioKeywords.join(", ")}`}
                                            </td>
                                            <td style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                                                {new Date(job.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* New Scrape Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Nuevo Trabajo de Búsqueda</span>
                            <button className="btn btn-icon btn-secondary" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>
                        <form onSubmit={startScrape}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">URL de Instagram Objetivo</label>
                                    <input
                                        className="input"
                                        placeholder="https://www.instagram.com/username/"
                                        value={form.target_url}
                                        onChange={(e) => setForm({ ...form, target_url: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tipo de Búsqueda</label>
                                    <select
                                        className="input"
                                        value={form.scrape_type}
                                        onChange={(e) => setForm({ ...form, scrape_type: e.target.value })}
                                    >
                                        <option value="followers">Seguidores</option>
                                        <option value="likers">Likes</option>
                                        <option value="commenters">Comentaristas</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Mín. Seguidores</label>
                                    <input
                                        className="input"
                                        type="number"
                                        placeholder="ej. 500"
                                        value={form.minFollowers}
                                        onChange={(e) => setForm({ ...form, minFollowers: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Palabras Clave en Bio (separadas por coma)</label>
                                    <input
                                        className="input"
                                        placeholder="Fundador, CEO, Bienes Raíces"
                                        value={form.bioKeywords}
                                        onChange={(e) => setForm({ ...form, bioKeywords: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    🚀 Lanzar Búsqueda
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
