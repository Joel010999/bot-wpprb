import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const db = await getDb();
        
        const cookieStore = req.cookies;
        const session = cookieStore.get('rle_session');
        let currentUser = null;
        if (session && session.value.startsWith('authenticated_')) {
            currentUser = session.value.replace('authenticated_', '');
        }

        const isAdmin = currentUser === 'admin_joel';
        let botFilter = "WHERE status = 'active'";
        let botArgs = [];
        if (currentUser && !isAdmin) {
            botFilter += " AND owner_user = ?";
            botArgs.push(currentUser);
        }

        const [totalLeads, contactedLeads, botsActive] = await Promise.all([
            db.execute("SELECT COUNT(*) as count FROM leads"),
            db.execute("SELECT COUNT(*) as count FROM leads WHERE status IN ('contacted', 'replied', 'interested', 'meeting_booked')"),
            db.execute({
                sql: `SELECT COUNT(*) as count FROM bot_accounts ${botFilter}`,
                args: botArgs
            })
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
