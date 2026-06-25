// ============================================================
//  mobile-gestures.js — 行動版邊緣滑動手勢(Discord 式抽屜)
//  公開接口(掛在 window.SlotPlanner):
//    attachEdgeSwipe(el, opts) -> detach()
//
//  行為:
//    - 只在 ≤767px(行動版)生效;桌面/平板自動不掛。
//    - 右滑:必須從畫面左緣 EDGE_PX 內起手(像 Discord),才拉出抽屜。
//    - 左滑:抽屜開著時,任意位置左滑可關。
//    - 水平/垂直判別:水平位移需明顯大於垂直(>H_RATIO 倍)且超過 THRESHOLD,
//      否則視為正常垂直捲動,完全不攔截(避免「隨便滑就亂飄」)。
//
//  opts:
//    isOpen()  -> boolean   目前抽屜是否開啟
//    onOpen()               要求開啟
//    onClose()              要求關閉
//    enabled() -> boolean   (選填)是否啟用(預設只看寬度)
// ============================================================
(function () {
  'use strict';

  const EDGE_PX   = 24;   // 左緣起手判定區
  const THRESHOLD = 45;   // 觸發換層的最小水平位移
  const H_RATIO   = 1.5;  // 水平須是垂直的幾倍才算「水平滑」
  const MQ        = '(max-width: 767px)';

  function attachEdgeSwipe(el, opts) {
    if (!el || !opts) return function () {};

    let sx = 0, sy = 0, tracking = false, fromEdge = false, decided = false, horizontal = false;

    function mobile() {
      if (!window.matchMedia(MQ).matches) return false;
      return opts.enabled ? !!opts.enabled() : true;
    }

    function onStart(e) {
      if (!mobile()) return;
      const t = e.touches ? e.touches[0] : e;
      sx = t.clientX; sy = t.clientY;
      tracking = true; decided = false; horizontal = false;
      fromEdge = sx <= EDGE_PX;
    }

    function onMove(e) {
      if (!tracking || !mobile()) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);

      // 還沒判定方向:等位移夠大再決定是水平還是垂直
      if (!decided) {
        if (adx < 10 && ady < 10) return;          // 太小,先不判
        horizontal = adx > ady * H_RATIO;          // 水平須明顯大於垂直
        decided = true;
        if (!horizontal) { tracking = false; return; } // 垂直 → 放手給正常捲動
      }

      // 水平手勢:只有「可動作」的滑動才攔截(左緣右滑開、或開著時左滑關),
      // 其餘水平滑動(例如畫布內平移)放行,避免搶走原生捲動。
      const open = opts.isOpen && opts.isOpen();
      const actionable = (dx > 0 && fromEdge && !open) || (dx < 0 && open);
      if (horizontal && actionable && e.cancelable) e.preventDefault();

      // 右滑開:需從左緣起手
      if (dx > THRESHOLD && fromEdge && !open) {
        opts.onOpen && opts.onOpen();
        tracking = false;
      }
      // 左滑關:抽屜開著時任意位置
      else if (dx < -THRESHOLD && open) {
        opts.onClose && opts.onClose();
        tracking = false;
      }
    }

    function onEnd() { tracking = false; }

    // passive:false 才能在水平手勢時 preventDefault
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    el.addEventListener('touchcancel', onEnd,  { passive: true });

    return function detach() {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.attachEdgeSwipe = attachEdgeSwipe;
})();
