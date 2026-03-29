const { createClient } = require("@libsql/client");

async function checkDb() {
    const db = createClient({ url: "file:local.db" });
    try {
        await db.execute("ALTER TABLE bot_accounts ADD COLUMN owner_user VARCHAR(255)");
    } catch(e) {}
    try {
        await db.execute("UPDATE bot_accounts SET owner_user = 'renderbyte73' WHERE username = '@brandomwhite_'");
    } catch(e) {}

    const res = await db.execute("SELECT username, owner_user FROM bot_accounts WHERE username = '@brandomwhite_'");
    console.log("DB_CHECK_RESULT:", res.rows);
}

checkDb().catch(console.error);
