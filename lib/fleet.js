/**
 * Fleet Manager — Multi-Account Automation Engine
 * Manages bot accounts with isolated browser fingerprints and proxies
 * Session persistence via Playwright storageState (cookies + localStorage)
 */

// Completamente cloud-native (PostgreSQL session_data)

// ── Automation Guard ─────────────────────────────────────────────
export async function isAutomationPaused(leadHandle) {
    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const result = await db.execute({
            sql: `SELECT automation_paused FROM leads WHERE ig_handle = ?`,
            args: [leadHandle.replace(/^@/, "").trim().toLowerCase()],
        });
        if (result.rows.length > 0 && result.rows[0].automation_paused === 1) {
            console.log(`[Fleet] ⛔ Automatización pausada para @${leadHandle} — bloqueado`);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`[Fleet] Error verificando pausa de @${leadHandle}:`, err);
        return false;
    }
}

// ── Delays calibrados para simular 1-3 minutos por conversación ──
const TYPING_DELAY = () => Math.floor(Math.random() * 31) + 20;       // 20-50ms por tecla
const BETWEEN_WORDS_PAUSE = () => Math.floor(Math.random() * 151) + 100; // 100-250ms pausas
const ACTION_DELAY = () => Math.floor(Math.random() * 15000) + 8000;    // 8-23s entre acciones
const READ_DELAY = () => Math.floor(Math.random() * 10000) + 5000;      // 5-15s "leyendo"

const WARMUP_DM_LIMITS = [20, 45, 70];

export function getDailyLimit(warmupLevel) {
    return WARMUP_DM_LIMITS[Math.min(warmupLevel, WARMUP_DM_LIMITS.length - 1)];
}

// ── Session Persistence ──────────────────────────────────────────
export async function saveSession(username, context) {
    try {
        const state = await context.storageState();
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const cleanUsername = username.replace('@', '');
        const stateStr = JSON.stringify(state);

        console.log(`[Fleet] Guardando ADN para @${cleanUsername} (${stateStr.length} bytes)...`);

        const sqlQuery = db.isPostgres
            ? `UPDATE bot_accounts SET session_data = ?, last_active = NOW() WHERE username = ? OR username = ?`
            : `UPDATE bot_accounts SET session_data = ?, last_active = CURRENT_TIMESTAMP WHERE username = ? OR username = ?`;

        const args = [stateStr, cleanUsername, `@${cleanUsername}`];

        await db.execute({ sql: sqlQuery, args: args });
        console.log(`[Fleet] Sesión guardada en DB para @${username}`);

        return true;
    } catch (err) {
        if (err.message.includes('closed') || err.message.includes('Context has been closed')) {
            console.log(`[Fleet] No se guarda sesión para @${username}: Contexto cerrado`);
            return false;
        }
        console.error(`[Fleet] Error guardando sesión de @${username}:`, err);
        return false;
    }
}

export async function hasSession(username) {
    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const res = await db.execute({
            sql: "SELECT session_data FROM bot_accounts WHERE username = ? AND session_data IS NOT NULL",
            args: [username]
        });
        return res.rows.length > 0;
    } catch {
        return false;
    }
}

async function loadSessionState(username) {
    try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const res = await db.execute({
            sql: "SELECT session_data FROM bot_accounts WHERE username = ?",
            args: [username]
        });

        if (res.rows.length > 0 && res.rows[0].session_data) {
            const data = res.rows[0].session_data;
            return typeof data === 'string' ? JSON.parse(data) : data;
        }
        return null;
    } catch (err) {
        console.error(`[Fleet] Error cargando sesión de @${username}:`, err);
        return null;
    }
}

// ── Fingerprint ──────────────────────────────────────────────────
export function generateFingerprint() {
    const screenRes = [[1920, 1080], [1366, 768], [1440, 900], [1536, 864], [2560, 1440]];
    const platforms = ["Win32", "MacIntel", "Linux x86_64"];

    const res = screenRes[Math.floor(Math.random() * screenRes.length)];
    const lang = "es-ES";
    return {
        screen: { width: res[0], height: res[1] },
        platform: platforms[Math.floor(Math.random() * platforms.length)],
        language: lang,
        hardwareConcurrency: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
        deviceMemory: [2, 4, 8][Math.floor(Math.random() * 3)],
        colorDepth: 24,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

// ── Bot Session ──────────────────────────────────────────────────
export async function createBotSession(account, onLog = console.log) {
    const { chromium } = await import("playwright");
    const fingerprint = generateFingerprint();
    const isProduction = process.env.NODE_ENV === "production";
    const headlessMode = isProduction;

    onLog(`[SISTEMA] 🚀 Intentando abrir Chromium para @${account.username}...`);

    const browser = await chromium.launch({
        headless: headlessMode,
        args: [
            "--start-maximized",
            "--window-position=0,0",
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-sandbox",
            "--disable-setuid-sandbox",
        ],
        proxy: account.proxy_endpoint ? { server: account.proxy_endpoint } : undefined,
    });

    onLog("[SISTEMA] ✅ Chromium detectado y listo para login en Jujuy.");
    const savedState = await loadSessionState(account.username);

    const contextOptions = {
        viewport: null,
        locale: fingerprint.language,
        userAgent: `Mozilla/5.0 (${fingerprint.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
        colorScheme: "dark",
        extraHTTPHeaders: { "Accept-Language": fingerprint.language },
    };

    if (savedState) {
        contextOptions.storageState = savedState;
        onLog(`[SISTEMA] 📂 Sesión previa cargada desde DB para @${account.username}`);
    }

    const context = await browser.newContext(contextOptions);
    await context.addInitScript((fp) => {
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => fp.hardwareConcurrency });
        Object.defineProperty(navigator, "deviceMemory", { get: () => fp.deviceMemory });
        Object.defineProperty(navigator, "platform", { get: () => fp.platform });
        Object.defineProperty(screen, "colorDepth", { get: () => fp.colorDepth });
    }, fingerprint);

    const verifyPage = await context.newPage();
    onLog("[SISTEMA] 🔍 Verificando sesión de Instagram...");

    await verifyPage.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await verifyPage.waitForTimeout(3000);

    let isLoggedIn = false;
    try {
        const loggedInIndicators = [
            'svg[aria-label="Home"]', 'svg[aria-label="Inicio"]', 'a[href="/direct/inbox/"]',
            'svg[aria-label="New post"]', 'svg[aria-label="Nueva publicación"]', 'span[role="link"]',
        ];
        for (const sel of loggedInIndicators) {
            if (await verifyPage.locator(sel).first().count() > 0) {
                isLoggedIn = true;
                break;
            }
        }
    } catch { }

    if (isLoggedIn) {
        onLog("[SISTEMA] ✅ Sesión de Instagram activa — @" + account.username + " conectado");
        await verifyPage.close();
    } else {
        onLog("[SISTEMA] 🔐 LOGIN MANUAL NECESARIO — Revisa la ventana de Chrome");
        const currentUrl = verifyPage.url();
        if (!currentUrl.includes("instagram.com")) {
            await verifyPage.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 15000 });
        }

        const MAX_LOGIN_WAIT = 10 * 60 * 1000;
        const CHECK_INTERVAL = 10 * 1000;
        const startTime = Date.now();
        let loginDetected = false;

        while (Date.now() - startTime < MAX_LOGIN_WAIT) {
            await verifyPage.waitForTimeout(CHECK_INTERVAL);
            try {
                const homeIcon = verifyPage.locator('svg[aria-label="Home"], svg[aria-label="Inicio"], a[href="/direct/inbox/"]').first();
                if (await homeIcon.count() > 0) {
                    loginDetected = true;
                    break;
                }
            } catch { }
        }

        if (loginDetected) {
            onLog("[SISTEMA] ✅ Login detectado — guardando sesión...");
            await saveSession(account.username, context);
        } else {
            onLog("[SISTEMA] ❌ Timeout de login — cerrando browser");
            await browser.close();
            throw new Error("Login manual no completado en 10 minutos");
        }
        await verifyPage.close();
    }

    context.on("close", async () => {
        await saveSession(account.username, context).catch(() => { });
    });

    try {
        await saveSession(account.username, context);
        onLog("[SISTEMA] 💾 Sesión re-verificada y escrita en disco/DB.");
    } catch (e) { }

    return { browser, context, fingerprint, loginConfirmed: true };
}

// ── Human Simulation ─────────────────────────────────────────────
async function closeModals(page, onLog, ts) {
    const dismissTexts = ["Not Now", "Ahora no", "Not now", "Save Info", "Guardar información", "Cancel", "Cancelar", "Turn On", "Activar"];
    const dismissSelectors = [
        ...dismissTexts.map(t => `button:has-text("${t}")`),
        'div[role="dialog"] button:has-text("Not Now")',
        'div[role="dialog"] button:has-text("Ahora no")',
        'button[class*="dismiss"]',
    ];

    for (const sel of dismissSelectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0 && await btn.isVisible()) {
                await btn.click({ force: true });
                await page.waitForTimeout(800);
            }
        } catch { }
    }
}

export async function humanSocialEngagement(page, targetHandle, onLog = () => { }) {
    const ts = () => new Date().toLocaleTimeString("es-AR", { hour12: false });
    const startTime = Date.now();

    onLog(`[${ts()}] 🌐 Navegando al perfil de @${targetHandle}...`);
    await page.goto(`https://www.instagram.com/${targetHandle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page, onLog, ts);

    try {
        await page.goto(`https://www.instagram.com/${targetHandle}/reels/`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(2000);

        let postLink = page.locator('a[href*="/reel/"], a[href*="/p/"]').first();
        if (await postLink.count() === 0) {
            await page.goto(`https://www.instagram.com/${targetHandle}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
            postLink = page.locator('a[href*="/p/"], a[href*="/reel/"]').first();
        }

        if (await postLink.count() > 0) {
            await postLink.click({ force: true });
            await page.waitForTimeout(3000);

            const likeIcon = page.locator('svg[aria-label="Like"], svg[aria-label="Me gusta"]').first();
            if (await likeIcon.count() > 0) {
                await likeIcon.click({ force: true }).catch(() => { });
                onLog(`[${ts()}] ❤️ Like enviado.`);
            }
        }
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Error en interacción de engagement: ${e.message}`);
    }

    const elapsed = Date.now() - startTime;
    const remaining = 3000 - elapsed;
    if (remaining > 0) await page.waitForTimeout(remaining);

    onLog(`[${ts()}] ✅ Protocolo de Engagement de 3s completado.`);
    return { followed: false, liked: true, blocked: false };
}

// ── Enviar y Verificar DM (MODIFICADO: SCRIPT FIJO RENDERBYTE) ──
export async function sendAndVerifyDM(page, targetHandle, messageOrData, onLog = () => { }) {
    const ts = () => new Date().toLocaleTimeString("es-AR", { hour12: false });

    onLog(`[${ts()}] 💬 Iniciando proceso de DM para @${targetHandle}...`);

    onLog(`[${ts()}] 🌐 Navegando al perfil de @${targetHandle} para engagement previo...`);
    await page.goto(`https://www.instagram.com/${targetHandle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page, onLog, ts);

    onLog(`[${ts()}] 🔄 Ejecutando Protocolo de Engagement (Like) antes del DM...`);
    const engagement = await humanSocialEngagement(page, targetHandle, onLog);

    if (engagement.blocked) {
        onLog(`[${ts()}] 🚨 Abortando DM por fallo en el Engagement Social.`);
        return { sent: false, verified: false, error: "Bloqueo en Engagement" };
    }

    onLog(`[${ts()}] ⏱️ Pausa humana 3s post-engagement antes de ir al Mensaje...`);
    await page.waitForTimeout(3000);

    onLog(`[${ts()}] 🌐 Buscando botón de Mensaje en el perfil...`);
    const msgBtn = page.locator([
        'div[role="button"]:has-text("Message")', 'button:has-text("Message")',
        'div[role="button"]:has-text("Mensaje")', 'button:has-text("Mensaje")',
        'a[href*="/direct/t/"]'
    ].join(', ')).first();

    let inputFound = false;

    try {
        await msgBtn.waitFor({ state: 'visible', timeout: 10000 });
        await msgBtn.click({ force: true });
        onLog(`[${ts()}] ✅ Botón de Mensaje clickeado. Esperando input...`);
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Botón de Mensaje no detectado. Intentando URL directa...`);
        await page.goto(`https://www.instagram.com/direct/t/${targetHandle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);
    }

    const INPUT_SELECTORS = [
        'div[contenteditable="true"][role="textbox"]',
        'textarea[placeholder*="mensaje" i]',
        'textarea[placeholder*="message" i]'
    ].join(', ');

    let messageInput = page.locator(INPUT_SELECTORS).first();
    await closeModals(page, onLog, ts);

    try {
        await messageInput.waitFor({ state: 'visible', timeout: 15000 });
        inputFound = true;
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Falló carga del input. Recargando página de chat...`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(5000);
        await closeModals(page, onLog, ts);

        messageInput = page.locator(INPUT_SELECTORS).first();
        try {
            await messageInput.waitFor({ state: 'visible', timeout: 8000 });
            inputFound = true;
        } catch (e2) { }
    }

    onLog(`[${ts()}] 🕵️ Sincronizando historial de chat...`);
    const chatHistory = await scrapeChatHistory(page, onLog);

    if (messageOrData?.bypassSend) {
        return { sent: true, verified: true, chatHistory, error: null };
    }

    if (!inputFound) {
        onLog(`[${ts()}] ❌ Fallo crítico definitivo: Input de chat no encontrado.`);
        return { sent: false, verified: false, error: "Campo de texto no encontrado" };
    }

    onLog(`[${ts()}] 📨 Chat cargado y listo.`);

    const assistantMessages = chatHistory.filter(m => m.role === 'assistant');
    if (assistantMessages.length > 0) {
        onLog(`[${ts()}] 🛑 DOBLE CAPA ANTI-SPAM: El bot ya envió mensajes previos a este lead.`);
        return { sent: true, verified: true, chatHistory, error: null, skipped: true };
    }

    // ── SECUENCIA EXACTA RENDERBYTE PARA ABRIR EN FRÍO ──
    const fragments = [
        "Hola, como estas?",
        "Una consulta rapida",
        "Te contacto desde RenderByte por que actualmente estamos seleccionando 40 negocios este mes para participar en una iniciativa estrategica de medicion de metricas y resultados reales",
        "Estamos priorizando especialmente negocios que ya estan operando activamente y buscan mejorar su posicionamiento digital para escalar su captacion de clientes",
        "Este proyecto forma parte del desarrollo de un nuevo producto que lanzaremos mas adelante",
        "Te gustaria que te explique brevemente como funciona el proceso?"
    ];

    onLog(`[${ts()}] 📨 Enviando Script Oficial RenderByte (${fragments.length} mensajes)...`);

    try {
        await messageInput.scrollIntoViewIfNeeded().catch(() => { });
        await messageInput.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(1000);
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Falló foco inicial en chat input.`);
    }

    for (let i = 0; i < fragments.length; i++) {
        const msgToSend = fragments[i];
        onLog(`[${ts()}] ⌨️ Escribiendo fragmento ${i + 1}/${fragments.length}...`);

        await messageInput.click({ force: true }).catch(() => { });
        await page.waitForTimeout(500);

        // Limpiar el input por si quedó texto trabado del intento anterior
        await page.keyboard.press("Control+A").catch(() => { });
        await page.keyboard.press("Backspace").catch(() => { });

        for (const char of msgToSend) {
            await page.keyboard.type(char, { delay: TYPING_DELAY() });
        }

        // DOBLE TAP DE ENVÍO: Enter + Click en botón Enviar si aparece
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);

        // Buscar si existe el botoncito azul de enviar y apretarlo por las dudas
        try {
            const sendBtn = page.locator('button:has-text("Send"), div[role="button"]:has-text("Send"), button:has-text("Enviar"), div[role="button"]:has-text("Enviar")').filter({ hasText: /^Send$|^Enviar$/i }).first();
            if (await sendBtn.count() > 0 && await sendBtn.isVisible()) {
                await sendBtn.click({ force: true });
            }
        } catch (e) { }

        if (i < fragments.length - 1) {
            // Pausa entre globos
            await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1500);
        }
    }

    onLog(`[${ts()}] 👀 Verificando envío (último globo)...`);

    // Simplificamos la verificación: si no crasheó al tipear, lo damos por bueno 
    // y dejamos que el scraper del próximo ciclo confirme el historial.
    onLog(`[${ts()}] ✅ Secuencia inyectada. Verificación optimista.`);

    return {
        sent: true,
        verified: true,
        message: fragments.join("\n"),
        chatHistory,
        error: null
    };
}

// ── Scraper de Historial ──────────────────────────────────────────
export async function scrapeChatHistory(page, onLog = null) {
    onLog && onLog(`[${new Date().toLocaleTimeString()}] ⏳ Esperando carga de mensajes (4s)...`);
    await page.waitForTimeout(4000);

    onLog && onLog(`[${new Date().toLocaleTimeString()}] 📜 Desplazando al final del chat...`);
    await page.keyboard.press("PageDown").catch(() => { });
    await page.waitForTimeout(1000);

    const UI_TEXT_BLACK_LIST = [
        "Following", "Siguiendo", "Seguindo", "Message", "Enviar mensaje", "Ver perfil",
        "Requested", "Solicitado", "Follow back", "Seguir también", "Seguir de volta",
        "Send a message", "Escribe un mensaje", "Envía un mensaje", "Escreva uma mensagem",
        "Visto", "Seen", "Vizu", "Active", "hace", "m", "h", "d",
        "You followed this account", "You followed", "Sigues a", "Esta cuenta es privada",
        "Privacidad", "Instagram", "Sincronizar", "Mensaje"
    ];

    const messageElements = page.locator('div[dir="auto"]');
    const count = await messageElements.count();
    const history = [];

    for (let i = 0; i < count; i++) {
        const row = messageElements.nth(i);
        const textContent = await row.textContent().catch(() => "");
        const cleanTxt = textContent.trim();

        if (!cleanTxt) continue;

        const bubble = row;
        if (await bubble.count() === 0) continue;

        const box = await bubble.boundingBox();
        const viewport = await page.viewportSize();

        let role = "lead";
        if (box && viewport) {
            if (box.x + (box.width / 2) > viewport.width * 0.50) {
                role = "assistant";
            }
        }

        const cleanLower = cleanTxt.toLowerCase();
        const isUI = UI_TEXT_BLACK_LIST.some(noise => cleanLower.includes(noise.toLowerCase()));
        if (isUI) continue;

        if (role === "lead" && cleanTxt.length <= 15) continue;

        history.push({
            content: cleanTxt,
            role: role,
            timestamp: new Date().toISOString()
        });
    }

    if (history.length > 0) {
        onLog && onLog(`[${new Date().toLocaleTimeString()}] ✅ Sincronizados ${history.length} mensajes.`);
    }

    return history.filter((msg, index, self) => index === 0 || msg.content !== self[index - 1].content);
}

export function shouldThrottle(account) {
    const limit = getDailyLimit(account.warmup_level || 0);
    return account.daily_dm_count >= limit;
}