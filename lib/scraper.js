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

export async function scrapeFollowersFromPage(page, targetAccount, options = {}) {
    const maxLeads = options.maxLeads || 20;
    const rawLimit = maxLeads * 3; // Reducimos un poco el margen porque ahora filtramos en vivo
    const nicheKeywords = options.nicheKeywords || [];
    const searchKeyword = options.searchKeyword || "";
    const onLog = options.onLog || console.log;
    const campaignId = options.campaignId || null;
    const ownerUser = options.ownerUser || null;

    const target = targetAccount.replace(/^@/, "").trim().toLowerCase();
    const leads = [];
    const seenUsernames = new Set();

    const { getDb } = await import("@/lib/db");
    const db = await getDb();

    // ── CARGAR LISTA NEGRA ANTES DE EMPEZAR ──
    onLog(`[SCRAPER] 🛡️ Armando lista negra de perfiles ya contactados...`);
    const blacklist = new Set();
    try {
        const blRes = await db.execute("SELECT username FROM prospects");
        blRes.rows.forEach(r => blacklist.add(r.username));
        onLog(`[SCRAPER] 🛡️ Lista negra cargada: ${blacklist.size} perfiles serán ignorados al scrollear.`);
    } catch (e) {
        onLog(`[SCRAPER] ⚠️ Fallo al cargar lista negra: ${e.message}`);
    }

    onLog(`[SCRAPER] 🔍 Navegando al perfil de @${target}...`);

    try {
        await page.goto(`https://www.instagram.com/${target}/`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(AFTER_CLICK_DELAY());

        const pageContent = await page.textContent("body");
        if (pageContent.includes("Sorry, this page") || pageContent.includes("Esta página no está disponible")) {
            onLog(`[SCRAPER] ❌ Perfil @${target} no existe o fue eliminado.`);
            return leads;
        }

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

        onLog(`[SCRAPER] 📊 Modal de seguidores abierto. Comenzando extracción...`);
        onLog(`[SCRAPER] 🔍 Detectando contenedor de scroll dinámicamente...`);

        try {
            await page.locator('div[role="dialog"] a[role="link"]').first().waitFor({ state: 'visible', timeout: 7000 });
        } catch (e) {
            onLog(`[SCRAPER] ⚠️ Advertencia: No se detectaron perfiles en el modal tras 7s.`);
        }

        const scrollContainer = await page.evaluateHandle(() => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return null;
            const divs = Array.from(dialog.querySelectorAll('div'));
            return divs.find(el => {
                const style = window.getComputedStyle(el);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            }) || divs.find(el => el.classList.contains('_aano'));
        });

        const isNull = await scrollContainer.evaluate(el => el === null);

        if (isNull) {
            onLog(`[SCRAPER] ❌ No se pudo localizar el contenedor de scroll dinámicamente.`);
            return leads;
        }

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
                for (const char of kw) {
                    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 120) + 60 });
                }
                const filterWait = Math.floor(Math.random() * 1000) + 3000;
                onLog(`[SCRAPER] ⏳ Esperando ${filterWait}ms para que Instagram filtre...`);
                await page.waitForTimeout(filterWait);
                onLog(`[SCRAPER] ✅ Lista filtrada por "${kw}". Comenzando scraping sobre resultados.`);
            } else {
                onLog(`[SCRAPER] ⚠️ Lupita de búsqueda no encontrada — scrapeando sin filtro de keyword.`);
            }
        }

        let scrollAttempts = 0;
        const maxScrollAttempts = 80;
        let noNewLeadsCount = 0;

        onLog(`[SCRAPER] 🔄 Iniciando recolección de handles (Objetivo Crudo: ${rawLimit} para asegurar ${maxLeads} limpios)...`);

        const UI_TEXT_BLACK_LIST = [
            "Following", "Siguiendo", "Seguindo", "Follow", "Seguir", "Requested", "Solicitado",
            "Message", "Mensaje", "Verified", "Verificado"
        ];

        while (leads.length < rawLimit && scrollAttempts < maxScrollAttempts) {
            const usernameElements = await page.locator([
                'div[role="dialog"] a[role="link"] span',
                'div[role="dialog"] span[dir="auto"] a',
                'div[role="row"] a[role="link"]'
            ].join(', ')).all();

            for (const el of usernameElements) {
                if (leads.length >= rawLimit) break;

                try {
                    const text = await el.textContent();
                    const username = text?.replace(/^@/, "").trim().toLowerCase();

                    // ACÁ SE APLICA LA MAGIA: Si está en la blacklist, lo salta al instante.
                    if (!username || username.length < 2 || username === target || seenUsernames.has(username) || blacklist.has(username)) {
                        continue;
                    }

                    if (username.includes(" ") || UI_TEXT_BLACK_LIST.some(b => username.includes(b.toLowerCase()))) continue;

                    seenUsernames.add(username);
                    leads.push({
                        username,
                        full_name: "",
                        biography: "",
                        needsProfileVisit: true,
                    });

                    if (leads.length % 10 === 0) {
                        onLog(`[SCRAPER] 📝 Recopilados ${leads.length} handles nuevos y limpios...`);
                    }

                } catch { /* DOM changed */ }
            }

            const prevHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

            if (process.env.NODE_ENV === "production") {
                onLog(`[SCRAPER] ⚙️ MODO RAILWAY: Scroll progresivo agresivo para forzar carga...`);
                for (let s = 0; s < 3; s++) {
                    await page.mouse.wheel(0, 500);
                    await page.waitForTimeout(2000);
                }
            }

            await scrollContainer.evaluate((el) => {
                el.scrollTo(0, el.scrollHeight);
            });

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
            const newHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

            if (newHeight === prevHeight) {
                noNewLeadsCount++;
                const maxIntentos = searchKeyword ? 6 : 3;
                onLog(`[SCRAPER] ⚠️ Sin prospectos nuevos en pantalla (Intento ${noNewLeadsCount}/${maxIntentos})`);

                if (noNewLeadsCount >= maxIntentos) {
                    onLog(`[SCRAPER] 🛑 Deteniendo scroll: ${maxIntentos} intentos sin perfiles nuevos.`);
                    break;
                }
            } else {
                noNewLeadsCount = 0;
            }
        }

        onLog(`[SCRAPER] ✅ Recolección terminada: ${leads.length} handles 100% nuevos listos para analizar.`);

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

        onLog(`[SCRAPER] 🔎 Visitando perfiles para extraer bios (${leads.length} leads)...`);

        const enrichedLeads = [];

        for (let i = 0; i < leads.length; i++) {
            if (enrichedLeads.length >= maxLeads) {
                onLog(`[SCRAPER] 🎯 Cuota completada: ${maxLeads} leads listos. Deteniendo análisis.`);
                break;
            }
            const lead = leads[i];

            try {
                await page.goto(`https://www.instagram.com/${lead.username}/`, {
                    waitUntil: "domcontentloaded",
                    timeout: 20000,
                });
                await page.waitForTimeout(PROFILE_VISIT_DELAY());

                const bioSection = page.locator('meta[name="description"]');
                let bioText = "";
                if (await bioSection.count() > 0) {
                    bioText = await bioSection.getAttribute("content") || "";
                }

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

                if (!searchKeyword && nicheKeywords.length > 0) {
                    const bioLower = lead.biography.toLowerCase();
                    const matchesNiche = nicheKeywords.some(kw => bioLower.includes(kw.toLowerCase()));
                    if (!matchesNiche) {
                        onLog(`[SCRAPER] 🚫 @${lead.username} no matchea nicho. Bio: "${lead.biography.substring(0, 50)}..."`);
                        continue;
                    }
                }

                enrichedLeads.push(lead);
                onLog(`[SCRAPER] ✅ Encontrado lead calificado: @${lead.username}`);
                onLog(`[SCRAPER] 📥 Guardando a @${lead.username} con status "pendiente".`);

                if ((i + 1) % 10 === 0) {
                    const pauseMs = BATCH_PAUSE();
                    onLog(`[SCRAPER] ⏳ Pausa anti-detección ${Math.round(pauseMs / 1000)}s...`);
                    await page.waitForTimeout(pauseMs);
                }

            } catch (err) {
                onLog(`[SCRAPER] ⚠️ Error visitando @${lead.username}: ${err.message}`);
            }
        }

        onLog(`[SCRAPER] 🏁 Extracción finalizada. ${enrichedLeads.length} leads calificados y listos.`);
        return enrichedLeads;

    } catch (error) {
        onLog(`[SCRAPER] ❌ Error fatal: ${error.message}`);
        return leads.filter(l => !l.needsProfileVisit);
    }
}

export async function scrapeFollowers(targetUrl, options = {}) {
    const { createBotSession } = await import("@/lib/fleet");
    const { getDb } = await import("@/lib/db");
    const db = await getDb();

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