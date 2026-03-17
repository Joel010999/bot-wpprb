"use client";

const NAV_ITEMS = [
    { id: "dashboard", label: "Panel", icon: "📊" },
    { id: "campaigns", label: "Campañas", icon: "📋" },
    { id: "leads", label: "Prospectos", icon: "🎯" },
    { id: "fleet", label: "La Flota", icon: "🤖" },
    { id: "inbox", label: "Bandeja", icon: "💬" },
    { id: "scraper", label: "Buscador", icon: "🔍" },
    { id: "sniper", label: "Francotirador", icon: "🔫" },
    { id: "settings", label: "Ajustes", icon: "⚙️" },
];

export default function Sidebar({ activePage, onNavigate }) {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">RLE</div>
                <div className="sidebar-subtitle">Motor de Leads</div>
            </div>

            <nav className="sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-link ${activePage === item.id ? "active" : ""}`}
                        onClick={() => onNavigate(item.id)}
                    >
                        <span className="icon">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="dot dot-active"></span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Sistema En Línea
                    </span>
                </div>
            </div>
        </aside>
    );
}
