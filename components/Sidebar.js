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
            <div className="sidebar-header" style={{ padding: "20px 16px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <img src="/logo.png" alt="RenderByte" style={{ maxWidth: "100%", height: "auto", maxHeight: "36px" }} />
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

            <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="dot dot-active"></span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Sistema En Línea
                    </span>
                </div>
                <button 
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/login';
                  }}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "5px", padding: 0 }}
                >
                  <span style={{ fontSize: "14px" }}>🚪</span> Cerrar Sesión
                </button>
            </div>
        </aside>
    );
}
