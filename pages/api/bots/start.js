import { getDb } from "@/lib/db";
import { createBotSession } from "@/lib/fleet";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: "Falta ID del bot" });
        }

        const db = getDb();
        const result = await db.execute({
            sql: "SELECT * FROM bot_accounts WHERE id = ?",
            args: [id]
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Cuenta bot no encontrada" });
        }

        const account = result.rows[0];

        // Ejecutar sesión del bot (abre chromium en modo visible y espera login manual si es necesario)
        // El timeout en local no es problema.
        try {
            await createBotSession(account, (msg) => console.log(msg));
            return res.status(200).json({ success: true, message: "Sesión iniciada correctamente" });
        } catch (sessionError) {
            console.error("[Bots API] Error en createBotSession:", sessionError);
            return res.status(500).json({ error: sessionError.message });
        }

    } catch (error) {
        console.error("[Bots API] Error start session:", error);
        return res.status(500).json({ error: "Fallo al iniciar sesión del bot" });
    }
}
