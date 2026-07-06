// ============================================================
//  bcompare.js — A/B 結果比較(v4.9-b)
//
//  背景:模擬引擎(SimPage / Pyodide)已自網頁端移除,模擬改由外部
//  程式執行。本工具接手「比較前後調整數據」的需求:
//    上傳兩份外部模擬器產出的 B_結果_*.xlsx(格式對齊
//    py/iolayer/b_writer.py),解析後並排比較核心指標 / 模式 RTP /
//    符號頻率,標出差異(Δ = B − A)。
//
//  掛載點:
//    SP.BCompare      — 純解析層(parseBFile)
//    SP.BComparePage  — Vue component(app.js 註冊為 <b-compare-page>)
//
//  解析契約(b_writer.py):
//    01_Summary        A 欄=標籤 B 欄=值;「───」開頭為分區標題列
//    02_RTP_By_Mode    [模式,局數,佔比%,總賠付,RTP%,死局數,死局率%]
//    03_Combo_Analysis [連爆次數,局數,佔比%,累計佔比%,備註] + 中位數連爆列
//    04_Symbol_Freq    [Symbol_ID,Display_Name,Type,出現次數,出現佔比%,
//                       總賠付,RTP 貢獻%,賠付占比%,每次出現平均賠付]
//
//  依賴:window.ExcelJS(CDN,app.html 已載)、html2canvas(截圖,可選)
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;

  // ──────────────────────────────────────────────────────────
  //  解析層
  // ──────────────────────────────────────────────────────────

  // ExcelJS cell → 純文字(rich text / 公式結果容錯)
  function _cellStr(cell) {
    if (!cell) return '';
    let v = cell.value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) v = v.richText.map(t => t.text).join('');
      else if (v.result != null) v = v.result;
      else if (v.text != null) v = v.text;
    }
    return String(v).trim();
  }
  // ExcelJS cell → 數字(可能是數字 cell 或字串)
  function _cellNum(cell) {
    if (!cell) return null;
    const v = cell.value;
    if (typeof v === 'number') return v;
    return _num(_cellStr(cell));
  }
  // 字串 → 數字:吃 "1,234,567"、"94.1234%"、"123  (4.56%)" 取前段
  function _num(s) {
    if (s == null || s === '') return null;
    const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // "123  (4.56%)" → 括號內百分比
  function _pctInParens(s) {
    const m = String(s).match(/\(\s*(-?\d+(\.\d+)?)\s*%\s*\)/);
    return m ? parseFloat(m[1]) : null;
  }

  async function parseBFile(file) {
    if (typeof window.ExcelJS === 'undefined') {
      throw new Error('ExcelJS 未載入(CDN 可能被擋),無法解析 xlsx');
    }
    const buf = await file.arrayBuffer();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const out = {
      fileName: file.name,
      summary: {},        // { label: { raw, num } }
      summaryOrder: [],   // 保留 01_Summary 原順序
      bigWins: [],        // [{ label, raw, count, pct }]
      modes: [],          // [{ mode, spins, sharePct, payout, rtpPct, dead, deadPct }]
      symbols: [],        // [{ sid, name, type, count, pct, payout, rtpPct }]
      medianCombo: null,
    };

    // ── 01_Summary ──
    const ws1 = wb.getWorksheet('01_Summary');
    if (!ws1) {
      throw new Error(`「${file.name}」找不到 01_Summary 分頁 — 這不是 SlotPlanner 的 B 結果檔?`);
    }
    ws1.eachRow((row, rn) => {
      if (rn === 1) return;  // 大標題列
      const label = _cellStr(row.getCell(1));
      const val   = _cellStr(row.getCell(2));
      if (!label || label.indexOf('───') === 0 || label.indexOf('─') === 0) return;
      if (val === '') return;
      if (label.indexOf('大獎 ') === 0) {
        out.bigWins.push({
          label: label.slice('大獎 '.length),
          raw: val, count: _num(val), pct: _pctInParens(val),
        });
      }
      if (!(label in out.summary)) out.summaryOrder.push(label);
      out.summary[label] = { raw: val, num: _num(val) };
    });

    // ── 02_RTP_By_Mode ──
    const ws2 = wb.getWorksheet('02_RTP_By_Mode');
    if (ws2) ws2.eachRow((row, rn) => {
      if (rn === 1) return;
      const mode = _cellStr(row.getCell(1));
      if (!mode) return;
      out.modes.push({
        mode,
        spins:    _cellNum(row.getCell(2)),
        sharePct: _cellNum(row.getCell(3)),
        payout:   _cellNum(row.getCell(4)),
        rtpPct:   _cellNum(row.getCell(5)),
        dead:     _cellNum(row.getCell(6)),
        deadPct:  _cellNum(row.getCell(7)),
      });
    });

    // ── 03_Combo_Analysis:只取中位數連爆 ──
    const ws3 = wb.getWorksheet('03_Combo_Analysis');
    if (ws3) ws3.eachRow((row) => {
      if (_cellStr(row.getCell(1)) === '中位數連爆') {
        out.medianCombo = _cellNum(row.getCell(2));
      }
    });

    // ── 04_Symbol_Freq ──
    const ws4 = wb.getWorksheet('04_Symbol_Freq');
    if (ws4) ws4.eachRow((row, rn) => {
      if (rn === 1) return;
      const sid = _cellStr(row.getCell(1));
      if (!sid) return;
      out.symbols.push({
        sid,
        name:   _cellStr(row.getCell(2)),
        type:   _cellStr(row.getCell(3)),
        count:  _cellNum(row.getCell(4)),
        pct:    _cellNum(row.getCell(5)),
        payout: _cellNum(row.getCell(6)),
        rtpPct: _cellNum(row.getCell(7)),
      });
    });

    return out;
  }

  SP.BCompare = { parseBFile };

  // ──────────────────────────────────────────────────────────
  //  核心指標定義(從 01_Summary 標籤萃取;順序即顯示順序)
  //  unit:顯示用;digits:小數位
  // ──────────────────────────────────────────────────────────
  const CORE_METRICS = [
    { label: '理論 RTP',           unit: '%', digits: 4, hot: true },
    { label: '死局率',             unit: '%', digits: 4, hot: true },
    { label: '中位數單局賠付',     unit: '',  digits: 6 },
    { label: 'P95 單局賠付',       unit: '',  digits: 4 },
    { label: 'P99 單局賠付',       unit: '',  digits: 4 },
    { label: '模擬總局數',         unit: '',  digits: 0 },
    { label: '有效局數',           unit: '',  digits: 0 },
    { label: 'HARD 棄牌（風控）',  unit: '',  digits: 0 },
    { label: 'SOFT 棄牌（體感）',  unit: '',  digits: 0 },
    { label: '最長連續死局',       unit: '',  digits: 0 },
  ];

  function _fmt(n, digits) {
    if (n == null || Number.isNaN(n)) return '—';
    if (digits === 0) return Math.round(n).toLocaleString('en-US');
    let s = n.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function _fmtDelta(n, digits) {
    if (n == null || Number.isNaN(n)) return '—';
    const s = _fmt(Math.abs(n), digits);
    if (Math.abs(n) < Math.pow(10, -(digits || 0)) / 2) return '＝';
    return (n > 0 ? '+' : '−') + s;
  }

  // ──────────────────────────────────────────────────────────
  //  Vue component
  // ──────────────────────────────────────────────────────────
  const TEMPLATE = `
<div class="bcmp">

  <!-- 說明列 -->
  <div class="bcmp-intro">
    <span class="bcmp-intro-icon">📊</span>
    <span>上傳兩份<strong>外部模擬器</strong>產出的 B 結果檔(B_結果_*.xlsx),
    並排比較調整前(A)與調整後(B)的核心數據。Δ = B − A。</span>
  </div>

  <!-- UI 批 E-4:比較導引晶片(兩份就緒後比較即時渲染,ok 為純徽章)-->
  <div class="bcmp-guide-row">
    <button v-if="!resA || !resB" class="cfg-guide-chip"
            :class="(!resA && !resB) ? 'is-start' : 'is-warn'"
            @click="pickFile(!resA ? 'A' : 'B')">
      {{ (!resA && !resB) ? '1. 上傳 A 檔(調整前基準)' : (!resA ? '⚠ 還差 A 檔(調整前)' : '⚠ 還差 B 檔(調整後)') }}
    </button>
    <span v-else class="cfg-guide-chip is-ok no-action">✨ A / B 就緒,差異如下</span>
  </div>

  <!-- 兩個上傳槽 -->
  <div class="bcmp-slots">
    <div class="bcmp-slot bcmp-slot-a"
         :class="{ loaded: !!resA, loading: loadingA }"
         @click="pickFile('A')">
      <div class="bcmp-slot-tag">A · 調整前</div>
      <div class="bcmp-slot-body">
        <template v-if="loadingA">⏳ 解析中…</template>
        <template v-else-if="resA">
          <div class="bcmp-slot-file">🗂 {{ resA.fileName }}</div>
          <div class="bcmp-slot-meta">RTP {{ fmtCell(resA, '理論 RTP', 4) }}% ·
            {{ fmtCell(resA, '有效局數', 0) }} 局</div>
        </template>
        <template v-else>
          <div class="bcmp-slot-empty">點擊選擇 B 結果檔</div>
        </template>
      </div>
    </div>

    <button class="bcmp-swap" :disabled="!resA && !resB"
            @click="swapAB" title="交換 A / B">⇄</button>

    <div class="bcmp-slot bcmp-slot-b"
         :class="{ loaded: !!resB, loading: loadingB }"
         @click="pickFile('B')">
      <div class="bcmp-slot-tag">B · 調整後</div>
      <div class="bcmp-slot-body">
        <template v-if="loadingB">⏳ 解析中…</template>
        <template v-else-if="resB">
          <div class="bcmp-slot-file">🗂 {{ resB.fileName }}</div>
          <div class="bcmp-slot-meta">RTP {{ fmtCell(resB, '理論 RTP', 4) }}% ·
            {{ fmtCell(resB, '有效局數', 0) }} 局</div>
        </template>
        <template v-else>
          <div class="bcmp-slot-empty">點擊選擇 B 結果檔</div>
        </template>
      </div>
    </div>
  </div>
  <input ref="fileInputRef" type="file" accept=".xlsx" style="display:none" @change="onPicked">

  <!-- 錯誤 -->
  <div v-if="errorMsg" class="bcmp-error">⚠ {{ errorMsg }}</div>

  <!-- 比較結果 -->
  <div v-if="resA && resB" class="bcmp-results" ref="resultsRef">

    <!-- 工具列 -->
    <div class="bcmp-toolbar">
      <div class="bcmp-pair">
        <span class="bcmp-pair-a">A:{{ resA.fileName }}</span>
        <span class="bcmp-pair-vs">vs</span>
        <span class="bcmp-pair-b">B:{{ resB.fileName }}</span>
      </div>
      <button class="bcmp-shot-btn" @click="screenshot" :disabled="shotBusy">
        {{ shotBusy ? '⏳ 產生中…' : '📸 匯出截圖' }}
      </button>
    </div>

    <!-- 核心指標 -->
    <div class="bcmp-card">
      <div class="bcmp-card-title">核心指標</div>
      <table class="bcmp-table">
        <thead><tr>
          <th class="bcmp-th-label">指標</th>
          <th class="bcmp-th-a">A</th><th class="bcmp-th-b">B</th>
          <th class="bcmp-th-d">Δ (B−A)</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in coreRows" :key="r.label"
              :class="{ 'bcmp-row-hot': r.hot, 'bcmp-row-changed': r.changed }">
            <td class="bcmp-td-label">{{ r.label }}<span v-if="r.unit" class="bcmp-unit">{{ r.unit }}</span></td>
            <td class="bcmp-td-num">{{ r.a }}</td>
            <td class="bcmp-td-num">{{ r.b }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.changed }">{{ r.delta }}</td>
          </tr>
          <tr v-if="medianComboRow" :class="{ 'bcmp-row-changed': medianComboRow.changed }">
            <td class="bcmp-td-label">中位數連爆</td>
            <td class="bcmp-td-num">{{ medianComboRow.a }}</td>
            <td class="bcmp-td-num">{{ medianComboRow.b }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !medianComboRow.changed }">{{ medianComboRow.delta }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 大獎分層 -->
    <div v-if="bigWinRows.length" class="bcmp-card">
      <div class="bcmp-card-title">大獎分層(命中率%)</div>
      <table class="bcmp-table">
        <thead><tr>
          <th class="bcmp-th-label">門檻</th>
          <th class="bcmp-th-a">A</th><th class="bcmp-th-b">B</th>
          <th class="bcmp-th-d">Δ</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in bigWinRows" :key="r.label" :class="{ 'bcmp-row-changed': r.changed }">
            <td class="bcmp-td-label">{{ r.label }}</td>
            <td class="bcmp-td-num">{{ r.a }}</td>
            <td class="bcmp-td-num">{{ r.b }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.changed }">{{ r.delta }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 模式 RTP -->
    <div v-if="modeRows.length" class="bcmp-card">
      <div class="bcmp-card-title">各模式 RTP%</div>
      <table class="bcmp-table">
        <thead><tr>
          <th class="bcmp-th-label">模式</th>
          <th class="bcmp-th-a">A RTP%</th><th class="bcmp-th-b">B RTP%</th>
          <th class="bcmp-th-d">Δ RTP</th>
          <th class="bcmp-th-a">A 死局%</th><th class="bcmp-th-b">B 死局%</th>
          <th class="bcmp-th-d">Δ 死局</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in modeRows" :key="r.mode"
              :class="{ 'bcmp-row-changed': r.changed, 'bcmp-row-missing': r.missing }">
            <td class="bcmp-td-label">{{ r.mode }}<span v-if="r.missing" class="bcmp-missing-tag">{{ r.missing }}</span></td>
            <td class="bcmp-td-num">{{ r.aRtp }}</td>
            <td class="bcmp-td-num">{{ r.bRtp }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.rtpChanged }">{{ r.dRtp }}</td>
            <td class="bcmp-td-num">{{ r.aDead }}</td>
            <td class="bcmp-td-num">{{ r.bDead }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.deadChanged }">{{ r.dDead }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 符號頻率(可折疊,清單較長) -->
    <details v-if="symbolRows.length" class="bcmp-card bcmp-card-details"
             @toggle="symOpen = $event.target.open">
      <summary class="bcmp-card-title bcmp-card-title-sum">
        符號頻率與 RTP 貢獻 <span class="bcmp-sum-count">({{ symbolRows.length }} 符號)</span>
      </summary>
      <table v-if="symOpen" class="bcmp-table">
        <thead><tr>
          <th class="bcmp-th-label">符號</th>
          <th class="bcmp-th-a">A 出現%</th><th class="bcmp-th-b">B 出現%</th>
          <th class="bcmp-th-d">Δ 出現</th>
          <th class="bcmp-th-a">A RTP 貢獻%</th><th class="bcmp-th-b">B RTP 貢獻%</th>
          <th class="bcmp-th-d">Δ 貢獻</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in symbolRows" :key="r.sid"
              :class="{ 'bcmp-row-changed': r.changed, 'bcmp-row-missing': r.missing }">
            <td class="bcmp-td-label">{{ r.sid }}<span v-if="r.missing" class="bcmp-missing-tag">{{ r.missing }}</span></td>
            <td class="bcmp-td-num">{{ r.aPct }}</td>
            <td class="bcmp-td-num">{{ r.bPct }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.pctChanged }">{{ r.dPct }}</td>
            <td class="bcmp-td-num">{{ r.aRtp }}</td>
            <td class="bcmp-td-num">{{ r.bRtp }}</td>
            <td class="bcmp-td-delta" :class="{ 'is-zero': !r.rtpChanged }">{{ r.dRtp }}</td>
          </tr>
        </tbody>
      </table>
    </details>

  </div>

  <!-- 空狀態引導 -->
  <div v-else class="bcmp-empty">
    <div class="bcmp-empty-icon">⚖️</div>
    <div class="bcmp-empty-text">上傳 A、B 兩份結果檔後,差異會顯示在這裡</div>
    <div class="bcmp-empty-sub">流程:設定檔編輯器調參 → 匯出 A.xlsx → 外部模擬器跑出 B 結果 → 回來比較</div>
  </div>

</div>`;

  SP.BComparePage = {
    template: TEMPLATE,
    emits: ['status'],
    setup(props, { emit }) {
      const { ref, computed } = Vue;

      const resA = ref(null);
      const resB = ref(null);
      const loadingA = ref(false);
      const loadingB = ref(false);
      const errorMsg = ref('');
      const fileInputRef = ref(null);
      const resultsRef = ref(null);
      const shotBusy = ref(false);
      const symOpen = ref(false);   // 符號表 gating(對齊 v4.4 JSON 預覽模式)
      let pickTarget = 'A';

      function pickFile(which) {
        pickTarget = which;
        if (fileInputRef.value) fileInputRef.value.click();
      }
      async function onPicked(e) {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        errorMsg.value = '';
        const isA = pickTarget === 'A';
        (isA ? loadingA : loadingB).value = true;
        try {
          const parsed = await parseBFile(f);
          (isA ? resA : resB).value = parsed;
          emit('status', { type: 'ok', msg: `✓ 已載入 ${pickTarget}:${f.name}` });
        } catch (err) {
          errorMsg.value = err.message || String(err);
          emit('status', { type: 'err', msg: '解析失敗:' + errorMsg.value });
        } finally {
          (isA ? loadingA : loadingB).value = false;
        }
      }
      function swapAB() {
        const t = resA.value; resA.value = resB.value; resB.value = t;
        emit('status', { type: 'ok', msg: '已交換 A / B' });
      }
      function fmtCell(res, label, digits) {
        const e = res && res.summary && res.summary[label];
        return _fmt(e ? e.num : null, digits);
      }

      // ── 核心指標列 ──
      const coreRows = computed(() => {
        const a = resA.value, b = resB.value;
        if (!a || !b) return [];
        return CORE_METRICS
          .filter(m => (a.summary[m.label] || b.summary[m.label]))
          .map(m => {
            const av = a.summary[m.label] ? a.summary[m.label].num : null;
            const bv = b.summary[m.label] ? b.summary[m.label].num : null;
            const d = (av != null && bv != null) ? bv - av : null;
            const changed = d != null && Math.abs(d) >= Math.pow(10, -m.digits) / 2;
            return {
              label: m.label, unit: m.unit, hot: !!m.hot, changed,
              a: _fmt(av, m.digits), b: _fmt(bv, m.digits),
              delta: _fmtDelta(d, m.digits),
            };
          });
      });
      const medianComboRow = computed(() => {
        const a = resA.value, b = resB.value;
        if (!a || !b) return null;
        if (a.medianCombo == null && b.medianCombo == null) return null;
        const d = (a.medianCombo != null && b.medianCombo != null)
          ? b.medianCombo - a.medianCombo : null;
        return {
          a: _fmt(a.medianCombo, 1), b: _fmt(b.medianCombo, 1),
          delta: _fmtDelta(d, 1), changed: d != null && Math.abs(d) >= 0.05,
        };
      });

      // ── 大獎分層 ──
      const bigWinRows = computed(() => {
        const a = resA.value, b = resB.value;
        if (!a || !b) return [];
        const labels = [];
        for (const w of a.bigWins) labels.push(w.label);
        for (const w of b.bigWins) if (labels.indexOf(w.label) < 0) labels.push(w.label);
        return labels.map(label => {
          const wa = a.bigWins.find(w => w.label === label);
          const wb = b.bigWins.find(w => w.label === label);
          const av = wa ? wa.pct : null, bv = wb ? wb.pct : null;
          const d = (av != null && bv != null) ? bv - av : null;
          return {
            label, changed: d != null && Math.abs(d) >= 0.00005,
            a: _fmt(av, 4), b: _fmt(bv, 4), delta: _fmtDelta(d, 4),
          };
        });
      });

      // ── 模式列(取聯集;單邊缺少標記)──
      const modeRows = computed(() => {
        const a = resA.value, b = resB.value;
        if (!a || !b) return [];
        const names = [];
        for (const m of a.modes) names.push(m.mode);
        for (const m of b.modes) if (names.indexOf(m.mode) < 0) names.push(m.mode);
        return names.map(mode => {
          const ma = a.modes.find(m => m.mode === mode) || null;
          const mb = b.modes.find(m => m.mode === mode) || null;
          const dRtp  = (ma && mb) ? mb.rtpPct - ma.rtpPct : null;
          const dDead = (ma && mb) ? mb.deadPct - ma.deadPct : null;
          const rtpChanged  = dRtp  != null && Math.abs(dRtp)  >= 0.00005;
          const deadChanged = dDead != null && Math.abs(dDead) >= 0.00005;
          return {
            mode, missing: !ma ? '僅 B' : (!mb ? '僅 A' : ''),
            aRtp: _fmt(ma && ma.rtpPct, 4),  bRtp: _fmt(mb && mb.rtpPct, 4),
            dRtp: _fmtDelta(dRtp, 4), rtpChanged,
            aDead: _fmt(ma && ma.deadPct, 4), bDead: _fmt(mb && mb.deadPct, 4),
            dDead: _fmtDelta(dDead, 4), deadChanged,
            changed: rtpChanged || deadChanged,
          };
        });
      });

      // ── 符號列(取聯集)──
      const symbolRows = computed(() => {
        const a = resA.value, b = resB.value;
        if (!a || !b) return [];
        const sids = [];
        for (const s of a.symbols) sids.push(s.sid);
        for (const s of b.symbols) if (sids.indexOf(s.sid) < 0) sids.push(s.sid);
        return sids.map(sid => {
          const sa = a.symbols.find(s => s.sid === sid) || null;
          const sb = b.symbols.find(s => s.sid === sid) || null;
          const dPct = (sa && sb) ? sb.pct - sa.pct : null;
          const dRtp = (sa && sb) ? sb.rtpPct - sa.rtpPct : null;
          const pctChanged = dPct != null && Math.abs(dPct) >= 0.00005;
          const rtpChanged = dRtp != null && Math.abs(dRtp) >= 0.00005;
          return {
            sid, missing: !sa ? '僅 B' : (!sb ? '僅 A' : ''),
            aPct: _fmt(sa && sa.pct, 4), bPct: _fmt(sb && sb.pct, 4),
            dPct: _fmtDelta(dPct, 4), pctChanged,
            aRtp: _fmt(sa && sa.rtpPct, 4), bRtp: _fmt(sb && sb.rtpPct, 4),
            dRtp: _fmtDelta(dRtp, 4), rtpChanged,
            changed: pctChanged || rtpChanged,
          };
        });
      });

      // ── 截圖匯出(沿用 SimPage 模式:html2canvas → PNG 下載)──
      async function screenshot() {
        const el = resultsRef.value;
        if (!el) return;
        if (typeof window.html2canvas !== 'function') {
          emit('status', { type: 'err', msg: '❌ html2canvas 未載入(CDN 可能被擋)' });
          return;
        }
        shotBusy.value = true;
        try {
          const canvas = await window.html2canvas(el, {
            backgroundColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--bg').trim() || '#EEEDEA',
            scale: 2,
          });
          const url = canvas.toDataURL('image/png');
          const aTag = document.createElement('a');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          aTag.href = url;
          aTag.download = `AB_結果比較_${stamp}.png`;
          aTag.click();
          emit('status', { type: 'ok', msg: '✓ 已匯出比較截圖' });
        } catch (e) {
          emit('status', { type: 'err', msg: '截圖失敗:' + (e.message || e) });
        } finally {
          shotBusy.value = false;
        }
      }

      return {
        resA, resB, loadingA, loadingB, errorMsg,
        fileInputRef, resultsRef, shotBusy, symOpen,
        pickFile, onPicked, swapAB, fmtCell, screenshot,
        coreRows, medianComboRow, bigWinRows, modeRows, symbolRows,
      };
    },
  };

  console.log('[bcompare] loaded');
})();
