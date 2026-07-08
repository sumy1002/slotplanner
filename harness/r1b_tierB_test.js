#!/usr/bin/env node
/* v8.46 / Tier B 總驗收:14 塊 by-name 匯入 + 欄序打亂免疫
 * 造 Tier B 全 sheet 非預設值 → 匯出 → 「打亂每張 Tier B sheet 的欄序」→ 切片實跑匯入 → 逐欄斷言。
 * 打亂後仍全 PASS = by-name 免疫欄序(v8.32 Tier A 同標準)。 */
const fs = require('fs');
global.window = {};
global.localStorage = (() => { const m = {}; return {
  getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; },
  key: i => Object.keys(m)[i], get length() { return Object.keys(m).length; } }; })();
global.window.localStorage = global.localStorage;
global.window.ExcelJS = require('exceljs');
eval(fs.readFileSync('helpers.js', 'utf8'));
eval(fs.readFileSync('aconfig-xlsx.js', 'utf8'));
const H = window.SlotPlanner.ConfigEditor.Helpers;
const { asStr, asNum, asBool, makeBuyFeature, defaultBetConfig } = H;

// ── seed:Tier B 全 sheet 非預設值 ──
localStorage.setItem('slotplanner.registry.v1', JSON.stringify({ symbols: [
  { number: 1, name: 'BIRD', symbol_id: 'BIRD', type: 'HIGH', enabled: true, pays: { 3: 5 }, min_match: 2 },
  { number: 2, name: 'SCAT', symbol_id: 'SCAT', type: 'SCATTER', enabled: true, pays: {}, min_match: 3 }] }));
localStorage.setItem('slotplanner.aconfig.global.v1', JSON.stringify({
  simulation_count: 777, random_seed: 9, output_prefix: 'tb', pay_type: 'WAYS',
  starting_mode: 'NG', mult_compose: 'MAX' }));
localStorage.setItem('slotplanner.aconfig.layout.v1', JSON.stringify([
  { reel_id: 1, y_offset: 0, max_rows: 3 }, { reel_id: 2, y_offset: 0, max_rows: 3 },
  { reel_id: 3, y_offset: 0, max_rows: 3 }]));
localStorage.setItem('slotplanner.aconfig.modes.v1', JSON.stringify([
  { mode: 'NG', trigger_condition: '', spin_count: 0, inherit_globals: true, on_enter_reset_vars: '', notes: '' },
  { mode: 'FG1', trigger_condition: '', spin_count: 8, inherit_globals: true, on_enter_reset_vars: '', notes: '' }]));
localStorage.setItem('slotplanner.aconfig.symbolsets.v1', JSON.stringify({ SETB: ['BIRD', 'SCAT'] }));
localStorage.setItem('slotplanner.aconfig.reelstrips.v1', JSON.stringify({
  enabled: true, strips: { FG1: { 2: ['BIRD','SCAT','BIRD'] }, 'FG1#Q': { 2: ['SCAT','SCAT','BIRD'] } } }));
const w4 = {}; for (let r = 1; r <= 3; r++) { w4[`${r}-BIRD`] = 11; w4[`${r}-SCAT`] = 3; }
localStorage.setItem('slotplanner.aconfig.reelweights.v1', JSON.stringify({ NG: { symbol_ids: ['BIRD','SCAT'], weights: w4 } }));
localStorage.setItem('slotplanner.aconfig.gridweights.v1', JSON.stringify({
  NG: { grid_sizes: [3, 4], weights: { '1-3': 70, '1-4': 30 } } }));
localStorage.setItem('slotplanner.aconfig.comboweights.v1', JSON.stringify({
  NG: { steps: [1], symbol_ids: ['BIRD'], weights: { '1-2-BIRD': 55 } } }));
localStorage.setItem('slotplanner.aconfig.genLimits.v1', JSON.stringify([
  { limit_id: 'GL1', symbol_id: 'SCAT', zone: 'MAIN', min_count: 1, max_count: 4, mode_scope: 'NG', notes: 'gl' }]));
localStorage.setItem('slotplanner.aconfig.discards.v1', JSON.stringify([
  { discard_id: 'D1', discard_kind: 'SOFT', mode_scope: 'FG1', condition: 'win == 0', notes: 'dd' }]));
localStorage.setItem('slotplanner.aconfig.bins.v1', JSON.stringify({
  NG: { bin_edges: '0,1,5,20', notes: 'bins!' } }));
localStorage.setItem('slotplanner.aconfig.cellattrs.v1', JSON.stringify([
  { attr_id: 'CA1', reel: 2, row: 3, attr: 'JACKPOT', value: 'MINI', mode_scope: 'FG1', notes: 'ca' }]));
localStorage.setItem('slotplanner.aconfig.betconfig.v1', JSON.stringify({
  ante_bet_enabled: true, ante_bet_mult: 1.5, ante_bet_trigger_mult: 2.5, ante_bet_desc: 'ante!',
  ante_buy_exclusive: true, feature_drop_enabled: true, feature_drop_desc: 'fd!',
  buy_features: [{ bf_id: 'BF1', target_mode: 'FG1', cost_mult: 100, rtp_target: 96.5, enabled: true, notes: 'bfn', kind: 'SUPER' }],
  rtp_variants: [{ variant: 'V92', target_rtp: 92, max_bet: 50, notes: 'rv' }] }));
localStorage.setItem('slotplanner.aconfig.gamble.v1', JSON.stringify({
  enabled: true, gamble_type: 'LADDER', type_desc: 'td', win_mult_options: '2,4',
  max_rounds: 7, cap_mult: 100, applies_to: 'FEATURE_WINS', applies_limit: 3, collect_anytime: false,
  stake_type: 'FEATURE', reward_type: 'ITEM', gamble_trigger: 'ANY_WIN', notes: 'gn' }));
localStorage.setItem('slotplanner.aconfig.modes.v1', JSON.stringify([
  { mode: 'NG', trigger_condition: '', spin_count: 0, inherit_globals: true, on_enter_reset_vars: '', notes: '',
    trigger_pays: [] },
  { mode: 'FG1', trigger_condition: '', spin_count: 8, inherit_globals: true, on_enter_reset_vars: '', notes: '',
    trigger_pays: [{ scatter_count: 3, pay: 2, grants_spins: 8 }] }]));

function slice(startMark, endMark) {
  const src = fs.readFileSync('setup.js', 'utf8');
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) throw new Error(`slice bounds fail: ${startMark}`);
  return src.slice(a, b);
}
const readerDef = slice('// ── v8.32 / R-1:by-name 讀欄器(共用)──', '// ── 01_Global ──');

let fails = 0;
function assert(name, cond) {
  console.log((cond ? '  PASS: ' : '  FAIL: ') + name);
  if (!cond) fails++;
}

// 欄序打亂:把 sheet 的欄整體重排(header 帶著資料一起搬)
async function shuffleColumns(inPath, outPath, sheetNames) {
  const wb = new (require('exceljs')).Workbook();
  await wb.xlsx.load(fs.readFileSync(inPath));
  const wb2 = new (require('exceljs')).Workbook();
  wb.eachSheet(ws => {
    const ws2 = wb2.addWorksheet(ws.name);
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (c, col) => { vals[col - 1] = c.value; });
      rows.push(vals);
    });
    if (sheetNames.includes(ws.name) && rows.length) {
      const nCol = Math.max(...rows.map(r => r.length));
      // 決定性反轉排列(reverse)= 最強打亂
      const perm = [...Array(nCol).keys()].reverse();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const nr = [];
        for (let j = 0; j < nCol; j++) nr[j] = r[perm[j]] !== undefined ? r[perm[j]] : null;
        rows[i] = nr;
      }
    }
    rows.forEach(r => ws2.addRow(r));
  });
  fs.writeFileSync(outPath, Buffer.from(await wb2.xlsx.writeBuffer()));
}

const TIER_B = ['01_Global','03b_Symbol_Sets','04b_Reel_Strips','14_Bet_Config','02d_Cell_Attributes',
  '14b_RTP_Variants','18_Gamble','11b_Mode_TriggerPays','12_Distribution_Bins','07b_Gen_Limits',
  '10_Discard_Rules','04_Reel_Weights','05_Grid_Size_Weights','08_Combo_Weights'];

async function runImport(path, label) {
  const wb = new (require('exceljs')).Workbook();
  await wb.xlsx.load(fs.readFileSync(path));
  const warnings = [];
  // 容器
  const g = { simulation_count: 0, random_seed: 0, output_prefix: '', pay_type: '', starting_mode: '', mult_compose: '' };
  const symbolSets = {}, reelStrips = { enabled: false, strips: {} };
  const betConfig = {}, gamble = {}, cellAttrs = [], bins = {};
  const reelWeights = {}, gridWeights = {}, comboWeights = {};
  const genLimits = [], discards = [];
  const modes = [{ mode: 'NG', trigger_pays: [] }, { mode: 'FG1', trigger_pays: [] }];
  const _ensureBetConfigFields = (bc) => bc;           // 測試版直通(欄位齊備由 seed 保證)
  const comboActiveStep = {};   // 08 塊尾清 UI 狀態容器(測試 stub)
  const _defaultGamble = () => ({ enabled:false, gamble_type:'', type_desc:'', win_mult_options:'',
    max_rounds:0, cap_mult:0, applies_to:'', applies_limit:0, collect_anytime:true,
    stake_type:'', reward_type:'', gamble_trigger:'', notes:'' });
  eval(readerDef);
  // ── Tier B 切片(const → const 邊界)──
  eval(slice("const ws1 = wb.getWorksheet('01_Global')", "const ws2 = wb.getWorksheet('02_Layout')"));
  eval(slice("const ws3b = wb.getWorksheet('03b_Symbol_Sets')", "// ── 02c_Tracks ──"));
  eval(slice("const ws14 = wb.getWorksheet('14_Bet_Config')", "// ── v8.8 / R4 B-6:02d_Cell_Attributes"));
  eval(slice("const ws02d = wb.getWorksheet('02d_Cell_Attributes')", "// ── v8.6 / R5 E-16:18_Gamble"));
  eval(slice("const ws18 = wb.getWorksheet('18_Gamble')", "// ── v8.25 / G4:19_Jackpot_Tiers"));
  eval(slice("const ws11b = wb.getWorksheet('11b_Mode_TriggerPays')", "// ── 11c_Mode_Items"));
  eval(slice("const ws12 = wb.getWorksheet('12_Distribution_Bins')", "// ── 06_Paylines ──"));
  eval(slice("const ws7b = wb.getWorksheet('07b_Gen_Limits')", "// ── 10_Discard_Rules ──"));
  eval(slice("const ws10 = wb.getWorksheet('10_Discard_Rules')", "// ── 09_Puzzle_Rules ──"));
  eval(slice("const ws4 = wb.getWorksheet('04_Reel_Weights')", "// ── 05_Grid_Size_Weights ──"));
  eval(slice("const ws5 = wb.getWorksheet('05_Grid_Size_Weights')", "// ── 08_Combo_Weights ──"));
  eval(slice("const ws8 = wb.getWorksheet('"+"08_Combo_Weights"+"')", "// 03_Symbols ── 保守合併"));

  console.log(`── ${label} ──`);
  assert('01 KV', g.simulation_count === 777 && g.pay_type === 'WAYS' && g.mult_compose === 'MAX');
  assert('03b 符號集', JSON.stringify(symbolSets.SETB) === '["BIRD","SCAT"]');
  assert('04b 輪帶+變體', reelStrips.enabled === true
      && JSON.stringify(reelStrips.strips.FG1[2]) === '["BIRD","SCAT","BIRD"]'
      && JSON.stringify(reelStrips.strips['FG1#Q'][2]) === '["SCAT","SCAT","BIRD"]');
  assert('14 Ante KV', betConfig.ante_bet_enabled === true && betConfig.ante_bet_mult === 1.5
      && betConfig.ante_buy_exclusive === true && betConfig.feature_drop_desc === 'fd!');
  const bf = (betConfig.buy_features || [])[0] || {};
  assert('14 BF 子表', bf.bf_id === 'BF1' && bf.target_mode === 'FG1' && bf.cost_mult === 100
      && bf.rtp_target === 96.5 && bf.enabled === true && bf.notes === 'bfn' && bf.kind === 'SUPER');
  assert('14b 變體', betConfig.rtp_variants[0].variant === 'V92' && betConfig.rtp_variants[0].target_rtp === 92
      && betConfig.rtp_variants[0].max_bet === 50);
  assert('02d 格屬性', cellAttrs[0].attr_id === 'CA1' && cellAttrs[0].reel === 2 && cellAttrs[0].row === 3
      && cellAttrs[0].attr === 'JACKPOT' && cellAttrs[0].value === 'MINI' && cellAttrs[0].mode_scope === 'FG1');
  assert('18 比倍', gamble.enabled === true && gamble.gamble_type === 'LADDER' && gamble.max_rounds === 7
      && gamble.applies_to === 'FEATURE_WINS' && gamble.stake_type === 'FEATURE' && gamble.reward_type === 'ITEM');
  const fg = modes.find(m => m.mode === 'FG1');
  assert('11b 觸發給付', fg.trigger_pays[0].scatter_count === 3 && fg.trigger_pays[0].pay === 2
      && fg.trigger_pays[0].grants_spins === 8);
  assert('12 分佈', bins.NG.bin_edges === '0,1,5,20' && bins.NG.notes === 'bins!');
  assert('07b 產牌限制', genLimits[0].limit_id === 'GL1' && genLimits[0].min_count === 1
      && genLimits[0].max_count === 4 && genLimits[0].mode_scope === 'NG');
  assert('10 棄牌', discards[0].discard_kind === 'SOFT' && discards[0].condition === 'win == 0'
      && discards[0].mode_scope === 'FG1');
  assert('04 權重', reelWeights.NG.weights['2-BIRD'] === 11 && reelWeights.NG.weights['3-SCAT'] === 3);
  assert('05 格數權重', gridWeights.NG.weights['1-3'] === 70 && gridWeights.NG.weights['1-4'] === 30);
  assert('08 連爆權重', comboWeights.NG.weights['1-2-BIRD'] === 55);
}

(async () => {
  const buf = await window.SlotPlanner.buildAxlsxBufferFromLS();
  fs.writeFileSync('/tmp/r1b_A.xlsx', Buffer.from(buf));
  await runImport('/tmp/r1b_A.xlsx', '原欄序');
  await shuffleColumns('/tmp/r1b_A.xlsx', '/tmp/r1b_A_shuffled.xlsx', TIER_B);
  await runImport('/tmp/r1b_A_shuffled.xlsx', '欄序反轉(14 表全打亂)');
  console.log(fails === 0 ? '\n★ Tier B 總驗收全數 PASS(含欄序免疫)' : `\n✗ ${fails} 項 FAIL`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
