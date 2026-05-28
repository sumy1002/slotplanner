// ============================================================
//  symbol.js — Symbol 管理頁
//  對應 symbol_manager.py 的 SymbolManagerPage
// ============================================================

(function () {
  'use strict';

  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount } = Vue;
  const SP = window.SlotPlanner;

  const UNDO_LIMIT = 15;

  const SymbolPage = {
    props: {
      registry: { type: Object, required: true },
    },
    emits: ['status'],
    template: `
<div class="sym-page">

  <!-- ============ 左側清單 ============ -->
  <aside class="sym-left">
    <div class="sym-toolbar">
      <button class="btn-pill add" @click="addSymbol" title="新增 symbol">+ 新增</button>
      <button class="btn-pill del" @click="deleteSelected" :disabled="!selectedId" title="刪除選取">✕ 刪除</button>
      <div class="spacer"></div>
      <button class="btn-pill" @click="undo" :disabled="!undoStack.length" title="復原 (Ctrl+Z)">↶</button>
      <button class="btn-pill" @click="redo" :disabled="!redoStack.length" title="重做 (Ctrl+Y)">↷</button>
    </div>

    <div class="sym-list">
      <div v-for="s in symbols" :key="s.id"
           class="sym-item"
           :class="{selected: s.id === selectedId}"
           @click="select(s.id)">
        <div class="sym-swatch" :style="swatchStyle(s.id)">
          {{ initialOf(s) }}
        </div>
        <div class="sym-item-info">
          <div class="sym-item-name">{{ s.name || '(未命名)' }}</div>
          <div class="sym-item-meta">
            <span>#{{ s.number || '-' }}</span>
            <span>權重 {{ s.weight }}</span>
          </div>
        </div>
        <div class="sym-item-pct">{{ pctOf(s) }}%</div>
      </div>
      <div v-if="!symbols.length" style="text-align:center; padding:30px 10px; color:var(--text-light); font-size:12px;">
        （目前沒有 symbol）<br>點擊上方「+ 新增」開始
      </div>
    </div>

    <div class="sym-statusbar">
      <span>{{ symbols.length }} 個 symbol</span>
      <span class="weight-total">總權重 {{ totalWeight }}</span>
    </div>
  </aside>

  <!-- ============ 右側編輯面板 ============ -->
  <div class="sym-right">
    <header class="topbar">
      <div class="title">
        {{ selected ? '編輯：' + (selected.name || ('#' + selected.number) || ('id=' + selected.id)) : '編輯 Symbol' }}
      </div>
      <div class="topbar-actions">
        <button class="btn-pill" @click="exportJson" title="下載目前所有 symbol 為 JSON 設定檔">⇩ 匯出 JSON</button>
        <button class="btn-pill" @click="triggerImport" title="從 JSON 設定檔匯入（會覆寫目前資料）">⇧ 匯入 JSON</button>
        <button class="btn-pill" @click="resetDefaults" title="重設為預設 15 個 symbol">↺ 重設</button>
        <input ref="importInput" type="file" accept=".json,application/json" style="display:none" @change="importJson">
      </div>
    </header>

    <div v-if="!selected" class="sym-empty">
      ← 從左側選擇一個 symbol 來編輯，或點「+ 新增」建立一個
    </div>

    <div v-else class="sym-edit">
      <!-- 顏色 / 編號 / 名稱 -->
      <div class="sym-edit-section">
        <div class="section-title">顏色 / 編號 / 名稱</div>
        <div class="sym-edit-row">
          <div class="sym-swatch-preview" :style="swatchStyle(selected.id)">
            {{ initialOf(selected) }}
          </div>

          <div class="swatch-grid">
            <div v-for="(c, i) in SWATCH_COLORS" :key="i"
                 class="swatch-cell"
                 :class="{selected: isCurrentSwatch(i)}"
                 :style="{background: c[0]}"
                 :title="c[0]"
                 @click="pickSwatch(i)"></div>
          </div>

          <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px;">
            <div>
              <div class="field-label-sm">編號（數字）</div>
              <input class="input input-sm"
                     :class="{err: numErr}"
                     v-model="form.number"
                     @input="onFieldEdit"
                     placeholder="00"
                     inputmode="numeric">
              <div v-if="numErr" class="field-err">編號已重複</div>
            </div>
            <div>
              <div class="field-label-sm">名稱</div>
              <input class="input input-sm"
                     :class="{err: nameErr}"
                     v-model="form.name"
                     @input="onFieldEdit"
                     placeholder="symbol 名稱">
              <div v-if="nameErr" class="field-err">名稱已重複</div>
            </div>
          </div>
        </div>
      </div>
      <div class="sep"></div>

      <!-- 權重 -->
      <div class="sym-edit-section">
        <div class="section-title">權重</div>
        <div class="weight-row">
          <input type="range" class="weight-slider"
                 min="0" max="1000" step="1"
                 v-model.number="form.weight"
                 :style="{'--val': (form.weight / 10) + '%'}"
                 @input="onFieldEdit">
          <div class="weight-val">{{ form.weight }}</div>
        </div>
      </div>
      <div class="sep"></div>

      <!-- 出現輪限制 -->
      <div class="sym-edit-section">
        <div class="section-title">出現輪限制</div>
        <div class="hint">（輪數由盤面設計頁決定，目前為 {{ reelCount }} 輪）</div>
        <div class="reel-limits">
          <label v-for="(b, i) in form.reel_limit" :key="i" class="chk">
            <input type="checkbox" v-model="form.reel_limit[i]" @change="onFieldEdit">
            <span class="box"></span>
            <span>輪 {{ i + 1 }}</span>
          </label>
        </div>
      </div>
      <div class="sep"></div>

      <!-- 出現上限 -->
      <div class="sym-edit-section">
        <div class="section-title">出現上限</div>
        <div style="display:flex; gap:12px; align-items:center; margin-left:4px;">
          <label class="chk">
            <input type="checkbox" v-model="form.use_max" @change="onFieldEdit">
            <span class="box"></span>
            <span>啟用上限</span>
          </label>
          <input class="input input-sm" style="width:64px;"
                 type="number" min="0" max="999"
                 v-model.number="form.max_count"
                 :disabled="!form.use_max"
                 @input="onFieldEdit">
          <span style="font-size:12px; color:var(--text-light);">顆</span>
        </div>
      </div>
      <div class="sep"></div>

      <!-- ═══════ 進階屬性(A.xlsx 03_Symbols 用)═══════ -->
      <div class="sym-edit-section sym-advanced">
        <div class="section-title">
          進階屬性
          <span class="section-subtitle">(對應 A.xlsx 03_Symbols 欄位)</span>
        </div>

        <!-- Symbol_ID & Type -->
        <div class="sym-adv-row">
          <div class="sym-adv-field">
            <div class="field-label-sm">
              Symbol_ID
              <span class="field-label-hint">A.xlsx 用的代碼,留空則用名稱</span>
            </div>
            <input class="input input-sm cfg-mono"
                   v-model="form.symbol_id"
                   @input="onFieldEdit"
                   placeholder="WILD / H1 / L2 ...">
          </div>
          <div class="sym-adv-field">
            <div class="field-label-sm">Type</div>
            <div class="sym-type-chips">
              <button v-for="t in SYMBOL_TYPES" :key="t"
                      class="sym-type-chip"
                      :class="{ active: form.type === t }"
                      @click="form.type = t; onFieldEdit()">{{ t }}</button>
            </div>
          </div>
        </div>

        <!-- Pay Table -->
        <div class="sym-pay-section">
          <div class="field-label-sm">
            賠付表 Pay Table
            <span class="field-label-hint">當 N 個此符號出現在中獎線上的賠付倍數</span>
          </div>
          <div class="sym-pay-grid">
            <div class="sym-pay-cell">
              <label class="sym-pay-label">3×</label>
              <input class="input input-sm cfg-mono sym-pay-input" type="number" step="any" min="0"
                     v-model.number="form.pay_3x"
                     @input="onFieldEdit">
            </div>
            <div class="sym-pay-cell">
              <label class="sym-pay-label">4×</label>
              <input class="input input-sm cfg-mono sym-pay-input" type="number" step="any" min="0"
                     v-model.number="form.pay_4x"
                     @input="onFieldEdit">
            </div>
            <div class="sym-pay-cell">
              <label class="sym-pay-label">5×</label>
              <input class="input input-sm cfg-mono sym-pay-input" type="number" step="any" min="0"
                     v-model.number="form.pay_5x"
                     @input="onFieldEdit">
            </div>
            <div class="sym-pay-cell">
              <label class="sym-pay-label">6×</label>
              <input class="input input-sm cfg-mono sym-pay-input" type="number" step="any" min="0"
                     v-model.number="form.pay_6x"
                     @input="onFieldEdit">
            </div>
          </div>
        </div>

        <!-- Mega 尺寸 & 旗標 -->
        <div class="sym-adv-row">
          <div class="sym-adv-field sym-mega-field">
            <div class="field-label-sm">
              Mega 尺寸
              <span class="field-label-hint">寬 × 高(覆蓋幾個 Reel / 幾列)</span>
            </div>
            <div class="sym-mega-row">
              <input class="input input-sm cfg-mono sym-mega-input" type="number" min="1" max="10"
                     v-model.number="form.mega_w"
                     @input="onFieldEdit">
              <span class="sym-mega-sep">×</span>
              <input class="input input-sm cfg-mono sym-mega-input" type="number" min="1" max="10"
                     v-model.number="form.mega_h"
                     @input="onFieldEdit">
            </div>
            <!-- ── Mega 視覺預覽小盤面 ── -->
            <div class="sym-mega-preview">
              <svg :viewBox="megaPreview.viewBox" class="sym-mega-svg"
                   :style="{ width: megaPreview.svgWidth + 'px', height: megaPreview.svgHeight + 'px' }"
                   xmlns="http://www.w3.org/2000/svg">
                <!-- 底層空盤面格子 -->
                <g>
                  <rect v-for="cell in megaPreview.cells" :key="cell.k"
                        :x="cell.x" :y="cell.y"
                        :width="megaPreview.cellSize - 1.5"
                        :height="megaPreview.cellSize - 1.5"
                        class="sym-mega-cell-bg"
                        :class="{ 'sym-mega-cell-on': cell.on, 'sym-mega-cell-clip': cell.clip }" />
                </g>
                <!-- Mega 區塊外框(只有當 mega 大於 1x1 時顯示)-->
                <rect v-if="megaPreview.megaRect"
                      :x="megaPreview.megaRect.x" :y="megaPreview.megaRect.y"
                      :width="megaPreview.megaRect.w" :height="megaPreview.megaRect.h"
                      class="sym-mega-outline" />
                <!-- Reel 編號 -->
                <text v-for="i in megaPreview.dispCols" :key="'R'+i"
                      :x="megaPreview.colLabelX(i)" :y="megaPreview.colLabelY"
                      class="sym-mega-axis">R{{ i }}</text>
              </svg>
              <div class="sym-mega-preview-info">
                <span class="sym-mega-preview-num">{{ form.mega_w * form.mega_h }}</span> 格
                <span v-if="megaPreview.clipped" class="sym-mega-preview-warn"
                      :title="'此符號 (' + form.mega_w + '×' + form.mega_h + ') 超出盤面範圍 (' + megaPreview.reelCols + '×' + megaPreview.maxRows + '),會被截斷'">
                  ⚠ 超出盤面
                </span>
              </div>
            </div>
          </div>

          <div class="sym-adv-field sym-flags-field">
            <div class="field-label-sm">旗標</div>
            <div class="sym-flags-row">
              <label class="chk sym-flag-chk">
                <input type="checkbox" v-model="form.is_wild" @change="onFieldEdit">
                <span class="box"></span>
                <span>Is Wild</span>
              </label>
              <label class="chk sym-flag-chk">
                <input type="checkbox" v-model="form.is_scatter" @change="onFieldEdit">
                <span class="box"></span>
                <span>Is Scatter</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
    `,

    setup(props, { emit }) {
      const SWATCH_COLORS = SP.SWATCH_COLORS;
      const registry = props.registry;

      // ── 工作區（registry 的鏡像，編輯時直接動這個） ──
      const symbols = ref([]);
      const swatchMap = ref({});
      const reelCount = ref(5);
      const selectedId = ref(null);

      // ── 編輯表單 ──
      const form = reactive({
        number: '',
        name: '',
        weight: 100,
        use_max: false,
        max_count: 0,
        reel_limit: [],
        // ── A.xlsx 03_Symbols 擴充欄位 ──
        symbol_id: '',
        type: 'HIGH',
        pay_3x: 0,
        pay_4x: 0,
        pay_5x: 0,
        pay_6x: 0,
        mega_w: 1,
        mega_h: 1,
        is_wild: false,
        is_scatter: false,
      });

      // Symbol Type 下拉選項
      const SYMBOL_TYPES = ['HIGH', 'LOW', 'WILD', 'SCATTER', 'BONUS', 'SPECIAL'];

      // ── Undo/Redo（本頁獨立堆疊） ──
      const undoStack = ref([]);
      const redoStack = ref([]);

      // ── 檔案 input ref ──
      const importInput = ref(null);

      // ── 防止 commit 觸發 syncFromRegistry 自循環 ──
      let _committing = false;

      // ════════════════════════════════════════════════════════
      //  與 registry 同步
      // ════════════════════════════════════════════════════════
      function syncFromRegistry() {
        if (_committing) return;
        symbols.value = registry.symbols();
        swatchMap.value = registry.swatchMap();
        reelCount.value = registry.reelCount();
        if (selectedId.value) {
          const sel = symbols.value.find(s => s.id === selectedId.value);
          if (!sel) {
            selectedId.value = null;
          } else {
            loadForm(sel);
          }
        }
      }

      function commit() {
        _committing = true;
        try {
          registry.applyAll(symbols.value, swatchMap.value);
        } finally {
          _committing = false;
        }
      }

      // ════════════════════════════════════════════════════════
      //  表單 ↔ 工作區
      // ════════════════════════════════════════════════════════
      function loadForm(s) {
        form.number = s.number;
        form.name = s.name;
        form.weight = s.weight;
        form.use_max = s.use_max;
        form.max_count = s.max_count;
        form.reel_limit = [...s.reel_limit];
        // 擴充欄位(向下相容:舊資料缺欄位給預設)
        form.symbol_id  = s.symbol_id  != null ? s.symbol_id  : '';
        form.type       = s.type       || 'HIGH';
        form.pay_3x     = s.pay_3x     != null ? s.pay_3x     : 0;
        form.pay_4x     = s.pay_4x     != null ? s.pay_4x     : 0;
        form.pay_5x     = s.pay_5x     != null ? s.pay_5x     : 0;
        form.pay_6x     = s.pay_6x     != null ? s.pay_6x     : 0;
        form.mega_w     = s.mega_w     != null ? s.mega_w     : 1;
        form.mega_h     = s.mega_h     != null ? s.mega_h     : 1;
        form.is_wild    = !!s.is_wild;
        form.is_scatter = !!s.is_scatter;
      }

      const selected = computed(() => {
        if (selectedId.value === null) return null;
        return symbols.value.find(s => s.id === selectedId.value) || null;
      });

      // ── 即時驗證（重複） ──
      const numErr = computed(() => {
        if (!form.number || !form.number.toString().trim()) return false;
        const t = form.number.toString().trim();
        return symbols.value.some(s => s.id !== selectedId.value && s.number === t);
      });
      const nameErr = computed(() => {
        if (!form.name || !form.name.trim()) return false;
        const t = form.name.trim();
        return symbols.value.some(s => s.id !== selectedId.value && s.name === t);
      });

      // ── 寫表單回工作區 ──
      function writeForm() {
        if (selectedId.value === null) return;
        const idx = symbols.value.findIndex(s => s.id === selectedId.value);
        if (idx === -1) return;
        // 重複 → 不寫（UI 已顯示紅框）
        if (numErr.value || nameErr.value) return;

        const cur = symbols.value[idx];
        const updated = {
          ...cur,
          number: form.number.toString().trim(),
          name: form.name.toString().trim(),
          weight: Number(form.weight) || 0,
          use_max: !!form.use_max,
          max_count: form.use_max ? Math.max(1, Number(form.max_count) || 1) : Number(form.max_count) || 0,
          reel_limit: [...form.reel_limit],
          // 擴充欄位
          symbol_id: form.symbol_id.toString().trim(),
          type: form.type || 'HIGH',
          pay_3x: Number(form.pay_3x) || 0,
          pay_4x: Number(form.pay_4x) || 0,
          pay_5x: Number(form.pay_5x) || 0,
          pay_6x: Number(form.pay_6x) || 0,
          mega_w: Math.max(1, Number(form.mega_w) || 1),
          mega_h: Math.max(1, Number(form.mega_h) || 1),
          is_wild: !!form.is_wild,
          is_scatter: !!form.is_scatter,
        };
        // 替換陣列元素（用 splice 確保 Vue 偵測）
        symbols.value.splice(idx, 1, updated);
        commit();
      }

      // ── 防抖動：拖滑桿快速移動時不要每次都 commit ──
      let writeTimer = null;
      function onFieldEdit() {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(writeForm, 150);
      }

      // ════════════════════════════════════════════════════════
      //  選取 / 新增 / 刪除
      // ════════════════════════════════════════════════════════
      function select(sid) {
        // 切換前先把當前的寫回
        if (selectedId.value !== sid) {
          if (writeTimer) clearTimeout(writeTimer);
          writeForm();
          selectedId.value = sid;
          const s = symbols.value.find(x => x.id === sid);
          if (s) loadForm(s);
        }
      }

      function addSymbol() {
        pushUndo();
        // 先寫回當前編輯
        if (writeTimer) clearTimeout(writeTimer);
        writeForm();

        const existing = new Set(symbols.value.map(s => s.number).filter(Boolean));
        let n = symbols.value.length;
        while (existing.has(String(n))) n++;
        const newS = SP.createSymbol('', String(n), 100, reelCount.value);
        symbols.value.push(newS);
        const idx = symbols.value.length - 1;
        swatchMap.value[newS.id] = [...SWATCH_COLORS[idx % SWATCH_COLORS.length]];
        commit();
        select(newS.id);
        emitStatus('ok', `已新增 symbol（編號 #${newS.number}）`);
      }

      function deleteSelected() {
        if (selectedId.value === null) return;
        const s = selected.value;
        if (!s) return;
        const name = s.name || (s.number ? `#${s.number}` : `id=${s.id}`);
        if (!confirm(
          `確定要刪除「${name}」嗎？\n\n` +
          `套用後，盤面中所有填入此 symbol 的格子將清空。\n` +
          `此操作可透過「復原」取回。`
        )) return;

        pushUndo();
        const idx = symbols.value.findIndex(x => x.id === selectedId.value);
        if (idx === -1) return;
        symbols.value.splice(idx, 1);
        delete swatchMap.value[selectedId.value];

        // 選下一個
        if (symbols.value.length) {
          const nidx = Math.min(idx, symbols.value.length - 1);
          selectedId.value = symbols.value[nidx].id;
          loadForm(symbols.value[nidx]);
        } else {
          selectedId.value = null;
        }
        commit();
        emitStatus('ok', `已刪除「${name}」`);
      }

      // ════════════════════════════════════════════════════════
      //  Swatch 選色
      // ════════════════════════════════════════════════════════
      function pickSwatch(i) {
        if (selectedId.value === null) return;
        pushUndo();
        swatchMap.value[selectedId.value] = [...SWATCH_COLORS[i]];
        // 觸發 reactive 更新
        swatchMap.value = { ...swatchMap.value };
        commit();
      }

      function isCurrentSwatch(i) {
        if (selectedId.value === null) return false;
        const cur = swatchMap.value[selectedId.value];
        return cur && cur[0] === SWATCH_COLORS[i][0];
      }

      function swatchStyle(sid) {
        const sw = swatchMap.value[sid] || ['#EDD9C0', '#7a5a3a'];
        return { background: sw[0], color: sw[1] };
      }

      function initialOf(s) {
        if (!s) return '?';
        if (s.name) return s.name.slice(0, 2);
        if (s.number !== '' && s.number != null) return s.number;
        return '?';
      }

      const totalWeight = computed(() =>
        symbols.value.reduce((a, s) => a + (Number(s.weight) || 0), 0)
      );

      function pctOf(s) {
        const tw = totalWeight.value;
        if (!tw) return '0.0';
        return ((s.weight / tw) * 100).toFixed(1);
      }

      // ════════════════════════════════════════════════════════
      //  Mega 尺寸視覺預覽(任務 1)
      //   讀 LS 取得當前 02_Layout 的 reel 數與 max_rows,畫小盤面
      //   高亮 mega_w × mega_h 區域(從左上角 R1 開始放)
      // ════════════════════════════════════════════════════════
      const megaPreview = computed(() => {
        // 嘗試從 LS 讀 02_Layout
        let layoutRows = [];
        try {
          const raw = localStorage.getItem('slotplanner.aconfig.layout.v1');
          if (raw) layoutRows = JSON.parse(raw) || [];
        } catch (e) {}

        // 退路:沒有設定就用 5×3 預設盤
        let reelCols, maxRows;
        if (layoutRows.length > 0) {
          reelCols = layoutRows.length;
          maxRows = Math.max(...layoutRows.map(r => Number(r.max_rows) || 3), 3);
        } else {
          reelCols = reelCount.value || 5;
          maxRows = 3;
        }

        // 限制盤面顯示尺寸(最大 8x8,超出就視為截斷顯示)
        const dispCols = Math.min(reelCols, 8);
        const dispRows = Math.min(maxRows, 8);

        // 動態計算 cell size:盤面寬最多 160px
        const maxBoardW = 160;
        const cellSize = Math.floor(Math.min(maxBoardW / dispCols, 28));
        const padding = 4;
        const labelH = 12;

        const svgW = dispCols * cellSize + padding * 2;
        const svgH = dispRows * cellSize + padding * 2 + labelH;

        const mw = Math.max(1, Number(form.mega_w) || 1);
        const mh = Math.max(1, Number(form.mega_h) || 1);
        const clipped = (mw > reelCols) || (mh > maxRows);

        const cells = [];
        for (let r = 0; r < dispRows; r++) {
          for (let c = 0; c < dispCols; c++) {
            const inMega = (c < mw && r < mh);
            // 標記「超出可見盤但屬於 mega」的格子(只在 mega 比顯示盤大時觸發)
            const isClipMarker = inMega && (c >= dispCols || r >= dispRows);
            cells.push({
              k: `${r}-${c}`,
              x: padding + c * cellSize,
              y: padding + r * cellSize,
              on: inMega,
              clip: false,
            });
          }
        }

        // 計算 mega 外框(只當 >1x1 才顯示)
        let megaRect = null;
        if (mw > 1 || mh > 1) {
          const visW = Math.min(mw, dispCols);
          const visH = Math.min(mh, dispRows);
          megaRect = {
            x: padding,
            y: padding,
            w: visW * cellSize - 1.5,
            h: visH * cellSize - 1.5,
          };
        }

        const colLabelY = padding + dispRows * cellSize + labelH - 2;
        const colLabelX = (i) => padding + (i - 1) * cellSize + cellSize / 2;

        return {
          viewBox: `0 0 ${svgW} ${svgH}`,
          svgWidth: svgW,
          svgHeight: svgH,
          cellSize,
          cells,
          megaRect,
          reelCols,
          maxRows,
          dispCols,
          dispRows,
          clipped,
          colLabelY,
          colLabelX,
        };
      });

      // ════════════════════════════════════════════════════════
      //  Undo / Redo
      // ════════════════════════════════════════════════════════
      function pushUndo() {
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        undoStack.value.push(SP.makeSnapshot(symbols.value, swatchMap.value));
        if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift();
        redoStack.value = [];
      }

      function undo() {
        if (!undoStack.value.length) return;
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        // 推當前到 redo
        redoStack.value.push(SP.makeSnapshot(symbols.value, swatchMap.value));
        const snap = undoStack.value.pop();
        symbols.value = snap.symbols.map(SP.cloneSymbol);
        swatchMap.value = { ...snap.swatchMap };
        // 還原選取
        if (selectedId.value && !symbols.value.find(s => s.id === selectedId.value)) {
          selectedId.value = symbols.value[0]?.id ?? null;
        }
        if (selectedId.value) {
          const s = symbols.value.find(x => x.id === selectedId.value);
          if (s) loadForm(s);
        }
        commit();
        emitStatus('wait', '已復原');
      }

      function redo() {
        if (!redoStack.value.length) return;
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        undoStack.value.push(SP.makeSnapshot(symbols.value, swatchMap.value));
        const snap = redoStack.value.pop();
        symbols.value = snap.symbols.map(SP.cloneSymbol);
        swatchMap.value = { ...snap.swatchMap };
        if (selectedId.value && !symbols.value.find(s => s.id === selectedId.value)) {
          selectedId.value = symbols.value[0]?.id ?? null;
        }
        if (selectedId.value) {
          const s = symbols.value.find(x => x.id === selectedId.value);
          if (s) loadForm(s);
        }
        commit();
        emitStatus('wait', '已重做');
      }

      // ════════════════════════════════════════════════════════
      //  JSON 匯入匯出 / 重設
      // ════════════════════════════════════════════════════════
      function exportJson() {
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        const data = registry.toJSON();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `slotplanner-symbols-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        emitStatus('ok', `已匯出 ${data.symbols.length} 個 symbol 為 JSON`);
      }

      function triggerImport() { importInput.value?.click(); }

      async function importJson(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data || !Array.isArray(data.symbols)) {
            alert('檔案格式錯誤：缺少 symbols 陣列');
            return;
          }
          if (!confirm(
            `即將匯入 ${data.symbols.length} 個 symbol，當前 ${symbols.value.length} 個 symbol 將被覆寫。\n\n確定要繼續嗎？`
          )) return;

          pushUndo();
          registry.fromJSON(data);
          // syncFromRegistry 會由 emit('changed') 觸發
          emitStatus('ok', `已匯入 ${data.symbols.length} 個 symbol`);
        } catch (err) {
          alert(`匯入失敗：${err.message}`);
          emitStatus('err', `匯入失敗：${err.message}`);
        } finally {
          e.target.value = '';
        }
      }

      function resetDefaults() {
        if (!confirm(
          '確定要重設為預設 15 個 symbol 嗎？\n\n' +
          '目前所有 symbol（含名稱、權重、顏色等）將被覆寫，' +
          '此操作可透過「復原」取回。'
        )) return;
        pushUndo();
        registry.initDefaults(reelCount.value);
        commit();
        emitStatus('ok', '已重設為預設 symbol');
      }

      // ════════════════════════════════════════════════════════
      //  狀態列訊息
      // ════════════════════════════════════════════════════════
      function emitStatus(type, msg) {
        emit('status', { type, msg });
      }

      // ════════════════════════════════════════════════════════
      //  鍵盤快捷鍵
      // ════════════════════════════════════════════════════════
      function onKeyDown(e) {
        // 在 input/textarea 中時不攔截（除非是 Ctrl+Z/Y）
        const inField = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'z' || e.key === 'Z') {
            if (e.shiftKey) { e.preventDefault(); redo(); }
            else { e.preventDefault(); undo(); }
          } else if (e.key === 'y' || e.key === 'Y') {
            e.preventDefault(); redo();
          }
        } else if (!inField) {
          if (e.key === 'Delete' && selectedId.value !== null) {
            e.preventDefault(); deleteSelected();
          }
        }
      }

      // ════════════════════════════════════════════════════════
      //  生命週期
      // ════════════════════════════════════════════════════════
      let unsubChanged = null;
      onMounted(() => {
        unsubChanged = registry.on('changed', syncFromRegistry);
        syncFromRegistry();
        // 自動選第一個 symbol
        if (symbols.value.length && selectedId.value === null) {
          select(symbols.value[0].id);
        }
        document.addEventListener('keydown', onKeyDown);
        emitStatus('wait', `共 ${symbols.value.length} 個 symbol，總權重 ${totalWeight.value}`);
      });

      onBeforeUnmount(() => {
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        if (unsubChanged) unsubChanged();
        document.removeEventListener('keydown', onKeyDown);
      });

      return {
        SWATCH_COLORS,
        SYMBOL_TYPES,
        symbols, swatchMap, reelCount,
        selectedId, selected, form,
        numErr, nameErr,
        undoStack, redoStack,
        totalWeight,
        importInput,
        megaPreview,
        select, addSymbol, deleteSelected,
        undo, redo,
        pickSwatch, isCurrentSwatch, swatchStyle,
        initialOf, pctOf,
        onFieldEdit,
        exportJson, triggerImport, importJson,
        resetDefaults,
      };
    },
  };

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.SymbolPage = SymbolPage;
})();
