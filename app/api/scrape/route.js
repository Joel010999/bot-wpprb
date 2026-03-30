import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
    try {
        const db = await getDb();
        const result = await db.execute(`
            SELECT * FROM scrape_jobs ORDER BY created_at DESC
        `);
        return NextResponse.json({ jobs: result.rows });
    } catch (err) {
        console.error("[SCRAPE GET] Error:", err);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { target_url, scrape_type, filters, campaign_id } = body;

        const session = request.cookies.get('rle_session');
        let currentUser = null;
        if (session && session.value.startsWith('authenticated_')) {
            currentUser = session.value.replace('authenticated_', '');
        }

        if (!currentUser) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        if (!target_url) {
            return NextResponse.json({ error: "URL objetivo es obligatoria" }, { status: 400 });
        }

        const db = await getDb();

        // Registrar el job en la DB
        const jobId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
        await db.execute({
            sql: `INSERT INTO scrape_jobs (id, target_url, scrape_type, status, filters, campaign_id)
                  VALUES (?, ?, ?, 'running', ?, ?)`,
            args: [
                jobId,
                target_url,
                scrape_type || "followers",
                JSON.stringify(filters || {}),
                campaign_id || null,
            ]
        });

        // Lanzar scraping en background
        runScrapeJob(jobId, target_url, filters || {}, campaign_id, currentUser).catch(console.error);

        return NextResponse.json({ success: true, jobId, message: "Scraping iniciado en background." });
    } catch (err) {
        console.error("[SCRAPE POST] Error:", err);
        return NextResponse.json({ error: "Error interno al iniciar scraping" }, { status: 500 });
    }
}

async function runScrapeJob(jobId, targetUrl, filters, campaignId, ownerUser = null) {
    const db = await getDb();

    try {
        const { createBotSession, saveSession } = await import("@/lib/fleet");
        const { scrapeFollowersFromPage } = await import("@/lib/scraper");

        // Obtener bot activo
        const botRes = await db.execute("SELECT * FROM bot_accounts WHERE status = 'active' LIMIT 1");
        const bot = botRes.rows[0];

        if (!bot) {
            console.log("[SCRAPE JOB] No hay bots activos.");
            await db.execute({ sql: "UPDATE scrape_jobs SET status = 'failed' WHERE id = ?", args: [jobId] });
            return;
        }

        // Iniciar sesión del bot
        const session = await createBotSession(bot, console.log);
        const { context, browser } = session;
        const page = await context.newPage();

        // Extraer username del URL o handle
        const match = targetUrl.match(/instagram\.com\/([^/?#]+)/);
        const targetAccount = match ? match[1] : targetUrl.replace(/^@/, "").trim();

        // Parsear filtros de nicho
        const nicheKeywords = filters.nicheKeywords || filters.bioKeywords || [];

        // Ejecutar scraping
        const leads = await scrapeFollowersFromPage(page, targetAccount, {
            maxLeads: filters.maxLeads || 20,
            nicheKeywords,
            onLog: console.log,
            campaignId,
            ownerUser,
        });

        // Insertar prospectos en la DB
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
                    args: [lead.username, lead.full_name || "", lead.biography || "", campaignId || null, ownerUser]
                });
                inserted++;
            } catch (e) {
                console.error(`[SCRAPE JOB] Error insertando @${lead.username}:`, e.message);
            }
        }

        // Actualizar scrape_job
        await db.execute({
            sql: "UPDATE scrape_jobs SET status = 'completed', leads_found = ? WHERE id = ?",
            args: [inserted, jobId]
        });

        // Guardar sesión del bot
        await saveSession(bot.username, context);
        await browser.close();

        console.log(`[SCRAPE JOB] Completado. ${inserted} leads insertados.`);

    } catch (err) {
        console.error("[SCRAPE JOB] Error fatal:", err);
        await db.execute({ sql: "UPDATE scrape_jobs SET status = 'failed' WHERE id = ?", args: [jobId] });
    }
}
