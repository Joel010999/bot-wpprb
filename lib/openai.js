import OpenAI from "openai";

let client = null;
let ASSISTANT_ID = null;

// Resolver la API key: DB settings > .env > error
async function resolveApiKey() {
    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const result = await db.execute(
            `SELECT value FROM settings WHERE key = 'openaiKey'`
        );
        if (result.rows.length > 0 && result.rows[0].value) {
            const dbKey = result.rows[0].value.trim();
            if (dbKey.length > 20 && !dbKey.startsWith("sk-your")) {
                return dbKey;
            }
        }
    } catch {
        // DB no disponible, continuar con env
    }

    const envKey = process.env.OPENAI_API_KEY;
    if (envKey && envKey.length > 20 && !envKey.startsWith("sk-your")) {
        return envKey;
    }

    throw new Error(
        "No se encontró una API key válida de OpenAI. " +
        "Guardá tu clave real en Ajustes o configurá OPENAI_API_KEY en .env.local"
    );
}

export async function getClient() {
    if (!client) {
        const apiKey = await resolveApiKey();
        client = new OpenAI({ apiKey });
    }
    return client;
}

export function resetClient() {
    client = null;
    ASSISTANT_ID = null;
}

const BASE_PROMPT = `Sos Brandon White, asesor estratégico de Renderbyte. Tu objetivo es transformar conversaciones de Instagram en reuniones calificadas de 15 minutos en agenda.

TONO Y FORMATO (CRÍTICO):
- Tono: Argentino profesional, cordial y directo (amable pero empresarial).
- CONCISIÓN: Mensajes cortitos, máximo 3 renglones.
- Cierre: Proponé HOY o MAÑANA para una llamada de 15 minutos en {{MEETING_LINK}} o pedí su WhatsApp.
- REGLA DE ORO: No termines NUNCA el mensaje con un punto final. Terminá con una pregunta o dejalo abierto.

REGLAS DE ESTILO PROHIBITIVAS:
- PROHIBIDO usar el signo de interrogación de apertura (¿).
- PROHIBIDO usar guiones medios o largos (— o –).
- PROHIBIDO TERMINAR CON PUNTO FINAL.
- Sin modismos excesivos, "jaja" o "xd".

MEETING LINK: {{MEETING_LINK}}
WHATSAPP: {{WHATSAPP}}`;

const SOP_LORENZO_ADDITION = `
SEGUÍ ESTRICTAMENTE EL MANUAL PDF DE LORENZO (Estructura de Ventas Nutramo).
PROCESO DE PENSAMIENTO: Usá file_search para consultar la "Estructura de Ventas".

REGLAS DE ORO DE VENTA (SOP LORENZO):
1. NO VENDER DIRECTAMENTE: Observación concreta + mini diagnóstico + pregunta abierta.
2. DETECTAR CUELLO DE BOTELLA: Señalar que herramientas reducen el valor percibido.
3. PROCESO: Diagnóstico rápido → Propuesta de caminos → Llamada 15 min.
4. PLANES Y PRECIOS: 
   - Plan 1: USD 250 (Promo USD 175) + 30/mes.
   - Plan 2: Sitio Completo.`;

function getDynamicSystemPrompt(config = {}) {
    let prompt = BASE_PROMPT;
    const nicheTarget = (config.campaignNiche || "").toLowerCase();

    // Si el nicho incluye nutricion o tatuadores, aplicamos el SOP de Lorenzo
    if (nicheTarget.includes("nutri") || nicheTarget.includes("tatuad") || nicheTarget.includes("tattoo")) {
        prompt += SOP_LORENZO_ADDITION;
    } else {
        prompt += `\nREGLAS DE VENTA GENERALES:\n- Hacé preguntas sobre su negocio para entender si precisan una web o embudo.\n- NO ofrezcas precios directamente. Enfocá la charla en agendar una reunión.\n`;
    }

    return prompt
        .replace(/{{MEETING_LINK}}/g, config.meetingLink || "https://calendly.com/renderbyte")
        .replace(/{{WHATSAPP}}/g, config.whatsapp || "+5493517701791");
}

// Inicializa o recupera el Asistente
async function getOrCreateAssistant(config = {}) {
    if (ASSISTANT_ID) return ASSISTANT_ID;

    const ai = await getClient();
    const systemPrompt = getDynamicSystemPrompt(config);

    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const res = await db.execute("SELECT value FROM settings WHERE key='assistantId'");
        if (res.rows.length > 0) {
            ASSISTANT_ID = res.rows[0].value;
            await ai.beta.assistants.update(ASSISTANT_ID, {
                instructions: systemPrompt,
            }).catch(() => null);
            return ASSISTANT_ID;
        }
    } catch { }

    const assistant = await ai.beta.assistants.create({
        name: "Brandon White (RLE)",
        instructions: systemPrompt,
        model: "gpt-4o-mini",
        tools: [{ type: "file_search" }],
    });

    ASSISTANT_ID = assistant.id;

    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const sqlQuery = db.isPostgres
            ? "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            : "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)";

        await db.execute({
            sql: sqlQuery,
            args: ["assistantId", ASSISTANT_ID]
        });
    } catch { }

    return ASSISTANT_ID;
}

async function getOrCreateThread(leadHandle) {
    const ai = await getClient();
    const handleSafe = (leadHandle || "unknown").replace(/^@/, "").trim().toLowerCase();

    if (handleSafe === "unknown" || handleSafe === "lead") {
        console.warn(`[OpenAI] ⚠️ handle inválido: "${leadHandle}". Usando thread genérico.`);
    }

    let threadId = null;
    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        try {
            await db.execute("ALTER TABLE leads ADD COLUMN thread_id TEXT");
        } catch { }

        const res = await db.execute({
            sql: "SELECT thread_id FROM leads WHERE ig_handle = ?",
            args: [handleSafe]
        });

        if (res.rows.length > 0 && res.rows[0].thread_id) {
            threadId = res.rows[0].thread_id;
        }
    } catch (e) {
        console.error("Error buscando threadId local:", e);
    }

    if (!threadId) {
        console.log(`[OpenAI] 🧵 Creando nuevo Thread para @${handleSafe}...`);
        const thread = await ai.beta.threads.create();
        threadId = thread.id;

        try {
            const { getDb } = await import("@/lib/db");
            const db = await getDb();
            await db.execute({
                sql: `INSERT INTO leads (ig_handle, thread_id, status) VALUES (?, ?, 'cold') 
                      ON CONFLICT(ig_handle) DO UPDATE SET thread_id = excluded.thread_id`,
                args: [handleSafe, threadId]
            });
            console.log(`[OpenAI] ✅ Thread ${threadId} vinculado a @${handleSafe}`);
        } catch (e) { }
    }

    return threadId;
}

// ── LÓGICA DE RUNS BLINDADA (FIX UNDEFINED) ──
async function processRun(ai, threadId, assistantId, additionalConfig = {}) {
    // 1. Sanitización forzada: Aseguramos que los IDs sean strings reales
    const tId = String(threadId || "").trim();
    const aId = String(assistantId || "").trim();

    if (!tId || tId === "undefined" || !aId || aId === "undefined") {
        throw new Error(`[OpenAI ERROR] Faltan IDs críticos — threadId: ${tId}, assistantId: ${aId}`);
    }

    let runArgs = { assistant_id: aId };
    if (additionalConfig.campaignNiche) {
        runArgs.instructions = getDynamicSystemPrompt(additionalConfig);
    }

    console.log(`[DEBUG] Iniciando Run Real — Thread: ${tId} | Assistant: ${aId}`);

    // 2. Creamos el Run
    let run = await ai.beta.threads.runs.create(tId, runArgs);

    // 3. Bucle de espera usando tId inmutable y run.id dinámico
    while (run.status === "in_progress" || run.status === "queued") {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // RECUPERACIÓN SEGURA: tId siempre primero, run.id después.
        run = await ai.beta.threads.runs.retrieve(tId, run.id);
    }

    if (run.status === "requires_action") {
        console.error(`[OpenAI Assistant] ⚠️ Run requiere acción. Cancelando.`);
        await ai.beta.threads.runs.cancel(tId, run.id);
        throw new Error("El Asistente pidió una acción no soportada.");
    }

    if (run.status === "failed") {
        console.error(`[OpenAI Assistant] ❌ Error en Run:`, run.last_error);
        throw new Error(`Error en el asistente: ${run.last_error?.message || "Error desconocido"}`);
    }

    if (run.status !== "completed") {
        throw new Error(`Estado de Run inesperado: ${run.status}`);
    }

    // 4. Obtener respuesta
    const messages = await ai.beta.threads.messages.list(tId);
    const lastMsg = messages.data[0];

    if (lastMsg.role === "assistant" && lastMsg.content[0].type === "text") {
        let text = lastMsg.content[0].text.value;
        text = text.replace(/【.*?】/g, '');

        // LIMPIEZA JOEL (REFORZADA)
        text = text.replace(/[¿—–]/g, "");
        text = text.replace(/^-+/, "");
        text = text.replace(/\s+/g, " ");

        // Sin punto final
        text = text.trim().replace(/\.+$/, "");

        return text;
    }

    return "Hubo un error al interpretar la respuesta.";
}

export async function generateOpener(leadBio, leadHandle, config = {}) {
    const ai = await getClient();
    const assistantId = await getOrCreateAssistant(config);
    const threadId = await getOrCreateThread(leadHandle);

    let context = `Contexto del Lead:\nBio: "${leadBio}"`;
    if (config.campaignContext) {
        context += `\nCampaña/Nicho: "${config.campaignNiche || "general"}" - ${config.campaignContext}`;
    }

    await ai.beta.threads.messages.create(threadId, {
        role: "user",
        content: `${context}\n\nGenerá el abridor inicial. Sin vender directo, hacé una observación. CORTITO (máximo 3 renglones). Rompé la información con puntos seguidos para que el bot la divida en globitos cortos. NUNCA pongas punto final al terminar el mensaje.`,
    });

    return await processRun(ai, threadId, assistantId, config);
}

export async function generateOpenerWithReasoning(leadBio, leadHandle, config = {}) {
    const ai = await getClient();
    const systemPrompt = getDynamicSystemPrompt(config);

    let campaignInstruction = "";
    if (config.campaignContext) {
        campaignInstruction = `\n\nCONTEXTO DE CAMPAÑA: Nicho "${config.campaignNiche || "general"}". ${config.campaignContext}`;
    }

    const response = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt + campaignInstruction },
            {
                role: "user",
                content: `MODO LABORATORIO — Mismas reglas. Objetivo: @${leadHandle}\nBio: "${leadBio || "No disponible"}"\n\nRespondé en este formato exacto:\n\n[ANÁLISIS]\n- Qué detectaste en la bio\n- Qué ángulo vas a usar para abrir\n\n[OPENER]\n(Escribí solo el mensaje final, máximo 3 renglones)`
            },
        ],
    });

    const fullResponse = response.choices[0].message.content.trim();
    const analysisMatch = fullResponse.match(/\[ANÁLISIS\]([\s\S]*?)\[OPENER\]/i);
    const openerMatch = fullResponse.match(/\[OPENER\]([\s\S]*?)$/i);

    let finalOpener = openerMatch ? openerMatch[1].trim() : fullResponse;
    finalOpener = finalOpener.replace(/[¿—–-]/g, "").replace(/\s+/g, " ").trim();

    return {
        reasoning: analysisMatch ? analysisMatch[1].trim() : "Razonamiento no disponible",
        opener: finalOpener,
        fullResponse,
    };
}

export async function generateReply(conversationHistory, leadBio, config = {}) {
    let lastMsg = conversationHistory;
    const lines = conversationHistory.split('\n');
    if (lines.length > 1) {
        lastMsg = lines[lines.length - 1];
    }

    let targetHandle = "lead";
    const leadMatch = lastMsg.match(/Último mensaje de @([^:]+):/);
    if (leadMatch) {
        targetHandle = leadMatch[1];
        lastMsg = lastMsg.replace(leadMatch[0], "").trim();
    }

    const ai = await getClient();
    const assistantId = await getOrCreateAssistant(config);
    const threadId = await getOrCreateThread(targetHandle);

    await ai.beta.threads.messages.create(threadId, {
        role: "user",
        content: `El prospecto me contestó lo siguiente: "${lastMsg}".\nRespondé sin exceder 3 renglones y buscando avanzar hacia la llamada de 15 min.`,
    });

    return await processRun(ai, threadId, assistantId, config);
}

export async function analyzeSentiment(message) {
    const ai = await getClient();
    const response = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: 'Clasificá como: "interested", "not_interested", "neutral", "meeting_booked". Solo la palabra.' },
            { role: "user", content: message },
        ],
    });
    return response.choices[0].message.content.trim().toLowerCase();
}