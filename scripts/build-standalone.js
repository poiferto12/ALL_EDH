// Script para crear una version standalone sin ES modules
// Esto permite usar Live Server u otros servidores simples

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Leer archivos
const scoringContent = readFileSync(join(projectRoot, 'scoring.js'), 'utf-8');
const appContent = readFileSync(join(projectRoot, 'app.js'), 'utf-8');

// Procesar scoring.js: quitar exports
let processedScoring = scoringContent
  .replace(/^export\s+/gm, '')
  .replace(/^export\s*{\s*[^}]*\s*};?\s*$/gm, '');

// Procesar app.js: quitar imports y exports
let processedApp = appContent
  .replace(/^import\s+{[^}]*}\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
  .replace(/^export\s+/gm, '');

// Combinar en un solo archivo
const combined = `// ALL_EDH - Version Standalone (sin ES modules)
// Generado automaticamente por scripts/build-standalone.js

(function() {
  'use strict';

  // ========== SCORING.JS ==========
${processedScoring}

  // ========== APP.JS ==========
${processedApp}

})();
`;

// Escribir archivo combinado
writeFileSync(join(projectRoot, 'dist', 'all-edh-standalone.js'), combined);

console.log('Build completado: dist/all-edh-standalone.js');
