import { NextResponse } from "next/server";

const VALID_USERS = {
  "admin_joel": "admin73152",
  "renderbyte1": "73512bot",
  "renderbyte73": "73512botLoren",
  "renderbyte152": "73512botFacu"
};

export async function POST(request) {
  try {
    let { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Credenciales incompletas" }, { status: 400 });
    }

    // Normalizar credenciales (eliminar espacios y transformar usuario a minúsculas para evitar errores)
    username = username.trim().toLowerCase();
    password = password.trim();

    console.log("Intento de login con:", { username, password });

    if (VALID_USERS[username] && VALID_USERS[username] === password) {
      // Login exitoso
      const response = NextResponse.json({ success: true });
      
      // Cookie expira en 7 días
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      response.cookies.set({
        name: "rle_session",
        value: "authenticated_" + username,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: expiresAt,
        path: "/",
      });

      return response;
    }

    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
