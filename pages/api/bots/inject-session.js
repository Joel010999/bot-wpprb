import { getDb } from "@/lib/db";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { username, session_json } = req.body;

        if (!username || !session_json) {
            return res.status(400).json({ error: "Faltan datos obligatorios (username, session_json)" });
        }

        // Validar que sea un JSON válido
        try {
            JSON.parse(session_json);
        } catch (e) {
            return res.status(400).json({ error: "El JSON de sesión no es válido" });
        }

        const db = await getDb();
        
        // Usar lógica compatible
        const sqlQuery = db.isPostgres
            ? `INSERT INTO bot_sessions (username, storage_state, updated_at)
               VALUES ($1, $2, CURRENT_TIMESTAMP)
               ON CONFLICT(username) DO UPDATE SET
               storage_state = EXCLUDED.storage_state,
               updated_at = CURRENT_TIMESTAMP`
            : `INSERT OR REPLACE INTO bot_sessions (username, storage_state, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)`;

        await db.execute({
            sql: sqlQuery,
            args: [username, session_json]
        });

        return res.status(200).json({ success: true, message: "Sesión inyectada correctamente" });
    } catch (error) {
        console.error("[Inject Session API] Error:", error);
        return res.status(500).json({ error: "Error al inyectar sesión", details: error.message });
    }
}
