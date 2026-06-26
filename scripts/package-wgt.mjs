// Empacota dist/ + tizen/config.xml + tizen/icon.png num IPTVPlayer.wgt (zip).
// O .wgt e' a entrada da Samsung USB Demo Packaging Tool, que assina e gera o
// .tmg p/ instalar via pendrive na TV. Rode `npm run build` antes (ou use
// `npm run package:wgt`, que ja builda).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const tizenDir = join(root, 'tizen');
const out = join(root, 'IPTVPlayer.wgt');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('✗ dist/ ausente — rode `npm run build` antes.');
  process.exit(1);
}

// staging isolado p/ nao poluir dist/
const stage = mkdtempSync(join(tmpdir(), 'iptv-wgt-'));
try {
  cpSync(dist, stage, { recursive: true });
  cpSync(join(tizenDir, 'config.xml'), join(stage, 'config.xml'));
  cpSync(join(tizenDir, 'icon.png'), join(stage, 'icon.png'));

  // Ajustes que so valem no pacote da TV (dev/browser ficam intactos):
  //  - injeta webapis.js → habilita window.webapis.avplay (AVPlay nativo)
  //  - remove crossorigin → o atributo quebra o carregamento do modulo em file://
  const htmlPath = join(stage, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/\s+crossorigin/g, '');
  if (!html.includes('webapis/webapis.js')) {
    html = html.replace(
      '<head>',
      '<head>\n    <script type="text/javascript" src="$WEBAPIS/webapis/webapis.js"></script>',
    );
  }
  writeFileSync(htmlPath, html);

  rmSync(out, { force: true });
  // -r recursivo, -X sem metadados extras, -q silencioso; config.xml fica na raiz do zip
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: stage });

  const size = (readFileSync(out).length / 1024).toFixed(0);
  console.log(`✓ ${out} (${size} KB)`);
  console.log('  Proximo passo: Samsung USB Demo Packaging Tool → .tmg → pendrive → TV.');
} finally {
  rmSync(stage, { recursive: true, force: true });
}
