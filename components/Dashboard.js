"use client";
import { useState, useEffect } from "react";

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    async function fetchStats() {
        try {
            const res = await fetch("/api/stats");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error("Failed to fetch stats:", err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">Centro de Control</h1>
                </div>
                <div className="page-body">
                    <div className="empty-state">
                        <div className="spinner" style={{ margin: "0 auto" }}></div>
                    </div>
                </div>
            </div>
        );
    }

    const statCards = [
        { label: "Total Prospectos", value: stats?.totalLeads || 0, icon: "🎯" },
        { label: "DMs Hoy", value: stats?.messagesToday || 0, icon: "📨" },
        { label: "Tasa de Respuesta", value: `${stats?.replyRate || 0}%`, icon: "📈" },
        { label: "Bots Activos", value: stats?.activeBots || 0, icon: "🤖" },
    ];

    const statusData = stats?.leadsByStatus || {};
    const botStatusData = stats?.botStats || {};

    // Generate chart data
    const chartData = stats?.dailyMessages || [];
    const maxCount = Math.max(...chartData.map(d => d.count), 1);

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Centro de Control</h1>
                <button className="btn btn-secondary btn-sm" onClick={fetchStats}>
                    ↻ Actualizar
                </button>
            </div>

            <div className="page-body">
                {/* Stat Cards */}
                <div className="stats-grid">
                    {statCards.map((card, i) => (
                        <div className="stat-card" key={i}>
                            <div className="stat-label">{card.icon} {card.label}</div>
                            <div className="stat-value">{card.value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid-2" style={{ marginBottom: "24px" }}>
                    {/* Pipeline */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Pipeline de Prospectos</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {[
                                { status: "cold", label: "Frío", color: "#3b82f6" },
                                { status: "contacted", label: "Contactado", color: "#f59e0b" },
                                { status: "replied", label: "Respondió", color: "#8A2BE2" },
                                { status: "warm", label: "Tibio", color: "#f97316" },
                                { status: "closed", label: "Cerrado", color: "#22c55e" },
                            ].map((item) => {
                                const count = statusData[item.status] || 0;
                                const total = stats?.totalLeads || 1;
                                const pct = Math.round((count / total) * 100);
                                return (
                                    <div key={item.status}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{item.label}</span>
                                            <span style={{ fontSize: "13px", fontWeight: 600 }}>{count}</span>
                                        </div>
                                        <div style={{
                                            height: "6px",
                                            background: "var(--bg-input)",
                                            borderRadius: "3px",
                                            overflow: "hidden",
                                        }}>
                                            <div style={{
                                                height: "100%",
                                                width: `${pct}%`,
                                                background: item.color,
                                                borderRadius: "3px",
                                                transition: "width 0.5s ease",
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Fleet Health */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Estado de la Flota</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            {[
                                { status: "active", label: "Activos", dotClass: "dot-active" },
                                { status: "shadowbanned", label: "Shadowbanned", dotClass: "dot-warning" },
                                { status: "dead", label: "Muertos", dotClass: "dot-danger" },
                            ].map((item) => (
                                <div key={item.status} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <span className={`dot ${item.dotClass}`}></span>
                                        <span style={{ fontSize: "14px" }}>{item.label}</span>
                                    </div>
                                    <span style={{ fontSize: "20px", fontWeight: 700 }}>
                                        {botStatusData[item.status] || 0}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Activity Chart */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Actividad — Últimos 7 Días</span>
                    </div>
                    {chartData.length > 0 ? (
                        <div className="chart-container">
                            {chartData.map((d, i) => (
                                <div
                                    className="chart-bar"
                                    key={i}
                                    style={{ height: `${(d.count / maxCount) * 100}%` }}
                                    title={`${d.date}: ${d.count} mensajes`}
                                >
                                    <span className="chart-bar-label">
                                        {new Date(d.date + "T00:00:00").toLocaleDateString("es", { weekday: "short" })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: "30px" }}>
                            <div className="empty-state-icon">📊</div>
                            <div className="empty-state-text">Sin datos de actividad aún. Comienza a enviar DMs para ver gráficos.</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
