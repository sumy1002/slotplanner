// ============================================================
//  config-compare.js — A.xlsx「設定檔」比對(輸出頁 §5「匯入與比對」)
//
//  背景:既有 bcompare.js(SP.BComparePage)比對的是「模擬結果 B_結果_*.xlsx」
//        (b_writer.py 格式:RTP / 符號頻率)。本檔補的是規格要的另一件事——
//        比對兩份「A.xlsx 設定檔」本身(契約 / 盤面 / 權重 / 押注 / 符號 / 規則…),
//        以 by-name 讀取、逐 sheet 逐列比對,標出 ＋新增 / ～變更 / －移除。
//
//  掛載點:
//    SP.ConfigCompare       — 純比對引擎(diffBuffers)
//    SP.ConfigComparePage   — Vue component(app.js 註冊為 <config-compare-page>)
//
//  鐵律:
//    - 只「讀」A.xlsx(或「目前設定」= buildAxlsxBufferFromLS 即時產出);
//      **絕不寫入、絕不覆蓋任何一方、不動契約 / 引擎 / docgen**。
//    - by-name(讀表頭定位欄),免疫欄序打亂;缺表 / 缺欄安全降級。
//    - 「文件設定(docgen meta)」不在 A.xlsx(存 LS),故本比對不含該區——
//      A.xlsx 只承載 config 分頁,誠實地只比可比的。
//  依賴:window.ExcelJS(CDN,app.html 已載)、window.SlotPlanner.buildAxlsxBufferFromLS。
// ============================================================
(function () {
  'use strict';
  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;

  const CURRENT_ID = '__current__';

  // ── ExcelJS cell → 純文字(rich text / 公式結果 / 日期容錯)──
  function cellStr(v) {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(r => r.text || '').join('');
      if (v.text != null) return String(v.text);
      if (v.result != null) return String(v.result);
      if (v.formula != null) return '=' + v.formula;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v.hyperlink != null) return String(v.hyperlink);
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  }

  // ── sheet → { header:[名稱], keyCol:欄index(1-based)或0, rows:[{__i, cells:{name:val}}] } ──
  function readSheet(ws) {
    const header = [];
    const hdrRow = ws.getRow(1);
    hdrRow.eachCell((cell, col) => { header[col] = cellStr(cell.value).trim(); });
    // key 欄:優先第一個以 _ID 結尾或名為 ID 的欄,否則第一個非空欄
    let keyCol = 0;
    for (let c = 1; c < header.length; c++) {
      const h = header[c] || '';
      if (/(_ID$|^ID$)/i.test(h)) { keyCol = c; break; }
    }
    if (!keyCol) { for (let c = 1; c < header.length; c++) { if (header[c]) { keyCol = c; break; } } }
    const rows = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const cells = {};
      let allEmpty = true;
      for (let c = 1; c < header.length; c++) {
        const name = header[c]; if (!name) continue;
        const val = cellStr(row.getCell(c).value).trim();
        cells[name] = val;
        if (val !== '') allEmpty = false;
      }
      if (allEmpty) return;   // 略過全空列
      rows.push({ __i: i, cells });
    });
    return { header: header.filter(Boolean), keyCol, keyName: keyCol ? header[keyCol] : '', rows };
  }

  // ── 分區對照(sheet 名 → 區段標題;規格 §5.2 分區順序)──
  const SECTION_RULES = [
    [/^0?1_|Global/i,                         '契約 / 全域'],
    [/^02/i,                                  '盤面幾何'],
    [/^03/i,                                  '符號'],
    [/^(04|08|12)/i,                          '權重'],
    [/^05/i,                                  '格數 / 可變列'],
    [/^06/i,                                  '中獎線'],
    [/^(07|09|10)/i,                          '規則 / 約束'],
    [/^(11|13|17|18|19)|bet|jackpot|gamble/i, '模式 / 押注'],
  ];
  const SECTION_ORDER = ['契約 / 分頁', '契約 / 全域', '盤面幾何', '符號', '權重', '格數 / 可變列',
                         '中獎線', '規則 / 約束', '模式 / 押注', '其他'];
  function sectionOf(name) {
    for (const [re, title] of SECTION_RULES) if (re.test(name)) return title;
    return '其他';
  }

  // ── 建 key → row 的 map(同 key 多列時退回用 __i 當 key,避免覆蓋)──
  function keyRows(sheet) {
    const m = new Map();
    const dup = new Set();
    for (const r of sheet.rows) {
      let k = sheet.keyCol ? (r.cells[sheet.keyName] || '') : '';
      if (!k || m.has('K:' + k) || dup.has(k)) {
        if (m.has('K:' + k)) dup.add(k);
        k = null;
      }
      if (k != null && k !== '') m.set('K:' + k, r);
      else m.set('R:' + r.__i, r);   // 無 key / 重複 → 用列號
    }
    return m;
  }

  // ── 兩列的欄差異(以 A 表頭為準,聯集 B 新欄)──
  function rowDiff(rA, rB, headerA, headerB) {
    const cols = new Set([...(headerA || []), ...(headerB || [])]);
    const out = [];
    for (const col of cols) {
      const a = (rA.cells[col] != null ? rA.cells[col] : '');
      const b = (rB.cells[col] != null ? rB.cells[col] : '');
      if (a !== b) out.push({ col, a: a === '' ? '∅' : a, b: b === '' ? '∅' : b });
    }
    return out;
  }

  // ── 主比對:bufA/bufB(ArrayBuffer)→ 結構化差異 ──
  async function diffBuffers(bufA, bufB) {
    if (typeof window.ExcelJS === 'undefined') throw new Error('ExcelJS 未載入(CDN 可能被擋)');
    const wbA = new window.ExcelJS.Workbook(); await wbA.xlsx.load(bufA);
    const wbB = new window.ExcelJS.Workbook(); await wbB.xlsx.load(bufB);
    const namesA = wbA.worksheets.map(w => w.name);
    const namesB = wbB.worksheets.map(w => w.name);
    const setA = new Set(namesA), setB = new Set(namesB);

    const sections = {};   // title → { adds:[], changes:[], removes:[] }
    const bucket = (title) => (sections[title] || (sections[title] = { adds: [], changes: [], removes: [] }));
    const push = (title, kind, text) => { bucket(title)[kind].push(text); };

    // (1) sheet-level:契約 / 分頁
    for (const nm of namesB) if (!setA.has(nm)) push('契約 / 分頁', 'adds', `新增分頁 ${nm}`);
    for (const nm of namesA) if (!setB.has(nm)) push('契約 / 分頁', 'removes', `移除分頁 ${nm}`);

    // (2) row-level:共有 sheet 逐列
    for (const nm of namesA) {
      if (!setB.has(nm)) continue;
      const A = readSheet(wbA.getWorksheet(nm));
      const B = readSheet(wbB.getWorksheet(nm));
      const sec = sectionOf(nm);
      const mapA = keyRows(A), mapB = keyRows(B);
      const label = (k) => k.slice(2);   // 去掉 K:/R: 前綴
      for (const k of mapB.keys()) if (!mapA.has(k)) push(sec, 'adds', `${nm}:新增列 ${label(k)}`);
      for (const k of mapA.keys()) if (!mapB.has(k)) push(sec, 'removes', `${nm}:移除列 ${label(k)}`);
      for (const k of mapA.keys()) {
        if (!mapB.has(k)) continue;
        const diffs = rowDiff(mapA.get(k), mapB.get(k), A.header, B.header);
        if (diffs.length) {
          const detail = diffs.slice(0, 6).map(d => `${d.col} ${d.a}→${d.b}`).join('、')
            + (diffs.length > 6 ? ` …等 ${diffs.length} 欄` : '');
          push(sec, 'changes', `${nm} · ${label(k)}:${detail}`);
        }
      }
    }

    // (3) 整理成有序陣列 + 計數
    const ordered = [];
    let cAdd = 0, cChg = 0, cRem = 0;
    for (const title of SECTION_ORDER) {
      const s = sections[title]; if (!s) continue;
      if (!s.adds.length && !s.changes.length && !s.removes.length) continue;
      ordered.push({ title, adds: s.adds, changes: s.changes, removes: s.removes });
      cAdd += s.adds.length; cChg += s.changes.length; cRem += s.removes.length;
    }
    // 任何不在 SECTION_ORDER 的區段(理論上不會有)補在最後
    for (const title of Object.keys(sections)) {
      if (SECTION_ORDER.includes(title)) continue;
      const s = sections[title];
      ordered.push({ title, adds: s.adds, changes: s.changes, removes: s.removes });
      cAdd += s.adds.length; cChg += s.changes.length; cRem += s.removes.length;
    }
    return { sections: ordered, counts: { add: cAdd, change: cChg, remove: cRem } };
  }

  SP.ConfigCompare = { diffBuffers, readSheet, sectionOf, cellStr };

  // ============================================================
  //  Vue component:SP.ConfigComparePage
  // ============================================================
  const TEMPLATE = `
  <div class="cfgcmp">
    <div class="cfgcmp-head">
      <span class="cfgcmp-title">匯入與比對</span>
      <span class="cfgcmp-sub">上傳多個 A.xlsx · 自選任兩版比對</span>
    </div>

    <!-- 拖放區 -->
    <div class="cfgcmp-drop" :class="{ over: dragOver }"
         @dragover.prevent="dragOver=true" @dragleave.prevent="dragOver=false" @drop.prevent="onDrop">
      <div class="cfgcmp-drop-ic">⬆</div>
      <div class="cfgcmp-drop-txt">拖放 A.xlsx（可多個）到此，或
        <span class="cfgcmp-link" @click="pick()">選擇檔案</span></div>
      <input ref="fileInput" type="file" accept=".xlsx" multiple style="display:none" @change="onPicked">
    </div>

    <!-- 檔案清單 -->
    <div class="cfgcmp-list">
      <div v-for="f in files" :key="f.id" class="cfgcmp-file" :class="{ current: f.kind==='current' }">
        <span class="cfgcmp-file-ic">{{ f.kind==='current' ? '💾' : '📄' }}</span>
        <span class="cfgcmp-file-name">{{ f.name }}</span>
        <span v-if="f.kind==='current'" class="cfgcmp-badge">工作中</span>
        <button v-else class="cfgcmp-x" title="移除" @click="removeFile(f.id)">✕</button>
      </div>
    </div>

    <!-- A / B 選擇 + 比對 -->
    <div class="cfgcmp-pick">
      <label class="cfgcmp-pick-item">
        <span class="cfgcmp-pick-lbl">比對 A</span>
        <select class="input input-sm" v-model="pickA" @change="diff=null">
          <option v-for="f in files" :key="'a'+f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <span class="cfgcmp-arrow">→</span>
      <label class="cfgcmp-pick-item">
        <span class="cfgcmp-pick-lbl">比對 B</span>
        <select class="input input-sm" v-model="pickB" @change="diff=null">
          <option value="">（選擇…）</option>
          <option v-for="f in files" :key="'b'+f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <button class="btn btn-sm cfgcmp-run" :disabled="busy || !pickA || !pickB || pickA===pickB" @click="runCompare">
        {{ busy ? '比對中…' : (diff ? '收起' : '比對這兩版') }}
      </button>
    </div>
    <div v-if="err" class="cfgcmp-err">{{ err }}</div>

    <!-- 差異 -->
    <div v-if="diff" class="cfgcmp-diff">
      <div class="cfgcmp-diff-top">
        <span class="cfgcmp-chip add">＋{{ diff.counts.add }}</span>
        <span class="cfgcmp-chip chg">～{{ diff.counts.change }}</span>
        <span class="cfgcmp-chip rem">－{{ diff.counts.remove }}</span>
        <span class="cfgcmp-ab">{{ labelA }} → {{ labelB }}</span>
      </div>
      <div v-if="!diff.sections.length" class="cfgcmp-none">兩版設定檔內容一致（無差異）。</div>
      <div v-for="sec in diff.sections" :key="sec.title" class="cfgcmp-sec">
        <div class="cfgcmp-sec-title">{{ sec.title }}</div>
        <div v-for="(t,i) in sec.adds" :key="'ad'+i" class="cfgcmp-row">
          <span class="cfgcmp-mark add">＋</span><span class="cfgcmp-txt">{{ t }}</span></div>
        <div v-for="(t,i) in sec.changes" :key="'ch'+i" class="cfgcmp-row">
          <span class="cfgcmp-mark chg">～</span><span class="cfgcmp-txt">{{ t }}</span></div>
        <div v-for="(t,i) in sec.removes" :key="'rm'+i" class="cfgcmp-row">
          <span class="cfgcmp-mark rem">－</span><span class="cfgcmp-txt">{{ t }}</span></div>
      </div>
      <div class="cfgcmp-note">ⓘ 只顯示差異、不覆蓋任何一方（匯入的目的即為比對）。文件設定（RTP / 波動等）存於本機、不在 A.xlsx，故不列於此。</div>
    </div>
  </div>`;

  SP.ConfigComparePage = {
    template: TEMPLATE,
    emits: ['status'],
    setup(props, { emit }) {
      const { ref } = Vue;
      const files = ref([{ id: CURRENT_ID, name: '目前設定（工作中）', kind: 'current' }]);
      const dragOver = ref(false);
      const pickA = ref(CURRENT_ID);
      const pickB = ref('');
      const diff = ref(null);
      const busy = ref(false);
      const err = ref('');
      const labelA = ref(''), labelB = ref('');
      const fileInput = ref(null);
      let uid = 0;

      function pick() { if (fileInput.value) fileInput.value.click(); }

      function readFileBuf(file) {
        return new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error('讀取失敗:' + file.name));
          r.readAsArrayBuffer(file);
        });
      }

      async function addFiles(fileList) {
        err.value = '';
        const arr = Array.from(fileList || []).filter(f => /\.xlsx$/i.test(f.name));
        if (!arr.length) { err.value = '請上傳 .xlsx 檔'; return; }
        for (const f of arr) {
          try {
            const buf = await readFileBuf(f);
            files.value.push({ id: 'u' + (++uid), name: f.name, kind: 'upload', _buf: buf });
          } catch (e) { err.value = e.message || String(e); }
        }
        emit('status', { type: 'ok', msg: `已加入 ${arr.length} 個檔案` });
      }

      function onPicked(e) { addFiles(e.target.files); if (e.target) e.target.value = ''; }
      function onDrop(e) { dragOver.value = false; addFiles(e.dataTransfer && e.dataTransfer.files); }

      function removeFile(id) {
        const i = files.value.findIndex(f => f.id === id);
        if (i < 0 || files.value[i].kind === 'current') return;
        files.value.splice(i, 1);
        // 若正被 A/B 選用 → 回退為目前設定 / 清空
        if (pickA.value === id) pickA.value = CURRENT_ID;
        if (pickB.value === id) pickB.value = '';
        diff.value = null;
      }

      async function bufferFor(id) {
        if (id === CURRENT_ID) {
          if (!SP.buildAxlsxBufferFromLS) throw new Error('無法讀取目前設定(buildAxlsxBufferFromLS 未載入)');
          return await SP.buildAxlsxBufferFromLS();
        }
        const f = files.value.find(x => x.id === id);
        if (!f || !f._buf) throw new Error('找不到檔案資料');
        return f._buf;
      }
      const nameFor = (id) => { const f = files.value.find(x => x.id === id); return f ? f.name : ''; };

      async function runCompare() {
        if (diff.value) { diff.value = null; return; }   // 再點收起
        if (!pickA.value || !pickB.value || pickA.value === pickB.value) return;
        busy.value = true; err.value = '';
        try {
          const [bufA, bufB] = await Promise.all([bufferFor(pickA.value), bufferFor(pickB.value)]);
          const res = await SP.ConfigCompare.diffBuffers(bufA, bufB);
          labelA.value = nameFor(pickA.value); labelB.value = nameFor(pickB.value);
          diff.value = res;
          const { add, change, remove } = res.counts;
          emit('status', { type: 'ok', msg: `比對完成:＋${add} ～${change} －${remove}` });
        } catch (e) {
          err.value = '比對失敗:' + (e.message || String(e));
          emit('status', { type: 'err', msg: err.value });
        } finally { busy.value = false; }
      }

      return { files, dragOver, pickA, pickB, diff, busy, err, labelA, labelB, fileInput,
               pick, onPicked, onDrop, removeFile, runCompare };
    },
  };
})();
