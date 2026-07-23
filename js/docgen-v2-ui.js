// ============================================================================
// docgen-v2-ui.js — 機制文件 v2：授權欄位編輯器＋匯出（M4）
// ----------------------------------------------------------------------------
//  ◆ 零依賴獨立模組（純 DOM modal，不用 Vue）：不動 setup.js / template.js /
//    docgen.js，避開匯出頁架構懸案與工作樹差異。
//  ◆ 讀寫 LS 鍵 slotplanner.docv2.v1（2026-07-21 已授權）。
//  ◆ 整合方式：載入本檔（於 docgen-v2.js 之後），任意處放一顆按鈕呼叫
//      window.SlotPlanner.DocGenV2UI.open()
//  ◆ 邏輯層（state ⇄ LS）與 DOM 層分離，邏輯層可 headless 測試。
// ============================================================================
(function () {
  'use strict';
  const LS_KEY = 'slotplanner.docv2.v1';

  // ── 邏輯層（可 headless 測試） ────────────────────────────────────────
  function loadState() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { o = {}; }
    return {
      title: o.title || '', vendor: o.vendor || '', tagline: o.tagline || '',
      reference: o.reference || '', overview: o.overview || '',
      mechanics: Array.isArray(o.mechanics) ? o.mechanics.map(m => ({
        name: m.name || '', flow: m.flow || '',
        rule_ids: Array.isArray(m.rule_ids) ? m.rule_ids.slice() : [],
      })) : [],
      symbol_notes: (o.symbol_notes && typeof o.symbol_notes === 'object') ? Object.assign({}, o.symbol_notes) : {},
      unknowns: Array.isArray(o.unknowns) ? o.unknowns.slice() : [],
    };
  }
  function saveState(st) {
    const clean = {
      title: String(st.title || '').trim(),
      vendor: String(st.vendor || '').trim(),
      tagline: String(st.tagline || '').trim(),
      reference: String(st.reference || '').trim(),
      overview: String(st.overview || '').trim(),
      mechanics: (st.mechanics || [])
        .map(m => ({ name: String(m.name || '').trim(), flow: String(m.flow || '').trim(),
                     rule_ids: (m.rule_ids || []).filter(Boolean) }))
        .filter(m => m.name || m.flow || m.rule_ids.length),
      symbol_notes: {},
      unknowns: (st.unknowns || []).map(u => String(u || '').trim()).filter(Boolean),
    };
    Object.keys(st.symbol_notes || {}).forEach(k => {
      const v = String(st.symbol_notes[k] || '').trim();
      if (v) clean.symbol_notes[k] = v;
    });
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
    return clean;
  }
  function listRules() {
    try {
      const a = JSON.parse(localStorage.getItem('slotplanner.aconfig.rules.v1') || '[]');
      return (Array.isArray(a) ? a : []).map(r => ({
        id: r.rule_id || r.id || '', desc: String(r.description || '').trim(),
      })).filter(r => r.id);
    } catch (e) { return []; }
  }
  function listSpecialSymbols() {
    try {
      const reg = JSON.parse(localStorage.getItem('slotplanner.registry.v1') || '{}');
      const SP2 = new Set(['WILD', 'SCATTER', 'FREE', 'BONUS', 'COIN', 'SPECIAL']);
      return (Array.isArray(reg.symbols) ? reg.symbols : [])
        .filter(s => s && s.enabled !== false && SP2.has(String(s.type || '').toUpperCase()))
        .map(s => ({ id: s.id || s.sid, name: s.name || s.id || s.sid }));
    } catch (e) { return []; }
  }
  function buildV2() {
    const SPn = (typeof window !== 'undefined' ? window.SlotPlanner : globalThis.SlotPlanner) || {};
    if (!SPn.DocGenV2 || !SPn.DocGenV2.buildMechMarkdownV2) return null;
    return SPn.DocGenV2.buildMechMarkdownV2();
  }

  // ── DOM 層 ────────────────────────────────────────────────────────────
  const CSS = `
  .dgv2-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;}
  .dgv2-modal{position:fixed;top:4vh;left:50%;transform:translateX(-50%);width:min(860px,94vw);
    max-height:92vh;overflow:auto;background:var(--panel-bg,#fff);color:var(--text,#222);
    border:1px solid var(--line,#c9b8a8);border-radius:10px;z-index:9999;padding:18px 22px;
    font:14px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25);}
  .dgv2-modal h3{margin:.2em 0 .6em;font-size:17px;}
  .dgv2-modal h4{margin:1.1em 0 .35em;font-size:14px;border-left:3px solid #7a3c20;padding-left:8px;}
  .dgv2-modal label{display:block;margin:.45em 0 .1em;font-weight:600;}
  .dgv2-modal input[type=text],.dgv2-modal textarea{width:100%;box-sizing:border-box;padding:6px 8px;
    border:1px solid var(--line,#c9b8a8);border-radius:6px;background:transparent;color:inherit;font:inherit;}
  .dgv2-modal textarea{min-height:64px;resize:vertical;}
  .dgv2-row{display:flex;gap:10px;} .dgv2-row>div{flex:1;}
  .dgv2-mech{border:1px dashed var(--line,#c9b8a8);border-radius:8px;padding:10px;margin:.5em 0;}
  .dgv2-mech .dgv2-rules{display:flex;flex-wrap:wrap;gap:4px 14px;margin:.3em 0;}
  .dgv2-mech .dgv2-rules label{display:inline-flex;align-items:center;gap:4px;font-weight:400;margin:0;}
  .dgv2-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;position:sticky;bottom:0;
    background:inherit;padding:8px 0;}
  .dgv2-btn{padding:6px 14px;border-radius:6px;border:1px solid #7a3c20;background:transparent;
    color:inherit;cursor:pointer;} .dgv2-btn.pri{background:#7a3c20;color:#fff;}
  .dgv2-del{float:right;cursor:pointer;opacity:.6;} .dgv2-del:hover{opacity:1;}
  .dgv2-pre{white-space:pre-wrap;border:1px solid var(--line,#c9b8a8);border-radius:8px;
    padding:12px;max-height:56vh;overflow:auto;font:12px/1.5 ui-monospace,monospace;}`;

  let _mounted = null;
  function _el(tag, attrs, children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (children || []).forEach(ch => e.appendChild(ch));
    return e;
  }
  function close() {
    if (_mounted) { _mounted.mask.remove(); _mounted.modal.remove(); _mounted = null; }
  }
  function _download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function _previewModal(md) {
    const mask = _el('div', { class: 'dgv2-mask', onclick: () => { mask.remove(); box.remove(); } });
    const box = _el('div', { class: 'dgv2-modal' }, [
      _el('h3', { text: '機制文件 v2 預覽' }),
      _el('div', { class: 'dgv2-pre', text: md }),
      _el('div', { class: 'dgv2-btns' }, [
        _el('button', { class: 'dgv2-btn', text: '關閉', onclick: () => { mask.remove(); box.remove(); } }),
      ]),
    ]);
    document.body.appendChild(mask); document.body.appendChild(box);
  }

  function open() {
    if (_mounted) return;
    if (!document.getElementById('dgv2-style')) {
      document.head.appendChild(_el('style', { id: 'dgv2-style', text: CSS }));
    }
    const st = loadState();
    const rules = listRules();
    const specials = listSpecialSymbols();

    const inTitle = _el('input', { type: 'text', value: st.title, placeholder: '（空白＝沿用全域遊戲名）' });
    const inVendor = _el('input', { type: 'text', value: st.vendor, placeholder: '例：Aristocrat（2019）' });
    const inTag = _el('input', { type: 'text', value: st.tagline, placeholder: '例：埃及主題、固定線、雙盤連動 SLOT' });
    const inRef = _el('input', { type: 'text', value: st.reference, placeholder: '例：RTP 96.95%（僅供參考）' });
    const inOv = _el('textarea', { placeholder: '遊戲總覽一段話（留空＝自動產生保守摘要）' }); inOv.value = st.overview;

    // 機制分組
    const mechWrap = _el('div');
    function mechCard(m) {
      const nm = _el('input', { type: 'text', value: m.name, placeholder: '機制名稱（例：賓果板累積與結算）' });
      const fl = _el('textarea', { placeholder: '流程句（例：賓果符號落定 → 獎項累加上板 → …以此類推。）' }); fl.value = m.flow;
      const rl = _el('div', { class: 'dgv2-rules' }, rules.map(r => {
        const cb = _el('input', { type: 'checkbox' }); cb.checked = m.rule_ids.includes(r.id);
        cb.addEventListener('change', () => {
          const i = m.rule_ids.indexOf(r.id);
          if (cb.checked && i < 0) m.rule_ids.push(r.id);
          if (!cb.checked && i >= 0) m.rule_ids.splice(i, 1);
        });
        return _el('label', {}, [cb, _el('span', { text: r.id + (r.desc ? '（有描述）' : '') })]);
      }));
      nm.addEventListener('input', () => { m.name = nm.value; });
      fl.addEventListener('input', () => { m.flow = fl.value; });
      const card = _el('div', { class: 'dgv2-mech' }, [
        _el('span', { class: 'dgv2-del', text: '✕ 移除', onclick: () => { st.mechanics.splice(st.mechanics.indexOf(m), 1); card.remove(); } }),
        _el('label', { text: '機制名稱' }), nm,
        _el('label', { text: '掛入規則（未勾選之規則將逐條列於「其他規則」）' }), rl,
        _el('label', { text: '流程句' }), fl,
      ]);
      return card;
    }
    st.mechanics.forEach(m => mechWrap.appendChild(mechCard(m)));
    const addMech = _el('button', { class: 'dgv2-btn', text: '＋ 新增機制分組', onclick: () => {
      const m = { name: '', flow: '', rule_ids: [] }; st.mechanics.push(m); mechWrap.appendChild(mechCard(m));
    } });

    // 符號行為說明
    const symWrap = _el('div');
    specials.forEach(s => {
      const ta = _el('textarea', { placeholder: '此特殊圖示的行為說明（留空＝依型別套預設句）' });
      ta.value = st.symbol_notes[s.id] || '';
      ta.addEventListener('input', () => { st.symbol_notes[s.id] = ta.value; });
      symWrap.appendChild(_el('label', { text: `${s.name}（${s.id}）` }));
      symWrap.appendChild(ta);
    });
    if (!specials.length) symWrap.appendChild(_el('div', { text: '（目前無特殊圖示）' }));

    // 未確認事項（一行一條）
    const inUnk = _el('textarea', { placeholder: '一行一條；全空＝整節省略' });
    inUnk.value = st.unknowns.join('\n');

    function collect() {
      st.title = inTitle.value; st.vendor = inVendor.value; st.tagline = inTag.value;
      st.reference = inRef.value; st.overview = inOv.value;
      st.unknowns = inUnk.value.split('\n');
      return st;
    }

    const mask = _el('div', { class: 'dgv2-mask', onclick: close });
    const modal = _el('div', { class: 'dgv2-modal' }, [
      _el('h3', { text: '機制文件 v2 — 文件設定與匯出' }),
      _el('div', { class: 'dgv2-row' }, [
        _el('div', {}, [_el('label', { text: '文件標題' }), inTitle]),
        _el('div', {}, [_el('label', { text: '廠商／年份' }), inVendor]),
      ]),
      _el('div', { class: 'dgv2-row' }, [
        _el('div', {}, [_el('label', { text: '玩法類型一句話' }), inTag]),
        _el('div', {}, [_el('label', { text: '公開參考值' }), inRef]),
      ]),
      _el('h4', { text: '二、遊戲總覽' }), inOv,
      _el('h4', { text: '三、機制分組（3.3）' }), mechWrap, addMech,
      _el('h4', { text: '特殊圖示行為說明（3.2）' }), symWrap,
      _el('h4', { text: '未確認事項（文末）' }), inUnk,
      _el('div', { class: 'dgv2-btns' }, [
        _el('button', { class: 'dgv2-btn', text: '關閉', onclick: close }),
        _el('button', { class: 'dgv2-btn', text: '儲存', onclick: () => { saveState(collect()); } }),
        _el('button', { class: 'dgv2-btn', text: '儲存並預覽', onclick: () => {
          saveState(collect()); const md = buildV2();
          if (md == null) { alert('找不到 DocGenV2：請確認 docgen-v2.js 已載入'); return; }
          _previewModal(md);
        } }),
        _el('button', { class: 'dgv2-btn pri', text: '儲存並匯出 .md', onclick: () => {
          const s2 = saveState(collect()); const md = buildV2();
          if (md == null) { alert('找不到 DocGenV2：請確認 docgen-v2.js 已載入'); return; }
          _download((s2.title || 'game') + '_機制文件.md', md);
        } }),
      ]),
    ]);
    document.body.appendChild(mask); document.body.appendChild(modal);
    _mounted = { mask, modal };
  }

  const SPx = (typeof window !== 'undefined' ? (window.SlotPlanner = window.SlotPlanner || {}) : (globalThis.SlotPlanner = globalThis.SlotPlanner || {}));
  SPx.DocGenV2UI = { open, close, _loadState: loadState, _saveState: saveState, _listRules: listRules, _listSpecialSymbols: listSpecialSymbols };
})();
