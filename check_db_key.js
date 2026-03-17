const { createClient } = require('@libsql/client');

async function checkKey() {
  const db = createClient({
    url: "file:local.db",
  });

  try {
    const res = await db.execute("SELECT key, value FROM settings WHERE key='openaiKey'");
    if (res.rows.length > 0) {
      const dbKey = res.rows[0].value;
      console.log(`Clave encontrada en DB: ${dbKey.substring(0, 10)}... (longitud: ${dbKey.length})`);
    } else {
      console.log("No hay clave de OpenAI en la BD.");
    }
    
    const baseUrlRes = await db.execute("SELECT key, value FROM settings");
    console.log("Otras settings:", baseUrlRes.rows.map(r => r.key).join(", "));
  } catch (error) {
    console.error("Error consultando BD:", error.message);
  }
}

checkKey();
