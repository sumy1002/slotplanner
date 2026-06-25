// ============================================================
//  mobile-gestures.js — 行動版抽屜手勢(v7.6.1)
//  公開接口(掛在 window.SlotPlanner):
//    attachDrawerDrag(drawerEl, opts) -> detach()
//
//  設計(避開 iOS 系統手勢):
//    - 「開」抽屜改用漢堡鈕點按(不在螢幕左緣搶手勢,零誤觸)。
//    - 「關」抽屜用 drag-follow:手指拖到哪、抽屜跟到哪(跟隨軌跡),
//      放手時依「拖超過門檻 or 甩動速度夠快」決定關閉或彈回。
//    - 只在 ≤767px 生效;桌面/平板不掛。
//
//  opts:
//    side: 'left' | 'right'   抽屜停駐邊(left=分頁列,right=Symbol 編輯)
//    isOpen() -> boolean      目前是否開啟(只有開啟時才允許拖關)
//    onClose()                確定關閉時呼叫(讓 Vue 改 state)
//    enabled() -> boolean     (選填)是否啟用
// ============================================================
(function () {
  'use strict';

  var CLOSE_RATIO = 0.4;   // 拖超過抽屜寬度的 40% → 關
  var FLING_V     = 0.5;   // px/ms,甩動速度門檻 → 關
  var H_RATIO     = 1.2;   // 水平須略大於垂直才算拖抽屜
  var MQ          = '(max-width: 767px)';

  function attachDrawerDrag(el, opts) {
    if (!el || !opts) return function () {};
    var side = opts.side === 'right' ? 'right' : 'left';

    var sx = 0, sy = 0, lastX = 0, lastT = 0, vx = 0;
    var w = 0, tracking = false, decided = false, horizontal = false, dragging = false;

    function mobile() {
      if (!window.matchMedia(MQ).matches) return false;
      return opts.enabled ? !!opts.enabled() : true;
    }

    function _scrim() {
      var parent = (el.closest && (el.closest('.cfg-body') || el.closest('.sym-page'))) || el.parentElement;
      if (!parent) return null;
      return parent.querySelector('.cfg-drawer-scrim, .sym-drawer-scrim');
    }

    function applyOffset(dx) {
      var off = side === 'left' ? Math.min(0, dx) : Math.max(0, dx);
      el.style.transition = 'none';
      el.style.transform = 'translateX(' + off + 'px)';
      var prog = Math.min(1, Math.abs(off) / (w || 1));
      var scrim = _scrim();
      if (scrim) { scrim.style.transition = 'none'; scrim.style.opacity = String(1 - prog); }
    }

    function clearInline() {
      el.style.transition = '';
      el.style.transform = '';
      var scrim = _scrim();
      if (scrim) { scrim.style.transition = ''; scrim.style.opacity = ''; }
    }

    function onStart(e) {
      if (!mobile() || !(opts.isOpen && opts.isOpen())) return;
      var t = e.touches ? e.touches[0] : e;
      sx = lastX = t.clientX; sy = t.clientY; lastT = Date.now(); vx = 0;
      w = el.getBoundingClientRect().width || 1;
      tracking = true; decided = false; horizontal = false; dragging = false;
    }

    function onMove(e) {
      if (!tracking || !mobile()) return;
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      var adx = Math.abs(dx), ady = Math.abs(dy);

      if (!decided) {
        if (adx < 8 && ady < 8) return;
        var towardClose = side === 'left' ? dx < 0 : dx > 0;
        horizontal = adx > ady * H_RATIO && towardClose;
        decided = true;
        if (!horizontal) { tracking = false; return; }
        dragging = true;
      }

      if (dragging) {
        if (e.cancelable) e.preventDefault();
        var now = Date.now();
        var dt = now - lastT;
        if (dt > 0) vx = (t.clientX - lastX) / dt;
        lastX = t.clientX; lastT = now;
        applyOffset(dx);
      }
    }

    function onEnd() {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;

      var m = (el.style.transform.match(/-?\d+\.?\d*/) || ['0'])[0];
      var moved = Math.abs(parseFloat(m) || 0);
      var passedDist = moved >= w * CLOSE_RATIO;
      // 甩動關閉:需速度夠快「且」至少拖動一段距離(避免極小位移誤關)
      var fast = side === 'left' ? (vx < -FLING_V) : (vx > FLING_V);
      var passedFling = fast && moved >= 40;

      clearInline();
      if (passedDist || passedFling) {
        opts.onClose && opts.onClose();
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    el.addEventListener('touchcancel', onEnd,  { passive: true });

    return function detach() {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel', onEnd);
      clearInline();
    };
  }

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.attachDrawerDrag = attachDrawerDrag;
})();
