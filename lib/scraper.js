/**
 * Stealth Scraper Module — Real Implementation
 * Uses authenticated bot sessions (fleet.js) to extract followers from Instagram
 * Includes human-like delays for anti-detection (optimizado para Jujuy)
 */

// ── Delays Humanos Anti-Detección ──
const SCROLL_DELAY = () => Math.floor(Math.random() * 3000) + 2000;     // 2-5s entre scrolls
const PROFILE_VISIT_DELAY = () => Math.floor(Math.random() * 7000) + 5000; // 5-12s entre visitas a perfil
const BATCH_PAUSE = () => Math.floor(Math.random() * 30000) + 30000;     // 30-60s cada 10 leads
const AFTER_CLICK_DELAY = () => Math.floor(Math.random() * 3000) + 2000; // 2-5s después de click

// ── Filtros ──
export function parseFilters(filtersJson) {
    try {
        const filters = typeof filtersJson === "string" ? JSON.parse(filtersJson) : filtersJson;
        return {
            minFollowers: filters.minFollowers || 0,
            maxFollowers: filters.maxFollowers || Infinity,
            bioKeywords: filters.bioKeywords || [],
            nicheKeywords: filters.nicheKeywords || [],
            language: filters.language || null,
        };
    } catch {
        return { minFollowers: 0, maxFollowers: Infinity, bioKeywords: [], nicheKeywords: [], language: null };
    }
}

export function matchesFilters(profile, filters) {
    if (filters.nicheKeywords && filters.nicheKeywords.length > 0) {
        const bioLower = (profile.biography || "").toLowerCase();
        const hasNicheKw = filters.nicheKeywords.some((kw) =>
            bioLower.includes(kw.toLowerCase())
        );
        if (!hasNicheKw) return false;
    }

    if (filters.bioKeywords && filters.bioKeywords.length > 0) {
        const bioLower = (profile.biography || "").toLowerCase();
        const hasKeyword = filters.bioKeywords.some((kw) =>
            bioLower.includes(kw.toLowerCase())
        );
        if (!hasKeyword) return false;
    }

    return true;
}

/**
 * Scrape followers de una cuenta de Instagram usando una sesión autenticada del bot.
 * 
 * @param {Object} page - Playwright page ya logueada en IG
 * @param {string} targetAccount - Username de la cuenta objetivo (ej: "cocinemosrico")
 * @param {Object} options - { maxLeads, campaignId, nicheKeywords, onLog }
 * @returns {Array} Array de prospectos extraídos [{username, full_name, biography}]
 */
export async function scrapeFollowersFromPage(page, targetAccount, options = {}) {
    const maxLeads = options.maxLeads || 20;
    const rawLimit = maxLeads * 4; // MARGEN: Extraemos 4 veces más por si hay repetidos
    const nicheKeywords = options.nicheKeywords || [];
    const searchKeyword = options.searchKeyword || "";
    const onLog = options.onLog || console.log;
    const campaignId = options.campaignId || null;
    const ownerUser = options.ownerUser || null;

    const target = targetAccount.replace(/^@/, "").trim().toLowerCase();
    const leads = [];
    const seenUsernames = new Set();

    onLog(`[SCRAPER] 🔍 Navegando al perfil de @${target}...`);

    try {
        // 1. Navegar al perfil objetivo
        await page.goto(`https://www.instagram.com/${target}/`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(AFTER_CLICK_DELAY());

        // Verificar que el perfil existe y no es privado
        const pageContent = await page.textContent("body");
        if (pageContent.includes("Sorry, this page") || pageContent.includes("Esta página no está disponible")) {
            onLog(`[SCRAPER] ❌ Perfil @${target} no existe o fue eliminado.`);
            return leads;
        }

        // 2. Click en el link de "seguidores"
        onLog(`[SCRAPER] 📋 Abriendo lista de seguidores de @${target}...`);

        const followersLink = page.locator([
            `a[href="/${target}/followers/"]`,
            'a[href*="/followers"]',
            'button:has-text("Seguidores")',
            'button:has-text("Followers")',
            'span:has-text("seguidores")',
            'span:has-text("followers")',
            'a:has-text("seguidores")',
            'a:has-text("followers")'
        ].join(', ')).first();

        if (await followersLink.count() > 0) {
            await followersLink.click();
        } else {
            onLog(`[SCRAPER] ❌ No se encontró el link de seguidores. Cuenta posiblemente privada.`);
            return leads;
        }

        await page.waitForTimeout(AFTER_CLICK_DELAY());

        // 3. Esperar que el modal de seguidores aparezca
        onLog(`[SCRAPER] 📊 Modal de seguidores abierto. Comenzando extracción...`);

        // El modal de seguidores en IG tiene un contenedor scrollable
        // Detección Dinámica del Contenedor de Scroll
        onLog(`[SCRAPER] 🔍 Detectando contenedor de scroll dinámicamente...`);

        // Esperar a que el modal esté cargado verificando que exista al menos un link de usuario
        try {
            await page.locator('div[role="dialog"] a[role="link"]').first().waitFor({ state: 'visible', timeout: 7000 });
        } catch (e) {
            onLog(`[SCRAPER] ⚠️ Advertencia: No se detectaron perfiles en el modal tras 7s.`);
        }

        const scrollContainer = await page.evaluateHandle(() => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return null;
            // Buscamos el div que tenga el contenido real (el que tiene más altura y sea scrollable)
            const divs = Array.from(dialog.querySelectorAll('div'));
            return divs.find(el => {
                const style = window.getComputedStyle(el);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            }) || divs.find(el => el.classList.contains('_aano')); // Fallback a la clase vieja
        });

        const isNull = await scrollContainer.evaluate(el => el === null);

        if (isNull) {
            onLog(`[SCRAPER] ❌ No se pudo localizar el contenedor de scroll dinámicamente.`);
            // Debug logging exigido por Joel
            const debugInfo = await page.evaluate(() => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return "No dialog found";
                return Array.from(dialog.querySelectorAll('div')).map(d => ({
                    classes: d.className,
                    id: d.id,
                    scrollHeight: d.scrollHeight,
                    clientHeight: d.clientHeight,
                    overflowY: window.getComputedStyle(d).overflowY
                })).filter(d => d.classes || d.id);
            });
            onLog(`[DEBUG] Estructura de divs en dialog: ${JSON.stringify(debugInfo, null, 2)}`);
            return leads;
        }

        // 4.5 — Filtro por Keyword: usar la lupita de búsqueda del modal
        if (searchKeyword && searchKeyword.trim().length > 0) {
            const kw = searchKeyword.trim();
            onLog(`[SCRAPER] 🔍 Buscando keyword "${kw}" en la lupita del modal...`);

            const searchInputSelectors = [
                'div[role="dialog"] input[placeholder*="Pesquisar"]',
                'div[role="dialog"] input[placeholder*="Search"]',
                'div[role="dialog"] input[placeholder*="Buscar"]',
                'div[role="dialog"] input[type="text"]',
            ];

            let searchInput = null;
            for (const sel of searchInputSelectors) {
                const el = page.locator(sel).first();
                if (await el.count() > 0) {
                    searchInput = el;
                    onLog(`[SCRAPER] ✅ Lupita encontrada con selector: ${sel}`);
                    break;
                }
            }

            if (searchInput) {
                await searchInput.click();
                await page.waitForTimeout(500);
                // Escribir keyword con delay humano
                for (const char of kw) {
                    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 120) + 60 });
                }
                // Esperar 3-4 segundos para que Instagram filtre la lista
                const filterWait = Math.floor(Math.random() * 1000) + 3000;
                onLog(`[SCRAPER] ⏳ Esperando ${filterWait}ms para que Instagram filtre...`);
                await page.waitForTimeout(filterWait);
                onLog(`[SCRAPER] ✅ Lista filtrada por "${kw}". Comenzando scraping sobre resultados.`);
            } else {
                onLog(`[SCRAPER] ⚠️ Lupita de búsqueda no encontrada — scrapeando sin filtro de keyword.`);
            }
        }

        // 4. Bucle de scroll y extracción de usernames
        let scrollAttempts = 0;
        const maxScrollAttempts = 80; // Más paciencia para keywords
        let noNewLeadsCount = 0;

        // Le cambiamos el texto al log para que nos avise bien qué está haciendo
        onLog(`[SCRAPER] 🔄 Iniciando recolección de handles (Objetivo Crudo: ${rawLimit} para asegurar ${maxLeads} limpios)...`);

        const UI_TEXT_BLACK_LIST = [
            "Following", "Siguiendo", "Seguindo", "Follow", "Seguir", "Requested", "Solicitado",
            "Message", "Mensaje", "Verified", "Verificado"
        ];

        while (leads.length < rawLimit && scrollAttempts < maxScrollAttempts) {
            // Extraer usernames con selectores robustos
            const usernameElements = await page.locator([
                'div[role="dialog"] a[role="link"] span',
                'div[role="dialog"] span[dir="auto"] a',
                'div[role="row"] a[role="link"]'
            ].join(', ')).all();

            for (const el of usernameElements) {
                // ACÁ ESTABA EL ERROR: Decía maxLeads en vez de rawLimit
                if (leads.length >= rawLimit) break;

                try {
                    const text = await el.textContent();
                    const username = text?.replace(/^@/, "").trim().toLowerCase();

                    // Validar que sea un username válido
                    if (!username || username.length < 2 || username === target || seenUsernames.has(username)) {
                        continue;
                    }

                    // Ignorar textos de la UI o nombres con espacios
                    if (username.includes(" ") || UI_TEXT_BLACK_LIST.some(b => username.includes(b.toLowerCase()))) continue;

                    seenUsernames.add(username);
                    leads.push({
                        username,
                        full_name: "",
                        biography: "",
                        needsProfileVisit: true,
                    });

                    if (leads.length % 10 === 0) {
                        onLog(`[SCRAPER] 📝 Recopilados ${leads.length} handles...`);
                    }

                } catch { /* DOM changed */ }
            }

            const prevCount = leads.length;

            // Obtener altura ANTES del scroll para verificar si cambia
            const prevHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

            if (process.env.NODE_ENV === "production") {
                onLog(`[SCRAPER] ⚙️ MODO RAILWAY: Scroll progresivo agresivo para forzar carga...`);
                // Scroll progresivo forzado para Railway
                for (let s = 0; s < 3; s++) {
                    await page.mouse.wheel(0, 500);
                    await page.waitForTimeout(2000); // 2s de pausa por mini-scroll
                }
            }

            // Scroll al final del contenedor
            await scrollContainer.evaluate((el) => {
                el.scrollTo(0, el.scrollHeight);
            });

            // Verificación de Carga: espera de 4 segundos técnica "Jujuy"
            onLog(`[SCRAPER] ⏳ Esperando 4s carga de DOM...`);

            try {
                const spinnerLocator = page.locator('svg[aria-label="Cargando..."], svg[aria-label="Loading..."], div[role="progressbar"]');
                if (await spinnerLocator.count() > 0) {
                    await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 5000 });
                } else {
                    await page.waitForTimeout(4000);
                }
            } catch (e) {
                await page.waitForTimeout(4000);
            }

            scrollAttempts++;

            // Obtener altura DESPUÉS del scroll
            const newHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

            // Detectar si la ALTURA no cambió
            if (newHeight === prevHeight) {
                noNewLeadsCount++;
                const maxIntentos = searchKeyword ? 6 : 3;
                onLog(`[SCRAPER] ⚠️ Sin prospectos nuevos (Intento ${noNewLeadsCount}/${maxIntentos})`);

                if (noNewLeadsCount >= maxIntentos) {
                    onLog(`[SCRAPER] 🛑 Deteniendo scroll: ${maxIntentos} intentos sin nuevos prospectos.`);
                    break;
                }
            } else {
                noNewLeadsCount = 0;
            }

            if (scrollAttempts % 5 === 0) {
                onLog(`[SCRAPER] 🔄 Scroll ${scrollAttempts} — ${leads.length} handles encontrados.`);
            }
        }

        onLog(`[SCRAPER] ✅ Recolección terminada: ${leads.length} handles encontrados en ${scrollAttempts} scrolls.`);

        // 5. Cerrar el modal de seguidores
        try {
            const closeBtn = page.locator('div[role="dialog"] button svg[aria-label="Close"], div[role="dialog"] button svg[aria-label="Cerrar"]').first();
            if (await closeBtn.count() > 0) {
                await closeBtn.click();
                await page.waitForTimeout(1000);
            } else {
                await page.keyboard.press("Escape");
                await page.waitForTimeout(1000);
            }
        } catch { /* modal ya cerrado */ }

        // 6. Visitar perfiles individuales para extraer bio (solo los que necesitan)
        onLog(`[SCRAPER] 🔎 Visitando perfiles para extraer bios (${leads.length} leads)...`);

        const { getDb } = await import("@/lib/db");
        const db = await getDb();

        const enrichedLeads = [];

        for (let i = 0; i < leads.length; i++) {
            // FRENO DE MANO: Si ya conseguimos los necesarios, cortamos la visita.
            if (enrichedLeads.length >= maxLeads) {
                onLog(`[SCRAPER] 🎯 Cuota completada: ${maxLeads} leads nuevos y calificados. Deteniendo análisis de bios.`);
                break;
            }
            const lead = leads[i];

            // Verificar si ya fue contactado antes
            try {
                const existsRes = await db.execute({
                    sql: "SELECT id, status FROM prospects WHERE username = ?",
                    args: [lead.username]
                });
                if (existsRes.rows.length > 0 && existsRes.rows[0].status !== 'listo') {
                    onLog(`[SCRAPER] ⏭️ @${lead.username} ya existe (${existsRes.rows[0].status}). Skip.`);
                    continue;
                }
            } catch { /* tabla no existe todavía, continuar */ }

            // Visitar perfil
            try {
                await page.goto(`https://www.instagram.com/${lead.username}/`, {
                    waitUntil: "domcontentloaded",
                    timeout: 20000,
                });
                await page.waitForTimeout(PROFILE_VISIT_DELAY());

                // Extraer bio
                const bioSection = page.locator('meta[name="description"]');
                let bioText = "";
                if (await bioSection.count() > 0) {
                    bioText = await bioSection.getAttribute("content") || "";
                }

                // Extraer nombre completo (suele estar en el header del perfil)
                let fullName = "";
                try {
                    const nameEl = page.locator('header section span[dir="auto"]').first();
                    if (await nameEl.count() > 0) {
                        fullName = await nameEl.textContent() || "";
                    }
                } catch { /* no encontrado */ }

                lead.full_name = fullName.trim();
                lead.biography = bioText.trim();
                lead.needsProfileVisit = false;

                // Filtro de nicho — se omite si ya filtramos por keyword en la lupita de IG
                // (el usuario ya apareció en la búsqueda filtrada, no hace falta doble filtro)
                if (!searchKeyword && nicheKeywords.length > 0) {
                    const bioLower = lead.biography.toLowerCase();
                    const matchesNiche = nicheKeywords.some(kw => bioLower.includes(kw.toLowerCase()));
                    if (!matchesNiche) {
                        onLog(`[SCRAPER] 🚫 @${lead.username} no matchea nicho. Bio: "${lead.biography.substring(0, 50)}..."`);
                        continue;
                    }
                }

                enrichedLeads.push(lead);
                onLog(`[SCRAPER] ✅ Encontrado lead con keyword: @${lead.username} — "${lead.biography.substring(0, 60)}..."`);
                onLog(`[SCRAPER] 📥 Guardando a @${lead.username} con status "pendiente".`);

                // Pausa larga cada 10 visitas
                if ((i + 1) % 10 === 0) {
                    const pauseMs = BATCH_PAUSE();
                    onLog(`[SCRAPER] ⏳ Pausa anti-detección ${Math.round(pauseMs / 1000)}s...`);
                    await page.waitForTimeout(pauseMs);
                }

            } catch (err) {
                onLog(`[SCRAPER] ⚠️ Error visitando @${lead.username}: ${err.message}`);
            }
        }

        onLog(`[SCRAPER] 🏁 Extracción finalizada. ${enrichedLeads.length} leads calificados de ${leads.length} extraídos.`);
        return enrichedLeads;

    } catch (error) {
        onLog(`[SCRAPER] ❌ Error fatal: ${error.message}`);
        return leads.filter(l => !l.needsProfileVisit);
    }
}

/**
 * Función legacy (mantiene compatibilidad con el frontend Scraper.js)
 */
export async function scrapeFollowers(targetUrl, options = {}) {
    const { createBotSession } = await import("@/lib/fleet");
    const { getDb } = await import("@/lib/db");
    const db = await getDb();

    // Obtener un bot activo
    const botRes = await db.execute("SELECT * FROM bot_accounts WHERE status = 'active' LIMIT 1");
    const bot = botRes.rows[0];
    if (!bot) {
        console.log("[SCRAPER] No hay bots activos para scrapear.");
        return [];
    }

    const session = await createBotSession(bot, console.log);
    const { context, browser } = session;
    const page = await context.newPage();

    try {
        // Extraer username del URL
        const match = targetUrl.match(/instagram\.com\/([^/?#]+)/);
        const target = match ? match[1] : targetUrl.replace(/^@/, "");

        const leads = await scrapeFollowersFromPage(page, target, {
            maxLeads: options.maxLeads || 20,
            nicheKeywords: options.nicheKeywords || [],
            onLog: options.onLog || console.log,
            campaignId: options.campaignId || null,
            ownerUser: options.ownerUser || null,
        });

        return leads;
    } finally {
        await browser.close();
    }
}

export async function scrapeProfile(handle, options = {}) {
    return {
        handle,
        bio: "",
        followersCount: 0,
        isPrivate: false,
    };
}
