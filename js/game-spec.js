// ============================================================
//  game-spec.js — 中央連動層（單一真相來源 / Single Source of Truth）
//
//  目的：解決「各分頁各存各的 aconfig.*、彼此沒有 watcher」的連動斷裂。
//  把幾個跨分頁的「權威輸入」收斂成唯一一份 reactive 狀態，
//  其他分頁一律「讀 gameSpec」，不再各自重算或各自猜。
//
//  權威輸入 → 來源對照（v6.1 現況）：
//    reelCount    ← 02_Layout 的 layout.length      (LS: aconfig.layout.v1)  ★ 真實盤面輪數
//    maxRows      ← 02_Layout 各輪 max_rows 的最大值
//    subReels[]   ← 02_Layout 附掛副盤(has_subreel) + 02b_Panels 自由副盤
//                                                   (LS: aconfig.layout.v1 / aconfig.panels.v1)
//    payModel     ← 01_Global g.pay_type + g.megaways(LS: aconfig.global.v1)
//    scoreDir     ← 01_Global g.payline_direction
//    isMegaways   ← 01_Global g.megaways
//
//  傳播（這版已接通的一條）：
//    reelCount → registry.setReelCount()  → 符號頁 reel_limit 自動跟著盤面輪數增減
//    （過去 layout 與 registry.reelCount 完全沒連動，這是符號#8 的根因）
//
//  使用方式：
//    const gameSpec = new SP.GameSpec(registry);   // app.js 建立一次
//    gameSpec.refresh();                            // 從 LS/registry 重算
//    gameSpec.on('changed', () => { ... });         // 任何權威值變動時通知
//    const s = gameSpec.state;                       // Vue reactive，元件可直接讀
//
//  生命週期：住在 app.js，provide('gameSpec') 下放給所有分頁共用一份。
// ============================================================

(function () {
  'use strict';

  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const Vue = window.Vue;

  // ── LS key（與 helpers.js 一致，避免硬耦合 import）──
  const LS_LAYOUT = 'slotplanner.aconfig.layout.v1';
  const LS_PANELS = 'slotplanner.aconfig.panels.v1';
  const LS_GLOBAL = 'slotplanner.aconfig.global.v1';

  // ── 賠付模型 / 方向 列舉（與全域設定 UI 一致）──
  const PAY_MODELS  = ['LINE', 'WAYS', 'MEGAWAYS', 'SCATTER', 'CLUSTER'];
  const SCORE_DIRS  = ['LTR', 'RTL', 'BOTH'];

  // 副盤位置 → 中文標籤
  const POS_LABEL = {
    TOP: '上', BOTTOM: '底', LEFT: '左', RIGHT: '右',
    OVER: '覆蓋', SIDE: '側', '': '',
  };

  function _readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  純函式：從原始資料推導出 spec（可單獨測試，無副作用）
  // ════════════════════════════════════════════════════════════

  // v6.4 / 缺漏#6:連線種數(ways) — 納入頂部橫向副盤(TOP_HORIZONTAL)貢獻。
  //   過去只把主輪 max_rows 相乘,逼得 Buffalo King 之類「主盤+頂部橫向副盤」
  //   只能把副盤列數灌進主輪 max_rows。此函式讓掛在某主輪上、kind 為
  //   TOP_HORIZONTAL 的副盤,其 subreel_rows 計入「該輪有效列數」再相乘:
  //     effRows[i] = max_rows[i] + (TOP_HORIZONTAL ? subreel_rows : 0)
  //   其餘 kind(STACK 等)不貢獻 ways(同輪內堆疊不增加路徑位置)。
  //   無有效列數時回 0(等同舊行為:無盤面資料)。
  function computeWaysCount(layout) {
    const rows = Array.isArray(layout) ? layout : [];
    const eff = rows.map((r) => {
      if (!r) return 0;
      let h = Number(r.max_rows) || 0;
      if (r.has_subreel && String(r.subreel_kind || '').toUpperCase() === 'TOP_HORIZONTAL') {
        h += Number(r.subreel_rows) || 0;
      }
      return h;
    }).filter((n) => n > 0);
    return eff.length ? eff.reduce((a, n) => a * n, 1) : 0;
  }

  // 統一副盤清單：附掛副盤(attached) + 自由副盤(panel)
  function deriveSubReels(layout, panels) {
    const out = [];

    // 1) 02_Layout 附掛副盤（某主輪上掛的副盤）
    (Array.isArray(layout) ? layout : []).forEach((r) => {
      if (!r || !r.has_subreel) return;
      const rid = r.reel_id;
      const posKey = (r.subreel_position || '').toUpperCase();
      const pos = POS_LABEL[posKey] != null ? POS_LABEL[posKey] : posKey;
      out.push({
        key: 'sub-r' + rid,
        kind: 'attached',
        label: 'R' + rid + (pos ? ('副(' + pos + ')') : '副'),
        reel_id: rid,
        position: posKey,
        rows: Number(r.subreel_rows) || 0,
        subreel_kind: r.subreel_kind || 'STACK',
        symbol_set: r.subreel_symbol_set || '',
        join_payline: false,     // 附掛副盤是否參與連線由 subreel_kind 決定，此處先給 false
        scroll: r.subreel_kind !== 'STACK',  // STACK = 靜態堆疊；其餘視為會滾動
      });
    });

    // 2) 02b_Panels 自由副盤
    (Array.isArray(panels) ? panels : []).forEach((p) => {
      if (!p) return;
      out.push({
        key: 'panel-' + p.panel_id,
        kind: 'panel',
        label: '副盤 ' + p.panel_id,
        panel_id: p.panel_id,
        col: Number(p.col) || 0,
        row: Number(p.row) || 0,
        width: Number(p.width) || 1,
        height: Number(p.height) || 1,
        scroll: !!p.scroll,
        symbol_set: p.symbol_set || '',
        join_payline: !!p.join_payline,
      });
    });

    return out;
  }

  // 賠付模型：pay_type + megaways → 對外統一字串
  function derivePayModel(g) {
    const pt = String((g && g.pay_type) || 'LINE').toUpperCase();
    if (pt === 'WAYS' && g && g.megaways) return 'MEGAWAYS';
    return PAY_MODELS.indexOf(pt) >= 0 ? pt : 'LINE';
  }

  function deriveScoreDir(g) {
    const d = String((g && g.payline_direction) || 'LTR').toUpperCase();
    return SCORE_DIRS.indexOf(d) >= 0 ? d : 'LTR';
  }

  // 把原始資料整理成完整 spec 物件
  function computeSpec(layout, panels, g, fallbackReelCount) {
    const reelCount = Array.isArray(layout) && layout.length
      ? layout.length
      : (Number(fallbackReelCount) || 5);

    const maxRows = (Array.isArray(layout) && layout.length)
      ? layout.reduce((m, r) => Math.max(m, Number(r && r.max_rows) || 0), 0) || 1
      : 3;

    const subReels = deriveSubReels(layout, panels);
    const payModel = derivePayModel(g);
    const payType  = String((g && g.pay_type) || 'LINE').toUpperCase();
    const isMega   = !!(g && g.megaways);
    const scoreDir = deriveScoreDir(g);
    const waysCount = computeWaysCount(layout);   // v6.4 / 缺漏#6:含 TOP_HORIZONTAL 副盤

    return {
      reelCount,
      maxRows,
      waysCount,                                 // v6.4:連線種數(含橫向副盤貢獻)
      payModel,                                  // LINE | WAYS | MEGAWAYS | SCATTER | CLUSTER
      payType,                                   // 原始 pay_type（不含 megaways 合成）
      isMegaways: isMega,
      scoreDir,                                  // LTR | RTL | BOTH
      subReels,                                  // 統一副盤清單

      // ── 衍生便利欄位（下游常用）──
      reelLabels: Array.from({ length: reelCount }, (_, i) => 'R' + (i + 1)),
      subReelLabels: subReels.map((s) => s.label),
      // 連線型玩法（LINE/WAYS/MEGAWAYS）賠付連線數的上限 = 盤面輪數；
      // 群集/任意(SCATTER/CLUSTER)則不受輪數限制。
      // v8.3 / R1 A-1:群集/任意上限由硬鎖 20 改為「盤面總格數」(7×7=49、8×8=64
      //   等大盤 cluster 的高 size 檔位放得下);不低於 20 保底(不比既有行為更緊)。
      maxLineLength: (payModel === 'SCATTER' || payModel === 'CLUSTER')
        ? Math.max(20, (Array.isArray(layout) ? layout : [])
            .reduce((sum, r) => sum + (Number(r && r.max_rows) || 0), 0))
        : reelCount,
      isLineLike: (payModel === 'LINE' || payModel === 'WAYS' || payModel === 'MEGAWAYS'),
    };
  }

  // 兩個 spec 是否相等（淺比較 + 陣列 JSON 比較），用來避免無意義的 emit
  function specEqual(a, b) {
    if (!a || !b) return false;
    if (a.reelCount !== b.reelCount) return false;
    if (a.maxRows !== b.maxRows) return false;
    if (a.waysCount !== b.waysCount) return false;
    if (a.payModel !== b.payModel) return false;
    if (a.payType !== b.payType) return false;
    if (a.isMegaways !== b.isMegaways) return false;
    if (a.scoreDir !== b.scoreDir) return false;
    if (JSON.stringify(a.subReels) !== JSON.stringify(b.subReels)) return false;
    return true;
  }

  // ════════════════════════════════════════════════════════════
  //  簡易 EventEmitter（與 registry.js 同款）
  // ════════════════════════════════════════════════════════════
  class Emitter {
    constructor() { this._lis = {}; }
    on(event, cb) {
      (this._lis[event] || (this._lis[event] = [])).push(cb);
      return () => this.off(event, cb);
    }
    off(event, cb) {
      this._lis[event] = (this._lis[event] || []).filter((c) => c !== cb);
    }
    emit(event, ...args) {
      (this._lis[event] || []).forEach((c) => {
        try { c(...args); } catch (e) { console.warn('[gameSpec] listener error:', e); }
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  GameSpec
  // ════════════════════════════════════════════════════════════
  class GameSpec extends Emitter {
    constructor(registry) {
      super();
      this._registry = registry || null;
      // Vue.reactive：元件可直接 reactive 讀取
      const init = computeSpec([], [], {}, this._registry ? this._registry.reelCount() : 5);
      this.state = Vue ? Vue.reactive(init) : init;
      this._suppressPush = false;
    }

    // ── 從 LS / registry 重新計算，差異才更新 + emit ──
    //   pushReelCount=true 時，會把 reelCount 推回 registry（讓符號頁 reel_limit 跟著盤面）
    //   opts.layout / opts.panels / opts.g：傳入「即時記憶體資料」時優先採用，
    //     避開 config 編輯器 scheduleSave 的 400ms 防抖競態（否則會讀到舊 LS）。
    refresh(opts) {
      opts = opts || {};
      const pushReelCount = opts.pushReelCount !== false;

      const layout = opts.layout != null ? opts.layout : _readLS(LS_LAYOUT, []);
      const panels = opts.panels != null ? opts.panels : _readLS(LS_PANELS, []);
      const g      = opts.g      != null ? opts.g      : _readLS(LS_GLOBAL, {});
      const fallback = this._registry ? this._registry.reelCount() : 5;

      const next = computeSpec(layout, panels, g, fallback);

      const prev = {
        reelCount: this.state.reelCount, maxRows: this.state.maxRows,
        waysCount: this.state.waysCount,
        payModel: this.state.payModel, payType: this.state.payType,
        isMegaways: this.state.isMegaways, scoreDir: this.state.scoreDir,
        subReels: this.state.subReels,
      };
      const changed = !specEqual(prev, next);

      // 寫回 reactive state（逐欄賦值，保留同一個 reactive 物件參考）
      Object.keys(next).forEach((k) => { this.state[k] = next[k]; });

      // ── 傳播：reelCount → registry（符號頁 reel_limit 連動盤面輪數）──
      if (pushReelCount && this._registry && !this._suppressPush) {
        try {
          if (this._registry.reelCount() !== next.reelCount) {
            console.log('[gameSpec] reelCount', this._registry.reelCount(), '→', next.reelCount, '(推 registry.setReelCount)');
            this._registry.setReelCount(next.reelCount);
          }
        } catch (e) {
          console.warn('[gameSpec] setReelCount 傳播失敗:', e);
        }
      }

      if (changed) this.emit('changed', this.state);
      return this.state;
    }

    // ── 讀取捷徑 ──
    get reelCount()    { return this.state.reelCount; }
    get maxRows()      { return this.state.maxRows; }
    get waysCount()    { return this.state.waysCount; }
    get payModel()     { return this.state.payModel; }
    get isMegaways()   { return this.state.isMegaways; }
    get scoreDir()     { return this.state.scoreDir; }
    get subReels()     { return this.state.subReels; }
    get isLineLike()   { return this.state.isLineLike; }
    get maxLineLength(){ return this.state.maxLineLength; }

    // ── 提供給下游「同時取主輪 + 副輪」的清單（符號#8 / 硬約束 / Reel 權重用）──
    //   回傳 [{ key, label, kind:'reel'|'sub' }]，主輪在前、副輪在後。
    reelTargets() {
      const main = this.state.reelLabels.map((lab, i) => ({
        key: 'r' + (i + 1), label: lab, kind: 'reel', reel_id: i + 1,
      }));
      const subs = this.state.subReels.map((s) => ({
        key: s.key, label: s.label, kind: 'sub', ref: s,
      }));
      return main.concat(subs);
    }
  }

  // ── Export ──
  SP.GameSpec = GameSpec;
  SP.gameSpecHelpers = { computeSpec, computeWaysCount, deriveSubReels, derivePayModel, deriveScoreDir, PAY_MODELS, SCORE_DIRS };
})();
