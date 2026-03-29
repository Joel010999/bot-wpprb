import { getDb } from "@/lib/db";
import { 
    isAutomationPaused, 
    createBotSession, 
    humanSocialEngagement, 
    sendAndVerifyDM 
} from "@/lib/fleet";
import { generateOpenerWithReasoning } from "@/lib/openai";

export const maxDuration = 300; // 5 minutos de tiempo de ejecución para Vercel/NextJS.

export async function POST(req) {
    // Usamos SSE (Server-Sent Events) para enviar logs en vivo a la UI.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event, data) => {
                const payload = `event: ${event}\ndata: ${JSON.stringify({ time: new Date().toLocaleTimeString("es-AR", { hour12: false }), ...data })}\n\n`;
                controller.enqueue(encoder.encode(payload));
            };

            const log = (msg) => sendEvent("log", { msg });
            const setPhase = (phase) => sendEvent("phase", { phase });

            let browserContext = null;

            try {
                // Parseamos los datos que nos envía el frontend.
                const { ig_handle: rawTarget, bio_data: bioData } = await req.json();

                if (!rawTarget) {
                    sendEvent("error", { error: "Falta el objetivo (ig_handle)." });
                    controller.close();
                    return;
                }

                const targetHandle = rawTarget.replace(/^@/, "").trim().toLowerCase();
                
                // VALIDACIÓN CRÍTICA: Hardcode para no auto-atacarse
                if (targetHandle.includes("joelsantos")) {
                    sendEvent("error", { error: `⛔ Operación abortada: No podés dispararle al propio Francotirador (@joelsantos.px).` });
                    controller.close();
                    return;
                }

                log(`🚀 Iniciando ataque del Francotirador a @${targetHandle}...`);

                // 1. OBTENER UN BOT ACTIVO DE LA FLOTA
                log("Buscando un bot de Playwright activo...");
                const db = await getDb();
                
                // Extraer cookie del request headers
                const cookieHeader = req.headers.get('cookie') || "";
                const match = cookieHeader.match(/rle_session=authenticated_([^;]+)/);
                const currentUser = match ? match[1] : null;

                let botQuery;
                if (currentUser) {
                    botQuery = await db.execute(`SELECT * FROM bot_accounts WHERE status = 'active' AND owner_user = '${currentUser}' ORDER BY RANDOM() LIMIT 1`);
                }
                if (!botQuery || botQuery.rows.length === 0) {
                    botQuery = await db.execute("SELECT * FROM bot_accounts WHERE status = 'active' ORDER BY RANDOM() LIMIT 1");
                }
                
                if (botQuery.rows.length === 0) {
                    sendEvent("error", { error: "No hay bots activos en La Flota para usar el Francotirador." });
                    controller.close();
                    return;
                }
                
                const account = botQuery.rows[0];
                log(`🤖 Asignando bot @${account.username}`);

                // VALIDACIÓN: Auto-ataque (Self-attack prevention)
                const botUsernameClean = account.username.replace(/^@/, "").trim().toLowerCase();
                if (targetHandle === botUsernameClean) {
                    sendEvent("error", { error: `⛔ Operación abortada: El bot @${account.username} no puede atacarse a sí mismo.` });
                    controller.close();
                    return;
                }

                // VALIDACIÓN: Automatización pausada
                const isPaused = await isAutomationPaused(targetHandle);
                if (isPaused) {
                    sendEvent("error", { error: `⛔ Automatización pausada manualmente para este Lead.` });
                    controller.close();
                    return;
                }

                // 2. ABRIR CHROMIUM Y LOGUEAR
                log("🔌 Levantando instancia de Chromium (Headless falso)...");
                browserContext = await createBotSession(account, log);
                const { context, browser } = browserContext;
                
                const page = await context.newPage();

                // 3. ENGAGEMENT SOCIAL (Protocolo Perro de Presa)
                setPhase("engagement");
                log("🤝 Iniciando protocolo de engagement social...");
                const engagementResult = await humanSocialEngagement(page, targetHandle, log);
                
                if (engagementResult.blocked) {
                    sendEvent("error", { error: "No se le pudo dar Like al prospecto (Bloqueo Crítico)." });
                    await browser.close();
                    controller.close();
                    return;
                }

                // 4. GENERACIÓN DE MENSAJE (OpenAI V2)
                setPhase("ai");
                log("🧠 Contactando a Brandon (OpenAI V2) con los manuales secretos...");
                
                const aiResult = await generateOpenerWithReasoning(bioData || "", targetHandle, {
                    campaignNiche: "Francotirador (Tiro Direto)",
                    campaignContext: "El usuario activó el Francotirador. Se busca un tiro ultra-preciso."
                });
                
                // Limpieza dura (por si a openai se le escapan los signos prohibidos - aunque la lib ya lo hace, reforzamos acá)
                let finalOpener = aiResult.opener.replace(/[¿—–]/g, "");
                finalOpener = finalOpener.replace(/^-+/, ""); 

                log(`✅ Opener generado. Razonamiento: ${aiResult.reasoning.substring(0, 50)}...`);

                // 5. ENVÍO DE DM
                setPhase("dm_ready");
                const dmResult = await sendAndVerifyDM(page, targetHandle, finalOpener, log);
                
                if (!dmResult.sent) {
                    sendEvent("error", { error: dmResult.error || "Fallo físico enviando el DM en Instagram." });
                } else {
                    log("🎉 Disparo de Francotirador exitoso. Lead impactado.");
                    
                    // Asegurar que el lead existe en la BD o insertarlo (modo Francotirador manual)
                    const existingLead = await db.execute({
                        sql: `SELECT id FROM leads WHERE ig_handle = ?`,
                        args: [targetHandle]
                    });
                    
                    if (existingLead.rows.length === 0) {
                        try {
                            await db.execute({
                                sql: `INSERT INTO leads (ig_handle, name, bio, source_campaign, status) VALUES (?, ?, ?, ?, ?)`,
                                args: [targetHandle, targetHandle, bioData || "", "francotirador", "contacted"]
                            });
                        } catch(e) { /* ignore uniqueness issues */ }
                    } else {
                        await db.execute({
                            sql: `UPDATE leads SET status = 'contacted' WHERE ig_handle = ?`,
                            args: [targetHandle]
                        });
                    }
                    
                    // Terminar y enviar métricas
                    sendEvent("done", {
                        success: true,
                        bot: account.username,
                        sessionStatus: "browser_open",
                        ai: {
                            reasoning: aiResult.reasoning,
                            opener: finalOpener
                        }
                    });
                }
                
                log("Cerrando sesión del bot de Francotirador...");
                // IMPORTANTE: Como se levantó headless: false en Modo Francotirador para la supervisión manual,
                // idealmente la ventana no se debería cerrar para que el usuario (Joel) hable desde allí.
                // En un proceso automático (cron), esto sería await browser.close();
                log("🚀 El navegador quedó ABIERTO para que interactúes manualmente con el lead.");
                controller.close();

            } catch (err) {
                log(`🚨 ERROR FATAL: ${err.message}`);
                sendEvent("error", { error: err.message });
                if (browserContext?.browser) {
                    await browserContext.browser.close().catch(()=>{});
                }
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive"
        }
    });
}
