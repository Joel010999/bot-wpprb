import { getDb } from "@/lib/db";

export default async function handler(req, res) {
    if (req.method !== "PUT") return res.status(405).end();

    const sessionCookie = req.cookies.rle_session;
    let currentUser = null;
    if (sessionCookie && sessionCookie.startsWith('authenticated_')) {
        currentUser = sessionCookie.replace('authenticated_', '');
    }

    if (currentUser !== 'admin_joel') {
        return res.status(403).json({ error: "Permisos Denegados. Zona Admin." });
    }

    try {
        const { id, owner_user } = req.body;
        
        if (!id || !owner_user) {
            return res.status(400).json({ error: "Faltan datos de asignación" });
        }

        const db = await getDb();
        await db.execute({
            sql: "UPDATE bot_accounts SET owner_user = ? WHERE id = ?",
            args: [owner_user, id]
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("[Bots Assign API] Error:", error);
        return res.status(500).json({ error: "Fallo crítico al reasignar el bot" });
    }
}
