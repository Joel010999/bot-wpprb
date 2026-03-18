import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createBotSession, saveSession, sendAndVerifyDM } from "@/lib/fleet";

export async function POST(request) {
    try {
        const body = await request.json();
        const { lead_id } = body;

        if (!lead_id) {
            return NextResponse.json({ error: "lead_id es obligatorio" }, { status: 400 });
        }

        const db = await getDb();
        const leadRes = await db.execute({
            sql: "SELECT * FROM leads WHERE id = ?",
            args: [lead_id]
        });
        const lead = leadRes.rows[0];

        if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

        // Obtener bot activo
        const botRes = await db.execute("SELECT * FROM bot_accounts WHERE status = 'active' LIMIT 1");
        const bot = botRes.rows[0];
        if (!bot) return NextResponse.json({ error: "No hay bots activos" }, { status: 500 });

        const session = await createBotSession(bot, console.log);
        const { context, browser } = session;
        const page = await context.newPage();

        try {
            // sendAndVerifyDM syncs history internally
            const syncResult = await sendAndVerifyDM(page, lead.ig_handle, {
                bypassSend: true,
                leadBio: lead.bio_data,
                config: { niche_context: "" }
            }, console.log);

            if (syncResult.chatHistory && syncResult.chatHistory.length > 0) {
                // Guardar todos los mensajes que no existan aún
                for (const msg of syncResult.chatHistory) {
                    await db.execute({
                        sql: `INSERT INTO messages (lead_id, bot_account_id, content, role)
                                SELECT ?, ?, ?, ?
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM messages WHERE lead_id = ? AND content = ? AND role = ?
                                )`,
                        args: [lead.id, bot.id, msg.content, msg.role, lead.id, msg.content, msg.role]
                    });
                }
                
                // Actualizar timestamp de revisión
                await db.execute({
                    sql: "UPDATE prospects SET last_checked_at = CURRENT_TIMESTAMP WHERE username = ?",
                    args: [lead.ig_handle]
                });
            }
        } finally {
            await saveSession(bot.username, context).catch(() => {});
            await browser.close();
        }

        return NextResponse.json({ success: true, message: "Chat sincronizado y mensajes guardados." });
    } catch (err) {
        console.error("[SYNC-CHAT] Error:", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
