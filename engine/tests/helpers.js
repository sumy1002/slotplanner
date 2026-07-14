// ============================================================
//  config-editor/helpers.js — A 設定檔編輯器 · 純資料層 + 常數
//
//  從原 config-editor.js 拆出(v3.4 起的 4 檔架構)
//
//  含內容:
//    - TAB_GROUPS / TABS / TABS_BY_GROUP        (分頁 metadata)
//    - DEFAULT_GLOBAL / DEFAULT_MODES / ...     (各 tab 預設值)
//    - LS_GLOBAL_KEY / LS_MODES_KEY / ...       (localStorage key 常數)
//    - loadGlobal / loadModes / loadLayout / ... (LS 讀取)
//    - COND_VAR_CATALOG / COND_OPERATORS / COND_JOINERS  (拼圖建構器)
//    - ACTION_CATALOG / ACTION_BY_TYPE          (Action 14 種)
//    - PRESET_LIBRARY                           (規則庫)
//    - LAYOUT_PRESETS                           (盤面範本)
//    - PAYLINE_PRESETS                          (中獎線範本)
//    - _composeConditionWithModeScope / _diff*  (純函式)
//    - _csvEscape / _csvParse                   (CSV I/O)
//    - LAYOUT_CELL_SIZE 等視覺常數
//
//  掛載點:window.SlotPlanner.ConfigEditor.Helpers
//  使用方式:setup.js 內 const H = SP.ConfigEditor.Helpers;
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.ConfigEditor = window.SlotPlanner.ConfigEditor || {};
  const SP = window.SlotPlanner;


  // ──────────────────────────────────────────────────────────
  //  12 個分頁的 metadata(對應 A.xlsx 分頁順序)
  //  group 欄位用於左側欄分組;TAB_GROUPS 定義分組順序與標題
  // ──────────────────────────────────────────────────────────
  const TAB_GROUPS = [
    // v7.10:規則為「基礎設定」群組第一項(IA 重構);全域/模式/Bonus 收進規則頁子分頁
    { id: 'base',   label: '基礎設定',     icon: '🏗' },
    { id: 'rule',   label: '賠付',         icon: '🎯' },   // v7.10:原「賠付 & 規則」,規則移出後改名「賠付」
    { id: 'weight', label: '權重表',       icon: '🎲' },
    // v3.1:移除 'adv' 群組 — 原本只有 12_Distribution_Bins,改放到 'rule' 群組末尾
  ];

  const TABS = [
    // ── 基礎設定(v7.10:規則為總入口,排基礎設定第一位)──
    // v7.10:09_Puzzle_Rules + 10_Discard_Rules 合併的 'rules' tab 成為總入口,
    //   內含子分頁:模式(賠付橫幅 + 11_Mode_Config + 玩法)/ 盤面圖示規則 / 通用規則。
    //   01_Global(賠付類型/計分方向/起始模式)併入規則頁,bonus_games 入口關閉;
    //   兩者 markup 仍在(以 active 路由),但從導覽列隱藏(hidden)。
    { id: 'rules',             sheet: '09 + 10 + 01 + 11',     name: '規則',         icon: '🧩', done: true, group: 'base' },
    { id: 'layout',            sheet: '02_Layout',             name: '盤面結構',     icon: '🎰', done: true, group: 'base' },
    { id: 'symbols',           sheet: '03_Symbols',            name: '符號清單',     icon: '🎨', done: true, group: 'base',
      kind: 'fullpane' },
    { id: 'bet_config',        sheet: '14_Bet_Config',          name: '押注',        icon: '🎰', done: true, group: 'base' },
    // v7.10:global 併入規則頁(模式子分頁的賠付橫幅 + 起始模式),從導覽列隱藏(markup/路由/匯出皆保留)
    { id: 'global',            sheet: '01_Global',             name: '全域設定',     icon: '⚙️', done: true, group: 'base', hidden: true },
    // v8.0:bonus_games 分頁移除(bonus 併入 mode 玩法種類 mode_kind)
    // ── 賠付 ──
    { id: 'paylines',          sheet: '06_Paylines',           name: '中獎線',       icon: '➰', done: true, group: 'rule', hidden: true },   // 甲:改由規則頁 peer 分段進入
    { id: 'constraints',       sheet: '07_Constraints',        name: '硬約束',       icon: '🚫', done: true, group: 'rule' },
    { id: 'jackpots',          sheet: '13_Jackpots',           name: 'JP 彩金',      icon: '💰', done: true, group: 'rule', hidden: true },   // v6.2 #0→甲:併入押注頁,分頁隱藏
    { id: 'distribution_bins', sheet: '12_Distribution_Bins',  name: '分佈區間',     icon: '📊', done: true, group: 'rule', hidden: true },   // W1:改由權重頁「分佈」peer 進入
    // v8.6 / R5 E-16:比倍(Gamble)分頁(D5 拍板:賠付群組尾;TABS scope 豁免比照 v7.10)
    { id: 'gamble',            sheet: '18_Gamble',             name: '比倍',         icon: '🎴', done: true, group: 'rule', hidden: true },   // 甲:併入押注頁,分頁隱藏
    // ── 權重表 ──
    { id: 'reel_weights',      sheet: '04_Reel_Weights',       name: '權重',         icon: '🎲', done: true, group: 'weight' },   // W1:權重頁 parent(輪帶/分佈 peer host)
    { id: 'reel_strips',       sheet: '04b_Reel_Strips',       name: '真實輪帶',     icon: '🎞️', done: true, group: 'weight', hidden: true },   // W1:改由權重頁「輪帶」peer 進入
    { id: 'grid_size_weights', sheet: '05_Grid_Size_Weights',  name: '格數權重',     icon: '📏', done: true, group: 'weight', hidden: true },   // W1:改由權重頁「分佈」peer 進入
    // v4.0 / #14:連爆權重(08)已移除 UI 分頁(資料也清掉);A.xlsx 仍會輸出空的 08 sheet 以維持 13 分頁結構
    { id: 'multipliers',       sheet: '15_Multipliers',         name: '倍數系統',     icon: '✖️', done: true, group: 'weight', hidden: true },  // v6.3 / Q3:已併入符號頁「倍數/彩金」,分頁隱藏
    { id: 'coin_values',       sheet: '16_Coin_Values',         name: '金幣面額',     icon: '🪙', done: true, group: 'weight', hidden: true },  // v6.3 / Q3:已併入符號頁「倍數/彩金」,分頁隱藏
  ];

  // 依 group 切分(渲染用),保持 TABS 內各 group 內部的原順序
  const TABS_BY_GROUP = TAB_GROUPS.map(g => ({
    ...g,
    tabs: TABS.filter(t => t.group === g.id && !t.hidden),   // v6.3:hidden 分頁不進導覽
  })).filter(g => g.tabs.length > 0);

  // ──────────────────────────────────────────────────────────
  //  01_Global 預設值與欄位定義
  // ──────────────────────────────────────────────────────────
  const PAY_TYPES = ['LINE', 'WAYS', 'SCATTER', 'CLUSTER'];
  const WAYS_DIRS = ['LTR', 'RTL', 'BOTH'];

  const DEFAULT_GLOBAL = {
    simulation_count:   1000000,
    random_seed:        42,
    output_prefix:      'B_結果',
    pay_type:           'LINE',
    ways_direction:     'LTR',
    payline_direction:  'LTR',
    longest_line_once:  true,   // v6.2 #8:雙向計分時,最長連線是否僅計分一次(預設是)
    megaways:           false,
    cluster_min_size:   5,
    starting_mode:      'NG',
    max_chain_depth:    100,
    max_chain_per_rule: 50,
    big_win_thresholds: '100,500',
    dead_spin_buckets:  '2,3,4,5',
  };

  const LS_GLOBAL_KEY = 'slotplanner.aconfig.global.v1';
  const LS_MODES_KEY  = 'slotplanner.aconfig.modes.v1';

  // ──────────────────────────────────────────────────────────
  //  #10 變更回顧 baseline
  //  把當前 LS 的 12 個 keys 全部 snapshot 起來,作為「相對於這個點」
  //  之後使用者修改任何資料,都能跟這個 baseline 做 diff
  // ──────────────────────────────────────────────────────────
  const LS_BASELINE_KEY = 'slotplanner.changes.baseline.v1';
  // baseline 涵蓋的 12 個 LS keys(注意:registry 是 SymbolRegistry 自己管理,這裡也納入)
  const BASELINE_KEYS = [
    'slotplanner.aconfig.global.v1',
    'slotplanner.aconfig.modes.v1',
    'slotplanner.aconfig.layout.v1',
    'slotplanner.aconfig.bins.v1',
    'slotplanner.aconfig.paylines.v1',
    'slotplanner.aconfig.constraints.v1',
    'slotplanner.aconfig.reelweights.v1',
    'slotplanner.aconfig.gridweights.v1',
    'slotplanner.aconfig.discards.v1',
    'slotplanner.aconfig.rules.v1',
    'slotplanner.registry.v1',
  ];

  // v4.0 / #14:連爆權重功能已移除 — 清掉殘留 LS(冪等,只在有資料時動作)
  try {
    if (localStorage.getItem('slotplanner.aconfig.comboweights.v1') !== null) {
      localStorage.removeItem('slotplanner.aconfig.comboweights.v1');
    }
  } catch (e) { /* localStorage 不可用時忽略 */ }
  function captureBaselineSnapshot() {
    const data = {};
    for (const k of BASELINE_KEYS) {
      data[k] = localStorage.getItem(k);
    }
    return data;
  }
  function saveBaseline(source, sourceLabel) {
    const payload = {
      takenAt: new Date().toISOString(),
      source: source || 'unknown',
      sourceLabel: sourceLabel || '',
      data: captureBaselineSnapshot(),
    };
    try {
      localStorage.setItem(LS_BASELINE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[config-editor] saveBaseline failed:', e);
    }
    return payload;
  }
  function loadBaseline() {
    try {
      const raw = localStorage.getItem(LS_BASELINE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.data) return null;
      return obj;
    } catch (e) {
      console.warn('[config-editor] loadBaseline failed:', e);
      return null;
    }
  }
  // 啟動時若 baseline 不存在,以當前 LS 內容建立(視為「首次使用」基準)
  function ensureBaseline() {
    if (loadBaseline()) return;
    saveBaseline('init', '首次使用基準');
  }

  // ──────────────────────────────────────────────────────────
  //  #10 變更回顧 — diff 引擎
  //  輸入 baseline.data,跟當前 LS 內容比較;回傳分組變更列表
  //  result: [{ tab, sheet, changes: [{ kind, text, detail? }] }]
  //    kind: 'add' | 'remove' | 'modify' | 'rename' | 'summary'
  // ──────────────────────────────────────────────────────────
  function _safeParse(raw, fallback) {
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  // 比較兩個物件,回傳 [{ field, old, new }] 的差異欄位
  function _diffObject(oldObj, newObj, fields) {
    const out = [];
    const keys = fields || new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
    for (const k of keys) {
      const o = oldObj ? oldObj[k] : undefined;
      const n = newObj ? newObj[k] : undefined;
      // 視為「不同」的條件:JSON 序列化後不同(避免 ref 比較問題)
      if (JSON.stringify(o) !== JSON.stringify(n)) {
        out.push({ field: k, old: o, new: n });
      }
    }
    return out;
  }
  // 以 idField 為 key,比較兩個 array,回傳 added / removed / modified
  function _diffArrayById(oldArr, newArr, idField) {
    oldArr = Array.isArray(oldArr) ? oldArr : [];
    newArr = Array.isArray(newArr) ? newArr : [];
    const oldMap = new Map(oldArr.map(x => [x[idField], x]));
    const newMap = new Map(newArr.map(x => [x[idField], x]));
    const added = [];
    const removed = [];
    const modified = [];
    for (const [id, n] of newMap) {
      if (!oldMap.has(id)) {
        added.push(n);
      } else {
        const o = oldMap.get(id);
        const fields = _diffObject(o, n);
        if (fields.length > 0) modified.push({ id, fields });
      }
    }
    for (const [id, o] of oldMap) {
      if (!newMap.has(id)) removed.push(o);
    }
    return { added, removed, modified };
  }
  // 比較 weights 物件(reel/grid/combo 共用)
  // 結構:{ modeName: { ...entry, weights: { key: number } } }
  function _diffWeightsMap(oldMap, newMap) {
    oldMap = oldMap || {};
    newMap = newMap || {};
    const modesAdded = [];
    const modesRemoved = [];
    const modesChanged = [];   // [{ mode, cellsChanged, idsChanged, stepsChanged? }]
    const allModes = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
    for (const mode of allModes) {
      const o = oldMap[mode];
      const n = newMap[mode];
      if (!o && n) { modesAdded.push(mode); continue; }
      if (o && !n) { modesRemoved.push(mode); continue; }
      // 兩邊都有:比 weights 個別 cell + symbol_ids/grid_sizes/steps
      let cells = 0;
      const oW = (o.weights || {});
      const nW = (n.weights || {});
      const allKeys = new Set([...Object.keys(oW), ...Object.keys(nW)]);
      for (const k of allKeys) {
        if (oW[k] !== nW[k]) cells++;
      }
      const oIds = JSON.stringify(o.symbol_ids || o.grid_sizes || []);
      const nIds = JSON.stringify(n.symbol_ids || n.grid_sizes || []);
      const idsChanged = (oIds !== nIds);
      const oSteps = JSON.stringify(o.steps || []);
      const nSteps = JSON.stringify(n.steps || []);
      const stepsChanged = (oSteps !== nSteps);
      if (cells > 0 || idsChanged || stepsChanged) {
        modesChanged.push({ mode, cells, idsChanged, stepsChanged });
      }
    }
    return { modesAdded, modesRemoved, modesChanged };
  }

  function computeChangesFromBaseline(baseline) {
    if (!baseline || !baseline.data) return [];
    const oldData = baseline.data;
    // 舊資料 getter 從 baseline.data,新資料從目前 LS
    const oldGet = (k) => oldData[k];
    const newGet = (k) => localStorage.getItem(k);
    return _computeChangesBetween(oldGet, newGet);
  }

  // #16:給範本 diff 用 — 比較兩個 LS-snapshot 物件
  // oldData / newData 形狀:{ "slotplanner.aconfig.global.v1": jsonString, ... }
  function computeChangesBetweenSnapshots(oldData, newData) {
    if (!oldData || !newData) return [];
    return _computeChangesBetween(
      (k) => oldData[k],
      (k) => newData[k],
    );
  }

  // 範本的 data 用「短 key」(global / modes / layout 等),且值是已 parsed 的物件。
  // 把它轉成 diff 引擎需要的 getter:(LS key) => jsonString
  const _TPL_SHORT_TO_LS = {
    'slotplanner.aconfig.global.v1':       'global',
    'slotplanner.aconfig.modes.v1':        'modes',
    'slotplanner.aconfig.layout.v1':       'layout',
    'slotplanner.aconfig.bins.v1':         'bins',
    'slotplanner.aconfig.paylines.v1':     'paylines',
    'slotplanner.aconfig.constraints.v1':  'constraints',
    'slotplanner.aconfig.reelweights.v1':  'reelweights',
    'slotplanner.aconfig.gridweights.v1':  'gridweights',
    'slotplanner.aconfig.comboweights.v1': 'comboweights',
    'slotplanner.aconfig.discards.v1':     'discards',
    'slotplanner.aconfig.rules.v1':        'rules',
    'slotplanner.registry.v1':             'registry',
  };
  function _templateDataGetter(tplData) {
    return (lsKey) => {
      if (!tplData) return null;
      const shortKey = _TPL_SHORT_TO_LS[lsKey];
      if (!shortKey) return null;
      const v = tplData[shortKey];
      if (v == null) return null;
      // 範本資料已 parsed,diff 引擎需要 jsonString,所以重新 stringify
      return typeof v === 'string' ? v : JSON.stringify(v);
    };
  }
  // 比較兩份「範本資料」(從 LS slotplanner.template.<slug>.v1 讀出的 .data)
  function computeChangesBetweenTemplates(tplDataA, tplDataB) {
    return _computeChangesBetween(
      _templateDataGetter(tplDataA),
      _templateDataGetter(tplDataB),
    );
  }

  // 共用 diff 引擎(從原本 baseline 版抽出來通用化)
  // getter 簽名:(LS_KEY) => jsonString | null
  function _computeChangesBetween(oldGet, newGet) {
    const out = [];
    // helper:把一組 changes 收進 result list(空就跳過)
    const pushTab = (tab, sheet, changes) => {
      if (changes && changes.length > 0) out.push({ tab, sheet, changes });
    };
    // 為了讓底下原本寫 oldData['slotplanner.aconfig.x.v1'] 的程式碼能繼續用同樣語法,
    // 用 Proxy 包裝 oldGet,做到 oldData[key] === oldGet(key)
    const oldData = new Proxy({}, {
      get(_t, prop) { return oldGet(prop); },
    });
    const getCur = newGet;

    // 以下 12 段檢查使用上一行的 oldData(Proxy)與 getCur(newGet)

    // ─── 01_Global ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.global.v1'], {});
      const n = _safeParse(getCur('slotplanner.aconfig.global.v1'), {});
      const diffs = _diffObject(o, n);
      const changes = diffs.map(d => ({
        kind: 'modify',
        text: `${d.field}: ${_fmtVal(d.old)} → ${_fmtVal(d.new)}`,
      }));
      pushTab('global', '01_Global', changes);
    }

    // ─── 02_Layout ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.layout.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.layout.v1'), []);
      const d = _diffArrayById(o, n, 'reel_id');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增 Reel R${r.reel_id}` });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除 Reel R${r.reel_id}` });
      for (const m of d.modified) {
        changes.push({
          kind: 'modify',
          text: `R${m.id}:${m.fields.map(f => f.field).join(', ')} 變動`,
          detail: m.fields.map(f => `${f.field}: ${_fmtVal(f.old)} → ${_fmtVal(f.new)}`).join(' · '),
        });
      }
      pushTab('layout', '02_Layout', changes);
    }

    // ─── 03_Symbols ───
    {
      const o = _safeParse(oldData['slotplanner.registry.v1'], { symbols: [] });
      const n = _safeParse(getCur('slotplanner.registry.v1'), { symbols: [] });
      const oArr = Array.isArray(o.symbols) ? o.symbols : (Array.isArray(o) ? o : []);
      const nArr = Array.isArray(n.symbols) ? n.symbols : (Array.isArray(n) ? n : []);
      const d = _diffArrayById(oArr, nArr, 'name');
      const changes = [];
      if (d.added.length > 0) changes.push({ kind: 'add', text: `新增 ${d.added.length} 個符號`, detail: d.added.map(s => s.name).join(', ') });
      if (d.removed.length > 0) changes.push({ kind: 'remove', text: `移除 ${d.removed.length} 個符號`, detail: d.removed.map(s => s.name).join(', ') });
      if (d.modified.length > 0) {
        changes.push({
          kind: 'modify',
          text: `${d.modified.length} 個符號屬性變動`,
          detail: d.modified.map(m => `${m.id}(${m.fields.map(f => f.field).join(',')})`).join('; '),
        });
      }
      pushTab('symbols', '03_Symbols', changes);
    }

    // ─── 04_Reel_Weights ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.reelweights.v1'], {});
      const n = _safeParse(getCur('slotplanner.aconfig.reelweights.v1'), {});
      const d = _diffWeightsMap(o, n);
      const changes = _formatWeightsChanges(d);
      pushTab('reel_weights', '04_Reel_Weights', changes);
    }

    // ─── 05_Grid_Size_Weights ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.gridweights.v1'], {});
      const n = _safeParse(getCur('slotplanner.aconfig.gridweights.v1'), {});
      const d = _diffWeightsMap(o, n);
      const changes = _formatWeightsChanges(d);
      pushTab('grid_size_weights', '05_Grid_Size_Weights', changes);
    }

    // ─── 06_Paylines ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.paylines.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.paylines.v1'), []);
      const d = _diffArrayById(o, n, 'line_id');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增中獎線 ${r.line_id}`, detail: r.path });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除中獎線 ${r.line_id}` });
      for (const m of d.modified) {
        const pathChanged = m.fields.some(f => f.field === 'path');
        changes.push({
          kind: 'modify',
          text: `${m.id}:${pathChanged ? '路徑變動' : m.fields.map(f => f.field).join(', ') + ' 變動'}`,
          detail: pathChanged ? m.fields.find(f => f.field === 'path').new : '',
        });
      }
      pushTab('paylines', '06_Paylines', changes);
    }

    // ─── 07_Constraints ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.constraints.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.constraints.v1'), []);
      const d = _diffArrayById(o, n, 'constraint_id');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增約束 ${r.constraint_id}`, detail: `${r.ctype} · ${r.symbol_id}` });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除約束 ${r.constraint_id}` });
      for (const m of d.modified) {
        changes.push({
          kind: 'modify',
          text: `${m.id}:${m.fields.map(f => f.field).join(', ')} 變動`,
        });
      }
      pushTab('constraints', '07_Constraints', changes);
    }

    // ─── 08_Combo_Weights ───
    // v4.0 / #14:連爆權重已移除,不再納入變更比較

    // ─── 09_Puzzle_Rules ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.rules.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.rules.v1'), []);
      const d = _diffArrayById(o, n, 'rule_id');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增規則 ${r.rule_id}`, detail: r.description || r.notes || r.condition });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除規則 ${r.rule_id}` });
      for (const m of d.modified) {
        changes.push({
          kind: 'modify',
          text: `${m.id}:${m.fields.map(f => f.field).join(', ')} 變動`,
        });
      }
      pushTab('rules', '09_Puzzle_Rules · 拼圖規則', changes);
    }

    // ─── 10_Discard_Rules ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.discards.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.discards.v1'), []);
      const d = _diffArrayById(o, n, 'discard_id');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增棄牌 ${r.discard_id}`, detail: r.notes || r.condition });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除棄牌 ${r.discard_id}` });
      for (const m of d.modified) {
        changes.push({
          kind: 'modify',
          text: `${m.id}:${m.fields.map(f => f.field).join(', ')} 變動`,
        });
      }
      pushTab('rules', '10_Discard_Rules · 棄牌規則', changes);
    }

    // ─── 11_Mode_Config ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.modes.v1'], []);
      const n = _safeParse(getCur('slotplanner.aconfig.modes.v1'), []);
      const d = _diffArrayById(o, n, 'mode');
      const changes = [];
      for (const r of d.added) changes.push({ kind: 'add', text: `新增模式 ${r.mode}`, detail: r.notes });
      for (const r of d.removed) changes.push({ kind: 'remove', text: `移除模式 ${r.mode}` });
      for (const m of d.modified) {
        changes.push({
          kind: 'modify',
          text: `${m.id}:${m.fields.map(f => f.field).join(', ')} 變動`,
        });
      }
      pushTab('global', '11_Mode_Config · 模式定義', changes);  // v3.1:跳到 global tab
    }

    // ─── 12_Distribution_Bins ───
    {
      const o = _safeParse(oldData['slotplanner.aconfig.bins.v1'], {});
      const n = _safeParse(getCur('slotplanner.aconfig.bins.v1'), {});
      const changes = [];
      const allKeys = new Set([...Object.keys(o), ...Object.keys(n)]);
      for (const k of allKeys) {
        if (!(k in o) && (k in n)) {
          changes.push({ kind: 'add', text: `新增模式 ${k} 的分佈區間` });
        } else if ((k in o) && !(k in n)) {
          changes.push({ kind: 'remove', text: `移除模式 ${k} 的分佈區間` });
        } else if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
          changes.push({
            kind: 'modify',
            text: `${k}:bin_edges 變動`,
            detail: `${(o[k] && o[k].bin_edges) || ''} → ${(n[k] && n[k].bin_edges) || ''}`,
          });
        }
      }
      pushTab('distribution_bins', '12_Distribution_Bins', changes);
    }

    return out;
  }

  // 把單值格式化為簡短可讀字串
  function _fmtVal(v) {
    if (v === null || v === undefined) return '∅';
    if (v === '') return '(空)';
    if (typeof v === 'string') return v.length > 30 ? v.slice(0, 30) + '…' : v;
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
    return String(v);
  }
  // 把 _diffWeightsMap 的結果轉成 changes 列表
  function _formatWeightsChanges(d) {
    const out = [];
    for (const mode of d.modesAdded) out.push({ kind: 'add', text: `新增模式 ${mode} 的權重表` });
    for (const mode of d.modesRemoved) out.push({ kind: 'remove', text: `移除模式 ${mode} 的權重表` });
    for (const m of d.modesChanged) {
      const parts = [];
      if (m.cells > 0) parts.push(`${m.cells} 個 cell 變動`);
      if (m.idsChanged) parts.push('符號清單變動');
      if (m.stepsChanged) parts.push('爆階段變動');
      out.push({ kind: 'modify', text: `${m.mode} 模式:${parts.join('、')}` });
    }
    return out;
  }

  function loadGlobal() {
    try {
      const raw = localStorage.getItem(LS_GLOBAL_KEY);
      if (!raw) return { ...DEFAULT_GLOBAL };
      const obj = JSON.parse(raw);
      return { ...DEFAULT_GLOBAL, ...obj };
    } catch (e) {
      console.warn('[config-editor] loadGlobal failed:', e);
      return { ...DEFAULT_GLOBAL };
    }
  }
  function saveGlobal(g) {
    try {
      localStorage.setItem(LS_GLOBAL_KEY, JSON.stringify(g));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveGlobal failed:', e);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  11_Mode_Config 預設值與儲存
  // ──────────────────────────────────────────────────────────
  function makeMode(name) {
    return {
      mode: name,
      trigger_condition: '',
      spin_count: 0,
      inherit_globals: false,
      on_enter_reset_vars: '',
      progress_ladder: [],   // v6.3 / Q3:cascade 累積倍數階梯(由 15_Multipliers PROGRESS 移入)
      progress_reset: true,  // v6.3:進入此模式是否重置階梯
      notes: '',
    };
  }

  const DEFAULT_MODES = [
    { mode: 'NG',  trigger_condition: '',                          spin_count: 0,  inherit_globals: false, on_enter_reset_vars: '',               notes: '起始基本模式;無觸發條件' },
    { mode: 'FG1', trigger_condition: 'symbol_count.SCAT >= 3',    spin_count: 10, inherit_globals: false, on_enter_reset_vars: 'fg_combo_count', notes: '10 局免費' },
    { mode: 'FG2', trigger_condition: 'symbol_count.SCAT >= 5',    spin_count: 15, inherit_globals: true,  on_enter_reset_vars: '',               notes: '5 個 Scatter 進階 FG' },
    { mode: 'BG',  trigger_condition: 'global.coin_pool >= 100',   spin_count: 5,  inherit_globals: true,  on_enter_reset_vars: '',               notes: '獎勵局,需累積金幣' },
  ];

  function loadModes() {
    try {
      const raw = localStorage.getItem(LS_MODES_KEY);
      if (!raw) return DEFAULT_MODES.map(m => ({ ...makeMode(m.mode), ...m }));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_MODES.map(m => ({ ...makeMode(m.mode), ...m }));
      return arr.map(m => ({ ...makeMode(''), ...m,
        progress_ladder: Array.isArray(m.progress_ladder) ? m.progress_ladder.map(Number).filter(n => !isNaN(n) && n > 0) : [],
        progress_reset: m.progress_reset !== false,
      }));
    } catch (e) {
      console.warn('[config-editor] loadModes failed:', e);
      return DEFAULT_MODES.map(m => ({ ...makeMode(m.mode), ...m }));
    }
  }
  function saveModes(modes) {
    try {
      localStorage.setItem(LS_MODES_KEY, JSON.stringify(modes));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveModes failed:', e);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  02_Layout 預設值與儲存
  // ──────────────────────────────────────────────────────────
  const LS_LAYOUT_KEY = 'slotplanner.aconfig.layout.v1';

  function makeReel(reel_id) {
    return {
      reel_id,
      y_offset: 0,
      max_rows: 3,
      has_subreel: false,
      subreel_position: '',
      subreel_rows: 0,
      subreel_inherit_weight: false,
      subreel_kind: 'STACK',   // v4.6:STACK / SIDE_VERTICAL / TOP_HORIZONTAL / DUAL_PANEL
      subreel_symbol_set: '',  // v5.1:附掛副盤符號集(契約加法欄 SubReel_Symbol_Set;空=不指定)
    };
  }

  // v4.6:副輪四型定義（UI 用）。kind→預設位置/列數行為都在 setup.js 處理。
  const SUBREEL_KINDS = [
    { key: 'STACK',          icon: '🔒', label: '堆疊副輪',   short: '堆疊',
      desc: 'Hold & Win 式;副輪列接在主輪上/下方，與主輪同欄滾動。',
      positions: ['TOP', 'BOTTOM'], default_position: 'BOTTOM', dual: false },
    { key: 'SIDE_VERTICAL',  icon: '↕', label: '獨立直向副盤', short: '直向',
      desc: '在主盤最旁邊的直向副盤，與主盤面無關（獨立抽樣）。',
      positions: ['LEFT', 'RIGHT'], default_position: 'RIGHT', dual: false },
    { key: 'TOP_HORIZONTAL', icon: '↔', label: '橫向上方副盤', short: '橫向',
      desc: '在主盤上方的橫向副盤，與主盤面相關;可用不同符號集。',
      positions: ['TOP'], default_position: 'TOP', dual: false },
    { key: 'DUAL_PANEL',     icon: '▦', label: '雙盤面',       short: '雙盤',
      desc: '與主輪同尺寸、無滾動的第二張盤（Cashman Bingo 式）;列數鎖定＝主輪列數。',
      positions: ['BOTTOM', 'RIGHT'], default_position: 'BOTTOM', dual: true },
  ];
  const SUBREEL_KIND_MAP = Object.fromEntries(SUBREEL_KINDS.map(k => [k.key, k]));

  const DEFAULT_LAYOUT = [
    { reel_id: 1, y_offset:  1, max_rows: 3, has_subreel: false, subreel_position: '',       subreel_rows: 0, subreel_inherit_weight: false },
    { reel_id: 2, y_offset:  0, max_rows: 4, has_subreel: false, subreel_position: '',       subreel_rows: 0, subreel_inherit_weight: false },
    { reel_id: 3, y_offset: -1, max_rows: 5, has_subreel: true,  subreel_position: 'BOTTOM', subreel_rows: 1, subreel_inherit_weight: true, subreel_kind: 'STACK'  },
    { reel_id: 4, y_offset:  0, max_rows: 4, has_subreel: false, subreel_position: '',       subreel_rows: 0, subreel_inherit_weight: false },
    { reel_id: 5, y_offset:  1, max_rows: 3, has_subreel: false, subreel_position: '',       subreel_rows: 0, subreel_inherit_weight: false },
  ];

  function loadLayout() {
    try {
      const raw = localStorage.getItem(LS_LAYOUT_KEY);
      if (!raw) return DEFAULT_LAYOUT.map(r => ({ ...r }));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_LAYOUT.map(r => ({ ...r }));
      return arr.map(r => ({ ...makeReel(1), ...r }));
    } catch (e) {
      console.warn('[config-editor] loadLayout failed:', e);
      return DEFAULT_LAYOUT.map(r => ({ ...r }));
    }
  }
  function saveLayout(layout) {
    try {
      localStorage.setItem(LS_LAYOUT_KEY, JSON.stringify(layout));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveLayout failed:', e);
      return false;
    }
  }

  // ─── v5.3:動態賠付表(03c_Paytable)───
  // 每個符號持有 pay_rows: [{count:3, pay:1.0}, ...]
  // 舊欄位(pay_3x–6x)讀取後自動遷移;匯出時以 pay_rows 優先,並向下兼容保留舊欄位。
  function makePayRow(count, pay) {
    return { count: count || 3, pay: pay || 0 };
  }
  // 從舊 pay_3x–6x 遷移
  function migratePayRows(sym) {
    if (Array.isArray(sym.pay_rows) && sym.pay_rows.length > 0) return sym.pay_rows;
    const rows = [];
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const v = sym['pay_' + n + 'x'];
      if (v != null && Number(v) > 0) rows.push(makePayRow(n, Number(v)));
    }
    return rows.length > 0 ? rows : [
      makePayRow(3, 0), makePayRow(4, 0), makePayRow(5, 0),
    ];
  }

  // ─── v6.0-b:真實輪帶（04b_Reel_Strips）───
  //   strips[mode][reelId] = [symId, symId, ...]（實體輪帶序列;連續相同=stacked）
  //   啟用時引擎改「視窗抽樣」(隨機停點 → 讀連續視窗)，自然產生 stacking。
  const LS_REEL_STRIPS_KEY = 'slotplanner.aconfig.reelstrips.v1';
  function defaultReelStrips() {
    return { enabled: false, strips: {} };   // strips: {mode: {reelId: [sym,...]}}
  }
  function loadReelStrips() {
    try {
      const raw = localStorage.getItem(LS_REEL_STRIPS_KEY);
      if (!raw) return defaultReelStrips();
      const d = JSON.parse(raw);
      return {
        enabled: !!d.enabled,
        strips: (d.strips && typeof d.strips === 'object') ? d.strips : {},
      };
    } catch (e) {
      console.warn('[config-editor] loadReelStrips failed:', e);
      return defaultReelStrips();
    }
  }
  function saveReelStrips(obj) {
    try { localStorage.setItem(LS_REEL_STRIPS_KEY, JSON.stringify(obj)); return true; }
    catch (e) { console.warn('[config-editor] saveReelStrips failed:', e); return false; }
  }
  function parseStripStr(str) {
    if (Array.isArray(str)) return str.slice();
    if (typeof str !== 'string') return [];
    return str.split(',').map(x => x.trim()).filter(Boolean);
  }
  function stripToStr(arr) { return Array.isArray(arr) ? arr.join(', ') : ''; }
  function stripToWeights(strip) {
    const w = {};
    for (const s of (strip || [])) w[s] = (w[s] || 0) + 1;
    return w;
  }
  function weightsToStrip(weightMap, targetLen, stacked) {
    const entries = Object.entries(weightMap || {})
      .map(([sid, w]) => [sid, Number(w) || 0])
      .filter(([, w]) => w > 0);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    if (total <= 0 || !targetLen) return [];
    const alloc = entries.map(([sid, w]) => {
      const exact = w / total * targetLen;
      return { sid, base: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let used = alloc.reduce((a, x) => a + x.base, 0);
    alloc.sort((a, b) => b.frac - a.frac);
    let i = 0;
    while (used < targetLen) { alloc[i % alloc.length].base++; used++; i++; }
    if (stacked) {
      const order = entries.map(([sid]) => sid);
      const cntBy = {};
      alloc.forEach(a => { cntBy[a.sid] = a.base; });
      const out = [];
      for (const sid of order) for (let k = 0; k < (cntBy[sid] || 0); k++) out.push(sid);
      return out;
    }
    const remaining = {};
    alloc.forEach(a => { remaining[a.sid] = a.base; });
    const out = [];
    const ids = alloc.map(a => a.sid);
    let guard = 0;
    while (out.length < targetLen && guard < targetLen * 4) {
      for (const sid of ids) {
        if (remaining[sid] > 0) { out.push(sid); remaining[sid]--; if (out.length >= targetLen) break; }
      }
      guard++;
    }
    return out;
  }

  // ─── BonusItem 工廠(v6.0-c 起用於 bonus;v7.14 起為 ModeConfig.items 承載;v8.0 保留)───
  //   v8.0:bonus 小遊戲已併入 mode 玩法種類(mode_kind);移除 LS_BONUS_GAMES_KEY /
  //   defaultBonusGames / makeBonusGame / loadBonusGames / saveBonusGames。makeBonusItem 保留。
  function makeBonusItem(label, value, weight) {
    return {
      label: label || '',
      value: value || 0,        // ×注額（或收集門檻的累積數，依型別語義）
      weight: weight || 100,    // WHEEL/PICK 抽中權重;COLLECTION 不用
      link_jackpot: '',         // 連結 13_Jackpots（空=純值）
      is_end: false,            // PICK 專用:抽到即結束（pooper）
    };
  }

  // ─── v5.4:倍數系統(15_Multipliers)───
  // 三種倍數來源:
  //   WILD      — Wild 符號自帶倍數(固定值或權重表)
  //   PROGRESS  — cascade/連爆進度倍數階梯(每模式一條序列,如 NG 1-2-3-5)
  //   RANDOM    — 隨機倍數符號(出現時依權重表抽一個倍數)
  const LS_MULTIPLIERS_KEY = 'slotplanner.aconfig.multipliers.v1';
  function defaultMultipliers() {
    return {
      // WILD 倍數:適用符號 + 固定值或權重表
      wild_mult_enabled: false,
      wild_mult_values: [],     // Array<{mult, weight}>;空=不啟用權重,用 wild_mult_fixed
      wild_mult_fixed: 2,       // 權重表為空時的固定倍數
      // PROGRESS 階梯:每模式一條(mode → [1,2,3,5])
      progress_enabled: false,
      progress_ladders: {},     // { NG: [1,2,3,5], FG1: [2,4,6,10] }
      progress_reset_on_mode: true,   // 切模式是否重置(FG 常為不重置)
      // RANDOM 倍數符號:權重表
      random_enabled: false,
      random_symbol_id: '',     // 哪個符號帶隨機倍數(空=任意特定符號)
      random_values: [],        // Array<{mult, weight}>
      migrated_to_symbols: false,  // v6.3 / Q3:是否已把資料併入符號/模式(一次性遷移旗標)
    };
  }
  function makeMultValue(mult, weight) {
    return { mult: mult || 2, weight: weight || 100 };
  }
  function loadMultipliers() {
    try {
      const raw = localStorage.getItem(LS_MULTIPLIERS_KEY);
      if (!raw) return defaultMultipliers();
      const d = JSON.parse(raw);
      const def = defaultMultipliers();
      return {
        ...def, ...d,
        wild_mult_values: Array.isArray(d.wild_mult_values)
          ? d.wild_mult_values.map(v => ({ ...makeMultValue(), ...v })) : [],
        random_values: Array.isArray(d.random_values)
          ? d.random_values.map(v => ({ ...makeMultValue(), ...v })) : [],
        progress_ladders: (d.progress_ladders && typeof d.progress_ladders === 'object')
          ? d.progress_ladders : {},
      };
    } catch (e) {
      console.warn('[config-editor] loadMultipliers failed:', e);
      return defaultMultipliers();
    }
  }
  function saveMultipliers(obj) {
    try { localStorage.setItem(LS_MULTIPLIERS_KEY, JSON.stringify(obj)); return true; }
    catch (e) { console.warn('[config-editor] saveMultipliers failed:', e); return false; }
  }
  // 解析 "1,2,3,5" → [1,2,3,5];回傳合法遞增正數陣列
  function parseLadder(str) {
    if (typeof str !== 'string') return Array.isArray(str) ? str : [];
    return str.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x) && x > 0);
  }

  // ─── v5.4:金幣面額(16_Coin_Values)— Hold&Win 核心 ───
  // COIN 符號帶面額(×注額);面額可分模式設定權重表。
  // GRAND/MAJOR... 等固定獎也可掛在面額上(link_jackpot 指向 13_Jackpots 的 jp_id)。
  const LS_COIN_VALUES_KEY = 'slotplanner.aconfig.coinvalues.v1';
  function defaultCoinValues() {
    return {
      enabled: false,
      coin_symbol_id: 'COIN',   // 哪個符號是金幣(對應 03_Symbols 的 symbol_id)
      // 面額清單:每筆 {label, value, weight_by_mode:{NG:.., FG1:..}, link_jackpot}
      denominations: [],
    };
  }
  function makeCoinDenom(label, value) {
    return {
      label: label || '',       // 顯示名(可空;固定獎時填 GRAND 等)
      value: value || 1,        // 面額(×注額);link_jackpot 非空時此值可被 JP 覆蓋
      weight_by_mode: {},       // { NG: 100, FG1: 80 }
      link_jackpot: '',         // 對應 13_Jackpots 的 jp_id(空=純面額)
    };
  }

  // ─── v6.3 / Q3:符號自帶倍數 / 彩金倍數 entry-maker ───
  //   mult_values  項:{ mult, weight }      —「倍數」×N(× 數字前)
  //   prize_values 項:{ value, weight, link_jackpot, weight_by_mode } —「彩金倍數」N× / 金幣面額
  function makeMultValueEntry(mult, weight) {
    return { mult: Number(mult) || 2, weight: Number(weight) || 100 };
  }
  function makePrizeValueEntry(value, weight) {
    return {
      value: Number(value) || 1,
      weight: Number(weight) || 100,
      link_jackpot: '',
      weight_by_mode: {},
    };
  }

  // ─── v6.3 / Q3:一次性遷移 — 把舊 15_Multipliers / 16_Coin_Values 併入符號 + 模式 ───
  //   純函式:就地修改傳入的 symbols / modes 副本,回傳 { changed }。
  //   呼叫端負責:傳入 clone、遷移後設 multipliers.migrated_to_symbols = true 並存回。
  //   冪等:multipliers.migrated_to_symbols 為 true 時直接跳過。
  //   只在「目標符號該欄位為空」時才寫入,避免覆蓋使用者新資料。
  function migrateSymbolMults(symbols, multipliers, coinValues, modes) {
    const mp = multipliers || {};
    const cv = coinValues || {};
    symbols = Array.isArray(symbols) ? symbols : [];
    modes   = Array.isArray(modes) ? modes : [];
    if (mp.migrated_to_symbols) return { changed: false };
    let changed = false;

    const findSym = (sid) => {
      if (!sid) return null;
      return symbols.find(s => (s.symbol_id || '') === sid) ||
             symbols.find(s => s.name === sid) || null;
    };
    const isEmptyArr = (a) => !Array.isArray(a) || a.length === 0;

    // WILD → wild 符號 mult_values
    if (mp.wild_mult_enabled) {
      const vals = (Array.isArray(mp.wild_mult_values) && mp.wild_mult_values.length)
        ? mp.wild_mult_values.map(v => ({ mult: Number(v.mult) || 0, weight: Number(v.weight) || 0 }))
        : [{ mult: Number(mp.wild_mult_fixed) || 2, weight: 100 }];
      symbols.forEach(s => {
        if ((s.is_wild || s.type === 'WILD') && isEmptyArr(s.mult_values)) {
          s.mult_values = vals.map(v => ({ ...v }));
          changed = true;
        }
      });
    }

    // RANDOM → random_symbol_id 符號 mult_values
    if (mp.random_enabled && mp.random_symbol_id) {
      const tgt = findSym(mp.random_symbol_id);
      if (tgt && isEmptyArr(tgt.mult_values)) {
        tgt.mult_values = (Array.isArray(mp.random_values) ? mp.random_values : [])
          .map(v => ({ mult: Number(v.mult) || 0, weight: Number(v.weight) || 0 }));
        changed = true;
      }
    }

    // PROGRESS → 各模式 progress_ladder / progress_reset
    if (mp.progress_enabled) {
      const ladders = (mp.progress_ladders && typeof mp.progress_ladders === 'object') ? mp.progress_ladders : {};
      const resetGlobal = mp.progress_reset_on_mode !== false;
      modes.forEach(md => {
        const arr = ladders[md.mode];
        if (Array.isArray(arr) && arr.length && isEmptyArr(md.progress_ladder)) {
          md.progress_ladder = arr.map(Number).filter(n => !isNaN(n) && n > 0);
          md.progress_reset = resetGlobal;
          changed = true;
        }
      });
    }

    // COIN denominations → coin 符號 prize_values
    if (cv.enabled && Array.isArray(cv.denominations) && cv.denominations.length) {
      const tgt = findSym(cv.coin_symbol_id || 'COIN') || symbols.find(s => s.type === 'COIN');
      if (tgt && isEmptyArr(tgt.prize_values)) {
        tgt.prize_values = cv.denominations.map(d => ({
          value: Number(d.value) || 0,
          weight: 100,
          link_jackpot: d.link_jackpot || '',
          weight_by_mode: (d.weight_by_mode && typeof d.weight_by_mode === 'object') ? { ...d.weight_by_mode } : {},
        }));
        changed = true;
      }
    }

    return { changed };
  }
  function loadCoinValues() {
    try {
      const raw = localStorage.getItem(LS_COIN_VALUES_KEY);
      if (!raw) return defaultCoinValues();
      const d = JSON.parse(raw);
      const def = defaultCoinValues();
      return {
        ...def, ...d,
        denominations: Array.isArray(d.denominations)
          ? d.denominations.map(dn => ({
              ...makeCoinDenom(), ...dn,
              weight_by_mode: (dn.weight_by_mode && typeof dn.weight_by_mode === 'object')
                ? dn.weight_by_mode : {},
            }))
          : [],
      };
    } catch (e) {
      console.warn('[config-editor] loadCoinValues failed:', e);
      return defaultCoinValues();
    }
  }
  function saveCoinValues(obj) {
    try { localStorage.setItem(LS_COIN_VALUES_KEY, JSON.stringify(obj)); return true; }
    catch (e) { console.warn('[config-editor] saveCoinValues failed:', e); return false; }
  }

  // ─── v5.3:投注結構(14_Bet_Config)───

  // ─── v5.3:投注結構(14_Bet_Config)───
  const LS_BET_CONFIG_KEY = 'slotplanner.aconfig.betconfig.v1';
  function defaultBetConfig() {
    return {
      // ── Extra Bet(原 Ante Bet;欄位名保留 ante_bet_* 維持 14_Bet_Config 匯出契約)──
      ante_bet_enabled:  false,    // 是否啟用 Extra Bet(加押)
      ante_bet_mult:     1.25,     // 成本倍數(預設 ×1.25 注額)
      ante_bet_trigger_mult: 2.0,  // 觸發機率乘數(如 SCAT 觸發率 ×2)
      ante_bet_desc:     '',       // 企劃說明(供文件生成)
      // ── Buy Feature(購買)──
      buy_feature_enabled: false,  // v6.2 #2:Buy Feature 主開關(先決定啟用,再顯示項目)
      buy_features: [],            // Array<BuyFeatureDef>
    };
  }
  function makeBuyFeature(mode) {
    return {
      bf_id:        `BF_${(mode || 'FG').toUpperCase()}`,
      target_mode:  mode || '',    // 購買後進入的模式名
      cost_mult:    80,            // 成本倍數(×注額)
      rtp_target:   96,            // 此功能獨立 RTP 目標 %
      enabled:      true,
      notes:        '',
    };
  }
  function loadBetConfig() {
    try {
      const raw = localStorage.getItem(LS_BET_CONFIG_KEY);
      if (!raw) return defaultBetConfig();
      const d = JSON.parse(raw);
      const def = defaultBetConfig();
      const bfs = Array.isArray(d.buy_features)
        ? d.buy_features.map(bf => ({ ...makeBuyFeature(''), ...bf }))
        : [];
      return {
        ...def,
        ...d,
        // 舊設定沒有此旗標但已有購買項目 → 視為啟用,避免既有資料被藏起來
        buy_feature_enabled: (d.buy_feature_enabled != null) ? !!d.buy_feature_enabled : bfs.length > 0,
        buy_features: bfs,
      };
    } catch (e) {
      console.warn('[config-editor] loadBetConfig failed:', e);
      return defaultBetConfig();
    }
  }
  function saveBetConfig(obj) {
    try {
      localStorage.setItem(LS_BET_CONFIG_KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveBetConfig failed:', e);
      return false;
    }
  }

  // ─── v5.1:JP 定義(13_Jackpots;選用分頁,引擎忽略;文件生成自動帶入)───
  const LS_JACKPOTS_KEY = 'slotplanner.aconfig.jackpots.v1';
  function makeJackpot(jp_id) {
    return {
      jp_id: jp_id || 'JP1',
      name: '',            // 顯示名(GRAND / MAJOR / ...)
      kind: 'FIXED',       // v5.2:FIXED 固定倍數 / PROGRESSIVE 累積彩池
      mult: 0,             // FIXED:倍數(×注額);PROGRESSIVE:起始彩池 seed(×注額)
      increment_pct: 0,    // v5.2:PROGRESSIVE 注金抽成 %(0–100,文件/數值用)
      must_hit_by: 0,      // v5.2:必開上限(×注額;0=無)
      trigger_desc: '',    // 觸發說明(自由文字;空白時文件改用下列結構化欄位組合)
      // v6.2 #4:觸發拼圖 — ACCUMULATE 累積 / COLLECT 收集
      trigger_type:  'COLLECT',
      accum_pct:     0,    // 累積:押注提撥 %(每注貢獻)
      accum_mech:    '',   // 累積:或指定機制 / 符號(文字)
      collect_prob:  0,    // 收集:觸發符號出現機率 %
      collect_enter: '',   // 收集:或需進入哪個模式(FG/BG)才開始收集
      mode_scope: 'ALL',   // 適用模式(ALL 或模式名,逗號分隔)
      notes: '',
    };
  }
  function loadJackpots() {
    try {
      const raw = localStorage.getItem(LS_JACKPOTS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(j => ({ ...makeJackpot(''), ...j }));
    } catch (e) {
      console.warn('[config-editor] loadJackpots failed:', e);
      return [];
    }
  }
  function saveJackpots(arr) {
    try {
      localStorage.setItem(LS_JACKPOTS_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveJackpots failed:', e);
      return false;
    }
  }

  // ─── v4.7:自由副盤 (Panel) + 符號集 ───
  const LS_PANELS_KEY = 'slotplanner.aconfig.panels.v1';
  const LS_SYMBOLSETS_KEY = 'slotplanner.aconfig.symbolsets.v1';

  function makePanel(panel_id) {
    return {
      panel_id: panel_id || 'P1',
      col: 0, row: 0, width: 3, height: 3,
      cells: null,            // v7.x:活格遮罩 ["dx,dy",…](相對外框);null = 整塊矩形(向後相容)
      scroll: true,           // 保留(=panel_type==='SCROLL');維持 02b_Panels 的 Scroll 欄與 py 契約
      panel_type: 'SCROLL',   // v6.2 盤面#4/#12:SCROLL 滾動 / COLLECT 蒐集 / TRIGGER 觸發
      trigger_symbol: '',     // v6.2:TRIGGER 型 — 由哪個符號滾出時激活
      trigger_reel: 0,        // v6.3 / Q2(c):TRIGGER 指定輪(0=任意輪;1..n=指定)
      collect_target_jp: '',  // v6.3 / Q2(b):COLLECT 型副盤餵入的 JP(jp_id;限 COLLECT 型 JP)
      symbol_set: '',
      inherit_weight: true,   // 預設沿用主輪保底，避免空盤
      join_payline: false,    // 預設不參與主盤連線（你的決策:可自行選）
      note: '',
    };
  }
  function loadPanels() {
    try {
      const raw = localStorage.getItem(LS_PANELS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(p => {
        const merged = { ...makePanel(p.panel_id), ...p };
        // v6.2 遷移:舊資料無 panel_type → 依舊的 scroll 布林推導(滾動→SCROLL,否則→COLLECT)
        if (!p.panel_type) merged.panel_type = (p.scroll === false ? 'COLLECT' : 'SCROLL');
        merged.scroll = (merged.panel_type === 'SCROLL');   // 同步,維持匯出契約
        merged.cells = Array.isArray(merged.cells) ? normalizeMask(merged.cells, merged.width, merged.height) : null;
        return merged;
      });
    } catch (e) {
      console.warn('[config-editor] loadPanels failed:', e);
      return [];
    }
  }
  function savePanels(panels) {
    try { localStorage.setItem(LS_PANELS_KEY, JSON.stringify(panels)); return true; }
    catch (e) { console.warn('[config-editor] savePanels failed:', e); return false; }
  }

  // ── v7.x:panel 形狀遮罩(外框 + 活格遮罩)。cells=null → 整塊矩形 ──
  const PANEL_TYPES = ['SCROLL', 'COLLECT', 'TRIGGER', 'STAGE'];   // +STAGE = 演出/負空間
  function isStagePanel(p) { return !!(p && p.panel_type === 'STAGE'); }
  function _panelCellKey(c, r) { return c + ',' + r; }
  function panelCellSet(p) {
    const out = new Set();
    if (!p) return out;
    const col = p.col | 0, row = p.row | 0;
    const w = Math.max(1, p.width | 0), h = Math.max(1, p.height | 0);
    const mask = Array.isArray(p.cells) && p.cells.length ? p.cells : null;
    if (!mask) { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.add(_panelCellKey(col + dx, row + dy)); return out; }
    for (const s of mask) {
      const m = /^(-?\d+),(-?\d+)$/.exec(String(s).trim()); if (!m) continue;
      const dx = +m[1], dy = +m[2];
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      out.add(_panelCellKey(col + dx, row + dy));
    }
    return out;
  }
  function normalizeMask(cells, width, height) {
    const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
    if (!Array.isArray(cells)) return null;
    const seen = new Set();
    for (const s of cells) {
      const m = /^(-?\d+),(-?\d+)$/.exec(String(s).trim()); if (!m) continue;
      const dx = +m[1], dy = +m[2];
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      seen.add(dx + ',' + dy);
    }
    if (seen.size === 0 || seen.size === w * h) return null;   // 空或滿格 → 收斂成 null(整塊矩形)
    return [...seen].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return ay - by || ax - bx; });
  }
  function maskToStr(cells) { return Array.isArray(cells) && cells.length ? cells.join(';') : ''; }
  function maskStrToCells(str) { const s = String(str || '').trim(); if (!s) return null; const a = s.split(/[;\s]+/).filter(Boolean); return a.length ? a : null; }

  function loadSymbolSets() {
    try {
      const raw = localStorage.getItem(LS_SYMBOLSETS_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (e) {
      console.warn('[config-editor] loadSymbolSets failed:', e);
      return {};
    }
  }
  function saveSymbolSets(sets) {
    try { localStorage.setItem(LS_SYMBOLSETS_KEY, JSON.stringify(sets)); return true; }
    catch (e) { console.warn('[config-editor] saveSymbolSets failed:', e); return false; }
  }

  // ──────────────────────────────────────────────────────────
  //  12_Distribution_Bins 預設值與驗證
  // ──────────────────────────────────────────────────────────
  const LS_BINS_KEY = 'slotplanner.aconfig.bins.v1';

  const DEFAULT_BINS = {
    NG:  { bin_edges: '0, 0.001, 2, 10, 50',         notes: 'NG 細顆粒區間' },
    FG1: { bin_edges: '0, 0.001, 20, 30, 60, 120, 600', notes: 'FG 細顆粒區間' },
    FG2: { bin_edges: '0, 0.001, 20, 30, 60, 120, 600', notes: '可獨立設定' },
    BG:  { bin_edges: '0, 0.001, 50, 200, 1000',     notes: '' },
  };
  const DEFAULT_BIN_EDGES = '0, 0.001, 2, 10, 50';

  function loadBins() {
    try {
      const raw = localStorage.getItem(LS_BINS_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_BINS));
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return JSON.parse(JSON.stringify(DEFAULT_BINS));
      return obj;
    } catch (e) {
      console.warn('[config-editor] loadBins failed:', e);
      return JSON.parse(JSON.stringify(DEFAULT_BINS));
    }
  }
  function saveBins(bins) {
    try {
      localStorage.setItem(LS_BINS_KEY, JSON.stringify(bins));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveBins failed:', e);
      return false;
    }
  }

  // 解析 bin_edges 字串為數字陣列,回傳驗證結果
  function parseBinEdges(str) {
    if (!str || !str.trim()) {
      return { valid: false, msg: '不能為空', edges: [] };
    }
    const parts = str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const nums = [];
    for (const p of parts) {
      const n = Number(p);
      if (Number.isNaN(n)) return { valid: false, msg: `「${p}」不是有效數字`, edges: [] };
      nums.push(n);
    }
    if (nums.length < 2) return { valid: false, msg: '至少需要 2 個邊界值', edges: nums };
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) {
        return { valid: false, msg: `第 ${i + 1} 個值「${nums[i]}」必須大於前一個「${nums[i - 1]}」(必須嚴格遞增)`, edges: nums };
      }
    }
    return { valid: true, msg: '', edges: nums };
  }

  // ──────────────────────────────────────────────────────────
  //  06_Paylines 預設值與驗證
  // ──────────────────────────────────────────────────────────
  const LS_PAYLINES_KEY = 'slotplanner.aconfig.paylines.v1';
  const PAYLINE_DIRECTIONS = ['LTR', 'RTL', 'BOTH'];

  function makePayline(line_id) {
    return { line_id, path: '', direction: 'LTR', notes: '' };
  }

  const DEFAULT_PAYLINES = [
    { line_id: 1, path: '(1,1)-(2,1)-(3,1)-(4,1)-(5,1)', direction: 'LTR', notes: '頂列直線' },
    { line_id: 2, path: '(1,2)-(2,2)-(3,2)-(4,2)-(5,2)', direction: 'LTR', notes: '中央橫線' },
    { line_id: 3, path: '(1,3)-(2,3)-(3,3)-(4,3)-(5,3)', direction: 'LTR', notes: '底列直線' },
    { line_id: 4, path: '(1,1)-(2,2)-(3,3)-(4,2)-(5,1)', direction: 'LTR', notes: 'V 型' },
    { line_id: 5, path: '(1,3)-(2,2)-(3,1)-(4,2)-(5,3)', direction: 'LTR', notes: '倒 V 型' },
  ];

  function loadPaylines() {
    try {
      const raw = localStorage.getItem(LS_PAYLINES_KEY);
      if (!raw) return DEFAULT_PAYLINES.map(p => ({ ...p }));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_PAYLINES.map(p => ({ ...p }));
      return arr.map(p => ({ ...makePayline(1), ...p }));
    } catch (e) {
      console.warn('[config-editor] loadPaylines failed:', e);
      return DEFAULT_PAYLINES.map(p => ({ ...p }));
    }
  }
  function savePaylines(arr) {
    try {
      localStorage.setItem(LS_PAYLINES_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] savePaylines failed:', e);
      return false;
    }
  }

  // 解析 "(R,r)-(R,r)-..." 為點陣列
  function parsePathString(str) {
    if (!str || !str.trim()) return { valid: false, msg: '路徑不能為空', points: [] };
    const matches = str.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!matches || matches.length === 0) {
      return { valid: false, msg: '找不到 (R,r) 格式的座標', points: [] };
    }
    const points = matches.map(m => {
      const inner = m.replace(/[()]/g, '');
      const [R, r] = inner.split(',').map(s => parseInt(s.trim(), 10));
      return { reel: R, row: r };
    });
    if (points.length < 2) return { valid: false, msg: '路徑至少需要 2 個點', points };
    return { valid: true, msg: '', points };
  }

  function validatePayline(pl, layoutArr) {
    const parsed = parsePathString(pl.path);
    if (!parsed.valid) return parsed;
    for (let i = 0; i < parsed.points.length; i++) {
      const { reel, row } = parsed.points[i];
      if (reel < 1 || reel > layoutArr.length) {
        return { valid: false, msg: `第 ${i+1} 點:R${reel} 超出範圍(1–${layoutArr.length})`, points: parsed.points };
      }
      const reelDef = layoutArr[reel - 1];
      if (row < 1 || row > reelDef.max_rows) {
        return { valid: false, msg: `第 ${i+1} 點:R${reel} 列 ${row} 超出範圍(1–${reelDef.max_rows})`, points: parsed.points };
      }
    }
    return { valid: true, msg: '', points: parsed.points };
  }

  // ──────────────────────────────────────────────────────────
  //  v6.2 / Q4:中獎線自動產生（純函式，無 Vue 依賴，可單測）
  //
  //  generatePaylinePoints(opts) → { points, available, capped, reason }
  //    opts.reelCount  輪數
  //    opts.rows       number[]，每輪 max_rows（長度 = reelCount）
  //    opts.method     'general'（一般線，maxStep=2）| 'adjacent'（相鄰≤1，maxStep=1）
  //    opts.count      要產生幾條（10–50 由 UI 夾擠，這裡只做安全夾擠）
  //    opts.lineMode   true 時強制「前 3 格不重複」（對齊後端 a_loader 與重疊偵測）
  //
  //  排序策略（升序，越前面越「常見/對稱/好看」）：
  //    tier 0 = 保證集（依序：水平 top→down、V、Λ、對角下 Z、對角上 N）
  //    tier 1 = 其餘平滑線，依 niceness 分數（總位移 + 單步 + 對稱 + 轉折）
  //
  //  決策（已確認）：(a) maxStep=2、水平 top→down、不規則盤面由 UI 端先擋。
  // ──────────────────────────────────────────────────────────
  function _clampRow(row, ri, rows) {
    const hi = rows[ri] || 1;
    return Math.min(Math.max(row, 1), hi);
  }

  // 列舉所有「相鄰輪列差 ≤ maxStep」的線（DFS，每輪夾在 1..rows[i]）
  function _enumerateSmoothLines(reelCount, rows, maxStep) {
    const out = [];
    const path = new Array(reelCount);
    (function dfs(i, prevRow) {
      if (i === reelCount) { out.push(path.slice()); return; }
      const hiRow = rows[i] || 1;
      const lo = i === 0 ? 1 : Math.max(1, prevRow - maxStep);
      const hi = i === 0 ? hiRow : Math.min(hiRow, prevRow + maxStep);
      for (let r = lo; r <= hi; r++) {
        path[i] = { reel: i + 1, row: r };
        dfs(i + 1, r);
      }
    })(0, 0);
    return out;
  }

  function _lineToKey(line) {
    return line.map(p => `${p.reel},${p.row}`).join('-');
  }
  function _linePrefix3(line) {
    return line.slice(0, 3).map(p => `${p.reel},${p.row}`).join('-');
  }

  // 保證集形狀產生器（與 PAYLINE_PRESETS 同邏輯，但獨立、可夾擠）
  function _buildGuaranteedLines(reelCount, rows, maxStep) {
    const n = reelCount;
    const mid = (n - 1) / 2;
    const lines = [];
    // 1) 水平線 row = 1..maxH（top→down）
    const maxH = rows.reduce((m, h) => Math.max(m, h || 1), 1);
    for (let k = 1; k <= maxH; k++) {
      lines.push({
        name: k === 1 ? '頂列直線' : (k === maxH ? '底列直線' : `第 ${k} 列橫線`),
        line: Array.from({ length: n }, (_, i) => ({ reel: i + 1, row: _clampRow(k, i, rows) })),
      });
    }
    // 2) V 型（中間最深 / 靠底）
    lines.push({
      name: 'V 型',
      line: Array.from({ length: n }, (_, i) => {
        const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;   // 0 中心,1 邊緣
        const row = Math.max(1, Math.round((rows[i] || 1) - t * ((rows[i] || 1) - 1)));
        return { reel: i + 1, row: _clampRow((rows[i] || 1) - row + 1, i, rows) };
      }),
    });
    // 3) 倒 V 型（中間到頂）
    lines.push({
      name: '倒 V 型',
      line: Array.from({ length: n }, (_, i) => {
        const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;
        const row = Math.max(1, Math.round(1 + t * ((rows[i] || 1) - 1)));
        return { reel: i + 1, row: _clampRow(row, i, rows) };
      }),
    });
    // 4) 對角下行 Z（頂→底）
    lines.push({
      name: '對角(下行)',
      line: Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0 : i / (n - 1);
        return { reel: i + 1, row: _clampRow(Math.round(1 + t * ((rows[i] || 1) - 1)), i, rows) };
      }),
    });
    // 5) 對角上行 N（底→頂）
    lines.push({
      name: '對角(上行)',
      line: Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0 : i / (n - 1);
        return { reel: i + 1, row: _clampRow(Math.round((rows[i] || 1) - t * ((rows[i] || 1) - 1)), i, rows) };
      }),
    });
    // 只保留滿足 maxStep 限制者（保證集不可違反當前 maxStep,否則注入非法線）
    const passed = [];
    for (const item of lines) {
      let ok = true;
      for (let i = 1; i < item.line.length; i++) {
        if (Math.abs(item.line[i].row - item.line[i - 1].row) > maxStep) { ok = false; break; }
      }
      if (ok) passed.push(item);
    }
    return passed;
  }

  // niceness 分數（越低越好）
  function _lineNiceness(line) {
    let travel = 0, maxStep = 0, turns = 0, prevSign = 0;
    for (let i = 1; i < line.length; i++) {
      const d = line[i].row - line[i - 1].row;
      const ad = Math.abs(d);
      travel += ad;
      if (ad > maxStep) maxStep = ad;
      const sign = d > 0 ? 1 : (d < 0 ? -1 : 0);
      if (sign !== 0) {
        if (prevSign !== 0 && sign !== prevSign) turns++;
        prevSign = sign;
      }
    }
    // 非對稱(非回文)罰分:sym=1 表示左右不對稱 → 下方 +6 罰分(對稱線更優先)
    let sym = 0;
    const n = line.length;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      if (line[i].row !== line[n - 1 - i].row) { sym = 1; break; }
    }
    return travel + maxStep * 2 + sym * 6 + turns * 2;
  }

  // 主產生器
  function generatePaylinePoints(opts) {
    opts = opts || {};
    const reelCount = Math.max(1, Number(opts.reelCount) || 0);
    const rows = Array.isArray(opts.rows) && opts.rows.length === reelCount
      ? opts.rows.map(r => Math.max(1, Number(r) || 1))
      : Array.from({ length: reelCount }, () => 3);
    const method = opts.method === 'adjacent' ? 'adjacent' : 'general';
    const maxStep = method === 'adjacent' ? 1 : 2;
    const lineMode = opts.lineMode !== false;   // 預設依 LINE 規則去前 3 格重複
    let count = Math.max(1, Math.floor(Number(opts.count) || 0));

    if (reelCount < 1) return { points: [], available: 0, capped: false, reason: 'no-reels' };

    // 1) 候選池（含水平/V/Λ/對角等所有 ≤maxStep 平滑線）
    const pool = _enumerateSmoothLines(reelCount, rows, maxStep);

    // 2) 保證集排序索引
    const guaranteed = _buildGuaranteedLines(reelCount, rows, maxStep);
    const gOrder = new Map();      // key → 排序索引
    const gName  = new Map();      // key → 形狀名（寫入 notes）
    guaranteed.forEach((item, idx) => {
      const k = _lineToKey(item.line);
      if (!gOrder.has(k)) { gOrder.set(k, idx); gName.set(k, item.name); }
    });

    // 3) 去重 + 評分
    const seenKey = new Set();
    const scored = [];
    for (const line of pool) {
      const k = _lineToKey(line);
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      const gIdx = gOrder.has(k) ? gOrder.get(k) : null;
      scored.push({
        line, key: k,
        tier: gIdx != null ? 0 : 1,
        rank: gIdx != null ? gIdx : _lineNiceness(line),
        name: gIdx != null ? gName.get(k) : '',
      });
    }
    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);   // 決定性 tie-break
    });

    // 4) 依序採用（LINE 模式強制前 3 格不重複），先算可用上限再夾擠 count
    const accepted = [];
    const prefixSeen = new Set();
    for (const s of scored) {
      if (lineMode && reelCount >= 3) {
        const p3 = _linePrefix3(s.line);
        if (prefixSeen.has(p3)) continue;
        prefixSeen.add(p3);
      }
      accepted.push(s);
    }
    const available = accepted.length;
    const capped = count > available;
    const take = Math.min(count, available);
    const out = accepted.slice(0, take).map((s, i) => ({
      points: s.line.map(p => ({ reel: p.reel, row: p.row })),
      name: s.name,
      seq: i + 1,
    }));
    return { points: out, available, capped, reason: '' };
  }

  // ──────────────────────────────────────────────────────────
  //  07_Constraints 預設值與驗證
  // ──────────────────────────────────────────────────────────
  const LS_CONSTRAINTS_KEY = 'slotplanner.aconfig.constraints.v1';
  const CONSTRAINT_TYPES = ['REEL_RESTRICT', 'GLOBAL_MAX', 'GLOBAL_MIN'];

  function makeConstraint(id) {
    return {
      constraint_id: id || '',
      ctype: 'REEL_RESTRICT',
      symbol_id: '',
      reels_allowed: '',
      threshold: 0,
      mode_scope: 'ALL',
      notes: '',
    };
  }

  const DEFAULT_CONSTRAINTS = [
    { constraint_id: 'C001', ctype: 'REEL_RESTRICT', symbol_id: 'WILD', reels_allowed: '2,3,4', threshold: 0, mode_scope: 'ALL', notes: 'Wild 只能在中間 3 Reel' },
    { constraint_id: 'C002', ctype: 'GLOBAL_MAX',    symbol_id: 'SCAT', reels_allowed: '',      threshold: 3, mode_scope: 'NG',  notes: 'NG 全盤最多 3 個 Scatter' },
    { constraint_id: 'C003', ctype: 'GLOBAL_MAX',    symbol_id: 'MEGA', reels_allowed: '',      threshold: 1, mode_scope: 'ALL', notes: 'Mega Wild 全盤最多 1 個' },
  ];

  function loadConstraints() {
    try {
      const raw = localStorage.getItem(LS_CONSTRAINTS_KEY);
      if (!raw) return DEFAULT_CONSTRAINTS.map(c => ({ ...c }));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_CONSTRAINTS.map(c => ({ ...c }));
      return arr.map(c => ({ ...makeConstraint(''), ...c }));
    } catch (e) {
      console.warn('[config-editor] loadConstraints failed:', e);
      return DEFAULT_CONSTRAINTS.map(c => ({ ...c }));
    }
  }
  function saveConstraints(arr) {
    try {
      localStorage.setItem(LS_CONSTRAINTS_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveConstraints failed:', e);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  07b_Gen_Limits 產牌限制 / 生成期約束(v7.11)
  //   長格式:一條 = 一個符號 × 一個 zone × (min, max) × mode_scope。
  //   zone:'MAIN' / 'SUB:<reel_id>' / 'PANEL:<panel_id>'(單一真相,對齊 02_Layout/02b_Panels)。
  //   本工具僅描述 + 帶資料 + 文件輸出,不執行(供下游模擬工具消費)。
  // ──────────────────────────────────────────────────────────
  const LS_GENLIMITS_KEY = 'slotplanner.aconfig.genLimits.v1';

  function makeGenLimit(id) {
    return {
      limit_id: id || '',
      symbol_id: '',
      zone: 'MAIN',
      min_count: 0,           // 0 = 無下限
      max_count: null,        // null/'' = 無上限
      mode_scope: 'ALL',
      notes: '',
    };
  }

  function loadGenLimits() {
    // 舊檔無此 key → 空陣列(向後相容);本功能無預設範例資料。
    try {
      const raw = localStorage.getItem(LS_GENLIMITS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(g => ({ ...makeGenLimit(''), ...g }));
    } catch (e) {
      console.warn('[config-editor] loadGenLimits failed:', e);
      return [];
    }
  }

  function saveGenLimits(arr) {
    try {
      localStorage.setItem(LS_GENLIMITS_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveGenLimits failed:', e);
      return false;
    }
  }

  // 由 layout(主輪含副輪旗標)+ panels 動態產生可用 zone 選項。
  //   layoutRows:[{reel_id, has_subreel, ...}];panelRows:[{panel_id, ...}]。
  //   回傳 [{value, label}],供前端 zone 下拉使用(單一真相,避免填到不存在的 zone)。
  function genLimitZones(layoutRows, panelRows) {
    const out = [{ value: 'MAIN', label: '主盤整體' }];
    for (const r of (Array.isArray(layoutRows) ? layoutRows : [])) {
      if (!r) continue;
      const hasSub = r.has_subreel === true || r.has_subreel === 'true' || r.has_subreel === 1;
      const rid = r.reel_id != null ? r.reel_id : r.reelId;
      if (hasSub && rid != null) {
        out.push({ value: `SUB:${rid}`, label: `R${rid} 副輪` });
      }
    }
    for (const p of (Array.isArray(panelRows) ? panelRows : [])) {
      if (!p) continue;
      const pid = p.panel_id != null ? p.panel_id : p.panelId;
      if (pid) out.push({ value: `PANEL:${pid}`, label: `副盤 ${pid}` });
    }
    return out;
  }

  // 把 zone 字串轉成人話(供 docgen / UI 摘要)。layout/panel 不在手邊時退化為原字串解碼。
  function genLimitZoneLabel(zone) {
    const z = String(zone || 'MAIN');
    if (z === 'MAIN') return '主盤整體';
    if (z.startsWith('SUB:'))   return `R${z.slice(4)} 副輪`;
    if (z.startsWith('PANEL:')) return `副盤 ${z.slice(6)}`;
    return z;
  }

  // 驗證單條 gen-limit:回 {kind:'ok'|'warn'|'err', msg}。
  //   err:limit_id 空 / 重複、min>max。warn:未指定符號、min&max 皆空(此條無意義)。
  function genLimitStatus(gl, dupIds) {
    if (!gl) return { kind: 'err', msg: '空白' };
    const id = (gl.limit_id || '').trim();
    if (!id) return { kind: 'err', msg: 'Limit_ID 為空' };
    if (dupIds && dupIds.has && dupIds.has(id)) return { kind: 'err', msg: `編號「${id}」重複` };
    const hasMin = gl.min_count != null && gl.min_count !== '' && Number(gl.min_count) > 0;
    const hasMax = gl.max_count != null && gl.max_count !== '';
    if (hasMin && hasMax && Number(gl.min_count) > Number(gl.max_count)) {
      return { kind: 'err', msg: `下限(${gl.min_count}) 不可大於上限(${gl.max_count})` };
    }
    if (!gl.symbol_id || !String(gl.symbol_id).trim()) return { kind: 'warn', msg: '未指定符號' };
    if (!hasMin && !hasMax) return { kind: 'warn', msg: '未設定上下限(此條無作用)' };
    return { kind: 'ok', msg: '' };
  }

  // 把一條 gen-limit 轉白話(供列表 title / docgen)。
  function humanizeGenLimit(gl) {
    if (!gl) return '';
    const sid = gl.symbol_id || '?';
    const zone = genLimitZoneLabel(gl.zone);
    const scope = (gl.mode_scope && gl.mode_scope !== 'ALL') ? `(僅 ${gl.mode_scope} 模式)` : '';
    const hasMin = gl.min_count != null && gl.min_count !== '' && Number(gl.min_count) > 0;
    const hasMax = gl.max_count != null && gl.max_count !== '';
    let range;
    if (hasMin && hasMax) range = `${gl.min_count}~${gl.max_count} 個`;
    else if (hasMin)      range = `至少 ${gl.min_count} 個`;
    else if (hasMax)      range = `至多 ${gl.max_count} 個`;
    else                  range = '(未設定數量)';
    return `${scope}「${sid}」在 ${zone} 內 ${range}`;
  }


  // ──────────────────────────────────────────────────────────
  //  04_Reel_Weights 預設值與儲存(Mode × Reel × Symbol → weight)
  // ──────────────────────────────────────────────────────────
  const LS_REELW_KEY = 'slotplanner.aconfig.reelweights.v1';

  function loadReelWeights() {
    try {
      const raw = localStorage.getItem(LS_REELW_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }
  function saveReelWeights(o) {
    try {
      localStorage.setItem(LS_REELW_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }

  // ──────────────────────────────────────────────────────────
  //  05_Grid_Size_Weights 預設值與儲存(Mode × Reel × Size → weight)
  // ──────────────────────────────────────────────────────────
  const LS_GRIDW_KEY = 'slotplanner.aconfig.gridweights.v1';
  const DEFAULT_GRID_SIZES = [3, 4, 5, 6];

  function loadGridWeights() {
    try {
      const raw = localStorage.getItem(LS_GRIDW_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }
  function saveGridWeights(o) {
    try {
      localStorage.setItem(LS_GRIDW_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }

  // 解析 "3, 4, 5, 6" 為正整數陣列(已 dedupe + 排序),失敗回 null
  function parseGridSizes(str) {
    if (!str || !str.trim()) return null;
    const parts = str.split(/[,\s]+/).filter(Boolean);
    const nums = [];
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (Number.isNaN(n) || n < 1 || n > 20) return null;
      nums.push(n);
    }
    if (nums.length === 0) return null;
    return [...new Set(nums)].sort((a, b) => a - b);
  }

  // ──────────────────────────────────────────────────────────
  //  08_Combo_Weights 預設值與儲存(Mode × Combo_Step × Reel × Symbol → weight)
  // ──────────────────────────────────────────────────────────
  const LS_COMBO_KEY = 'slotplanner.aconfig.comboweights.v1';

  function loadComboWeights() {
    try {
      const raw = localStorage.getItem(LS_COMBO_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }
  function saveComboWeights(o) {
    try {
      localStorage.setItem(LS_COMBO_KEY, JSON.stringify(o));
      return true;
    } catch (e) { return false; }
  }

  // ──────────────────────────────────────────────────────────
  //  10_Discard_Rules 預設值與儲存
  // ──────────────────────────────────────────────────────────
  const LS_DISCARD_KEY = 'slotplanner.aconfig.discards.v1';
  const DISCARD_KINDS = ['HARD', 'SOFT'];

  function makeDiscard(id) {
    return {
      discard_id: id || '',
      discard_kind: 'HARD',
      mode_scope: 'ALL',
      condition: '',
      notes: '',
    };
  }

  const DEFAULT_DISCARDS = [
    { discard_id: 'D001', discard_kind: 'HARD', mode_scope: 'ALL',
      condition: 'symbol_count.SCAT >= 5',
      notes: '全盤 Scatter 過多,視為異常局' },
    { discard_id: 'D002', discard_kind: 'HARD', mode_scope: 'NG',
      condition: 'global.total_payout > global.coin_pool * 0.5',
      notes: '單局 payout 過大,需檢視' },
    { discard_id: 'D003', discard_kind: 'SOFT', mode_scope: 'FG1',
      condition: 'spin_locals.fg_combo_count == 0',
      notes: 'FG 完全沒中,體感極差' },
    { discard_id: 'D004', discard_kind: 'SOFT', mode_scope: 'NG',
      condition: 'total_multiplier > 0 AND total_multiplier < 0.5',
      notes: '極小中獎,使用者感受不到' },
  ];

  function loadDiscards() {
    try {
      const raw = localStorage.getItem(LS_DISCARD_KEY);
      if (!raw) return DEFAULT_DISCARDS.map(d => ({ ...d }));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_DISCARDS.map(d => ({ ...d }));
      return arr.map(d => ({ ...makeDiscard(''), ...d }));
    } catch (e) {
      console.warn('[config-editor] loadDiscards failed:', e);
      return DEFAULT_DISCARDS.map(d => ({ ...d }));
    }
  }
  function saveDiscards(arr) {
    try {
      localStorage.setItem(LS_DISCARD_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveDiscards failed:', e);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  09_Puzzle_Rules 預設值與儲存
  // ══════════════════════════════════════════════════════════
  const LS_RULES_KEY = 'slotplanner.aconfig.rules.v1';

  // 觸發點清單(對齊後端 schemas.TriggerType,順序按 spin 生命週期排)
  //   每項含 desc 給 hint 用;若引入新觸發點要先在 schemas.py 註冊
  const TRIGGER_CATALOG = [
    { type: 'ON_SPIN_START',     label: '🎰 Spin 開始',      desc: '單次 spin 開始(在轉軸抽樣前,可用來重置 spin_locals)' },
    { type: 'ON_GRID_GENERATED', label: '🧱 盤面生成',        desc: '抽樣完成、落盤後(可改變盤面、做 STICKY/LOCK_REEL)' },
    { type: 'ON_WIN_RESOLVED',   label: '🏆 中獎結算',        desc: '一條線/Cluster 結算後;每筆 WinEvent 觸發一次' },
    { type: 'ON_SYMBOL_LANDED',  label: '🎯 符號落盤',        desc: '中獎時的符號落點(用於黏 Wild 等局部處理)' },
    { type: 'ON_COMBO_STEP',     label: '🔥 連爆步進',        desc: '消除後產生新爆的中間步(可調 multiplier、HALT)' },
    { type: 'ON_COMBO_END',      label: '🏁 連爆結束',        desc: '整段連爆鏈結束時' },
    { type: 'ON_DEAD_SPIN',      label: '😴 無中獎',          desc: '本局完全沒中獎(救濟、追蹤死局)' },
    { type: 'ON_MODE_ENTER',     label: '➡️ 進入模式',        desc: '從其他模式切入時(包含 NG → FG)' },
    { type: 'ON_MODE_EXIT',      label: '⬅️ 離開模式',        desc: '從本模式切出時' },
    { type: 'ON_CUSTOM_EMIT',    label: '📡 自訂事件',        desc: '其他規則 EMIT_EVENT 後;用 event == "xxx" 過濾' },
  ];
  const TRIGGER_TYPES = TRIGGER_CATALOG.map(t => t.type);
  const TRIGGER_BY_TYPE = Object.fromEntries(TRIGGER_CATALOG.map(t => [t.type, t]));

  // 比較運算子(對齊 schemas.ConditionOp,排除 AND/OR/NOT — 那些由樹結構表達)
  const OP_TYPES = ['==', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains'];
  // 用於決定值欄位的渲染方式:in/not_in 用清單輸入
  const OP_IS_LIST = new Set(['in', 'not_in']);

  // ── 變數類別(Condition 建構器左半部分)— 對齊後端 logic_parser._resolve_var
  //    needsSubkey: 是否需要第二段(symbol_count.X 的 X)
  //    valueType:  值要怎麼輸入('number' / 'mode' / 'auto' / 'text')
  //    subkeySource: 'symbols' / 'text'(自由輸入)
  const VAR_CATEGORIES = [
    { id: 'symbol_count',          label: 'symbol_count',          needsSubkey: true,
      subkeyHint: '符號',          valueType: 'number', subkeySource: 'symbols',
      desc: '本局盤面中該符號出現幾次' },
    { id: 'mode',                  label: 'mode',                  needsSubkey: false, valueType: 'mode',
      desc: '目前所在的模式(NG / FG1 / ...)' },
    { id: 'combo_step',            label: 'combo_step',            needsSubkey: false, valueType: 'number',
      desc: '本局已連爆幾次(從 0 起算)' },
    { id: 'multiplier',            label: 'multiplier',            needsSubkey: false, valueType: 'number',
      desc: '當前 spin 的倍數(可被 ADJUST_MULTIPLIER 改動)' },
    { id: 'total_multiplier',      label: 'total_multiplier',      needsSubkey: false, valueType: 'number',
      desc: '累積總倍數' },
    { id: 'consecutive_dead_spins',label: 'consecutive_dead_spins',needsSubkey: false, valueType: 'number',
      desc: '連續無中獎局數' },
    { id: 'event',                 label: 'event',                 needsSubkey: false, valueType: 'text',
      desc: '上一個 EMIT_EVENT 的事件名(僅在 ON_CUSTOM_EMIT 中有意義)' },
    { id: 'global',                label: 'global',                needsSubkey: true,
      subkeyHint: '變數名',        valueType: 'auto',   subkeySource: 'text',
      desc: '跨 spin 持久變數;用 UPDATE_GLOBAL 寫入' },
    { id: 'spin',                  label: 'spin',                  needsSubkey: true,
      subkeyHint: '變數名',        valueType: 'auto',   subkeySource: 'text',
      desc: 'spin_locals 的別名(後端對應 spin.X);用 UPDATE_LOCAL 寫入' },
    { id: 'payload',               label: 'payload',               needsSubkey: true,
      subkeyHint: '欄位名',        valueType: 'auto',   subkeySource: 'text',
      desc: '伴隨 ON_CUSTOM_EMIT 帶來的資料(來自 EMIT_EVENT 的 payload 參數)' },
    // ── v8.4 / R2 P4:條件變數六枚(純描述詞彙;parse_condition 任意識別字皆合法,
    //    Python 端零改;求值語意由下游模擬工具實作) ──
    { id: 'win',                   label: 'win',                   needsSubkey: false, valueType: 'number',
      desc: '本局贏分(注額倍數)' },
    { id: 'prev_win',              label: 'prev_win',              needsSubkey: false, valueType: 'number',
      desc: '前一局贏分;「win > prev_win」= 贏分變大才續轉(Aloha Sticky Win)' },
    { id: 'rand',                  label: 'rand',                  needsSubkey: false, valueType: 'number',
      desc: '每次求值的 0–1 隨機值;「rand < 0.1」= 10% 機率觸發(Wild Desire 式隨機事件)' },
    { id: 'reel_height',           label: 'reel_height',           needsSubkey: true,
      subkeyHint: '輪號(1-based)', valueType: 'number', subkeySource: 'text',
      desc: '某輪目前有效高度;「reel_height.3 == 12」(White Rabbit 加局條件)' },
    // v8.9 / R2b:空間關係條件(desc 即語意規格,守則 #151;引擎不消費、下游依 desc 實作)
    { id: 'adjacent_count',        label: 'adjacent_count',        needsSubkey: true,
      subkeyHint: '符號A.符號B',   valueType: 'number', subkeySource: 'text',
      desc: '盤面上「與至少一顆 B 正交相鄰(上下左右 4 鄰)」的 A 顆數;subkey 格式「A.B」' +
            '(如 adjacent_count.WILD.SCAT >= 1 = 存在 WILD 鄰接 SCAT)。' +
            '相鄰只算主盤活格,洞格(遮罩外)不構成相鄰;斜角不算。' },
    { id: 'cluster_max',           label: 'cluster_max',           needsSubkey: true,
      subkeyHint: '符號',          valueType: 'number', subkeySource: 'symbols',
      desc: '該符號在盤面上的最大 4 鄰連通群大小(cluster_max.PINK >= 5 = ' +
            '存在 5+ 顆相鄰成群,Reactoonz 式);WILD 是否併入群由規則備註宣告,預設不併。' },
    { id: 'board_symbol_total',    label: 'board_symbol_total',    needsSubkey: false, valueType: 'number',
      desc: '盤面現存符號總數;== 0 即「清空全盤」(Moon Princess +100×)' },
    { id: 'rightmost_reel_in_win', label: 'rightmost_reel_in_win', needsSubkey: false, valueType: 'number',
      desc: '最右輪是否參與中獎(1/0);Infinity Reels 延續加輪條件' },
    // ── v8.21 / G1 價值引擎:值變數(四枚;純描述,parse_condition 任意識別字皆合法,
    //    Python 端零改;求值語意由下游模擬工具實作) ──
    { id: 'symbol_value',          label: 'symbol_value',          needsSubkey: true,
      subkeyHint: '符號',          valueType: 'number', subkeySource: 'symbols',
      desc: '某符號當前攜帶的值(如金幣面額);「symbol_value.COIN >= 100」= 金幣值達門檻' },
    { id: 'cell_value',            label: 'cell_value',            needsSubkey: true,
      subkeyHint: '座標(reel,row)', valueType: 'number', subkeySource: 'text',
      desc: '某格當前值;subkey 格式「reel,row」(1-based);「cell_value.3,2 > 0」= 該格有值' },
    { id: 'respins_left',          label: 'respins_left',          needsSubkey: false, valueType: 'number',
      desc: 'Hold&Win 剩餘回補次數;「respins_left == 0」= 收集結束(可連動 END_FEATURE)' },
    { id: 'feature_value_total',   label: 'feature_value_total',   needsSubkey: false, valueType: 'number',
      desc: '本 feature 累計值總和;可當 PAY 動態值,或「>= 門檻」升級彩池' },
    // ── v8.37 / GAP-F2 + 🟢-4/🟢-5:條件變數三枚(純描述詞彙;沿 v8.4/v8.9/v8.21
    //    常數增列前例,parse_condition 任意識別字皆合法、Python 端零改;
    //    求值語意由下游模擬工具實作;evalCondition 即時預覽不支援 = 既有變數同級限制) ──
    { id: 'object_pos',            label: 'object_pos',            needsSubkey: true,
      subkeyHint: '符號.row|col',  valueType: 'number', subkeySource: 'text',
      desc: '特定物件當前座標;subkey 格式「SID.row」或「SID.col」(1-based;首點切分同 ' +
            'adjacent_count 前例)。「object_pos.KEY.row == 5」= 鑰匙走到第 5 列(Finn 觸發)。' +
            '同符號多實例時取哪顆由規則備註宣告,預設語意為單物件類符號。' },
    { id: 'reel_count',            label: 'reel_count',            needsSubkey: false, valueType: 'number',
      desc: '當前輪數(GROW_BOARD 後讀取;Odin 加輪條件「reel_count >= 7」)' },
    { id: 'symbol_ways',           label: 'symbol_ways',           needsSubkey: true,
      subkeyHint: '符號',          valueType: 'number', subkeySource: 'symbols',
      desc: '該符號構成的 ways 數(相鄰輪連續出現的路徑數;Odin「symbol_ways.WILD >= 243」)' },
    // ── v8.40 / 🟢-3:cluster_shape(清單末位;Finn 特定形狀 cluster;沿常數增列前例) ──
    { id: 'cluster_shape',         label: 'cluster_shape',         needsSubkey: true,
      subkeyHint: '符號.形狀名',   valueType: 'number', subkeySource: 'text',
      desc: '該符號構成「指定形狀」的 4 鄰連通群數;subkey 格式「SID.SHAPE」(首點切分同 ' +
            'adjacent_count 前例)。形狀名為自由詞彙(如 L / SQUARE / LINE_H),幾何定義寫在' +
            '規則備註、判定由下游實作。「cluster_shape.KEY.L >= 1」= 存在 L 形群(Finn)。' },
    // ── v8.41 / 批次A:WinEvent 屬性族三枚(GAP-V1/V3/V4;沿 v8.4/v8.37/v8.40
    //    常數增列前例,parse_condition 任意識別字皆合法、Python 端零改;
    //    「本筆」= 單次中獎結算事件(ON_WIN_RESOLVED / ON_COMBO_STEP 語境),
    //    連爆多步各自獨立取值;跨步累計走 UPDATE_GLOBAL(op=add) 慣用式;
    //    求值語意由下游模擬工具實作) ──
    { id: 'win_symbols',           label: 'win_symbols',           needsSubkey: false, valueType: 'number',
      desc: '本筆中獎事件的符號顆數(連爆各步獨立);「UPDATE_GLOBAL(charge, add, win_symbols)」' +
            '= 充能計量(Gemix/Tome 式 cluster 消除貨幣)' },
    { id: 'win_contains',          label: 'win_contains',          needsSubkey: true,
      subkeyHint: '符號',          valueType: 'number', subkeySource: 'symbols',
      desc: '本筆中獎是否包含該符號(1/0 謂詞,前例 rightmost_reel_in_win);' +
            '「win_contains.RUNE == 1」= 符文參與中獎(Tome/VR 式)。本批僅收單符號 SID,' +
            'group:<gid> 家族形留觀察清單等第二樣本。' },
    { id: 'destroyed_count',       label: 'destroyed_count',       needsSubkey: false, valueType: 'number',
      desc: '本筆結算銷毀的符號顆數(含波及銷毀,可大於 win_symbols;xBomb 型兩值分歧);' +
            'Temple Tumble 全清/計量。' },
    // ── v8.45 / 批次D 組一:條件變數二枚(GAP-V2 + reel_stack_count;沿批次A 前例,
    //    parse_condition 任意識別字皆合法、Python 端零改;求值語意由下游模擬工具實作) ──
    { id: 'track_covered',         label: 'track_covered',         needsSubkey: true,
      subkeyHint: '軌道ID',        valueType: 'number', subkeySource: 'text',
      desc: '該軌道(02c_Tracks)的格位是否全數被本局中獎覆蓋(1/0 謂詞,前例 win_contains);' +
            '「track_covered.T001 == 1」= 圖樣達成(Gemix 世界圖樣 / VR 等級圖樣)。' +
            'subkey 亦可填 CURRENT = 當前圖樣(圖樣輪替時,當前指標由規則以 ' +
            'global.track_current 維護並於備註宣告輪替序;判定由下游實作)。' },
    { id: 'reel_stack_count',      label: 'reel_stack_count',      needsSubkey: true,
      subkeyHint: '符號[.輪號]',   valueType: 'number', subkeySource: 'text',
      desc: '該符號在「單一輪內」的最大縱向連續疊數;subkey「SID」= 全輪取最大,' +
            '「SID.r」= 指定輪(1-based;雙段 subkey 同 object_pos/cluster_shape 前例)。' +
            '「reel_stack_count.APE >= 4」= 猿群疊 4(PotA);配 reel_height 可表「整輪疊滿」(ML)。' },
  ];
  const VAR_CATEGORY_MAP = Object.fromEntries(VAR_CATEGORIES.map(c => [c.id, c]));

  // 建立一個空的 Action(用於 actions list)
  //   atype: ActionType (string,對應後端 enum value)
  //   params: { key: value, ... }(會用後端 DSL 格式 KEY=VAL 編碼)
  function makeAction(atype = '') {
    return { atype, params: {} };
  }

  function makeRule(id) {
    return {
      rule_id: id || '',
      mode_scope: 'ALL',          // UI helper:匯出時若非 ALL,會合併到 condition
      trigger: 'ON_GRID_GENERATED',
      condition: '',
      actions: [],                // ★ 後端是 list,可多個 Action
      emits: [],                  // 文件性:此規則會發出哪些事件
      enabled: true,              // 對應後端 PuzzleRule.enabled
      priority: 100,
      description: '',            // 對應後端 PuzzleRule.description(舊欄位名 notes)
      persistent: false,          // v8.21 G1:規則層修飾子,動作每回合重跑(界-2 sticky 重跑)
    };
  }

  // 預設範例規則 — 全部對齊後端 schemas.TriggerType / ActionType
  const DEFAULT_RULES = [
    { rule_id: 'P001', mode_scope: 'ALL', trigger: 'ON_GRID_GENERATED',
      condition: 'symbol_count.SCAT >= 3',
      actions: [
        { atype: 'EMIT_EVENT', params: { name: 'fg_trigger' } },
        { atype: 'SWITCH_MODE', params: { target: 'FG1', inherit_globals: false } },
      ],
      emits: ['fg_trigger'],
      enabled: true,
      priority: 100, description: 'Scatter ≥ 3 觸發 FG 並切到 FG1' },
    { rule_id: 'P002', mode_scope: 'FG1', trigger: 'ON_COMBO_END',
      condition: 'combo_step >= 2',   // v8.16 勘誤:前綴由 mode_scope 於匯出時折疊,不再內嵌
      actions: [
        { atype: 'AWARD_FREE_SPIN', params: { count: 5, mode: 'FG1' } },
      ],
      emits: [],
      enabled: true,
      priority: 80,  description: 'FG 連 2 爆以上加 5 局' },
    { rule_id: 'P003', mode_scope: 'NG', trigger: 'ON_DEAD_SPIN',
      condition: '',                  // v8.16 勘誤:同上;scope=NG 已表達全部語義
      actions: [
        { atype: 'UPDATE_GLOBAL', params: { var: 'dead_count', op: 'add', value: 1 } },
      ],
      emits: [],
      enabled: true,
      priority: 50,  description: '死局累計到 global.dead_count' },
    { rule_id: 'P004', mode_scope: 'ALL', trigger: 'ON_COMBO_END',
      condition: 'total_multiplier >= 100',
      actions: [
        { atype: 'EMIT_EVENT', params: { name: 'big_win' } },
      ],
      emits: ['big_win'],
      enabled: true,
      priority: 90,  description: '大獎事件廣播' },
  ];

  function loadRules() {
    try {
      const raw = localStorage.getItem(LS_RULES_KEY);
      if (!raw) return DEFAULT_RULES.map(r => deepCopyRule(r));
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_RULES.map(r => deepCopyRule(r));
      // 向後相容:把舊 schema(action_type / action_params / notes)轉換到新 schema
      return arr.map(r => migrateRuleSchema(r));
    } catch (e) {
      console.warn('[config-editor] loadRules failed:', e);
      return DEFAULT_RULES.map(r => deepCopyRule(r));
    }
  }

  // 深拷貝一條規則(包含 actions / emits 陣列)
  function deepCopyRule(r) {
    return {
      ...makeRule(''),
      ...r,
      actions: (r.actions || []).map(a => ({ atype: a.atype, params: { ...(a.params || {}) } })),
      emits: [...(r.emits || [])],
    };
  }

  // 把任何版本的 rule 轉成當前 schema
  function migrateRuleSchema(r) {
    const base = makeRule('');
    const out = { ...base, ...r };
    // 1. notes → description
    if (r.notes && !r.description) out.description = r.notes;
    delete out.notes;
    // 2. action_type + action_params → actions: [{ atype, params }]
    if (!Array.isArray(out.actions)) out.actions = [];
    if (out.actions.length === 0 && r.action_type) {
      let params = {};
      if (r.action_params) {
        try {
          const obj = JSON.parse(r.action_params);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) params = obj;
        } catch (e) { /* ignore parse fail */ }
      }
      out.actions = [{ atype: r.action_type, params }];
    }
    delete out.action_type;
    delete out.action_params;
    // 3. 確保 emits 是陣列、enabled 有預設
    if (!Array.isArray(out.emits)) out.emits = [];
    if (typeof out.enabled !== 'boolean') out.enabled = true;
    // 4. 把已知不存在的舊 trigger 名稱對應到新 trigger
    out.trigger = MIGRATE_TRIGGER_MAP[out.trigger] || out.trigger;
    return out;
  }

  // 舊 trigger → 新 trigger 對應表(載入舊資料時用,避免使用者一進畫面看到一片不認識的觸發點)
  const MIGRATE_TRIGGER_MAP = {
    ON_GRID_FILL:  'ON_GRID_GENERATED',
    ON_WIN_LINE:   'ON_WIN_RESOLVED',
    ON_COMBO:      'ON_COMBO_STEP',
    ON_NO_WIN:     'ON_DEAD_SPIN',
    ON_BIG_WIN:    'ON_COMBO_END',     // 業務語意上「結束時看看夠不夠大」
    ON_EVENT:      'ON_CUSTOM_EMIT',
  };

  // ══════════════════════════════════════════════════════════
  //  規則庫(PRESET_LIBRARY)— 常用 slot 機制的可插入 preset
  //  每個 preset 含:
  //    key:     穩定識別字串(用於搜尋/去重)
  //    name:    顯示名稱
  //    desc:    一句話說明
  //    tags:    搜尋關鍵字(中英文都行)
  //    template: 不含 rule_id 的規則範本(insertPreset 會自動配 ID)
  //
  //  所有 preset 的 trigger / actions 已對齊 schemas.py;插入後直接可匯出執行。
  //  注意:symbol_id 預設用通用名稱 (WILD / SCAT / H1) — 使用者插入後可能要改為自家 03_Symbols 中的實際名稱
  // ══════════════════════════════════════════════════════════
  const PRESET_LIBRARY = [
    {
      label: '觸發 Free Game', icon: '🎰',
      presets: [
        {
          key: 'fg_scatter_3',
          name: 'Scatter ≥ 3 觸發 FG1',
          desc: '經典款:盤面 Scatter 達 3 個就切換到 FG1 並廣播 fg_trigger 事件。',
          tags: ['fg', 'scatter', '免費遊戲', '觸發'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_GRID_GENERATED',
            condition: 'symbol_count.SCAT >= 3',
            actions: [
              { atype: 'EMIT_EVENT', params: { name: 'fg_trigger' } },
              { atype: 'SWITCH_MODE', params: { target: 'FG1', inherit_globals: false } },
            ],
            emits: ['fg_trigger'],
            priority: 100,
            description: '經典 Scatter ≥ 3 觸發 FG1',
          },
        },
        {
          key: 'fg_scatter_4_tier',
          name: 'Scatter ≥ 4 直接跳 FG2',
          desc: '階梯式 FG:Scatter 達 4+ 跳過 FG1 直接進更高等級的 FG2。',
          tags: ['fg', 'scatter', '階梯', '跳級'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_GRID_GENERATED',
            condition: 'symbol_count.SCAT >= 4',
            actions: [
              { atype: 'EMIT_EVENT', params: { name: 'fg2_trigger' } },
              { atype: 'SWITCH_MODE', params: { target: 'FG2', inherit_globals: false } },
              { atype: 'HALT_RESOLUTION', params: {} },  // 不讓 fg_scatter_3 重複觸發
            ],
            emits: ['fg2_trigger'],
            priority: 90,  // 比 fg_scatter_3 優先(數字小先執行)
            description: '高 Scatter 跳級進 FG2',
          },
        },
        {
          key: 'fg_retrigger',
          name: 'FG 中再 Scatter ≥ 3 加 5 局',
          desc: 'Re-trigger:玩家在 FG1 模式中再次抽到 ≥ 3 個 Scatter,額外贈送 5 局。',
          tags: ['fg', 'retrigger', '加局', '免費'],
          template: {
            mode_scope: 'FG1', trigger: 'ON_GRID_GENERATED',
            condition: 'symbol_count.SCAT >= 3',
            actions: [
              { atype: 'AWARD_FREE_SPIN', params: { count: 5, mode: 'FG1' } },
              { atype: 'EMIT_EVENT', params: { name: 'fg_retrigger' } },
            ],
            emits: ['fg_retrigger'],
            priority: 100,
            description: 'FG1 中 Scatter 再現,加 5 局',
          },
        },
      ],
    },
    {
      label: '連爆獎勵', icon: '🔥',
      presets: [
        {
          key: 'combo_ladder',
          name: '連爆階梯倍數 (2→×2, 5→×5)',
          desc: '連爆 2 次以上每次乘 2 倍;達 5 次以上每次乘 5 倍。配合 ON_COMBO_STEP 在每爆之間調整 multiplier。',
          tags: ['連爆', 'combo', '倍數', 'multiplier'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_STEP',
            condition: 'combo_step >= 5',
            actions: [
              { atype: 'ADJUST_MULTIPLIER', params: { op: 'mul', value: 5 } },
            ],
            emits: [],
            priority: 80,
            description: '連 5 爆 ×5(配 combo_2x 使用更佳)',
          },
        },
        {
          key: 'combo_ladder_2x',
          name: '連爆 ≥ 2 開始 ×2',
          desc: '搭配 combo_ladder 使用:在連 2~4 爆時乘 2 倍。',
          tags: ['連爆', 'combo', '倍數'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_STEP',
            condition: 'combo_step >= 2 AND combo_step < 5',
            actions: [
              { atype: 'ADJUST_MULTIPLIER', params: { op: 'mul', value: 2 } },
            ],
            emits: [],
            priority: 90,
            description: '連 2~4 爆 ×2',
          },
        },
        {
          key: 'combo_big',
          name: '連爆 ≥ 6 廣播 mega_combo',
          desc: '當玩家在一局內連續消除 6 次以上,廣播 mega_combo 事件供 UI 播大獎動畫。',
          tags: ['連爆', 'combo', 'mega', '廣播'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_END',
            condition: 'combo_step >= 6',
            actions: [
              { atype: 'EMIT_EVENT', params: { name: 'mega_combo', payload: { steps: 6 } } },
            ],
            emits: ['mega_combo'],
            priority: 70,
            description: '超長連爆事件廣播',
          },
        },
      ],
    },
    {
      label: '死局處理', icon: '😴',
      presets: [
        {
          key: 'dead_count',
          name: '死局累計到 global.dead_count',
          desc: '每局無中獎時把 global.dead_count 加 1,可用於後續救濟機制的判斷。',
          tags: ['死局', 'dead', 'global', '統計'],
          template: {
            mode_scope: 'NG', trigger: 'ON_DEAD_SPIN',
            condition: '',
            actions: [
              { atype: 'UPDATE_GLOBAL', params: { var: 'dead_count', op: 'add', value: 1 } },
            ],
            emits: [],
            priority: 50,
            description: '統計連續死局數',
          },
        },
        {
          key: 'dead_rescue_wild',
          name: '連續 3 死局保證填 WILD',
          desc: '體感救濟:連續 3 局無中獎時,在下一局盤面填一個 WILD 提升中獎機會。',
          tags: ['死局', '救濟', 'wild', '體感'],
          template: {
            mode_scope: 'NG', trigger: 'ON_SPIN_START',
            condition: 'consecutive_dead_spins >= 3',
            actions: [
              { atype: 'BOARD_FILL', params: { symbol_id: 'WILD' } },
              { atype: 'UPDATE_GLOBAL', params: { var: 'rescue_count', op: 'add', value: 1 } },
              { atype: 'EMIT_EVENT', params: { name: 'rescue_triggered' } },
            ],
            emits: ['rescue_triggered'],
            priority: 30,
            description: '連 3 死局後保證一個 WILD',
          },
        },
      ],
    },
    {
      label: '大獎廣播', icon: '🏆',
      presets: [
        {
          key: 'big_win_broadcast',
          name: 'total_multiplier ≥ 100 廣播 big_win',
          desc: '當本局累計倍數達 100 倍以上,發出 big_win 事件供 UI 播大獎動畫。',
          tags: ['大獎', 'big_win', '廣播', 'rtp'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_END',
            condition: 'total_multiplier >= 100',
            actions: [
              { atype: 'EMIT_EVENT', params: { name: 'big_win', payload: { mult: 100 } } },
            ],
            emits: ['big_win'],
            priority: 90,
            description: '100x 以上大獎廣播',
          },
        },
        {
          key: 'mega_win_broadcast',
          name: 'total_multiplier ≥ 500 廣播 mega_win',
          desc: '更高等級的大獎(500x+)。建議排在 big_win 之前,並用 HALT_RESOLUTION 避免重複觸發。',
          tags: ['大獎', 'mega', 'jackpot'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_END',
            condition: 'total_multiplier >= 500',
            actions: [
              { atype: 'EMIT_EVENT', params: { name: 'mega_win', payload: { mult: 500 } } },
              { atype: 'HALT_RESOLUTION', params: {} },
            ],
            emits: ['mega_win'],
            priority: 85,  // 比 big_win(90) 先執行
            description: '500x 以上 mega 大獎(會 HALT 阻擋 big_win)',
          },
        },
      ],
    },
    {
      label: 'Wild 機制', icon: '🃏',
      presets: [
        {
          key: 'sticky_wild',
          name: 'Wild 落點黏 2 局',
          desc: 'Sticky Wild:盤面只要有 Wild,在後續 2 局保持不動。',
          tags: ['wild', 'sticky', '黏著'],
          template: {
            mode_scope: 'FG1', trigger: 'ON_GRID_GENERATED',
            condition: 'symbol_count.WILD >= 1',
            actions: [
              { atype: 'STICKY', params: { duration: 2 } },
            ],
            emits: [],
            priority: 60,
            description: 'FG1 中 Wild 黏 2 局',
          },
        },
        {
          key: 'transform_wild',
          name: '中獎後 H1 轉 WILD',
          desc: '消除時把所有 H1 轉成 WILD,提升下一爆的中獎率(配合連爆機制)。',
          tags: ['wild', 'transform', '轉換'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_COMBO_STEP',
            condition: 'combo_step >= 2',
            actions: [
              { atype: 'BOARD_TRANSFORM', params: { from_symbol: 'H1', to_symbol: 'WILD' } },
            ],
            emits: [],
            priority: 75,
            description: '連爆中把 H1 轉 WILD',
          },
        },
      ],
    },
    {
      label: '模式切換 / 進場清理', icon: '🔀',
      presets: [
        {
          key: 'mode_enter_reset',
          name: '進入 FG 時清 spin.combo_count',
          desc: '進入 FG1 模式時,把 spin.combo_count 變數歸零(避免從 NG 帶值進來)。',
          tags: ['模式', '清理', 'reset', 'enter'],
          template: {
            mode_scope: 'FG1', trigger: 'ON_MODE_ENTER',
            condition: '',
            actions: [
              { atype: 'UPDATE_LOCAL', params: { var: 'combo_count', op: 'set', value: 0 } },
              { atype: 'UPDATE_LOCAL', params: { var: 'fg_total_mult', op: 'set', value: 0 } },
            ],
            emits: [],
            priority: 100,
            description: '進入 FG1 清掃變數',
          },
        },
        {
          key: 'fg_exit_payout',
          name: '離開 FG 時累積到 global.fg_payout',
          desc: 'FG1 結束時,把本次 fg_total_mult 累積到 global.fg_payout(跨 spin 持久統計用)。',
          tags: ['模式', 'exit', '累積', '統計'],
          template: {
            mode_scope: 'FG1', trigger: 'ON_MODE_EXIT',
            condition: 'total_multiplier > 0',
            actions: [
              { atype: 'UPDATE_GLOBAL', params: { var: 'fg_payout', op: 'add', value: 0 } },
              // 注意:value=0 是 placeholder,實際應該帶入 total_multiplier 但目前後端 params 不支援變數引用
              // 使用者插入後可改為固定數值或修改後端
            ],
            emits: [],
            priority: 100,
            description: 'FG 結束累積總賠付',
          },
        },
      ],
    },
    {
      label: '進階:鏈式事件', icon: '📡',
      presets: [
        {
          key: 'listen_big_win',
          name: '監聽 big_win 加倍率到 global',
          desc: '當任一規則 EMIT big_win 事件,自動把 global.big_win_count 加 1。展示 EMIT → ON_CUSTOM_EMIT 鏈式機制。',
          tags: ['事件', 'emit', 'listen', '鏈式'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_CUSTOM_EMIT',
            condition: 'event == big_win',
            actions: [
              { atype: 'UPDATE_GLOBAL', params: { var: 'big_win_count', op: 'add', value: 1 } },
            ],
            emits: [],
            priority: 200,
            description: '事件監聽範例:統計大獎次數',
          },
        },
        {
          key: 'chain_fg_to_super',
          name: 'fg_trigger 連發 → 切到 SUPER_FG',
          desc: '連續兩次 fg_trigger(玩家持續中 Scatter)直接升級到 SUPER_FG 模式。配合 global.fg_chain 計數使用。',
          tags: ['事件', 'chain', '升級', 'super'],
          template: {
            mode_scope: 'ALL', trigger: 'ON_CUSTOM_EMIT',
            condition: 'event == fg_trigger AND global.fg_chain >= 1',
            actions: [
              { atype: 'SWITCH_MODE', params: { target: 'SUPER_FG', inherit_globals: true } },
              { atype: 'UPDATE_GLOBAL', params: { var: 'fg_chain', op: 'set', value: 0 } },
            ],
            emits: [],
            priority: 50,
            description: 'FG 連續觸發升級到 SUPER_FG',
          },
        },
      ],
    },
  ];


  function saveRules(arr) {
    try {
      localStorage.setItem(LS_RULES_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[config-editor] saveRules failed:', e);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  Condition DSL parser(扁平 AND/OR,不支援巢狀)
  //  輸入:'symbol_count.SCAT >= 3 AND mode == FG1'
  //  輸出:{ ok, rows, error }
  //    rows: [{ category, subkey, op, value, combinator }, ...]
  // ──────────────────────────────────────────────────────────
  function parseCondition(str) {
    if (str == null) return { ok: true, rows: [] };
    const s = String(str).trim();
    if (!s) return { ok: true, rows: [] };

    // 偵測是否含括號(本版本不支援)
    if (/[()]/.test(s)) {
      return { ok: false, error: '含括號的巢狀條件,目前僅支援扁平 AND/OR;請使用「原始模式」編輯', rows: [] };
    }

    // 按 AND/OR(整詞)切割,保留分隔詞
    const tokens = s.split(/\s+(AND|OR)\s+/i);
    // tokens 形式:[seg0, "AND", seg1, "OR", seg2, ...]
    const rows = [];
    for (let i = 0; i < tokens.length; i += 2) {
      const seg = (tokens[i] || '').trim();
      if (!seg) continue;
      const combinator = i === 0 ? 'AND' : (tokens[i - 1] || 'AND').toUpperCase();

      // 解析:<var> <op> <value>
      // op 優先吃長運算子(>= / <= / == / !=)再吃短的(> / <)
      const m = seg.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/);
      if (!m) return { ok: false, error: `無法解析片段:「${seg}」`, rows };

      const [, varStr, op, valStr] = m;
      let category = varStr.trim();
      let subkey = '';
      const dotIdx = category.indexOf('.');
      if (dotIdx >= 0) {
        subkey = category.substring(dotIdx + 1).trim();
        category = category.substring(0, dotIdx).trim();
      }
      // 驗證 category 是否在已知清單(寬鬆:不在的話也接受,但給警告)
      if (!VAR_CATEGORY_MAP[category]) {
        return { ok: false, error: `未知變數類別:「${category}」(可用:${Object.keys(VAR_CATEGORY_MAP).join(', ')})`, rows };
      }
      rows.push({
        category,
        subkey,
        op,
        value: valStr.trim(),
        combinator,
      });
    }
    return { ok: true, rows };
  }

  // 由 rows 重建 DSL 字串
  function buildCondition(rows) {
    if (!rows || rows.length === 0) return '';
    const segs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cat = (r.category || '').trim();
      if (!cat) continue;
      // category 'spin' 在後端對應 spin.X(已是同名 — _resolve_var 處理 spin. 開頭)
      // 'spin_locals'(舊資料相容)也輸出成 spin.X
      const catOut = (cat === 'spin_locals') ? 'spin' : cat;
      const varStr = r.subkey ? `${catOut}.${r.subkey}` : catOut;
      const op = r.op || '==';
      let val = (r.value == null ? '' : String(r.value)).trim();
      // in / not_in:UI 用逗號分隔多值 → 編成 [a,b,c]
      if ((op === 'in' || op === 'not_in') && val) {
        if (!val.startsWith('[')) {
          const parts = val.split(',').map(s => s.trim()).filter(Boolean);
          val = '[' + parts.join(',') + ']';
        }
      }
      segs.push({ s: `${varStr} ${op} ${val}`.trim(), combinator: r.combinator || 'AND' });
    }
    if (segs.length === 0) return '';
    let out = segs[0].s;
    for (let i = 1; i < segs.length; i++) {
      out += ` ${segs[i].combinator} ${segs[i].s}`;
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────
  //  evalCondition(ctx, rows)
  //    把 builder rows 套到假的 EvalContext 上,即時告訴使用者結果
  //    支援:扁平 AND/OR(左到右計算,不處理優先序)
  //    ctx 結構:{ symbol_count:{X:n}, global:{x:v}, spin_locals:{x:v},
  //              payload:{x:v}, mode:'NG', combo_step:0, total_multiplier:0 }
  // ──────────────────────────────────────────────────────────
  function evalCondition(ctx, rows) {
    if (!rows || rows.length === 0) return { ok: true, result: null, trace: [] };
    const trace = [];
    let acc = null; // 累積結果
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const res = evalRow(ctx, r);
      trace.push({ ...r, ok: res.ok, lhs: res.lhs, rhs: res.rhs, value: res.value, error: res.error });
      if (!res.ok) return { ok: false, result: null, trace, error: res.error };
      if (i === 0) {
        acc = res.value;
      } else {
        const c = (r.combinator || 'AND').toUpperCase();
        acc = (c === 'OR') ? (acc || res.value) : (acc && res.value);
      }
    }
    return { ok: true, result: acc, trace };
  }

  function evalRow(ctx, r) {
    const cat = (r.category || '').trim();
    const sub = (r.subkey || '').trim();
    let lhs;
    try {
      if (cat === 'mode')                      lhs = ctx.mode;
      else if (cat === 'combo_step')           lhs = Number(ctx.combo_step);
      else if (cat === 'multiplier')           lhs = Number(ctx.multiplier);
      else if (cat === 'total_multiplier')     lhs = Number(ctx.total_multiplier);
      else if (cat === 'consecutive_dead_spins') lhs = Number(ctx.consecutive_dead_spins);
      else if (cat === 'event')                lhs = String(ctx.event || '');
      else if (cat === 'symbol_count')         lhs = Number((ctx.symbol_count || {})[sub] || 0);
      else if (cat === 'global')               lhs = (ctx.global || {})[sub];
      else if (cat === 'spin' || cat === 'spin_locals') lhs = (ctx.spin_locals || ctx.spin || {})[sub];
      else if (cat === 'payload')              lhs = (ctx.payload || {})[sub];
      else return { ok: false, error: `未知變數類別: ${cat}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
    // 解析 rhs
    const rawRhs = (r.value == null ? '' : String(r.value)).trim();
    let rhs;
    if (r.op === 'in' || r.op === 'not_in') {
      // 清單型:逗號分隔 → array
      rhs = rawRhs ? rawRhs.split(',').map(s => {
        const t = s.trim();
        const n = Number(t);
        return (t !== '' && !Number.isNaN(n)) ? n : t;
      }) : [];
    } else {
      const numRhs = Number(rawRhs);
      rhs = (rawRhs !== '' && !Number.isNaN(numRhs)) ? numRhs : rawRhs;
    }
    // 套運算子
    let v;
    try {
      switch (r.op) {
        case '==':       v = lhs == rhs; break;
        case '!=':       v = lhs != rhs; break;
        case '>':        v = Number(lhs) >  Number(rhs); break;
        case '>=':       v = Number(lhs) >= Number(rhs); break;
        case '<':        v = Number(lhs) <  Number(rhs); break;
        case '<=':       v = Number(lhs) <= Number(rhs); break;
        case 'in':       v = Array.isArray(rhs) && rhs.some(x => x == lhs); break;
        case 'not_in':   v = Array.isArray(rhs) && !rhs.some(x => x == lhs); break;
        case 'contains': v = Array.isArray(lhs) ? lhs.some(x => x == rhs) : String(lhs || '').includes(String(rhs)); break;
        default:         return { ok: false, error: `未知運算子: ${r.op}`, lhs, rhs };
      }
    } catch (e) {
      return { ok: false, error: e.message, lhs, rhs };
    }
    return { ok: true, lhs, rhs, value: !!v };
  }

  // ──────────────────────────────────────────────────────────
  //  Action 拼圖建構器
  //    ACTION_CATALOG 對齊後端 schemas.ActionType (14 種)
  //    每種的 params schema 對應 logic_parser.py 中各 register_action 函式的 params.get(...)
  //    param.type:'text' / 'number' / 'mode' / 'symbol' / 'enum' / 'bool' / 'symbols_list' / 'pos'
  //    enum 類用 options 列舉合法值
  // ──────────────────────────────────────────────────────────
  const ACTION_CATALOG = [
    // ── 倍數 / 數值 ──
    { type: 'ADJUST_MULTIPLIER', label: '調整倍數', icon: '✖️',
      desc: '在當前 spin 的 multiplier 上做加/乘/設定運算',
      params: [
        { key: 'op',    label: '運算',   type: 'enum',   options: ['add', 'mul', 'set'], default: 'add', required: true },
        // v8.34 / GAP-S1:dyn — 數字或動態公式(原樣字串不求值,求值交下游)
        { key: 'value', label: '數值',   type: 'number', dyn: true, placeholder: '1 或 symbol_count.WILD + 1', required: true },
      ] },
    { type: 'UPDATE_GLOBAL', label: '更新全域變數', icon: '🌐',
      desc: '修改 global.X(跨 spin 持久)',
      params: [
        { key: 'var',   label: '變數名(不含 global. 前綴)', type: 'text', placeholder: 'coin_pool', required: true },
        { key: 'op',    label: '運算',   type: 'enum',   options: ['add', 'sub', 'mul', 'set'], default: 'add', required: true },
        // v8.34 / GAP-S1:dyn — SF2 量表+=得分符號數、Hades 狩獵計量+=被轉格數 皆此路
        { key: 'value', label: '數值',   type: 'number', dyn: true, placeholder: '1 或 symbol_count.SCAT + 1', required: true },
        // v8.4 / R2 P3(C-7 收編):變數生命週期宣告(收集計量表/跨 session 解鎖;描述層)
        { key: 'lifecycle', label: '生命週期(可選)', type: 'enum', options: ['', 'SPIN', 'FEATURE', 'SESSION'], default: '',
          desc: '變數重置範圍:SPIN=每局/FEATURE=feature 結束/SESSION=跨局跨 session 持久;留空=沿用預設' },
        { key: 'cap', label: '上限(可選)', type: 'number', placeholder: '',
          desc: '變數封頂值;「滿值事件」用「global.X >= 上限」條件 + EMIT_EVENT 拼出' },
      ] },
    { type: 'UPDATE_LOCAL', label: '更新本局變數', icon: '🔧',
      desc: '修改 spin_locals.X(僅本局有效)',
      params: [
        { key: 'var',   label: '變數名(不含 spin. 前綴)', type: 'text', placeholder: 'fg_combo_count', required: true },
        { key: 'op',    label: '運算',   type: 'enum',   options: ['add', 'sub', 'mul', 'set'], default: 'add', required: true },
        // v8.34 / GAP-S1:dyn — 數字或動態公式
        { key: 'value', label: '數值',   type: 'number', dyn: true, placeholder: '1 或 cluster_max.PINK', required: true },
      ] },

    // ── 流程控制 ──
    { type: 'EMIT_EVENT', label: '發出事件', icon: '📢',
      desc: '廣播一個自訂事件;ON_CUSTOM_EMIT 監聽端可用 event == "xxx" 過濾',
      params: [
        { key: 'name',    label: '事件名稱', type: 'text', placeholder: 'fg_trigger', required: true },
        { key: 'payload', label: '附加資料(可選)', type: 'text', placeholder: '{count:1, source:wild}',
          desc: '用 {k:v, k:v} 格式;監聽端用 payload.X 讀取' },
      ] },
    { type: 'SWITCH_MODE', label: '切換模式', icon: '🔀',
      desc: '把當前模式切到指定模式',
      params: [
        { key: 'target',          label: '目標模式',     type: 'mode', required: true },
        { key: 'inherit_globals', label: '繼承 globals', type: 'bool', default: false },
      ] },
    { type: 'AWARD_FREE_SPIN', label: '給予免費局', icon: '🎁',
      desc: 'FG 模式下加 N 局免費 spin',
      params: [
        // v8.34 / GAP-S1:dyn — Hades FS 局數=symbol_count.SCAT(5–36)即此路
        { key: 'count', label: '局數',         type: 'number', dyn: true, placeholder: '5 或 symbol_count.SCAT', required: true },
        { key: 'mode',  label: '目標模式(可選)', type: 'mode' },
        // v8.4 / R2 P3:respin 鏈累計上限(Starburst 最多 3 次;描述層)
        { key: 'max_total', label: '累計上限(可選)', type: 'number', placeholder: '3',
          desc: '同一鏈內此規則累計給予的免費局上限;留空=不設限' },
      ] },
    { type: 'HALT_RESOLUTION', label: '中斷結算', icon: '🛑',
      desc: '立刻停止本 trigger 後續所有規則的執行(等同 break)',
      params: [] },

    // ── 盤面操作 ──
    { type: 'BOARD_FILL', label: '盤面填補', icon: '🧩',
      desc: '在指定位置/已被消除的格子強制填入符號',
      params: [
        { key: 'symbol_id', label: '符號',        type: 'symbol', required: true, sentinels: ['RANDOM'] },
        // v8.48 / 項目一 Batch A:positions 可填目標參照 SELF/SELF_LANDED/SELF:方向(相對觸發物件的格)
        { key: 'positions', label: '位置清單(可選)', type: 'text', sentinels: ['SELF', 'SELF_LANDED'],
          placeholder: '[[0,1],[2,3]] 或 SELF', desc: '省略則填所有 destroyed 格;格式 [[reel,row],...];' +
            '或目標參照 SELF(觸發物件當前格)/SELF_LANDED(降落格)/SELF:LEFT|RIGHT|UP|DOWN(相鄰偏移一格)' },
        // v8.34 / GAP-S1+🟢-1:填入顆數(Finn 2–5 / SF2 3–7 / Holy Diver 1–4 皆範圍式)。
        //   additive 加參數尾;留空=填所有 destroyed 格(現行語意不變)。
        { key: 'count', label: '數量(可選)', type: 'number', dyn: true, placeholder: '3 或 "2-5"',
          desc: '固定數、範圍 "2-5"(含引號)、或公式;留空=填所有 destroyed 格' },
        // v8.48 / 項目一 Batch A:排除過濾 + 取用順序(描述層三件套「建立(既有選取)＋排除＋排序」的排除/排序半;無 handler)
        { key: 'except_if', label: '排除條件(可選)', type: 'text', placeholder: 'target == WILD',
          desc: '對選中目標做本動作,但符合此謂詞者跳過(如 target == WILD / target in [WILD,SCAT]);純謂詞,下游求值' },
        { key: 'order', label: '取用順序(可選)', type: 'enum',
          options: ['', 'PAYOUT_DESC', 'PAYOUT_ASC', 'NEAREST', 'FARTHEST', 'FIXED_LIST', 'RANDOM'], default: '',
          desc: '多目標的挑選順序;非 RANDOM=確定性規則(下游照此排)、RANDOM/留空=下游決定。與排除條件正交:先排除、再依序取' },
      ] },
    { type: 'BOARD_TRANSFORM', label: '盤面轉換', icon: '🔁',
      desc: '把盤面上指定符號轉成另一個符號',
      params: [
        // v8.36 / 🟢-2:from_symbol 支援符號家族參照 —
        //   group:<gid> = 家族全員一起轉;group_any:<gid> = 隨機挑家族中「一種」全轉
        //   (Holy Diver 皇家 / Hades 怪物「隨機一種低分全轉X」)。純描述,抽取語意交下游。
        { key: 'from_symbol', label: '原符號', type: 'symbol', required: true, sentinels: ['RANDOM'], groupable: true,
          desc: '單一符號、RANDOM、或家族:group:<家族ID>(全員)/ group_any:<家族ID>(隨機一種)' },
        { key: 'to_symbol',   label: '新符號', type: 'symbol', required: true, sentinels: ['RANDOM', 'BEST'] },
        // v8.48 / 項目一 Batch A:目標位置限定(可選;可填參照 SELF/SELF:方向 — 只轉「觸發物件當前/相鄰格」)
        { key: 'positions', label: '限定位置(可選)', type: 'text', sentinels: ['SELF', 'SELF_LANDED'],
          placeholder: 'SELF:LEFT', desc: '省略=全盤符合 from_symbol 者;填目標參照 SELF/SELF_LANDED/SELF:LEFT|RIGHT|UP|DOWN,' +
            '則只轉該格(如「把物件左邊那格轉成 A」)' },
        // v8.48 / 項目一 Batch A:排除過濾 + 取用順序(三件套的排除/排序半;無 handler,下游求值)
        { key: 'except_if', label: '排除條件(可選)', type: 'text', placeholder: 'target == WILD',
          desc: '對選中目標做轉換,但符合此謂詞者跳過(如 target == WILD =「除非左邊是 WILD」);純謂詞,下游求值' },
        { key: 'order', label: '取用順序(可選)', type: 'enum',
          options: ['', 'PAYOUT_DESC', 'PAYOUT_ASC', 'NEAREST', 'FARTHEST', 'FIXED_LIST', 'RANDOM'], default: '',
          desc: '多目標挑選順序;非 RANDOM=確定性(下游照排)、RANDOM/留空=下游決定。先排除、再依序取' },
      ] },
    { type: 'BOARD_DESTROY', label: '盤面銷毀', icon: '💥',
      desc: '銷毀盤面上指定符號或指定位置',
      params: [
        // v8.45 / 批次D GAP-A4:哨兵尾加 NON_WIN(全盤非中獎符;xBoot xBomb 清場式)
        { key: 'symbol_id', label: '符號(可選)',    type: 'symbol', sentinels: ['RANDOM', 'NON_WIN'],
          desc: 'NON_WIN = 全盤非中獎符(xBoot xBomb 清場式)' },
        // v8.48 / 項目一 Batch A:positions 可填目標參照 SELF/SELF:方向(相對觸發物件;如「消除物件腳下那格」=吃)
        { key: 'positions', label: '位置清單(可選)', type: 'text', sentinels: ['SELF', 'SELF_LANDED'],
          placeholder: '[[0,1],[2,3]] 或 SELF', desc: '格式 [[reel,row],...];或目標參照 ' +
            'SELF(觸發物件當前格)/SELF_LANDED(降落格)/SELF:LEFT|RIGHT|UP|DOWN(相鄰偏移一格)' },
        // v8.48 / 項目一 Batch A:排除過濾 + 取用順序(三件套的排除/排序半;無 handler,下游求值)
        { key: 'except_if', label: '排除條件(可選)', type: 'text', placeholder: 'target == WILD',
          desc: '對選中目標做銷毀,但符合此謂詞者跳過(如 target == WILD 保留 Wild 不炸);純謂詞,下游求值' },
        { key: 'order', label: '取用順序(可選)', type: 'enum',
          options: ['', 'PAYOUT_DESC', 'PAYOUT_ASC', 'NEAREST', 'FARTHEST', 'FIXED_LIST', 'RANDOM'], default: '',
          desc: '多目標挑選順序;非 RANDOM=確定性(下游照排)、RANDOM/留空=下游決定。先排除、再依序取' },
      ] },
    { type: 'MOVE', label: '移動符號', icon: '➡️',
      desc: '把符號從一處移到另一處。兩種用法:①絕對座標 from→to(既有);' +
            '②物件式 subject(符號選取器)+ manner 方向/軌道 —— 不必知座標即可「移動盤上的該物件」。' +
            '「每盤移動一次」由把本動作掛在每盤觸發(ON_SPIN_START/ON_GRID_GENERATED)的規則達成;' +
            '「移動幾次」為生成→每盤移→消失夾出的湧現值,不需在此設定',
      params: [
        // v8.48 / 項目一 Batch A:from/to 由 required 放寬(subject 模式時不需座標;只鬆不緊,舊資料無感)
        { key: 'from', label: '從(絕對)',  type: 'pos', placeholder: '[0,1]',
          desc: 'manner=TO(預設)時的來源格;用 subject 物件式時可留空' },
        { key: 'to',   label: '到(絕對)',  type: 'pos', placeholder: '[2,3]', sentinels: ['SELF', 'SELF_LANDED'],
          desc: 'manner=TO 時的目的格;可填哨兵 SELF/SELF_LANDED(見目標參照);用 DIR/PATH 時忽略' },
        // v8.48 / 項目一 Batch A:物件式移動(subject + manner/dir/amount/track;純描述,無 handler,語意交下游)
        { key: 'subject', label: '移動物件(可選)', type: 'symbol',
          desc: '要移動的符號/物件(如 BIRD);填了就不必知座標,語意=移動盤上的該物件。與 from 互斥擇一' },
        { key: 'manner', label: '移動方式', type: 'enum', options: ['TO', 'DIR', 'PATH'], default: 'TO',
          desc: 'TO=絕對 from→to(既有);DIR=依方向;PATH=沿 02c 軌道' },
        { key: 'dir', label: '方向', type: 'enum', options: ['', 'LEFT', 'RIGHT', 'UP', 'DOWN'], default: '',
          desc: 'manner=DIR 時的移動方向' },
        { key: 'amount', label: '一次幾格', type: 'number', dyn: true, placeholder: '1', default: 1,
          desc: 'manner=DIR 時單次移動的格數;留空=1' },
        { key: 'track', label: '軌道(可選)', type: 'text', placeholder: 'T001',
          desc: 'manner=PATH 時引用的 02c_Tracks 軌道 ID' },
      ] },
    { type: 'SWAP', label: '交換符號', icon: '🔄',
      desc: '交換兩格的符號',
      params: [
        { key: 'a', label: '位置 A', type: 'pos', placeholder: '[0,1]', required: true },
        { key: 'b', label: '位置 B', type: 'pos', placeholder: '[2,3]', required: true },
      ] },
    { type: 'STICKY', label: '黏著符號', icon: '📌',
      desc: '讓符號在後續 N 局保持不變',
      params: [
        { key: 'positions', label: '位置清單', type: 'text', placeholder: '[[0,1]]',
          desc: '省略則黏所有中獎符號' },
        // v8.42 / 批次B GAP-A2:符號選取器(additive 參數,描述層,引擎不消費)
        { key: 'symbol', label: '符號選取(可選)', type: 'symbol',
          desc: '凡該符皆黏(落定即黏、中獎不移除,不可摧毀);與位置清單互斥擇一,' +
                '同時填寫時以 symbol 為準。搭配 until=FEATURE 即「黏至 feature 結束」' +
                '(Gemix 魔法書 / Ecuador Gold 不可摧毀 Wild / Wild Swarm 黏 Wild)' },
        { key: 'duration',  label: '黏著局數', type: 'number', placeholder: '2', required: true },
        // v8.4 / R2 P3:additive 參數(描述層,引擎不消費)
        { key: 'until', label: '黏著期間', type: 'enum', options: ['SPINS', 'FEATURE'], default: 'SPINS',
          desc: 'SPINS=依局數;FEATURE=黏至 feature 結束(Dog House / Chaos Crew 式,duration 忽略)' },
        { key: 'mult_growth', label: '逐局乘數成長(可選)', type: 'number', placeholder: '0',
          desc: '黏著符號每局乘數 +N(如 Mental 死亡病患);0/留空=不成長' },
      ] },
    { type: 'LOCK_REEL', label: '鎖定轉軸', icon: '🔒',
      desc: '指定的 reel 在下一局不重新抽樣(整列保持不變)',
      params: [
        { key: 'reel',     label: '輪盤編號(0-based)', type: 'number', placeholder: '0', required: true },
        { key: 'duration', label: '鎖定局數',          type: 'number', placeholder: '1', required: true },
      ] },

    // ── v8.4 / R2 P2:描述型符號行為 action(七枚) ──
    //   純描述:本工具不執行、不算 RTP;a_loader 照收(schemas.ActionType additive)、
    //   logic_parser 無 handler(由下游模擬工具實作)。docgen 照印進「特色規則」。
    { type: 'EXPAND_REEL', label: '擴展整輪', icon: '🗼',
      desc: '單格符號擴滿整輪(可鎖輪+重轉;Starburst 擴展 Wild)',
      params: [
        { key: 'symbol',  label: '符號',           type: 'symbol', required: true },
        { key: 'lock',    label: '擴後鎖輪',        type: 'enum', options: ['Y', 'N'], default: 'Y' },
        { key: 'respins', label: '附帶重轉局數(可選)', type: 'number', placeholder: '1' },
      ] },
    { type: 'NUDGE', label: '推移符號', icon: '🔃',
      desc: '符號逐格推移(可整輪、可每步乘數+N;xNudge / Razor Shark)',
      params: [
        { key: 'symbol',        label: '符號',        type: 'symbol', required: true },
        { key: 'direction',     label: '方向',        type: 'enum', options: ['UP', 'DOWN'], default: 'DOWN', required: true },
        { key: 'full_reel',     label: '推滿整輪',     type: 'enum', options: ['Y', 'N'], default: 'N' },
        { key: 'mult_per_step', label: '每步乘數+(可選)', type: 'number', placeholder: '1',
          desc: '乘數=推移步數的耦合(xNudge);0/留空=無' },
      ] },
    { type: 'WALK', label: '走位符號', icon: '🚶',
      desc: '符號每次消除/每局依方向走 N 步且持續存在(Jammin\' Jars / Toro)。' +
            '【v8.48 註:本動作為向後相容保留,不再擴充。新規劃改用泛化 MOVE + 反應式規則—' +
            'steps→每盤觸發一條 MOVE、trail→物件在格時 BOARD_TRANSFORM 該格、persist→STICKY、track→MOVE manner=PATH】',
      params: [
        { key: 'symbol',  label: '符號',    type: 'symbol', required: true },
        { key: 'steps',   label: '每次步數', type: 'number', placeholder: '1', default: 1 },
        // v8.28 / 缺口A:走位方向(不含隨機;PATH=自訂路徑,細節填規則備註)
        { key: 'dir',     label: '方向',    type: 'enum', options: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'PATH'], default: 'UP',
          desc: '走位方向;PATH=依自訂路徑(引用下方軌道,或細節寫在規則備註)' },
        // v8.39 / GAP-F1+軌道:dir=PATH 時可引用 02c_Tracks 軌道(結構化路徑;其他 dir 忽略)
        { key: 'track',   label: '軌道(可選)', type: 'text', placeholder: 'T001',
          desc: 'dir=PATH 時引用的軌道 ID(02_Layout 頁定義);留空 = 路徑細節寫規則備註' },
        { key: 'persist', label: '存續範圍', type: 'enum', options: ['SPIN', 'CHAIN', 'FEATURE'], default: 'CHAIN',
          desc: 'SPIN=僅本局;CHAIN=跨連鎖;FEATURE=至 feature 結束' },
        // v8.42 / 批次B:留痕參數(additive 尾端,描述層,引擎不消費)
        { key: 'trail', label: '留痕符號(可選)', type: 'symbol',
          desc: '走過的格位留下該符(snail-trail wilds;Ecuador Gold 幽靈 Wild 足跡 / ' +
                'Gemix 公主蔓延路徑);留空 = 不留痕' },
      ] },
    // v8.28 / 缺口A:物件初始放置(純描述,本工具不執行;新一局 ON_SPIN_START 觸發)
    { type: 'SPAWN', label: '放置物件', icon: '📍',
      desc: '於新一局把物件放到指定格(初始位置;搭配 WALK 走位。四角鳥即四條 SPAWN)',
      params: [
        { key: 'target', label: '物件符號', type: 'symbol', required: true },
        { key: 'cell',   label: '初始位置(r,c)', type: 'text', placeholder: '2,3', required: true,
          desc: '幾何座標,列,欄(沿用 cell_value.<r,c> 記法);於新一局觸發放置' },
      ] },
    { type: 'REVEAL_AS', label: '揭示符號', icon: '🎭',
      desc: '佔位符號落定後統一揭示為其他符號(Mystery Stack / ER 罐 / xWays)',
      params: [
        { key: 'symbol', label: '佔位符號', type: 'symbol', required: true },
        { key: 'pool',   label: '揭示池',   type: 'text', placeholder: 'H1,H2,WILD 或 RANDOM', required: true,
          desc: '逗號分隔候選(權重由 04 表沿用)或 RANDOM=全符號隨機' },
        // v8.42 / 批次B:scope enum 尾端 additive 加 BOARD(default 不變,舊資料零影響)
        { key: 'scope',  label: '揭示範圍', type: 'enum', options: ['CELL', 'REEL', 'BOARD'], default: 'CELL',
          desc: 'CELL=各格獨立揭示;REEL=同輪佔位統一揭示為同一符號;' +
                'BOARD=全盤所有佔位統一揭示為同一符號(業界 mystery symbol 標準語意;' +
                'Gorilla Gold 神祕符 / xBoot xWays / Goonies 神祕金幣)' },
      ] },
    { type: 'SPLIT', label: '分裂符號', icon: '🪓',
      desc: '把符號一分為 N(數量翻倍計分;razor split / xSplit)',
      params: [
        { key: 'symbol', label: '符號',   type: 'symbol', required: true },
        { key: 'into',   label: '分裂數', type: 'number', placeholder: '2', default: 2, required: true },
      ] },
    { type: 'DESTROY_ADJACENT', label: '相鄰消除', icon: '🧨',
      desc: '以符號為中心消除相鄰範圍(可炸開封閉列;xBomb)',
      params: [
        // v8.45 / 批次D GAP-A4:required 放寬(anchor=WIN 時中心非符號;只鬆不緊,舊資料無感)
        { key: 'symbol',    label: '中心符號', type: 'symbol',
          desc: 'anchor=SYMBOL(預設)時必填;anchor=WIN 時忽略(中心為本筆中獎格)' },
        { key: 'radius',    label: '半徑',    type: 'number', placeholder: '1', default: 1 },
        { key: 'open_rows', label: '炸開封閉列', type: 'enum', options: ['Y', 'N'], default: 'N',
          desc: '消除範圍觸及封閉列時將其開啟(Fire in the Hole)' },
        // v8.45 / 批次D GAP-A4:錨定族(一族收編 Gonzo 系 anchor=WIN / xBomb 系 / 炸彈符全類)
        { key: 'anchor',    label: '錨定',    type: 'enum', options: ['SYMBOL', 'WIN'], default: 'SYMBOL',
          desc: 'SYMBOL=以中心符號為錨(現行為);WIN=以本筆中獎格為錨,消除其相鄰' +
                '(Temple Tumble 銷毀中獎相鄰石磚)' },
      ] },
    { type: 'GROW_BOARD', label: '盤面成長', icon: '📐',
      desc: '事件驅動的加列/加輪/開格(White Rabbit / Nitro / Infinity Reels / Money Train)',
      params: [
        { key: 'effect',  label: '效果',   type: 'enum', options: ['ADD_ROW', 'ADD_REEL', 'OPEN_CELL'], default: 'ADD_ROW', required: true },
        { key: 'target',  label: '目標',   type: 'text', placeholder: '3 或 RIGHTMOST',
          desc: 'reel_id(1-based)/RIGHTMOST=最右輪;ADD_REEL 時為插入位置' },
        { key: 'amount',  label: '數量',   type: 'number', placeholder: '1', default: 1 },
        { key: 'cap',     label: '上限(可選)', type: 'number', placeholder: '12',
          desc: '成長上限(如 White Rabbit 高度 12、Infinity 12 輪巨獎門檻搭配 reel_height 條件)' },
        { key: 'persist', label: '持久範圍', type: 'enum', options: ['SPIN', 'FEATURE'], default: 'FEATURE' },
      ] },

    // ── v8.21 / G1 價值引擎:值動作(六枚) ──
    //   純描述:本工具不執行、不算 RTP;a_loader.parse_actions 照收(schemas.ActionType additive)、
    //   logic_parser 無 handler(值如何演化 / 命中率 / RTP 由下游模擬工具實作)。docgen 照印進「特色規則」。
    //   value / factor 等數值 param 可填動態值 symbol_count.<SID>(A-11);scope 可搭 G5 範圍謂詞。
    { type: 'COLLECT', label: '收集值', icon: '🧺',
      desc: '把盤面上的值收集到計量表 / 彩池(Hold&Win 收金幣、集滿進度)',
      params: [
        { key: 'target', label: '收集標的', type: 'text', placeholder: 'METER / JACKPOT / coin_pool', required: true,
          desc: '收進哪裡:METER=進度計量、JACKPOT=彩池、或自訂 global 變數名' },
        { key: 'source', label: '值來源(可選)', type: 'text', placeholder: 'symbol_value / cell_value',
          desc: '收集哪種值;留空=盤面上帶值的符號' },
        { key: 'scope',  label: '作用範圍(可選)', type: 'text', placeholder: 'all_visible / adjacent_4 …',
          desc: 'G5 範圍謂詞;留空=全盤' },
      ] },
    { type: 'PAY', label: '直接派彩', icon: '💰',
      desc: '直接給付一個值(即時派彩;不經連線結算)',
      params: [
        { key: 'value',  label: '數值',   type: 'text', dyn: true, placeholder: '10 或 feature_value_total', required: true,
          desc: '固定數值,或動態值/公式(feature_value_total / symbol_count.<SID> + 1)' },   // v8.34 GAP-S1:泛化為公式
        { key: 'source', label: '值來源(可選)', type: 'text', placeholder: 'symbol_value / meter',
          desc: '派彩依據;留空=直接用 value' },
      ] },
    { type: 'MULTIPLY_VALUE', label: '值乘算', icon: '✳️',
      desc: '對盤面 / 某格的「值」做乘算(值成長,不同於 ADJUST_MULTIPLIER 的贏分倍數)',
      params: [
        { key: 'factor', label: '乘數', type: 'text', dyn: true, placeholder: '2 或 symbol_count.WILD', required: true,
          desc: '固定乘數或動態值/公式(symbol_count.<SID> * 2)' },   // v8.34 GAP-S1:泛化為公式
        { key: 'target', label: '標的(可選)', type: 'text', placeholder: 'symbol_value.COIN / cell_value',
          desc: '要乘算哪個值;留空=範圍內所有帶值格' },
        { key: 'scope',  label: '作用範圍(可選)', type: 'text', placeholder: 'same_column / adjacent_8 …',
          desc: 'G5 範圍謂詞;留空=全盤' },
      ] },
    { type: 'REVIVE', label: '回補回合', icon: '🔁',
      desc: '重置 / 延長 respin 次數(Hold&Win 新符落定回補;界-2 sticky「重跑」)',
      params: [
        { key: 'respins', label: '回補局數', type: 'number', placeholder: '3', required: true,
          desc: '重置或增加的 respin 次數' },
        { key: 'trigger', label: '觸發描述(可選)', type: 'text', placeholder: 'NEW_SYMBOL / ANY_WIN',
          desc: '何時回補;純描述,實際判定交下游' },
      ] },
    { type: 'COMPACT', label: '盤面壓實', icon: '🧲',
      desc: '消除空隙、把值格向某方向聚攏(收集型盤面整理)',
      params: [
        { key: 'direction', label: '方向', type: 'enum', options: ['DOWN', 'UP', 'LEFT', 'RIGHT'], default: 'DOWN', required: true },
        { key: 'scope',     label: '作用範圍(可選)', type: 'text', placeholder: 'same_column / all_visible …',
          desc: 'G5 範圍謂詞;留空=全盤' },
      ] },
    { type: 'CONVERT', label: '值/型態轉換', icon: '🔀',
      desc: '按規則把值 / 型態轉成另一種(★獨立 atype,非 BOARD_TRANSFORM;可依值轉換)',
      params: [
        { key: 'from', label: '來源型態/符號', type: 'text', placeholder: 'COIN / SILVER', required: true,
          desc: '要轉換的來源(符號 id 或值型態)' },
        { key: 'to',   label: '目標型態/符號', type: 'text', placeholder: 'GOLD / JACKPOT', required: true,
          desc: '轉換後的目標' },
        { key: 'by_value', label: '依值轉換', type: 'enum', options: ['Y', 'N'], default: 'N',
          desc: 'Y=依攜帶值決定轉換結果(如值達門檻升級);N=直接型態轉換' },
        { key: 'scope', label: '作用範圍(可選)', type: 'text', placeholder: 'all_visible / adjacent_4 …',
          desc: 'G5 範圍謂詞;留空=全盤' },
      ] },

    // ── v8.24 / G5 生存結束:流程控制動作 ──
    //   純描述:本工具不執行、不算 RTP;a_loader.parse_actions 照收(schemas.ActionType additive)、
    //   logic_parser 無 handler(結束語意交下游)。與 ModeConfig.end_condition 連動。
    { type: 'END_FEATURE', label: '結束 feature', icon: '🏁',
      desc: '結束當前 feature(生存局 / 條件式結束;White Rabbit 活到某條件、Toro 直到某符號出現)',
      params: [
        { key: 'when', label: '結束條件(謂詞,可選)', type: 'text', placeholder: 'respins_left == 0 / symbol_count.SEVEN >= 1',
          desc: '滿足此謂詞即結束;留空=無條件立即結束。與模式 End_Condition 連動,語意由下游實作' },
      ] },
    // ── v8.43 / C-1 GAP-T2:條件式輪帶切換二枚(描述型,無 handler、五核零觸碰;
    //    schemas.ActionType 尾端 additive;執行語意由下游模擬工具實作) ──
    { type: 'SYMBOL_SWAP', label: '輪帶符號置換', icon: '🎞️',
      desc: '把「輪帶層」的某符號置換為另一符號(轉動中即見新符,影響後續抽樣與聽牌;' +
            '非 BOARD_TRANSFORM 的落盤後變形)。存續期滿自動還原' +
            '(PotA 人類符逐級轉 Wild / PE2 山羊升級鏈 / Goonies Go Wild)',
      params: [
        { key: 'from_symbol', label: '原符號', type: 'symbol', required: true, groupable: true,
          desc: '單一符號、或家族:group:<家族ID>(全員)/ group_any:<家族ID>(隨機一種);' +
                '對齊 BOARD_TRANSFORM v8.36 家族參照語法' },
        { key: 'to_symbol',   label: '新符號', type: 'symbol', required: true },
        { key: 'reels',       label: '限定輪(可選)', type: 'text', placeholder: '2,3,4',
          desc: '逗號分隔 1-based 輪號(對齊 04b Reel_ID);留空 = 全輪' },
        { key: 'persist',     label: '存續範圍', type: 'enum',
          options: ['SPIN', 'FEATURE', 'SESSION'], default: 'FEATURE',
          desc: 'SPIN=僅本局;FEATURE=至 feature 結束(PotA/PE2/Goonies 皆此);SESSION=跨局持久' },
      ] },
    { type: 'SWITCH_STRIP', label: '輪帶切換', icon: '🎠',
      desc: '把某輪整條輪帶切換為 04b 定義的「變體帶」(Mode_Scope=「模式#變體名」列);' +
            '存續期滿還原為原模式帶。White Rabbit 皇后輪式',
      params: [
        { key: 'reel',    label: '輪號(1-based)', type: 'number', placeholder: '3', required: true,
          desc: '對齊 04b Reel_ID(1-based;注意與 LOCK_REEL 0-based 不同,本參數跟隨 04b)' },
        { key: 'variant', label: '變體帶鍵', type: 'text', placeholder: 'FG1#QUEEN', required: true,
          desc: '04b 的 Mode_Scope 變體鍵(「模式#變體名」);該鍵該輪需有 Strip_Sequence' },
        { key: 'persist', label: '存續範圍', type: 'enum', options: ['FEATURE', 'SESSION'], default: 'FEATURE' },
      ] },
    // ── v8.44 / C-2 GAP-P5:面板動態啟停(描述型,無 handler;與 02b Active_Modes
    //    靜態模式域疊加:兩者皆過才作動) ──
    { type: 'PANEL_SET', label: '面板啟停', icon: '🎛️',
      desc: '事件驅動地啟用/停用某副盤(Gorilla Gold 金猴解鎖 GRID2~4)。' +
            '停用 = 該盤不物化不評價;與 02b Active_Modes(靜態模式域)疊加:兩者皆過才作動',
      params: [
        { key: 'panel',  label: '面板', type: 'panel', required: true, placeholder: 'GRID2',
          desc: '02b 的 Panel_ID' },
        { key: 'active', label: '啟停', type: 'enum', options: ['Y', 'N'], default: 'Y', required: true },
      ] },
  ];
  const ACTION_BY_TYPE = Object.fromEntries(ACTION_CATALOG.map(a => [a.type, a]));

  // ──────────────────────────────────────────────────────────
  //  Action DSL 編解碼器(對齊後端 condition_parser.parse_actions)
  //    後端格式:TYPE(k1=v1, k2=v2); TYPE(k1=v1); ...
  //    Value 編碼規則(_parse_value 反推):
  //      number     → 直接寫(不加引號)
  //      bool       → true/false(後端 .upper() 比對)
  //      string     → 純識別字直接寫;含空白/符號加雙引號
  //      array/list → [1,2,3]
  //      dict       → {k:v,k:v}
  // ──────────────────────────────────────────────────────────
  function encodeActionValue(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      return Number.isFinite(v) ? String(v) : '0';
    }
    if (typeof v === 'boolean') {
      return v ? 'true' : 'false';
    }
    if (Array.isArray(v)) {
      return '[' + v.map(encodeActionValue).join(',') + ']';
    }
    if (typeof v === 'object') {
      // dict — 後端 _parse_value 用 {k:v,k:v} 格式
      const pairs = Object.entries(v).map(([k, vv]) => `${k}:${encodeActionValue(vv)}`);
      return '{' + pairs.join(',') + '}';
    }
    // string:若是純識別字(只有英數底線點)直接寫;否則用雙引號
    const s = String(v);
    if (/^[A-Za-z_][A-Za-z0-9_\.]*$/.test(s)) return s;
    if (/^-?\d+(\.\d+)?$/.test(s))            return s;  // 數字字串直寫
    return '"' + s.replace(/"/g, '\\"') + '"';
  }

  // 一個 Action 物件 → DSL 片段
  function encodeAction(act) {
    if (!act || !act.atype) return '';
    const params = act.params || {};
    const meta = ACTION_BY_TYPE[act.atype];
    // 依 catalog 順序輸出已知 params,再補上 catalog 外的 extra params
    const keys = [];
    if (meta) {
      for (const p of meta.params) {
        if (p.key in params && params[p.key] !== '' && params[p.key] != null) keys.push(p.key);
      }
      for (const k of Object.keys(params)) {
        if (!keys.includes(k) && params[k] !== '' && params[k] != null) keys.push(k);
      }
    } else {
      for (const k of Object.keys(params)) {
        if (params[k] !== '' && params[k] != null) keys.push(k);
      }
    }
    const pairs = keys.map(k => `${k}=${encodeActionValue(params[k])}`);
    return `${act.atype}(${pairs.join(', ')})`;
  }

  // actions list → DSL 字串(用於匯出 xlsx Actions 欄位)
  function buildActionsDSL(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return '';
    return actions.filter(a => a && a.atype).map(encodeAction).join('; ');
  }

  // ── 反向:DSL 字串 → actions list(用於匯入 xlsx)──
  // 簡化版 — 處理常見 case;複雜表達式(嵌套 dict、引號內逗號)走後端為準
  function parseActionsDSL(text) {
    if (!text || !String(text).trim()) return [];
    const s = String(text);
    const out = [];
    // 用深度感知的分號切割
    const chunks = splitTopLevel(s, ';');
    for (const chunk of chunks) {
      const c = chunk.trim();
      if (!c) continue;
      const m = c.match(/^([A-Z_]+)\s*\((.*)\)\s*$/s);
      if (!m) continue;
      const atype = m[1];
      const paramsStr = m[2];
      const params = parseActionParamsDSL(paramsStr);
      out.push({ atype, params });
    }
    return out;
  }

  function parseActionParamsDSL(s) {
    s = (s || '').trim();
    if (!s) return {};
    const out = {};
    const pairs = splitTopLevel(s, ',');
    for (const pair of pairs) {
      const eqIdx = indexOfTopLevel(pair, '=');
      if (eqIdx < 0) continue;
      const k = pair.slice(0, eqIdx).trim();
      const v = pair.slice(eqIdx + 1).trim();
      if (k) out[k] = parseActionValue(v);
    }
    return out;
  }

  function parseActionValue(s) {
    s = (s || '').trim();
    if (!s) return '';
    // dict
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return {};
      const out = {};
      for (const pair of splitTopLevel(inner, ',')) {
        const colon = indexOfTopLevel(pair, ':');
        if (colon < 0) continue;
        const k = pair.slice(0, colon).trim();
        const v = pair.slice(colon + 1).trim();
        if (k) out[k] = parseActionValue(v);
      }
      return out;
    }
    // list
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      return splitTopLevel(inner, ',').map(x => parseActionValue(x.trim()));
    }
    // number
    if (/^-?\d+$/.test(s))       return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s))  return parseFloat(s);
    // bool
    if (s.toUpperCase() === 'TRUE')  return true;
    if (s.toUpperCase() === 'FALSE') return false;
    // quoted string
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;   // bare ident
  }

  // 深度感知字串切割(忽略 ()[]{} 內的分隔符)
  function splitTopLevel(s, sep) {
    const out = [];
    let depth = 0;
    let cur = '';
    let inStr = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        cur += ch;
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; cur += ch; continue; }
      if (ch === sep && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  function indexOfTopLevel(s, ch) {
    let depth = 0;
    let inStr = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; continue; }
      if (c === ')' || c === ']' || c === '}') { depth--; continue; }
      if (c === ch && depth === 0) return i;
    }
    return -1;
  }

  // 舊 JSON-style params 解析(只在「JSON 模式」備援用,新流程已不主要使用)
  function parseActionParams(s) {
    if (!s || !s.trim()) return {};
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
      return null;
    } catch (e) {
      return null;
    }
  }
  function buildActionParams(obj) {
    if (!obj || Object.keys(obj).length === 0) return '';
    return JSON.stringify(obj);
  }

  // ──────────────────────────────────────────────────────────
  //  mode_scope ↔ condition 合併器
  //    後端 PuzzleRule 沒有 mode_scope 欄位 — 我們把它編碼到 condition 裡面
  //    匯出時:若 mode_scope !== 'ALL',在 condition 前加 (mode == X) AND ...
  //    匯入時:若 condition 開頭是 mode == X,自動抽出設成 mode_scope
  //    v8.16(scope 豁免):多模式(逗號分隔,如 'NG,FG1')編碼為
  //      「mode in [NG, FG1]」前綴 — condition_parser 既有文法
  //      (IN 運算子 + 清單字面值),引擎端零改動。單模式路徑行為不變。
  // ──────────────────────────────────────────────────────────
  function composeConditionWithModeScope(modeScope, condition) {
    const ms = (modeScope || 'ALL').trim();
    let cond = (condition || '').trim();
    if (!ms || ms === 'ALL') return cond;   // scope=ALL:條件原樣(尊重手寫 mode 條件)
    // v8.16:scope 非 ALL 時,先剝除條件內既有 mode 前綴(單/多),
    //   以 mode_scope 為唯一真相重組 — 避免「mode in [A,B] AND (mode == A AND …)」
    //   雙重編碼(舊種子資料/多次 round-trip 皆可能殘留前綴)。
    const ex = extractModeScope(cond);
    if (ex.mode_scope !== 'ALL') cond = ex.rest_condition;
    const parts = ms.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const prefix = `mode in [${parts.join(', ')}]`;
      return cond ? `${prefix} AND (${cond})` : prefix;
    }
    if (!cond) return `mode == ${ms}`;
    return `mode == ${ms} AND (${cond})`;
  }

  // 從 condition 抽出 mode_scope(僅當開頭就是 mode == X / mode in [..] 且後接 AND 時)
  //   回傳 { mode_scope, rest_condition };多模式回逗號串接(v8.16)
  function extractModeScope(condition) {
    const s = (condition || '').trim();
    if (!s) return { mode_scope: 'ALL', rest_condition: '' };
    // v8.16 case 0: 整條就是 mode in [A, B]
    let m = s.match(/^\s*mode\s+in\s+\[([^\]]*)\]\s*$/i);
    if (m) {
      const parts = m[1].split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length) return { mode_scope: parts.join(','), rest_condition: '' };
    }
    // v8.16 case 0b: mode in [A, B] AND (...)
    m = s.match(/^\s*mode\s+in\s+\[([^\]]*)\]\s+AND\s+\((.+)\)\s*$/i);
    if (m) {
      const parts = m[1].split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length) return { mode_scope: parts.join(','), rest_condition: m[2].trim() };
    }
    // v8.16 case 0c: mode in [A, B] AND rest(無括號)
    m = s.match(/^\s*mode\s+in\s+\[([^\]]*)\]\s+AND\s+(.+)$/i);
    if (m) {
      const parts = m[1].split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length) return { mode_scope: parts.join(','), rest_condition: m[2].trim() };
    }
    // case 1: 整條就是 mode == X
    m = s.match(/^\s*mode\s*==\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (m) return { mode_scope: m[1], rest_condition: '' };
    // case 2: mode == X AND (...)
    m = s.match(/^\s*mode\s*==\s*([A-Za-z_][A-Za-z0-9_]*)\s+AND\s+\((.+)\)\s*$/i);
    if (m) return { mode_scope: m[1], rest_condition: m[2].trim() };
    // case 3: mode == X AND rest(無括號)
    m = s.match(/^\s*mode\s*==\s*([A-Za-z_][A-Za-z0-9_]*)\s+AND\s+(.+)$/i);
    if (m) return { mode_scope: m[1], rest_condition: m[2].trim() };
    return { mode_scope: 'ALL', rest_condition: s };
  }

  // ──────────────────────────────────────────────────────────
  //  xlsx 匯入 helpers(把 cell 值安全轉成各種型別)
  // ──────────────────────────────────────────────────────────
  function asStr(v) {
    if (v == null) return '';
    if (typeof v === 'object' && v.text != null) return String(v.text);     // ExcelJS rich text
    if (typeof v === 'object' && v.result != null) return String(v.result); // formula
    return String(v);
  }
  function asNum(v, def = 0) {
    if (v == null || v === '') return def;
    if (typeof v === 'object' && v.result != null) v = v.result;
    const n = Number(v);
    return Number.isNaN(n) ? def : n;
  }
  function asBool(v) {
    if (typeof v === 'boolean') return v;
    const s = asStr(v).trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1' || s === 'y';
  }

  // 視覺常數
  const LAYOUT_CELL_SIZE = 22;
  const LAYOUT_CELL_GAP  = 2;
  const LAYOUT_SUBREEL_GAP = 5;
  const LAYOUT_LABEL_HEIGHT = 16;


  // ══════════════════════════════════════════════════════════
  //  Expose all top-level helpers/constants
  //  setup.js does:  const H = SP.ConfigEditor.Helpers;
  //  then: H.loadGlobal(), H.TAB_GROUPS, H.PRESET_LIBRARY, ...
  // ══════════════════════════════════════════════════════════
  SP.ConfigEditor.Helpers = {
    TAB_GROUPS, TABS, TABS_BY_GROUP, PAY_TYPES,
    WAYS_DIRS, DEFAULT_GLOBAL, LS_GLOBAL_KEY, LS_MODES_KEY,
    LS_BASELINE_KEY, BASELINE_KEYS, captureBaselineSnapshot, saveBaseline,
    loadBaseline, ensureBaseline, _safeParse, _diffObject,
    _diffArrayById, _diffWeightsMap, computeChangesFromBaseline, computeChangesBetweenSnapshots,
    _TPL_SHORT_TO_LS, _templateDataGetter, computeChangesBetweenTemplates, _computeChangesBetween,
    _fmtVal, _formatWeightsChanges, loadGlobal, saveGlobal,
    makeMode, DEFAULT_MODES, loadModes, saveModes,
    LS_LAYOUT_KEY, makeReel, DEFAULT_LAYOUT, loadLayout,
    SUBREEL_KINDS, SUBREEL_KIND_MAP,
    LS_PANELS_KEY, makePanel, loadPanels, savePanels,
    PANEL_TYPES, isStagePanel, panelCellSet, normalizeMask, maskToStr, maskStrToCells,
    makePayRow, migratePayRows,
    LS_REEL_STRIPS_KEY, defaultReelStrips, loadReelStrips, saveReelStrips,
    parseStripStr, stripToStr, stripToWeights, weightsToStrip,
    makeBonusItem,
    // v8.0:LS_BONUS_GAMES_KEY/defaultBonusGames/makeBonusGame/loadBonusGames/saveBonusGames 已移除
    LS_MULTIPLIERS_KEY, defaultMultipliers, makeMultValue, loadMultipliers, saveMultipliers, parseLadder,
    LS_COIN_VALUES_KEY, defaultCoinValues, makeCoinDenom, loadCoinValues, saveCoinValues,
    makeMultValueEntry, makePrizeValueEntry, migrateSymbolMults,
    LS_BET_CONFIG_KEY, defaultBetConfig, makeBuyFeature, loadBetConfig, saveBetConfig,
    LS_JACKPOTS_KEY, makeJackpot, loadJackpots, saveJackpots,
    LS_SYMBOLSETS_KEY, loadSymbolSets, saveSymbolSets,
    saveLayout, LS_BINS_KEY, DEFAULT_BINS, DEFAULT_BIN_EDGES,
    loadBins, saveBins, parseBinEdges, LS_PAYLINES_KEY,
    PAYLINE_DIRECTIONS, makePayline, DEFAULT_PAYLINES, loadPaylines,
    savePaylines, parsePathString, validatePayline, generatePaylinePoints, LS_CONSTRAINTS_KEY,
    CONSTRAINT_TYPES, makeConstraint, DEFAULT_CONSTRAINTS, loadConstraints,
    saveConstraints, LS_REELW_KEY, loadReelWeights, saveReelWeights,
    LS_GENLIMITS_KEY, makeGenLimit, loadGenLimits, saveGenLimits,
    genLimitZones, genLimitZoneLabel, genLimitStatus, humanizeGenLimit,
    LS_GRIDW_KEY, DEFAULT_GRID_SIZES, loadGridWeights, saveGridWeights,
    parseGridSizes, LS_COMBO_KEY, loadComboWeights, saveComboWeights,
    LS_DISCARD_KEY, DISCARD_KINDS, makeDiscard, DEFAULT_DISCARDS,
    loadDiscards, saveDiscards, LS_RULES_KEY, TRIGGER_CATALOG,
    TRIGGER_TYPES, TRIGGER_BY_TYPE, OP_TYPES, OP_IS_LIST,
    VAR_CATEGORIES, VAR_CATEGORY_MAP, makeAction, makeRule,
    DEFAULT_RULES, loadRules, deepCopyRule, migrateRuleSchema,
    MIGRATE_TRIGGER_MAP, PRESET_LIBRARY, saveRules, parseCondition,
    buildCondition, evalCondition, evalRow, ACTION_CATALOG,
    ACTION_BY_TYPE, encodeActionValue, encodeAction, buildActionsDSL,
    parseActionsDSL, parseActionParamsDSL, parseActionValue, splitTopLevel,
    indexOfTopLevel, parseActionParams, buildActionParams, composeConditionWithModeScope,
    extractModeScope, asStr, asNum, asBool,
    LAYOUT_CELL_SIZE, LAYOUT_CELL_GAP, LAYOUT_SUBREEL_GAP, LAYOUT_LABEL_HEIGHT,
  };

  // v5.3:symbol.js 需要的賠付表工具，掛到全域 SP（lazy 安全：symbol.js setup() 執行時 helpers 已載入）
  SP.makePayRow     = makePayRow;
  SP.migratePayRows = migratePayRows;

  console.log('[config-editor/helpers] loaded', Object.keys(SP.ConfigEditor.Helpers).length, 'symbols');

})();
