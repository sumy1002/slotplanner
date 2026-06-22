// ============================================================
//  app.js v4
//  - askDownloadLocation：File System Access API
//  - 主 app 的 state 永遠用原始群組名當 key
//  - convert() 時根據 askDownloadLocation 決定下載方式
// ============================================================

(function () {
  'use strict';

  const { createApp, ref, computed, reactive, onMounted, provide } = Vue;
  const SP = window.SlotPlanner;

  const LS_FILTER_KEY = 'slotplanner.filterSettings.v1';
  const ALL_SHEETS = SP.xlsx.SHEET_ORDER;
  const ALL_COLS   = SP.xlsx.HEADER;

  const registry = new SP.SymbolRegistry();
  const initStatus = registry.initOrLoad(5);
  console.log('[Registry]', initStatus === 'loaded'
    ? `已從 localStorage 載入 ${registry.symbols().length} 個 symbol`
    : `已建立預設 ${registry.symbols().length} 個 symbol`);

  // ── 中央連動層(單一真相):從 LS/registry 收斂 reelCount/副輪/賠付模型/方向/megaways ──
  //    建立後立即 refresh 一次,把盤面輪數推回 registry(符號頁 reel_limit 連動盤面)。
  const gameSpec = new SP.GameSpec(registry);
  gameSpec.refresh();
  SP.gameSpec = gameSpec;   // 掛 window.SlotPlanner.gameSpec 供 console 檢視
  console.log('[gameSpec]', `reelCount=${gameSpec.reelCount} payModel=${gameSpec.payModel} `
    + `dir=${gameSpec.scoreDir} 副輪=${gameSpec.subReels.length}`);

  // ── v6.3 / Q3:一次性遷移 — 把舊 15_Multipliers / 16_Coin_Values / progress 併入符號 + 模式 ──
  //   冪等(multipliers.migrated_to_symbols 旗標);失敗僅警告不影響啟動。
  (function migrateQ3() {
    try {
      const H = SP.ConfigEditor && SP.ConfigEditor.Helpers;
      if (!H || typeof H.migrateSymbolMults !== 'function') return;
      const multipliers = H.loadMultipliers();
      if (multipliers && multipliers.migrated_to_symbols) return;   // 已遷移
      const coinValues = H.loadCoinValues();
      const modes = H.loadModes();
      const syms = registry.symbols();          // clones(含 mult_values/prize_values)
      const swatch = registry.swatchMap();
      const res = H.migrateSymbolMults(syms, multipliers, coinValues, modes);
      if (res.changed) {
        registry.applyAll(syms, swatch);
        H.saveModes(modes);
      }
      multipliers.migrated_to_symbols = true;    // 不論是否有變更皆標記,避免每次啟動重試
      H.saveMultipliers(multipliers);
      console.log('[Q3 migrate]', res.changed ? '已併入符號 / 模式' : '無資料可遷移,標記完成');
    } catch (e) {
      console.warn('[Q3 migrate] 失敗(略過):', e);
    }
  })();

  const app = createApp({
    setup() {
      const page        = ref(0);
      const sbCollapsed = ref(false);

      // ── 「數據文件相關」區段的子分頁（仿設定檔編輯器分頁）──
      // ready=false 的分頁為未來功能占位,點進去顯示「開發中」。
      const dataTabs = [
        { id: 'txt2xlsx', name: 'TXT → XLSX',    icon: '📄', ready: true  },
        // v4.9-b:模擬引擎下架後,「比較前後調整數據」由此工具接手
        //        (上傳兩份外部模擬器產出的 B 結果檔並排比較)
        { id: 'bcompare', name: 'A/B 結果比較',  icon: '📊', ready: true  },
        { id: 'more',     name: '更多功能',      icon: '➕', ready: false },
      ];
      const dataTab = ref('txt2xlsx');
      const activeDataTab = computed(() => dataTabs.find(t => t.id === dataTab.value) || null);
      const titles = {
        0: '數據文件相關', 1: 'Symbol 管理',
        3: 'A 設定檔編輯器', 4: '批次處理', 5: '資料比對'
      };
      const status = ref({ type: 'wait', msg: '已就緒' });

      // v4.9-b:Pyodide 載入狀態區塊已移除(模擬引擎下架,改外部程式執行)

      const fileInput    = ref(null);
      const fileInfo     = ref(null);
      const isConverting = ref(false);
      const parsedCache  = ref(null);

      function setStatus(type, msg) { status.value = { type, msg }; }

      const pageDefaultStatus = {
        0: { type: 'wait', msg: '已就緒，請選擇 TXT 檔案' },
        1: { type: 'wait', msg: 'Symbol 管理' },
        3: { type: 'wait', msg: 'A 設定檔編輯器' },
        4: { type: 'wait', msg: '功能開發中' },
        5: { type: 'wait', msg: '功能開發中' },
      };

      function _statusForDataTab() {
        if (dataTab.value === 'txt2xlsx') {
          if (fileInfo.value) setStatus('wait', `已選擇：${fileInfo.value.name}`);
          else status.value = { ...pageDefaultStatus[0] };
        } else if (dataTab.value === 'bcompare') {
          setStatus('wait', '上傳 A、B 兩份外部模擬結果檔(B_結果_*.xlsx)以比較');
        } else {
          setStatus('wait', '功能開發中');
        }
      }

      function setDataTab(t) {
        const id = typeof t === 'string' ? t : (t && t.id);
        if (!id || id === dataTab.value) return;
        dataTab.value = id;
        _statusForDataTab();
      }

      // 拖曳載入僅在「數據文件相關 → TXT → XLSX」子分頁生效
      function _dragActive() { return page.value === 0 && dataTab.value === 'txt2xlsx'; }

      function goPage(i) {
        // v3 變更:page 2(盤面設計)已整合進設定檔編輯器,自動遷移
        if (i === 2) i = 3;
        // v4.9-b:模擬引擎(6)已移除 — 自動遷移到「數據文件相關 → A/B 結果比較」
        if (i === 6) { i = 0; dataTab.value = 'bcompare'; }
        // 連動層:切頁前刷新一次,確保目的分頁讀到最新的盤面/全域權威值
        try { SP.gameSpec && SP.gameSpec.refresh(); } catch (e) {}
        page.value = i;
        if (i === 0) _statusForDataTab();
        else status.value = { ...pageDefaultStatus[i] };
      }
      // v6.2 規則#11:供其他頁(如符號頁)帶意圖切到設定檔編輯器
      //   config-page 是 v-if(page===3,:key=3)會重掛,setup 於 onMounted 讀取並消費此意圖
      SP.goConfig = (intent) => { SP.pendingConfigIntent = intent || null; goPage(3); };

      function onChildStatus(s) { status.value = { ...s }; }

      // ── 拖曳 ──
      const isDragging = ref(false);
      let dragCounter = 0;
      function onContentDragEnter(e) {
        if (!_dragActive()) return;
        if (!e.dataTransfer?.types?.includes('Files')) return;
        dragCounter++; isDragging.value = true;
      }
      function onContentDragOver(e) { if (_dragActive()) e.preventDefault(); }
      function onContentDragLeave() {
        if (!_dragActive()) return;
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; isDragging.value = false; }
      }
      function onContentDrop(e) {
        if (!_dragActive()) return;
        e.preventDefault(); dragCounter = 0; isDragging.value = false;
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
      }

      const dropClass = computed(() => isDragging.value ? 'drag' : fileInfo.value ? 'selected' : 'default');
      const dropIcon  = computed(() => isDragging.value ? '📂' : fileInfo.value ? '🗂️' : '📁');
      const dropMain  = computed(() => {
        if (isDragging.value) return '放開以選擇檔案';
        if (fileInfo.value)   return `✔ 已選擇：${fileInfo.value.name}`;
        return '拖曳 TXT 檔案到這裡';
      });
      const dropSub = computed(() => {
        if (isDragging.value) return '僅接受 .txt 檔案';
        if (fileInfo.value)   return '點擊或拖曳以重新選擇';
        return '或點擊選擇檔案';
      });

      function triggerPick() { fileInput.value?.click(); }
      function onPickedFile(e) {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = '';
      }

      async function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.txt')) { setStatus('err', '請選擇 TXT 檔案'); return; }
        if (file.size === 0) { setStatus('err', '檔案是空的，請確認內容'); return; }
        try {
          const buf = await file.arrayBuffer();
          const content = SP.parser.decodeText(buf);
          fileInfo.value = { name: file.name, size: file.size, content };
          parsedCache.value = SP.parser.parse(content);
          buildFilterState(parsedCache.value.sheets, false);
          // 換 TXT 重置排序
          ALL_SHEETS.forEach(sh => {
            groupOrder[sh] = SP.parser.extractSmartGroups(parsedCache.value.sheets[sh] || []).map(g => g.name);
            subOrder[sh] = {};
          });
          setStatus('wait', `已選擇：${file.name}（${(file.size / 1024).toFixed(1)} KB）`);
        } catch (err) {
          setStatus('err', `讀取檔案失敗：${err.message}`);
        }
      }

      // ── 篩選設定 ──
      const colsOn  = reactive({});
      const groupOn = reactive({});
      const subOn   = reactive({});
      const askDownloadLocation = ref(false);

      // 排序（session 級，換 TXT 重置；不存 localStorage）
      const groupOrder = reactive({});
      const subOrder   = reactive({});

      function initColSettings() {
        ALL_COLS.forEach(c => { colsOn[c] = true; });
        colsOn['分子'] = false; colsOn['分母'] = false;
        try {
          const raw = localStorage.getItem(LS_FILTER_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.cols) Object.keys(saved.cols).forEach(k => {
              if (k in colsOn) colsOn[k] = !!saved.cols[k];
            });
            if (typeof saved.askDownloadLocation === 'boolean') {
              askDownloadLocation.value = saved.askDownloadLocation;
            }
          }
        } catch (e) { /* ignore */ }
      }

      // 用「原始群組名」(extractGroups) 初始化 state
      function buildFilterState(sheets, keepGroups) {
        ALL_SHEETS.forEach(sh => {
          if (!groupOn[sh]) groupOn[sh] = {};
          if (!subOn[sh])   subOn[sh]   = {};
          const groups = SP.parser.extractGroups(sheets[sh] || []);
          if (!keepGroups) { groupOn[sh] = {}; subOn[sh] = {}; }
          groups.forEach(g => {
            if (!(g.name in groupOn[sh])) groupOn[sh][g.name] = true;
            if (!subOn[sh][g.name]) subOn[sh][g.name] = {};
            g.rows.forEach((_, ri) => { if (!(ri in subOn[sh][g.name])) subOn[sh][g.name][ri] = true; });
          });
        });
      }

      function saveSettingsToLS() {
        try {
          localStorage.setItem(LS_FILTER_KEY, JSON.stringify({
            cols: { ...colsOn },
            askDownloadLocation: askDownloadLocation.value,
          }));
        } catch (e) { /* ignore */ }
      }

      // 篩選按鈕徽章用
      const filterSummary = computed(() => {
        if (!parsedCache.value) return { sel: 0, tot: 0 };
        let sel = 0, tot = 0;
        ALL_SHEETS.forEach(sh => {
          const rows = parsedCache.value.sheets[sh] || [];
          if (sh === '整體') {
            const cnt = rows.filter(r => r.name && r.name.trim()).length;
            tot += cnt; sel += cnt; return;
          }
          SP.parser.extractGroups(rows).forEach(g => {
            const gOn = groupOn[sh]?.[g.name] !== false;
            g.rows.forEach((_, ri) => {
              tot++;
              if (gOn && subOn[sh]?.[g.name]?.[ri] !== false) sel++;
            });
          });
        });
        return { sel, tot };
      });

      function buildFilterCfg() {
        const cfg = {};
        ALL_SHEETS.forEach(sh => {
          cfg[sh] = {};
          if (sh === '整體') {
            SP.parser.extractGroups(parsedCache.value?.sheets[sh] || []).forEach(g => {
              const subs = {};
              g.rows.forEach((_, ri) => { subs[ri] = true; });
              cfg[sh][g.name] = { groupOn: true, subOn: subs };
            });
            return;
          }
          SP.parser.extractGroups(parsedCache.value?.sheets[sh] || []).forEach(g => {
            const subs = {};
            g.rows.forEach((_, ri) => { subs[ri] = subOn[sh]?.[g.name]?.[ri] !== false; });
            cfg[sh][g.name] = { groupOn: groupOn[sh]?.[g.name] !== false, subOn: subs };
          });
        });
        return cfg;
      }

      // 排序資訊（給 xlsx 用）
      function buildOrderCfg() {
        return {
          groupOrder: JSON.parse(JSON.stringify(groupOrder)),
          subOrder:   JSON.parse(JSON.stringify(subOrder)),
        };
      }

      function buildColsSet() {
        const s = new Set();
        ALL_COLS.forEach(c => { if (colsOn[c]) s.add(c); });
        return s;
      }

      // ── Modal 溝通 ──
      function openModal() {
        if (!parsedCache.value || !SP.modalBus) return;
        SP.modalBus.emit('open', {
          parsedCache:  parsedCache.value,
          colsOn:       { ...colsOn },
          groupOn:      JSON.parse(JSON.stringify(groupOn)),
          subOn:        JSON.parse(JSON.stringify(subOn)),
          askDownloadLocation: askDownloadLocation.value,
          isConverting: isConverting.value,
          groupOrder:   JSON.parse(JSON.stringify(groupOrder)),
          subOrder:     JSON.parse(JSON.stringify(subOrder)),
        });
      }

      function setupBusListeners() {
        if (!SP.modalBus) return;
        SP.modalBus.on('stateSync', ({ colsOn: c, groupOn: g, subOn: s, askDownloadLocation: a, groupOrder: go, subOrder: so }) => {
          ALL_COLS.forEach(col => { colsOn[col] = c[col] !== false; });
          ALL_SHEETS.forEach(sh => {
            if (!groupOn[sh]) groupOn[sh] = {};
            if (!subOn[sh])   subOn[sh]   = {};
            groupOn[sh] = { ...(g[sh] || {}) };
            subOn[sh]   = {};
            Object.keys(s[sh] || {}).forEach(gname => {
              subOn[sh][gname] = { ...(s[sh][gname] || {}) };
            });
            if (go && go[sh]) groupOrder[sh] = [...go[sh]];
            if (so && so[sh]) subOrder[sh] = { ...so[sh] };
          });
          if (typeof a === 'boolean') askDownloadLocation.value = a;
          saveSettingsToLS();
        });
        SP.modalBus.on('convert', () => { convert(); });
      }

      // ── 下載：兩種模式 ──
      async function doDownload(blob, filename) {
        // 模式 A：File System Access API
        if (askDownloadLocation.value && 'showSaveFilePicker' in window) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: filename,
              types: [{
                description: 'Excel 檔案',
                accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
              }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
          } catch (err) {
            // 使用者取消 → 不算錯
            if (err.name === 'AbortError') return false;
            console.warn('FS Access 失敗，回退到預設下載：', err);
            // 繼續走預設下載
          }
        }
        // 模式 B：預設下載
        triggerDownload(blob, filename);
        return true;
      }

      function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      // ── 轉換 ──
      async function convert() {
        if (!fileInfo.value || isConverting.value) return;
        isConverting.value = true;
        SP.modalBus?.emit('convertingChange', true);
        setStatus('wait', '解析中…');
        await new Promise(r => setTimeout(r, 30));

        try {
          const { headerBlocks, sheets } = parsedCache.value || SP.parser.parse(fileInfo.value.content);
          const hasSheets = Object.keys(sheets).length > 0;
          const hasHeader = headerBlocks.length > 0;

          if (!hasSheets && !hasHeader) {
            setStatus('err', '轉換失敗，請確認檔案格式');
            isConverting.value = false; SP.modalBus?.emit('convertingChange', false); return;
          }
          if (!hasSheets && hasHeader) {
            const ok = confirm('檔案解析後沒有找到任何數值資料列，只有標題區塊會被輸出到 XLSX。\n\n確定要繼續嗎？');
            if (!ok) {
              setStatus('wait', '已取消轉換');
              isConverting.value = false; SP.modalBus?.emit('convertingChange', false); return;
            }
          }

          setStatus('wait', '產生 XLSX 中…');
          await new Promise(r => setTimeout(r, 30));

          const wb = await SP.xlsx.buildXlsx(headerBlocks, sheets, buildColsSet(), buildFilterCfg(), buildOrderCfg());
          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const filename = fileInfo.value.name.replace(/\.txt$/i, '') + '.xlsx';

          setStatus('wait', '下載中…');
          const ok = await doDownload(blob, filename);
          if (!ok) {
            setStatus('wait', '已取消下載');
            isConverting.value = false; SP.modalBus?.emit('convertingChange', false); return;
          }

          // 轉換完成後自動儲存設定
          saveSettingsToLS();

          const sheetNames = SP.xlsx.SHEET_ORDER.filter(s => sheets[s]);
          const { sel, tot } = filterSummary.value;
          setStatus('ok',
            `✔ 轉換完成（${sheetNames.length || 1} 個工作表：${sheetNames.join(' / ') || '整體'}）` +
            (tot - sel > 0 ? `，已略過 ${tot - sel} 項` : '')
          );
        } catch (err) {
          console.error(err);
          setStatus('err', `轉換失敗：${err.message}`);
        } finally {
          isConverting.value = false;
          SP.modalBus?.emit('convertingChange', false);
        }
      }

      provide('registry', registry);
      provide('gameSpec', gameSpec);

      // ── 亮暗切換(app 層級,全站有效)──
      const LS_THEME_KEY = 'slotplanner.uiTheme.v1';
      const themeMode = ref(localStorage.getItem(LS_THEME_KEY) || 'auto');
      function _applyTheme(mode) {
        let effective = mode;
        if (mode === 'auto') {
          const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
          effective = (mq && mq.matches) ? 'dark' : 'light';
        }
        document.documentElement.dataset.theme = effective;
      }
      function cycleTheme() {
        const order = ['auto', 'light', 'dark'];
        const idx = order.indexOf(themeMode.value);
        themeMode.value = order[(idx + 1) % order.length];
        try { localStorage.setItem(LS_THEME_KEY, themeMode.value); } catch (e) {}
        _applyTheme(themeMode.value);
      }
      const themeIcon  = computed(() => ({ auto:'◐', light:'☀', dark:'☾' })[themeMode.value] || '◐');
      const themeLabel = computed(() => ({ auto:'跟隨系統', light:'亮色', dark:'暗色' })[themeMode.value] || '?');

      onMounted(() => {
        initColSettings();
        setupBusListeners();
        // 初始套用主題(讀 LS 或跟隨系統)
        _applyTheme(themeMode.value);
        if (window.matchMedia) {
          try {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const h = () => { if (themeMode.value === 'auto') _applyTheme('auto'); };
            if (mq.addEventListener) mq.addEventListener('change', h);
            else mq.addListener(h);
          } catch (e) {}
        }
        setStatus('wait', initStatus === 'loaded'
          ? `已從 localStorage 載入 ${registry.symbols().length} 個 symbol`
          : '已就緒，請選擇 TXT 檔案');
      });

      return {
        page, sbCollapsed, titles, status,
        dataTabs, dataTab, activeDataTab, setDataTab,
        fileInput, fileInfo, isConverting,
        isDragging, dropClass, dropIcon, dropMain, dropSub,
        triggerPick, onPickedFile,
        onContentDragEnter, onContentDragOver, onContentDragLeave, onContentDrop,
        convert, goPage, onChildStatus, registry,
        filterSummary, openModal,
        askDownloadLocation,
        themeIcon, themeLabel, cycleTheme,
      };
    },
  });

  app.component('symbol-page', SP.SymbolPage);
  app.component('config-page', SP.ConfigPage);
  // v4.9-b:sim-page 已移除;A/B 結果比較接手(數據文件相關子分頁)
  app.component('b-compare-page', SP.BComparePage);
  app.component('doc-gen-page', SP.DocGenPage);
  app.mount('#app');
})();
