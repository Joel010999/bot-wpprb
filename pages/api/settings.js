import { getDb } from "@/lib/db";
import { resetClient } from "@/lib/openai";

export default async function handler(req, res) {
    if (req.method === "GET") {
        try {
            const db = getDb();
            const result = await db.execute("SELECT key, value FROM settings");
            
            const settings = {};
            for (const row of result.rows) {
                if (row.value === "true") settings[row.key] = true;
                else if (row.value === "false") settings[row.key] = false;
                else settings[row.key] = row.value;
            }

            return res.status(200).json(settings);
        } catch (error) {
            console.error("[Settings API] Error GET:", error);
            return res.status(500).json({ error: "Failed to load settings" });
        }
    } 
    
    if (req.method === "POST") {
        try {
            const data = req.body;
            const db = getDb();

            const queries = Object.entries(data).map(([key, value]) => {
                const stringValue = typeof value === 'boolean' ? value.toString() : String(value || "");
                const sqlQuery = db.isPostgres
                    ? "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                    : "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)";
                return {
                    sql: sqlQuery,
                    args: [key, stringValue]
                };
            });

            for (const q of queries) {
                await db.execute(q);
            }

            if (data.openaiKey !== undefined) {
                resetClient();
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error("[Settings API] Error POST:", error);
            return res.status(500).json({ error: "Failed to save settings", details: error.message });
        }
    }

    // Fallback unsupported method
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
}
