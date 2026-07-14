#!/usr/bin/env node
/* v8.32 / R-1 總驗收:by-name 匯入重構 round-trip
 * 造全功能 A.xlsx(9 個轉換 sheet 全部帶非預設值)→ 切片實跑 setup.js 匯入 → 逐欄斷言。
 */
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
const { asStr, asNum, asBool, extractModeScope, parseActionsDSL, makeRule,
        migrateRuleSchema, makePanel, makeJackpot, normalizeMask } = H;

// ── seed:9 個 sheet 全部帶可辨識的非預設值 ──
localStorage.setItem('slotplanner.registry.v1', JSON.stringify({ symbols: [
  { number: 1, name: 'BIRD', symbol_id: 'BIRD', type: 'HIGH', enabled: true, pays: { 3: 5, 4: 10, 5: 20 }, min_match: 2 },
  { number: 2, name: 'SCAT', symbol_id: 'SCAT', type: 'SCATTER', enabled: true, pays: {}, min_match: 3 }] }));
localStorage.setItem('slotplanner.aconfig.global.v1', JSON.stringify({
  simulation_count: 1000, random_seed: 42, output_prefix: 't', pay_type: 'LINE',
  starting_mode: 'NG', mult_compose: 'ADD', payline_direction: 'RTL' }));
localStorage.setItem('slotplanner.aconfig.layout.v1', JSON.stringify([
  { reel_id: 1, y_offset: 1, max_rows: 4, has_subreel: true, subreel_position: 'TOP',
    subreel_rows: 2, subreel_inherit_weight: false, subreel_kind: 'TOP_HORIZONTAL',
    subreel_symbol_set: 'SETX', cells: ['0,1', '0,2'] },
  { reel_id: 2, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: true },
  { reel_id: 3, y_offset: 0, max_rows: 3, has_subreel: false, subreel_position: '', subreel_rows: 0, subreel_inherit_weight: true }]));
localStorage.setItem('slotplanner.aconfig.panels.v1', JSON.stringify([
  { panel_id: 'P1', col: 2, row: 1, width: 3, height: 2, scroll: false, panel_type: 'COLLECT',
    symbol_set: 'SETX', inherit_weight: false, join_payline: true, note: '收集盤',
    trigger_symbol: 'SCAT', collect_target_jp: 'GRAND', trigger_reel: 2, cells: ['0,0', '1,1'] }]));
const w = {}; for (let r = 1; r <= 3; r++) { w[`${r}-BIRD`] = 10; w[`${r}-SCAT`] = 2; }
localStorage.setItem('slotplanner.aconfig.symbolsets.v1', JSON.stringify({ SETX: ['BIRD', 'SCAT'] }));
localStorage.setItem('slotplanner.aconfig.reelweights.v1', JSON.stringify({
  NG: { symbol_ids: ['BIRD', 'SCAT'], weights: w } }));
localStorage.setItem('slotplanner.aconfig.paylines.v1', JSON.stringify([
  { line_id: 1, path: '(1,2);(2,2);(3,2)', direction: 'RTL', notes: '右到左線' }]));
localStorage.setItem('slotplanner.aconfig.constraints.v1', JSON.stringify([
  { constraint_id: 'C1', ctype: 'GLOBAL_MAX', symbol_id: 'SCAT', reels_allowed: '1,3',
    threshold: 5, mode_scope: 'NG', notes: '散布上限' }]));
localStorage.setItem('slotplanner.aconfig.jackpots.v1', JSON.stringify([
  { jp_id: 'JP1', name: 'GRAND', kind: 'PROGRESSIVE', mult: 1000, increment_pct: 1.5,
    must_hit_by: 5000, trigger_desc: '集滿', trigger_type: 'COLLECT', accum_pct: 2,
    accum_mech: '抽成', collect_prob: 0.5, collect_enter: '3 SCAT', mode_scope: 'NG', notes: '主池' }]));
localStorage.setItem('slotplanner.aconfig.jackpot.v1', JSON.stringify({
  tiers: [{ tier: 'GRAND', label: '至尊', value: 1000, notes: '頂級' },
          { tier: 'MINI', label: '迷你', value: 20, notes: '' }],
  trigger: 'COLLECT_METER' }));
localStorage.setItem('slotplanner.aconfig.modes.v1', JSON.stringify([
  { mode: 'NG', trigger_condition: '', spin_count: 0, inherit_globals: true,
    on_enter_reset_vars: '', notes: '', mode_kind: 'SPIN' },
  { mode: 'HW', trigger_condition: 'symbol_count.SCAT >= 3', spin_count: 3, inherit_globals: false,
    on_enter_reset_vars: 'pot', notes: 'HoldWin', reset_scope: 'spin', cap_enabled: 'TRUE',
    cap_value: '5000', stack_mode: 'ADD', mode_kind: 'COLLECTION', wheel_upgrade_to: '',
    pick_count: 3, collect_target: 6, choice_group: 'G1', respin_base: 3,
    respin_reset_on: 'NEW_SYMBOL', respin_stop_cond: 'respins_left == 0',
    pay_type_override: 'SCATTER', collect_enabled: true, respin_reset_symbol: 'COIN',
    grid_expand_in_collect: true, allow_persistent: true, end_condition: 'respins_left == 0',
    unlock_requires: ['NG'], mult_compose_override: 'MAX',
    items: [{ label: 'coin', value: 5, weight: 10, is_end: false, link_jackpot: 'MINI',
              item_role: 'COIN', link_mode: 'NG' }] }]));
localStorage.setItem('slotplanner.aconfig.rules.v1', JSON.stringify([
  { rule_id: 'PX', priority: 100, trigger: 'ON_SPIN_START', mode_scope: 'ALL',
    condition: 'cell_value.3,2 > 0',
    actions: [{ atype: 'SPAWN', params: { target: 'BIRD', cell: '2,3' } }],
    emits: ['spawned'], enabled: true, description: '人看的摘要', persistent: true,
    notes: '走最短路徑', random_group: 'RG', random_weight: 60 },
  // v8.34 / GAP-S1:動態參數規則(裸變數 / 引號公式 / 引號範圍)
  { rule_id: 'PDYN', priority: 90, trigger: 'ON_SPIN_END', mode_scope: 'ALL', condition: '',
    actions: [
      { atype: 'AWARD_FREE_SPIN', params: { count: 'symbol_count.SCAT' } },
      { atype: 'UPDATE_GLOBAL',   params: { var: 'hunt', op: 'add', value: 'symbol_count.SCAT + 1' } },
      { atype: 'BOARD_FILL',      params: { symbol_id: 'WILD', count: '2-5' } }],
    emits: [], enabled: true, description: '', notes: '' }]));

function slice(startMark, endMark) {
  const src = fs.readFileSync('setup.js', 'utf8');
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) throw new Error(`slice bounds fail: ${startMark}`);
  return src.slice(a, b);
}
// 讀欄器定義切片(importXlsx 開頭)
const readerDef = slice('// ── v8.32 / R-1:by-name 讀欄器(共用)──', '// ── 01_Global ──');

let fails = 0;
function assert(name, cond) {
  console.log((cond ? '  PASS: ' : '  FAIL: ') + name);
  if (!cond) fails++;
}

(async () => {
  const buf = await window.SlotPlanner.buildAxlsxBufferFromLS();
  fs.writeFileSync('/tmp/r1_A.xlsx', Buffer.from(buf));
  const wb = new (require('exceljs')).Workbook();
  await wb.xlsx.load(fs.readFileSync('/tmp/r1_A.xlsx'));

  const warnings = [];
  // 共用狀態容器
  const layout = [], panels = [], paylines = [], constraints = [], jackpots = [];
  const modes = [], rules = [], bins = {}, genLimits = [], discards = [], genConstraints = [];
  const builderRowsMap = {}, ruleEditMode = {}, ruleParseError = {}, actionEditMode = {}, actionsParseError = {};
  const _ensureModeGameplayFields = (m) => m;
  const _legacy17 = [];
  const jackpotCfg = { tiers: [], trigger: '' };
  const _defaultJackpot = () => ({ tiers: [], trigger: '' });
  const registry = null;   // 03_Symbols 塊靠 registry 判空跳過(不在本批範圍)

  eval(readerDef);   // 定義 _rowReader

  // ── 各段切片實跑 ──
  eval(slice("const ws2 = wb.getWorksheet('02_Layout')", "// ── 03b_Symbol_Sets ──"));
  eval(slice("const ws13 = wb.getWorksheet('13_Jackpots')", "// ── 14_Bet_Config ──"));
  eval(slice("const ws19 = wb.getWorksheet('19_Jackpot_Tiers')", "// ── v8.0:舊 A.xlsx 的 17_Bonus_Games"));
  eval(slice("const ws11 = wb.getWorksheet('11_Mode_Config')", "// ── 04_Reel_Weights ──"));
  eval(slice("const ws6 = wb.getWorksheet('06_Paylines')", "// ── 07b_Gen_Limits ──"));
  eval(slice("const ws9 = wb.getWorksheet('09_Puzzle_Rules')", "// ── 04_Reel_Weights ──"));

  console.log('── 02_Layout ──');
  const L1 = layout.find(r => r.reel_id === 1);
  assert('subreel 全欄', L1.has_subreel === true && L1.subreel_kind === 'TOP_HORIZONTAL'
      && L1.subreel_symbol_set === 'SETX' && L1.subreel_rows === 2 && L1.subreel_inherit_weight === false);
  assert('cells 遮罩', JSON.stringify(L1.cells) === '[\"0,1\",\"0,2\"]' && layout[1].cells === null);

  console.log('── 02b_Panels ──');
  const P1 = panels.find(p => p.panel_id === 'P1');
  assert('panel 全欄', P1.col === 2 && P1.panel_type === 'COLLECT' && P1.scroll === false
      && P1.trigger_symbol === 'SCAT' && P1.collect_target_jp === 'GRAND'
      && P1.trigger_reel === 2 && P1.join_payline === true && P1.note === '收集盤');
  assert('panel cells', Array.isArray(P1.cells) && P1.cells.length === 2);

  console.log('── 06_Paylines / 07_Constraints ──');
  assert('payline direction=RTL', paylines[0].direction === 'RTL' && paylines[0].notes === '右到左線');
  assert('constraint 全欄', constraints[0].ctype === 'GLOBAL_MAX' && constraints[0].threshold === 5
      && constraints[0].reels_allowed === '1,3' && constraints[0].mode_scope === 'NG');

  console.log('── 13_Jackpots / 19_Jackpot_Tiers ──');
  const J = jackpots[0];
  assert('jackpot 全欄', J.kind === 'PROGRESSIVE' && J.mult === 1000 && J.increment_pct === 1.5
      && J.must_hit_by === 5000 && J.accum_pct === 2 && J.collect_prob === 0.5
      && J.collect_enter === '3 SCAT' && J.mode_scope === 'NG');
  assert('tiers+trigger', jackpotCfg.tiers.length === 2 && jackpotCfg.trigger === 'COLLECT_METER'
      && jackpotCfg.tiers[0].label === '至尊');

  console.log('── 11 / 11c ──');
  const HW = modes.find(m => m.mode === 'HW');
  assert('11 前 19 欄', HW.reset_scope === 'spin' && HW.cap_value === '5000' && HW.stack_mode === 'ADD'
      && HW.mode_kind === 'COLLECTION' && HW.pick_count === 3
      && HW.collect_target === 6 && HW.choice_group === 'G1' && HW.respin_base === 3
      && HW.respin_reset_on === 'NEW_SYMBOL' && HW.pay_type_override === 'SCATTER');
  assert('11 尾 7 欄(G3/G5/v8.28)', HW.collect_enabled === true && HW.respin_reset_symbol === 'COIN'
      && HW.grid_expand_in_collect === true && HW.allow_persistent === true
      && HW.end_condition === 'respins_left == 0'
      && JSON.stringify(HW.unlock_requires) === '[\"NG\"]' && HW.mult_compose_override === 'MAX');
  assert('11c 全欄', HW.items[0].item_role === 'COIN' && HW.items[0].link_mode === 'NG'
      && HW.items[0].link_jackpot === 'MINI');

  console.log('── 09 ──');
  const R = rules.find(r => r.rule_id === 'PX');
  assert('09 全欄', R.persistent === true && R.notes === '走最短路徑' && R.description === '人看的摘要'
      && R.random_group === 'RG' && R.random_weight === 60 && R.emits[0] === 'spawned'
      && R.condition === 'cell_value.3,2 > 0' && R.actions[0].params.cell === '2,3');
  const RD = rules.find(r => r.rule_id === 'PDYN');   // v8.34 / GAP-S1(匯入端按 priority 排序,按 id 取)
  assert('09 動態參數 round-trip', RD && RD.actions.length === 3
      && RD.actions[0].params.count === 'symbol_count.SCAT'
      && RD.actions[1].params.value === 'symbol_count.SCAT + 1'
      && RD.actions[2].params.count === '2-5');

  console.log(fails === 0 ? '\\n★ R-1 總驗收全數 PASS' : `\\n✗ ${fails} 項 FAIL`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
