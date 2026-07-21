// G-4 docgen 三面零 diff sweep(markdown + Plan + Company)。
//   no_holdwin 種子(含 respin_base>0 但無 G-4 新欄、非 HOLD_AND_WIN kind):pristine vs 改後須相等
//   → 證明 Hold&Win 新區段只由 hw_ 欄/kind 觸發,不因既有 respin 而誤出、不動既有 respin 輸出。
//   有 hold-win 種子:出現「Hold & Win」新區段,pristine 皆無(gated)。
const ExcelJS = require('exceljs');
function makeLS(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
           removeItem: k => store.delete(k), clear: () => store.clear() };
}
function runMd(file, seed) {
  global.window = {}; global.localStorage = makeLS(seed);
  delete require.cache[require.resolve(file)]; require(file);
  return global.window.SlotPlanner.DocGen.buildMechMarkdown({});
}
async function runXlsx(file, seed, which) {
  global.window = { ExcelJS }; global.localStorage = makeLS(seed);
  delete require.cache[require.resolve(file)]; require(file);
  const DG = global.window.SlotPlanner.DocGen;
  const buf = which === 'plan' ? await DG.buildPlanXlsxBuffer({}) : await DG.buildCompanyXlsxBuffer({});
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const lines = [];
  wb.eachSheet(ws => ws.eachRow((row, r) => row.eachCell((cell, c) => {
    let v = cell.value; if (v && typeof v === 'object' && v.richText) v = v.richText.map(x => x.text).join('');
    lines.push(`${ws.name}!${r}:${c}=${JSON.stringify(v)}`);
  })));
  return lines;
}

const syms = { symbols: [ { id: 'COIN', name: '金幣', type: 'COIN' }, { id: 'SCAT', name: 'Scatter', type: 'SCATTER' },
  { id: 'H1', name: '高1', type: 'HIGH' } ] };
const layout = [1, 2, 3, 4, 5].map(n => ({ reel_id: String(n), max_rows: 3 }));
const G = (name, modes) => ({ 'slotplanner.aconfig.global.v1': { game_name: name, pay_type: 'LINE' },
  'slotplanner.registry.v1': syms, 'slotplanner.aconfig.layout.v1': layout,
  'slotplanner.aconfig.modes.v1': modes });

// no_holdwin:FG 有既有 respin_base(Hold&Win Respin 描述)但無 G-4 新欄、非 HOLD_AND_WIN kind → 零 diff
const noHW = G('無holdwin新欄', [
  { mode: 'NG', kind: 'SPIN' },
  { mode: 'FG', kind: 'SPIN', trigger_condition: 'symbol_count.SCAT >= 3',
    respin_base: 3, respin_reset_on: 'NEW_SYMBOL', respin_stop_cond: '盤面填滿', collect_enabled: true },
]);
// 有 hold-win(feature)
const withHW = G('holdwin款', [
  { mode: 'NG', kind: 'SPIN' },
  { mode: 'HW', kind: 'HOLD_AND_WIN', trigger_condition: 'symbol_count.COIN >= 6',
    respin_base: 3, respin_reset_on: 'NEW_SYMBOL', collect_enabled: true,
    hw_trigger_symbol: 'COIN', hw_persist_value: true, hw_collect_rule: '填滿全付', hw_link_jackpot: 'GRAND' },
]);

const PRI = '/tmp/docgen_pri.js', MOD = '/tmp/docgen_mod.js';

(async () => {
  let ok = true;
  console.log('== markdown 零 diff(no_holdwin;含既有 respin 描述)==');
  const a = runMd(PRI, noHW), b = runMd(MOD, noHW);
  { const same = a === b; if (!same) ok = false;
    console.log(`  ${same ? '✅' : '❌'} no_holdwin pri=${a.length} mod=${b.length} ${same ? 'identical' : 'DIFF'}`);
    if (!same) { const la = a.split('\n'), lb = b.split('\n'); for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { console.log(`     @${i} PRI:${JSON.stringify(la[i])} MOD:${JSON.stringify(lb[i])}`); break; } } }
  for (const which of ['plan', 'company']) {
    console.log(`\n== ${which} xlsx 零 diff(no_holdwin 逐格)==`);
    const x = await runXlsx(PRI, noHW, which), y = await runXlsx(MOD, noHW, which);
    let same = x.length === y.length, first = null;
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { same = false; first = i; break; }
    if (!same) ok = false;
    console.log(`  ${same ? '✅' : '❌'} no_holdwin cells pri=${x.length} mod=${y.length} ${same ? 'identical' : 'DIFF@' + first}`);
    if (!same && first != null) console.log(`     PRI:${x[first]} MOD:${y[first]}`);
  }
  console.log('\n== feature:hold-win 種子 ==');
  const md = runMd(MOD, withHW), mdP = runMd(PRI, withHW);
  console.log(`  ${md.includes('## Hold & Win / 金幣收集') ? '✅' : '❌'} markdown 出現「Hold & Win / 金幣收集」`);
  console.log(`  ${!mdP.includes('Hold & Win / 金幣收集') ? '✅' : '❌'} pristine markdown 無(gated)`);
  const pl = (await runXlsx(MOD, withHW, 'plan')).join('\n'), plP = (await runXlsx(PRI, withHW, 'plan')).join('\n');
  console.log(`  ${pl.includes('Hold & Win') ? '✅' : '❌'} Plan xlsx 出現「Hold & Win」band`);
  console.log(`  ${!plP.includes('Hold & Win') ? '✅' : '❌'} pristine Plan 無(gated)`);
  const co = (await runXlsx(MOD, withHW, 'company')).join('\n'), coP = (await runXlsx(PRI, withHW, 'company')).join('\n');
  console.log(`  ${co.includes('Hold & Win 說明') ? '✅' : '❌'} Company 出現「Hold & Win 說明」`);
  console.log(`  ${!coP.includes('Hold & Win 說明') ? '✅' : '❌'} pristine Company 無(gated)`);
  ok = ok && md.includes('## Hold & Win / 金幣收集') && !mdP.includes('Hold & Win / 金幣收集')
    && pl.includes('Hold & Win') && !plP.includes('Hold & Win')
    && co.includes('Hold & Win 說明') && !coP.includes('Hold & Win 說明');

  console.log(`\nG-4 docgen 三面零 diff + feature: ${ok ? '✅ 全通過' : '❌ 有問題'}`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERROR:', e); process.exit(2); });
