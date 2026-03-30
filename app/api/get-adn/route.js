import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: "No permitido en producción" }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const botUsername = searchParams.get('user');

        if (!botUsername) {
            return new NextResponse("Falta el parámetro ?user en la URL. Ejemplo: /api/get-adn?user=renderbyte.web", { status: 400 });
        }

        const db = await getDb();

        const result = await db.execute({
            sql: "SELECT session_data FROM bot_accounts WHERE username = ? OR username = ?",
            args: [botUsername, botUsername.startsWith('@') ? botUsername : `@${botUsername}`]
        });

        if (result.rows.length === 0) {
            return new NextResponse(`El bot '${botUsername}' no existe en la flota.`, { status: 404 });
        }

        const data = result.rows[0].session_data;
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);

        return new NextResponse(jsonString, {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
