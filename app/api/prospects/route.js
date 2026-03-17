import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type"); // 'leads' o 'prospects'
        const statusStr = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "100");

        const db = getDb();

        if (type === "leads") {
            // Lógica de Bandeja/Leads
            let sql = `SELECT l.*, 
                        (SELECT content FROM messages WHERE lead_id = l.id ORDER BY sent_at DESC LIMIT 1) AS last_message,
                        (SELECT COUNT(*) FROM messages WHERE lead_id = l.id) AS message_count
                       FROM leads l`;
            const args = [];
            if (statusStr) {
                sql += " WHERE l.status = ?";
                args.push(statusStr);
            }
            sql += " ORDER BY l.created_at DESC LIMIT ?";
            args.push(limit);

            const result = await db.execute({ sql, args });
            return NextResponse.json({ leads: result.rows });
        } else {
            // Lógica de Prospectos (Default)
            let query = "SELECT * FROM prospects";
            let args = [];
            if (statusStr) {
                query += " WHERE status = ?";
                args.push(statusStr);
            }
            query += " ORDER BY created_at DESC LIMIT ?";
            args.push(limit);

            const result = await db.execute({ sql: query, args });
            return NextResponse.json({ prospects: result.rows, total: result.rows.length });
        }
    } catch (err) {
        console.error("[PROSPECTS GET] Error:", err);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, full_name, biography, status } = body;

        if (!username) {
            return NextResponse.json({ error: "El username es obligatorio" }, { status: 400 });
        }

        const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();
        const initialStatus = status || 'pendiente';

        const db = getDb();
        
        await db.execute({
            sql: `INSERT INTO prospects (username, full_name, biography, status)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(username) DO UPDATE SET
                  full_name = excluded.full_name,
                  biography = excluded.biography,
                  status = CASE WHEN prospects.status = 'pendiente' THEN excluded.status ELSE prospects.status END`,
            args: [cleanUsername, full_name || "", biography || "", initialStatus]
        });

        return NextResponse.json({ success: true, message: `Prospecto @${cleanUsername} guardado.` });
    } catch (err) {
        console.error("[PROSPECTS POST] Error:", err);
        return NextResponse.json({ error: "Error interno al guardar prospecto" }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const { lead_id, prospect_id, automation_paused, status } = body;

        const db = getDb();

        if (lead_id) {
            // Actualizar Lead
            await db.execute({
                sql: "UPDATE leads SET automation_paused = ? WHERE id = ?",
                args: [automation_paused ? 1 : 0, lead_id]
            });
            return NextResponse.json({ success: true });
        } else if (prospect_id) {
            // Actualizar Prospecto
            if (status) {
                await db.execute({
                    sql: "UPDATE prospects SET status = ? WHERE id = ?",
                    args: [status, prospect_id]
                });
            }
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "ID no proporcionado" }, { status: 400 });
    } catch (err) {
        console.error("[PROSPECTS PATCH] Error:", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
