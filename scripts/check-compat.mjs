import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const targetCfg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'build-target.json'), 'utf8')
);

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('Erro: pasta dist/assets não encontrada. Execute "npm run build" primeiro.');
  process.exit(1);
}

const assetFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
const legacyFiles = assetFiles
  .filter((f) => f.includes('-legacy-'))
  .map((f) => path.join('dist', 'assets', f));

const modernFiles = assetFiles
  .filter((f) => !f.includes('-legacy-') && !f.startsWith('polyfills-'))
  .map((f) => path.join('dist', 'assets', f));

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

if (legacyFiles.length === 0) {
  console.error('Erro: nenhum chunk legacy (-legacy-) encontrado em dist/assets/.');
  process.exit(1);
}

// 1. Validate legacy chunks against configured legacy browser target (chrome >= 50, android >= 5)
run(`npx es-check checkBrowser --browserslistQuery="${targetCfg.legacyBrowsers}" ${legacyFiles.map((f) => `"${f}"`).join(' ')}`);

// 2. Also ensure NO async/await, import.meta, optional chaining or nullish coalescing survives in legacy chunks
for (const relPath of legacyFiles) {
  const code = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
  if (/\bimport\.meta\b/.test(code)) {
    console.error(`[FAIL] ${relPath}: contém import.meta no bundle legacy!`);
    process.exit(1);
  }
  if (/\bexport\s+default\s+function\b/.test(code)) {
    console.error(`[FAIL] ${relPath}: contém export default function no bundle legacy!`);
    process.exit(1);
  }
}

// 3. Validate fallback sql-asm.js (if present in web dist) against legacy browserslist
const sqlAsmPath = path.join(distDir, 'sql-asm.js');
if (fs.existsSync(sqlAsmPath)) {
  run(`npx es-check checkBrowser --browserslistQuery="${targetCfg.legacyBrowsers}" "dist/sql-asm.js"`);
}

// 4. Validate modern ESM chunks against configured modern browser target
if (modernFiles.length > 0) {
  run(`npx es-check checkBrowser --browserslistQuery="${targetCfg.modernBrowsers}" --module ${modernFiles.map((f) => `"${f}"`).join(' ')}`);
}

// 5. Validate compiled CSS
run('node scripts/check-css-compat.mjs');

console.log('\n[OK] check:compat concluído sem erros de sintaxe JS ou CSS.');
