import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

        const db = await getDb();
        const pendingCountQuery = db.isPostgres ? "campaign_id::text = c.id::text" : "campaign_id = c.id";

        const isAdmin = currentUser === 'admin_joel';
        let sql = `
            SELECT c.*, 
                    (SELECT COUNT(*) FROM prospects WHERE ${pendingCountQuery} AND status = 'listo') AS pending_count 
            FROM campaigns c
        `;
        let args = [];

        if (!isAdmin) {
            sql += ` WHERE c.owner_user = ?`;
            args.push(currentUser);
        }

        sql += ` ORDER BY created_at DESC`;

        const result = await db.execute({ sql, args });

        return NextResponse.json({ campaigns: result.rows });
    } catch (err) {
        console.error("[CAMPAIGNS GET] Error:", err);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { name, niche, target_source, daily_limit, niche_context, search_keyword } = body;

        if (!name) {
            return NextResponse.json({ error: "El nombre de la campaña es obligatorio" }, { status: 400 });
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
        const campaignId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);

        await db.execute({
            sql: `INSERT INTO campaigns (id, name, niche, target_source, daily_limit, niche_context, search_keyword, owner_user)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                campaignId,
                name,
                niche || "",
                target_source || "",
                daily_limit || 20,
                niche_context || "",
                search_keyword || "",
                currentUser
            ]
        });

        return NextResponse.json({ success: true, message: "Campaña creada exitosamente." });
    } catch (err) {
        console.error("[CAMPAIGNS POST] Error:", err);
        return NextResponse.json({ error: "Error interno al crear campaña" }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const { id, status } = body;

        if (!id || !status) {
            return NextResponse.json({ error: "ID y status son obligatorios" }, { status: 400 });
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

        // Verificamos propiedad de la campaña
        const checkOwnership = await db.execute({
            sql: `SELECT owner_user FROM campaigns WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
            args: [id.toString()]
        });

        const campaign = checkOwnership.rows[0];
        if (!campaign) {
            return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
        }

        if (campaign.owner_user !== currentUser) {
            return NextResponse.json({ error: "Acceso denegado: esta campaña pertenece a otro usuario limitando 403" }, { status: 403 });
        }

        await db.execute({
            sql: `UPDATE campaigns SET status = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
            args: [status, id.toString()]
        });

        // Gatillar campaña en background cuando se activa
        if (status === 'active') {
            triggerCampaignAction(id, currentUser).catch(console.error);
        }

        return NextResponse.json({ success: true, message: `Campaña actualizada a ${status}` });
    } catch (err) {
        console.error("[CAMPAIGNS PUT] Error:", err);
        return NextResponse.json({ error: "Error interno al actualizar campaña" }, { status: 500 });
    }
}

async function triggerCampaignAction(campaignId, currentUser = null) {
    const db = await getDb();
    console.log(`[CAMPAIGN TRIGGER] Lanzando campaña ${campaignId} por el usuario ${currentUser || 'sistema'}...`);

    try {
        // Obtener detalles de la campaña
        const campaignRes = await db.execute({
            sql: `SELECT c.*, (SELECT COUNT(*) FROM prospects WHERE campaign_id::text = c.id::text AND status = 'listo') AS pending_count FROM campaigns c WHERE c.id::text = ${db.isPostgres ? '?::text' : '?'}`,
            args: [campaignId.toString()]
        });
        const campaign = campaignRes.rows[0];
        if (!campaign) return;

        // Determinar qué bot usar: si el admin dispara una campaña, usa el bot del dueño original
        const effectiveUser = (currentUser === 'admin_joel') ? campaign.owner_user : (currentUser || campaign.owner_user);

        let botRes = await db.execute({
            sql: "SELECT * FROM bot_accounts WHERE status = 'active' AND owner_user = ? LIMIT 1",
            args: [effectiveUser]
        });

        const bot = botRes.rows[0];
        if (!bot) {
            console.log(`[CAMPAIGN ERROR] No hay bots activos asignados para el usuario: ${effectiveUser}`);
            await db.execute({
                sql: `UPDATE campaigns SET status='paused', status_message='No tenés un bot asignado o activo' WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                args: [campaign.id.toString()]
            });
            return;
        }

        // Importar funciones
        const { createBotSession, saveSession, sendAndVerifyDM } = await import("@/lib/fleet");

        // ── Iniciar sesión del bot (UNA sola vez para todo el flujo) ──
        console.log(`[CAMPAIGN] 🚀 Iniciando sesión para bot @${bot.username}`);
        let session;
        try {
            session = await createBotSession(bot, console.log);
        } catch (e) {
            console.error("[CAMPAIGN ERROR] Fallo inicio de sesion:", e);
            return;
        }
        const { context, browser } = session;

        try {
            // ── FASE 1: AUTO-SCRAPE si hay menos de 10 prospectos pendientes ──
            if (campaign.pending_count < 10) {
                if (!campaign.target_source) {
                    console.log(`[CAMPAIGN TRIGGER] Sin prospectos pendientes y sin target_source. Pausando.`);
                    await db.execute({
                        sql: `UPDATE campaigns SET status = 'paused', status_message = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                        args: ["Pausada — Sin prospectos en cola y sin fuente de búsqueda configurada", campaignId.toString()]
                    });
                    await browser.close();
                    return;
                }

                const targetAccount = campaign.target_source.replace(/^@/, "").trim();
                console.log(`[CAMPAIGN TRIGGER] < 10 prospectos. Iniciando fase recolección (Scrape) de seguidores de @${targetAccount}...`);
                await db.execute({
                    sql: `UPDATE campaigns SET status_message = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                    args: [`Scrapeando seguidores de @${targetAccount}...`, campaignId.toString()]
                });

                const { scrapeFollowersFromPage } = await import("@/lib/scraper");
                const scrapePage = await context.newPage();

                const nicheKeywords = campaign.niche
                    ? campaign.niche.toLowerCase().split(",").map(k => k.trim()).filter(Boolean)
                    : [];

                const leads = await scrapeFollowersFromPage(scrapePage, targetAccount, {
                    maxLeads: campaign.daily_limit || 20,
                    nicheKeywords,
                    searchKeyword: campaign.search_keyword || "",
                    onLog: console.log,
                    campaignId,
                    ownerUser: effectiveUser,
                });

                await scrapePage.close();

                // Insertar leads en DB
                let inserted = 0;
                for (const lead of leads) {
                    try {
                        await db.execute({
                            sql: `INSERT INTO prospects (username, full_name, biography, status, campaign_id, owner_user)
                                  VALUES (?, ?, ?, 'listo', ?, ?)
                                  ON CONFLICT(username) DO UPDATE SET
                                  full_name = excluded.full_name,
                                  biography = excluded.biography,
                                  owner_user = excluded.owner_user,
                                  campaign_id = CASE WHEN prospects.campaign_id IS NULL THEN excluded.campaign_id ELSE prospects.campaign_id END,
                                  status = EXCLUDED.status`,
                            args: [lead.username, lead.full_name || "", lead.biography || "", campaignId.toString(), effectiveUser]
                        });
                        inserted++;
                        console.log(`[DATABASE] Lead @${lead.username} guardado con éxito.`);
                    } catch (e) {
                        console.error(`[CAMPAIGN SCRAPE] Error insertando @${lead.username}:`, e.message);
                    }
                }

                if (inserted === 0) {
                    console.log(`[CAMPAIGN TRIGGER] Scrape completado pero 0 leads calificados.`);
                    await db.execute({
                        sql: `UPDATE campaigns SET status = 'paused', status_message = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                        args: [`Buscando leads... 0 encontrados en @${targetAccount}. Reintentando en 5 minutos`, campaignId.toString()]
                    });
                    await browser.close();
                    return;
                }

                console.log(`[CAMPAIGN TRIGGER] ✅ ${inserted} leads scrapeados e insertados. Encadenando DMs en el mismo browser...`);
                await db.execute({
                    sql: `UPDATE campaigns SET status_message = ?, leads_found = leads_found + ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                    args: [`${inserted} leads encontrados. Iniciando DMs...`, inserted, campaignId.toString()]
                });

                // Pausa humana antes de DMs (30-60s — más corta, no cerramos el browser)
                const chainPause = Math.floor(Math.random() * 30000) + 30000;
                console.log(`[CAMPAIGN] Esperando ${Math.round(chainPause / 1000)}s antes de iniciar DMs...`);
                await new Promise(r => setTimeout(r, chainPause));
            }

            // ── FASE 2: ENVÍO DE DMs (misma sesión, mismo browser) ──
            await db.execute({
                sql: `UPDATE campaigns SET status_message = 'Procesando DMs...' WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                args: [campaignId.toString()]
            });

            const page = await context.newPage();
            let dmsSentToday = 0;

            while (dmsSentToday < campaign.daily_limit) {
                // Chequear si la campaña sigue activa
                const checkCamp = await db.execute({ sql: `SELECT status FROM campaigns WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`, args: [campaignId.toString()] });
                if (checkCamp.rows[0]?.status !== 'active') {
                    console.log("[CAMPAIGN] Campaña pausada remotamente. Deteniendo bucle.");
                    break;
                }

                // Buscar un prospecto
                let prospect;
                try {
                    const sqlQuery = `SELECT * FROM prospects 
                                       WHERE status = 'listo'
                                       AND campaign_id::text = ?::text 
                                       AND owner_user = ?
                                       ORDER BY id ASC LIMIT 1`;

                    const prospectRes = await db.execute({
                        sql: sqlQuery,
                        args: [campaignId.toString(), effectiveUser]
                    });
                    prospect = prospectRes.rows[0];
                } catch (dbErr) {
                    console.error("[CAMPAIGN ERROR] Fallo al consultar prospectos:", dbErr.message);
                    await db.execute({
                        sql: `UPDATE campaigns SET status_message = ? WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                        args: [`Error de DB: ${dbErr.message}. Verifica migraciones.`, campaignId.toString()]
                    });
                    break;
                }

                if (!prospect) {
                    console.log("[CAMPAIGN] No hay mas prospectos listos para procesar en este momento.");
                    break;
                }

                try {
                    // Marcar como revisado ahora mismo
                    await db.execute({
                        sql: `UPDATE prospects SET last_checked_at = CURRENT_TIMESTAMP WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                        args: [prospect.id.toString()]
                    });

                    console.log(`[CAMPAIGN] Procesando prospecto @${prospect.username}...`);

                    const { generateOpener } = await import("@/lib/openai");
                    const aiMessage = await generateOpener(prospect.biography, prospect.username, {
                        niche_context: campaign.niche_context,
                        campaignNiche: campaign.niche,
                        campaignContext: campaign.niche_context
                    });

                    let dmResult = await sendAndVerifyDM(page, prospect.username, {
                        bio: prospect.biography,
                        config: { niche_context: campaign.niche_context },
                        message: aiMessage
                    }, console.log);

                    // ── Sincronizar Historial en DB ──
                    if (dmResult.chatHistory && dmResult.chatHistory.length > 0) {
                        let leadId = null;
                        try {
                            const leadCheck = await db.execute({
                                sql: "SELECT id FROM leads WHERE ig_handle = ?",
                                args: [prospect.username]
                            });
                            if (leadCheck.rows.length > 0) {
                                leadId = leadCheck.rows[0].id;
                            } else {
                                const newLeadRes = await db.execute({
                                    sql: `INSERT INTO leads (ig_handle, bio_data, status, campaign_id) VALUES (?, ?, 'contacted', ?) RETURNING id`,
                                    args: [prospect.username, prospect.biography || "", campaignId.toString()]
                                });
                                leadId = newLeadRes.rows[0]?.id || null;
                            }

                            if (leadId) {
                                for (const msg of dmResult.chatHistory) {
                                    await db.execute({
                                        sql: `INSERT INTO messages (lead_id, bot_account_id, content, role)
                                              SELECT ${db.isPostgres ? '?::text' : '?'}, ?, ?, ?
                                              WHERE NOT EXISTS (
                                                  SELECT 1 FROM messages WHERE lead_id::text = ${db.isPostgres ? '?::text' : '?'} AND content = ? AND role = ?
                                              )`,
                                        args: [leadId.toString(), bot.id, msg.content, msg.role, leadId.toString(), msg.content, msg.role]
                                    });
                                }
                            }
                        } catch (e) {
                            console.error("[CAMPAIGN SYNC] Error sincronizando mensajes:", e.message);
                        }
                    }

                    if (dmResult.sent && dmResult.verified) {
                        await db.execute({
                            sql: `UPDATE prospects SET status = 'finalizado' WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                            args: [prospect.id.toString()]
                        });
                        dmsSentToday++;
                        console.log(`[CAMPAIGN] DM OK! (${dmsSentToday}/${campaign.daily_limit})`);

                        await db.execute({
                            sql: `UPDATE campaigns SET dms_sent = dms_sent + 1 WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                            args: [campaignId.toString()]
                        });
                        await db.execute({
                            sql: `UPDATE bot_accounts SET daily_dm_count = daily_dm_count + 1 WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                            args: [bot.id.toString()]
                        });
                    } else {
                        console.log(`[CAMPAIGN] Fallo DM para @${prospect.username}. Marcar como error.`);
                        await db.execute({
                            sql: `UPDATE prospects SET status = 'error' WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                            args: [prospect.id.toString()]
                        });

                        if (dmResult.error === "Bloqueo en Engagement") {
                            console.log("[CAMPAIGN] Bloqueo crítico en engagement detectado. Deteniendo campaña preventivamente.");
                            break;
                        }
                    }
                } catch (processErr) {
                    console.error(`[CAMPAIGN ERROR] Fallo procesando prospecto @${prospect.username}:`, processErr.message);
                    await db.execute({
                        sql: `UPDATE prospects SET status = 'error' WHERE id::text = ${db.isPostgres ? '?::text' : '?'}`,
                        args: [prospect.id.toString()]
                    }).catch(() => { });
                }

                const pauseMs = Math.floor(Math.random() * 15000) + 15000;
                console.log(`[CAMPAIGN (ULTRA-RÁPIDO)] Esperando ${Math.round(pauseMs / 1000)}s antes del próximo prospecto...`);
                await page.waitForTimeout(pauseMs);
            }

            console.log(`[CAMPAIGN] Bucle finalizado. Total DMs hoy: ${dmsSentToday}`);

        } finally {
            await saveSession(bot.username, context).catch(() => { });
            await browser.close();
        }

    } catch (err) {
        console.error("[CAMPAIGN TRIGGER FATAL ERROR]", err);
    }
}