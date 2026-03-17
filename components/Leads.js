"use client";
import { useState, useEffect } from "react";

export default function Leads() {
    const [leads, setLeads] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ ig_handle: "", followers_count: "", bio_data: "" });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchLeads();
    }, [filter]);

    async function fetchLeads() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filter) params.set("status", filter);
            const res = await fetch(`/api/prospects?${params}`);
            const data = await res.json();
            setLeads(data.prospects || []);
            setTotal(data.total || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function addLead(e) {
        e.preventDefault();
        try {
            await fetch("/api/prospects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: form.ig_handle,
                    full_name: form.followers_count, /* repurposed as full_name or generic text */
                    biography: form.bio_data,
                }),
            });
            setShowModal(false);
            setForm({ ig_handle: "", followers_count: "", bio_data: "" });
            fetchLeads();
        } catch (err) {
            console.error(err);
        }
    }

    if (!mounted) return null;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Prospectos ({total})</h1>
                <div style={{ display: "flex", gap: "8px" }}>
                    <select
                        className="input"
                        style={{ width: "160px" }}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        <option value="">Todos los estados</option>
                        <option value="cold">Frío</option>
                        <option value="contacted">Contactado</option>
                        <option value="replied">Respondió</option>
                        <option value="warm">Tibio</option>
                        <option value="closed">Cerrado</option>
                    </select>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        + Agregar Prospecto
                    </button>
                </div>
            </div>

            <div className="page-body">
                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ margin: "0 auto" }}></div>
                    </div>
                ) : leads.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎯</div>
                        <div className="empty-state-text">
                            Sin prospectos aún. Usa el Buscador o agrega prospectos manualmente.
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Seguidores</th>
                                    <th>Bio</th>
                                    <th>Estado</th>
                                    <th>Agregado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map((lead) => (
                                    <tr key={lead.id}>
                                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                            @{lead.username}
                                        </td>
                                        <td>{lead.full_name || "—"}</td>
                                        <td style={{ maxWidth: "300px" }}>
                                            <div style={{
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}>
                                                {lead.biography || "—"}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge badge-${lead.status}`}>
                                                {lead.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                                            {new Date(lead.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add Lead Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Agregar Prospecto</span>
                            <button className="btn btn-icon btn-secondary" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>
                        <form onSubmit={addLead}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Usuario de Instagram</label>
                                    <input
                                        className="input"
                                        placeholder="usuario (sin @)"
                                        value={form.ig_handle}
                                        onChange={(e) => setForm({ ...form, ig_handle: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Nombre Completo</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="Ej. Juan Pérez"
                                        value={form.followers_count}
                                        onChange={(e) => setForm({ ...form, followers_count: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Bio</label>
                                    <textarea
                                        className="input"
                                        placeholder="Texto de bio del prospecto para análisis IA..."
                                        value={form.bio_data}
                                        onChange={(e) => setForm({ ...form, bio_data: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Agregar Prospecto
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
