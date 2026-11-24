import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');

function walkCssFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results;
}

const cssFiles = walkCssFiles(distDir);
if (cssFiles.length === 0) {
  console.error('Erro: nenhum arquivo CSS encontrado em dist/. Rode "npm run build" antes.');
  process.exit(1);
}

const forbiddenRegexChecks = [
  { name: 'oklch()', regex: /oklch\(/gi },
  { name: 'oklab()', regex: /oklab\(/gi },
  { name: 'color-mix()', regex: /color-mix\(/gi },
  { name: '@property', regex: /@property\b/gi },
  { name: '@layer', regex: /@layer\b/gi },
  { name: '8-digit hex (#rrggbbaa)', regex: /#[0-9a-f]{8}\b/gi },
  { name: 'space-separated rgb()/rgba() with slash', regex: /\brgba?\(\s*[^,)]+\s+\/\s*[^)]+\)/gi },
  { name: 'backdrop-filter (unwanted blur)', regex: /(?<![a-z-])backdrop-filter\s*:\s*(?!none\b)/gi },
  { name: 'standalone inset property', regex: /(?:^|[;{])\s*inset\s*:/gi },
];

function extractRuleBlocks(css) {
  const blocks = [];
  const stack = [];
  let i = 0;
  let selectorStart = 0;

  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const header = css.slice(selectorStart, i).trim();
      stack.push({ header, bodyStart: i + 1 });
      selectorStart = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top) {
        const body = css.slice(top.bodyStart, i);
        const insideSupports = stack.some((s) => /^@supports\b/i.test(s.header));
        const supportsHeader = stack.find((s) => /^@supports\b/i.test(s.header))?.header || '';
        if (!body.includes('{')) {
          blocks.push({ header: top.header, body, insideSupports, supportsHeader });
        }
      }
      selectorStart = i + 1;
    }
    i += 1;
  }
  return blocks;
}

function matchesPropOrShorthand(prevProp, targetProp) {
  if (prevProp === targetProp) return true;
  if (prevProp === 'padding' && targetProp.startsWith('padding-')) return true;
  if (prevProp === 'margin' && targetProp.startsWith('margin-')) return true;
  return false;
}

let hasFailure = false;

for (const file of cssFiles) {
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');

  for (const rule of forbiddenRegexChecks) {
    const matches = content.match(rule.regex);
    if (matches && matches.length > 0) {
      hasFailure = true;
      console.error(`[FAIL] ${rel}: encontrado ${rule.name} (${matches.length}x). Exemplo: ${matches[0]}`);
    }
  }

  const blocks = extractRuleBlocks(content);
  for (const block of blocks) {
    const decls = block.body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);

    for (let idx = 0; idx < decls.length; idx += 1) {
      const decl = decls[idx];
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      const val = decl.slice(colonIdx + 1).trim();

      if (/(?:dvh|svh)\b/i.test(val)) {
        const hasFallback = decls.slice(0, idx).some((prev) => {
          const c = prev.indexOf(':');
          return (
            c !== -1 &&
            matchesPropOrShorthand(prev.slice(0, c).trim().toLowerCase(), prop) &&
            !/(?:dvh|svh)\b/i.test(prev.slice(c + 1))
          );
        });
        if (!hasFallback) {
          hasFailure = true;
          console.error(`[FAIL] ${rel}: ${prop}: ${val} sem fallback anterior em "${block.header}"`);
        }
      }

      if (prop === 'aspect-ratio' && !(block.insideSupports && /aspect-ratio/i.test(block.supportsHeader))) {
        hasFailure = true;
        console.error(`[FAIL] ${rel}: aspect-ratio fora de @supports (aspect-ratio) em "${block.header}"`);
      }

      if (
        /\b(?:clamp|min|max)\(/i.test(val) &&
        prop !== 'grid-template-columns' &&
        prop !== 'grid-template-rows' &&
        !(block.insideSupports && /aspect-ratio/i.test(block.supportsHeader))
      ) {
        const hasFallback = decls.slice(0, idx).some((prev) => {
          const c = prev.indexOf(':');
          return (
            c !== -1 &&
            matchesPropOrShorthand(prev.slice(0, c).trim().toLowerCase(), prop) &&
            !/\b(?:clamp|min|max)\(/i.test(prev.slice(c + 1))
          );
        });
        if (!hasFallback) {
          hasFailure = true;
          console.error(`[FAIL] ${rel}: ${prop}: ${val} sem fallback estático anterior em "${block.header}"`);
        }
      }
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log(`[OK] check:css passou em ${cssFiles.length} arquivo(s) CSS com fallbacks validados.`);
