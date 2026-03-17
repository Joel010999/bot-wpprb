/**
 * RLE — Script de arranque limpio para Windows (Jujuy Edition)
 * Mata procesos en puerto 3000, borra cache .next, y lanza Next.js sin Turbopack
 */
const { execSync, spawn } = require("child_process");
const { existsSync, rmSync } = require("fs");
const { join } = require("path");

const PORT = 3000;

// ── 1. Limpiar pantalla ──
console.clear();
console.log("\n");
console.log("  ╔═══════════════════════════════════════════╗");
console.log("  ║       🚀 RLE — LIMPIEZA DE ENTORNO        ║");
console.log("  ╚═══════════════════════════════════════════╝");
console.log("");

// ── 2. Matar proceso en puerto 3000 ──
console.log(`  [1/4] 🔪 Liberando puerto ${PORT}...`);
try {
    execSync(`npx -y kill-port ${PORT}`, { stdio: "ignore", timeout: 10000 });
    console.log(`  ✅ Puerto ${PORT} liberado.`);
} catch {
    console.log(`  ✅ Puerto ${PORT} ya estaba libre.`);
}

// ── 3. Borrar cache .next ──
console.log("  [2/4] 🗑️  Borrando caché .next...");
const nextDir = join(process.cwd(), ".next");
if (existsSync(nextDir)) {
    try {
        rmSync(nextDir, { recursive: true, force: true });
        console.log("  ✅ Caché .next eliminado.");
    } catch (e) {
        console.log("  ⚠️  No se pudo borrar completamente .next:", e.message);
    }
} else {
    console.log("  ✅ No hay caché .next previo.");
}

// ── 4. Borrar lock si quedó ──
console.log("  [3/4] 🔓 Limpiando locks...");
try {
    const lockFile = join(process.cwd(), ".next", "dev", "lock");
    if (existsSync(lockFile)) rmSync(lockFile, { force: true });
} catch { /* no existe */ }
console.log("  ✅ Locks limpiados.");

// ── 5. Lanzar Next.js SIN Turbopack ──
console.log("  [4/4] 🚀 Iniciando Next.js (sin Turbopack)...");
console.log("");
console.log("  ╔═══════════════════════════════════════════╗");
console.log("  ║    ✅ RLE LISTO EN PORT 3000              ║");
console.log("  ║    🌐 http://localhost:3000               ║");
console.log("  ╚═══════════════════════════════════════════╝");
console.log("");

// Abrir navegador automáticamente después de 3 segundos
setTimeout(() => {
    try {
        execSync(`start http://localhost:${PORT}`, { stdio: "ignore" });
    } catch { /* fallo silencioso */ }
}, 4000);

// Lanzar next dev sin --turbo (evita el Panic de Rust en Windows)
const next = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
});

next.on("close", (code) => {
    if (code !== 0) {
        console.log(`\n  ❌ Next.js se detuvo con código ${code}`);
    }
});

process.on("SIGINT", () => {
    next.kill("SIGINT");
    process.exit(0);
});
