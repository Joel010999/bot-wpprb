import { getDb } from "@/lib/db";

export default async function handler(req, res) {
    if (req.method === "GET") {
        try {
            const db = await getDb();
            const result = await db.execute("SELECT * FROM bot_accounts ORDER BY last_active DESC");
            return res.status(200).json({ bots: result.rows });
        } catch (error) {
            console.error("[Bots API] Error GET:", error);
            return res.status(500).json({ error: "No se pudo obtener la flota" });
        }
    } 
    
    if (req.method === "POST") {
        try {
            const { username, proxy_endpoint, daily_dm_limit } = req.body;
            
            if (!username) {
                return res.status(400).json({ error: "El usuario es obligatorio" });
            }

            // Normalizar el nombre borrando arrobas iniciales si las pusieron
            const normalizedUsername = username.replace(/^@/, "").trim().toLowerCase();

            const db = await getDb();

            await db.execute({
                sql: `INSERT INTO bot_accounts (username, proxy_endpoint, daily_dm_limit, status) 
                      VALUES (?, ?, ?, 'active')`,
                args: [normalizedUsername, proxy_endpoint || "", daily_dm_limit || 25]
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error("[Bots API] Error POST:", error);
            
            // Si el error es por cuenta duplicada en SQLite
            if (error.message?.includes("UNIQUE constraint failed")) {
                return res.status(400).json({ error: "Esa cuenta ya forma parte de la flota" });
            }
            
            return res.status(500).json({ error: "Falló la inserción del bot" });
        }
    }

    if (req.method === "PUT") {
        try {
            const { id, status } = req.body;
            const db = await getDb();

            if (!id || !status) {
                return res.status(400).json({ error: "Faltan datos para actualizar" });
            }

            await db.execute({
                sql: "UPDATE bot_accounts SET status = ? WHERE id = ?",
                args: [status, id]
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error("[Bots API] Error PUT:", error);
            return res.status(500).json({ error: "Fallo al actualizar el estado" });
        }
    }

    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
}
