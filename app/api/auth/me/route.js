import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const session = request.cookies.get('rle_session');
        let currentUser = null;
        if (session && session.value.startsWith('authenticated_')) {
            currentUser = session.value.replace('authenticated_', '');
        }

        if (!currentUser) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const role = (currentUser === 'admin_joel') ? 'admin' : 'operator';

        return NextResponse.json({
            username: currentUser,
            role: role
        });
    } catch (err) {
        console.error("[AUTH ME] Error:", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
