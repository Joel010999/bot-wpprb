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
            let sql = `SELECT l.*, 
                        (SELECT content FROM messages WHERE lead_id::text = l.id::text ORDER BY sent_at DESC LIMIT 1) AS last_message,
                        (SELECT COUNT(*) FROM messages WHERE lead_id::text = l.id::text) AS message_count,
                        (SELECT owner_user FROM campaigns WHERE id::text = l.campaign_id::text) AS owner_user
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
                whereClauses.push(`EXISTS (
                    SELECT 1 FROM messages m 
                    JOIN bot_accounts b ON m.bot_account_id::text = b.id::text 
                    WHERE m.lead_id::text = l.id::text 
                    AND b.owner_user = ?
                )`);
                args.push(currentUser);
            }
            if (statusStr) {
                whereClauses.push(`l.status = ?`);
                args.push(statusStr);
            }

            if (whereClauses.length > 0) sql += " WHERE " + whereClauses.join(" AND ");
            sql += ` ORDER BY l.created_at DESC LIMIT ${db.isPostgres ? '?::integer' : '?'}`;
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
                whereClauses.push(`(owner_user = ? OR campaign_id::text IN (SELECT id::text FROM campaigns WHERE owner_user = ?))`);
                args.push(currentUser, currentUser);
            }
            if (statusStr) {
                whereClauses.push(`status = ?`);
                args.push(statusStr);
            }

            if (whereClauses.length > 0) query += " WHERE " + whereClauses.join(" AND ");
            query += ` ORDER BY created_at DESC LIMIT ${db.isPostgres ? '?::integer' : '?'}`;
            args.push(limit);

            const result = await db.execute({ sql: query, args });
            return NextResponse.json({ prospects: result.rows, total: result.rows.length });
        }
    } catch (err) {
        console.error("[PROSPECTS GET] Error:", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, full_name, biography, status } = body;
        const cleanUsername = username?.replace(/^@/, "").trim().toLowerCase();
        const session = request.cookies.get('rle_session');
        const currentUser = session?.value.replace('authenticated_', '') || null;

        const db = await getDb();
        await db.execute({
            sql: `INSERT INTO prospects (username, full_name, biography, status, owner_user)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(username) DO UPDATE SET
                  full_name = excluded.full_name, biography = excluded.biography`,
            args: [cleanUsername, full_name || "", biography || "", status || 'listo', currentUser]
        });
        return NextResponse.json({ success: true });
    } catch (err) { return NextResponse.json({ error: "Error" }, { status: 500 }); }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const { lead_id, prospect_id, automation_paused, status } = body;
        const db = await getDb();

        if (lead_id) {
            await db.execute({
                sql: `UPDATE leads SET automation_paused = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                args: [automation_paused ? 1 : 0, lead_id.toString()]
            });
        } else if (prospect_id) {
            await db.execute({
                sql: `UPDATE prospects SET status = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                args: [status, prospect_id.toString()]
            });
        }
        return NextResponse.json({ success: true });
    } catch (err) { return NextResponse.json({ error: "Error" }, { status: 500 }); }
}