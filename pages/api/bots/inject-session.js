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
        const cleanUsername = username.replace('@', '');
        
        // Usar lógica compatible con la nueva arquitectura session_data en bot_accounts
        const sqlQuery = db.isPostgres
            ? `UPDATE bot_accounts SET session_data = $1, last_active = CURRENT_TIMESTAMP WHERE username = $2 OR username = $3`
            : `UPDATE bot_accounts SET session_data = ?, last_active = CURRENT_TIMESTAMP WHERE username = ? OR username = ?`;

        const args = db.isPostgres 
            ? [session_json, cleanUsername, `@${cleanUsername}`]
            : [session_json, cleanUsername, `@${cleanUsername}`];

        await db.execute({
            sql: sqlQuery,
            args: args
        });

        return res.status(200).json({ success: true, message: "Sesión inyectada correctamente" });
    } catch (error) {
        console.error("[Inject Session API] Error:", error);
        return res.status(500).json({ error: "Error al inyectar sesión", details: error.message });
    }
}
