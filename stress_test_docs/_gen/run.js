const path = require('path');
const { buildDocsForGame, SP, H } = require('./driver.js');
const { buildGames } = require('./games.js');

const OUT_ROOT = path.join(__dirname, '..', 'out');

async function main() {
  const games = buildGames(SP, H);
  const results = [];
  for (const g of games) {
    const outDir = path.join(OUT_ROOT, g.slug);
    console.log(`\n=== 產出 ${g.docMeta.game_name} → ${outDir} ===`);
    try {
      await buildDocsForGame(g, outDir, g.slug);
      console.log(`  ✓ 完成 A文件 / 公司格式文件(.xlsm) / MD文件`);
      results.push({ slug: g.slug, ok: true });
    } catch (e) {
      console.error(`  ✗ 失敗:`, e.stack || e);
      results.push({ slug: g.slug, ok: false, err: String(e) });
    }
  }
  console.log('\n=== 總結 ===');
  results.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.slug}${r.ok ? '' : ' — ' + r.err}`));
  if (results.some(r => !r.ok)) process.exit(1);
}

main();
