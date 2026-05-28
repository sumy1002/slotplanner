// ============================================================
//  filter-modal.js v4 — 大改版
//
//  資料模型澄清：
//  ───────────────────────────────────────────────
//  主 app 維護的 state 永遠用「原始群組名」當 key：
//    groupOn[sh][origName]: bool
//    subOn[sh][origName][ri]: bool
//
//  Modal 顯示「智能合併群組」，但所有勾選操作都翻譯回原始 key。
//
//  合併群組的子項目顯示規則：
//    若某 sibling 群組只有 1 個 row → 顯示成 1 個子項目（label=suffix）
//    若某 sibling 群組有多個 row → 顯示成多個子項目
//      第一筆 label = suffix
//      其餘 label = interval（同原始）
//
//  v4 新增：
//   - 全選/全不選反灰
//   - 整體 tab 顯示但唯讀
//   - 項目開關不覆寫子項目勾選狀態（用 mask 模式）
//   - 沒勾任何項目時轉換要提示
//   - 套用並轉換自動儲存
//   - 移除上方重複的儲存設定
//   - 加 askDownloadLocation toggle
// ============================================================

(function () {
  'use strict';

  const { createApp, ref, computed, reactive } = Vue;
  const SP = window.SlotPlanner;

  const ALL_SHEETS    = SP.xlsx.SHEET_ORDER;
  const ALL_COLS      = SP.xlsx.HEADER;
  const LS_FILTER_KEY = 'slotplanner.filterSettings.v1';

  const bus = {
    _lis: {},
    on(ev, cb)         { (this._lis[ev] || (this._lis[ev] = [])).push(cb); return () => this.off(ev, cb); },
    off(ev, cb)        { this._lis[ev] = (this._lis[ev] || []).filter(c => c !== cb); },
    emit(ev, ...args)  { (this._lis[ev] || []).forEach(c => c(...args)); },
  };
  SP.modalBus = bus;

  const modalApp = createApp({
    setup() {
      const visible      = ref(false);
      const isConverting = ref(false);
      const modalSaved   = ref(false);

      const parsedCache = ref(null);
      const colsOn      = reactive({});
      const groupOn     = reactive({});   // groupOn[sh][origName] = bool
      const subOn       = reactive({});   // subOn[sh][origName][ri] = bool
      const askDownloadLocation = ref(false);

      // 排序狀態（只在 session 中保留，換 TXT 重置）
      const groupOrder = reactive({});   // groupOrder[sh] = [smartGroupName, ...]
      const subOrder   = reactive({});   // subOrder[sh][origName] = [ri, ...]

      // 拖曳暫存
      const dragGroupIdx = ref(-1);
      const dragSubIdx   = ref(-1);

      const modalSheet = ref('整體');
      const modalGroup = ref(null);  // 合併後群組名

      // ── 收到 open 事件 ──
      bus.on('open', (payload) => {
        parsedCache.value  = payload.parsedCache;
        isConverting.value = payload.isConverting || false;
        ALL_COLS.forEach(c => { colsOn[c] = payload.colsOn[c] !== false; });
        askDownloadLocation.value = !!payload.askDownloadLocation;

        // 清掉舊狀態
        ALL_SHEETS.forEach(sh => { groupOn[sh] = {}; subOn[sh] = {}; });
        // 套上主 app 傳來的狀態
        ALL_SHEETS.forEach(sh => {
          if (!groupOn[sh]) groupOn[sh] = {};
          if (!subOn[sh])   subOn[sh]   = {};
          Object.assign(groupOn[sh], payload.groupOn[sh] || {});
          Object.keys(payload.subOn[sh] || {}).forEach(gname => {
            if (!subOn[sh][gname]) subOn[sh][gname] = {};
            Object.assign(subOn[sh][gname], payload.subOn[sh][gname] || {});
          });
        });

        // 同步排序狀態（payload 帶來的、否則建初始順序）
        ALL_SHEETS.forEach(sh => {
          if (payload.groupOrder?.[sh]) {
            groupOrder[sh] = [...payload.groupOrder[sh]];
          } else {
            // 初始順序：依照 smartGroups 自然順序
            const rows = parsedCache.value?.sheets[sh] || [];
            groupOrder[sh] = SP.parser.extractSmartGroups(rows).map(g => g.name);
          }
          if (payload.subOrder?.[sh]) {
            subOrder[sh] = { ...payload.subOrder[sh] };
          } else {
            subOrder[sh] = {};
          }
        });

        const avail = modalSheets.value;
        if (!avail.includes(modalSheet.value)) modalSheet.value = avail[0] || '整體';
        modalGroup.value = null;
        visible.value = true;
      });

      bus.on('convertingChange', v => { isConverting.value = v; });

      // ── 有資料的 sheets ──
      const modalSheets = computed(() => {
        if (!parsedCache.value) return [];
        return ALL_SHEETS.filter(sh => (parsedCache.value.sheets[sh] || []).length > 0);
      });

      const isZhengti = computed(() => modalSheet.value === '整體');

      // ── 當前 sheet 的智能群組（含整體唯讀模式，套用排序）──
      const modalGroups = computed(() => {
        if (!parsedCache.value) return [];
        const rows = parsedCache.value.sheets[modalSheet.value] || [];
        if (isZhengti.value) return SP.parser.extractGroups(rows);

        const smart = SP.parser.extractSmartGroups(rows);
        const order = groupOrder[modalSheet.value];
        if (!order || !order.length) return smart;

        // 依 order 排序，order 中沒列到的群組（理論不會發生）放最後
        const map = new Map(smart.map(g => [g.name, g]));
        const ordered = [];
        order.forEach(name => { if (map.has(name)) { ordered.push(map.get(name)); map.delete(name); } });
        // 剩餘的（新出現的群組）追加
        map.forEach(g => ordered.push(g));
        return ordered;
      });

      // ── 當前選取群組的「顯示用」子項目列表（套用排序）──
      // subOrder[sh][smartGroupName] 是 ["origName|origRowIdx", ...] 字串陣列
      const modalSubRows = computed(() => {
        if (!modalGroup.value) return [];
        const g = modalGroups.value.find(x => x.name === modalGroup.value);
        if (!g) return [];

        // 先建出原始 displayRow 陣列（未排序）
        let raw;
        if (g._merged) {
          raw = [];
          const siblings = {};
          g.rows.forEach(r => {
            const key = r._origName;
            if (!siblings[key]) siblings[key] = { name: key, rows: [], suffix: '' };
            if (r._mergeLabel) siblings[key].suffix = r._mergeLabel;
            siblings[key].rows.push(r);
          });
          const sibOrder = [];
          g.rows.forEach(r => { if (!sibOrder.includes(r._origName)) sibOrder.push(r._origName); });
          sibOrder.forEach(name => {
            const s = siblings[name];
            s.rows.forEach((r, idx) => {
              raw.push({
                ...r,
                _displayLabel: (idx === 0) ? s.suffix : (r.interval || ''),
                _origName: name,
                _origRowIdx: idx,
              });
            });
          });
        } else {
          let prevName = null;
          raw = g.rows.map((r, idx) => {
            let label;
            if (r.interval) label = r.interval;
            else if (idx === 0) label = r.name || `第 ${idx + 1} 筆`;
            else if (r.name && r.name === prevName) label = '';
            else label = r.name || `第 ${idx + 1} 筆`;
            prevName = r.name;
            return {
              ...r,
              _displayLabel: label,
              _origName: g.name,
              _origRowIdx: idx,
            };
          });
        }

        // 套用 subOrder（若存在）
        const order = subOrder[modalSheet.value]?.[modalGroup.value];
        if (!order || !order.length) return raw;

        const keyOf = r => `${r._origName}|${r._origRowIdx}`;
        const map = new Map(raw.map(r => [keyOf(r), r]));
        const ordered = [];
        order.forEach(k => { if (map.has(k)) { ordered.push(map.get(k)); map.delete(k); } });
        map.forEach(r => ordered.push(r));
        return ordered;
      });

      function tabGroupCount(sh) {
        if (!parsedCache.value) return '—';
        if (sh === '整體') {
          const rows = parsedCache.value.sheets[sh] || [];
          const cnt = SP.parser.extractGroups(rows).length;
          return cnt > 0 ? cnt : '—';
        }
        const rows = parsedCache.value.sheets[sh] || [];
        const cnt  = SP.parser.extractSmartGroups(rows).length;
        return cnt > 0 ? cnt : '—';
      }

      // ── 已選計數（整體固定全選不計入篩選邏輯）──
      const filterSummary = computed(() => {
        if (!parsedCache.value) return { sel: 0, tot: 0 };
        let sel = 0, tot = 0;
        ALL_SHEETS.forEach(sh => {
          const rows = parsedCache.value.sheets[sh] || [];
          if (sh === '整體') {
            // 整體固定全部輸出
            const cnt = rows.filter(r => r.name && r.name.trim()).length;
            tot += cnt;
            sel += cnt;
            return;
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

      // ── 某智能群組底下所有原始群組名 ──
      function origNamesOf(smartGroup) {
        if (!smartGroup._merged) return [smartGroup.name];
        return smartGroup._siblings || [smartGroup.name];
      }

      // ── 群組勾選狀態 ──
      function isGroupChecked(smartGroup) {
        return origNamesOf(smartGroup).every(n => groupOn[modalSheet.value]?.[n] !== false);
      }

      function toggleGroup(smartGroup, v) {
        ensureSheetState(modalSheet.value);
        origNamesOf(smartGroup).forEach(origName => {
          groupOn[modalSheet.value][origName] = v;
        });
        // 注意：不動 subOn！這就是 mask 模式
      }

      // ── 子項目勾選狀態 ──
      function isSubChecked(displayRow) {
        const origName = displayRow._origName;
        const ri = displayRow._origRowIdx;
        return subOn[modalSheet.value]?.[origName]?.[ri] !== false;
      }

      // 子項目 disabled：當該 sibling 群組整個被關掉時
      function isSubDisabled(displayRow) {
        const origName = displayRow._origName;
        return groupOn[modalSheet.value]?.[origName] === false;
      }

      function toggleSub(displayRow, v) {
        const origName = displayRow._origName;
        const ri = displayRow._origRowIdx;
        ensureSheetState(modalSheet.value);
        if (!subOn[modalSheet.value][origName]) subOn[modalSheet.value][origName] = {};
        subOn[modalSheet.value][origName][ri] = v;
      }

      // ── 全選/全不選反灰判斷 ──
      const allGroupsSelected = computed(() => {
        if (isZhengti.value) return true;
        return modalGroups.value.every(g => isGroupChecked(g));
      });
      const allGroupsDeselected = computed(() => {
        if (isZhengti.value) return false;
        return modalGroups.value.every(g => origNamesOf(g).every(n => groupOn[modalSheet.value]?.[n] === false));
      });

      // 計算當前群組「啟用中」的子項目（用來判斷子項全選/全不選反灰）
      // 同時也用來判斷項目全不選時整組 disabled
      const currentGroupAllDisabled = computed(() => {
        if (!modalGroup.value) return false;
        const g = modalGroups.value.find(x => x.name === modalGroup.value);
        if (!g) return false;
        return origNamesOf(g).every(n => groupOn[modalSheet.value]?.[n] === false);
      });

      const allSubsSelected = computed(() => {
        if (!modalGroup.value) return true;
        if (currentGroupAllDisabled.value) return true; // 整組 disabled 時也算「全選」狀態（按鈕反灰）
        return modalSubRows.value.every(r => isSubChecked(r));
      });
      const allSubsDeselected = computed(() => {
        if (!modalGroup.value) return false;
        if (currentGroupAllDisabled.value) return true;
        return modalSubRows.value.every(r => !isSubChecked(r));
      });

      // ── State 初始化 ──
      function ensureSheetState(sh) {
        if (!groupOn[sh]) groupOn[sh] = {};
        if (!subOn[sh])   subOn[sh]   = {};
        const rows = parsedCache.value?.sheets[sh] || [];
        SP.parser.extractGroups(rows).forEach(g => {
          if (!(g.name in groupOn[sh])) groupOn[sh][g.name] = true;
          if (!subOn[sh][g.name]) subOn[sh][g.name] = {};
          g.rows.forEach((_, ri) => { if (!(ri in subOn[sh][g.name])) subOn[sh][g.name][ri] = true; });
        });
      }

      // ── 全選/全不選操作 ──
      function modalSelectAllGroups(v) {
        if (isZhengti.value) return;
        ensureSheetState(modalSheet.value);
        const rows = parsedCache.value?.sheets[modalSheet.value] || [];
        SP.parser.extractGroups(rows).forEach(g => {
          groupOn[modalSheet.value][g.name] = v;
          // 不動 subOn
        });
      }

      function modalSelectAllSubs(v) {
        if (!modalGroup.value) return;
        if (currentGroupAllDisabled.value) return; // 整組 disabled 不可操作
        const g = modalGroups.value.find(x => x.name === modalGroup.value);
        if (!g) return;
        ensureSheetState(modalSheet.value);
        modalSubRows.value.forEach(dr => {
          // 只動「未被群組 mask 掉」的子項目
          if (groupOn[modalSheet.value]?.[dr._origName] === false) return;
          if (!subOn[modalSheet.value][dr._origName]) subOn[modalSheet.value][dr._origName] = {};
          subOn[modalSheet.value][dr._origName][dr._origRowIdx] = v;
        });
      }

      function modalResetAll() {
        ALL_SHEETS.forEach(sh => {
          if (sh === '整體') return;
          ensureSheetState(sh);
          const rows = parsedCache.value?.sheets[sh] || [];
          SP.parser.extractGroups(rows).forEach(g => {
            groupOn[sh][g.name] = true;
            g.rows.forEach((_, ri) => { subOn[sh][g.name][ri] = true; });
          });
          // 重置排序為原始 smart 順序
          groupOrder[sh] = SP.parser.extractSmartGroups(rows).map(g => g.name);
          subOrder[sh] = {};
        });
      }

      // ════════════════════════════════════════════════════════
      //  拖曳排序
      //  dragXxxOverIdx：當前 hover 的目標 index
      //  dragXxxOverPos：'before' | 'after'（在目標 row 的上方或下方）
      // ════════════════════════════════════════════════════════
      const dragGroupOverIdx = ref(-1);
      const dragGroupOverPos = ref('before');
      const dragSubOverIdx   = ref(-1);
      const dragSubOverPos   = ref('before');

      function rowHoverPos(e, el) {
        // 判斷滑鼠在 row 的上半還是下半
        const rect = el.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        return e.clientY < mid ? 'before' : 'after';
      }

      function onGroupDragStart(idx, e) {
        dragGroupIdx.value = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      }
      function onGroupDragOver(idx, e) {
        if (dragGroupIdx.value < 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragGroupOverIdx.value = idx;
        dragGroupOverPos.value = rowHoverPos(e, e.currentTarget);
      }
      function onGroupDragLeave() {
        // 不立即清除：拖過 row 邊界會 trigger leave 然後 enter 下一個
        // 由 dragend / drop 清除
      }
      function onGroupDrop(targetIdx, e) {
        e.preventDefault();
        const src = dragGroupIdx.value;
        const pos = dragGroupOverPos.value;
        dragGroupIdx.value = -1;
        dragGroupOverIdx.value = -1;
        if (src < 0) return;

        // 計算實際插入位置
        let insertAt = pos === 'before' ? targetIdx : targetIdx + 1;
        // 移除 src 後，target index 可能位移
        if (src < insertAt) insertAt--;
        if (src === insertAt) return;

        const sh = modalSheet.value;
        if (!groupOrder[sh]) groupOrder[sh] = modalGroups.value.map(g => g.name);
        const arr = [...groupOrder[sh]];
        const [moved] = arr.splice(src, 1);
        arr.splice(insertAt, 0, moved);
        groupOrder[sh] = arr;
      }
      function onGroupDragEnd() {
        dragGroupIdx.value = -1;
        dragGroupOverIdx.value = -1;
      }

      function onSubDragStart(idx, e) {
        dragSubIdx.value = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      }
      function onSubDragOver(idx, e) {
        if (dragSubIdx.value < 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragSubOverIdx.value = idx;
        dragSubOverPos.value = rowHoverPos(e, e.currentTarget);
      }
      function onSubDrop(targetIdx, e) {
        e.preventDefault();
        const src = dragSubIdx.value;
        const pos = dragSubOverPos.value;
        dragSubIdx.value = -1;
        dragSubOverIdx.value = -1;
        if (src < 0) return;

        let insertAt = pos === 'before' ? targetIdx : targetIdx + 1;
        if (src < insertAt) insertAt--;
        if (src === insertAt) return;

        const sh = modalSheet.value;
        const gname = modalGroup.value;
        if (!sh || !gname) return;
        if (!subOrder[sh]) subOrder[sh] = {};
        const curKeys = modalSubRows.value.map(r => `${r._origName}|${r._origRowIdx}`);
        let arr = subOrder[sh][gname] ? [...subOrder[sh][gname]] : [...curKeys];
        arr = arr.filter(k => curKeys.includes(k));
        curKeys.forEach(k => { if (!arr.includes(k)) arr.push(k); });
        const [moved] = arr.splice(src, 1);
        arr.splice(insertAt, 0, moved);
        subOrder[sh][gname] = arr;
      }
      function onSubDragEnd() {
        dragSubIdx.value = -1;
        dragSubOverIdx.value = -1;
      }

      // ── 儲存設定 ──
      function pushStateToMain() {
        bus.emit('stateSync', {
          colsOn: { ...colsOn },
          groupOn,
          subOn,
          askDownloadLocation: askDownloadLocation.value,
          groupOrder: JSON.parse(JSON.stringify(groupOrder)),
          subOrder:   JSON.parse(JSON.stringify(subOrder)),
        });
      }

      function modalSave() {
        pushStateToMain();
        try {
          localStorage.setItem(LS_FILTER_KEY, JSON.stringify({
            cols: { ...colsOn },
            askDownloadLocation: askDownloadLocation.value,
          }));
        } catch (e) { /* ignore */ }
        modalSaved.value = true;
        setTimeout(() => { modalSaved.value = false; }, 1800);
      }

      function closeModal() {
        pushStateToMain();
        visible.value = false;
      }

      function modalApplyAndConvert() {
        // 檢查是否完全沒勾任何項目
        const { sel } = filterSummary.value;
        // sel 包含整體（整體固定全勾），所以要扣掉整體
        let nonZhengtiSel = 0;
        ALL_SHEETS.forEach(sh => {
          if (sh === '整體') return;
          const rows = parsedCache.value?.sheets[sh] || [];
          SP.parser.extractGroups(rows).forEach(g => {
            const gOn = groupOn[sh]?.[g.name] !== false;
            g.rows.forEach((_, ri) => {
              if (gOn && subOn[sh]?.[g.name]?.[ri] !== false) nonZhengtiSel++;
            });
          });
        });

        if (nonZhengtiSel === 0) {
          const ok = confirm(
            '目前沒有勾選任何項目，套用後 XLSX 只會輸出「整體」工作表。\n\n確定要繼續嗎？'
          );
          if (!ok) return;
        }

        // 自動儲存
        pushStateToMain();
        try {
          localStorage.setItem(LS_FILTER_KEY, JSON.stringify({
            cols: { ...colsOn },
            askDownloadLocation: askDownloadLocation.value,
          }));
        } catch (e) { /* ignore */ }

        visible.value = false;
        bus.emit('convert');
      }

      function selectModalSheet(sh) { modalSheet.value = sh; modalGroup.value = null; }
      function selectModalGroup(name) { modalGroup.value = name; }

      // ── 鍵盤操作 ──
      // 上下鍵：在當前 focus 區域切換項目
      // 如果有選取群組但沒選到子項目，上下切換群組
      // 如果有選取子項目，上下切換子項目（用 focusedSubIdx 追蹤）
      const focusedSubIdx = ref(-1);  // -1 = 沒選子項目

      // 切換 modalGroup 時重置子項目 focus
      // 用 watch 比較直接
      Vue.watch(modalGroup, () => { focusedSubIdx.value = -1; });
      Vue.watch(modalSheet, () => { focusedSubIdx.value = -1; });

      function handleArrowKey(dir) {
        // dir = -1（上）或 +1（下）
        if (isZhengti.value) return;
        if (!modalGroups.value.length) return;

        // 如果焦點在子項目上，切換子項目
        if (focusedSubIdx.value >= 0 && modalSubRows.value.length) {
          const next = focusedSubIdx.value + dir;
          if (next >= 0 && next < modalSubRows.value.length) {
            focusedSubIdx.value = next;
          }
          return;
        }

        // 否則切換群組
        const groups = modalGroups.value;
        const curIdx = groups.findIndex(g => g.name === modalGroup.value);
        if (curIdx < 0) {
          // 還沒選任何群組 → 從第一個開始
          modalGroup.value = groups[0]?.name || null;
          return;
        }
        const next = curIdx + dir;
        if (next >= 0 && next < groups.length) {
          modalGroup.value = groups[next].name;
        }
      }

      // 切換到子項目焦點（按右鍵或 Tab 進入子項目區）
      function enterSubArea() {
        if (modalGroup.value && modalSubRows.value.length) {
          focusedSubIdx.value = 0;
        }
      }
      function leaveSubArea() {
        focusedSubIdx.value = -1;
      }

      // 空白鍵：切換當前焦點的勾選
      function toggleFocusedCheckbox() {
        if (isZhengti.value) return;
        if (focusedSubIdx.value >= 0) {
          const r = modalSubRows.value[focusedSubIdx.value];
          if (r && !isSubDisabled(r)) {
            toggleSub(r, !isSubChecked(r));
          }
        } else if (modalGroup.value) {
          const g = modalGroups.value.find(x => x.name === modalGroup.value);
          if (g) toggleGroup(g, !isGroupChecked(g));
        }
      }

      window.addEventListener('keydown', e => {
        if (!visible.value) return;
        // 在 input/checkbox 中時不攔截
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.key === 'Escape') { closeModal(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); handleArrowKey(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); handleArrowKey(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); enterSubArea(); }
        else if (e.key === 'ArrowLeft')  { e.preventDefault(); leaveSubArea(); }
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFocusedCheckbox(); }
      });

      return {
        visible, isConverting, modalSaved,
        ALL_COLS, colsOn,
        groupOn, subOn,
        askDownloadLocation,
        modalSheet, modalGroup,
        modalSheets, modalGroups, modalSubRows,
        isZhengti,
        filterSummary,
        allGroupsSelected, allGroupsDeselected,
        allSubsSelected, allSubsDeselected,
        currentGroupAllDisabled,
        tabGroupCount,
        isGroupChecked, toggleGroup,
        isSubChecked, toggleSub, isSubDisabled,
        closeModal, selectModalSheet, selectModalGroup,
        modalSelectAllGroups, modalSelectAllSubs,
        modalResetAll, modalSave, modalApplyAndConvert,
        focusedSubIdx,
        // 拖曳
        dragGroupIdx, dragSubIdx,
        dragGroupOverIdx, dragGroupOverPos,
        dragSubOverIdx, dragSubOverPos,
        onGroupDragStart, onGroupDragOver, onGroupDragLeave, onGroupDrop, onGroupDragEnd,
        onSubDragStart, onSubDragOver, onSubDrop, onSubDragEnd,
      };
    },

    template: `
<div v-if="visible" class="modal-backdrop" @click.self="closeModal">
  <div class="filter-modal">

    <div class="fm-header">
      <div class="fm-header-left">
        <span class="fm-title">篩選輸出內容</span>
        <span class="fm-badge" :class="filterSummary.sel < filterSummary.tot ? 'accent' : ''">
          已選 {{ filterSummary.sel }} / {{ filterSummary.tot }} 項
        </span>
      </div>
      <div class="fm-header-right">
        <button class="fm-btn fm-close" @click="closeModal" title="關閉">✕</button>
      </div>
    </div>

    <div class="fm-cols-strip">
      <span class="fm-cols-label">輸出欄位（全域）</span>
      <label v-for="col in ALL_COLS" :key="col"
             class="col-chip" :class="{off: !colsOn[col]}">
        <input type="checkbox" v-model="colsOn[col]">{{ col }}
      </label>
    </div>

    <div class="fm-tabs">
      <div v-for="sh in modalSheets" :key="sh"
           class="fm-tab" :class="{active: modalSheet === sh}"
           @click="selectModalSheet(sh)">
        {{ sh }}
        <span class="fm-tab-cnt">{{ tabGroupCount(sh) }}</span>
      </div>
    </div>

    <div class="fm-body">

      <template v-if="isZhengti">
        <div class="fm-left fm-left-readonly">
          <div class="fm-pane-header">
            <span class="fm-pane-label">整體項目（唯讀）</span>
          </div>
          <div class="fm-list">
            <div v-for="g in modalGroups" :key="g.name" class="fm-item readonly">
              <span class="fm-readonly-mark">●</span>
              <span class="fm-item-name">{{ g.name || '（無名）' }}</span>
              <span class="fm-item-cnt">{{ g.rows.length }}</span>
            </div>
            <div v-if="!modalGroups.length" class="fm-empty-hint">此分頁無資料</div>
          </div>
        </div>
        <div class="fm-right">
          <div class="fm-zhengti-notice">
            <div class="fm-zhengti-icon">📊</div>
            <div class="fm-zhengti-text">
              <div class="fm-zhengti-title">整體工作表為跨分類彙總</div>
              <div class="fm-zhengti-sub">整體不支援項目篩選，轉換時固定完整輸出。</div>
              <div class="fm-zhengti-sub" style="margin-top:6px;">左側清單顯示供參考。</div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="fm-left">
          <div class="fm-pane-header">
            <span class="fm-pane-label">項目群組</span>
            <div class="fm-pane-acts">
              <button class="fm-txbtn"
                      :disabled="allGroupsSelected"
                      :class="{disabled: allGroupsSelected}"
                      @click="modalSelectAllGroups(true)">全選</button>
              <button class="fm-txbtn"
                      :disabled="allGroupsDeselected"
                      :class="{disabled: allGroupsDeselected}"
                      @click="modalSelectAllGroups(false)">全不選</button>
            </div>
          </div>
          <div class="fm-list">
            <div v-for="(g, gi) in modalGroups" :key="g.name"
                 class="fm-item"
                 :class="{
                   selected: modalGroup === g.name,
                   dragging: dragGroupIdx === gi,
                   'drop-before': dragGroupIdx >= 0 && dragGroupOverIdx === gi && dragGroupOverPos === 'before' && dragGroupIdx !== gi,
                   'drop-after':  dragGroupIdx >= 0 && dragGroupOverIdx === gi && dragGroupOverPos === 'after'  && dragGroupIdx !== gi
                 }"
                 draggable="true"
                 @click="selectModalGroup(g.name)"
                 @dragstart="onGroupDragStart(gi, $event)"
                 @dragover="onGroupDragOver(gi, $event)"
                 @drop="onGroupDrop(gi, $event)"
                 @dragend="onGroupDragEnd">
              <span class="fm-drag-handle" title="拖曳排序">⋮⋮</span>
              <input type="checkbox"
                     :checked="isGroupChecked(g)"
                     @change="e => toggleGroup(g, e.target.checked)">
              <span class="fm-item-name">{{ g.name || '（無名）' }}</span>
              <span class="fm-item-cnt">{{ g._merged ? (g._siblings ? g._siblings.length : g.rows.length) : g.rows.length }}</span>
            </div>
            <div v-if="!modalGroups.length" class="fm-empty-hint">此分頁無資料</div>
          </div>
        </div>

        <div class="fm-right">
          <div class="fm-pane-header">
            <span class="fm-pane-label">
              <template v-if="modalGroup">
                <b>{{ modalGroup }}</b> 的子項目（{{ modalSubRows.length }} 筆）
              </template>
              <template v-else>← 點選左側群組</template>
            </span>
            <div class="fm-pane-acts" v-if="modalGroup">
              <button class="fm-txbtn"
                      :disabled="allSubsSelected || currentGroupAllDisabled"
                      :class="{disabled: allSubsSelected || currentGroupAllDisabled}"
                      @click="modalSelectAllSubs(true)">全選</button>
              <button class="fm-txbtn"
                      :disabled="allSubsDeselected || currentGroupAllDisabled"
                      :class="{disabled: allSubsDeselected || currentGroupAllDisabled}"
                      @click="modalSelectAllSubs(false)">全不選</button>
            </div>
          </div>
          <div class="fm-sub-list">
            <template v-if="modalGroup && modalSubRows.length">
              <div v-for="(r, ri) in modalSubRows" :key="r._origName + '|' + r._origRowIdx">
                <div class="fm-sub-row"
                     :class="{
                       off: !isSubChecked(r),
                       disabled: isSubDisabled(r),
                       'kb-focus': focusedSubIdx === ri,
                       dragging: dragSubIdx === ri,
                       'drop-before': dragSubIdx >= 0 && dragSubOverIdx === ri && dragSubOverPos === 'before' && dragSubIdx !== ri,
                       'drop-after':  dragSubIdx >= 0 && dragSubOverIdx === ri && dragSubOverPos === 'after'  && dragSubIdx !== ri
                     }"
                     draggable="true"
                     @click="focusedSubIdx = ri"
                     @dragstart="onSubDragStart(ri, $event)"
                     @dragover="onSubDragOver(ri, $event)"
                     @drop="onSubDrop(ri, $event)"
                     @dragend="onSubDragEnd">
                  <span class="fm-drag-handle small" title="拖曳排序">⋮⋮</span>
                  <input type="checkbox"
                         :checked="isSubChecked(r)"
                         :disabled="isSubDisabled(r)"
                         @change="e => toggleSub(r, e.target.checked)">
                  <span class="fm-sub-label">{{ r._displayLabel }}</span>
                  <span class="fm-sub-val">{{ r.val }}{{ r.num ? (' = ' + r.num + '/' + r.den) : '' }}</span>
                </div>
                <div v-if="ri < modalSubRows.length - 1" class="fm-sub-divider"></div>
              </div>
            </template>
            <div v-else class="fm-empty-hint" style="padding:32px 16px;">
              {{ modalGroup ? '此群組無子項目' : '← 從左側選擇群組' }}
            </div>
          </div>
        </div>
      </template>

    </div>

    <div class="fm-footer">
      <div class="fm-footer-info">
        <label class="fm-ask-toggle">
          <input type="checkbox" v-model="askDownloadLocation">
          下載時詢問儲存位置
        </label>
      </div>
      <div class="fm-footer-btns">
        <button class="fm-btn" @click="modalResetAll">↺ 重設全選</button>
        <button class="fm-btn" @click="modalSave" :class="{saved: modalSaved}">
          {{ modalSaved ? '✔ 已儲存' : '💾 儲存設定' }}
        </button>
        <button class="fm-btn fm-btn-primary" @click="modalApplyAndConvert"
                :disabled="isConverting">
          {{ isConverting ? '轉換中…' : '套用並轉換' }}
        </button>
      </div>
    </div>

  </div>
</div>
    `,
  });

  console.log('[filter-modal] script loaded');
  const mountPoint = document.getElementById('filter-modal-root');
  if (!mountPoint) {
    console.error('[filter-modal] #filter-modal-root not found!');
    return;
  }
  modalApp.mount('#filter-modal-root');
  console.log('[filter-modal] mounted');
})();
