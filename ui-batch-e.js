/* ══════════════════════════════════════════════════════════════
   UI 批 E — 互動核心(Vue 3 CDN 零建置;掛於 window.UIBatchE)
   零新增 LS key;儲存仍走既有 reactive→LS 管線,本檔只負責
   「何時提交」與「提交後的防抖重算」。helpers.js 零觸及。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const { ref, reactive, computed, nextTick } = global.Vue;

  /* ── 共用:防抖(對齊 v4.4 validationIssues 防抖模式)── */
  function debounce(fn, ms = 150) {
    let t = null;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  }

  /* ══════════════ E-2:usePopover(失焦即存)══════════════
     單例氣泡:同時只開一個(Figma/Notion 同款行為)。
     用法(setup 內):
       const pop = UIBatchE.usePopover({
         onCommit(draft, ctx) { ... 寫回 reactive 狀態 ... },
         recompute() { ... 總和/Δ 重算(會被 150ms 防抖包裹)... },
       });
       pop.open(evt.currentTarget, { rowId, draft: { w: cell.w } });
     template:
       <div v-if="pop.state.open" class="cfg-popover"
            :class="{ 'is-open': pop.state.shown, 'flip-up': pop.state.flipUp }"
            :style="pop.style.value" @focusout="pop.onFocusOut" tabindex="-1" ref="popEl">
         ...欄位 v-model 綁 pop.state.draft.*...
         <div class="cfg-popover-hint">點擊外部即自動儲存</div>
       </div>                                                      */
  function usePopover(opts) {
    const state = reactive({
      open: false,      // v-if 掛載
      shown: false,     // 進場動畫 class
      flipUp: false,
      x: 0, y: 0,
      draft: {},        // 本地草稿:開啟時複製,提交時回寫(single source 不被半成品污染)
      ctx: null,        // 呼叫端自帶上下文(rowId 等)
    });
    let anchorEl = null;
    let popEl = null;   // 由 setPopEl 或 open 後 querySelector 取得
    const recomputeDebounced = opts.recompute ? debounce(opts.recompute, 150) : null;

    const style = computed(() => ({ left: state.x + 'px', top: state.y + 'px' }));

    function place() {
      if (!anchorEl || !popEl) return;
      const a = anchorEl.getBoundingClientRect();
      const p = popEl.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, GAP = 8, PAD = 12;
      // 水平:錨點左緣對齊,右緣溢出則靠右收
      let x = Math.min(a.left, vw - p.width - PAD);
      x = Math.max(PAD, x);
      // 垂直:預設開下方;不夠 → 翻上方
      let y = a.bottom + GAP;
      state.flipUp = false;
      if (y + p.height > vh - PAD && a.top - GAP - p.height >= PAD) {
        y = a.top - GAP - p.height;
        state.flipUp = true;
      }
      state.x = Math.round(x);
      state.y = Math.round(y);
    }

    async function open(anchor, { draft = {}, ctx = null, el = null } = {}) {
      if (state.open) commitAndClose();          // 換錨點 = 先提交前一個(Notion 行為)
      anchorEl = anchor;
      state.draft = JSON.parse(JSON.stringify(draft));  // 深拷貝草稿
      state.ctx = ctx;
      state.open = true;
      state.shown = false;
      await nextTick();
      popEl = el || document.querySelector('.cfg-popover');
      place();
      requestAnimationFrame(() => { state.shown = true; });
      document.addEventListener('pointerdown', onOutside, true);   // capture:先於任何 stopPropagation
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', place);
    }

    /* 提交 = 關閉。唯一寫回點,保證「失焦即存」語義單一。 */
    function commitAndClose() {
      if (!state.open) return;
      try {
        opts.onCommit && opts.onCommit(state.draft, state.ctx);
        if (recomputeDebounced) recomputeDebounced();
        // 提交回條:錨點閃一下 ok 底色
        if (anchorEl) {
          anchorEl.classList.remove('cfg-flash-saved');
          void anchorEl.offsetWidth;               // 重觸發 animation
          anchorEl.classList.add('cfg-flash-saved');
        }
      } finally {
        teardown();
      }
    }

    /* Esc = 放棄草稿關閉(不提交)——給使用者一條後悔路 */
    function cancelAndClose() { if (state.open) teardown(); }

    function teardown() {
      state.open = false;
      state.shown = false;
      anchorEl = null; popEl = null;
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    }

    function onOutside(e) {
      if (popEl && popEl.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;  // 點錨點自身視為 toggle,由呼叫端決定
      commitAndClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); cancelAndClose(); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') commitAndClose();
    }
    /* focusout 備援:Tab 離開氣泡整體(relatedTarget 不在 pop 內)也提交 */
    function onFocusOut(e) {
      if (popEl && e.relatedTarget && popEl.contains(e.relatedTarget)) return;
      // 延遲一拍,避免與 pointerdown 重複提交
      setTimeout(() => { if (state.open && popEl && !popEl.contains(document.activeElement)) commitAndClose(); }, 0);
    }

    return { state, style, open, commitAndClose, cancelAndClose, onFocusOut };
  }

  /* ══════════════ E-3:useGuideChip(動態下一步狀態機)══════════════
     純 computed,不落地任何狀態。呼叫端提供 probe():回傳分頁健檢結果。
     用法:
       const guide = UIBatchE.useGuideChip({
         probe: () => {
           if (rows.value.length === 0) return { level:'start' };
           const bad = deltaRows.value.filter(r => Math.abs(r.delta) > 3);
           if (bad.length) return { level:'warn', count: bad.length };
           return { level:'ok' };
         },
         labels: {
           start: '1. 點此快速生成初始配置',
           warn : (p) => `⚠ 2. 一鍵等比補足(${p.count} 項偏差)`,
           ok   : '✨ 3. 驗證成功,前往匯出',
         },
         actions: {
           start: () => applySuggestedLength(),   // 復用既有函式(如 04b 建議長度)
           warn : () => normalizeAll(),           // 復用既有正規化
           ok   : () => switchTab('docgen'),      // 或 no-op,由 30 拍板
         },
       });
     template:
       <button class="cfg-guide-chip" :class="guide.cls.value"
               @click="guide.run">{{ guide.label.value }}</button>   */
  function useGuideChip({ probe, labels, actions }) {
    const pulse = ref(false);
    let lastLevel = null;

    // probe() 回傳 null/undefined → idle 態:晶片整顆隱藏(非必填分頁不逼使用者填)
    const snap = computed(() => probe() || { level: 'idle' });
    const level = computed(() => snap.value.level);
    const visible = computed(() => level.value !== 'idle');
    const cls = computed(() => {
      // 三態切換瞬間加 pulse(下一 tick 移除,靠 animation 播完)
      if (lastLevel !== null && lastLevel !== level.value) {
        pulse.value = true;
        setTimeout(() => { pulse.value = false; }, 550);
      }
      lastLevel = level.value;
      return {
        'is-start': level.value === 'start',
        'is-warn' : level.value === 'warn',
        'is-ok'   : level.value === 'ok',
        'is-pulse': pulse.value,
      };
    });
    const label = computed(() => {
      if (level.value === 'idle') return '';
      const l = labels[level.value];
      return typeof l === 'function' ? l(snap.value) : l;
    });
    function run() {
      const a = actions && actions[level.value];   // 拍板:ok 級不給 action → 純狀態徽章
      if (a) a(snap.value);
    }
    return { level, visible, cls, label, run };
  }

  global.UIBatchE = { debounce, usePopover, useGuideChip };
})(window);
