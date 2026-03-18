import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const db = await getDb();

        const [totalLeads, contactedLeads, botsActive] = await Promise.all([
            db.execute("SELECT COUNT(*) as count FROM leads"),
            db.execute("SELECT COUNT(*) as count FROM leads WHERE status IN ('contacted', 'replied', 'interested', 'meeting_booked')"),
            db.execute("SELECT COUNT(*) as count FROM bot_accounts WHERE status = 'active'")
        ]);

        // Simulación básica de métricas o calculadas desde la tabla (simplificado)
        // Podrían sumarse queries por fecha (ej: DMs de hoy leyendo alguna tabla logs)
        const stats = {
            total_prospectos: totalLeads.rows[0].count,
            dms_hoy: contactedLeads.rows[0].count, // Asumimos global hasta sumar tracking diario
            tasa_respuesta: "14%", // Placeholder mientras sumergimos análisis de IA en las respuestas
            bots_activos: botsActive.rows[0].count
        };

        return new Response(JSON.stringify(stats), {
            status: 200,
            headers: { 
                "Content-Type": "application/json",
                // Previene cache del browser local.
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        });
    } catch (e) {
        console.error("[Stats API] Error GET:", e);
        return new Response(JSON.stringify({ error: "Fallo al obtener estadísticas" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
