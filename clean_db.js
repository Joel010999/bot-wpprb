const { createClient } = require('@libsql/client');

async function cleanLead() {
  const db = createClient({
    url: "file:local.db",
  });

  try {
    const lead = await db.execute({
      sql: "SELECT id FROM leads WHERE ig_handle = ?",
      args: ['@facu_bornand']
    });

    if (lead.rows.length > 0) {
      const leadId = lead.rows[0].id;
      console.log(`Eliminando mensajes para lead ID: ${leadId}`);
      await db.execute({
        sql: "DELETE FROM messages WHERE lead_id = ?",
        args: [leadId]
      });
      
      console.log(`Eliminando lead: @facu_bornand`);
      await db.execute({
        sql: "DELETE FROM leads WHERE id = ?",
        args: [leadId]
      });
      console.log("Limpieza exitosa.");
    } else {
      console.log("Lead @facu_bornand no encontrado.");
    }
  } catch (error) {
    console.error("Error limpiando BD:", error);
  }
}

cleanLead();
