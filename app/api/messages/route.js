import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const leadId = searchParams.get("lead_id");

        if (!leadId) {
            return NextResponse.json({ error: "lead_id es obligatorio" }, { status: 400 });
        }

        const session = request.cookies.get('rle_session');
        let currentUser = null;
        if (session && session.value.startsWith('authenticated_')) {
            currentUser = session.value.replace('authenticated_', '');
        }

        if (!currentUser) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const db = await getDb();

        // Validar propiedad del Lead (si el bot que interactuó pertenece al usuario)
        const checkLeadAccess = await db.execute({
            sql: `SELECT 1 FROM messages m
                  JOIN bot_accounts b ON m.bot_account_id = b.id
                  WHERE m.lead_id = ${db.isPostgres ? '?::text' : '?'} AND b.owner_user = ${db.isPostgres ? '?::text' : '?'} LIMIT 1`,
            args: [leadId, currentUser]
        });

        // Fallback: Si no tiene mensajes aún, verificar por owner de la campaña asociada al lead
        let hasAccess = checkLeadAccess.rows.length > 0;
        if (!hasAccess) {
            const checkCampAccess = await db.execute({
                sql: `SELECT 1 FROM leads l
                      JOIN campaigns c ON l.campaign_id = c.id
                      WHERE l.id = ${db.isPostgres ? '?::text' : '?'} AND c.owner_user = ${db.isPostgres ? '?::text' : '?'} LIMIT 1`,
                args: [leadId, currentUser]
            });
            hasAccess = checkCampAccess.rows.length > 0;
        }

        if (!hasAccess) {
            return NextResponse.json({ error: "Acceso denegado: este lead o sus mensajes pertenecen a una campaña ajena" }, { status: 403 });
        }

        const result = await db.execute({
            sql: `SELECT * FROM messages WHERE lead_id = ${db.isPostgres ? '?::text' : '?'} ORDER BY sent_at ASC`,
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

        const db = await getDb();
        
        // Si no se provee bot_account_id, intentar buscar el último usado para este lead
        let botId = bot_account_id;
        if (!botId) {
            const lastMsg = await db.execute({
                sql: `SELECT bot_account_id FROM messages WHERE lead_id = ${db.isPostgres ? '?::text' : '?'} AND bot_account_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1`,
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
