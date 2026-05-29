// ============================================================
//  slotplanner.js  — S5
//  Pyodide Worker 橋接 + SimPage Vue component
//
//  架構：
//    主執行緒        →  postMessage → Worker
//    Worker         →  Pyodide 跑 Python 引擎
//    Worker         →  postMessage → 主執行緒（進度/結果/錯誤）
//
//  掛載點：window.SlotPlanner.SimPage (Vue 3 component)
//  Worker 程式碼：同檔案下方以 Blob URL 方式建立，不需要額外 .js 檔
// ============================================================
(function () {
  'use strict';

  // namespace guard（registry.js 應先載入，此為保險）
  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;

  const { ref, computed, onMounted, onUnmounted } = Vue;

  // ══════════════════════════════════════════════════════════
  //  Worker 原始碼（Blob 方式，file:// 不需額外 .js）
  // ══════════════════════════════════════════════════════════
  const WORKER_SRC = `
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

let pyodide = null;
let pyReady = false;

async function initPyodide() {
  self.postMessage({ type: 'status', msg: '正在載入 Pyodide…' });
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
  self.postMessage({ type: 'status', msg: '正在載入 micropip / pandas…' });
  await pyodide.loadPackage(['micropip', 'pandas']);
  self.postMessage({ type: 'status', msg: '正在從 PyPI 安裝 openpyxl（首次約 10–30 秒）…' });
  await pyodide.runPythonAsync('import micropip\\nawait micropip.install("openpyxl")');
  self.postMessage({ type: 'status', msg: 'Pyodide 環境就緒！' });
  pyReady = true;
  self.postMessage({ type: 'ready' });
}

initPyodide().catch(e => {
  let msg;
  try {
    // Pyodide PythonError 把完整 traceback 放在 .message
    if (e && typeof e.message === 'string' && e.message.length > 0) msg = e.message;
    else if (e && e.stack) msg = String(e.stack);
    else if (e && typeof e === 'object') {
      // 列出物件所有可列舉屬性
      const keys = Object.getOwnPropertyNames(e);
      msg = 'Error object with keys: ' + keys.join(',') + ' | ' +
            keys.map(k => k + '=' + String(e[k]).slice(0, 200)).join(' | ');
    }
    else msg = String(e);
  } catch (innerErr) {
    msg = 'Unserializable error: ' + innerErr.message;
  }
  self.postMessage({ type: 'error', msg: '初始化失敗: ' + msg });
});

self.onmessage = async function(ev) {
  const { type, payload } = ev.data;

  if (type === 'run') {
    if (!pyReady) {
      self.postMessage({ type: 'error', msg: 'Pyodide 尚未就緒' });
      return;
    }
    try {
      // 把 xlsx bytes 載入 Pyodide 虛擬檔案系統
      pyodide.FS.writeFile('/A_設定檔.xlsx', new Uint8Array(payload.xlsxBytes));

      // 把 Python 原始碼寫入虛擬 FS
      for (const [path, code] of Object.entries(payload.pythonFiles)) {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) {
          try { pyodide.FS.mkdir(dir, { recursive: true }); } catch(e) {}
          try {
            const parts = dir.split('/');
            let cur = '';
            for (const p of parts) {
              cur = cur ? cur + '/' + p : p;
              try { pyodide.FS.mkdir(cur); } catch(e) {}
              try { pyodide.FS.writeFile(cur + '/__init__.py', ''); } catch(e) {}
            }
          } catch(e) {}
        }
        pyodide.FS.writeFile(path, code);
      }

      // 進度回報橋接（Python 側用 print → 我們攔截）
      pyodide.setStdout({
        batched: (s) => self.postMessage({ type: 'log', msg: s })
      });
      pyodide.setStderr({
        batched: (s) => self.postMessage({ type: 'log', msg: '[WARN] ' + s })
      });

      self.postMessage({ type: 'status', msg: '執行模擬中…' });

      // 執行 run.py 的 main()
      const result = await pyodide.runPythonAsync(\`
import sys
sys.path.insert(0, '/')
sys.path.insert(0, '/core')
sys.path.insert(0, '/iolayer')
sys.path.insert(0, '/stats')

from run_web import run_and_return
result = run_and_return('/A_設定檔.xlsx')
result
\`);

      // 取得 B.xlsx bytes
      const bBytes = pyodide.FS.readFile('/output/B_結果_latest.xlsx');
      self.postMessage({
        type: 'done',
        xlsxBytes: bBytes.buffer,
        summary: result.toJs ? result.toJs() : result,
      }, [bBytes.buffer]);

    } catch(e) {
      let msg;
      try {
        if (e && typeof e.message === 'string' && e.message.length > 0) msg = e.message;
        else if (e && e.stack) msg = String(e.stack);
        else if (e && typeof e === 'object') {
          const keys = Object.getOwnPropertyNames(e);
          msg = 'Error object with keys: ' + keys.join(',') + ' | ' +
                keys.map(k => k + '=' + String(e[k]).slice(0, 200)).join(' | ');
        }
        else msg = String(e);
      } catch (innerErr) {
        msg = 'Unserializable error: ' + innerErr.message;
      }
      self.postMessage({ type: 'error', msg: msg });
    }
  }
};
`;

  // ══════════════════════════════════════════════════════════
  //  Python 橋接入口（run_web.py 等效，由 JS 動態注入）
  // ══════════════════════════════════════════════════════════
  const RUN_WEB_PY = `
"""Pyodide 環境下的模擬入口，輸出 B.xlsx 到 /output/B_結果_latest.xlsx"""
from __future__ import annotations
import sys, random
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, '/')
from iolayer.a_loader import load_a_config
from core.schemas import TriggerType, PuzzleLoopError
from core.logic_parser import LogicParser, EvalContext
from core.reel_generator import ReelGenerator
from core.grid_engine import GridEngine
from core.pay_resolver import PayResolver
from core.combo_engine import ComboEngine
from stats.collector import Collector
from iolayer.b_writer import write_b_file


def run_and_return(a_path: str) -> dict:
    cfg = load_a_config(a_path)
    total = cfg.global_cfg.simulation_count

    rng     = random.Random(cfg.global_cfg.random_seed)
    gen     = ReelGenerator(cfg.layout, cfg.symbols, cfg.reel_weights,
                             cfg.grid_size_weights, cfg.constraints, cfg.combo_weights)
    engine  = GridEngine(gen, cfg.discard_rules, max_hard_retry=200)
    resolver= PayResolver(cfg.global_cfg, cfg.symbols, cfg.paylines)
    combo   = ComboEngine(resolver, engine, gen)
    parser  = LogicParser(cfg.puzzle_rules,
                           cfg.global_cfg.max_chain_depth,
                           cfg.global_cfg.max_chain_per_rule)
    col     = Collector(cfg)

    globals_state: dict = {}
    mode = cfg.global_cfg.starting_mode
    consecutive_dead = 0
    report_every = max(1, total // 100)

    for spin_i in range(total):
        if spin_i % report_every == 0:
            pct = spin_i / total * 100
            print(f'PROGRESS:{pct:.1f}:{spin_i}:{total}')

        ctx = EvalContext(mode=mode, globals_ref=globals_state,
                          consecutive_dead_spins=consecutive_dead)
        try:
            parser.reset_chain()
            parser.dispatch(TriggerType.ON_SPIN_START, ctx)
            spin_result = engine.spin(ctx, rng, parser)
        except Exception:
            col.record_loop_error()
            continue

        if not spin_result.is_valid:
            col.record_invalid(spin_result.hard_discard_count)
            continue

        try:
            combo_result = combo.run(spin_result.grid, ctx, rng, parser)
        except Exception:
            col.record_loop_error()
            continue

        col.record(spin_result, combo_result, mode)

        if combo_result.is_dead_spin:
            consecutive_dead += 1
        else:
            consecutive_dead = 0

        pending = ctx.spin_locals.get('_pending_mode_switch')
        if pending and pending.get('target') in cfg.modes:
            mode = pending['target']

        GridEngine.reset_spin_state(ctx)

    print(f'PROGRESS:100.0:{total}:{total}')
    col.record_rule_triggers(cfg.puzzle_rules)
    summary = col.summary()

    Path('/output').mkdir(exist_ok=True)
    write_b_file(cfg, summary, cfg.puzzle_rules, Path('/output'))
    # rename to fixed name for JS to read
    import glob
    files = sorted(glob.glob('/output/B_*.xlsx'))
    if files:
        import os
        os.rename(files[-1], '/output/B_結果_latest.xlsx')

    return summary
`;

  // ══════════════════════════════════════════════════════════
  //  Module-level Worker Service(任務:Pyodide worker lift up)
  //
  //  把 Worker 從 SimPage 提升到模組層級,讓它在 app 啟動就創建,
  //  跨頁面切換不會重新初始化(避免每次進 SimPage 等 10-30 秒)。
  //
  //  Pub-sub 模式:
  //    - ensureWorker():創建或回傳現有 worker(idempotent)
  //    - subscribe(cb):訂閱所有 worker 訊息;回傳 unsubscribe fn
  //    - postRun(xlsxBytes, pythonFiles):發送 run 指令
  //    - isPyReady():當前 Pyodide 是否已就緒
  // ══════════════════════════════════════════════════════════
  let _workerInstance = null;
  let _workerPyReady = false;
  const _workerListeners = new Set();

  function _workerBroadcast(data) {
    for (const cb of _workerListeners) {
      try { cb(data); } catch (e) { console.error('[workerService] listener error', e); }
    }
  }

  function _workerEnsure() {
    if (_workerInstance) return _workerInstance;
    if (typeof Worker === 'undefined') {
      throw new Error('此瀏覽器不支援 Web Worker');
    }
    const blob = new Blob([WORKER_SRC], { type: 'text/javascript' });
    const url  = URL.createObjectURL(blob);
    _workerInstance = new Worker(url);

    _workerInstance.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'ready') {
        _workerPyReady = true;
      }
      _workerBroadcast(ev.data);
    };
    _workerInstance.onerror = (e) => {
      const msg = (e && (e.message || e.filename)) || String(e);
      _workerBroadcast({ type: 'error', msg: '[Worker fatal] ' + msg });
    };
    console.log('[workerService] worker 已建立(全域單例,預熱中…)');
    return _workerInstance;
  }

  function _workerSubscribe(cb) {
    _workerListeners.add(cb);
    // 對遲到的訂閱者補發 'ready' 事件,讓他們知道目前狀態
    if (_workerPyReady) {
      try { cb({ type: 'ready' }); } catch (e) {}
    }
    return () => _workerListeners.delete(cb);
  }

  function _workerPostRun(xlsxBytes, pythonFiles) {
    _workerEnsure().postMessage(
      { type: 'run', payload: { xlsxBytes, pythonFiles } },
      [xlsxBytes]
    );
  }

  SP.workerService = {
    ensureWorker: _workerEnsure,
    subscribe:    _workerSubscribe,
    postRun:      _workerPostRun,
    isPyReady:    () => _workerPyReady,
    // debug
    _listenerCount: () => _workerListeners.size,
  };

  // ══════════════════════════════════════════════════════════
  //  SimPage Vue Component
  // ══════════════════════════════════════════════════════════
  SP.SimPage = {
    template: `
<div class="sim-page">

  <!-- ── 標題列 ── -->
  <div class="sim-header">
    <div class="sim-title">🎰 模擬引擎</div>
    <div class="sim-subtitle">選擇設定來源 → 瀏覽器內執行 → 下載 B_結果.xlsx</div>
  </div>

  <!-- ── 設定來源切換 ── -->
  <div class="sim-source-tabs sim-source-tabs-3">
    <button class="sim-source-tab"
            :class="{ active: source === 'editor' }"
            @click="setSource('editor')">
      <span class="sim-source-icon">🧩</span>
      <span class="sim-source-label">編輯器當前設定</span>
      <span class="sim-source-hint">直接從網頁設定檔讀</span>
    </button>
    <button class="sim-source-tab"
            :class="{ active: source === 'file' }"
            @click="setSource('file')">
      <span class="sim-source-icon">📁</span>
      <span class="sim-source-label">上傳 A.xlsx</span>
      <span class="sim-source-hint">傳統方式</span>
    </button>
    <button class="sim-source-tab sim-source-tab-compare"
            :class="{ active: source === 'compare' }"
            @click="setSource('compare')">
      <span class="sim-source-icon">📊</span>
      <span class="sim-source-label">比較範本 A vs B</span>
      <span class="sim-source-hint">設計迭代利器</span>
    </button>
  </div>

  <!-- ── 來源 = editor:摘要面板 ── -->
  <div v-if="source === 'editor'" class="sim-editor-source"
       :class="{ 'has-data': editorSummary && editorSummary.hasAnyData }">
    <div v-if="!editorSummary || !editorSummary.hasAnyData" class="sim-editor-empty">
      <div class="sim-editor-empty-icon">⚪</div>
      <div class="sim-editor-empty-text">
        編輯器尚無任何設定(將使用預設值)。
        <br>
        建議先到
        <a href="#" @click.prevent="$emit('navigate', 3)" class="sim-link">⚙️ 設定檔編輯器</a>
        編輯,或切換到「上傳 A.xlsx」模式。
      </div>
    </div>
    <div v-else class="sim-editor-summary">
      <div class="sim-editor-summary-head">
        <span class="sim-editor-summary-icon">📊</span>
        <span class="sim-editor-summary-title">即將使用以下設定:</span>
        <button class="sim-refresh-btn" @click="refreshEditorSummary"
                title="重新讀取編輯器狀態">↻ 重新讀取</button>
      </div>
      <div class="sim-editor-summary-grid">
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.modes }}</span>
          <span class="sim-editor-summary-label">模式</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.layout }}</span>
          <span class="sim-editor-summary-label">Reel</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.symbols }}</span>
          <span class="sim-editor-summary-label">符號</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.paylines }}</span>
          <span class="sim-editor-summary-label">中獎線</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.constraints }}</span>
          <span class="sim-editor-summary-label">硬約束</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.rules }}</span>
          <span class="sim-editor-summary-label">腳本規則</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.discards }}</span>
          <span class="sim-editor-summary-label">棄牌規則</span>
        </div>
        <div class="sim-editor-summary-cell">
          <span class="sim-editor-summary-num">{{ editorSummary.counts.bins }}</span>
          <span class="sim-editor-summary-label">分佈區間</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── 來源 = file:上傳區(原 UI)── -->
  <div v-else-if="source === 'file'"
       class="sim-upload-area"
       :class="{ 'drag-over': isDragging, 'has-file': xlsxFile }"
       @dragenter.prevent="isDragging=true"
       @dragover.prevent="isDragging=true"
       @dragleave.prevent="isDragging=false"
       @drop.prevent="onDrop"
       @click="$refs.xlsxInput.click()">
    <input ref="xlsxInput" type="file" accept=".xlsx,.xlsm" style="display:none"
           @change="onFilePick">
    <div class="sim-upload-icon">{{ xlsxFile ? '📊' : '📁' }}</div>
    <div class="sim-upload-main">
      {{ xlsxFile ? xlsxFile.name : '點擊或拖曳 A_設定檔.xlsx' }}
    </div>
    <div class="sim-upload-sub" v-if="!xlsxFile">
      A.xlsx 不離開本機(純前端 Pyodide)
    </div>
    <div class="sim-upload-sub" v-else>
      {{ (xlsxFile.size / 1024).toFixed(1) }} KB
      <span class="sim-change-hint">· 點擊更換</span>
    </div>
  </div>

  <!-- ── 來源 = compare:範本比較設定 ── -->
  <div v-else-if="source === 'compare'" class="sim-compare-source">
    <div class="sim-compare-head">
      <span class="sim-compare-head-icon">📊</span>
      <span class="sim-compare-head-text">
        選兩個範本各跑 N 次,並排比較結果。
        <strong>當前編輯器設定會自動暫存並在比較結束後還原</strong>。
      </span>
    </div>

    <div v-if="!availableTemplates || availableTemplates.length < 2"
         class="sim-compare-need-templates">
      <div class="sim-compare-empty-icon">📭</div>
      <div>
        比較模式需要至少 <strong>2 個範本</strong>(目前 {{ (availableTemplates || []).length }} 個)。
        <br>
        請先到
        <a href="#" @click.prevent="$emit('navigate', 3)" class="sim-link">⚙️ 設定檔編輯器</a>
        的「💾 範本」按鈕建立範本。
      </div>
    </div>

    <div v-else class="sim-compare-form">
      <!-- 範本 A 選擇 -->
      <div class="sim-compare-side">
        <div class="sim-compare-side-label">範本 A</div>
        <select class="input sim-compare-select" v-model="compareSlugA">
          <option value="">-- 請選 --</option>
          <option v-for="t in availableTemplates" :key="t.slug" :value="t.slug">
            {{ t.name }}
          </option>
        </select>
        <div v-if="compareSlugA" class="sim-compare-side-desc">
          {{ getTemplateDesc(compareSlugA) }}
        </div>
      </div>

      <!-- VS 符號 -->
      <div class="sim-compare-vs">VS</div>

      <!-- 範本 B 選擇 -->
      <div class="sim-compare-side">
        <div class="sim-compare-side-label">範本 B</div>
        <select class="input sim-compare-select" v-model="compareSlugB">
          <option value="">-- 請選 --</option>
          <option v-for="t in availableTemplates" :key="t.slug" :value="t.slug">
            {{ t.name }}
          </option>
        </select>
        <div v-if="compareSlugB" class="sim-compare-side-desc">
          {{ getTemplateDesc(compareSlugB) }}
        </div>
      </div>
    </div>

    <div v-if="availableTemplates && availableTemplates.length >= 2"
         class="sim-compare-refresh-row">
      <button class="sim-refresh-btn" @click="refreshTemplateOptions"
              title="重新讀取範本列表">↻ 重新讀取範本列表</button>
    </div>

    <!-- 同範本提示(觀察隨機性影響)-->
    <div v-if="isSameTemplateCompare" class="sim-same-template-hint">
      🎲 <strong>同範本比較</strong>:B 將自動使用不同 seed(seed +1)。
      用來觀察「相同設定但隨機性不同」會造成多大的差距 — 若差異很大,代表這份設計對 seed 敏感,可能需要更多樣本數。
    </div>
  </div>

  <!-- ── 狀態 / 進度 ── -->
  <div class="sim-status-block" v-if="statusMsg">
    <div class="sim-status-msg" :class="statusClass">{{ statusMsg }}</div>
    <div class="sim-progress-bar" v-if="progress > 0 && progress < 100">
      <div class="sim-progress-fill" :style="{ width: progress + '%' }"></div>
    </div>
    <div class="sim-progress-label" v-if="progress > 0">
      {{ progress.toFixed(1) }}%
      <span v-if="spinsDone > 0">（{{ spinsDone.toLocaleString() }} / {{ spinsTotal.toLocaleString() }} 局）</span>
    </div>
  </div>

  <!-- ── 日誌（可展開） ── -->
  <div class="sim-log-block" v-if="logs.length > 0">
    <div class="sim-log-toggle" @click="showLog = !showLog">
      {{ showLog ? '▲ 收合日誌' : '▼ 展開日誌' }}
      <span class="sim-log-count">{{ logs.length }} 行</span>
    </div>
    <div class="sim-log-body" v-show="showLog" ref="logBody">
      <div v-for="(line, i) in logs" :key="i" class="sim-log-line"
           :class="line.startsWith('[WARN]') ? 'warn' : ''">{{ line }}</div>
    </div>
  </div>

  <!-- ── 模擬歷史記錄(任務 3,可折疊)── -->
  <div class="sim-history-block">
    <button class="sim-history-toggle" @click="showHistory = !showHistory">
      <span>📜 模擬歷史記錄</span>
      <span class="sim-history-count">{{ simHistory.length }} / 10</span>
      <span class="sim-history-caret">{{ showHistory ? '▾' : '▸' }}</span>
    </button>
    <div v-if="showHistory" class="sim-history-body">
      <div v-if="simHistory.length === 0" class="sim-history-empty">
        尚無記錄。每次模擬完成後會自動保存到此(最多 10 筆,超過時最舊的會自動刪除)。
      </div>
      <div v-else>
        <div class="sim-history-actions">
          <span class="sim-history-hint">點 「👁 查看」恢復該次結果到上方顯示區</span>
          <button class="sim-history-clear" @click="clearAllHistory">🗑 清空全部</button>
        </div>
        <!-- 新的在最上面 -->
        <div v-for="h in [...simHistory].reverse()" :key="h.id" class="sim-history-item">
          <div class="sim-history-info">
            <div class="sim-history-row1">
              <span class="sim-history-icon">
                {{ h.kind === 'compare' ? '📊' : (h.source === 'file' ? '📁' : '🧩') }}
              </span>
              <span class="sim-history-name">{{ h.sourceName }}</span>
              <span class="sim-history-time">· {{ formatHistoryTime(h.ts) }}</span>
            </div>
            <div class="sim-history-row2">
              <span v-if="h.kind === 'compare'">
                <span class="sim-history-stat">A RTP: <strong>{{ historyKeyStats(h.A.summary).rtp.toFixed(2) }}%</strong></span>
                <span class="sim-history-stat">B RTP: <strong>{{ historyKeyStats(h.B.summary).rtp.toFixed(2) }}%</strong></span>
              </span>
              <span v-else>
                <span class="sim-history-stat">局數: <strong>{{ historyKeyStats(h.summary).spins.toLocaleString() }}</strong></span>
                <span class="sim-history-stat">RTP: <strong>{{ historyKeyStats(h.summary).rtp.toFixed(2) }}%</strong></span>
                <span class="sim-history-stat">死局: <strong>{{ historyKeyStats(h.summary).dead.toFixed(2) }}%</strong></span>
              </span>
            </div>
          </div>
          <div class="sim-history-buttons">
            <button class="sim-history-btn" @click="restoreFromHistory(h)" title="把此結果顯示在上方">👁 查看</button>
            <button class="sim-history-btn cfg-tpl-delete" @click="removeHistory(h.id)" title="刪除這筆記錄">✕</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── 比較結果並排面板(compare 模式跑完顯示)── -->
  <div class="sim-compare-result" v-if="compareResults && compareResults.A && compareResults.B">
    <div class="sim-compare-result-head">
      <span class="sim-compare-result-icon">📊</span>
      <span class="sim-compare-result-title">比較結果:{{ compareResults.A.name }} vs {{ compareResults.B.name }}</span>
      <button class="sim-screenshot-btn"
              :disabled="isExportingScreenshot"
              @click="exportCompareScreenshot"
              title="把整個比較結果(含並排細節)渲染成 PNG 下載,適合分享給設計團隊或附在文件裡">
        <span v-if="isExportingScreenshot">📸 渲染中…</span>
        <span v-else>📸 截圖匯出 PNG</span>
      </button>
    </div>
    <table class="sim-compare-table">
      <thead>
        <tr>
          <th>指標</th>
          <th class="num">{{ compareResults.A.name }}</th>
          <th class="num">{{ compareResults.B.name }}</th>
          <th class="num">差異</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in compareDiffRows" :key="row.label">
          <td>{{ row.label }}</td>
          <td class="num">{{ row.aDisp }}</td>
          <td class="num">{{ row.bDisp }}</td>
          <td class="num" :class="row.diffCls">
            <span v-if="row.diff !== null">
              {{ row.diff > 0 ? '+' : '' }}{{ row.diff.toFixed(4) }}{{ row.unit || '' }}
              <span class="sim-compare-pct" v-if="row.diffPct !== null">
                ({{ row.diffPct > 0 ? '+' : '' }}{{ row.diffPct.toFixed(2) }}%)
              </span>
            </span>
            <span v-else>—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- ─── 比較模式 B 文件並排細節預覽(可折疊)─── -->
    <button class="sim-preview-toggle sim-compare-preview-toggle"
            @click="showPreview = !showPreview">
      <span>📊 B 文件並排細節預覽</span>
      <span class="sim-preview-caret">{{ showPreview ? '▾' : '▸' }}</span>
    </button>
    <div v-if="showPreview" class="sim-compare-preview-body">

      <!-- 模式 RTP 並排 -->
      <div class="sim-preview-section" v-if="cmpModeRTPRows.length > 0">
        <div class="sim-preview-title">🔀 各模式 RTP 與局數</div>
        <table class="sim-preview-table sim-cmp-table">
          <thead>
            <tr>
              <th rowspan="2">模式</th>
              <th colspan="2" class="cmp-th-a">A · {{ compareResults.A.name }}</th>
              <th colspan="2" class="cmp-th-b">B · {{ compareResults.B.name }}</th>
              <th rowspan="2" class="num">RTP 差異</th>
            </tr>
            <tr>
              <th class="num cmp-th-a">局數</th>
              <th class="num cmp-th-a">RTP%</th>
              <th class="num cmp-th-b">局數</th>
              <th class="num cmp-th-b">RTP%</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in cmpModeRTPRows" :key="m.mode">
              <td><strong>{{ m.mode }}</strong></td>
              <td class="num cmp-cell-a">{{ m.aSpins.toLocaleString() }}</td>
              <td class="num cmp-cell-a">{{ m.aRtp.toFixed(2) }}%</td>
              <td class="num cmp-cell-b">{{ m.bSpins.toLocaleString() }}</td>
              <td class="num cmp-cell-b">{{ m.bRtp.toFixed(2) }}%</td>
              <td class="num" :class="m.cls">
                {{ m.diff > 0 ? '+' : '' }}{{ m.diff.toFixed(2) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 符號頻率並排 Top 10 -->
      <div class="sim-preview-section" v-if="cmpSymbolFreqRows.length > 0">
        <div class="sim-preview-title">
          🎨 符號頻率 Top 10(A + B 合併)
          <span class="sim-symfreq-hint">點符號列可看雙邊 RTP 貢獻細節</span>
        </div>
        <table class="sim-preview-table sim-cmp-table sim-symfreq-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Display</th>
              <th>Type</th>
              <th class="num cmp-th-a">A 計數</th>
              <th class="num cmp-th-a">A RTP%</th>
              <th class="bar-col cmp-th-a">A 分布</th>
              <th class="num cmp-th-b">B 計數</th>
              <th class="num cmp-th-b">B RTP%</th>
              <th class="bar-col cmp-th-b">B 分布</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in cmpSymbolFreqRows" :key="s.id"
                class="sim-symfreq-row"
                :class="{ 'is-selected': selectedSymbolId === s.id }"
                @click="selectSymbol(s.id)"
                :title="'點擊查看 ' + s.id + ' 的 A/B RTP 貢獻對照'">
              <td class="mono">{{ s.id }}</td>
              <td>{{ s.display_name }}</td>
              <td class="mono">{{ s.sym_type }}</td>
              <td class="num cmp-cell-a">{{ s.aCount.toLocaleString() }}</td>
              <td class="num cmp-cell-a">{{ s.aRtp.toFixed(3) }}%</td>
              <td class="bar-col cmp-cell-a">
                <div class="sim-bar-wrap">
                  <div class="sim-bar sim-bar-orange" :style="{ width: s.aBar + '%' }"></div>
                </div>
              </td>
              <td class="num cmp-cell-b">{{ s.bCount.toLocaleString() }}</td>
              <td class="num cmp-cell-b">{{ s.bRtp.toFixed(3) }}%</td>
              <td class="bar-col cmp-cell-b">
                <div class="sim-bar-wrap">
                  <div class="sim-bar" :style="{ width: s.bBar + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- v3.7 / #6:compare 模式選中符號的 A/B 對照 detail panel -->
        <div v-if="selectedSymbolDetail && selectedSymbolDetail.mode === 'compare'"
             class="sim-symbol-detail-panel sim-symbol-detail-panel-compare">
          <div class="sim-symbol-detail-header">
            <span class="sim-symbol-detail-id">{{ selectedSymbolDetail.id }}</span>
            <span class="sim-symbol-detail-name">{{ selectedSymbolDetail.display_name }}</span>
            <span class="sim-symbol-detail-type">{{ selectedSymbolDetail.sym_type }}</span>
            <button class="sim-symbol-detail-close" @click.stop="clearSelectedSymbol()" title="關閉細節">✕</button>
          </div>
          <div class="sim-symbol-detail-compare-wrap">
            <div class="sim-symbol-detail-side sim-symbol-detail-side-a">
              <div class="sim-symbol-detail-side-label">A · 範本</div>
              <template v-if="selectedSymbolDetail.A">
                <div class="sim-symbol-detail-row">
                  <span>RTP 貢獻</span>
                  <strong class="sim-symbol-detail-value-accent">{{ selectedSymbolDetail.A.rtp_contribution_pct.toFixed(4) }}%</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>賠付占比</span>
                  <strong>{{ selectedSymbolDetail.A.payout_share_pct.toFixed(2) }}%</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>總賠付</span>
                  <strong>{{ selectedSymbolDetail.A.payout.toFixed(2) }}</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>每次出現平均</span>
                  <strong>{{ selectedSymbolDetail.A.avg_payout_per_hit.toFixed(4) }}</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>出現次數</span>
                  <strong>{{ selectedSymbolDetail.A.count.toLocaleString() }}</strong>
                </div>
              </template>
              <div v-else class="sim-symbol-detail-empty">— 未出現於 A —</div>
            </div>
            <div class="sim-symbol-detail-side sim-symbol-detail-side-b">
              <div class="sim-symbol-detail-side-label">B · 範本</div>
              <template v-if="selectedSymbolDetail.B">
                <div class="sim-symbol-detail-row">
                  <span>RTP 貢獻</span>
                  <strong class="sim-symbol-detail-value-accent">{{ selectedSymbolDetail.B.rtp_contribution_pct.toFixed(4) }}%</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>賠付占比</span>
                  <strong>{{ selectedSymbolDetail.B.payout_share_pct.toFixed(2) }}%</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>總賠付</span>
                  <strong>{{ selectedSymbolDetail.B.payout.toFixed(2) }}</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>每次出現平均</span>
                  <strong>{{ selectedSymbolDetail.B.avg_payout_per_hit.toFixed(4) }}</strong>
                </div>
                <div class="sim-symbol-detail-row">
                  <span>出現次數</span>
                  <strong>{{ selectedSymbolDetail.B.count.toLocaleString() }}</strong>
                </div>
              </template>
              <div v-else class="sim-symbol-detail-empty">— 未出現於 B —</div>
            </div>
            <!-- Δ 中間欄,A 與 B 都存在才算 -->
            <div v-if="selectedSymbolDetail.A && selectedSymbolDetail.B"
                 class="sim-symbol-detail-side sim-symbol-detail-side-diff">
              <div class="sim-symbol-detail-side-label">Δ</div>
              <div class="sim-symbol-detail-row">
                <span>RTP 貢獻差</span>
                <strong :class="'sim-diff-' + ((selectedSymbolDetail.B.rtp_contribution_pct - selectedSymbolDetail.A.rtp_contribution_pct) > 0.0001 ? 'up' : (selectedSymbolDetail.B.rtp_contribution_pct - selectedSymbolDetail.A.rtp_contribution_pct) < -0.0001 ? 'down' : 'eq')">
                  {{ (selectedSymbolDetail.B.rtp_contribution_pct - selectedSymbolDetail.A.rtp_contribution_pct >= 0 ? '+' : '') + (selectedSymbolDetail.B.rtp_contribution_pct - selectedSymbolDetail.A.rtp_contribution_pct).toFixed(4) }}%
                </strong>
              </div>
              <div class="sim-symbol-detail-row">
                <span>賠付占比差</span>
                <strong :class="'sim-diff-' + ((selectedSymbolDetail.B.payout_share_pct - selectedSymbolDetail.A.payout_share_pct) > 0.01 ? 'up' : (selectedSymbolDetail.B.payout_share_pct - selectedSymbolDetail.A.payout_share_pct) < -0.01 ? 'down' : 'eq')">
                  {{ (selectedSymbolDetail.B.payout_share_pct - selectedSymbolDetail.A.payout_share_pct >= 0 ? '+' : '') + (selectedSymbolDetail.B.payout_share_pct - selectedSymbolDetail.A.payout_share_pct).toFixed(2) }}%
                </strong>
              </div>
              <div class="sim-symbol-detail-row">
                <span>每次出現差</span>
                <strong>
                  {{ (selectedSymbolDetail.B.avg_payout_per_hit - selectedSymbolDetail.A.avg_payout_per_hit >= 0 ? '+' : '') + (selectedSymbolDetail.B.avg_payout_per_hit - selectedSymbolDetail.A.avg_payout_per_hit).toFixed(4) }}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 連爆分布並排 -->
      <div class="sim-preview-section" v-if="cmpComboHistRows.length > 0">
        <div class="sim-preview-title">💥 連爆次數分布</div>
        <table class="sim-preview-table sim-cmp-table sim-preview-table-compact">
          <thead>
            <tr>
              <th class="num">連爆</th>
              <th class="num cmp-th-a">A 局數</th>
              <th class="num cmp-th-a">A 佔比</th>
              <th class="num cmp-th-b">B 局數</th>
              <th class="num cmp-th-b">B 佔比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in cmpComboHistRows" :key="c.steps">
              <td class="num"><strong>{{ c.steps }}</strong> 爆</td>
              <td class="num cmp-cell-a">{{ c.aCount.toLocaleString() }}</td>
              <td class="num cmp-cell-a">{{ c.aPct.toFixed(2) }}%</td>
              <td class="num cmp-cell-b">{{ c.bCount.toLocaleString() }}</td>
              <td class="num cmp-cell-b">{{ c.bPct.toFixed(2) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 大獎 -->
      <div class="sim-preview-section" v-if="cmpBigWinRows.length > 0">
        <div class="sim-preview-title">🏆 大獎觸發次數</div>
        <table class="sim-preview-table sim-cmp-table sim-preview-table-compact">
          <thead>
            <tr>
              <th>門檻</th>
              <th class="num cmp-th-a">A 次數</th>
              <th class="num cmp-th-a">A 機率</th>
              <th class="num cmp-th-b">B 次數</th>
              <th class="num cmp-th-b">B 機率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in cmpBigWinRows" :key="b.threshold">
              <td class="mono">{{ b.threshold }}</td>
              <td class="num cmp-cell-a">{{ b.aCount.toLocaleString() }}</td>
              <td class="num cmp-cell-a">{{ b.aRate.toFixed(4) }}%</td>
              <td class="num cmp-cell-b">{{ b.bCount.toLocaleString() }}</td>
              <td class="num cmp-cell-b">{{ b.bRate.toFixed(4) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 規則執行軌跡(A vs B)-->
      <div class="sim-preview-section" v-if="cmpRuleHitRows.length > 0">
        <div class="sim-preview-title">🧩 規則執行軌跡(A vs B)</div>
        <table class="sim-preview-table sim-cmp-table sim-preview-table-compact sim-trace-table">
          <thead>
            <tr>
              <th>Rule_ID</th>
              <th>類型</th>
              <th>Trigger</th>
              <th class="num cmp-th-a">A 觸發</th>
              <th class="num cmp-th-b">B 觸發</th>
              <th class="num">Δ 觸發</th>
              <th class="num cmp-th-a">A RTP</th>
              <th class="num cmp-th-b">B RTP</th>
              <th class="num">Δ RTP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in cmpRuleHitRows" :key="r.kind + ':' + r.id">
              <td class="mono">
                {{ r.id }}
                <div v-if="r.description" class="sim-trace-desc">{{ r.description }}</div>
              </td>
              <td>{{ r.kind }}</td>
              <td class="mono">{{ r.trigger || '–' }}</td>
              <td class="num cmp-cell-a">{{ r.aCount.toLocaleString() }}</td>
              <td class="num cmp-cell-b">{{ r.bCount.toLocaleString() }}</td>
              <td class="num"
                  :class="r.countDiff > 0 ? 'val-good' : (r.countDiff < 0 ? 'val-bad' : '')">
                {{ r.countDiff > 0 ? '+' : '' }}{{ r.countDiff.toLocaleString() }}
              </td>
              <td class="num cmp-cell-a">{{ r.aRtp.toFixed(2) }}</td>
              <td class="num cmp-cell-b">{{ r.bRtp.toFixed(2) }}</td>
              <td class="num"
                  :class="r.rtpDiff > 0.01 ? 'val-good' : (r.rtpDiff < -0.01 ? 'val-bad' : '')">
                {{ r.rtpDiff > 0 ? '+' : '' }}{{ r.rtpDiff.toFixed(2) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>

  <!-- ── 摘要卡片（單一模擬完成後;比較模式時隱藏)── -->
  <div class="sim-summary-grid" v-if="summaryData && !compareResults">
    <div class="sim-stat-card" v-for="card in summaryCards" :key="card.label">
      <div class="sim-stat-val" :class="card.cls">{{ card.val }}</div>
      <div class="sim-stat-label">{{ card.label }}</div>
    </div>
  </div>

  <!-- ── B 文件詳細預覽(可折疊;單一模擬版本)── -->
  <div class="sim-preview-block" v-if="summaryData && !compareResults">
    <button class="sim-preview-toggle" @click="showPreview = !showPreview">
      <span>📊 B 文件詳細預覽</span>
      <span class="sim-preview-caret">{{ showPreview ? '▾' : '▸' }}</span>
    </button>

    <div v-if="showPreview" class="sim-preview-body">

      <!-- 模式 RTP -->
      <div class="sim-preview-section" v-if="modeRTPRows.length > 0">
        <div class="sim-preview-title">🔀 各模式 RTP 與局數</div>
        <table class="sim-preview-table">
          <thead>
            <tr>
              <th>模式</th>
              <th class="num">局數</th>
              <th class="num">總賠付</th>
              <th class="num">RTP %</th>
              <th class="num">死局</th>
              <th class="bar-col">分布</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in modeRTPRows" :key="m.mode">
              <td><strong>{{ m.mode }}</strong></td>
              <td class="num">{{ m.spins.toLocaleString() }}</td>
              <td class="num">{{ m.payout.toFixed(2) }}</td>
              <td class="num" :class="{ 'val-accent': m.rtp >= 90, 'val-warn': m.rtp < 80 }">
                {{ m.rtp.toFixed(2) }}%
              </td>
              <td class="num">{{ m.dead.toLocaleString() }}</td>
              <td class="bar-col">
                <div class="sim-bar-wrap">
                  <div class="sim-bar" :style="{ width: m.rtpBar + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 符號頻率 Top 10 -->
      <div class="sim-preview-section" v-if="symbolFreqRows.length > 0">
        <div class="sim-preview-title">
          🎨 符號頻率 Top {{ symbolFreqRows.length }}
          <span class="sim-symfreq-hint">點符號列可看 RTP 貢獻細節</span>
        </div>
        <table class="sim-preview-table sim-symfreq-table">
          <thead>
            <tr>
              <th>Symbol_ID</th>
              <th>Display</th>
              <th>Type</th>
              <th class="num">出現次數</th>
              <th class="num">出現%</th>
              <th class="num">RTP 貢獻%</th>
              <th class="num">賠付占比%</th>
              <th class="bar-col">分布</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in symbolFreqRows" :key="s.id"
                class="sim-symfreq-row"
                :class="{ 'is-selected': selectedSymbolId === s.id }"
                @click="selectSymbol(s.id)"
                :title="'點擊查看 ' + s.id + ' 的 RTP 貢獻細節'">
              <td class="mono">{{ s.id }}</td>
              <td>{{ s.display_name }}</td>
              <td class="mono">{{ s.sym_type }}</td>
              <td class="num">{{ s.count.toLocaleString() }}</td>
              <td class="num">{{ s.pct.toFixed(3) }}%</td>
              <td class="num sim-rtp-cell">
                <strong>{{ s.rtp_contribution_pct.toFixed(3) }}%</strong>
                <div class="sim-rtp-mini-bar">
                  <div class="sim-rtp-mini-fill" :style="{ width: s.rtpBar + '%' }"></div>
                </div>
              </td>
              <td class="num">{{ s.payout_share_pct.toFixed(2) }}%</td>
              <td class="bar-col">
                <div class="sim-bar-wrap">
                  <div class="sim-bar sim-bar-orange" :style="{ width: s.bar + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- v3.7 / #6:選中符號的 RTP 貢獻細節 panel -->
        <div v-if="selectedSymbolDetail && selectedSymbolDetail.mode === 'single'"
             class="sim-symbol-detail-panel">
          <div class="sim-symbol-detail-header">
            <span class="sim-symbol-detail-id">{{ selectedSymbolDetail.id }}</span>
            <span class="sim-symbol-detail-name">{{ selectedSymbolDetail.display_name }}</span>
            <span class="sim-symbol-detail-type">{{ selectedSymbolDetail.sym_type }}</span>
            <button class="sim-symbol-detail-close" @click.stop="clearSelectedSymbol()" title="關閉細節">✕</button>
          </div>
          <div class="sim-symbol-detail-grid">
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">RTP 貢獻</div>
              <div class="sim-symbol-detail-value sim-symbol-detail-value-accent">
                {{ selectedSymbolDetail.rtp_contribution_pct.toFixed(4) }}%
              </div>
              <div class="sim-symbol-detail-sub">
                佔全局 RTP {{ selectedSymbolDetail.global_rtp > 0 ? (selectedSymbolDetail.rtp_contribution_pct / selectedSymbolDetail.global_rtp * 100).toFixed(2) : '0.00' }}%
              </div>
            </div>
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">總賠付</div>
              <div class="sim-symbol-detail-value">{{ selectedSymbolDetail.payout.toFixed(2) }}</div>
              <div class="sim-symbol-detail-sub">含 multiplier 後的實質倍率</div>
            </div>
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">賠付占比</div>
              <div class="sim-symbol-detail-value">{{ selectedSymbolDetail.payout_share_pct.toFixed(2) }}%</div>
              <div class="sim-symbol-detail-sub">佔總賠付的比例</div>
            </div>
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">每次出現平均</div>
              <div class="sim-symbol-detail-value">{{ selectedSymbolDetail.avg_payout_per_hit.toFixed(4) }}</div>
              <div class="sim-symbol-detail-sub">payout / count</div>
            </div>
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">出現次數</div>
              <div class="sim-symbol-detail-value">{{ selectedSymbolDetail.count.toLocaleString() }}</div>
              <div class="sim-symbol-detail-sub">每千局 ≈ {{ selectedSymbolDetail.hits_per_1k.toFixed(1) }} 次</div>
            </div>
            <div class="sim-symbol-detail-cell">
              <div class="sim-symbol-detail-label">出現%</div>
              <div class="sim-symbol-detail-value">{{ selectedSymbolDetail.pct.toFixed(3) }}%</div>
              <div class="sim-symbol-detail-sub">佔所有 cell</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 連爆分布 -->
      <div class="sim-preview-section" v-if="comboHistRows.length > 0">
        <div class="sim-preview-title">💥 連爆次數分布</div>
        <table class="sim-preview-table sim-preview-table-compact">
          <thead>
            <tr>
              <th class="num">連爆次數</th>
              <th class="num">局數</th>
              <th class="num">佔比</th>
              <th class="bar-col">分布</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in comboHistRows" :key="c.steps">
              <td class="num"><strong>{{ c.steps }}</strong> 爆</td>
              <td class="num">{{ c.count.toLocaleString() }}</td>
              <td class="num">{{ c.pct.toFixed(2) }}%</td>
              <td class="bar-col">
                <div class="sim-bar-wrap">
                  <div class="sim-bar sim-bar-green" :style="{ width: c.bar + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 大獎 + 死局 雙欄 -->
      <div class="sim-preview-row">
        <div class="sim-preview-section" v-if="bigWinRows.length > 0" style="flex:1;">
          <div class="sim-preview-title">🏆 大獎觸發次數</div>
          <table class="sim-preview-table sim-preview-table-compact">
            <thead>
              <tr><th>門檻</th><th class="num">次數</th><th class="num">機率</th></tr>
            </thead>
            <tbody>
              <tr v-for="b in bigWinRows" :key="b.threshold">
                <td class="mono">{{ b.threshold }}</td>
                <td class="num">{{ b.count.toLocaleString() }}</td>
                <td class="num">{{ b.rate.toFixed(4) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="sim-preview-section" v-if="deadBucketRows.length > 0" style="flex:1;">
          <div class="sim-preview-title">💀 連續死局分布</div>
          <table class="sim-preview-table sim-preview-table-compact">
            <thead>
              <tr><th>連續 ≤</th><th class="num">次數</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in deadBucketRows" :key="d.bucket">
                <td class="mono">{{ d.bucket }}</td>
                <td class="num">{{ d.count.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══ 規則執行軌跡(09_Puzzle + 10_Discard SOFT)═══ -->
      <div class="sim-preview-section sim-trace-section">
        <div class="sim-trace-header">
          <span class="sim-preview-title" style="margin: 0;">🧩 規則執行軌跡</span>
          <div class="sim-trace-summary-pills">
            <span class="sim-trace-pill">
              <span class="sim-trace-pill-label">全部</span>
              <span class="sim-trace-pill-val">{{ ruleTraceSummary.total }}</span>
            </span>
            <span class="sim-trace-pill sim-trace-pill-good" v-if="ruleTraceSummary.triggered > 0">
              <span class="sim-trace-pill-label">已觸發</span>
              <span class="sim-trace-pill-val">{{ ruleTraceSummary.triggered }}</span>
            </span>
            <span class="sim-trace-pill sim-trace-pill-warn" v-if="ruleTraceSummary.untriggered > 0"
                  :title="ruleTraceSummary.untriggered + ' 條規則整輪模擬都沒觸發,可能是 dead code'">
              <span class="sim-trace-pill-label">未觸發</span>
              <span class="sim-trace-pill-val">{{ ruleTraceSummary.untriggered }}</span>
            </span>
            <span class="sim-trace-pill sim-trace-pill-accent" v-if="ruleTraceSummary.withRtp > 0">
              <span class="sim-trace-pill-label">有 RTP</span>
              <span class="sim-trace-pill-val">{{ ruleTraceSummary.withRtp }}</span>
            </span>
          </div>
        </div>

        <!-- 篩選 + 排序工具列 -->
        <div class="sim-trace-toolbar">
          <span class="sim-trace-toolbar-label">篩選</span>
          <button class="sim-trace-chip" :class="{ active: ruleTraceFilter === 'all' }"
                  @click="ruleTraceFilter = 'all'">全部</button>
          <button class="sim-trace-chip" :class="{ active: ruleTraceFilter === 'triggered' }"
                  @click="ruleTraceFilter = 'triggered'">已觸發</button>
          <button class="sim-trace-chip sim-trace-chip-warn"
                  :class="{ active: ruleTraceFilter === 'untriggered' }"
                  @click="ruleTraceFilter = 'untriggered'"
                  title="從未被觸發的規則 — 可能是 dead code 或條件太嚴">未觸發</button>
          <button class="sim-trace-chip" :class="{ active: ruleTraceFilter === 'with_rtp' }"
                  @click="ruleTraceFilter = 'with_rtp'">有 RTP 貢獻</button>
          <span class="sim-trace-toolbar-spacer"></span>
          <span class="sim-trace-toolbar-label">排序</span>
          <button class="sim-trace-chip" :class="{ active: ruleTraceSort === 'count' }"
                  @click="ruleTraceSort = 'count'">觸發次數</button>
          <button class="sim-trace-chip" :class="{ active: ruleTraceSort === 'rtp' }"
                  @click="ruleTraceSort = 'rtp'">RTP 貢獻</button>
          <button class="sim-trace-chip" :class="{ active: ruleTraceSort === 'priority' }"
                  @click="ruleTraceSort = 'priority'">Priority</button>
          <button class="sim-trace-chip" :class="{ active: ruleTraceSort === 'id' }"
                  @click="ruleTraceSort = 'id'">ID</button>
        </div>

        <div v-if="ruleTraceRows.length === 0" class="sim-trace-empty">
          <span v-if="ruleTraceFilter === 'untriggered'">✓ 沒有未觸發的規則 — 所有規則至少都跑到一次</span>
          <span v-else>沒有規則執行記錄(可能尚未匯入規則或所有規則停用)</span>
        </div>

        <table v-else class="sim-preview-table sim-trace-table">
          <thead>
            <tr>
              <th>規則</th>
              <th>類別</th>
              <th>Trigger</th>
              <th class="num">Priority</th>
              <th class="num">觸發次數</th>
              <th class="num">RTP 貢獻</th>
              <th class="num">% RTP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ruleTraceRows" :key="r.kind + ':' + r.id"
                :class="{
                  'sim-trace-row-dead': r.isDeadCode,
                  'sim-trace-row-disabled': !r.enabled,
                }">
              <td class="mono">
                {{ r.id }}
                <span v-if="!r.enabled" class="sim-trace-flag sim-trace-flag-disabled" title="此規則已停用">⊘</span>
                <span v-if="r.isDeadCode && r.kind === 'Puzzle'" class="sim-trace-flag sim-trace-flag-dead"
                      title="本次模擬完全沒觸發 — 可能是 dead code">·</span>
                <div v-if="r.description" class="sim-trace-desc">{{ r.description }}</div>
                <div v-if="r.actionTypes.length > 0" class="sim-trace-acts">
                  <code v-for="a in r.actionTypes" :key="a" class="sim-trace-act">{{ a }}</code>
                </div>
              </td>
              <td>{{ r.kind }}</td>
              <td class="mono">{{ r.trigger || '–' }}</td>
              <td class="num">{{ r.priority < 999 ? r.priority : '–' }}</td>
              <td class="num">{{ r.count.toLocaleString() }}</td>
              <td class="num">{{ r.rtp.toFixed(2) }}</td>
              <td class="num">
                <span v-if="Math.abs(r.rtp) > 0.0001"
                      :class="r.rtp >= 0 ? 'val-good' : 'val-bad'">
                  {{ (r.rtpPct >= 0 ? '+' : '') }}{{ r.rtpPct.toFixed(2) }}%
                </span>
                <span v-else style="color: var(--text-muted);">–</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="sim-trace-hint" v-if="ruleTraceSummary.untriggered > 0 && ruleTraceFilter !== 'untriggered'">
          💡 有 {{ ruleTraceSummary.untriggered }} 條規則本次沒被觸發。
          <a href="#" @click.prevent="ruleTraceFilter = 'untriggered'">點此檢視</a> — 可能要調整條件或檢查 trigger 是否選對。
        </div>
      </div>

      <div class="sim-preview-hint">
        以上為 B 文件主要統計;完整內容(含 A 參數回填、原始序列等)請按 ⬇ 下載完整 B_結果.xlsx 取得。
      </div>
    </div>
  </div>

  <!-- ── 按鈕列 ── -->
  <div class="sim-btn-row">
    <button class="btn btn-primary big" @click="runSim"
            :disabled="!canRun || isRunning || !pyReady">
      <span v-if="isRunning">模擬中…</span>
      <span v-else-if="!pyReady">Pyodide 載入中…</span>
      <span v-else>▶ 開始模擬</span>
    </button>
    <button class="btn" @click="downloadResult"
            :disabled="!resultBytes" style="margin-left:10px;">
      ⬇ 下載 B_結果.xlsx
    </button>
  </div>

  <!-- ── Pyodide 載入指示 ── -->
  <div class="sim-pyodide-notice" v-if="!pyReady">
    <span class="dot-pulse"></span> Pyodide 初始化中（約 10–30 秒，僅首次）
  </div>

</div>
    `,

    setup() {
      // v4.0:theme_v37.css 已合併到 css/modules/sim-page.css,
      //       由 theme_additions.css @import 載入,不再需要 lazy-load

      const xlsxFile    = ref(null);
      const isDragging  = ref(false);
      const isRunning   = ref(false);
      const pyReady     = ref(false);
      const statusMsg   = ref('');
      const statusClass = ref('');
      const progress    = ref(0);
      const spinsDone   = ref(0);
      const spinsTotal  = ref(0);
      const logs        = ref([]);
      const showLog     = ref(false);
      const summaryData = ref(null);
      const resultBytes = ref(null);
      const logBody     = ref(null);

      // 訂閱 module-level workerService(任務:Pyodide worker lift up)
      let unsubscribeWorker = null;

      // ── 摘要卡片 ──
      const summaryCards = computed(() => {
        if (!summaryData.value) return [];
        const s = summaryData.value;
        const valid = s.valid_spins || 1;
        return [
          { label: '有效局數',  val: (s.valid_spins || 0).toLocaleString(), cls: '' },
          { label: '理論 RTP',  val: (s.rtp_pct || 0).toFixed(4) + '%', cls: 'val-accent' },
          { label: '死局率',    val: (s.dead_rate_pct || 0).toFixed(2) + '%', cls: 'val-warn' },
          { label: '中位數賠付',val: (s.median_payout || 0).toFixed(4), cls: '' },
          { label: 'HARD 棄牌', val: (s.hard_discards || 0).toLocaleString(), cls: '' },
          { label: 'SOFT 棄牌', val: (s.soft_discards || 0).toLocaleString(), cls: '' },
        ];
      });

      // ── B 文件詳細預覽(任務 2)──
      const showPreview = ref(false);

      // 模式 RTP / 局數 / 死局
      const modeRTPRows = computed(() => {
        if (!summaryData.value) return [];
        const s = summaryData.value;
        const rtps = s.mode_rtp || {};
        const spins = s.mode_spins || {};
        const payout = s.mode_payout || {};
        const dead = s.mode_dead || {};
        const allModes = new Set([...Object.keys(rtps), ...Object.keys(spins)]);
        const rows = [];
        let maxRTP = 0;
        for (const m of allModes) {
          const rtp = rtps[m] || 0;
          if (rtp > maxRTP) maxRTP = rtp;
          rows.push({
            mode: m,
            spins: spins[m] || 0,
            payout: payout[m] || 0,
            rtp,
            dead: dead[m] || 0,
          });
        }
        // 補 bar 寬度
        return rows
          .sort((a, b) => b.spins - a.spins)
          .map(r => ({ ...r, rtpBar: maxRTP > 0 ? Math.min(100, r.rtp / maxRTP * 100) : 0 }));
      });

      // 符號頻率 Top 10
      const symbolFreqRows = computed(() => {
        if (!summaryData.value || !summaryData.value.symbol_freq) return [];
        const freq = summaryData.value.symbol_freq;
        const arr = Object.entries(freq)
          .map(([id, info]) => ({
            id,
            display_name: info.display_name || id,
            sym_type: info.sym_type || '',
            count: info.count || 0,
            pct: info.pct || 0,
            // v3.7 / #6:per-symbol RTP 貢獻欄位(後端 collector.py summary 新加)
            payout:                Number(info.payout) || 0,
            rtp_contribution_pct:  Number(info.rtp_contribution_pct) || 0,
            payout_share_pct:      Number(info.payout_share_pct) || 0,
            avg_payout_per_hit:    Number(info.avg_payout_per_hit) || 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        const max = arr.length > 0 ? arr[0].count : 1;
        // v3.7:多算一條 RTP 貢獻 bar 的 scale(用 abs 處理罕見負值)
        const maxRtp = Math.max(...arr.map(s => Math.abs(s.rtp_contribution_pct)), 0.0001);
        return arr.map(s => ({
          ...s,
          bar: max > 0 ? (s.count / max * 100) : 0,
          rtpBar: maxRtp > 0 ? Math.min(100, Math.abs(s.rtp_contribution_pct) / maxRtp * 100) : 0,
        }));
      });

      // v3.7 / #6:選中的符號(顯示 detail panel),id 形式;不存在時 = null
      const selectedSymbolId = ref(null);
      function selectSymbol(id) {
        // 點同一個 → 取消;點別的 → 切換
        if (selectedSymbolId.value === id) selectedSymbolId.value = null;
        else selectedSymbolId.value = id;
      }
      function clearSelectedSymbol() { selectedSymbolId.value = null; }
      // 取選中符號的 detail(從目前的 summary / compare A / compare B 動態解析)
      const selectedSymbolDetail = computed(() => {
        const id = selectedSymbolId.value;
        if (!id) return null;
        // 三種來源優先順序:single summary → compare(各取 A / B)
        if (summaryData.value && summaryData.value.symbol_freq && summaryData.value.symbol_freq[id]) {
          const info = summaryData.value.symbol_freq[id];
          const validSpins = summaryData.value.valid_spins || 0;
          return {
            mode: 'single',
            id,
            display_name: info.display_name || id,
            sym_type: info.sym_type || '',
            count: Number(info.count) || 0,
            pct: Number(info.pct) || 0,
            payout: Number(info.payout) || 0,
            rtp_contribution_pct: Number(info.rtp_contribution_pct) || 0,
            payout_share_pct: Number(info.payout_share_pct) || 0,
            avg_payout_per_hit: Number(info.avg_payout_per_hit) || 0,
            global_rtp: Number(summaryData.value.rtp_pct) || 0,
            valid_spins: validSpins,
            hits_per_1k: validSpins > 0 ? (Number(info.count) || 0) / validSpins * 1000 : 0,
          };
        }
        // compare:回傳 A + B 雙份
        if (compareResults.value) {
          const A = compareResults.value.A && compareResults.value.A.summary;
          const B = compareResults.value.B && compareResults.value.B.summary;
          const aInfo = A && A.symbol_freq && A.symbol_freq[id];
          const bInfo = B && B.symbol_freq && B.symbol_freq[id];
          if (aInfo || bInfo) {
            const mkSide = (info, summary) => info ? {
              count: Number(info.count) || 0,
              pct: Number(info.pct) || 0,
              payout: Number(info.payout) || 0,
              rtp_contribution_pct: Number(info.rtp_contribution_pct) || 0,
              payout_share_pct: Number(info.payout_share_pct) || 0,
              avg_payout_per_hit: Number(info.avg_payout_per_hit) || 0,
              global_rtp: Number(summary && summary.rtp_pct) || 0,
              valid_spins: Number(summary && summary.valid_spins) || 0,
            } : null;
            return {
              mode: 'compare',
              id,
              display_name: (aInfo && aInfo.display_name) || (bInfo && bInfo.display_name) || id,
              sym_type:     (aInfo && aInfo.sym_type)     || (bInfo && bInfo.sym_type)     || '',
              A: mkSide(aInfo, A),
              B: mkSide(bInfo, B),
            };
          }
        }
        return null;
      });

      // 連爆次數分布
      const comboHistRows = computed(() => {
        if (!summaryData.value || !summaryData.value.combo_hist) return [];
        const hist = summaryData.value.combo_hist;
        const total = Object.values(hist).reduce((s, v) => s + v, 0) || 1;
        const arr = Object.entries(hist)
          .map(([steps, count]) => ({ steps: parseInt(steps), count: Number(count) }))
          .sort((a, b) => a.steps - b.steps);
        const max = Math.max(...arr.map(x => x.count), 1);
        return arr.map(c => ({
          ...c,
          pct: c.count / total * 100,
          bar: c.count / max * 100,
        }));
      });

      // 大獎統計
      const bigWinRows = computed(() => {
        if (!summaryData.value || !summaryData.value.big_win_counts) return [];
        const counts = summaryData.value.big_win_counts;
        const valid = summaryData.value.valid_spins || 1;
        return Object.entries(counts).map(([threshold, count]) => ({
          threshold,
          count: Number(count),
          rate: Number(count) / valid * 100,
        }));
      });

      // 連續死局分布
      const deadBucketRows = computed(() => {
        if (!summaryData.value || !summaryData.value.dead_bucket_counts) return [];
        const counts = summaryData.value.dead_bucket_counts;
        return Object.entries(counts)
          .map(([bucket, count]) => ({ bucket, count: Number(count) }))
          .filter(d => d.count > 0);
      });

      // 規則執行軌跡(09 + 10 合併)
      //   單局 Mode 用:結合 trigger_count / rtp_contribution / metadata
      //   提供額外篩選欄位(僅未觸發、僅 RTP 有貢獻)
      const ruleTraceFilter = ref('all');  // 'all' | 'triggered' | 'untriggered' | 'with_rtp'
      const ruleTraceSort   = ref('count'); // 'count' | 'rtp' | 'priority' | 'id'

      const ruleTraceRows = computed(() => {
        if (!summaryData.value) return [];
        const s = summaryData.value;
        const triggerCounts = s.rule_trigger_counts || {};
        const rtpContribs   = s.rule_rtp_contributions || {};
        const meta          = s.rule_meta || {};
        const discardHits   = s.soft_rule_hits || {};
        const totalPayout   = Number(s.total_payout) || 0;

        const rows = [];
        // 1) 09_Puzzle_Rules — 包含未觸發的(從 rule_meta 拿全部 id)
        const allPuzzleIds = new Set([
          ...Object.keys(triggerCounts),
          ...Object.keys(rtpContribs),
          ...Object.keys(meta),
        ]);
        for (const id of allPuzzleIds) {
          const count = Number(triggerCounts[id]) || 0;
          const rtp   = Number(rtpContribs[id]) || 0;
          const m     = meta[id] || {};
          rows.push({
            id,
            kind: 'Puzzle',
            count,
            rtp,
            rtpPct: totalPayout > 0 ? (rtp / totalPayout * 100) : 0,
            trigger: m.trigger || '',
            priority: m.priority != null ? Number(m.priority) : 999,
            enabled: m.enabled !== false,
            description: m.description || '',
            actionTypes: m.action_types || [],
            isDeadCode: count === 0,
          });
        }
        // 2) 10_Discard_Rules SOFT(後端目前沒給 metadata)
        for (const [id, c] of Object.entries(discardHits)) {
          if (Number(c) <= 0) continue;
          rows.push({
            id,
            kind: 'Discard SOFT',
            count: Number(c),
            rtp: 0, rtpPct: 0,
            trigger: '', priority: 999, enabled: true,
            description: '', actionTypes: [],
            isDeadCode: false,
          });
        }

        // 篩選
        let filtered = rows;
        const f = ruleTraceFilter.value;
        if (f === 'triggered')      filtered = rows.filter(r => r.count > 0);
        else if (f === 'untriggered') filtered = rows.filter(r => r.count === 0 && r.kind === 'Puzzle');
        else if (f === 'with_rtp')    filtered = rows.filter(r => Math.abs(r.rtp) > 0.0001);

        // 排序
        const sortKey = ruleTraceSort.value;
        if (sortKey === 'count')         filtered.sort((a, b) => b.count - a.count || a.priority - b.priority);
        else if (sortKey === 'rtp')      filtered.sort((a, b) => Math.abs(b.rtp) - Math.abs(a.rtp));
        else if (sortKey === 'priority') filtered.sort((a, b) => a.priority - b.priority);
        else if (sortKey === 'id')       filtered.sort((a, b) => a.id.localeCompare(b.id));

        return filtered;
      });

      // 摘要統計:有多少規則未觸發 / 有 RTP 貢獻
      const ruleTraceSummary = computed(() => {
        const rows = ruleTraceRows.value;
        const all  = rows.filter(r => r.kind === 'Puzzle');
        return {
          total:        all.length,
          triggered:    all.filter(r => r.count > 0).length,
          untriggered:  all.filter(r => r.count === 0).length,
          withRtp:      all.filter(r => Math.abs(r.rtp) > 0.0001).length,
        };
      });

      // 舊 ruleHitRows API 留著向後相容(現用 trace 取代,但模板中可能還有 reference)
      const ruleHitRows = ruleTraceRows;

      // ── 比較模式專用 computed(任務 1)──
      // 把 A 和 B 兩份 summary 合併為「並排比較行」
      function _cmpHave() {
        const r = compareResults.value;
        return r && r.A && r.B;
      }
      // 模式 RTP:聯集所有模式,顯示 A 和 B 的局數/RTP
      const cmpModeRTPRows = computed(() => {
        if (!_cmpHave()) return [];
        const A = compareResults.value.A.summary;
        const B = compareResults.value.B.summary;
        const aMode = A.mode_spins || {};
        const bMode = B.mode_spins || {};
        const aRtp = A.mode_rtp || {};
        const bRtp = B.mode_rtp || {};
        const allModes = new Set([...Object.keys(aMode), ...Object.keys(bMode),
                                   ...Object.keys(aRtp), ...Object.keys(bRtp)]);
        return [...allModes].map(m => {
          const aRtpV = Number(aRtp[m]) || 0;
          const bRtpV = Number(bRtp[m]) || 0;
          const diff = bRtpV - aRtpV;
          let cls = '';
          if (diff > 0.0001) cls = 'val-good';
          else if (diff < -0.0001) cls = 'val-bad';
          return {
            mode: m,
            aSpins: Number(aMode[m]) || 0,
            bSpins: Number(bMode[m]) || 0,
            aRtp:   aRtpV,
            bRtp:   bRtpV,
            diff:   diff,
            cls:    cls,
          };
        }).sort((a, b) => Math.max(b.aSpins, b.bSpins) - Math.max(a.aSpins, a.bSpins));
      });
      // 符號頻率:取 A 的 Top 10,顯示這些符號在 A 和 B 的計數
      const cmpSymbolFreqRows = computed(() => {
        if (!_cmpHave()) return [];
        const A = compareResults.value.A.summary;
        const B = compareResults.value.B.summary;
        const aFreq = A.symbol_freq || {};
        const bFreq = B.symbol_freq || {};
        // 用 A 和 B 計數合併取 Top 10
        const all = {};
        const blank = () => ({ aCount: 0, bCount: 0, aRtp: 0, bRtp: 0, aShare: 0, bShare: 0 });
        for (const [id, info] of Object.entries(aFreq)) {
          all[id] = all[id] || Object.assign({ id, display_name: info.display_name || id, sym_type: info.sym_type || '' }, blank());
          all[id].aCount = Number(info.count) || 0;
          // v3.7 / #6:帶 RTP 貢獻 + 賠付占比進 compare row
          all[id].aRtp   = Number(info.rtp_contribution_pct) || 0;
          all[id].aShare = Number(info.payout_share_pct) || 0;
        }
        for (const [id, info] of Object.entries(bFreq)) {
          all[id] = all[id] || Object.assign({ id, display_name: info.display_name || id, sym_type: info.sym_type || '' }, blank());
          all[id].bCount = Number(info.count) || 0;
          all[id].bRtp   = Number(info.rtp_contribution_pct) || 0;
          all[id].bShare = Number(info.payout_share_pct) || 0;
        }
        const arr = Object.values(all)
          .sort((a, b) => (b.aCount + b.bCount) - (a.aCount + a.bCount))
          .slice(0, 10);
        const maxA = Math.max(...arr.map(x => x.aCount), 1);
        const maxB = Math.max(...arr.map(x => x.bCount), 1);
        return arr.map(s => ({
          ...s,
          aBar: s.aCount / maxA * 100,
          bBar: s.bCount / maxB * 100,
        }));
      });
      // 連爆分布:聯集所有 step
      const cmpComboHistRows = computed(() => {
        if (!_cmpHave()) return [];
        const aHist = compareResults.value.A.summary.combo_hist || {};
        const bHist = compareResults.value.B.summary.combo_hist || {};
        const allSteps = new Set([...Object.keys(aHist), ...Object.keys(bHist)]);
        const aTotal = Object.values(aHist).reduce((s, v) => s + Number(v), 0) || 1;
        const bTotal = Object.values(bHist).reduce((s, v) => s + Number(v), 0) || 1;
        return [...allSteps]
          .map(s => parseInt(s))
          .sort((a, b) => a - b)
          .map(step => {
            const aC = Number(aHist[step]) || 0;
            const bC = Number(bHist[step]) || 0;
            return {
              steps: step,
              aCount: aC,
              bCount: bC,
              aPct: aC / aTotal * 100,
              bPct: bC / bTotal * 100,
            };
          });
      });
      // 大獎觸發:聯集所有 threshold
      const cmpBigWinRows = computed(() => {
        if (!_cmpHave()) return [];
        const A = compareResults.value.A.summary;
        const B = compareResults.value.B.summary;
        const aWins = A.big_win_counts || {};
        const bWins = B.big_win_counts || {};
        const aValid = Number(A.valid_spins) || 1;
        const bValid = Number(B.valid_spins) || 1;
        const allTh = new Set([...Object.keys(aWins), ...Object.keys(bWins)]);
        return [...allTh].map(th => {
          const aC = Number(aWins[th]) || 0;
          const bC = Number(bWins[th]) || 0;
          return {
            threshold: th,
            aCount: aC,
            bCount: bC,
            aRate: aC / aValid * 100,
            bRate: bC / bValid * 100,
          };
        });
      });
      // 規則觸發:聯集所有 rule id
      const cmpRuleHitRows = computed(() => {
        if (!_cmpHave()) return [];
        const A = compareResults.value.A.summary;
        const B = compareResults.value.B.summary;
        const aPuzzle = A.rule_trigger_counts || {};
        const bPuzzle = B.rule_trigger_counts || {};
        const aDiscard = A.soft_rule_hits || {};
        const bDiscard = B.soft_rule_hits || {};
        const aRtp = A.rule_rtp_contributions || {};
        const bRtp = B.rule_rtp_contributions || {};
        const aMeta = A.rule_meta || {};
        const bMeta = B.rule_meta || {};
        const rows = {};
        function add(map, kind, side) {
          for (const [id, count] of Object.entries(map)) {
            const key = `${kind}:${id}`;
            rows[key] = rows[key] || {
              id, kind, aCount: 0, bCount: 0,
              aRtp: 0, bRtp: 0,
              trigger: '', description: '',
            };
            rows[key][side] = Number(count) || 0;
          }
        }
        add(aPuzzle,  'Puzzle',       'aCount');
        add(bPuzzle,  'Puzzle',       'bCount');
        add(aDiscard, 'Discard SOFT', 'aCount');
        add(bDiscard, 'Discard SOFT', 'bCount');
        // 帶入 RTP + metadata(以 B 為準,若 B 沒有 fallback 到 A)
        for (const key of Object.keys(rows)) {
          const r = rows[key];
          if (r.kind === 'Puzzle') {
            r.aRtp = Number(aRtp[r.id]) || 0;
            r.bRtp = Number(bRtp[r.id]) || 0;
            const m = bMeta[r.id] || aMeta[r.id] || {};
            r.trigger = m.trigger || '';
            r.description = m.description || '';
          }
          r.countDiff = r.bCount - r.aCount;
          r.rtpDiff = r.bRtp - r.aRtp;
        }
        return Object.values(rows)
          .filter(r => r.aCount > 0 || r.bCount > 0)
          .sort((a, b) => Math.abs(b.countDiff) - Math.abs(a.countDiff))
          .slice(0, 30);
      });

      // ── 建立 Worker ──
      function attachWorkerHandlers() {
        // 1) 取消舊訂閱(避免重複註冊;熱重載或 unmount/remount 場景)
        if (unsubscribeWorker) {
          unsubscribeWorker();
          unsubscribeWorker = null;
        }

        // 2) 同步當前 Pyodide 狀態(可能 worker 早已 ready,訂閱前的狀態靠這同步)
        if (SP.workerService.isPyReady()) {
          pyReady.value = true;
          statusMsg.value = 'Pyodide 就緒,可以開始模擬';
          statusClass.value = 'ok';
        } else {
          statusMsg.value = 'Pyodide 載入中…';
          statusClass.value = 'info';
        }

        // 3) 訂閱 worker 事件
        unsubscribeWorker = SP.workerService.subscribe((data) => {
          const { type, msg, xlsxBytes, summary } = data;
          if (type === 'ready') {
            pyReady.value = true;
            statusMsg.value = 'Pyodide 就緒,可以開始模擬';
            statusClass.value = 'ok';
          } else if (type === 'status') {
            // 只在本 component 正在使用 worker 時才顯示 status
            // (避免別人的 status 干擾這頁的 idle 顯示)
            if (isRunning.value) {
              statusMsg.value = msg;
              statusClass.value = 'info';
            }
          } else if (type === 'log') {
            if (!isRunning.value) return; // 只有本 component 觸發的 run 才接收 log
            if (msg.startsWith('PROGRESS:')) {
              const parts = msg.split(':');
              progress.value   = parseFloat(parts[1]);
              spinsDone.value  = parseInt(parts[2]) || 0;
              spinsTotal.value = parseInt(parts[3]) || 0;
            } else {
              logs.value.push(msg);
              Vue.nextTick(() => {
                if (logBody.value) logBody.value.scrollTop = logBody.value.scrollHeight;
              });
            }
          } else if (type === 'done') {
            if (!isRunning.value) return; // 不是本 component 觸發的 → 跳過
            isRunning.value  = false;
            progress.value   = 100;
            resultBytes.value = xlsxBytes;
            const parsedSummary = _pyMapToObj(summary);
            summaryData.value = parsedSummary;
            statusMsg.value  = '✅ 模擬完成!可下載結果';
            statusClass.value = 'ok';
            // 任務 3:single 模式才在 done 立即 push history(compare 模式由 runSim 收尾統一 push)
            if (!_compareInProgress) {
              pushHistory({
                kind: 'single',
                source: source.value,
                sourceName: _lastSourceName || '(未知來源)',
                summary: parsedSummary,
              });
            }
            if (currentRunResolver) {
              const r = currentRunResolver;
              currentRunResolver = null; currentRunRejecter = null;
              r({ xlsxBytes, summary: parsedSummary });
            }
          } else if (type === 'error') {
            if (!isRunning.value) return; // 同上
            isRunning.value  = false;
            statusMsg.value  = '❌ 錯誤:' + msg;
            statusClass.value = 'err';
            if (currentRunRejecter) {
              const r = currentRunRejecter;
              currentRunResolver = null; currentRunRejecter = null;
              r(new Error(msg));
            }
          }
        });

        // 4) 觸發 ensureWorker(若 app.js 已預熱則此為 no-op)
        try {
          SP.workerService.ensureWorker();
        } catch (e) {
          statusMsg.value = '❌ Worker 初始化失敗:' + e.message;
          statusClass.value = 'err';
        }
      }

      function _pyMapToObj(v) {
        if (!v) return {};
        try {
          if (typeof v.toJs === 'function') return v.toJs({ dict_converter: Object.fromEntries });
          return v;
        } catch(e) { return {}; }
      }

      // ── 檔案操作 ──
      function onFilePick(e) {
        const f = e.target.files[0];
        if (f) xlsxFile.value = f;
      }
      function onDrop(e) {
        isDragging.value = false;
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xlsm'))) {
          xlsxFile.value = f;
        }
      }

      // ── 設定來源(editor / file / compare)──
      // 預設 editor;若編輯器尚無資料,也維持 editor(顯示提示)
      const source = ref('editor');
      const editorSummary = ref(null);

      // ── 比較模式(任務 4)──
      const availableTemplates = ref([]);
      const compareSlugA = ref('');
      const compareSlugB = ref('');
      const compareResults = ref(null);  // { A: {name, summary}, B: {name, summary} } | null
      // Promise resolver/rejecter:讓 worker done/error 訊息可以解開 await
      let currentRunResolver = null;
      let currentRunRejecter = null;
      // 任務 3 旗標:單獨記錄 single 模式 / 比較模式中(避免歷史重複記錄)
      let _compareInProgress = false;
      let _lastSourceName = '';
      function tplApi() { return (window.SlotPlanner && window.SlotPlanner.Templates) || null; }
      function refreshTemplateOptions() {
        const api = tplApi();
        availableTemplates.value = api ? api.list() : [];
      }
      function getTemplateDesc(slug) {
        const t = availableTemplates.value.find(x => x.slug === slug);
        if (!t) return '';
        const parts = [];
        if (t.description) parts.push(t.description);
        parts.push(`模式 ${t.counts.modes} · 規則 ${t.counts.rules} · 棄牌 ${t.counts.discards} · 符號 ${t.counts.symbols}`);
        return parts.join(' · ');
      }

      // 比較結果的指標清單(用 computed)
      const compareDiffRows = computed(() => {
        if (!compareResults.value || !compareResults.value.A || !compareResults.value.B) return [];
        const A = compareResults.value.A.summary;
        const B = compareResults.value.B.summary;
        const rows = [];
        function addRow(label, aVal, bVal, unit, fmt, betterDir) {
          const a = Number(aVal) || 0;
          const b = Number(bVal) || 0;
          const diff = b - a;
          const diffPct = a !== 0 ? (diff / Math.abs(a) * 100) : null;
          let diffCls = '';
          if (diff > 0.0001 && betterDir === 'high') diffCls = 'val-good';
          else if (diff > 0.0001 && betterDir === 'low') diffCls = 'val-bad';
          else if (diff < -0.0001 && betterDir === 'high') diffCls = 'val-bad';
          else if (diff < -0.0001 && betterDir === 'low') diffCls = 'val-good';
          rows.push({
            label,
            aDisp: fmt ? fmt(a) : a.toLocaleString(),
            bDisp: fmt ? fmt(b) : b.toLocaleString(),
            diff,
            diffPct,
            diffCls,
            unit: unit || '',
          });
        }
        const pct = v => v.toFixed(4) + '%';
        const num4 = v => v.toFixed(4);
        addRow('理論 RTP',  A.rtp_pct,        B.rtp_pct,        '%',  pct,  'high');
        addRow('有效局數',  A.valid_spins,    B.valid_spins,    '',   null, null);
        addRow('死局率',    A.dead_rate_pct,  B.dead_rate_pct,  '%',  pct,  'low');
        addRow('中位數賠付', A.median_payout, B.median_payout,  '',   num4, 'high');
        addRow('P95 賠付',  A.p95_payout,     B.p95_payout,     '',   num4, 'high');
        addRow('P99 賠付',  A.p99_payout,     B.p99_payout,     '',   num4, 'high');
        addRow('HARD 棄牌', A.hard_discards,  B.hard_discards,  '',   null, 'low');
        addRow('SOFT 棄牌', A.soft_discards,  B.soft_discards,  '',   null, 'low');
        addRow('中位數連爆', A.median_combo,  B.median_combo,   '',   null, 'high');
        return rows;
      });

      // ── 模擬歷史記錄(任務 3)──
      const MAX_HISTORY = 10;
      const LS_HISTORY_KEY = 'slotplanner.sim_history.v1';
      const simHistory = ref([]);
      const showHistory = ref(false);
      // 初次載入
      try {
        const raw = localStorage.getItem(LS_HISTORY_KEY);
        if (raw) simHistory.value = JSON.parse(raw) || [];
      } catch (e) { simHistory.value = []; }

      function _historySave(arr) {
        try {
          const trimmed = arr.slice(-MAX_HISTORY);
          localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(trimmed));
          return trimmed;
        } catch (e) {
          console.warn('[history] save failed', e);
          return arr;
        }
      }
      function pushHistory(entry) {
        entry.id = 'hist_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
        entry.ts = new Date().toISOString();
        simHistory.value = _historySave([...simHistory.value, entry]);
      }
      function removeHistory(id) {
        simHistory.value = _historySave(simHistory.value.filter(h => h.id !== id));
      }
      function clearAllHistory() {
        if (!confirm('確定要清空所有模擬歷史記錄嗎?(只刪 LS 紀錄,不影響當前顯示的結果)')) return;
        simHistory.value = _historySave([]);
      }
      function restoreFromHistory(h) {
        if (h.kind === 'compare') {
          compareResults.value = { A: h.A, B: h.B };
          summaryData.value = null;
          resultBytes.value = null;
          statusMsg.value = `📜 已還原歷史記錄:${h.A.name} vs ${h.B.name}`;
          statusClass.value = 'info';
        } else {
          summaryData.value = h.summary;
          compareResults.value = null;
          resultBytes.value = null;
          statusMsg.value = `📜 已還原歷史記錄:${h.sourceName}`;
          statusClass.value = 'info';
        }
      }
      function formatHistoryTime(iso) {
        if (!iso) return '';
        const t = new Date(iso);
        const now = Date.now();
        const diff = Math.floor((now - t.getTime()) / 1000);
        if (diff < 60)     return `${diff} 秒前`;
        if (diff < 3600)   return `${Math.floor(diff / 60)} 分鐘前`;
        if (diff < 86400)  return `${Math.floor(diff / 3600)} 小時前`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
        return t.toISOString().slice(0, 16).replace('T', ' ');
      }
      // 摘要顯示用:從 summary 抽幾個關鍵指標
      function historyKeyStats(s) {
        if (!s) return {};
        return {
          spins: Number(s.valid_spins) || 0,
          rtp:   Number(s.rtp_pct) || 0,
          dead:  Number(s.dead_rate_pct) || 0,
        };
      }

      // ── 截圖匯出比較結果(任務 4)──
      const isExportingScreenshot = ref(false);
      async function exportCompareScreenshot() {
        if (typeof window.html2canvas !== 'function') {
          statusMsg.value = '❌ html2canvas 未載入(CDN 可能被擋)';
          statusClass.value = 'err';
          return;
        }
        const el = document.querySelector('.sim-compare-result');
        if (!el) {
          statusMsg.value = '❌ 找不到比較結果區';
          statusClass.value = 'err';
          return;
        }
        isExportingScreenshot.value = true;
        const oldMsg = statusMsg.value;
        const oldCls = statusClass.value;
        statusMsg.value = '📸 渲染截圖中…';
        statusClass.value = 'info';
        try {
          // 暫時把 caret 等互動元素藏起來,讓截圖更乾淨
          const canvas = await window.html2canvas(el, {
            backgroundColor: '#FAF6FF',  // 跟主背景配色(--bg)
            scale: 2,  // 視覺品質提高一倍
            useCORS: true,
            logging: false,
          });
          await new Promise((resolve) => {
            canvas.toBlob((blob) => {
              if (!blob) {
                statusMsg.value = '❌ 截圖生成失敗(blob 為 null)';
                statusClass.value = 'err';
                resolve();
                return;
              }
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const aName = compareResults.value.A.name.replace(/[\\/:*?"<>|]/g, '_');
              const bName = compareResults.value.B.name.replace(/[\\/:*?"<>|]/g, '_');
              const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
              a.download = `SlotPlanner_比較_${aName}_vs_${bName}_${stamp}.png`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              statusMsg.value = `✓ 截圖已下載(${(blob.size / 1024).toFixed(1)} KB)`;
              statusClass.value = 'ok';
              resolve();
            }, 'image/png');
          });
        } catch (e) {
          console.error('[exportCompareScreenshot]', e);
          statusMsg.value = '❌ 截圖失敗:' + (e.message || e);
          statusClass.value = 'err';
          // 還原狀態列
          setTimeout(() => {
            if (statusMsg.value.startsWith('❌ 截圖失敗')) {
              statusMsg.value = oldMsg;
              statusClass.value = oldCls;
            }
          }, 3000);
        } finally {
          isExportingScreenshot.value = false;
        }
      }

      function refreshEditorSummary() {
        if (window.SlotPlanner && typeof window.SlotPlanner.getAxlsxSummaryFromLS === 'function') {
          editorSummary.value = window.SlotPlanner.getAxlsxSummaryFromLS();
        } else {
          editorSummary.value = null;
        }
      }
      function setSource(newSource) {
        source.value = newSource;
        if (newSource === 'editor') refreshEditorSummary();
        if (newSource === 'compare') refreshTemplateOptions();
      }

      // 可否開始模擬:
      //   editor 模式:總是可以(會用預設值)
      //   file 模式:必須有檔案
      //   compare 模式:必須選好 A 和 B(允許 A === B,自動用不同 seed 觀察隨機性)
      const canRun = computed(() => {
        if (source.value === 'file') return !!xlsxFile.value;
        if (source.value === 'compare') {
          return !!compareSlugA.value && !!compareSlugB.value;
        }
        return true;
      });
      // 偵測「同範本比較」狀態(讓 UI 提示使用者會自動用不同 seed)
      const isSameTemplateCompare = computed(() =>
        source.value === 'compare'
        && !!compareSlugA.value
        && compareSlugA.value === compareSlugB.value
      );

      // ── 下載 B.xlsx ──
      function downloadResult() {
        if (!resultBytes.value) return;
        const blob = new Blob([resultBytes.value],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'B_結果.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      }

      // ── 執行模擬 ──
      // 單次模擬(Promise 化,用於 compare 鏈式呼叫)
      function runOnce(xlsxBytes) {
        return new Promise(async (resolve, reject) => {
          currentRunResolver = resolve;
          currentRunRejecter = reject;
          try {
            const pythonFiles = await _loadPythonFiles();
            SP.workerService.postRun(xlsxBytes, pythonFiles);
          } catch (e) {
            currentRunResolver = null; currentRunRejecter = null;
            reject(e);
          }
        });
      }

      async function runSim() {
        if (!canRun.value || isRunning.value || !pyReady.value) return;

        // 共用初始化
        isRunning.value   = true;
        progress.value    = 0;
        spinsDone.value   = 0;
        spinsTotal.value  = 0;
        summaryData.value = null;
        resultBytes.value = null;
        compareResults.value = null;
        logs.value        = [];
        statusClass.value = 'info';

        // ── 比較模式分支(任務 4)──
        if (source.value === 'compare') {
          const api = tplApi();
          if (!api) {
            isRunning.value = false;
            statusMsg.value = '❌ 範本 API 未載入';
            statusClass.value = 'err';
            return;
          }
          _compareInProgress = true;
          // 1) 快照當前 LS 狀態(以便還原)
          const LS_KEYS = [
            'slotplanner.aconfig.global.v1',
            'slotplanner.aconfig.modes.v1',
            'slotplanner.aconfig.layout.v1',
            'slotplanner.aconfig.bins.v1',
            'slotplanner.aconfig.paylines.v1',
            'slotplanner.aconfig.constraints.v1',
            'slotplanner.aconfig.reelweights.v1',
            'slotplanner.aconfig.gridweights.v1',
            'slotplanner.aconfig.comboweights.v1',
            'slotplanner.aconfig.discards.v1',
            'slotplanner.aconfig.rules.v1',
            'slotplanner.registry.v1',
          ];
          const snapshot = {};
          for (const k of LS_KEYS) snapshot[k] = localStorage.getItem(k);

          const tA = availableTemplates.value.find(t => t.slug === compareSlugA.value);
          const tB = availableTemplates.value.find(t => t.slug === compareSlugB.value);
          if (!tA || !tB) {
            isRunning.value = false;
            statusMsg.value = '❌ 範本不存在';
            statusClass.value = 'err';
            return;
          }

          try {
            // 2) 跑範本 A
            statusMsg.value = `[1/2] 載入範本 A:${tA.name}…`;
            api.load(compareSlugA.value);
            statusMsg.value = `[1/2] 生成範本 A 的 xlsx…`;
            const xlsxA = await window.SlotPlanner.buildAxlsxBufferFromLS();
            statusMsg.value = `[1/2] 正在模擬範本 A:${tA.name}`;
            logs.value.push(`▶ 開始模擬範本 A:${tA.name}`);
            const resA = await runOnce(xlsxA);

            // 3) 跑範本 B(共用同一個 worker;done 時 isRunning 被設為 false,要再開)
            isRunning.value = true;
            progress.value  = 0;
            spinsDone.value = 0;
            statusMsg.value = `[2/2] 載入範本 B:${tB.name}…`;
            api.load(compareSlugB.value);
            // 任務:同範本比較時自動用不同 seed,觀察隨機性影響
            const isSameTemplate = compareSlugA.value === compareSlugB.value;
            if (isSameTemplate) {
              try {
                const gKey = 'slotplanner.aconfig.global.v1';
                const g = JSON.parse(localStorage.getItem(gKey) || '{}');
                const origSeed = Number(g.random_seed) || 0;
                // 用 +1 或時間戳(若 seed=0 表示「隨機」就改成具體值)
                g.random_seed = origSeed !== 0 ? origSeed + 1 : Math.floor(Math.random() * 1e9);
                localStorage.setItem(gKey, JSON.stringify(g));
                logs.value.push(`🎲 同範本比較:B 的 seed 改為 ${g.random_seed}(原 A seed=${origSeed})`);
              } catch (e) {
                logs.value.push(`⚠ seed 改寫失敗:${e.message}`);
              }
            }
            statusMsg.value = `[2/2] 生成範本 B 的 xlsx…`;
            const xlsxB = await window.SlotPlanner.buildAxlsxBufferFromLS();
            statusMsg.value = `[2/2] 正在模擬範本 B:${tB.name}` + (isSameTemplate ? ' (不同 seed)' : '');
            logs.value.push(`▶ 開始模擬範本 B:${tB.name}` + (isSameTemplate ? ' (不同 seed)' : ''));
            const resB = await runOnce(xlsxB);

            // 4) 設定比較結果
            compareResults.value = {
              A: { name: tA.name + (isSameTemplate ? ' (seed A)' : ''), slug: tA.slug, summary: resA.summary },
              B: { name: tB.name + (isSameTemplate ? ' (seed B)' : ''), slug: tB.slug, summary: resB.summary },
            };
            // 任務 3:存入歷史記錄
            pushHistory({
              kind: 'compare',
              source: 'compare',
              sourceName: `${tA.name} vs ${tB.name}` + (isSameTemplate ? ' (seed 比較)' : ''),
              A: compareResults.value.A,
              B: compareResults.value.B,
            });
            statusMsg.value = `✅ 比較完成!A=${tA.name} vs B=${tB.name}` + (isSameTemplate ? ' (不同 seed)' : '');
            statusClass.value = 'ok';
            logs.value.push(`✓ 比較完成`);
          } catch (e) {
            isRunning.value = false;
            statusMsg.value = '❌ 比較模擬失敗:' + (e.message || e);
            statusClass.value = 'err';
            logs.value.push(`✗ ${e.message || e}`);
          } finally {
            // 5) 還原 LS 狀態(無論成功失敗都要還原,避免破壞使用者當前工作)
            for (const [k, v] of Object.entries(snapshot)) {
              if (v == null) localStorage.removeItem(k);
              else localStorage.setItem(k, v);
            }
            logs.value.push(`↻ 已還原比較前的設定狀態`);
            isRunning.value = false;
            _compareInProgress = false;
          }
          return;
        }

        // ── 單一模擬分支(editor / file)──
        let xlsxBytes;
        try {
          if (source.value === 'editor') {
            statusMsg.value = '從編輯器讀取設定並生成 xlsx…';
            if (!window.SlotPlanner || typeof window.SlotPlanner.buildAxlsxBufferFromLS !== 'function') {
              throw new Error('config-editor 模組未載入,無法使用「使用編輯器設定」');
            }
            xlsxBytes = await window.SlotPlanner.buildAxlsxBufferFromLS();
            _lastSourceName = '編輯器當前設定';
          } else {
            statusMsg.value = '讀取 A.xlsx…';
            xlsxBytes = await xlsxFile.value.arrayBuffer();
            _lastSourceName = (xlsxFile.value && xlsxFile.value.name) || '(上傳檔案)';
          }
        } catch (err) {
          isRunning.value = false;
          statusMsg.value = '❌ 生成 xlsx 失敗:' + (err.message || err);
          statusClass.value = 'err';
          return;
        }

        const pythonFiles = await _loadPythonFiles();
        SP.workerService.postRun(xlsxBytes, pythonFiles);
      }

      async function _loadPythonFiles() {
        // v3.5 起:Python 原始碼從 py/ 資料夾 fetch(GitHub Pages/http server 都可)
        // file:// 協定下 fetch 會 CORS 失敗,但本專案已強制要求 http server
        const PY_FILES = [
          // 必要的 __init__.py
          { path: '/core/__init__.py',     url: 'py/core/__init__.py' },
          { path: '/iolayer/__init__.py',  url: 'py/iolayer/__init__.py' },
          { path: '/stats/__init__.py',    url: 'py/stats/__init__.py' },
          // core 模組
          { path: '/core/schemas.py',          url: 'py/core/schemas.py' },
          { path: '/core/condition_parser.py', url: 'py/core/condition_parser.py' },
          { path: '/core/logic_parser.py',     url: 'py/core/logic_parser.py' },
          { path: '/core/reel_generator.py',   url: 'py/core/reel_generator.py' },
          { path: '/core/grid_engine.py',      url: 'py/core/grid_engine.py' },
          { path: '/core/pay_resolver.py',     url: 'py/core/pay_resolver.py' },
          { path: '/core/combo_engine.py',     url: 'py/core/combo_engine.py' },
          // iolayer
          { path: '/iolayer/a_loader.py',  url: 'py/iolayer/a_loader.py' },
          { path: '/iolayer/b_writer.py',  url: 'py/iolayer/b_writer.py' },
          // stats
          { path: '/stats/collector.py',   url: 'py/stats/collector.py' },
        ];

        const files = {};
        // 平行 fetch 全部 Python 檔(主執行緒,同 origin,無 CORS 問題)
        const results = await Promise.all(
          PY_FILES.map(async ({ path, url }) => {
            try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const code = await res.text();
              return { path, code };
            } catch (e) {
              throw new Error(`無法載入 ${url}: ${e.message}。請確認用 HTTP server 啟動,且 py/ 資料夾存在`);
            }
          })
        );
        for (const { path, code } of results) {
          files[path] = code;
        }
        // run_web.py 仍內嵌(因為它是 web 專用入口,只有 90 行)
        files['/run_web.py'] = RUN_WEB_PY;
        return files;
      }

      onMounted(() => {
        attachWorkerHandlers();
        refreshEditorSummary();
        refreshTemplateOptions();
      });

      onUnmounted(() => {
        // ⚠ 不再 terminate worker —— 它是 app 全域單例,跨頁面切換不重啟
        if (unsubscribeWorker) { unsubscribeWorker(); unsubscribeWorker = null; }
        // 若有未完成的 Promise 也清掉,避免外洩
        if (currentRunRejecter) {
          try { currentRunRejecter(new Error('元件已卸載,取消當前模擬')); } catch (e) {}
          currentRunResolver = null; currentRunRejecter = null;
        }
      });

      return {
        xlsxFile, isDragging, isRunning, pyReady,
        statusMsg, statusClass, progress, spinsDone, spinsTotal,
        logs, showLog, summaryData, summaryCards, resultBytes, logBody,
        source, editorSummary, canRun,
        setSource, refreshEditorSummary,
        showPreview, modeRTPRows, symbolFreqRows, comboHistRows,
        bigWinRows, deadBucketRows, ruleHitRows,
        ruleTraceRows, ruleTraceSummary, ruleTraceFilter, ruleTraceSort,
        // 任務 4:比較模式
        availableTemplates, compareSlugA, compareSlugB, compareResults,
        compareDiffRows, getTemplateDesc, refreshTemplateOptions,
        isSameTemplateCompare,
        // 任務 3:歷史記錄
        simHistory, showHistory,
        removeHistory, clearAllHistory, restoreFromHistory,
        formatHistoryTime, historyKeyStats,
        // 任務 4:截圖匯出
        isExportingScreenshot, exportCompareScreenshot,
        // 任務 1 補強:比較模式並排 B 預覽
        cmpModeRTPRows, cmpSymbolFreqRows, cmpComboHistRows,
        cmpBigWinRows, cmpRuleHitRows,
        // v3.7 / #6:符號 RTP 貢獻細節
        selectedSymbolId, selectedSymbolDetail, selectSymbol, clearSelectedSymbol,
        onFilePick, onDrop, runSim, downloadResult,
      };
    },
  };

  // SimPage 樣式:v4.0 已抽出到 css/modules/sim-page.css
  // 由 theme_additions.css @import 載入,進站就準備好


})();
