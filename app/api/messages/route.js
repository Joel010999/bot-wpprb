import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const leadId = searchParams.get("lead_id");

        if (!leadId) {
            return NextResponse.json({ error: "lead_id es obligatorio" }, { status: 400 });
        }

        const db = getDb();
        const result = await db.execute({
            sql: "SELECT * FROM messages WHERE lead_id = ? ORDER BY sent_at ASC",
            args: [leadId]
        });

        return NextResponse.json({ messages: result.rows });
    } catch (err) {
        console.error("[MESSAGES GET] Error:", err);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { lead_id, bot_account_id, content, role } = body;

        if (!lead_id || !content || !role) {
            return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
        }

        const db = getDb();
        
        // Si no se provee bot_account_id, intentar buscar el último usado para este lead
        let botId = bot_account_id;
        if (!botId) {
            const lastMsg = await db.execute({
                sql: "SELECT bot_account_id FROM messages WHERE lead_id = ? AND bot_account_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1",
                args: [lead_id]
            });
            botId = lastMsg.rows[0]?.bot_account_id || null;
        }

        await db.execute({
            sql: "INSERT INTO messages (lead_id, bot_account_id, content, role) VALUES (?, ?, ?, ?)",
            args: [lead_id, botId, content, role]
        });

        return NextResponse.json({ success: true, message: "Mensaje guardado." });
    } catch (err) {
        console.error("[MESSAGES POST] Error:", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
