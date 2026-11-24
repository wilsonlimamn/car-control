import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dryCheckOnly = process.argv.includes('--verify-only');

const distDir = path.join(root, 'dist');

if (!dryCheckOnly) {
  console.log('> Executando build para APK Android (Capacitor com sql.js + fallback asm.js)...');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  execSync('npx vite build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CAPACITOR_BUILD: 'true',
    },
  });
}

// Service worker não é necessário dentro do bundle local do APK
for (const file of ['sw.js', 'registerSW.js']) {
  const fullPath = path.join(distDir, file);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

for (const requiredFile of ['sql-wasm.wasm', 'sql-asm.js']) {
  if (!fs.existsSync(path.join(distDir, requiredFile))) {
    console.error(`Erro: arquivo obrigatório ${requiredFile} não encontrado em dist/ para o APK.`);
    process.exit(1);
  }
}

const assetsDir = path.join(distDir, 'assets');
const nativeChunks = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((f) => /nativeSqliteStore|CapacitorSQLite/i.test(f))
  : [];

if (nativeChunks.length > 0) {
  console.error('Erro: chunks de plugin nativo encontrados no build Capacitor:', nativeChunks.join(', '));
  process.exit(1);
}

console.log('[OK] Build Capacitor pronto em dist/ (sql.js + sql-asm.js empacotados localmente, sem plugin nativo SQLite).');
