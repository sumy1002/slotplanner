// G-4 additive roundtrip(匯出端):真實 buildAxlsxBufferFromLS 產出含 22_HoldWin 的 A.xlsx。
const fs = require('fs');
const ExcelJS = require('exceljs');
const _store = new Map();
global.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)), removeItem: k => _store.delete(k), clear: () => _store.clear(),
};
global.window = { ExcelJS };

const layout = [1, 2, 3, 4, 5].map(n => ({
  reel_id: n, y_offset: 0, max_rows: 3, has_subreel: false,
  subreel_position: '', subreel_rows: 0, subreel_inherit_weight: false, subreel_kind: '',
  subreel_symbol_set: '', cells: [], entry_mode: 'SCROLL', scroll_dir: 'DOWN',
}));
const modes = [
  { mode: 'NG', trigger_condition: '', spin_count: 0, notes: '' },
  // HW 模式:kind=HOLD_AND_WIN + 既有 respin 欄 + G-4 新欄
  { mode: 'HW', trigger_condition: 'symbol_count.COIN >= 6', spin_count: 0, notes: '',
    mode_kind: 'HOLD_AND_WIN', respin_base: 3, respin_reset_on: 'NEW_SYMBOL', respin_stop_cond: '盤面填滿',
    collect_enabled: true,
    hw_trigger_symbol: 'COIN', hw_persist_value: true, hw_collect_rule: '填滿全付 + 收集達標升級',
    hw_link_jackpot: 'GRAND' },
];

(async () => {
  _store.clear();
  localStorage.setItem('slotplanner.aconfig.layout.v1', JSON.stringify(layout));
  localStorage.setItem('slotplanner.aconfig.modes.v1', JSON.stringify(modes));
  require(__dirname + '/../aconfig-xlsx.js');
  const buf = await global.window.SlotPlanner.buildAxlsxBufferFromLS();
  fs.writeFileSync('/tmp/g4_full.xlsx', Buffer.from(buf));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('22_HoldWin');
  console.error(ws ? '  ✅ 22_HoldWin sheet 存在' : '  ❌ 22_HoldWin sheet 缺');
  if (ws) {
    const h = ws.getRow(1).values.slice(1).map(v => String(v));
    console.error('  22_HoldWin 表頭:', JSON.stringify(h));
    const need = ['Mode_Scope', 'Trigger_Symbol', 'Persist_Value', 'Collect_Rule', 'Link_Jackpot', 'Notes'];
    console.error(JSON.stringify(h) === JSON.stringify(need) ? '  ✅ 表頭符合契約' : '  ❌ 表頭不符');
    ws.eachRow((row, i) => { if (i === 1) return; console.error('   ', JSON.stringify(row.values.slice(1))); });
  }
  // 確認既有 respin 欄仍在 11_Mode_Config(未被 G-4 動)
  const ws11 = wb.getWorksheet('11_Mode_Config');
  const h11 = ws11.getRow(1).values.slice(1).map(v => String(v));
  console.error('  11_Mode_Config 仍含 Respin_Base:', h11.includes('Respin_Base') ? '✅' : '❌');
  console.error('\n已寫 /tmp/g4_full.xlsx');
  process.exit(ws ? 0 : 1);
})().catch(e => { console.error('EXPORT ERROR:', e); process.exit(2); });
