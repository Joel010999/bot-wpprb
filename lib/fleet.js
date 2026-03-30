/**
 * Fleet Manager — Multi-Account Automation Engine
 * Manages bot accounts with isolated browser fingerprints and proxies
 * Session persistence via Playwright storageState (cookies + localStorage)
 */

// Completamente cloud-native (PostgreSQL session_data)

// ── Automation Guard ─────────────────────────────────────────────
// Consulta la DB para verificar si el bot tiene permiso de escribir

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
        return false; // En caso de error, permitir (fail-open)
    }
}

// ── Delays calibrados para simular 1-3 minutos por conversación ──
const TYPING_DELAY = () => Math.floor(Math.random() * 31) + 20;       // 20-50ms por tecla
const BETWEEN_WORDS_PAUSE = () => Math.floor(Math.random() * 151) + 100; // 100-250ms pausas entre palabras
const ACTION_DELAY = () => Math.floor(Math.random() * 15000) + 8000;    // 8-23s entre acciones
const READ_DELAY = () => Math.floor(Math.random() * 10000) + 5000;      // 5-15s "leyendo" mensajes

// ── Warm-up agresivo: 3 días para llegar a 70 DMs ──
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

        const args = db.isPostgres 
            ? [stateStr, cleanUsername, `@${cleanUsername}`]
            : [stateStr, cleanUsername, `@${cleanUsername}`];

        await db.execute({
            sql: sqlQuery,
            args: args
        });

        console.log(`[Fleet] Sesión guardada en DB para @${username}`);

        if (process.env.NODE_ENV !== 'production') {
            console.log("--------- COPIÁ DESDE ACÁ EL ADN ---------");
            console.log(stateStr);
            console.log("--------- HASTA ACÁ ---------");
            try {
                const fs = await import("fs");
                const path = await import("path");
                fs.writeFileSync(path.join(process.cwd(), "_COPIA_ESTE_ADN_.json"), stateStr);
                console.log("✅ Archivo _COPIA_ESTE_ADN_.json generado en la raíz del proyecto.");
            } catch(e) {}
        }

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
        console.error(`[Fleet] Error cargando sesión de @${username} desde DB:`, err);
        return null;
    }
}

// ── Fingerprint ──────────────────────────────────────────────────

export function generateFingerprint() {
    const screenRes = [
        [1920, 1080], [1366, 768], [1440, 900], [1536, 864], [2560, 1440],
    ];
    const platforms = ["Win32", "MacIntel", "Linux x86_64"];
    const languages = ["en-US", "en-GB", "es-ES", "es-AR", "pt-BR"];

    const res = screenRes[Math.floor(Math.random() * screenRes.length)];
    // Forzar español para consistencia en selectores de botones/labels
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

    // ── NOTA: No matamos Chrome/Edge genéricamente para no cerrar el browser personal de Joel.
    // ── Playwright maneja su propio Chromium; browser.close() lo cierra al finalizar.

    // ── LOG DE SISTEMA ──
    const isProduction = process.env.NODE_ENV === "production";
    const headlessMode = isProduction ? true : false;

    console.log(`🚀 [SISTEMA] Intentando abrir Chromium para @${account.username}...`);
    onLog(`[SISTEMA] 🚀 Intentando abrir Chromium para @${account.username}...`);

    if (headlessMode) {
        onLog("[SISTEMA] 🌑 Ejecutando en modo HEADLESS (sin ventana) por estar en producción");
    } else {
        onLog("[SISTEMA] 🖥️ Abriendo ventana de supervisión — headless: FALSE (visible)");
    }

    const browser = await chromium.launch({
        headless: headlessMode,
        args: [
            "--start-maximized",           // Ventana al frente y maximizada
            "--window-position=0,0",       // Posición top-left
            "--disable-blink-features=AutomationControlled", // Anti-detección
            "--no-first-run",
            "--no-default-browser-check",
            "--no-sandbox",                // Necesario para Railway/Linux
            "--disable-setuid-sandbox",    // Evitar bloqueos de permisos
        ],
        proxy: account.proxy_endpoint ? { server: account.proxy_endpoint } : undefined,
    });

    onLog("[SISTEMA] ✅ Chromium detectado y listo para login en Jujuy.");

    // Intentar cargar sesión previa (cookies, localStorage) de la DB
    const savedState = await loadSessionState(account.username);

    const contextOptions = {
        viewport: null, // null = usa el tamaño real de la ventana (maximizada)
        locale: fingerprint.language,
        userAgent: `Mozilla/5.0 (${fingerprint.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
        colorScheme: "dark",
        extraHTTPHeaders: {
            "Accept-Language": fingerprint.language,
        },
    };

    // Si hay sesión guardada en DB, inyectarla en el contexto
    if (savedState) {
        contextOptions.storageState = savedState;
        onLog(`[SISTEMA] 📂 Sesión previa cargada desde DB para @${account.username}`);
    } else {
        onLog(`[SISTEMA] ⚠️ Sin sesión previa para @${account.username} — login manual necesario`);
    }

    const context = await browser.newContext(contextOptions);

    // Inject fingerprint overrides
    await context.addInitScript((fp) => {
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => fp.hardwareConcurrency });
        Object.defineProperty(navigator, "deviceMemory", { get: () => fp.deviceMemory });
        Object.defineProperty(navigator, "platform", { get: () => fp.platform });
        Object.defineProperty(screen, "colorDepth", { get: () => fp.colorDepth });
    }, fingerprint);

    // ── VERIFICACIÓN DE LOGIN ────────────────────────────────────
    // Navegar a Instagram y verificar si la sesión es válida
    const verifyPage = await context.newPage();
    onLog("[SISTEMA] 🔍 Verificando sesión de Instagram...");

    await verifyPage.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
    });
    await verifyPage.waitForTimeout(3000);

    // Chequear si estamos logueados buscando indicadores de sesión activa
    let isLoggedIn = false;
    try {
        // Instagram logueado muestra: nav con links, svg de home, etc.
        const loggedInIndicators = [
            'svg[aria-label="Home"]',
            'svg[aria-label="Inicio"]',
            'a[href="/direct/inbox/"]',
            'svg[aria-label="New post"]',
            'svg[aria-label="Nueva publicación"]',
            'span[role="link"]',
        ];

        for (const sel of loggedInIndicators) {
            if (await verifyPage.locator(sel).first().count() > 0) {
                isLoggedIn = true;
                break;
            }
        }
    } catch { /* error checking, assume not logged in */ }

    if (isLoggedIn) {
        onLog("[SISTEMA] ✅ Sesión de Instagram activa — @" + account.username + " conectado");
        await verifyPage.close();
    } else {
        // ── MÓDULO DE LOGIN MANUAL ───────────────────────────────
        onLog("[SISTEMA] 🔐 LOGIN MANUAL NECESARIO — Joel, ingresá tus credenciales en la ventana de Chrome");
        onLog("[SISTEMA] ⏳ Esperando login manual (máximo 10 minutos para pasar seguridad)...");

        // Asegurar que estamos en la página de login
        const currentUrl = verifyPage.url();
        if (!currentUrl.includes("instagram.com")) {
            await verifyPage.goto("https://www.instagram.com/accounts/login/", {
                waitUntil: "domcontentloaded",
                timeout: 15000,
            });
        }

        // Esperar hasta 10 minutos chequeando cada 10 segundos
        const MAX_LOGIN_WAIT = 10 * 60 * 1000; // 10 minutos
        const CHECK_INTERVAL = 10 * 1000;      // 10 segundos
        const startTime = Date.now();
        let loginDetected = false;

        while (Date.now() - startTime < MAX_LOGIN_WAIT) {
            await verifyPage.waitForTimeout(CHECK_INTERVAL);

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const remaining = Math.round((MAX_LOGIN_WAIT - (Date.now() - startTime)) / 1000);

            try {
                // Verificar indicadores de login exitoso
                const homeIcon = verifyPage.locator(
                    'svg[aria-label="Home"], svg[aria-label="Inicio"], a[href="/direct/inbox/"]'
                ).first();

                if (await homeIcon.count() > 0) {
                    loginDetected = true;
                    break;
                }
            } catch { /* seguir esperando */ }

            const remMin = Math.floor(remaining / 60);
            const remSec = remaining % 60;
            onLog(`[SISTEMA] ⏳ Esperando login... ${remMin}m ${remSec}s restantes`);
        }

        if (loginDetected) {
            onLog("[SISTEMA] ✅ Login detectado — guardando sesión...");
            await saveSession(account.username, context);
            onLog("[SISTEMA] 💾 Sesión guardada para futuras ejecuciones");
        } else {
            onLog("[SISTEMA] ❌ Timeout de login — cerrando browser");
            await browser.close();
            throw new Error("Login manual no completado en 10 minutos");
        }

        await verifyPage.close();
    }

    // Auto-guardar sesión al cerrar el contexto
    context.on("close", async () => {
        await saveSession(account.username, context).catch(() => { });
    });

    // ── FORZAR GUARDADO ACTIVO AHORA MISMO ──
    try {
        await saveSession(account.username, context);
        onLog("[SISTEMA] 💾 Sesión re-verificada y escrita en disco/DB.");
    } catch(e) {
        console.error("[SISTEMA ERROR] Fallo en forzado de guardado:", e);
    }

    return { browser, context, fingerprint, loginConfirmed: true };
}

// ── Human Simulation ─────────────────────────────────────────────

export async function humanTypeMessage(page, selector, message) {
    // Simular que "clickea" en el campo con delay humano
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
    await page.click(selector);
    await page.waitForTimeout(Math.floor(Math.random() * 800) + 300);

    const words = message.split(" ");

    for (let w = 0; w < words.length; w++) {
        const word = words[w];
        // Escribir cada caracter de la palabra
        for (const char of word) {
            await page.keyboard.type(char, { delay: TYPING_DELAY() });
        }

        // Agregar espacio si no es la última palabra
        if (w < words.length - 1) {
            await page.keyboard.type(" ", { delay: TYPING_DELAY() });
        }

        // Pausa entre palabras/frases (simula pensar)
        if (Math.random() < 0.15) {
            await page.waitForTimeout(BETWEEN_WORDS_PAUSE());
        }

        // Pausa larga ocasional (simula re-leer lo escrito)
        if (Math.random() < 0.03) {
            await page.waitForTimeout(Math.floor(Math.random() * 4000) + 2000);
        }
    }

    // Pausa antes de enviar (re-lee el mensaje)
    await page.waitForTimeout(Math.floor(Math.random() * 3000) + 1500);
}

export async function simulateHumanBehavior(page) {
    // Simular lectura inicial del perfil/chat
    await page.waitForTimeout(READ_DELAY());

    // Random scrolls
    const scrolls = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < scrolls; i++) {
        await page.evaluate(() => {
            window.scrollBy(0, Math.floor(Math.random() * 500) + 100);
        });
        await page.waitForTimeout(ACTION_DELAY());
    }

    // Random mouse movements (más lentos y naturales)
    const movements = Math.floor(Math.random() * 5) + 2;
    for (let i = 0; i < movements; i++) {
        await page.mouse.move(
            Math.floor(Math.random() * 800) + 100,
            Math.floor(Math.random() * 600) + 100,
            { steps: Math.floor(Math.random() * 20) + 10 }
        );
        await page.waitForTimeout(Math.floor(Math.random() * 2000) + 800);
    }

    // Pausa final de "procesamiento"
    await page.waitForTimeout(Math.floor(Math.random() * 5000) + 3000);
}

// ── Human Social Engagement Protocol — Modo Perro de Presa ───────
// closeModals → Follow → Like (3 reintentos + force) → Espera → DM

async function closeModals(page, onLog, ts) {
    // Cerrar cualquier popup de Instagram que bloquee la interacción
    const dismissTexts = [
        "Not Now", "Ahora no", "Not now",
        "Save Info", "Guardar información",
        "Cancel", "Cancelar",
        "Turn On", "Activar",  // notificaciones — queremos cerrar con "Not Now"
    ];

    const dismissSelectors = [
        // Botones con texto de dismiss
        ...dismissTexts.map(t => `button:has-text("${t}")`),
        // Botones de cierre genéricos
        'div[role="dialog"] button:has-text("Not Now")',
        'div[role="dialog"] button:has-text("Ahora no")',
        // Overlay de cookies / login walls
        'button[class*="dismiss"]',
    ];

    for (const sel of dismissSelectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0 && await btn.isVisible()) {
                await btn.click({ force: true });
                await page.waitForTimeout(800);
                onLog(`[${ts()}] 🧹 Popup cerrado: "${sel.replace(/button:has-text\("(.+?)"\)/, '$1')}"`);
            }
        } catch { /* no existe, seguir */ }
    }
}

export async function humanSocialEngagement(page, targetHandle, onLog = () => { }) {
    const ts = () => new Date().toLocaleTimeString("es-AR", { hour12: false });
    const startTime = Date.now();

    // ── Paso 0: NAVEGACIÓN ───────────────────────────────────────
    onLog(`[${ts()}] 🌐 Navegando al perfil de @${targetHandle}...`);
    await page.goto(`https://www.instagram.com/${targetHandle}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await closeModals(page, onLog, ts);

    // ── Paso 1: FOLLOW ──
    try {
        const followBtn = page.locator('button:has-text("Seguir"), button:has-text("Follow")').first();
        if (await followBtn.count() > 0) {
            await followBtn.click({ timeout: 5000 }).catch(() => { });
            onLog(`[${ts()}] ✅ Click en Seguir realizado.`);
        }
    } catch (e) { /* Ya seguido o error silencioso */ }

    // ── Paso 2: LIKE ÚLTIMO REEL/POST ──
    try {
        // Intentar ir a Reels primero para calentar
        await page.goto(`https://www.instagram.com/${targetHandle}/reels/`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(2000);

        let postLink = page.locator('a[href*="/reel/"], a[href*="/p/"]').first();
        if (await postLink.count() === 0) {
            // Fallback al perfil principal si no hay reels
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
            await closeSingleModal(page).catch(() => { });
        }
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Error en interacción de engagement: ${e.message}`);
    }

    // Asegurar 3 segundos totales de interacción
    const elapsed = Date.now() - startTime;
    const remaining = 3000 - elapsed;
    if (remaining > 0) {
        onLog(`[${ts()}] ⏳ Manteniendo interacción (${Math.round(remaining / 1000)}s restantes)...`);
        await page.waitForTimeout(remaining);
    }

    onLog(`[${ts()}] ✅ Protocolo de Engagement de 3s completado.`);
    return { followed: true, liked: true, blocked: false };
}

// Helper: cerrar un modal/dialog individual
async function closeSingleModal(page) {
    try {
        const closeBtn = page.locator([
            'svg[aria-label="Close"]',
            'svg[aria-label="Cerrar"]',
            'svg[aria-label="Fechar"]',
            'div[role="dialog"] button[aria-label="Close"]',
            'div[role="dialog"] button[aria-label="Cerrar"]',
            'button:has-text("Ahora no")',
            'button:has-text("Not Now")',
            'button:has-text("Agora não")',
            'button:has-text("Not now")'
        ].join(', ')).first();

        if (await closeBtn.count() > 0) {
            await closeBtn.click({ force: true });
            await page.waitForTimeout(800);
        }
    } catch { /* modal ya cerrado */ }
}

// ── Enviar y Verificar DM ────────────────────────────────────────
// Navega al DM del lead, escribe el mensaje, y verifica que apareció

export async function sendAndVerifyDM(page, targetHandle, messageOrData, onLog = () => { }) {
    const ts = () => new Date().toLocaleTimeString("es-AR", { hour12: false });

    // Determinar si recibimos un string (legacy) u objeto con data y config
    let leadBio = "Sin bio";
    let config = {};
    let fallbackMessage = null;

    if (typeof messageOrData === 'string') {
        fallbackMessage = messageOrData;
    } else if (messageOrData && typeof messageOrData === 'object') {
        leadBio = messageOrData.bio || "Sin bio";
        config = messageOrData.config || {};
        fallbackMessage = messageOrData.message || "Hola! Cómo estás? Te escribo porque vi tu perfil y me pareció súper interesante lo que hacés.";
    }

    if (!fallbackMessage) {
        fallbackMessage = "Hola! Cómo estás? Te escribo porque vi tu perfil y me pareció muy bueno tu contenido.";
    }

    onLog(`[${ts()}] 💬 Iniciando proceso de DM para @${targetHandle}...`);

    // ── PASO 0: ENGAGEMENT PREVIO (Follow + Like) antes de tocar el chat ──
    onLog(`[${ts()}] 🌐 Navegando al perfil de @${targetHandle} para engagement previo...`);
    await page.goto(`https://www.instagram.com/${targetHandle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeModals(page, onLog, ts);

    onLog(`[${ts()}] 🔄 Ejecutando Protocolo de Engagement (Follow + Like) antes del DM...`);
    const engagement = await humanSocialEngagement(page, targetHandle, onLog);

    if (engagement.blocked) {
        onLog(`[${ts()}] 🚨 Abortando DM por fallo en el Engagement Social (Like obligatorio).`);
        return { sent: false, verified: false, error: "Bloqueo en Engagement" };
    }

    // Pausa humana de 3s post-engagement antes de buscar el botón de mensaje (Solicitud User)
    onLog(`[${ts()}] ⏱️ Pausa humana 3s post-engagement antes de ir al Mensaje...`);
    await page.waitForTimeout(3000);

    // ── PASO 1: BUSCAR Y CLICKEAR BOTÓN DE MENSAJE ──
    onLog(`[${ts()}] 🌐 Buscando botón de Mensaje en el perfil...`);
    const msgBtn = page.locator([
        'div[role="button"]:has-text("Message")',
        'button:has-text("Message")',
        'div[role="button"]:has-text("Mensaje")',
        'button:has-text("Mensaje")',
        'div[role="button"]:has-text("Enviar mensaje")',
        'div[role="button"]:has-text("Enviar mensagem")',
        'div[role="button"][aria-label*="Message"]',
        'div[role="button"][aria-label*="mensaje"]',
        'div[role="button"][aria-label*="mensagem"]',
        'a[href*="/direct/t/"]'
    ].join(', ')).first();

    let chatOpened = false;

    try {
        // Esperamos hasta 10s para que cargue el botón
        await msgBtn.waitFor({ state: 'visible', timeout: 10000 });
        await msgBtn.click({ force: true });
        chatOpened = true;
        onLog(`[${ts()}] ✅ Botón de Mensaje clickeado. Esperando input...`);
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Botón de Mensaje no detectado en 10s (Selector falló o no cargó).`);
    }

    // Selectores universales de input de chat
    const INPUT_SELECTORS = [
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="mensaje"]',
        'textarea[placeholder*="Escribe"]',
        'textarea[placeholder*="Escreva"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[aria-label*="Message"]',
        'div[aria-label*="mensaje"]'
    ].join(', ');

    let messageInput = page.locator(INPUT_SELECTORS).first();

    // Intentar encontrar el input (ya sea por el botón o direct navigation)
    let inputFound = false;

    // Limpieza de Popups Crítica antes de buscar el input
    await closeModals(page, onLog, ts);

    try {
        await messageInput.waitFor({ state: 'visible', timeout: 15000 });
        inputFound = true;
    } catch (e) {
        onLog(`[${ts()}] ⏳ Input no detectado tras click (15s). Intentando reload y re-click en botón de mensaje...`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(5000);
        await closeModals(page, onLog, ts);

        // Volver a buscar el botón de mensaje
        try {
            await msgBtn.waitFor({ state: 'visible', timeout: 10000 });
            await msgBtn.click({ force: true });
            onLog(`[${ts()}] ✅ Botón de Mensaje re-clickeado.`);
            await closeModals(page, onLog, ts);
            messageInput = page.locator(INPUT_SELECTORS).first();
            await messageInput.waitFor({ state: 'visible', timeout: 8000 });
            inputFound = true;
        } catch (e2) {
            onLog(`[${ts()}] ⚠️ Falló reload o re-click. Intentando navegación directa cruzada...`);
            const directUrl = `https://www.instagram.com/direct/t/${targetHandle}/`;
            await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(5000);

            // Detectar si caímos en la página de "Se ha producido un error"
            const errorPageBtn = page.locator('button:has-text("Volver a cargar"), button:has-text("Reload"), button:has-text("Recarregar")').first();
            if (await errorPageBtn.isVisible()) {
                onLog(`[${ts()}] ⚠️ Instagram reportó "Se ha producido un error". Reintentando carga...`);
                await errorPageBtn.click().catch(() => page.reload());
                await page.waitForTimeout(6000);
            }

            await closeModals(page, onLog, ts);

            messageInput = page.locator(INPUT_SELECTORS).first();
            try {
                await messageInput.waitFor({ state: 'visible', timeout: 6000 });
                inputFound = true;
            } catch (e3) {
                onLog(`[${ts()}] ⚠️ Advertencia: Campo de texto no detectado. Scrapeando historial igual...`);
            }
        }
    }

    // 2. Sincronizar Historial Completo y Detectar Roles
    onLog(`[${ts()}] 🕵️ Sincronizando historial de chat...`);
    const chatHistory = await scrapeChatHistory(page, onLog);

    // Si estamos en modo Sync, devolvemos éxito si hubo mensajes o si al menos llegamos a la página
    if (messageOrData?.bypassSend) {
        onLog(`[${ts()}] ℹ️ Modo Sync: Historial capturado (${chatHistory.length} msgs).`);
        return { sent: true, verified: true, chatHistory, error: null };
    }

    // Fallback de Emergencia si todo lo anterior falló (Tab o reload final)
    if (!inputFound) {
        onLog(`[${ts()}] 🆘 Fallback de Emergencia: Presionando Tab y recargando página como último recurso...`);
        for (let t = 0; t < 3; t++) {
            await page.keyboard.press("Tab");
            await page.waitForTimeout(500);
        }
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(5000);
        await closeModals(page, onLog, ts);

        messageInput = page.locator(INPUT_SELECTORS).first();
        try {
            await messageInput.waitFor({ state: 'visible', timeout: 5000 });
            inputFound = true;
            onLog(`[${ts()}] ✅ Input rescatado por Fallback de Emergencia!`);
        } catch (e) {
            onLog(`[${ts()}] ❌ Fallback de Emergencia falló.`);
        }
    }

    // Si NO estamos en modo Sync y no hay input, ahí sí es un fallo crítico
    if (!inputFound) {
        onLog(`[${ts()}] ❌ Fallo crítico definitivo: Input de chat no encontrado.`);
        await page.screenshot({ path: "debug_chat_fail.png" }).catch(() => { });
        return { sent: false, verified: false, error: "Campo de texto no encontrado" };
    }

    onLog(`[${ts()}] 📨 Chat cargado y listo.`);

    let lastLeadMessage = "";

    const leadMessages = chatHistory.filter(m => m.role === 'lead');
    const assistantMessages = chatHistory.filter(m => m.role === 'assistant');

    // Solo abortamos si el bot (assistant) ya habló, o si el lead nos escribió algo genuino
    let shouldAbort = false;
    if (assistantMessages.length > 0) {
        shouldAbort = true;
        onLog(`[${ts()}] 🛑 DOBLE CAPA ANTI-SPAM: El bot ya envió mensajes previos a este lead.`);
    } else if (leadMessages.length > 0) {
        shouldAbort = true;
        onLog(`[${ts()}] 🛑 DOBLE CAPA ANTI-SPAM: El lead ha enviado mensajes previos.`);
    }

    if (shouldAbort) {
        onLog(`[${ts()}] 🛑 Abortando envío de script y marcando como exitoso para evitar SPAM.`);
        return { sent: true, verified: true, chatHistory, error: null, skipped: true };
    }

    if (leadMessages.length > 0) {
        lastLeadMessage = leadMessages[leadMessages.length - 1].content;
    }

    // 3. Preparar Script Fragmentado
    const fragments = [
        "Hola como estas",
        "Una consulta rapida",
        "Te contacto desde RenderByte porque actualmente estamos seleccionando 40 negocios este mes para participar en una iniciativa estrategica de medicion de metricas y resultados reales",
        "Estamos priorizando especialmente negocios que ya estan operando activamente y buscan mejorar su posicionamiento digital para escalar su captacion de clientes",
        "Este proyecto forma parte del desarrollo de un nuevo producto que lanzaremos mas adelante",
        "Te gustaria que te explique brevemente como funciona el proceso?"
    ];

    // Función de limpieza de estilo estricta
    const cleanStyle = (txt) => txt.replace(/[¿.\-]/g, "").trim();

    onLog(`[${ts()}] 📨 Enviando script fragmentado (6 mensajes)...`);

    // Foco Forzado antes del primer fragmento
    try {
        await messageInput.scrollIntoViewIfNeeded().catch(() => { });
        await messageInput.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(1000); // Asegurar que el cursor esté parpadeando
    } catch (e) {
        onLog(`[${ts()}] ⚠️ Falló foco forzado inicial en chat input: ${e.message}`);
    }

    for (let i = 0; i < fragments.length; i++) {
        const rawMsg = fragments[i];
        const msgToSend = cleanStyle(rawMsg);

        onLog(`[${ts()}] ⌨️ Escribiendo fragmento ${i + 1}/${fragments.length}...`);

        try {
            await messageInput.scrollIntoViewIfNeeded().catch(() => { });
            await messageInput.click({ force: true, timeout: 3000 });
        } catch (err) {
            onLog(`[${ts()}] ⚠️ Click falló en fragmento ${i + 1}, intentando tipear ciegamente...`);
        }
        await page.waitForTimeout(500);

        // Escribir mensaje con delay humano
        for (const char of msgToSend) {
            await page.keyboard.type(char, { delay: TYPING_DELAY() });
        }

        // Pausa de 800ms para el Enter
        await page.waitForTimeout(800);

        await page.keyboard.press("Enter");

        // Pequeña pausa adicional si NO es el último mensaje para asegurar separación de globitos
        if (i < fragments.length - 1) {
            await page.waitForTimeout(500);
        }
    }

    onLog(`[${ts()}] 👀 Verificando envío (último globo)...`);
    const lastMsgFragment = fragments[fragments.length - 1];
    const verificationText = cleanStyle(lastMsgFragment).substring(0, 30);
    let verified = false;

    try {
        await page.waitForTimeout(3000);
        const sentMessage = page.locator(`div:has-text("${verificationText.replace(/"/g, '\\"')}")`).last();
        if (await sentMessage.count() > 0 && await sentMessage.isVisible()) {
            verified = true;
            onLog(`[${ts()}] ✅ Verificación Exitosa.`);
        } else {
            onLog(`[${ts()}] ⚠️ Verificación Fallida del último mensaje.`);
        }
    } catch {
        onLog(`[${ts()}] ⚠️ Error en la inspección del DOM.`);
    }

    return {
        sent: verified,
        verified,
        message: fragments.join("\n"),
        chatHistory,
        error: verified ? null : "Verificación de envío fallida"
    };
}

// ── Scraper de Historial ──────────────────────────────────────────
export async function scrapeChatHistory(page, onLog = null) {
    // Esperar a que los mensajes carguen (Instagram es lento)
    onLog && onLog(`[${new Date().toLocaleTimeString()}] ⏳ Esperando carga de mensajes (4s)...`);
    await page.waitForTimeout(4000);

    // Asegurar que estamos al final del chat para ver lo último
    onLog && onLog(`[${new Date().toLocaleTimeString()}] 📜 Desplazando al final del chat...`);
    await page.keyboard.press("PageDown").catch(() => { });
    await page.waitForTimeout(1000);
    // Instagram usa flex-direction: column; para los mensajes.
    // Los mensajes del "yo" (bot) suelen tener align-items: flex-end o estar a la derecha.
    // Los mensajes del lead están a la izquierda.

    const UI_TEXT_BLACK_LIST = [
        "Following", "Siguiendo", "Seguindo", "Message", "Enviar mensaje", "Ver perfil",
        "Requested", "Solicitado", "Follow back", "Seguir también", "Seguir de volta",
        "Send a message", "Escribe un mensaje", "Envía un mensaje", "Escreva uma mensagem",
        "Visto", "Seen", "Vizu", "Active", "hace", "m", "h", "d",
        "You followed this account", "You followed", "Sigues a", "Esta cuenta es privada",
        "Privacidad", "Instagram", "Sincronizar", "Mensaje"
    ];

    // Intentar encontrar burbujas de texto dir="auto"
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

        // Detección de Rol por Posición (X-coordinate)
        const box = await bubble.boundingBox();
        const viewport = await page.viewportSize();

        let role = "lead"; // Default izquierda
        if (box && viewport) {
            // El bot/human suele estar a la derecha (> 50% del ancho de la pantalla)
            if (box.x + (box.width / 2) > viewport.width * 0.50) {
                role = "assistant";
            }
        }

        // Filtro de ruido robusto comparando en lowerCase
        const cleanLower = cleanTxt.toLowerCase();
        const isUI = UI_TEXT_BLACK_LIST.some(noise => cleanLower.includes(noise.toLowerCase()));
        if (isUI) continue;

        // Doble capa inteligente:
        // Ignorar mensajes cortos (<= 15 caracteres) a menos que sean del bot
        if (role === "lead" && cleanTxt.length <= 15) {
            continue;
        }

        history.push({
            content: cleanTxt,
            role: role,
            timestamp: new Date().toISOString()
        });
    }

    if (history.length === 0) {
        onLog && onLog(`[${new Date().toLocaleTimeString()}] 🚨 No se capturaron mensajes. Tomando screenshot...`);
        await page.screenshot({ path: "debug_sync_fail.png" }).catch(() => { });
    } else {
        onLog && onLog(`[${new Date().toLocaleTimeString()}] ✅ Sincronizados ${history.length} mensajes.`);
    }

    // Filtrar duplicados seguidos (a veces IG repite el DOM)
    return history.filter((msg, index, self) =>
        index === 0 || msg.content !== self[index - 1].content
    );
}

export function shouldThrottle(account) {
    const limit = getDailyLimit(account.warmup_level || 0);
    return account.daily_dm_count >= limit;
}
