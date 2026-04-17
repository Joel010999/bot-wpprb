import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const statusStr = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "100");

        const db = await getDb();

        if (type === "leads") {
            // CAST: l.id::text para que coincida con lead_id si es TEXT
            let sql = `SELECT l.*, 
                        (SELECT content FROM messages WHERE lead_id = l.id${db.isPostgres ? '::text' : ''} ORDER BY sent_at DESC LIMIT 1) AS last_message,
                        (SELECT COUNT(*) FROM messages WHERE lead_id = l.id${db.isPostgres ? '::text' : ''}) AS message_count,
                        (SELECT owner_user FROM campaigns WHERE id = l.campaign_id) AS owner_user
                       FROM leads l`;

            const session = request.cookies.get('rle_session');
            let currentUser = null;
            if (session && session.value.startsWith('authenticated_')) {
                currentUser = session.value.replace('authenticated_', '');
            }

            const isAdmin = currentUser === 'admin_joel';

            let args = [];
            let whereClauses = [];
            if (currentUser && !isAdmin) {
                // CAST: l.id::text en el JOIN interno
                whereClauses.push(`EXISTS (
                    SELECT 1 FROM messages m 
                    JOIN bot_accounts b ON m.bot_account_id = b.id 
                    WHERE m.lead_id = l.id${db.isPostgres ? '::text' : ''} AND b.owner_user = ${db.isPostgres ? '?::text' : '?'}
                )`);
                args.push(currentUser);
            }
            if (statusStr) {
                whereClauses.push(`l.status = ${db.isPostgres ? '?::text' : '?'}`);
                args.push(statusStr);
            }

            if (whereClauses.length > 0) {
                sql += " WHERE " + whereClauses.join(" AND ");
            }

            sql += " ORDER BY l.created_at DESC LIMIT ?";
            args.push(limit);

            const result = await db.execute({ sql, args });
            return NextResponse.json({ leads: result.rows });
        } else {
            let query = "SELECT * FROM prospects";
            let args = [];

            const session = request.cookies.get('rle_session');
            let currentUser = null;
            if (session && session.value.startsWith('authenticated_')) {
                currentUser = session.value.replace('authenticated_', '');
            }

            const isAdmin = currentUser === 'admin_joel';

            let whereClauses = [];
            if (currentUser && !isAdmin) {
                whereClauses.push(`(owner_user = ${db.isPostgres ? '?::text' : '?'} OR campaign_id IN (SELECT id FROM campaigns WHERE owner_user = ${db.isPostgres ? '?::text' : '?'}))`);
                args.push(currentUser, currentUser);
            }
            if (statusStr) {
                whereClauses.push(`status = ${db.isPostgres ? '?::text' : '?'}`);
                args.push(statusStr);
            }

            if (whereClauses.length > 0) {
                query += " WHERE " + whereClauses.join(" AND ");
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
        const initialStatus = status || 'listo';

        const session = request.cookies.get('rle_session');
        let currentUser = null;
        if (session && session.value.startsWith('authenticated_')) {
            currentUser = session.value.replace('authenticated_', '');
        }

        const db = await getDb();

        await db.execute({
            sql: `INSERT INTO prospects (username, full_name, biography, status, owner_user)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(username) DO UPDATE SET
                  full_name = excluded.full_name,
                  biography = excluded.biography,
                  status = CASE WHEN prospects.status = 'listo' THEN excluded.status ELSE prospects.status END`,
            args: [cleanUsername, full_name || "", biography || "", initialStatus, currentUser]
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

        const db = await getDb();

        if (lead_id) {
            await db.execute({
                // CAST lead_id a string si es necesario y automation_paused como número
                sql: `UPDATE leads SET automation_paused = ? WHERE id = ${db.isPostgres ? '?::integer' : '?'}`,
                args: [automation_paused ? 1 : 0, parseInt(lead_id)]
            });
            return NextResponse.json({ success: true });
        } else if (prospect_id) {
            if (status) {
                await db.execute({
                    sql: `UPDATE prospects SET status = ? WHERE id = ${db.isPostgres ? '?::integer' : '?'}`,
                    args: [status, parseInt(prospect_id)]
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