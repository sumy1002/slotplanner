// ============================================================
//  config-editor/template.js — A 設定檔編輯器 · Vue template
//
//  從原 config-editor.js 拆出(v3.4 起的 4 檔架構)
//
//  純字串檔,沒有任何邏輯。掛載點:
//    window.SlotPlanner.ConfigEditor.TEMPLATE
//
//  index.js 會把它組裝進 SP.ConfigPage.template
// ============================================================
(function () {
  'use strict';

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.ConfigEditor = window.SlotPlanner.ConfigEditor || {};

  window.SlotPlanner.ConfigEditor.TEMPLATE = `
<div class="cfg-page" :class="{ 'cfg-dev-mode': devMode }">

  <!-- UI/UX 改版 P3:首次進入編輯器的一次性提示條,帶出「按 ? 看所有快捷鍵」(降低學習成本;關閉後用 localStorage 記住,不再重複出現) -->
  <div v-if="!shortcutsHintDismissed" class="cfg-shortcuts-hint">
    <span class="cfg-shortcuts-hint-icon">💡</span>
    <span class="cfg-shortcuts-hint-text">
      新手上手小提示:許多欄位/清單支援<b>右鍵選單</b>快速操作,按
      <button class="cfg-shortcuts-hint-key" @click="openShortcutsHelpFromHint">Shift + ?</button>
      可隨時看完整的快捷鍵與右鍵選單一覽。
    </span>
    <button class="cfg-shortcuts-hint-close" @click="dismissShortcutsHint" title="不再顯示">✕</button>
  </div>

  <!-- ── 頂部資料來源指示器 ── -->
  <div class="cfg-source-bar">
    <!-- 行動版漢堡鈕:點按開啟分頁列(桌面/平板由 CSS 隱藏)-->
    <button class="cfg-hamburger" @click="cfgTabRailCollapsed = false" title="分頁列" aria-label="開啟分頁列">
      <span class="cfg-hamburger-bars"></span>
    </button>
    <!-- 群組 1:資料來源資訊 -->
    <div class="cfg-source-info">
      <span class="cfg-source-icon"
            @click="onSourceIconClick"
            :title="devMode ? '開發者模式 ON(再點 5 次關閉)' : '資料來源'"
            :class="{ 'cfg-source-icon-dev': devMode }">{{ sourceIcon }}</span>
      <span class="cfg-source-text">{{ sourceText }}</span>
      <span class="cfg-source-text-short" :title="sourceText">{{ sourceTextShort }}</span>
      <span class="cfg-source-dot" v-if="dirty" title="變更尚未寫入本機">●</span>
    </div>
    <span class="cfg-spacer"></span>

    <!-- 群組 2:狀態徽章(健康度 + 變更回顧)-->
    <div class="cfg-source-status">
      <!-- v5.0-b:主題切換移除,唯一入口在 sidebar(app 層級全站有效)-->

      <!-- ══ UI 批 E-3:全站導引晶片(單一槽位;probe 依 active 分頁/規則子分頁自動切換)══ -->
      <button v-if="guideChip" class="cfg-guide-chip cfg-guide-topbar" :class="guideChipCls"
              @click="guideRun" :title="guideChip.label">{{ guideChip.label }}</button>

      <!-- v5.5:即時 RTP 徽章(LINE base;點擊到 reel_weights 看明細)-->
      <button v-if="rtpResult.ok"
              class="cfg-rtp-badge"
              :class="{
                'cfg-rtp-ok':   rtpVsTarget !== null && Math.abs(rtpVsTarget) <= 2,
                'cfg-rtp-low':  rtpVsTarget !== null && rtpVsTarget < -2,
                'cfg-rtp-high': rtpVsTarget !== null && rtpVsTarget > 2
              }"
              @click="active = 'reel_weights'"
              :title="'LINE base RTP 即時估算' + (rtpResult.note ? ' — ' + rtpResult.note : '') + '(點擊看明細)'">
        <span class="cfg-rtp-badge-label">RTP</span>
        <span class="cfg-rtp-badge-val">{{ rtpPct.toFixed(2) }}%</span>
        <span v-if="rtpVsTarget !== null" class="cfg-rtp-badge-delta">
          {{ rtpVsTarget >= 0 ? '+' : '' }}{{ rtpVsTarget.toFixed(1) }}
        </span>
      </button>

      <!-- ── #15 搜尋按鈕 ── -->
      <button class="cfg-search-btn"
              @click="openSearch"
              title="全編輯器搜尋(Ctrl+K)">
        <span class="cfg-search-btn-icon">🔍</span>
        <span class="cfg-search-btn-text">搜尋</span>
        <span class="cfg-search-btn-kbd">⌘K</span>
      </button>

      <!-- UI/UX 改版 P2:快捷鍵一覽按鈕(降低學習成本,不用死記右鍵/快捷鍵) -->
      <button class="cfg-search-btn cfg-shortcuts-btn"
              @click="openShortcutsHelp"
              title="快捷鍵與右鍵選單一覽(Shift + ?)">
        <span class="cfg-search-btn-icon">⌨</span>
        <span class="cfg-search-btn-text">快捷鍵</span>
        <span class="cfg-search-btn-kbd">?</span>
      </button>

    <!-- ── #2 健康度徽章 ── -->
    <span class="cfg-health-host">
      <button class="cfg-health-badge"
              :class="{
                'cfg-health-ok': validationSummary.total === 0,
                'cfg-health-warn': validationSummary.error === 0 && validationSummary.warn > 0,
                'cfg-health-err': validationSummary.error > 0,
                active: validationPanelOpen
              }"
              @click.stop="toggleValidationPanel"
              :title="validationSummary.total === 0
                ? '所有設定通過跨 tab 一致性檢查'
                : '點開查看 ' + validationSummary.total + ' 個問題'">
        <template v-if="validationSummary.total === 0">
          <span class="cfg-health-icon">✓</span>
          <span class="cfg-health-text">健康</span>
        </template>
        <template v-else>
          <span class="cfg-health-icon">{{ validationSummary.error > 0 ? '⚠' : 'ⓘ' }}</span>
          <span class="cfg-health-text">
            <span v-if="validationSummary.error > 0">{{ validationSummary.error }} 錯誤</span>
            <span v-if="validationSummary.error > 0 && validationSummary.warn > 0"> · </span>
            <span v-if="validationSummary.warn > 0">{{ validationSummary.warn }} 警告</span>
          </span>
        </template>
      </button>

        <!-- ══ UI 批 E-2a/E-2b:單格微調氣泡(04 主/副輪/Panel + 05 格數;右鍵格子 / 點例外 chip 開啟;點外部即存,Esc 取消)══ -->
        <!-- 批 F-4:行動版遮罩(桌面 display:none;點遮罩 = 點外部 → pointerdown 捕獲提交即存)-->
        <div v-if="cellPop.open" class="cfg-sheet-scrim" :class="{ 'is-open': cellPop.shown }"></div>
        <div v-if="cellPop.open" class="cfg-popover cfg-cellpop"
             :class="{ 'is-open': cellPop.shown, 'flip-up': cellPop.flipUp }"
             :style="{ left: cellPop.x + 'px', top: cellPop.y + 'px' }"
             tabindex="-1" @pointerdown.stop
             @touchstart.passive="sheetTouchStart" @touchmove.passive="sheetTouchMove" @touchend="sheetTouchEnd">
          <div class="cfg-popover-title">{{ cellPop.label }} 權重微調</div>
          <div class="cfg-popover-field">
            <div class="cfg-cellpop-row">
              <input class="input input-w-num input-center" type="number" min="0" step="1"
                     v-model.number="cellPop.draft"
                     @keyup.enter="commitCellPop">
              <span v-if="cellPop.base !== null" class="cfg-cellpop-base" :title="'該欄基準(眾數)'">基準 {{ cellPop.base }}
                <b v-if="(Number(cellPop.draft) || 0) !== cellPop.base"> · Δ {{ (Number(cellPop.draft) || 0) - cellPop.base }}</b>
              </span>
            </div>
            <input class="cfg-cellpop-slider" type="range" min="0" :max="cellPopSliderMax" step="1"
                   v-model.number="cellPop.draft">
            <div class="cfg-cellpop-quick">
              <button v-if="cellPop.base !== null" class="cfg-matrix-btn" @click="cellPop.draft = cellPop.base" title="還原為該欄基準">= 基準</button>
              <button class="cfg-matrix-btn" @click="cellPop.draft = (Number(cellPop.draft) || 0) * 2" title="此格數值 ×2">×2</button>
              <button class="cfg-matrix-btn" @click="cellPop.draft = Math.round((Number(cellPop.draft) || 0) / 2)" title="此格數值 ÷2">÷2</button>
              <button class="cfg-matrix-btn" @click="cellPop.draft = 0" title="此格數值歸 0">歸 0</button>
              <button v-if="cellPop.kind === 'reel'" class="cfg-matrix-btn" @click="gotoReelException(cellPop.mode, cellPop.rid, cellPop.sid)" title="捲動至矩陣中的這一格">跳至該格 ↦</button>
            </div>
          </div>
          <div class="cfg-popover-hint">點擊外部即自動儲存 · Esc 取消</div>
        </div>

      <!-- popover -->
      <div v-if="validationPanelOpen" class="cfg-health-popover" @click.stop>
        <div class="cfg-health-popover-header">
          <span class="cfg-health-popover-title">
            <template v-if="validationSummary.total === 0">✓ 一切正常</template>
            <template v-else>跨分頁一致性檢查</template>
          </span>
          <button class="cfg-health-popover-close" @click="validationPanelOpen = false" title="關閉">✕</button>
        </div>
        <div class="cfg-health-popover-body">
          <div v-if="validationSummary.total === 0" class="cfg-health-empty">
            <div class="cfg-health-empty-emoji">🎉</div>
            <div class="cfg-health-empty-text">所有模式、符號、路徑、約束都對齊。</div>
            <div class="cfg-health-empty-sub">繼續編輯;有問題會即時出現在這裡。</div>
          </div>
          <div v-else>
            <!-- #4 全案預檢:segmented 篩選(全部/錯誤/警告/提示)-->
            <div class="cfg-health-filter">
              <button v-for="opt in [{k:'all',n:'全部'},{k:'error',n:'錯誤'},{k:'warn',n:'警告'},{k:'info',n:'提示'}]"
                      :key="opt.k" class="cfg-health-filter-btn" :class="{ active: pfFilter===opt.k, ['pf-'+opt.k]: true }"
                      @click="setPfFilter(opt.k)">{{ opt.n }} <b>{{ pfCounts[opt.k] }}</b></button>
            </div>
            <div v-if="!pfIssuesByTab.length" class="cfg-health-filter-empty">此類別目前沒有項目。</div>
            <div v-for="(grp, gpi) in pfIssuesByTab" :key="grp.tab?.id || ('g' + gpi)" class="cfg-health-tab-group">
              <div class="cfg-health-tab-group-header">
                <span class="cfg-health-tab-icon">{{ grp.tab?.icon || '⚠' }}</span>
                <span class="cfg-health-tab-name">{{ grp.tab?.sheet || '未知分頁' }}</span>
                <span class="cfg-health-tab-count">{{ grp.issues.length }}</span>
                <button v-if="grp.tab" class="cfg-health-goto" @click="goToTabFromValidation(grp.tab.id)" title="前往這個分頁">前往 →</button>
              </div>
              <div v-for="(iss, idx) in grp.issues" :key="idx"
                   class="cfg-health-item"
                   :class="'cfg-health-item-' + iss.severity">
                <span class="cfg-health-item-sev">{{ iss.severity === 'error' ? '⚠' : 'ⓘ' }}</span>
                <div class="cfg-health-item-text">
                  <div class="cfg-health-item-msg">{{ iss.msg }}</div>
                  <div v-if="iss.detail" class="cfg-health-item-detail">{{ iss.detail }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </span>

    <!-- ── #10 變更回顧 ── -->
    <span class="cfg-changes-host">
      <button class="cfg-changes-badge"
              :class="{
                'cfg-changes-empty': changesSummary.total === 0,
                'cfg-changes-has': changesSummary.total > 0,
                active: changesPanelOpen
              }"
              @click.stop="toggleChangesPanel"
              :title="changesSummary.total === 0
                ? '自基準點以來沒有變更'
                : '查看自基準點以來的 ' + changesSummary.total + ' 項變更'">
        <span class="cfg-changes-icon">📝</span>
        <span class="cfg-changes-text">
          <template v-if="changesSummary.total === 0">無變更</template>
          <template v-else>{{ changesSummary.total }} 變更</template>
        </span>
      </button>

      <div v-if="changesPanelOpen" class="cfg-changes-popover" @click.stop>
        <div class="cfg-changes-popover-header">
          <span class="cfg-changes-popover-title">📝 變更回顧</span>
          <button class="cfg-changes-popover-close" @click="changesPanelOpen = false" title="關閉">✕</button>
        </div>
        <div class="cfg-changes-baseline-info">
          <div class="cfg-changes-baseline-label">基準點:</div>
          <div class="cfg-changes-baseline-text">
            <template v-if="baselineInfo">
              {{ baselineInfo.sourceLabel }} · {{ formatBaselineTime(baselineInfo.takenAt) }}
            </template>
            <template v-else>(尚未建立)</template>
          </div>
          <button class="cfg-changes-baseline-reset"
                  @click="resetBaseline"
                  title="將目前狀態設為新基準,清空變更列表">設新基準</button>
        </div>
        <div class="cfg-changes-popover-body">
          <div v-if="changesSummary.total === 0" class="cfg-changes-body-empty">
            <div class="cfg-changes-empty-emoji">∅</div>
            <div class="cfg-changes-empty-text">自基準點以來沒有變更。</div>
            <div class="cfg-changes-empty-sub">修改任何設定後,變更摘要會即時出現在這裡。</div>
          </div>
          <div v-else>
            <div v-for="grp in changesByTab" :key="grp.tab + '|' + grp.sheet" class="cfg-changes-tab-group">
              <div class="cfg-changes-tab-header">
                <span class="cfg-changes-tab-name">{{ grp.sheet }}</span>
                <span class="cfg-changes-tab-count">{{ grp.changes.length }}</span>
                <button class="cfg-changes-goto" @click="goToTabFromChanges(grp.tab)" title="前往這個分頁">前往 →</button>
              </div>
              <div v-for="(c, idx) in grp.changes" :key="idx"
                   class="cfg-changes-item"
                   :class="'cfg-changes-item-' + c.kind">
                <span class="cfg-changes-item-icon">{{ c.kind === 'add' ? '+' : c.kind === 'remove' ? '−' : '~' }}</span>
                <div class="cfg-changes-item-text">
                  <div class="cfg-changes-item-msg">{{ c.text }}</div>
                  <div v-if="c.detail" class="cfg-changes-item-detail">{{ c.detail }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </span>
    </div><!-- /cfg-source-status -->

    <!-- 群組 3:檔案動作 — v7.6.1:暫時隱藏(目前用不到;保留 markup/handler 供日後維護)。
         要恢復顯示,把 v-if="false" 改成 v-if="true" 或移除即可。 -->
    <div class="cfg-source-files" v-if="true">
      <label class="btn-pill cfg-import-btn" title="從本機選擇 A.xlsx,解析並覆蓋目前所有設定">
        <span class="cfg-btn-icon">⇧</span>
        <span class="cfg-btn-text-full">匯入 A.xlsx</span>
        <span class="cfg-btn-text-short">匯入</span>
        <input type="file" accept=".xlsx,.xlsm" @change="onImportFile" hidden>
      </label>
      <button class="btn-pill" @click="exportXlsx" title="把目前所有分頁的設定下載為 A.xlsx">
        <span class="cfg-btn-icon">⇩</span>
        <span class="cfg-btn-text-full">匯出 A.xlsx</span>
        <span class="cfg-btn-text-short">匯出</span>
      </button>
    </div>

    <!-- 範本按鈕(獨立)-->
    <button class="btn-pill cfg-tpl-btn"
            :class="{ active: showTemplatePanel }"
            @click="toggleTemplatePanel"
            title="範本管理:可存多份設定快照,在不同設計案間切換">
      <span class="cfg-btn-icon">💾</span>
      <span class="cfg-btn-text-full">範本{{ userTemplateCount > 0 ? ' (' + userTemplateCount + ')' : '' }}</span>
      <span class="cfg-btn-text-short">範本</span>
    </button>
  </div>

  <!-- ── 範本管理面板(可折疊)── -->
  <div v-if="showTemplatePanel" class="cfg-tpl-panel">
    <div class="cfg-tpl-header">
      <span class="cfg-tpl-title">📋 設定範本管理</span>
      <span class="cfg-tpl-hint">把目前所有設定存為快照,可在不同設計案間切換</span>
      <button class="cfg-tpl-close" @click="showTemplatePanel = false" title="收合面板">✕</button>
    </div>

    <!-- 篩選列(永遠顯示) -->
    <div v-if="templateList.length > 0" class="cfg-tpl-filter-row">
      <input class="input cfg-tpl-search"
             v-model.trim="templateSearch"
             placeholder="🔍 搜尋名稱或說明…">
      <select class="input cfg-tpl-sort" v-model="templateSortBy">
        <option v-for="o in TEMPLATE_SORT_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
      <span class="cfg-tpl-filter-count">
        {{ filteredSortedTemplates.length }} / {{ templateList.length }}
      </span>
      <button class="cfg-tpl-diffbtn"
              @click="openDiffModal(null)"
              :disabled="templateList.length < 2"
              :title="templateList.length < 2 ? '需要至少 2 個範本才能比較' : '比較兩個範本的設定差異'">
        <span>⇄</span>
        <span>比較</span>
      </button>
      <button class="cfg-tpl-newbtn"
              :class="{ active: tplSaveOpen }"
              @click="tplSaveOpen = !tplSaveOpen"
              title="把目前設定存為新範本">
        <span>{{ tplSaveOpen ? '✕' : '+' }}</span>
        <span>{{ tplSaveOpen ? '收起' : '存為新範本' }}</span>
      </button>
    </div>

    <!-- 另存為新範本(預設收合,點 + 存為新範本 才展開) -->
    <div v-if="tplSaveOpen" class="cfg-tpl-save cfg-tpl-save-expanded">
      <input class="input cfg-mono cfg-tpl-name-input"
             v-model.trim="newTemplateName"
             placeholder="範本名稱(例:A案_客戶X)"
             @keyup.enter="handleSaveAsTemplate"
             ref="tplNameInputRef">
      <input class="input cfg-tpl-desc-input"
             v-model.trim="newTemplateDesc"
             placeholder="說明(選填)"
             @keyup.enter="handleSaveAsTemplate">
      <button class="btn-pill cfg-tpl-save-btn"
              :disabled="!newTemplateName"
              @click="handleSaveAsTemplate">💾 儲存</button>
    </div>

    <!-- 範本清單 -->
    <div class="cfg-tpl-list" v-if="templateList.length > 0">
      <div v-for="t in filteredSortedTemplates" :key="t.slug" class="cfg-tpl-item cfg-reveal-zone"
           :class="{ 'cfg-tpl-item-auto': t.name && t.name.startsWith('🤖'),
                     'cfg-tpl-item-builtin': t.builtin }">
        <div class="cfg-tpl-info">
          <div class="cfg-tpl-name">{{ t.name }}<span v-if="t.builtin"
                class="cfg-tpl-badge-builtin"
                title="內建示範範本:不佔範本額度、不可刪除;載入後可任意修改再另存為自己的範本">內建</span></div>
          <div class="cfg-tpl-desc" v-if="t.description">{{ t.description }}</div>
          <div class="cfg-tpl-meta">
            <span>建立 {{ t.created.slice(0,10) }}</span>
            <span v-if="t.modified !== t.created">· 修改 {{ t.modified.slice(0,10) }}</span>
            <span class="cfg-tpl-counts">
              · 模式 {{ t.counts.modes }} · 規則 {{ t.counts.rules }}
              · 棄牌 {{ t.counts.discards }} · 符號 {{ t.counts.symbols }}
            </span>
          </div>
        </div>
        <div class="cfg-tpl-actions">
          <button class="cfg-tpl-action cfg-tpl-load"
                  @click="loadTemplateConfirm(t)"
                  title="載入此範本(會覆蓋目前設定)">▶ 載入</button>
          <button class="cfg-tpl-action cfg-tpl-diff"
                  @click="openDiffModal(t.slug)"
                  title="與另一範本比較差異">⇄ 比較</button>
          <button class="cfg-tpl-action"
                  @click="exportTemplateFile(t)"
                  title="下載為 JSON 檔(可分享給他人)">⇩ 匯出</button>
          <button v-if="!t.builtin" class="cfg-tpl-action cfg-tpl-delete cfg-reveal"
                  @click="deleteTemplateConfirm(t)"
                  title="刪除此範本">✕ 刪除</button>
        </div>
      </div>
      <div v-if="filteredSortedTemplates.length === 0 && templateSearch"
           class="cfg-tpl-no-match">
        🔍 沒有符合「{{ templateSearch }}」的範本
      </div>
    </div>
    <div v-else class="cfg-tpl-empty">
      <div class="cfg-tpl-empty-icon">📭</div>
      <div>尚無範本</div>
      <div class="cfg-tpl-empty-sub">把目前設定存起來,在不同設計案間切換</div>
      <button class="btn-pill cfg-tpl-empty-cta"
              @click="tplSaveOpen = true">+ 建立第一份範本</button>
    </div>

    <!-- 從 JSON 匯入 -->
    <div class="cfg-tpl-import">
      <label class="btn-pill" title="從本機選擇 JSON 範本檔,加入清單(不會覆蓋目前設定)">
        ⇧ 從 JSON 匯入範本
        <input type="file" accept=".json,application/json" @change="onImportTemplate" hidden>
      </label>
    </div>
  </div>

  <!-- ── 左 tab 列 + 右內容 ── -->
  <div class="cfg-body">

    <!-- 行動版抽屜遮罩:點擊收起分頁列(桌面/平板由 CSS 隱藏)-->
    <div class="cfg-drawer-scrim" @click="cfgTabRailCollapsed = true"></div>

    <!-- ── 左:分組分頁列 ── -->
    <!-- v7.9.2:桌面收合態的流佔位(56px),讓 hover 浮層 absolute 化時內容不位移 -->
    <div class="cfg-tabs-spacer" :class="{ 'cfg-rail-pinned': cfgRailPinned }"></div>
    <div class="cfg-tabs" :class="{ 'cfg-tabs-collapsed': cfgTabRailCollapsed, 'cfg-rail-pinned': cfgRailPinned }"
         @mouseenter="onRailReopen()">
      <!-- v6.1:收合切換 — 行動版開關抽屜;桌面切換常駐展開/收合(hover 浮層) -->
      <button class="cfg-tabrail-toggle"
              @click="cfgTabRailCollapsed = !cfgTabRailCollapsed; toggleCfgRailPinned(); onRailReopen()"
              :title="cfgRailPinned ? '收合分頁列（移入時暫時展開）' : '釘選展開分頁列'">
        <span class="cfg-tabrail-toggle-icon">{{ cfgRailPinned ? '«' : '»' }}</span>
        <span class="cfg-tabrail-toggle-label">{{ cfgRailPinned ? '收合分頁列' : '釘選展開' }}</span>
      </button>
      <div v-for="grp in visibleTabGroups" :key="grp.id" class="cfg-tab-group">
        <div class="cfg-tab-group-header">
          <span class="cfg-tab-group-icon">{{ grp.icon }}</span>
          <span class="cfg-tab-group-label">{{ grp.label }}</span>
          <span v-if="groupDirtyCount(grp) > 0"
                class="cfg-tab-group-dirty-count"
                :title="groupDirtyCount(grp) + ' 個分頁有未匯出的變動'">{{ groupDirtyCount(grp) }}</span>
        </div>
        <template v-for="t in grp.tabs" :key="t.id">
        <div class="cfg-tab"
             :class="{
               active: t.id === 'rules'
                 ? (active === 'rules' || active === 'paylines')
                 : (t.id === 'reel_weights'
                     ? (active === 'reel_weights' || active === 'reel_strips' || active === 'grid_size_weights' || active === 'distribution_bins')
                     : active === t.id),
               'cfg-tab-rules-parent': t.id === 'rules',
               'cfg-tab-dirty': dirtyTabs[t.id],
               'cfg-tab-na': tabNotApplicable(t.id)
             }"
             @click="t.id === 'rules' ? onRulesParentClick() : (active = t.id, cfgTabRailCollapsed = true)"
             :title="tabNotApplicable(t.id) ? tabNAReason(t.id) : (t.name + (t.desc ? ' · ' + t.desc : ''))">
          <span class="cfg-tab-icon">{{ t.icon }}</span>
          <div class="cfg-tab-text">
            <div class="cfg-tab-name">{{ t.name }}<span v-if="tabNotApplicable(t.id)" class="cfg-tab-na-lock" title="目前模式不適用">🔒</span><span v-if="t.id === 'rules'" class="cfg-tab-rules-caret">{{ rulesNavExpanded ? '▾' : '▸' }}</span></div>
          </div>
          <!-- v3.4 / B5:tab 上的問題徽章(err 紅 / warn 黃,優先 err)-->
          <span v-if="issuesByTab.find(g2 => g2.tab.id === t.id && g2.issues.some(i => i.severity === 'error'))"
                class="cfg-tab-issue-badge cfg-tab-issue-err"
                :title="'此分頁有錯誤'">⚠</span>
          <span v-else-if="issuesByTab.find(g2 => g2.tab.id === t.id && g2.issues.some(i => i.severity === 'warn'))"
                class="cfg-tab-issue-badge cfg-tab-issue-warn"
                :title="'此分頁有警告'">!</span>
          <span v-if="dirtyTabs[t.id]" class="cfg-tab-dirty-dot" title="此分頁有未匯出的變動"></span>
        </div>
        </template>
      </div>
    </div>

    <!-- ── 右:當前分頁內容 ── -->
    <!-- 浮動「重設此頁」按鈕在 cfg-content 之外(cfg-body 內),避免被內部捲動帶走 -->
    <button v-if="activeTab.kind !== 'fullpane'"
            class="cfg-content-reset-fab"
            @click="resetCurrent"
            :title="'重設本分頁(' + (activeTab.name || '') + ')為預設值'">
      <span class="cfg-content-reset-icon">↺</span>
      <span class="cfg-content-reset-text">重設此頁</span>
    </button>

    <!-- 行動版下鑽返回列(桌面/平板由 CSS 隱藏;只在 ≤767 詳細視圖顯示)-->
    <!-- v7.6.1:分頁列開啟改用頂部漢堡鈕;關閉用拖曳/遮罩。原 cfg-mobile-back 返回列移除以免重複 -->

    <div class="cfg-content" :class="{ 'cfg-content-fullpane': activeTab.kind === 'fullpane',
                                       'cfg-content--fit': isFitTab,
                                       'has-pinned-inspector': !!pinnedTest }">

      <!-- v3.4 / B5:當前 tab 的 issues sticky banner(只有有 issue 才顯示)-->
      <div v-if="activeTab.kind !== 'fullpane' && activeTabIssues().length > 0"
           class="cfg-tab-issues-banner"
           :class="{
             'is-err': activeTabIssues().some(i => i.severity === 'error'),
             'is-warn': !activeTabIssues().some(i => i.severity === 'error'),
           }">
        <span class="cfg-tab-issues-icon">{{ activeTabIssues().some(i => i.severity === 'error') ? '⚠' : 'ⓘ' }}</span>
        <span class="cfg-tab-issues-title">
          此分頁有 {{ activeTabIssues().length }} 個需注意的項目
        </span>
        <div class="cfg-tab-issues-list">
          <span v-for="(iss, idx) in activeTabIssues().slice(0, 3)" :key="idx"
                class="cfg-tab-issue-pill"
                :class="'cfg-tab-issue-pill-' + iss.severity"
                :title="iss.detail || iss.msg">
            {{ iss.msg }}
          </span>
          <span v-if="activeTabIssues().length > 3" class="cfg-tab-issues-more">
            +{{ activeTabIssues().length - 3 }} 個...
          </span>
        </div>
        <button class="cfg-tab-issues-view-all"
                @click="validationPanelOpen = true"
                title="開啟完整檢查面板">查看全部</button>
      </div>

      <!-- ═══════ 01_Global 全域設定(已實作)═══════ -->
      <!-- v7.10:01_Global 全域設定已併入規則頁(賠付橫幅 + 模式子分頁);此面板保留為隱藏 v-if 鏈頭,永不渲染。markup/handler/匯出皆保留於規則頁。 -->
      <div v-if="active === 'global'" class="cfg-form"></div>

      <!-- ═══════ 13_Jackpots JP 彩金(v6.2 #0 獨立分頁)═══════ -->

      <!-- ═══════ 02_Layout 盤面結構 ═══════ -->
      <div v-else-if="active === 'layout'" class="cfg-form cfg-layout-v2" style="display:flex;flex-direction:column;">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">🎰 02_Layout · 盤面結構</div>
          <div class="cfg-form-sub">
            定義每個 Reel 的位置與高度,可組出不規則盤(diamond / 含 SubReel)。
            Y_Offset 正值偏下、負值偏上,所有 Reel 以「列號」(row index)對齊。
          </div>

          <!-- 盤面#2:Megaways 提示(§5.2 Stage D:改逐模式 gate)-->
          <div v-if="modes.some(m => m.rows_variable)"
               style="margin-top:8px; padding:8px 10px; background:rgba(120,90,200,0.10); border:1px solid rgba(120,90,200,0.30); border-radius:8px; font-size:12px; color:var(--text);">
            ⥯ <strong>Megaways 模式</strong>:每轉各輪顯示的列數會隨機變動(通常 2–7)。此處的「列數」代表<strong>最大可見列數</strong>;重點在決定<strong>輪數</strong>,固定列高較不重要。
          </div>

          <!-- v3.3:盤面範本快速套用 -->
          <div class="cfg-layout-preset-bar">
            <span class="cfg-layout-preset-label">📐 快速套用範本</span>
            <div class="cfg-layout-preset-chips">
              <button v-for="p in LAYOUT_PRESETS" :key="p.key"
                      class="cfg-layout-preset-chip"
                      :title="p.note"
                      @click="applyLayoutPreset(p.key)">
                <span class="cfg-layout-preset-chip-label">{{ p.label }}</span>
              </button>
            </div>
            <div class="cfg-layout-preset-hint">套用時會替換整個 layout(會跳確認框)</div>
          </div>
        </div>

        <!-- §5.1:中獎方式卡(全域;pay_type + 方向;由規則頁遷入)-->
        <div class="cfg-paymethod-host">
        <!-- 區塊 2:賠付模型(可折疊,預設展開)-->
        <div class="cfg-section cfg-section-card" :class="{ 'is-closed': !payModelOpen }">
          <div class="cfg-section-title cfg-card-head" @click="togglePayModel">
            <span class="cfg-section-title-text">中獎方式</span>
            <span class="cfg-paymethod-tag">全域</span>
            <span v-if="!payModelOpen" class="cfg-card-summary">
              <span class="cfg-card-summary-chip">{{ payModelSummary }}</span>
            </span>
            <span class="cfg-card-caret" :class="{ open: payModelOpen }" title="展開 / 收合">›</span>
          </div>
          <div v-show="payModelOpen" class="cfg-card-body">

          <div class="cfg-field">
            <label class="cfg-label">
              賠付類型 <span class="cfg-key">pay_type</span>
            </label>
            <div class="cfg-chip-row">
              <button v-for="m in PAY_MODELS" :key="m.id"
                      class="cfg-chip"
                      :class="{ active: activePayModel === m.id }"
                      :title="m.desc"
                      @click="selectPayModel(m.id)">{{ m.label }}</button>
            </div>
            <div class="cfg-hint">Line = 中獎線 / WAYS = 全路徑(相鄰輪同符)/ Grid = 任意位置(散佈)/ Cluster = 同符相鄰群。可變列高(Megaways)改於「盤面幾何」卡逐模式設定。</div>
          </div>

          <div class="cfg-field" v-if="scanDirApplicable">
            <label class="cfg-label">
              計分方向 <span class="cfg-key">direction</span>
            </label>
            <div class="cfg-chip-row">
              <button v-for="d in WAYS_DIRS" :key="d"
                      class="cfg-chip"
                      :class="{ active: curScanDir === d }"
                      @click="setScanDir(d)">{{ scanDirLabel(d) }}</button>
            </div>
            <div class="cfg-hint">L→R = 左到右 / L←R = 右到左 / 雙向 = 兩端都算。此為全域唯一的計分方向,同時套用到中獎線與全路徑(WAYS / Megaways)。</div>
            <!-- P0-1a / D9:雙向計分去重(泛化 LINE+WAYS 共用;取代舊 WAYS-only 版與孤兒 longest_line_once)。
                 g.longest_line_once 舊值保留於 g、不刪除(可能供下游模擬器讀取)。 -->
            <label class="cfg-checkbox-row" v-if="curScanDir === 'BOTH' && g.pay_type !== 'SCATTER' && g.pay_type !== 'CLUSTER'" style="display:flex; align-items:center; gap:8px; margin-top:8px;">
              <input type="checkbox" v-model="g.ways_both_dedup">
              <span>雙向計分：同組合僅計分一次 <span class="cfg-hint" style="display:inline;">（雙向時,同一符號組合左右兩向皆成立不重複計分；LINE 與 WAYS 共用；規格宣告,供數值端遵循）</span></span>
            </label>
          </div>

          <div class="cfg-field" v-if="g.pay_type === 'CLUSTER'">
            <label class="cfg-label">
              Cluster 最小群組 <span class="cfg-key">cluster_min_size</span>
            </label>
            <div class="cfg-stepper">
              <button class="cfg-stepper-btn"
                      :disabled="(g.cluster_min_size || 0) <= 2"
                      @click="g.cluster_min_size = Math.max(2, (g.cluster_min_size || 5) - 1)">−</button>
              <span class="cfg-stepper-val">{{ g.cluster_min_size }}</span>
              <button class="cfg-stepper-btn"
                      :disabled="(g.cluster_min_size || 0) >= 20"
                      @click="g.cluster_min_size = Math.min(20, (g.cluster_min_size || 5) + 1)">+</button>
            </div>
            <div class="cfg-hint">CLUSTER Pay 達多少個相連同符算中獎(2–20)</div>
          </div>

          <!-- v8.28 / 缺口C:跨來源倍數複合方式(全域;規格描述,交下游遵循) -->
          <div class="cfg-field">
            <label class="cfg-label">
              跨來源倍數複合 <span class="cfg-key">mult_compose</span>
            </label>
            <div class="cfg-chip-row">
              <button class="cfg-chip" :class="{ active: (g.mult_compose || 'MUL') === 'MUL' }" @click="g.mult_compose = 'MUL'">相乘</button>
              <button class="cfg-chip" :class="{ active: g.mult_compose === 'ADD' }" @click="g.mult_compose = 'ADD'">相加</button>
              <button class="cfg-chip" :class="{ active: g.mult_compose === 'MAX' }" @click="g.mult_compose = 'MAX'">取最高</button>
            </div>
            <div class="cfg-hint">多來源倍數(單顆 instance_mult × 全域連鎖 × 特色)如何複合。固定套用順序：單顆 → 全域 → 特色。規格描述,交下游遵循;各模式可於下方「模式清單」個別覆寫。</div>
          </div>

          <!-- v8.39 / GAP-F1+軌道:全域補盤軌道 + 主盤跨局捲軸宣告 -->
          <div class="cfg-field">
            <label class="cfg-label">補盤路徑(可選) <span class="cfg-key">refill_track</span></label>
            <select class="input input-w-name" v-model="g.refill_track">
              <option value="">（沿用重力/滾動補盤）</option>
              <option v-for="to in trackOptions" :key="'rt'+to.value" :value="to.value">{{ to.label }}</option>
              <option v-if="isOrphanTrackRef(g.refill_track)" :value="g.refill_track">{{ g.refill_track }}（⚠ 軌道不存在）</option>
            </select>
            <div class="cfg-hint">消除後補盤沿此軌道推進(Finn 螺旋式);空 = 現行重力/滾動補盤。軌道於 02_Layout 頁定義;推進實作歸下游。</div>
          </div>
          <div class="cfg-field">
            <label class="cfg-label">主盤跨局捲軸(可選) <span class="cfg-key">scroll_track / scroll_step</span></label>
            <div style="display:flex; gap:8px; align-items:center;">
              <select class="input input-w-name" v-model="g.scroll_track">
                <option value="">（主盤不捲動）</option>
                <option v-for="to in trackOptions" :key="'st'+to.value" :value="to.value">{{ to.label }}</option>
                <option v-if="isOrphanTrackRef(g.scroll_track)" :value="g.scroll_track">{{ g.scroll_track }}（⚠ 軌道不存在）</option>
              </select>
              <input class="input input-sm cfg-mono" type="number" v-model.number="g.scroll_step" style="width:90px;" title="每局位移格數(可負=反向)">
            </div>
            <div class="cfg-hint">每局盤面內容沿軌道位移 N 格;位移狀態跨局累計由下游追蹤,本工具只宣告軌道與步幅。</div>
          </div>
          </div><!-- /cfg-card-body -->
        </div><!-- /賠付模型 -->
        </div>

        <!-- §5.2 Stage B:盤面幾何卡(逐模式列數;固定 / 可變 Megaways + 逐輪細調)-->
        <div class="cfg-paymethod-host">
          <div class="cfg-section cfg-section-card" :class="{ 'is-closed': !gridGeomOpen }">
            <div class="cfg-section-title cfg-card-head" @click="toggleGridGeom">
              <span class="cfg-section-title-text">盤面幾何</span>
              <span class="cfg-paymethod-tag">逐模式</span>
              <span v-if="!gridGeomOpen" class="cfg-card-summary">
                <span class="cfg-card-summary-chip">{{ modes.length }} 個模式</span>
              </span>
              <span class="cfg-card-caret" :class="{ open: gridGeomOpen }" title="展開 / 收合">›</span>
            </div>
            <div v-show="gridGeomOpen" class="cfg-card-body">
              <div class="cfg-hint" style="margin-bottom:8px;">每個模式各自決定列數固定或可變(Megaways)。純描述,不做實際生成 — 執行交下游模擬工具。</div>
              <div v-for="(m, gmi) in modes" :key="m.mode || ('gm' + gmi)" class="cfg-gg-mode">
                <div class="cfg-gg-mode-head">
                  <span class="cfg-gg-mode-name">{{ m.mode || '(未命名)' }}</span>
                  <div class="cfg-chip-row cfg-gg-seg">
                    <button class="cfg-chip" :class="{ active: !m.rows_variable }" @click="setModeGridFixed(m)">固定</button>
                    <button class="cfg-chip" :class="{ active: m.rows_variable }" @click="setModeGridVariable(m)">可變(Megaways)</button>
                  </div>
                </div>
                <div v-if="m.rows_variable" class="cfg-gg-body">
                  <div v-if="!modePerReelOn(m)" class="cfg-gg-bcast">
                    <span>每輪</span>
                    <input class="cfg-gg-num" type="number" min="1" v-model.number="m.row_min" @change="clampModeGridBroadcast(m)">
                    <span>到</span>
                    <input class="cfg-gg-num" type="number" min="1" v-model.number="m.row_max" @change="clampModeGridBroadcast(m)">
                    <span>列</span>
                  </div>
                  <label class="cfg-gg-perreel-toggle">
                    <input type="checkbox" :checked="modePerReelOn(m)" @change="toggleModePerReel(m, $event.target.checked)">
                    <span>逐輪細調(各輪範圍不同,如主輪 2–7 + 頂輪固定 4)</span>
                  </label>
                  <div v-if="modePerReelOn(m)" class="cfg-gg-reeltable">
                    <div v-for="rr in m.reel_ranges" :key="rr.reel_id" class="cfg-gg-reelrow">
                      <span class="cfg-gg-reellabel">R{{ rr.reel_id }}</span>
                      <input class="cfg-gg-num" type="number" min="1" v-model.number="rr.min_rows" @change="clampReelRange(m, rr)">
                      <span>–</span>
                      <input class="cfg-gg-num" type="number" min="1" v-model.number="rr.max_rows" @change="clampReelRange(m, rr)">
                      <span class="cfg-gg-reelcap">上限 {{ reelCapById(rr.reel_id) }}</span>
                    </div>
                  </div>
                  <div class="cfg-hint cfg-gg-cap">每次旋轉每輪列數在範圍內變動;描述用,不做實際生成。</div>
                </div>
                <div v-else class="cfg-gg-body">
                  <div class="cfg-hint cfg-gg-cap">各輪列數固定,沿用盤面列數。</div>
                </div>
                <!-- ── G-7/8 / W1:特色期列上限(0/空=無特色成長;White Rabbit 12、Cygnus 8)── -->
                <div class="cfg-gg-feature" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                  <label class="cfg-label" style="font-size:12px;">特色期列上限 <span class="cfg-key">Feature_Max</span></label>
                  <input class="cfg-gg-num" type="number" min="0" v-model.number="m.row_feature_max" title="特色期可成長到的列上限;0=無特色成長">
                  <span class="cfg-hint" style="font-size:11px;">0＝無特色成長</span>
                </div>
                <!-- ── G-7/8 / W2:動態幾何轉變子卡(遊玩中變欄高/輪數/列數;純描述,執行歸下游)── -->
                <details class="cfg-gg-geo" style="margin-top:4px;">
                  <summary style="cursor:pointer; font-size:12px; opacity:.8;">
                    動態幾何轉變 <span class="cfg-key">02e</span>
                    <span v-if="(m.geometry_transitions || []).length" class="cfg-key">{{ (m.geometry_transitions || []).length }} 條</span>
                  </summary>
                  <div class="cfg-hint" style="font-size:11px; margin:4px 0;">遊玩中盤面尺寸變化(維度／觸發／step／上限／ways 重算)；對接 GROW_BOARD／EXPAND_REEL，執行歸下游。</div>
                  <div v-for="(t, ti) in m.geometry_transitions" :key="'gt' + ti" class="cfg-bf-row" style="flex-wrap:wrap; margin-bottom:4px;">
                    <div class="cfg-bf-cell">
                      <label class="cfg-label">維度</label>
                      <select class="input input-w-name" v-model="t.dimension">
                        <option v-for="o in GEOMETRY_DIMENSIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
                      </select>
                    </div>
                    <div class="cfg-bf-cell">
                      <label class="cfg-label">觸發</label>
                      <input class="input input-w-id cfg-mono" type="text" v-model.trim="t.trigger_source" placeholder="SCAT / 事件名">
                    </div>
                    <div class="cfg-bf-cell">
                      <label class="cfg-label">step</label>
                      <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="t.step" placeholder="+1">
                    </div>
                    <div class="cfg-bf-cell">
                      <label class="cfg-label">上限</label>
                      <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="t.cap" placeholder="12">
                    </div>
                    <div class="cfg-bf-cell">
                      <label class="cfg-label">ways 重算</label>
                      <select class="input input-w-name" v-model="t.ways_recompute">
                        <option v-for="o in WAYS_RECOMPUTE_OPTIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
                      </select>
                    </div>
                    <div class="cfg-bf-cell cfg-bf-cell-grow">
                      <label class="cfg-label">備註</label>
                      <input class="input input-w-name" type="text" v-model.trim="t.notes" placeholder="延展轉軸 7→12">
                    </div>
                    <button class="cfg-mode-delete-btn cfg-bf-del" @click="removeGeometryTransition(m, ti)" title="刪除">✕</button>
                  </div>
                  <button class="cfg-mode-add-btn" @click="addGeometryTransition(m)" style="font-size:12px;">
                    <span style="font-size:14px">+</span><span>新增幾何轉變</span>
                  </button>
                </details>
              </div>
            </div>
          </div>
        </div>

        <!-- ── 新版三欄式：索引側欄 + 詳情大區（欄位 + 嵌入預覽） ── -->
        <div class="cfg-layout-v2-body" :class="{ 'cv-hints-off': !boardHints }">

          <!-- 左欄：Reel 索引 chip 列 -->
          <div class="cfg-layout-v2-index">
            <div class="cfg-layout-v2-index-scroll">
              <div v-for="(r, idx) in layout" :key="r.reel_id" class="cfg-layout-reel-chip-wrap">
              <button
                class="cfg-layout-reel-chip"
                :class="{
                  active: activeReelIdx === idx && activePanelIdx < 0,
                  'group-selected': selectedReelIdxs.includes(idx),
                  'has-sub': r.has_subreel,
                  'drag-over': dragOverIdx === idx && dragReelIdx !== idx,
                  'dragging': dragReelIdx === idx
                }"
                :draggable="!cvDirty"
                @dragstart="onReelDragStart(idx, $event)"
                @dragover.prevent="onReelDragOver(idx)"
                @dragleave="onReelDragLeave(idx)"
                @drop.prevent="onReelDrop(idx)"
                @dragend="onReelDragEnd()"
                @click="onReelChipClick(idx, $event)"
                :title="'R' + r.reel_id + (r.has_subreel ? ' (含副 Reel)' : '') + ' · 點擊選取 · Ctrl/Shift 多選做群組編輯' + (cvDirty ? ' · (畫布有未套用編輯,暫停拖曳換序)' : ' · 可拖曳互換')"
              >
                <span class="cfg-layout-reel-chip-grip" title="拖曳互換">⋮⋮</span>
                <span class="cfg-layout-reel-chip-id">R{{ r.reel_id }}</span>
                <span v-if="r.has_subreel" class="cfg-layout-reel-chip-sub-dot" title="含副 Reel">●</span>
                <span class="cfg-layout-reel-chip-rows">{{ r.max_rows }}列</span>
              </button>
              <button v-if="r.has_subreel"
                      class="cfg-layout-subreel-chip"
                      :class="{ active: activeReelIdx === idx && activePanelIdx < 0 }"
                      @click="onReelChipClick(idx, $event)"
                      :title="'R' + r.reel_id + ' 的副盤 · ' + (SUBREEL_KINDS.find(k=>k.key===(r.subreel_kind||'STACK'))||{}).label + ' · ' + (r.subreel_position || 'BOTTOM') + ' · ' + r.subreel_rows + ' 列 · 點擊編輯'">
                <span class="cfg-layout-subreel-chip-icon">{{ (SUBREEL_KINDS.find(k=>k.key===(r.subreel_kind||'STACK'))||{}).icon || '↳' }}</span>
                <span class="cfg-layout-subreel-chip-label">副 R{{ r.reel_id }}</span>
                <span class="cfg-layout-reel-chip-rows">{{ r.subreel_rows }}列</span>
              </button>
              </div>
            </div>
            <div class="cfg-layout-v2-index-footer">
              <button class="cfg-layout-v2-add-btn" @click="addReel" :disabled="cvDirty" :title="cvDirty ? '畫布有未套用編輯時鎖定;套用或捨棄後可新增' : '新增 Reel'">
                <span>＋</span>
              </button>
            </div>

            <!-- v4.7:自由副盤 (Panel) 群組（與主輪分開）-->
            <div class="cfg-panel-group">
              <div class="cfg-panel-group-title">🧩 自由副盤</div>
              <div v-for="(p, pi) in panels" :key="'pnl'+pi"
                   class="cfg-panel-chip"
                   :class="{ active: activePanelIdx === pi }"
                   @click="selectPanel(pi)"
                   :title="p.panel_id + ' · ' + p.width + '×' + p.height + (p.join_payline ? ' · 參與連線' : ' · 獨立')">
                <span class="cfg-panel-chip-id">{{ p.panel_id }}</span>
                <span class="cfg-panel-chip-size">{{ p.width }}×{{ p.height }}</span>
                <span v-if="p.join_payline" class="cfg-panel-chip-join" title="參與主盤連線">🔗</span>
                <button class="cfg-panel-chip-del" @click.stop="removePanel(pi)" :disabled="cvDirty" :title="cvDirty ? '畫布有未套用編輯時鎖定' : '移除'">×</button>
              </div>
              <button class="cfg-layout-v2-add-btn cfg-panel-add" @click="addPanel" :disabled="cvDirty" :title="cvDirty ? '畫布有未套用編輯時鎖定;套用或捨棄後可新增' : '新增自由副盤'">
                <span>＋ 副盤</span>
              </button>
            </div>
          </div>

          <!-- v4.7:選中 Panel 的詳情欄位（與主輪詳情並列，二擇一）-->
          <div class="cfg-layout-v2-detail cfg-panel-detail" v-if="activePanel && activePanelIdx >= 0">
            <div class="cfg-layout-v2-detail-header cfg-reveal-zone">
              <span class="cfg-panel-detail-title">🧩 自由副盤 {{ activePanel.panel_id }}</span>
            </div>

            <div class="cfg-field">
              <label class="cfg-label">Panel ID <span class="cfg-key">Panel_ID</span></label>
              <input class="input input-w-id" :value="activePanel.panel_id"
                     @change="renamePanel(activePanelIdx, $event.target.value)">
            </div>

            <div class="cfg-mode-grid" :class="{ 'cfg-is-cvdirty': cvDirty }" :title="cvDirty ? '畫布有未套用編輯時,面板幾何(座標/寬高)鎖定;套用或捨棄後解鎖' : ''">
              <div class="cfg-field cfg-field-compact">
                <label class="cfg-label">X 位置 <span class="cfg-key">Col</span></label>
                <input class="input input-w-num" type="number" :disabled="cvDirty" v-model.number="activePanel.col">
              </div>
              <div class="cfg-field cfg-field-compact">
                <label class="cfg-label">Y 位置 <span class="cfg-key">Row</span></label>
                <input class="input input-w-num" type="number" :disabled="cvDirty" v-model.number="activePanel.row">
              </div>
              <div class="cfg-field cfg-field-compact">
                <label class="cfg-label">寬 <span class="cfg-key">Width</span></label>
                <input class="input input-w-num" type="number" min="1" max="12" :disabled="cvDirty" v-model.number="activePanel.width">
              </div>
              <div class="cfg-field cfg-field-compact">
                <label class="cfg-label">高 <span class="cfg-key">Height</span></label>
                <input class="input input-w-num" type="number" min="1" max="12" :disabled="cvDirty" v-model.number="activePanel.height">
              </div>
            </div>
            <!-- v4.9-c / C2:長 hint 移出兩欄 grid,整寬顯示 -->
            <div class="cfg-hint">與主盤同座標:X=0 最左欄、Y=0 基準列,皆可負;預覽會自動擴張涵蓋。</div>

            <div class="cfg-field">
              <label class="cfg-label">是否參與主盤連線 <span class="cfg-key">Join_Payline</span></label>
              <div class="cfg-chip-row">
                <button class="cfg-chip" :class="{ active: !activePanel.join_payline }"
                        @click="activePanel.join_payline = false">獨立（不參與）</button>
                <button class="cfg-chip" :class="{ active: activePanel.join_payline }"
                        @click="activePanel.join_payline = true">參與主盤連線</button>
              </div>
              <div class="cfg-hint">獨立時此副盤符號不計入主盤連線/統計;參與時併入主盤計算。</div>
            </div>

            <div class="cfg-field">
              <label class="cfg-label">副盤類型 <span class="cfg-key">Panel_Type</span></label>
              <div class="cfg-chip-row">
                <button class="cfg-chip" :class="{ active: (activePanel.panel_type||'SCROLL') === 'SCROLL' }"
                        @click="activePanel.panel_type = 'SCROLL'; activePanel.scroll = true"
                        title="有圖示且會滾動,跟一般 slot 一樣">滾動</button>
                <button class="cfg-chip" :class="{ active: (activePanel.panel_type||'SCROLL') === 'COLLECT' }"
                        @click="activePanel.panel_type = 'COLLECT'; activePanel.scroll = false"
                        title="格子用來放置/蒐集(如 bingo 盤),本身不滾動">蒐集</button>
                <button class="cfg-chip" :class="{ active: (activePanel.panel_type||'SCROLL') === 'TRIGGER' }"
                        @click="activePanel.panel_type = 'TRIGGER'; activePanel.scroll = false"
                        title="本有圖示但未激活,需其他輪滾出指定符號才作用">觸發</button>
              </div>
              <div class="cfg-hint">
                <template v-if="(activePanel.panel_type||'SCROLL') === 'SCROLL'">有圖示且滾動,跟一般 slot 相同。</template>
                <template v-else-if="(activePanel.panel_type||'SCROLL') === 'COLLECT'">格子用來放置/蒐集(如 bingo 盤),本身不滾動圖示。</template>
                <template v-else>本來有圖示但未激活,需其他輪滾出「觸發符號」才作用。</template>
              </div>
              <div v-if="activePanel.join_payline && (activePanel.panel_type||'SCROLL') !== 'SCROLL'"
                   style="margin-top:6px; padding:6px 8px; background:rgba(230,160,30,0.12); border:1px solid rgba(230,160,30,0.4); border-radius:6px; font-size:12px; color:var(--text);">
                ⚠ 非滾動的副盤(蒐集/觸發)通常與主盤連線無關,你卻同時開了「參與主盤連線」。可以保留,但請再確認這是刻意的。
              </div>
            </div>

            <!-- v8.39 / 軌道:面板跨局捲軸宣告(SCROLL 型才顯示) -->
            <div v-if="(activePanel.panel_type||'SCROLL') === 'SCROLL'" class="cfg-field">
              <label class="cfg-label">捲軸軌道(可選) <span class="cfg-key">Scroll_Track / Scroll_Step</span></label>
              <div style="display:flex; gap:8px; align-items:center;">
                <select class="input input-w-name" v-model="activePanel.scroll_track">
                  <option value="">（沿用預設:往下滾）</option>
                  <option v-for="to in trackOptions" :key="'pst'+to.value" :value="to.value">{{ to.label }}</option>
                  <option v-if="isOrphanTrackRef(activePanel.scroll_track)" :value="activePanel.scroll_track">{{ activePanel.scroll_track }}（⚠ 軌道不存在）</option>
                </select>
                <input class="input input-sm cfg-mono" type="number" v-model.number="activePanel.scroll_step" style="width:90px;" title="每局位移格數(可負=反向)">
              </div>
              <div class="cfg-hint">本面板內容每局沿軌道位移 N 格;空 = 現行隱含「往下滾」語意。軌道 scope 建議設 PANEL:{{ activePanel.panel_id }}。</div>
            </div>

            <!-- v8.44 / C-2 GAP-P3+P5:作動模式 + 評價域 -->
            <div class="cfg-field">
              <label class="cfg-label">作動模式(可選) <span class="cfg-key">Active_Modes</span></label>
              <input class="input input-w-name" type="text" v-model.trim="activePanel.active_modes"
                     placeholder="例:FS1,FS2(逗號分隔)">
              <div class="cfg-hint">逗號分隔模式名;空 = 全模式作動(現行為)。事件驅動啟停另以規則動作 PANEL_SET(panel="{{ activePanel.panel_id }}") 疊加。</div>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">評價域 <span class="cfg-key">Eval_Domain / Payline_Set</span></label>
              <select class="input input-w-name" v-model="activePanel.eval_domain">
                <option value="">（併入主盤 — 沿用「參與主盤連線」設定）</option>
                <option value="SELF_LINE">SELF_LINE 盤內連線集</option>
                <option value="SELF_WAYS">SELF_WAYS 盤內 ways</option>
              </select>
              <input v-if="activePanel.eval_domain === 'SELF_LINE'"
                     class="input input-w-name" type="text" v-model.trim="activePanel.payline_set"
                     placeholder="例:L1,L2,L3 或 ALL" style="margin-top:6px;">
              <div class="cfg-hint">SELF_* = 本盤自帶評價域,scatter 計數亦盤內計;SELF_LINE 的連線集引用 06 表既有 Line_ID(csv 或 ALL)。</div>
              <div v-if="activePanel.eval_domain && activePanel.join_payline"
                   style="margin-top:6px; padding:6px 8px; background:rgba(230,160,30,0.12); border:1px solid rgba(230,160,30,0.4); border-radius:6px; font-size:12px; color:var(--text);">
                ⚠ 已設評價域(Eval_Domain 優先),「參與主盤連線」將被忽略。
              </div>
            </div>

            <!-- 觸發型:觸發符號 -->
            <div v-if="(activePanel.panel_type||'SCROLL') === 'TRIGGER'" class="cfg-field">
              <label class="cfg-label">觸發符號 <span class="cfg-key">Trigger_Symbol</span></label>
              <input class="input input-w-name" type="text" v-model.trim="activePanel.trigger_symbol"
                     placeholder="例：BONUS（其他輪滾出此符號時激活本副盤）">
              <div class="cfg-hint">填符號名稱 / 代號;留空表示尚未指定。</div>
              <!-- v6.3 / Q2(c):指定輪 + 產生對應規則 -->
              <label class="cfg-label" style="margin-top:8px;">觸發輪 <span class="cfg-key">Trigger_Reel</span></label>
              <select class="input" v-model.number="activePanel.trigger_reel">
                <option :value="0">任意輪</option>
                <option v-for="n in layout.length" :key="'tr'+n" :value="n">R{{ n }}</option>
              </select>
              <!-- v6.3:指定輪目前僅記錄(引擎無逐輪 condition),選指定輪時顯著提示,避免企劃誤判已逐輪生效 -->
              <div v-if="Number(activePanel.trigger_reel) >= 1" class="cfg-trigger-reel-warn">
                ⚠ 引擎目前以「全盤出現觸發符號」判定;指定輪 R{{ activePanel.trigger_reel }} 僅記錄於事件 payload / 規則描述與文件,不會限制觸發只在該輪發生。
              </div>
              <button class="cfg-mode-add-btn" style="margin-top:8px;" @click="genTriggerRule(activePanel)">
                <span style="font-size:15px;">+</span><span>產生對應規則</span>
              </button>
              <div class="cfg-hint">產生「當觸發符號出現 → 廣播 activate_{{ activePanel.panel_id }} 事件」的規則並寫入「腳本規則」分頁。引擎以全盤出現判定;指定輪資訊記於事件 payload / 規則描述。</div>
            </div>

            <!-- v6.2 #4/#12:蒐集型不滾動圖示,故不顯示符號集/權重來源 -->
            <template v-if="(activePanel.panel_type||'SCROLL') !== 'COLLECT'">
            <div class="cfg-field">
              <label class="cfg-label">符號集 <span class="cfg-key">Symbol_Set</span></label>
              <select class="input" v-model="activePanel.symbol_set">
                <option value="">（沿用全域符號）</option>
                <option v-for="nm in symbolSetNames" :key="nm" :value="nm">{{ nm }}</option>
              </select>
              <div class="cfg-hint">指定後此副盤只用該集符號（與主盤不同）;空＝用全域符號。</div>
            </div>

            <div class="cfg-field">
              <label class="cfg-label">權重來源 <span class="cfg-key">Inherit_Weight</span></label>
              <div class="cfg-chip-row">
                <button class="cfg-chip" :class="{ active: activePanel.inherit_weight }"
                        @click="activePanel.inherit_weight = true">沿用主輪保底</button>
                <button class="cfg-chip" :class="{ active: !activePanel.inherit_weight }"
                        @click="activePanel.inherit_weight = false">獨立（需在 04 設權重）</button>
              </div>
              <div class="cfg-hint">引擎優先序:04 專屬權重 → 符號集等權 → 沿用保底;三者皆無時此副盤模擬會整片空白。</div>
              <button class="cfg-chip cfg-chip-go-weights"
                      @click="active='reel_weights'"
                      title="跳到 04_Reel_Weights 的副盤權重區">→ 前往 04 設定此副盤權重</button>
            </div>
            </template>
            <div v-else class="cfg-field">
              <div class="cfg-hint">蒐集型副盤的格子用來放置/蒐集（如 bingo 盤），不滾動圖示，故無符號集 / 權重設定。</div>
              <!-- v6.3 / Q2(b):連結 COLLECT 型 JP -->
              <label class="cfg-label" style="margin-top:8px;">餵入 JP <span class="cfg-key">Collect_Target_JP</span></label>
              <select class="input" v-model="activePanel.collect_target_jp">
                <option value="">（不連結 JP）</option>
                <option v-for="j in collectJpOptions" :key="j.jp_id" :value="j.jp_id">{{ j.name || j.jp_id }}（{{ j.jp_id }}）</option>
              </select>
              <div class="cfg-hint" v-if="!collectJpOptions.length">尚無 COLLECT(收集)型 JP;可到「JP 彩金」分頁新增並設為「收集」型。</div>
              <div class="cfg-hint" style="color:var(--danger,#c0392b)" v-if="panelCollectJpWarn(activePanel)">{{ panelCollectJpWarn(activePanel) }}</div>
            </div>
          </div>

          <!-- 中欄：選中 Reel 的詳情欄位 -->
          <div class="cfg-layout-v2-detail" v-if="activeReel && activePanelIdx < 0">
            <!-- 詳情 header -->
            <div class="cfg-layout-v2-detail-header cfg-reveal-zone">
              <div class="cfg-layout-v2-detail-title">
                <span class="cfg-reel-id">R{{ activeReel.reel_id }}</span>
                <span v-if="activeReel.has_subreel" class="cfg-layout-sub-badge">副 Reel</span>
              </div>
              <div class="cfg-layout-v2-detail-actions">
                <!-- 副 Reel 切換 -->
                <button class="cfg-reel-subreel-toggle"
                        :class="{ active: activeReel.has_subreel }"
                        :disabled="cvDirty"
                        @click="activeReel.has_subreel = !activeReel.has_subreel; if(activeReel.has_subreel){ if(!activeReel.subreel_kind) activeReel.subreel_kind='STACK'; if(!activeReel.subreel_position){ activeReel.subreel_position='BOTTOM'; } if(!activeReel.subreel_rows) activeReel.subreel_rows=1; }"
                        :title="cvDirty ? '畫布有未套用編輯時鎖定;套用或捨棄後可改' : (activeReel.has_subreel ? '移除副盤' : '附加副盤/副輪')">
                  <span class="cfg-reel-subreel-icon">{{ activeReel.has_subreel ? '✓' : '+' }}</span>
                  <span>副盤</span>
                </button>
                <button class="cfg-mode-delete-btn cfg-reveal"
                        @click="removeReel(activeReelIdx)"
                        :disabled="layout.length <= 1 || cvDirty"
                        :title="cvDirty ? '畫布有未套用編輯時鎖定;套用或捨棄後可刪' : (layout.length <= 1 ? '至少需要保留一個 Reel' : '刪除此 Reel')">✕</button>
              </div>
            </div>

            <!-- 主要欄位 -->
            <div class="cfg-layout-v2-fields">
              <div class="cfg-layout-v2-fields-main">

                <!-- #4 / A1:群組批次編輯(多選 ≥2 個 Reel 時出現)-->
                <div v-if="groupActive" class="cfg-layout-group-bar">
                  <div class="cfg-layout-group-bar-head">
                    <span class="cfg-layout-group-bar-title">⚄ 群組編輯 · 已選 {{ selectedReelIdxs.length }} 個 Reel</span>
                    <button class="cfg-matrix-btn" @click="clearReelSelection()">取消多選</button>
                  </div>
                  <div class="cfg-layout-group-bar-row">
                    <span class="cfg-mqb-label">列數</span>
                    <input class="input input-sm input-center cfg-mqb-value" type="number" min="1" max="9" v-model.number="groupRowsValue">
                    <button class="cfg-matrix-btn" @click="groupSetRows(groupRowsValue)">設為此值</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustRows(1)" title="所選 Reel 列數 +1">+1</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustRows(-1)" title="所選 Reel 列數 −1">−1</button>
                  </div>
                  <div class="cfg-layout-group-bar-row">
                    <span class="cfg-mqb-label">偏移</span>
                    <input class="input input-sm input-center cfg-mqb-value" type="number" min="-9" max="9" v-model.number="groupOffsetValue">
                    <button class="cfg-matrix-btn" @click="groupSetOffset(groupOffsetValue)">設為此值</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustOffset(1)" title="所選 Reel 偏移 +1">+1</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustOffset(-1)" title="所選 Reel 偏移 −1">−1</button>
                  </div>
                  <div class="cfg-layout-group-bar-row">
                    <button class="cfg-matrix-btn" @click="groupToggleSubreel()">切換整組副 Reel</button>
                    <span class="cfg-mqb-hint">鍵盤 ↑↓ 偏移、+− 列數 也會套用到整組</span>
                  </div>
                </div>

                <!-- #3（Board v2 §7.2/§8）:逐輪進場 / 滾動方式 + 方向 + 複製全輪。純描述,供 docgen / 下游。 -->
                <div class="cfg-layout-v2-field-group cfg-re-group">
                  <div class="cfg-layout-v2-section-label">進場 / 滾動方式 <span class="cfg-re-tag">即時</span></div>
                  <div class="cfg-re-chips">
                    <button v-for="em in ENTRY_MODES" :key="em.key"
                            class="cfg-re-chip" :class="{ active: (activeReel.entry_mode || 'SCROLL') === em.key }"
                            @click="setReelEntryMode(em.key)" :title="em.hint">{{ em.label }}</button>
                  </div>
                  <template v-if="(activeReel.entry_mode || 'SCROLL') !== 'SPAWN'">
                    <label class="cfg-label" style="margin-top:9px;">方向 <span class="cfg-key">Scroll_Dir</span></label>
                    <div class="cfg-re-chips">
                      <button v-for="d in reelDirOpts(activeReel.entry_mode || 'SCROLL')" :key="d.key"
                              class="cfg-re-chip" :class="{ active: (activeReel.scroll_dir || 'DOWN') === d.key }"
                              @click="setReelScrollDir(d.key)">{{ d.label }}</button>
                    </div>
                  </template>
                  <div v-else class="cfg-hint" style="margin-top:6px;">原地生成:無方向。</div>
                  <button class="cfg-re-copy" @click="copyReelEntryToAll()"
                          title="把此輪的進場 / 滾動方式與方向套用到所有主輪(＝設為盤面預設)">⧉ 複製到所有主輪</button>
                  <div class="cfg-hint">純描述,供企劃書 / 下游模擬工具;本工具不執行滾動。</div>
                </div>

                <div class="cfg-layout-v2-field-group" :class="{ 'cfg-is-cvdirty': cvDirty }" :title="cvDirty ? '畫布有未套用編輯時,幾何(偏移/列數)鎖定,避免與草稿衝突;套用或捨棄後解鎖' : ''">
                  <div class="cfg-layout-v2-section-label">主 Reel 參數</div>
                  <div class="cfg-mode-grid">
                    <div class="cfg-field cfg-field-compact">
                      <label class="cfg-label">
                        縱向偏移 <span class="cfg-key">Y_Offset</span>
                      </label>
                      <div class="cfg-stepper">
                        <button class="cfg-stepper-btn"
                                :disabled="(activeReel.y_offset || 0) <= -4"
                                @click="activeReel.y_offset = Math.max(-4, (activeReel.y_offset || 0) - 1)">−</button>
                        <span class="cfg-stepper-val">{{ activeReel.y_offset || 0 }}</span>
                        <button class="cfg-stepper-btn"
                                :disabled="(activeReel.y_offset || 0) >= 4"
                                @click="activeReel.y_offset = Math.min(4, (activeReel.y_offset || 0) + 1)">+</button>
                      </div>
                      <div class="cfg-hint">正值偏下、負值偏上；0 = 基準列對齊</div>
                    </div>
                    <div class="cfg-field cfg-field-compact">
                      <label class="cfg-label">
                        {{ g.megaways ? '最大列數' : '主 Reel 列數' }} <span class="cfg-key">Max_Rows</span>
                      </label>
                      <div class="cfg-stepper">
                        <button class="cfg-stepper-btn"
                                :disabled="(activeReel.max_rows || 1) <= 1"
                                @click="activeReel.max_rows = Math.max(1, (activeReel.max_rows || 1) - 1)">−</button>
                        <span class="cfg-stepper-val">{{ activeReel.max_rows }}</span>
                        <button class="cfg-stepper-btn"
                                :disabled="(activeReel.max_rows || 1) >= 9"
                                @click="activeReel.max_rows = Math.min(9, (activeReel.max_rows || 1) + 1)">+</button>
                      </div>
                      <div class="cfg-hint">{{ g.megaways ? '此 Reel 最多可見列數;每轉實際列數隨機變動' : '此 Reel 顯示幾列符號（建議 1–9）' }}</div>
                    </div>
                  </div>
                </div>

                <!-- 副盤設定（展開式，點副盤按鈕才出現）-->
                <div v-if="activeReel.has_subreel" class="cfg-reel-subreel-section">
                  <div class="cfg-reel-subreel-title">
                    <span>🔗 副盤設定</span>
                    <span class="cfg-reel-subreel-hint">主輪 / 副盤已分開群組 · 先選種類，下方選項會跟著變</span>
                  </div>

                  <!-- v4.6:副盤「種類」選擇器 -->
                  <div class="cfg-field" style="margin-top:2px;">
                    <label class="cfg-label">
                      副盤種類 <span class="cfg-key">SubReel_Kind</span>
                    </label>
                    <div class="cfg-subreel-kind-grid">
                      <button v-for="k in SUBREEL_KINDS" :key="k.key"
                              class="cfg-subreel-kind-card"
                              :class="{ active: (activeReel.subreel_kind||'STACK') === k.key }"
                              @click="setSubreelKind(k.key)">
                        <span class="cfg-subreel-kind-icon">{{ k.icon }}</span>
                        <span class="cfg-subreel-kind-label">{{ k.label }}</span>
                        <span class="cfg-subreel-tip">
                          <svg v-if="k.key==='STACK'" class="cfg-subreel-svg" viewBox="0 0 84 54" aria-hidden="true">
                            <rect x="30" y="3" width="24" height="11" rx="2" class="mm"/>
                            <rect x="30" y="15" width="24" height="11" rx="2" class="mm"/>
                            <rect x="30" y="27" width="24" height="11" rx="2" class="mm"/>
                            <rect x="30" y="40" width="24" height="11" rx="2" class="ss"/>
                          </svg>
                          <svg v-else-if="k.key==='SIDE_VERTICAL'" class="cfg-subreel-svg" viewBox="0 0 84 54" aria-hidden="true">
                            <rect x="8" y="7" width="44" height="40" rx="3" class="mm"/>
                            <rect x="58" y="7" width="16" height="40" rx="3" class="ss"/>
                          </svg>
                          <svg v-else-if="k.key==='TOP_HORIZONTAL'" class="cfg-subreel-svg" viewBox="0 0 84 54" aria-hidden="true">
                            <rect x="12" y="20" width="60" height="28" rx="3" class="mm"/>
                            <rect x="12" y="5" width="60" height="11" rx="3" class="ss"/>
                          </svg>
                          <svg v-else class="cfg-subreel-svg" viewBox="0 0 84 54" aria-hidden="true">
                            <rect x="6" y="9" width="34" height="38" rx="3" class="mm"/>
                            <rect x="44" y="9" width="34" height="38" rx="3" class="ss"/>
                          </svg>
                          <span class="cfg-subreel-tip-desc">{{ k.desc }}</span>
                        </span>
                      </button>
                    </div>
                    <div class="cfg-hint" v-if="activeSubreelKindDef">{{ activeSubreelKindDef.desc }}</div>
                  </div>

                  <div class="cfg-mode-grid" style="margin-top:8px;">
                    <!-- 位置：依 kind 動態給可選項 -->
                    <div class="cfg-field cfg-field-compact" v-if="activeSubreelKindDef && activeSubreelKindDef.positions.length > 1">
                      <label class="cfg-label">
                        副盤位置 <span class="cfg-key">SubReel_Position</span>
                      </label>
                      <div class="cfg-chip-row">
                        <button v-for="pos in activeSubreelKindDef.positions" :key="pos"
                                class="cfg-chip" :class="{ active: activeReel.subreel_position === pos }"
                                @click="activeReel.subreel_position = pos">{{ pos }}</button>
                      </div>
                    </div>
                    <div class="cfg-field cfg-field-compact" v-else-if="activeSubreelKindDef">
                      <label class="cfg-label">副盤位置</label>
                      <div class="cfg-payline-dir-readonly">{{ activeReel.subreel_position || activeSubreelKindDef.default_position }}（此種類固定）</div>
                    </div>

                    <!-- 列數：DUAL_PANEL 鎖定＝主輪列數 -->
                    <div class="cfg-field cfg-field-compact">
                      <label class="cfg-label">
                        副盤列數 <span class="cfg-key">SubReel_Rows</span>
                      </label>
                      <input v-if="(activeReel.subreel_kind||'STACK') !== 'DUAL_PANEL'"
                             class="input input-w-num" type="number" min="1" max="9" v-model.number="activeReel.subreel_rows">
                      <div v-else class="cfg-payline-dir-readonly">{{ activeReel.max_rows }} 列（雙盤面鎖定＝主輪列數）</div>
                    </div>
                  </div>

                  <div class="cfg-field" style="margin-top:6px;">
                    <label class="cfg-label">
                      副盤權重來源 <span class="cfg-key">SubReel_Inherit_Weight</span>
                    </label>
                    <div class="cfg-chip-row">
                      <button class="cfg-chip" :class="{ active: !activeReel.subreel_inherit_weight }"
                              @click="activeReel.subreel_inherit_weight = false">獨立權重</button>
                      <button class="cfg-chip" :class="{ active: activeReel.subreel_inherit_weight }"
                              @click="activeReel.subreel_inherit_weight = true">沿用主輪</button>
                    </div>
                    <div class="cfg-hint">獨立時於 04_Reel_Weights 下方「副盤權重」區的「R{{ activeReel.reel_id }}·副」列設定(匯出為 {{ activeReel.reel_id }}.sub);沿用主輪則複用主輪抽樣池。</div>
                    <button v-if="!activeReel.subreel_inherit_weight"
                            class="cfg-chip cfg-chip-go-weights"
                            @click="active='reel_weights'"
                            title="跳到 04_Reel_Weights 的副盤權重區">→ 前往 04 設定「R{{ activeReel.reel_id }}·副」權重</button>
                  </div>

                  <!-- v5.1:附掛副盤符號集(契約加法欄位 SubReel_Symbol_Set)-->
                  <div class="cfg-field" style="margin-top:6px;">
                    <label class="cfg-label">
                      副盤符號集 <span class="cfg-key">SubReel_Symbol_Set</span>
                    </label>
                    <select class="input input-w-id" v-model="activeReel.subreel_symbol_set">
                      <option value="">（不指定）</option>
                      <option v-for="nm in symbolSetNames" :key="nm" :value="nm">{{ nm }}</option>
                    </select>
                    <div class="cfg-hint">
                      引擎優先序:04 副盤專屬權重 → 此符號集等權 → 沿用主輪保底。
                      符號集在 <a href="#" @click.prevent="active='symbols'" class="cfg-link">03b_Symbol_Sets</a> 定義。
                    </div>
                  </div>

                  <!-- 雙盤面提醒 -->
                  <div v-if="(activeReel.subreel_kind||'STACK') === 'DUAL_PANEL'" class="cfg-subreel-dual-note">
                    ▦ 雙盤面：模擬時會在主輪同欄產生一張同尺寸、每次 spin 靜態重抽（無滾動）的第二盤。引擎已支援，B 結果中以 <code>is_subreel</code> 標記。
                  </div>
                </div>


                <!-- 快速導覽 hint(#3:操作說明與計數分兩行) -->
                <div class="cfg-layout-v2-nav-hint">
                  <div style="display:block;">
                    <span>← →</span> 選 Reel · <span>↑ ↓</span> 縱向偏移 · <span>+ −</span> 列數;也可在右側預覽<span>點選</span>或<span>拖曳互換</span>(連列高/副輪/權重一起換)
                  </div>
                  <div class="cfg-layout-v2-nav-count" style="display:block; margin-top:4px;">共 {{ layout.length }} 個 Reel · {{ totalCells }} 格</div>
                </div>

              </div><!-- /cfg-layout-v2-fields-main -->
            </div><!-- /cfg-layout-v2-fields -->

            <!-- 詳情底部：JSON debug -->
            <details class="cfg-debug cfg-layout-v2-debug" @toggle="dbgOpen.layout = $event.target.open">
              <summary>🔍 預覽 JSON（{{ layout.length }} 個 Reel）</summary>
              <pre v-if="dbgOpen.layout" class="cfg-debug-pre">{{ layoutDebugJson }}</pre>
            </details>
          </div><!-- /cfg-layout-v2-detail -->

          <!-- 右欄：盤面 SVG 預覽（與選中 Reel highlight） -->
          <div class="cfg-layout-v2-preview">
            <div class="cfg-layout-v2-preview-title">
              <span class="cfg-layout-preview-h">📐 盤面畫布</span>
              <span class="cfg-layout-split-preview-info">
                {{ layout.length }} 個 Reel · 主格 {{ layout.reduce((s,r)=>s+r.max_rows,0) }} ·
                副 {{ layout.reduce((s,r)=>s+(r.has_subreel?r.subreel_rows:0),0) }}
              </span>
              <span class="cfg-cv-legend cfg-cv-legend-top">
                <span><i class="cfg-cv-sw main"></i>主輪</span>
                <span><i class="cfg-cv-sw sub"></i>副輪</span>
                <span><i class="cfg-cv-sw stage"></i>演出</span>
              </span>
              <label class="cfg-cv-mechfilter" v-if="cvMechOptions.length" title="選一機制 → 對應盤面格高亮（琥珀）;純檢視,不改資料">
                <span class="cfg-cv-mechfilter-ic" aria-hidden="true">▦</span>機制篩選
                <select v-model="cvMechFilter" class="cfg-cv-mechfilter-sel">
                  <option value="">全部（不高亮）</option>
                  <option v-for="o in cvMechOptions" :key="o.value" :value="o.value">{{ o.label }}（{{ o.count }}）</option>
                </select>
                <span v-if="cvFltInfo" class="cfg-cv-mechfilter-info">高亮 {{ cvFltInfo.count }} 格</span>
              </label>
              <label class="cfg-cv-hints-toggle" title="關閉後,框選 / 取消等工具不再彈出說明小卡">
                <input type="checkbox" v-model="boardHints"> 說明示意
              </label>
            </div>
            <!-- v7.x:統一網格 — 預覽/編輯排版不變,固定直式工具列(預覽時整排反灰停用),盤面置中 -->
            <div class="cfg-cv">
              <!-- Board v2 P3c:canvas 右鍵選單（fixed 於游標;依命中對象顯示）-->
              <div class="cfg-cv-ctx" v-if="cvCtx.open" :style="{ left: cvCtx.x + 'px', top: cvCtx.y + 'px' }">
                <template v-if="cvCtx.kind === 'main'">
                  <div class="cfg-cv-ctx-head">主輪格 · R{{ cvCtx.reelId }} · 第 {{ cvCtx.row + 1 }} 列</div>
                  <button class="cfg-cv-ctx-item" @click="cvCtxSelReel()">選整輪（設列數 / 副輪型）</button>
                  <button class="cfg-cv-ctx-item" @click="cvCtxCancelCell()">取消此格 / 還原</button>
                  <button class="cfg-cv-ctx-item" @click="cvCtxGoRules()">前往規則頁 ↗</button>
                </template>
                <template v-else-if="cvCtx.kind === 'sub'">
                  <div class="cfg-cv-ctx-head">副盤 {{ cvCtx.panelId }}</div>
                  <button class="cfg-cv-ctx-item" @click="cvCtxSelPanel()">選此副盤（編遮罩 / 設定）</button>
                  <button class="cfg-cv-ctx-item" @click="cvCtxPanelType('SCROLL')">設為抽樣盤（SCROLL）</button>
                  <button class="cfg-cv-ctx-item" @click="cvCtxPanelType('STAGE')">設為演出區（STAGE）</button>
                  <button class="cfg-cv-ctx-item cfg-cv-ctx-danger" @click="cvCtxDelPanel()">刪除此副盤</button>
                </template>
                <template v-else>
                  <div class="cfg-cv-ctx-head">空白處</div>
                  <button class="cfg-cv-ctx-item" @click="cvCtxAddPanel()">＋ 新增副盤</button>
                  <button class="cfg-cv-ctx-item" @click="cvCtxAddTrack()">＋ 新增軌道（進階）</button>
                </template>
              </div>
              <div class="cfg-cv-work">
                <div class="cfg-cv-rail">
                  <!-- Board v2:選取-設定工具（箭頭 / 框選 / ＋ / 取消）— 頂部主組；與「移動」共用 cfg-cv-brush 樣式 -->
                  <button class="cfg-cv-tool cfg-cv-brush" :class="{ active: cvMode==='select' }" @click="cvSetMode('select')" title="箭頭（選取）：單擊格選整輪、雙擊選格、拖曳框選">
                    <span class="cfg-cv-tool-ic" aria-hidden="true">➤</span><span class="cfg-cv-tool-lb">箭頭</span>
                  </button>
                  <button class="cfg-cv-tool cfg-cv-brush" :class="{ active: cvMode==='marquee' }" @click="cvSetMode('marquee')">
                    <span class="cfg-cv-tool-ic" aria-hidden="true">▱</span><span class="cfg-cv-tool-lb">框選</span>
                    <span class="cfg-cv-tip">框選：拖曳虛線框住多個主輪 → 一起改列數 / 偏移 / 副輪</span>
                  </button>
                  <button class="cfg-cv-tool cfg-cv-brush" :class="{ active: cvMode==='add' }" @click="cvSetMode('add')" title="＋新增：點一格新增一格（主輪）">
                    <span class="cfg-cv-tool-ic" aria-hidden="true">＋</span><span class="cfg-cv-tool-lb">新增</span>
                  </button>
                  <button class="cfg-cv-tool cfg-cv-brush" :class="{ active: cvMode==='cancel' }" @click="cvSetMode('cancel')">
                    <span class="cfg-cv-tool-ic" aria-hidden="true">⊘</span><span class="cfg-cv-tool-lb">取消</span>
                    <span class="cfg-cv-tip">取消：點主輪格設為無效格，套用後不出符號；再點還原。選中副盤時改設該盤遮罩。</span>
                  </button>
                  <div class="cfg-cv-rail-div"></div>
                  <button class="cfg-cv-tool cfg-cv-brush" :class="{ active: cvMode==='pan' }" @click="cvSetMode('pan')" title="移動：拖曳平移畫布(也可直接用中鍵拖曳或捲動)">
                    <svg class="cfg-cv-tool-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round"><path d="M8 1.6v12.8M1.6 8h12.8M8 1.6 6 3.8M8 1.6l2 2.2M8 14.4l-2-2.2M8 14.4l2-2.2M1.6 8l2.2-2M1.6 8l2.2 2M14.4 8l-2.2-2M14.4 8l-2.2 2"/></svg><span class="cfg-cv-tool-lb">移動</span>
                  </button>
                </div>
                <div class="cfg-cv-stage" :class="{ 'is-pan': cvMode==='pan' }" ref="cvStageRef"
                     tabindex="0" @keydown="cvKeydown" @focus="cvFocusInit"
                     @contextmenu.prevent="cvContextMenu($event)" @pointerdown="cvPanStart" @pointermove="cvPanMove" @pointerup="cvStageUp()" @pointerleave="cvStageUp()"
                     title="中鍵拖曳可平移畫布(也可直接捲動);點一下取得焦點後可用方向鍵移動、Enter/Space 套用、數字鍵 1–5 切換工具">
                  <!-- v7.x（C）:R 欄標籤 + 網格包在同一個置中容器,標籤與網格同欄寬、隨盤面欄一起浮動平移。 -->
                  <div class="cfg-cv-board">
                    <div class="cfg-cv-collabels" :style="{ gridTemplateColumns: 'repeat(' + cvCols + ', ' + cvCell + 'px)' }">
                      <div v-for="(lb, ci) in cvColLabels" :key="'cl'+ci"
                           class="cfg-cv-collabel" :class="{ 'has-r': !!lb }">{{ lb }}</div>
                    </div>
                    <div class="cfg-cv-grid" @pointermove="cvGridMove" :style="{ gridTemplateColumns: 'repeat(' + cvCols + ', ' + cvCell + 'px)', gridTemplateRows: 'repeat(' + cvRows + ', ' + cvCell + 'px)' }">
                      <div v-for="cell in cvGrid" :key="cell.key"
                           class="cfg-cv-cell"
                           :class="[ cell.cls ? ('cfg-cv-cell-' + cell.cls) : '', (cvRubberSet && cvRubberSet.has(cell.key)) ? 'cfg-cv-cell-rubber' : '', cell.editKind ? ('cfg-cv-cell-ed-' + cell.editKind) : '', cell.invalid ? 'cfg-cv-cell-invalid' : '', cell.sel ? 'cfg-cv-cell-sel' : '', cell.cellSel ? 'cfg-cv-cell-cellsel' : '', cell.pcellSel ? 'cfg-cv-cell-psel' : '', cell.dragT ? ('cfg-cv-cell-drag' + cell.dragT) : '', cell.flt ? 'cfg-cv-cell-flt' : '', cell.state ? 'cfg-cv-cell-state' : '', (cell.key === cvFocusKey) ? 'cfg-cv-cell-kbfocus' : '' ]"
                           @pointerdown.prevent="cvCellDown(cell, $event)" @dblclick.prevent="cvCellDbl(cell)"></div>
                    </div>
                  </div>
                </div>
                <!-- v7.x N3/U4:未套用變更圖例(僅髒時顯示)— 解釋逐格角標、給總覽格數;貼 work 右上,不隨畫布捲動 -->
                <div class="cfg-cv-overlay-legend" v-if="cvDirty">
                  <span class="cfg-cv-ol-row"><i class="cfg-cv-ol-add"></i>新增/改類 {{ cvEditCount.add }}</span>
                  <span class="cfg-cv-ol-row"><i class="cfg-cv-ol-del"></i>清除 {{ cvEditCount.del }}</span>
                </div>
              </div>
              <!-- Board v2 §7.3:單格卡（雙擊主輪格開啟）— 所屬輪 / 座標 + 前往規則 + 取消格開關 -->
              <div class="cfg-cv-cellbar" v-if="cvSelCell">
                <span class="cfg-cv-cellbar-title">◉ 單格 R{{ cvSelCell.reel }} · 第 {{ cvSelCell.row + 1 }} 列 · 欄 {{ cvSelCell.col + 1 }}</span>
                <span class="cfg-cv-cellbar-info">{{ cvSelCellInMain ? '有效格（參與抽樣 / 連線）' : '無效格（套用後不出符號）' }}</span>
                <span class="cfg-cv-fx"></span>
                <button class="cfg-cv-act" @click="navTo('rules')" title="到規則頁檢視 / 編輯此輪的規則與事件">前往規則頁 ↗</button>
                <button class="cfg-cv-act" @click="cvSelCellToggleHole()" :title="cvSelCellInMain ? '把此格設為無效格；套用後不出符號' : '把此格還原為有效格'">{{ cvSelCellInMain ? '⊘ 取消此格' : '↺ 還原此格' }}</button>
                <button class="cfg-cv-act" @click="cvCloseCellCard()" title="關閉單格卡">✕</button>
              </div>
              <!-- 底部動作列:狀態(已同步/尚未套用) + 置中視圖 + 捨棄/清空/套用 -->
              <div class="cfg-cv-actions">
                <span class="cfg-cv-state" :class="{ dirty: cvDirty, invalid: cvMainInvalid.size > 0 }">
                  <template v-if="cvMainInvalid.size > 0">⚠ 主輪欄位之間有斷欄,無法套用(欄內取消格為合法遮罩)</template>
                  <template v-else-if="cvDirty">● 尚未套用的變更</template>
                  <template v-else>✓ 已與盤面同步</template>
                </span>
                <span class="cfg-cv-railhint" v-if="!cvDirty && cvMode==='pan'">＊預設為移動工具,選一支筆刷開始編輯</span>
                <span class="cfg-cv-railhint" v-if="activePanelIdx >= 0 && (cvMode==='add' || cvMode==='cancel')">◈ 副盤編輯中:＋加格 / 取消 → 套用後成遮罩（點空白處或選整輪可離開）</span>
                <span class="cfg-cv-railhint" title="點一下畫布取得焦點即可使用">⌨ 方向鍵移動・Enter/Space 套用・1–5 切工具</span>
                <span class="cfg-cv-fx"></span>
                <button class="cfg-cv-act" @click="cvResetView()" title="把畫布捲回盤面中央(中鍵拖曳可平移)">⊕ 置中視圖</button>
                <button class="cfg-cv-act" @click="cvDiscard()" :disabled="!cvDirty" title="捨棄畫布上未套用的編輯,還原成目前盤面">↺ 捨棄</button>
                <button class="cfg-cv-act" @click="cvClear()" title="清空畫布(尚未套用)">🗑 清空</button>
                <button class="cfg-cv-act cfg-cv-apply" @click="cvCommit()" :disabled="!cvDirty || cvMainInvalid.size > 0" title="套用到盤面（重建 layout＋panels；以 Reel 編號/幾何重疊保留既有參數）">✓ 套用到盤面</button>
              </div>
            </div>
          </div><!-- /cfg-layout-v2-preview -->

        </div><!-- /cfg-layout-v2-body -->

        <!-- v8.8 / R4 B-6:位置型格子屬性(02d_Cell_Attributes;規格描述,引擎不消費) -->
        <div class="cfg-section cfg-section-card" style="flex-shrink:0; margin-top:10px;">
          <div class="cfg-section-title">
            <span class="cfg-section-title-text">格子屬性 <span class="cfg-key">02d_Cell_Attributes</span></span>
          </div>
          <div class="cfg-hint">位置型格子屬性：固定格乘數(Cygnus) / 強化格 / 火框 / 金框格。座標與中獎線同慣例(R 輪, 列 1..該輪列數)；純規格描述,行為細節寫備註或規則。</div>
          <div v-if="cellAttrs.length === 0" class="cfg-hint" style="margin-bottom:6px;">尚未定義格子屬性。</div>
          <div v-for="(ca, ci) in cellAttrs" :key="'ca' + ci" class="cfg-bf-row cfg-reveal-zone">
            <div class="cfg-bf-cell">
              <label class="cfg-label">ID</label>
              <input class="input input-w-id cfg-mono" type="text" v-model.trim="ca.attr_id" placeholder="CA1">
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">Reel</label>
              <select class="input input-w-num" v-model.number="ca.reel">
                <option v-for="r in layout" :key="'car'+r.reel_id" :value="r.reel_id">R{{ r.reel_id }}</option>
              </select>
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">列 <span class="cfg-key">1-based</span></label>
              <input class="input input-w-num input-center" type="number" min="1" step="1" v-model.number="ca.row">
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">型式</label>
              <select class="input input-w-name" v-model="ca.attr">
                <option v-for="o in CELL_ATTR_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">值 <span class="cfg-key">MULT=倍數</span></label>
              <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="ca.value" placeholder="2">
            </div>
            <!-- v8.49 / 缺口4:格位數值上限(選用;""=無上限,安全降級;Sugar Rush 式格位倍數封頂用) -->
            <div class="cfg-bf-cell">
              <label class="cfg-label">上限(可選) <span class="cfg-key">cap_value</span></label>
              <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="ca.cap_value" placeholder="128" title="此格屬性數值上限;留空=無上限">
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">適用模式</label>
              <input class="input input-w-id cfg-mono" type="text" v-model.trim="ca.mode_scope" placeholder="ALL 或 NG,FG1" title="ALL 或逗號多選(任一相符即適用)">
            </div>
            <div class="cfg-bf-cell cfg-bf-cell-grow">
              <label class="cfg-label">備註</label>
              <input class="input input-w-name" type="text" v-model.trim="ca.notes" placeholder="落在此格的贏分 ×2">
            </div>
            <!-- G-2 / D3甲:動態狀態(摺疊;空 state_type = 純靜態屬性 = 現行行為)。純描述,執行歸下游。 -->
            <details class="cfg-ca-state cfg-reveal-zone" style="flex-basis:100%; margin-top:4px;">
              <summary style="cursor:pointer; font-size:12px; opacity:.75;">
                動態狀態 <span class="cfg-key">G-2</span>
                <span v-if="ca.state_type" class="cfg-key">{{ ca.state_type }}<span v-if="ca.state_region"> · {{ ca.state_region }}</span></span>
              </summary>
              <div class="cfg-bf-row" style="margin-top:6px; flex-wrap:wrap;">
                <div class="cfg-bf-cell">
                  <label class="cfg-label">狀態型別</label>
                  <select class="input input-w-name" v-model="ca.state_type">
                    <option v-for="o in CELL_STATE_OPTIONS" :key="'cs'+o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <div class="cfg-bf-cell" v-if="ca.state_type">
                  <label class="cfg-label">初值 <span class="cfg-key">state_init</span></label>
                  <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="ca.state_init" placeholder="3" title="遮蓋層數 / 倒數起始值等">
                </div>
                <div class="cfg-bf-cell" v-if="ca.state_type">
                  <label class="cfg-label">觸發</label>
                  <input class="input input-w-name cfg-mono" type="text" list="cellStateTriggers" v-model.trim="ca.state_trigger" placeholder="ON_WIN_OVERLAP" title="中獎覆蓋此格 / 落盤 / 連爆;可自由填">
                </div>
                <div class="cfg-bf-cell" v-if="ca.state_type">
                  <label class="cfg-label">觸發後動作</label>
                  <input class="input input-w-name cfg-mono" type="text" list="cellStateActions" v-model.trim="ca.on_state_action" placeholder="REVEAL_AS" title="atype 字面值(複用規則動作語彙);執行歸下游">
                </div>
                <div class="cfg-bf-cell cfg-bf-cell-grow" v-if="ca.state_type">
                  <label class="cfg-label">範圍(可選) <span class="cfg-key">state_region</span></label>
                  <input class="input input-w-name cfg-mono" type="text" v-model.trim="ca.state_region" placeholder="空=此格；ALL / R1-R3 / col:2 / (1,1);(2,2)" title="空=錨點格(此 Reel,列);ALL 或區域字串=廣播">
                </div>
              </div>
            </details>
            <button class="cfg-mode-delete-btn cfg-bf-del cfg-reveal" @click="removeCellAttr(ci)" title="刪除">✕</button>
          </div>
          <button class="cfg-mode-add-btn" @click="addCellAttr">
            <span style="font-size:16px">+</span>
            <span>新增格子屬性</span>
          </button>
          <!-- G-2:盤面頁專屬 datalist(不跨頁依賴 bet 頁 meterTierActions)。 -->
          <datalist id="cellStateActions">
            <option v-for="a in ACTION_CATALOG" :key="'csa'+a.type" :value="a.type">{{ a.label || a.type }}</option>
          </datalist>
          <datalist id="cellStateTriggers">
            <option v-for="o in STATE_TRIGGER_OPTIONS" :key="'cst'+o.value" :value="o.value">{{ o.label }}</option>
          </datalist>
        </div>

        <!-- ── v8.39 / GAP-F1+軌道 Phase 1:軌道(02c_Tracks)── -->
        <div class="cfg-section">
          <details class="cfg-section-collapsible" :open="tracks.length > 0">
            <summary class="cfg-section-title">軌道 <span class="cfg-key">02c_Tracks</span></summary>
            <div class="cfg-hint">
              盤面上一條「有序格子序列」(純幾何)。用途由引用端決定:全域/模式的補盤路徑(Finn 螺旋)、
              WALK 走位路徑、面板/主盤跨局捲軸。座標 r,c(1-based)以分號串接,順序即行進方向。
            </div>
            <div v-for="(tk, ti) in tracks" :key="tk.track_id || ti" class="cfg-field cfg-field-compact" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              <span class="cfg-key" style="min-width:48px;">{{ tk.track_id }}</span>
              <select class="input input-sm" v-model="tk.scope" style="width:130px;" title="所屬盤面">
                <option value="MAIN">MAIN 主盤</option>
                <option v-for="p in panels" :key="'ts'+p.panel_id" :value="'PANEL:' + p.panel_id">PANEL:{{ p.panel_id }}</option>
              </select>
              <input class="input input-sm cfg-mono" v-model.trim="tk.cells" placeholder="1,1;1,2;2,2;…(r,c 序列)" style="flex:2; min-width:220px;" title="有序座標序列">
              <span class="cfg-chip-row">
                <button class="cfg-chip cfg-chip-sm" :class="{ active: tk.entry !== 'END' }" @click="tk.entry = 'START'" title="新符號/內容由序列首端進入">入口:首</button>
                <button class="cfg-chip cfg-chip-sm" :class="{ active: tk.entry === 'END' }" @click="tk.entry = 'END'" title="新符號/內容由序列尾端進入">入口:尾</button>
              </span>
              <input class="input input-sm" v-model="tk.notes" placeholder="備註(如:順時針螺旋)" style="flex:1; min-width:120px;">
              <button class="btn-pill" :class="{ active: trackPreviewIdx === ti }" @click="trackPreviewIdx = ti" title="於下方預覽此軌道">👁 預覽</button>
              <button class="btn-pill" @click="reverseTrack(ti)" title="反轉此軌道方向(座標序列反轉)">⇄ 反轉</button>
              <button class="btn-pill" @click="removeTrack(ti)" title="刪除此軌道">✕</button>
              <div v-if="trackCellsWarn(tk)" class="cfg-warn cfg-warn-inline" style="width:100%;">{{ trackCellsWarn(tk) }}</div>
            </div>
            <button class="cfg-mode-add-btn" @click="addTrack">
              <span style="font-size:16px">+</span>
              <span>新增軌道</span>
            </button>

            <!-- 唯讀疊加預覽(決策點 6):格線 + 序號 + 行進連線 -->
            <div v-if="tracks.length && trackPreview" class="cfg-field" style="margin-top:10px;">
              <label class="cfg-label">預覽:{{ tracks[trackPreviewIdx] ? tracks[trackPreviewIdx].track_id : '' }}
                <span class="cfg-key">{{ tracks[trackPreviewIdx] ? tracks[trackPreviewIdx].scope : '' }}</span></label>
              <svg :viewBox="'0 0 ' + trackPreview.w + ' ' + trackPreview.h"
                   :style="{ width: Math.min(trackPreview.w, 420) + 'px', height: 'auto', display: 'block' }"
                   xmlns="http://www.w3.org/2000/svg">
                <rect v-for="cell in trackPreview.grid" :key="'tg'+cell.k"
                      :x="cell.x + 1" :y="cell.y + 1"
                      :width="trackPreview.CS - 2" :height="trackPreview.CS - 2"
                      fill="rgb(var(--tint-2) / 0.25)" stroke="rgb(var(--tint-4) / 0.5)" rx="3" />
                <polyline v-if="trackPreview.pts.length > 1" :points="trackPreview.line"
                          fill="none" stroke="rgb(var(--tint-6) / 0.85)" stroke-width="2.5" stroke-linejoin="round" />
                <template v-for="(pt, pi) in trackPreview.pts" :key="'tp'+pi">
                  <circle :cx="pt.x" :cy="pt.y" :r="trackPreview.CS * 0.32"
                          :fill="pt.oob ? 'rgb(200 60 40 / 0.85)' : ((pi === 0 && trackPreview.entry !== 'END') || (pi === trackPreview.pts.length - 1 && trackPreview.entry === 'END')) ? 'rgb(var(--tint-7) / 0.95)' : 'rgb(var(--tint-5) / 0.9)'" />
                  <text :x="pt.x" :y="pt.y + 4" text-anchor="middle" font-size="12" fill="#fff">{{ pi + 1 }}</text>
                </template>
              </svg>
              <div class="cfg-hint">序號 = 行進順序;深色圓 = 入口端{{ trackPreview.hasOob ? ';⚠ 紅色 = 座標超出盤面範圍' : '' }}。</div>
            </div>
          </details>
        </div>
      </div>

      <!-- ═══════ 03_Symbols 符號清單(整合自 SymbolPage)═══════ -->
      <div v-else-if="active === 'symbols'" class="cfg-symbols-host">
        <symbol-page :registry="registry" @status="passStatus"></symbol-page>
      </div>

      <!-- ═══════ 04_Reel_Weights Reel 權重 ═══════ -->
      <div v-else-if="active === 'reel_weights'" class="cfg-form cfg-sticky-form">
        <!-- 權重頁 W1:peer 分段(輪帶 / 分佈)+ 子切換;複用規則 peer / subtoggle CSS -->
        <div class="cfg-rule-peers">
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'reels' }" @click="gotoWeightPeer('reels')">輪帶</button>
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'dist' }" @click="gotoWeightPeer('dist')">分佈</button>
        </div>
        <div v-if="weightPeer === 'reels'" class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_weights' }" @click="active = 'reel_weights'">權重矩陣</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_strips' }" @click="active = 'reel_strips'">真實輪帶</button>
        </div>
        <div v-else class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'grid_size_weights' }" @click="active = 'grid_size_weights'">格數分佈</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'distribution_bins' }" @click="active = 'distribution_bins'">倍數區間</button>
        </div>
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">🎲 04_Reel_Weights · Reel 權重</div>
          <div class="cfg-form-sub">
            Mode × Reel × Symbol 三維權重表(熱力圖)。Symbol 預設取自
            <a href="#" @click.prevent="active='symbols'" class="cfg-link">03_Symbols</a>,
            首次進入該模式時自動建立 100 均勻權重。
          </div>
        </div>


        <!-- v5.5:即時 RTP 估算面板 -->
        <div class="cfg-rtp-panel" :class="{
              'cfg-rtp-panel-ok':   rtpResult.ok && rtpVsTarget !== null && Math.abs(rtpVsTarget) <= 2,
              'cfg-rtp-panel-low':  rtpResult.ok && rtpVsTarget !== null && rtpVsTarget < -2,
              'cfg-rtp-panel-high': rtpResult.ok && rtpVsTarget !== null && rtpVsTarget > 2 }">
          <div class="cfg-rtp-panel-main">
            <span class="cfg-rtp-panel-icon">📈</span>
            <template v-if="rtpResult.ok">
              <span class="cfg-rtp-panel-big">{{ rtpPct.toFixed(2) }}%</span>
              <span class="cfg-rtp-panel-cap">LINE base RTP（即時估算 · {{ rtpResult.mode }}）</span>
              <span v-if="rtpResult.target" class="cfg-rtp-panel-target">
                目標 {{ rtpResult.target }}%
                <span class="cfg-rtp-panel-delta" :class="{
                        pos: rtpVsTarget > 0, neg: rtpVsTarget < 0 }">
                  （{{ rtpVsTarget >= 0 ? '+' : '' }}{{ rtpVsTarget.toFixed(2) }}）
                </span>
              </span>
            </template>
            <span v-else class="cfg-rtp-panel-na">{{ rtpResult.note || 'RTP 無法估算' }}</span>
          </div>
          <div v-if="rtpResult.ok && rtpResult.note" class="cfg-rtp-panel-note">⚠ {{ rtpResult.note }}</div>
          <div v-if="rtpResult.ok && rtpResult.perLine && rtpResult.perLine.length" class="cfg-rtp-panel-lines">
            <span class="cfg-rtp-panel-lines-label">各線貢獻（{{ rtpResult.lineCount }} 線）:</span>
            <span v-for="l in rtpResult.perLine" :key="l.line_id" class="cfg-rtp-line-chip"
                  :title="'線 ' + l.line_id + ':' + (l.rtp * 100).toFixed(3) + '%'">
              #{{ l.line_id }} {{ (l.rtp * 100).toFixed(1) }}%
            </span>
          </div>
        </div>

        <div v-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>
            新增至少一個模式。
          </div>
        </div>

        <template v-else>
          <!-- ── Sticky 模式選擇列 ── -->
          <!-- v4.9-c / D1:sticky bar 拆兩列(模式列 + 工具列)避免互相擠壓 -->
          <div class="cfg-sticky-mode-bar cfg-smb-stacked">
            <div class="cfg-smb-row cfg-smb-row-modes">
            <span class="cfg-sticky-mode-label">模式</span>
            <button v-for="m in modeNames" :key="m"
                    class="cfg-chip"
                    :class="{ active: reelActiveMode === m }"
                    @click="reelActiveMode = m">{{ m }}</button>
            <span class="cfg-sticky-meta" v-if="reelActiveMode">
              Max: <strong>{{ reelMaxWeight(reelActiveMode) }}</strong>
            </span>
            </div>
            <div class="cfg-smb-row cfg-smb-row-tools" v-if="reelActiveMode">
            <!-- v3.5:顯示模式切換 -->
            <span v-if="reelActiveMode" class="cfg-matrix-display-toggle"
                  title="切換 cell 顯示模式(輸入值仍為絕對權重,百分比只是顯示)">
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('reel', reelActiveMode) === 'raw' }"
                      @click="setMatrixDisplayMode('reel', reelActiveMode, 'raw')"
                      title="顯示原始權重">數值</button>
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('reel', reelActiveMode) === 'pct_row' }"
                      @click="setMatrixDisplayMode('reel', reelActiveMode, 'pct_row')"
                      title="同 Reel 內各符號占比">%橫</button>
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('reel', reelActiveMode) === 'pct_col' }"
                      @click="setMatrixDisplayMode('reel', reelActiveMode, 'pct_col')"
                      title="同符號跨 Reel 分佈占比">%縱</button>
            </span>
            <!-- v3.6 / #5:reel 跨模式檢視切換(類似 08 的並排/差異) -->
            <span v-if="reelActiveMode && modeNames.length >= 2"
                  class="cfg-mode-view-toggle"
                  title="跨模式檢視:並排所有模式,或計算與基準模式的差異">
              <button class="cfg-mvt-btn"
                      :class="{ active: reelViewMode === 'edit' }"
                      @click="setReelViewMode('edit'); clearMatrixSelection()"
                      title="編輯單一模式">編輯</button>
              <button class="cfg-mvt-btn"
                      :class="{ active: reelViewMode === 'compare' }"
                      @click="setReelViewMode('compare'); clearMatrixSelection()"
                      title="所有模式並排顯示">⊞ 並排</button>
              <button class="cfg-mvt-btn"
                      :class="{ active: reelViewMode === 'diff' }"
                      @click="setReelViewMode('diff'); clearMatrixSelection()"
                      title="顯示其他模式相對於基準模式的差異 %">Δ 差異</button>
            </span>
            <!-- v3.6 / #2:Undo/Redo 按鈕(取代純鍵盤觸發) -->
            <span v-if="reelActiveMode" class="cfg-matrix-undo-host">
              <button class="cfg-matrix-undo-btn"
                      :disabled="!canUndo('reel', reelActiveMode)"
                      @click="undoMatrix()"
                      :title="canUndo('reel', reelActiveMode) ? ('復原最後批次操作(Ctrl+Z)· ' + undoCountForCurrent() + ' 步可復原') : '沒有可復原的操作'">
                ↶
                <span v-if="canUndo('reel', reelActiveMode)" class="cfg-matrix-undo-count">{{ undoCountForCurrent() }}</span>
              </button>
              <button class="cfg-matrix-undo-btn"
                      :disabled="!canRedo('reel', reelActiveMode)"
                      @click="redoMatrix()"
                      :title="canRedo('reel', reelActiveMode) ? ('重做(Ctrl+Y / Ctrl+Shift+Z)· ' + redoCountForCurrent() + ' 步可重做') : '沒有可重做的操作'">
                ↷
                <span v-if="canRedo('reel', reelActiveMode)" class="cfg-matrix-undo-count">{{ redoCountForCurrent() }}</span>
              </button>
            </span>
            <!-- ── #4 模式級操作下拉 ── -->
            <span v-if="reelActiveMode" class="cfg-matrix-menu-host">
              <button class="cfg-matrix-menu-btn"
                      :class="{ active: matrixMenu.open && matrixMenu.kind === 'reel' && matrixMenu.mode === reelActiveMode }"
                      @click.stop="openMatrixMenu('reel', reelActiveMode)"
                      title="批次操作:複製模式 / 縮放整表 / 正規化 / 清空">⋯ 模式操作</button>
              <div v-if="matrixMenu.open && matrixMenu.kind === 'reel' && matrixMenu.mode === reelActiveMode"
                   class="cfg-matrix-menu-popover" @click.stop>
                <div class="cfg-matrix-menu-title">{{ reelActiveMode }} · 整表操作</div>
                <!-- 從另一模式複製 -->
                <template v-if="!matrixMenu.copyPick">
                  <button class="cfg-matrix-menu-item"
                          :disabled="matrixOtherModes(reelActiveMode).length === 0"
                          @click="matrixMenu.copyPick = true">
                    <span class="cfg-mmi-icon">📋</span>
                    <span class="cfg-mmi-text">從另一模式複製…</span>
                    <span class="cfg-mmi-chev">▸</span>
                  </button>
                </template>
                <template v-else>
                  <div class="cfg-matrix-menu-sub-title">
                    <button class="cfg-mmi-back" @click="matrixMenu.copyPick = false" title="回到主選單">‹</button>
                    選擇來源模式
                  </div>
                  <button v-for="src in matrixOtherModes(reelActiveMode)" :key="src"
                          class="cfg-matrix-menu-item"
                          @click="matrixCopyFromMode('reel', reelActiveMode, null, src)">
                    <span class="cfg-mmi-icon">→</span>
                    <span class="cfg-mmi-text">{{ src }}</span>
                  </button>
                </template>
                <div v-if="!matrixMenu.copyPick">
                  <div class="cfg-matrix-menu-divider"></div>
                  <button class="cfg-matrix-menu-item" @click="matrixScale('reel', reelActiveMode, null, 2)">
                    <span class="cfg-mmi-icon">✖</span><span class="cfg-mmi-text">整表 × 2</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixScale('reel', reelActiveMode, null, 0.5)">
                    <span class="cfg-mmi-icon">½</span><span class="cfg-mmi-text">整表 × 0.5</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixFillAll('reel', reelActiveMode, null, 100)">
                    <span class="cfg-mmi-icon">100</span><span class="cfg-mmi-text">整表填 100(重置)</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixNormalizeRows('reel', reelActiveMode, null)">
                    <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">每列正規化至 100</span>
                  </button>
                  <div class="cfg-matrix-menu-divider"></div>
                  <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                          @click="matrixClearAll('reel', reelActiveMode, null)">
                    <span class="cfg-mmi-icon">✕</span><span class="cfg-mmi-text">整表清空為 0</span>
                  </button>
                </div>
              </div>
            </span>
            </div>
          </div>

          <!-- v4.0 / #2:移除頂部平均占比 chips(占比改看下方 cell 的 %橫/%縱 顯示模式);保留 CSV 匯入匯出 -->
          <div v-if="reelActiveMode" class="cfg-matrix-prob-bar">
            <span class="cfg-matrix-csv-host">
              <button class="cfg-matrix-csv-btn" @click="exportReelCSV(reelActiveMode)" title="匯出當前模式為 CSV">⬇ CSV</button>
              <button class="cfg-matrix-csv-btn" @click="importReelCSV(reelActiveMode)" title="從 CSV 匯入(會覆寫當前模式)">⬆ CSV</button>
            </span>
          </div>

          <!-- ── 選中模式的矩陣 ── -->
          <div v-if="reelActiveMode" class="cfg-mode-card cfg-matrix-card" style="margin:0;">
            <div class="cfg-mode-card-body">

              <div class="cfg-field cfg-matrix-toolbar">
                <!-- v3.5 / #9:符號清單折疊式 -->
                <details class="cfg-matrix-symbols">
                  <summary class="cfg-matrix-symbols-summary">
                    <span class="cfg-matrix-symbols-icon">🔧</span>
                    <span class="cfg-matrix-symbols-label">符號欄位</span>
                    <span class="cfg-matrix-symbols-count">{{ reelW(reelActiveMode).symbol_ids.length }} 個</span>
                    <span class="cfg-matrix-symbols-preview">{{ reelSymbolIdsStr(reelActiveMode) }}</span>
                  </summary>
                  <div class="cfg-matrix-symbols-body">
                    <button class="cfg-matrix-btn cfg-matrix-sync-btn"
                            @click="reelSyncFromRegistry(reelActiveMode)"
                            title="以 03_Symbols 為唯一來源套用符號欄:帶入所有啟用中的符號(新符號權重初始化 100),並移除已不在清單內的欄">
                      ⇆ 從 03_Symbols 套用符號欄
                    </button>
                    <a href="#" @click.prevent="active='symbols'" class="cfg-link cfg-matrix-symbols-edit-link">編輯符號清單 →</a>
                    <div class="cfg-hint" style="margin-top:6px;">
                      符號欄以 <strong>03_Symbols</strong> 為唯一來源,不在此手動輸入。套用後會帶入所有啟用中的符號;停用或刪除的符號欄會一併移除。
                    </div>
                  </div>
                </details>
                <!-- v3.5 / #10:排序改為 dropdown -->
                <div class="cfg-matrix-sort-v2">
                  <label class="cfg-matrix-sort-v2-label">↕ 欄序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          @change="sortReelSymbols(reelActiveMode, $event.target.value); $event.target.value = ''">
                    <option value="" disabled selected>選擇…</option>
                    <option value="special-first">⭐ 特殊優先</option>
                    <option value="alpha-asc">A → Z</option>
                    <option value="alpha-desc">Z → A</option>
                    <option value="weight-desc">權重 大 → 小</option>
                    <option value="weight-asc">權重 小 → 大</option>
                  </select>
                  <label class="cfg-matrix-sort-v2-label" title="純視覺,不影響 reel_id 也不會改 02_Layout">↔ 列序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          :value="getRowSort('reel', reelActiveMode)"
                          @change="setRowSort('reel', reelActiveMode, $event.target.value)">
                    <option value="default">原序 R1 → Rn</option>
                    <option value="weight-desc">列權重 大 → 小</option>
                    <option value="weight-asc">列權重 小 → 大</option>
                  </select>
                </div>
              </div>

              <!-- 矩陣表(編輯模式;只有 1 個模式時 view toggle 不顯示,此 v-if 永遠成立) -->
              <div v-if="reelViewMode === 'edit' || modeNames.length < 2" class="cfg-matrix-wrap">
                <!-- v8.12/批B:符號欄篩選(視野聚焦,不動資料)+ 例外摘要 -->
                <div class="cfg-matrix-symfilter">
                  <span class="cfg-mqb-label">欄篩選</span>
                  <button class="cfg-chip cfg-chip-sm"
                          :class="{ active: reelSymFilterType === 'all' && reelSymFilterPicked.size === 0 }"
                          @click="clearReelSymFilter()">全部</button>
                  <button class="cfg-chip cfg-chip-sm"
                          :class="{ active: reelSymFilterType === 'special' }"
                          @click="reelSymFilterType = reelSymFilterType === 'special' ? 'all' : 'special'"
                          title="只顯示 WILD / SCATTER / SPECIAL 欄">⭐ 特殊</button>
                  <button class="cfg-chip cfg-chip-sm"
                          :class="{ active: reelSymFilterType === 'normal' }"
                          @click="reelSymFilterType = reelSymFilterType === 'normal' ? 'all' : 'normal'">一般</button>
                  <span class="cfg-msf-sep"></span>
                  <button v-for="sid in reelW(reelActiveMode).symbol_ids" :key="'msf' + sid"
                          class="cfg-chip cfg-chip-sm cfg-msf-sym"
                          :class="{ active: reelSymFilterPicked.has(sid) }"
                          @click="toggleReelSymPick(sid)"
                          title="只顯示選中的符號欄(可多選,再點取消)">{{ symIsSpecial(sid) ? '⭐' : '' }}{{ sid }}</button>
                </div>
                <div class="cfg-matrix-exceptions">
                  <span class="cfg-mqb-label" title="偏離該欄基準(眾數)的格子 = 人工調整過的例外點">例外</span>
                  <template v-if="reelExceptions(reelActiveMode).length">
                    <button v-for="ex in reelExceptions(reelActiveMode)" :key="'ex' + ex.rid + '-' + ex.sid"
                            class="cfg-exc-chip"
                            @click="openCellPopFromException($event, reelActiveMode, ex.rid, ex.sid)"
                            :title="'基準 ' + ex.base + ' → 此格 ' + ex.v + '。點擊原地微調'">
                      {{ ex.sid }}·R{{ ex.rid }} <b>{{ ex.v }}</b><s>{{ ex.base }}</s>
                    </button>
                  </template>
                  <span v-else class="cfg-exc-none">本模式各欄均勻,無人工例外</span>
                </div>

                <!-- D 大優化:常駐快速操作列(不必再開 popover) -->
                <div class="cfg-matrix-quickbar">
                  <div class="cfg-mqb-group">
                    <span class="cfg-mqb-label">填入值</span>
                    <input class="input input-sm input-center cfg-mqb-value" type="number" min="0"
                           v-model.number="matrixFillValue">
                    <button class="cfg-matrix-btn" @click="quickFillTable('reel', reelActiveMode)" title="把左邊的值填到整個表">整表</button>
                    <button class="cfg-matrix-btn" :disabled="matrixSelection.keys.size === 0"
                            @click="quickApplySelection()" title="把左邊的值填到目前選取的 cell">選取{{ matrixSelection.keys.size ? ' (' + matrixSelection.keys.size + ')' : '' }}</button>
                  </div>
                  <div class="cfg-mqb-sep"></div>
                  <div class="cfg-mqb-group">
                    <button class="cfg-matrix-btn" @click="matrixNormalizeRows('reel', reelActiveMode)" title="每個 Reel 各自正規化到 100">⚖ 每列正規化</button>
                    <button class="cfg-matrix-btn" @click="matrixScale('reel', reelActiveMode, null, 2)">×2</button>
                    <button class="cfg-matrix-btn" @click="matrixScale('reel', reelActiveMode, null, 0.5)">÷2</button>
                    <button class="cfg-matrix-btn cfg-matrix-btn-danger" @click="matrixClearAll('reel', reelActiveMode, null)" title="整表清空為 0">清空</button>
                  </div>
                  <div class="cfg-mqb-spacer"></div>
                  <span class="cfg-mqb-hint">點格=選取並編輯 · 按住拖曳=框選 · Shift=範圍 · Ctrl/⌘=多選 · 欄頭/列頭=整欄/整列</span>
                </div>

                <!-- v3.3:範圍選取浮動操作條(僅在有 selection 時顯示) -->
                <div v-if="matrixSelection.keys.size > 0" class="cfg-matrix-sel-bar">
                  <span class="cfg-matrix-sel-count">已選 {{ matrixSelection.keys.size }} 個 cell</span>
                  <div class="cfg-matrix-sel-actions">
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 100)" title="全部設為 100">⇶ 100</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 50)" title="全部設為 50">⇶ 50</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 10)" title="全部設為 10">⇶ 10</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 2)" title="所有選取值 ×2">×2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 0.5)" title="所有選取值 ÷2">÷2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('zero')" title="全部歸 0">歸 0</button>
                    <button class="cfg-matrix-btn cfg-matrix-btn-close" @click="clearMatrixSelection" title="取消選取">✕</button>
                  </div>
                  <span class="cfg-matrix-sel-hint">拖曳=框選 · Shift=範圍 · Ctrl/⌘=多選</span>
                </div>

                <table class="cfg-matrix" :class="{ 'is-dragging': matrixDrag.active }">
                  <thead>
                    <tr>
                      <th class="cfg-matrix-corner">R \ Sym</th>
                      <th v-for="sid in visibleReelSyms(reelActiveMode)" :key="sid"
                          class="cfg-matrix-colhead-clickable">
                        <div class="cfg-matrix-colhead-wrap">
                          <span class="cfg-matrix-colhead-name cfg-matrix-head-sel" @click="selectWholeColumn('reel', reelActiveMode, sid)" title="點擊選取整欄">{{ sid }}</span>
                          <span class="cfg-matrix-colhead-sum" :title="'整欄合計'">Σ{{ reelTotalForCol(reelActiveMode, sid) }}</span>
                          <span class="cfg-matrix-col-menu-host" @click.stop>
                            <button class="cfg-matrix-col-menu-btn"
                                    :class="{ active: colMenu.open && colMenu.kind === 'reel' && colMenu.mode === reelActiveMode && colMenu.sid === sid }"
                                    @click="openColMenu('reel', reelActiveMode, sid)"
                                    title="整欄操作">⋯</button>
                            <div v-if="colMenu.open && colMenu.kind === 'reel' && colMenu.mode === reelActiveMode && colMenu.sid === sid"
                                 class="cfg-matrix-col-menu-popover">
                              <div class="cfg-matrix-menu-title">{{ sid }} · 整欄操作</div>
                              <button class="cfg-matrix-menu-item" @click="reelFillColUniform(reelActiveMode, sid, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 100</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="reelFillColUniform(reelActiveMode, sid, 50); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 50</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="reelFillColUniform(reelActiveMode, sid, 10); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 10</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="reelScaleCol(reelActiveMode, sid, 2); closeColMenu()">
                                <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整欄 ×2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="reelScaleCol(reelActiveMode, sid, 0.5); closeColMenu()">
                                <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整欄 ÷2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="reelNormalizeCol(reelActiveMode, sid, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="reelCopyColToAll(reelActiveMode, sid); closeColMenu()">
                                <span class="cfg-mmi-icon">⇨</span><span class="cfg-mmi-text">複製到所有符號欄</span>
                              </button>
                              <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                      @click="reelFillColUniform(reelActiveMode, sid, 0); closeColMenu()">
                                <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整欄歸 0</span>
                              </button>
                            </div>
                          </span>
                        </div>
                      </th>
                      <th class="cfg-matrix-spark-head" title="此列(Reel)權重分佈形狀 · 一眼看出集中或分散">分佈</th>
                      <th class="cfg-matrix-total">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedReels('reel', reelActiveMode)" :key="r.reel_id"
                        @contextmenu.prevent="openRowMenu('reel', reelActiveMode, r.reel_id)">
                      <td class="cfg-matrix-rowhead cfg-matrix-head-sel" @click="selectWholeRow('reel', reelActiveMode, r.reel_id)" title="點擊選取整列">R{{ r.reel_id }}</td>
                      <td v-for="sid in visibleReelSyms(reelActiveMode)" :key="sid"
                          v-memo="[
                            reelW(reelActiveMode).weights[r.reel_id + '-' + sid],
                            isMatrixCellSelected('reel', reelActiveMode, r.reel_id, sid),
                            reelIsDeviant(reelActiveMode, r.reel_id, sid),
                            reelIsTopWeight(reelActiveMode, r.reel_id, sid),
                            reelHeatClass(reelActiveMode, reelW(reelActiveMode).weights[r.reel_id + '-' + sid] || 0),
                            cellPercent('reel', reelActiveMode, r.reel_id, sid),
                            getMatrixDisplayMode('reel', reelActiveMode)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   reelHeatClass(reelActiveMode, reelW(reelActiveMode).weights[r.reel_id + '-' + sid] || 0),
                                   { 'is-selected': isMatrixCellSelected('reel', reelActiveMode, r.reel_id, sid),
                                     'is-deviant': reelIsDeviant(reelActiveMode, r.reel_id, sid),
                                     'is-top': reelIsTopWeight(reelActiveMode, r.reel_id, sid) }]"
                          @pointerdown="onMatrixCellPointerDown('reel', reelActiveMode, r.reel_id, sid, $event)"
                          @pointerenter="onMatrixCellPointerEnter('reel', reelActiveMode, r.reel_id, sid, $event)"
                          @contextmenu.prevent="openCellPop($event.currentTarget, 'reel', reelActiveMode, r.reel_id, sid)">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               @keydown="onMatrixKeydown($event)"
                               v-model.number.lazy="reelW(reelActiveMode).weights[r.reel_id + '-' + sid]">
                        <span v-if="cellPercent('reel', reelActiveMode, r.reel_id, sid)"
                              class="cfg-matrix-cell-pct"
                              :class="'is-' + getMatrixDisplayMode('reel', reelActiveMode)">{{ cellPercent('reel', reelActiveMode, r.reel_id, sid) }}</span>
                      </td>
                      <td class="cfg-matrix-spark-cell" :title="'R' + r.reel_id + ' 權重分佈(依此列自身最大值正規化)'">
                        <span class="cfg-matrix-spark">
                          <span v-for="bar in reelRowSparkBars(reelActiveMode, r.reel_id)" :key="bar.sid"
                                class="cfg-matrix-spark-bar"
                                :class="{ 'is-zero': bar.v === 0 }"
                                :style="{ height: bar.pct + '%' }"
                                :title="bar.sid + ' = ' + bar.v"></span>
                        </span>
                      </td>
                      <td class="cfg-matrix-total-cell">
                        <span class="cfg-matrix-row-menu-host" @click.stop>
                          <button class="cfg-matrix-total-chip"
                                  :class="{ active: rowMenu.open && rowMenu.kind === 'reel' && rowMenu.mode === reelActiveMode && rowMenu.reel === r.reel_id, 'is-zero': reelTotalForRow(reelActiveMode, r.reel_id) === 0 }"
                                  @click="openRowMenu('reel', reelActiveMode, r.reel_id)"
                                  title="整列操作">{{ reelTotalForRow(reelActiveMode, r.reel_id) }} <span class="cfg-matrix-total-chev">▾</span></button>
                          <div v-if="rowMenu.open && rowMenu.kind === 'reel' && rowMenu.mode === reelActiveMode && rowMenu.reel === r.reel_id"
                               class="cfg-matrix-row-menu-popover">
                            <div class="cfg-matrix-menu-title">R{{ r.reel_id }} · 整列操作</div>
                            <button class="cfg-matrix-menu-item" @click="reelFillRowUniform(reelActiveMode, r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 100</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="reelFillRowUniform(reelActiveMode, r.reel_id, 50); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 50</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="reelScaleRow(reelActiveMode, r.reel_id, 2); closeRowMenu()">
                              <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整列 ×2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="reelScaleRow(reelActiveMode, r.reel_id, 0.5); closeRowMenu()">
                              <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整列 ÷2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="reelNormalizeRow(reelActiveMode, r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="reelCopyToAll(reelActiveMode, r.reel_id); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇩</span><span class="cfg-mmi-text">複製到所有 Reel</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="genStripFromWeights(reelActiveMode, r.reel_id, stripGenLen, stripGenStacked); closeRowMenu()"
                                    :title="'依此輪 04 權重生成真實輪帶(長度 ' + stripGenLen + (stripGenStacked ? ' · 可堆疊' : '') + ');到「真實輪帶」分頁檢視 / 微調'">
                              <span class="cfg-mmi-icon">⇄</span><span class="cfg-mmi-text">由權重生成真實輪帶</span>
                            </button>
                            <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                    @click="reelFillRowUniform(reelActiveMode, r.reel_id, 0); closeRowMenu()">
                              <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整列歸 0</span>
                            </button>
                          </div>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <!-- ── v4.8:副盤權重(副輪 .sub + 自由副盤 Panel)──
                     回應「副輪權重不知道在哪調」:獨立權重副輪與所有 Panel
                     在此各佔一列,欄序與上表相同。副輪列匯出為 Reel_ID = "<n>.sub";
                     Panel 列匯出為 Reel_ID = Panel ID。 -->
                <div v-if="hasAuxWeightRows" class="cfg-aux-weights">
                  <div class="cfg-aux-weights-title">
                    <span>🧩 副盤權重</span>
                    <span class="cfg-aux-weights-hint">
                      副輪(獨立權重)每列匯出為「<code>Reel.sub</code>」;Panel 全 0 = 不建專屬池,改走「符號集等權 → 沿用保底」fallback;蒐集型(COLLECT)副盤不滾動圖示,不列於此
                    </span>
                  </div>
                  <table class="cfg-matrix cfg-aux-matrix">
                    <thead>
                      <tr>
                        <th class="cfg-matrix-corner">盤 \\ Sym</th>
                        <th v-for="sid in visibleReelSyms(reelActiveMode)" :key="'aux'+sid">{{ sid }}</th>
                        <th class="cfg-matrix-total">合計</th>
                        <th class="cfg-aux-ops-head">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <!-- 副輪列(獨立權重者) -->
                      <tr v-for="r in independentSubReels" :key="'auxsub'+r.reel_id" class="cfg-aux-row cfg-aux-row-sub">
                        <td class="cfg-matrix-rowhead cfg-aux-rowhead-sub"
                            :title="'R' + r.reel_id + ' 的副輪(' + (r.subreel_kind || 'STACK') + ')獨立權重;匯出 Reel_ID=' + r.reel_id + '.sub'">
                          R{{ r.reel_id }}·副
                        </td>
                        <td v-for="sid in visibleReelSyms(reelActiveMode)" :key="'auxsub'+r.reel_id+sid"
                            class="cfg-matrix-cell-wrap"
                            :class="reelHeatClass(reelActiveMode, auxW(reelActiveMode).sub_weights[r.reel_id + '-' + sid] || 0)"
                            @contextmenu.prevent="openCellPop($event.currentTarget, 'sub', reelActiveMode, r.reel_id, sid)">
                          <input class="cfg-matrix-cell" type="number" min="0"
                                 v-model.number.lazy="auxW(reelActiveMode).sub_weights[r.reel_id + '-' + sid]"
                                 @click.stop>
                        </td>
                        <td class="cfg-matrix-total-cell">{{ auxRowTotal('sub', reelActiveMode, r.reel_id) }}</td>
                        <td class="cfg-aux-ops">
                          <button class="cfg-matrix-btn" @click="auxFillRow('sub', reelActiveMode, r.reel_id, 100)" title="整列填 100">⇶100</button>
                          <button class="cfg-matrix-btn" @click="auxFillFromSet('sub', reelActiveMode, r.reel_id)"
                                  :title="'依 02 指定的副盤符號集帶入(成員 100/其餘 0)' + (r.subreel_symbol_set ? ':' + r.subreel_symbol_set : ';尚未指定')">⇆集</button>
                          <button class="cfg-matrix-btn" @click="auxNormalizeRow('sub', reelActiveMode, r.reel_id)" title="整列正規化至 100">⚖</button>
                        </td>
                      </tr>
                      <!-- 自由副盤列(僅 SCROLL/TRIGGER;COLLECT 不滾動圖示故不需權重)-->
                      <tr v-for="p in scrollingPanels" :key="'auxpnl'+p.panel_id" class="cfg-aux-row cfg-aux-row-panel">
                        <td class="cfg-matrix-rowhead cfg-aux-rowhead-panel"
                            :title="'自由副盤 ' + p.panel_id + ' · 目前來源:' + panelWeightSourceLabel(p, reelActiveMode)">
                          {{ p.panel_id }}
                          <span class="cfg-aux-src-badge" :class="{ warn: panelWeightSourceLabel(p, reelActiveMode).indexOf('⚠') === 0 }">{{ panelWeightSourceLabel(p, reelActiveMode) }}</span>
                        </td>
                        <td v-for="sid in visibleReelSyms(reelActiveMode)" :key="'auxpnl'+p.panel_id+sid"
                            class="cfg-matrix-cell-wrap"
                            :class="reelHeatClass(reelActiveMode, auxW(reelActiveMode).panel_weights[p.panel_id + '-' + sid] || 0)"
                            @contextmenu.prevent="openCellPop($event.currentTarget, 'panel', reelActiveMode, p.panel_id, sid)">
                          <input class="cfg-matrix-cell" type="number" min="0"
                                 v-model.number.lazy="auxW(reelActiveMode).panel_weights[p.panel_id + '-' + sid]"
                                 @click.stop>
                        </td>
                        <td class="cfg-matrix-total-cell">{{ auxRowTotal('panel', reelActiveMode, p.panel_id) }}</td>
                        <td class="cfg-aux-ops">
                          <button class="cfg-matrix-btn" @click="auxFillRow('panel', reelActiveMode, p.panel_id, 100)" title="整列填 100(建立專屬池)">⇶100</button>
                          <button class="cfg-matrix-btn" @click="auxFillFromSet('panel', reelActiveMode, p.panel_id)"
                                  :title="'依 02 指定的符號集帶入(成員 100/其餘 0)' + (p.symbol_set ? ':' + p.symbol_set : ';尚未指定')">⇆集</button>
                          <button class="cfg-matrix-btn" @click="auxNormalizeRow('panel', reelActiveMode, p.panel_id)" title="整列正規化至 100">⚖</button>
                          <button class="cfg-matrix-btn" @click="auxFillRow('panel', reelActiveMode, p.panel_id, 0)" title="整列歸 0(改走 fallback)">∅</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- v3.6 / #5:reel 並排模式(所有模式並列,當前可編輯,其他唯讀) -->
              <!-- v3.6 / #5:reel 差異模式(其他模式相對基準的 ±%) -->
              <div v-if="(reelViewMode === 'compare' || reelViewMode === 'diff') && modeNames.length >= 2"
                   class="cfg-mode-multi-wrap">
                <div class="cfg-mode-multi-legend">
                  <div class="cfg-mode-multi-legend-row">
                    <span v-if="reelViewMode === 'compare'">
                      <strong>並排模式</strong> · 當前可編輯 ·
                      其他模式唯讀,點欄頭可切換為「當前」
                    </span>
                    <span v-else>
                      <strong>差異模式</strong> · 相對於「{{ effectiveReelBaselineMode() }}」<span v-if="isReelBaselinePinned()" class="cfg-combo-baseline-pin-tag">📌 已釘</span> ·
                      <span class="cfg-diff-up-token">+綠</span>=增加 ·
                      <span class="cfg-diff-down-token">−紅</span>=減少 ·
                      <span class="cfg-diff-eq-token">=灰</span>=相同
                    </span>
                  </div>
                  <div v-if="reelViewMode === 'diff'" class="cfg-combo-baseline-picker">
                    <span class="cfg-combo-baseline-label">基準模式:</span>
                    <button v-for="m in modeNames" :key="'rb'+m"
                            class="cfg-combo-baseline-chip"
                            :class="{ active: m === effectiveReelBaselineMode() }"
                            @click="setReelBaselineMode(m === effectiveReelBaselineMode() && isReelBaselinePinned() ? null : m)"
                            :title="m === effectiveReelBaselineMode() ? '已是基準(點擊取消釘選)' : '釘選為基準模式'">
                      {{ m }}
                    </button>
                    <button v-if="isReelBaselinePinned()"
                            class="cfg-combo-baseline-reset"
                            @click="setReelBaselineMode(null)"
                            title="取消釘選,基準將追隨當前選中的模式">取消釘選</button>
                  </div>
                  <div v-if="modeNames.length >= 3" class="cfg-combo-steps-filter">
                    <span class="cfg-combo-steps-filter-label">顯示:</span>
                    <button v-for="m in modeNames" :key="'rv'+m"
                            class="cfg-combo-step-visibility-chip"
                            :class="{ hidden: !reelModeVisible(m) }"
                            @click="toggleReelModeVisible(m)"
                            :title="reelModeVisible(m) ? '點擊隱藏這個模式' : '點擊顯示這個模式'">
                      <span v-if="!reelModeVisible(m)">👁️‍🗨️</span>
                      <span v-else>👁</span>
                      {{ m }}
                    </button>
                    <button v-if="reelHiddenCount() > 0"
                            class="cfg-combo-steps-show-all"
                            @click="reelShowAllModes()"
                            :title="'目前隱藏 ' + reelHiddenCount() + ' 個模式'">
                      全部顯示
                    </button>
                  </div>
                </div>
                <div class="cfg-mode-multi-grid"
                     :style="{ 'grid-template-columns': 'repeat(' + reelVisibleModes().length + ', minmax(0, 1fr))' }">
                  <div v-for="m in reelVisibleModes()" :key="'rc'+m"
                       class="cfg-mode-multi-card"
                       :class="{
                         'is-active': m === reelActiveMode,
                         'is-baseline': reelViewMode === 'diff' && m === effectiveReelBaselineMode() && m !== reelActiveMode
                       }">
                    <div class="cfg-mode-multi-card-header"
                         @click="reelActiveMode = m; clearMatrixSelection()"
                         title="點擊切換為當前模式">
                      <span class="cfg-mode-multi-name">{{ m }}</span>
                      <span v-if="m === reelActiveMode" class="cfg-combo-multi-active-badge">當前</span>
                      <span v-else-if="reelViewMode === 'diff' && m === effectiveReelBaselineMode()" class="cfg-combo-multi-baseline-badge">基準</span>
                      <span v-else class="cfg-combo-multi-readonly-badge">唯讀</span>
                    </div>
                    <table class="cfg-matrix cfg-mode-multi-table"
                           :class="{ 'is-readonly': m !== reelActiveMode }">
                      <thead>
                        <tr>
                          <th class="cfg-matrix-corner">R</th>
                          <th v-for="sid in reelW(m).symbol_ids" :key="sid">{{ sid }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in sortedReels('reel', m)" :key="r.reel_id">
                          <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                          <!-- 當前 mode + compare 模式:可編輯 -->
                          <template v-if="m === reelActiveMode && reelViewMode === 'compare'">
                            <td v-for="sid in reelW(m).symbol_ids" :key="sid"
                                v-memo="[reelW(m).weights[r.reel_id + '-' + sid]]"
                                class="cfg-matrix-cell-wrap"
                                :class="reelHeatClass(m, reelW(m).weights[r.reel_id + '-' + sid] || 0)">
                              <input class="cfg-matrix-cell" type="number" min="0"
                                     v-model.number.lazy="reelW(m).weights[r.reel_id + '-' + sid]"
                                     @click.stop>
                            </td>
                          </template>
                          <!-- compare 模式 / 非當前 mode:唯讀 -->
                          <template v-else-if="reelViewMode === 'compare'">
                            <td v-for="sid in reelW(m).symbol_ids" :key="sid"
                                v-memo="[reelW(m).weights[r.reel_id + '-' + sid]]"
                                class="cfg-mode-multi-cell-ro"
                                :class="reelHeatClass(m, reelW(m).weights[r.reel_id + '-' + sid] || 0)">
                              {{ reelW(m).weights[r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <!-- diff 模式:基準 mode 顯示原值 -->
                          <template v-else-if="m === effectiveReelBaselineMode()">
                            <td v-for="sid in reelW(m).symbol_ids" :key="sid"
                                v-memo="[reelW(m).weights[r.reel_id + '-' + sid]]"
                                class="cfg-mode-multi-cell-ro cfg-mode-multi-cell-base"
                                :class="reelHeatClass(m, reelW(m).weights[r.reel_id + '-' + sid] || 0)">
                              {{ reelW(m).weights[r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <!-- diff 模式:其他 mode 顯示 ±% -->
                          <template v-else>
                            <td v-for="sid in reelW(m).symbol_ids" :key="sid"
                                v-memo="[
                                  reelW(m).weights[r.reel_id + '-' + sid],
                                  reelW(effectiveReelBaselineMode()).weights[r.reel_id + '-' + sid]
                                ]"
                                class="cfg-mode-multi-cell-diff"
                                :class="'is-' + reelCellDiff(effectiveReelBaselineMode(), m, r.reel_id, sid).sign">
                              {{ cellDiffLabel(reelCellDiff(effectiveReelBaselineMode(), m, r.reel_id, sid)) }}
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- 只有 1 個模式時的 compare/diff 提示 -->
              <div v-else-if="reelViewMode !== 'edit' && modeNames.length < 2"
                   class="cfg-mode-multi-empty">
                <div class="cfg-mode-multi-empty-icon">⚠</div>
                <div>
                  目前只有 1 個模式,無法使用並排/差異模式。
                  <button class="cfg-matrix-btn"
                          style="margin-left:8px;"
                          @click="setReelViewMode('edit')">回到編輯</button>
                </div>
              </div>

            </div>
          </div>
        </template>
      </div>

      <!-- ═══════ 05_Grid_Size_Weights 格數權重 ═══════ -->
      <div v-else-if="active === 'grid_size_weights'" class="cfg-form cfg-sticky-form">
        <!-- 權重頁 W1:peer 分段(輪帶 / 分佈)+ 子切換;複用規則 peer / subtoggle CSS -->
        <div class="cfg-rule-peers">
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'reels' }" @click="gotoWeightPeer('reels')">輪帶</button>
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'dist' }" @click="gotoWeightPeer('dist')">分佈</button>
        </div>
        <div v-if="weightPeer === 'reels'" class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_weights' }" @click="active = 'reel_weights'">權重矩陣</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_strips' }" @click="active = 'reel_strips'">真實輪帶</button>
        </div>
        <div v-else class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'grid_size_weights' }" @click="active = 'grid_size_weights'">格數分佈</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'distribution_bins' }" @click="active = 'distribution_bins'">倍數區間</button>
        </div>
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">📏 05_Grid_Size_Weights · 格數權重</div>
          <div class="cfg-form-sub">
            Megaways 模式下,每 Reel 在一局內隨機開幾個格子的權重表。
            修改後 04_Reel_Weights 對應 Reel 仍照原權重發出符號,只是放幾個會由此表決定。
          </div>
        </div>

        <div v-if="tabNotApplicable('grid_size_weights')" class="cfg-tab-na-notice">
          <div class="cfg-tab-na-notice-icon">🔒</div>
          <div class="cfg-tab-na-notice-title">格數權重在目前模式不適用</div>
          <div class="cfg-tab-na-notice-text">{{ tabNAReason('grid_size_weights') }}</div>
          <button class="cfg-chip" @click="navTo('global')">→ 前往 01_Global 切換成 Megaways</button>
        </div>

        <div v-else-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>
            新增至少一個模式。
          </div>
        </div>

        <template v-else>
          <!-- v3.5 / #16:第一次提示「大部分情況各模式 grid_sizes 相同」 -->
          <div v-if="!gridHintDismissed && modeNames.length >= 2 && gridActiveMode" class="cfg-grid-hint-banner">
            <span class="cfg-grid-hint-icon">💡</span>
            <span class="cfg-grid-hint-text">
              大部分情況下各模式的格數權重設定相同,可一鍵複製。
            </span>
            <button class="cfg-grid-hint-btn"
                    @click="gridCopyToAllModes(gridActiveMode); dismissGridHint()"
                    :title="'把「' + gridActiveMode + '」複製到其他 ' + (modeNames.length - 1) + ' 個模式'">
              ⇒ 複製「{{ gridActiveMode }}」到其他模式
            </button>
            <button class="cfg-grid-hint-close" @click="dismissGridHint()" title="不再顯示">✕</button>
          </div>

          <!-- ── Sticky 模式選擇列 ── -->
          <!-- v4.9-c / D1:sticky bar 拆兩列(同 04)-->
          <div class="cfg-sticky-mode-bar cfg-smb-stacked">
            <div class="cfg-smb-row cfg-smb-row-modes">
            <span class="cfg-sticky-mode-label">模式</span>
            <button v-for="m in modeNames" :key="m"
                    class="cfg-chip"
                    :class="{ active: gridActiveMode === m }"
                    @click="gridActiveMode = m">{{ m }}</button>
            <span class="cfg-sticky-meta" v-if="gridActiveMode">
              Max: <strong>{{ gridMaxWeight(gridActiveMode) }}</strong>
            </span>
            </div>
            <div class="cfg-smb-row cfg-smb-row-tools" v-if="gridActiveMode">
            <!-- v3.5:顯示模式切換 -->
            <span v-if="gridActiveMode" class="cfg-matrix-display-toggle"
                  title="切換 cell 顯示模式(輸入值仍為絕對權重,百分比只是顯示)">
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('grid', gridActiveMode) === 'raw' }"
                      @click="setMatrixDisplayMode('grid', gridActiveMode, 'raw')"
                      title="顯示原始權重">數值</button>
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('grid', gridActiveMode) === 'pct_row' }"
                      @click="setMatrixDisplayMode('grid', gridActiveMode, 'pct_row')"
                      title="同 Reel 內各格數占比">%橫</button>
              <button class="cfg-mdt-btn"
                      :class="{ active: getMatrixDisplayMode('grid', gridActiveMode) === 'pct_col' }"
                      @click="setMatrixDisplayMode('grid', gridActiveMode, 'pct_col')"
                      title="同格數跨 Reel 分佈占比">%縱</button>
            </span>
            <!-- v3.6 / #5:grid 跨模式檢視切換 -->
            <span v-if="gridActiveMode && modeNames.length >= 2"
                  class="cfg-mode-view-toggle"
                  title="跨模式檢視:並排所有模式,或計算與基準模式的差異">
              <button class="cfg-mvt-btn"
                      :class="{ active: gridViewMode === 'edit' }"
                      @click="setGridViewMode('edit'); clearMatrixSelection()"
                      title="編輯單一模式">編輯</button>
              <button class="cfg-mvt-btn"
                      :class="{ active: gridViewMode === 'compare' }"
                      @click="setGridViewMode('compare'); clearMatrixSelection()"
                      title="所有模式並排顯示">⊞ 並排</button>
              <button class="cfg-mvt-btn"
                      :class="{ active: gridViewMode === 'diff' }"
                      @click="setGridViewMode('diff'); clearMatrixSelection()"
                      title="顯示其他模式相對於基準模式的差異 %">Δ 差異</button>
            </span>
            <!-- v3.6 / #2:Undo/Redo 按鈕 -->
            <span v-if="gridActiveMode" class="cfg-matrix-undo-host">
              <button class="cfg-matrix-undo-btn"
                      :disabled="!canUndo('grid', gridActiveMode)"
                      @click="undoMatrix()"
                      :title="canUndo('grid', gridActiveMode) ? ('復原最後批次操作(Ctrl+Z)· ' + undoCountForCurrent() + ' 步可復原') : '沒有可復原的操作'">
                ↶
                <span v-if="canUndo('grid', gridActiveMode)" class="cfg-matrix-undo-count">{{ undoCountForCurrent() }}</span>
              </button>
              <button class="cfg-matrix-undo-btn"
                      :disabled="!canRedo('grid', gridActiveMode)"
                      @click="redoMatrix()"
                      :title="canRedo('grid', gridActiveMode) ? ('重做(Ctrl+Y / Ctrl+Shift+Z)· ' + redoCountForCurrent() + ' 步可重做') : '沒有可重做的操作'">
                ↷
                <span v-if="canRedo('grid', gridActiveMode)" class="cfg-matrix-undo-count">{{ redoCountForCurrent() }}</span>
              </button>
            </span>
            <!-- ── #4 模式級操作下拉 ── -->
            <span v-if="gridActiveMode" class="cfg-matrix-menu-host">
              <button class="cfg-matrix-menu-btn"
                      :class="{ active: matrixMenu.open && matrixMenu.kind === 'grid' && matrixMenu.mode === gridActiveMode }"
                      @click.stop="openMatrixMenu('grid', gridActiveMode)"
                      title="批次操作:複製模式 / 縮放整表 / 正規化 / 清空">⋯ 模式操作</button>
              <div v-if="matrixMenu.open && matrixMenu.kind === 'grid' && matrixMenu.mode === gridActiveMode"
                   class="cfg-matrix-menu-popover" @click.stop>
                <div class="cfg-matrix-menu-title">{{ gridActiveMode }} · 整表操作</div>
                <template v-if="!matrixMenu.copyPick">
                  <button class="cfg-matrix-menu-item"
                          :disabled="matrixOtherModes(gridActiveMode).length === 0"
                          @click="matrixMenu.copyPick = true">
                    <span class="cfg-mmi-icon">📋</span>
                    <span class="cfg-mmi-text">從另一模式複製…</span>
                    <span class="cfg-mmi-chev">▸</span>
                  </button>
                </template>
                <template v-else>
                  <div class="cfg-matrix-menu-sub-title">
                    <button class="cfg-mmi-back" @click="matrixMenu.copyPick = false" title="回到主選單">‹</button>
                    選擇來源模式
                  </div>
                  <button v-for="src in matrixOtherModes(gridActiveMode)" :key="src"
                          class="cfg-matrix-menu-item"
                          @click="matrixCopyFromMode('grid', gridActiveMode, null, src)">
                    <span class="cfg-mmi-icon">→</span>
                    <span class="cfg-mmi-text">{{ src }}</span>
                  </button>
                </template>
                <div v-if="!matrixMenu.copyPick">
                  <div class="cfg-matrix-menu-divider"></div>
                  <button class="cfg-matrix-menu-item" @click="matrixScale('grid', gridActiveMode, null, 2)">
                    <span class="cfg-mmi-icon">✖</span><span class="cfg-mmi-text">整表 × 2</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixScale('grid', gridActiveMode, null, 0.5)">
                    <span class="cfg-mmi-icon">½</span><span class="cfg-mmi-text">整表 × 0.5</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixFillAll('grid', gridActiveMode, null, 100)">
                    <span class="cfg-mmi-icon">100</span><span class="cfg-mmi-text">整表填 100(重置)</span>
                  </button>
                  <button class="cfg-matrix-menu-item" @click="matrixNormalizeRows('grid', gridActiveMode, null)">
                    <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">每列正規化至 100</span>
                  </button>
                  <div class="cfg-matrix-menu-divider"></div>
                  <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                          @click="matrixClearAll('grid', gridActiveMode, null)">
                    <span class="cfg-mmi-icon">✕</span><span class="cfg-mmi-text">整表清空為 0</span>
                  </button>
                </div>
              </div>
            </span>
            </div>
          </div>

          <!-- v3.5 / #14:平均占比預覽 bar(05 顯示各格數平均占比) -->
          <div v-if="gridActiveMode" class="cfg-matrix-prob-bar">
            <button class="cfg-matrix-prob-toggle"
                    :class="{ collapsed: !probBarOpen }"
                    @click="toggleProbBar()"
                    :title="probBarOpen ? '收起占比預覽' : '展開占比預覽'">
              📊 平均占比 <span class="cfg-prob-chev">{{ probBarOpen ? '▾' : '▸' }}</span>
            </button>
            <div v-if="probBarOpen && gridSizeAvgProb(gridActiveMode)" class="cfg-matrix-prob-chips">
              <span v-for="(p, sz) in gridSizeAvgProb(gridActiveMode)" :key="sz" class="cfg-prob-chip">
                <span class="cfg-prob-chip-sid">{{ sz }} 格</span>
                <span class="cfg-prob-chip-val">{{ fmtPct(p) }}</span>
              </span>
            </div>
            <span v-if="probBarOpen" class="cfg-prob-hint">基於當前權重,每 Reel 平均開幾格的比例</span>
            <span class="cfg-matrix-csv-host">
              <button class="cfg-matrix-csv-btn" @click="exportGridCSV(gridActiveMode)" title="匯出當前模式為 CSV">⬇ CSV</button>
              <button class="cfg-matrix-csv-btn" @click="importGridCSV(gridActiveMode)" title="從 CSV 匯入(會覆寫當前模式)">⬆ CSV</button>
            </span>
          </div>

          <!-- ── 選中模式的矩陣 ── -->
          <div v-if="gridActiveMode" class="cfg-mode-card cfg-matrix-card" style="margin:0;">
            <div class="cfg-mode-card-body">

              <div class="cfg-field cfg-matrix-toolbar">
                <details class="cfg-matrix-symbols">
                  <summary class="cfg-matrix-symbols-summary">
                    <span class="cfg-matrix-symbols-icon">🔧</span>
                    <span class="cfg-matrix-symbols-label">允許的格數</span>
                    <span class="cfg-matrix-symbols-count">{{ gridW(gridActiveMode).grid_sizes.length }} 個</span>
                    <span class="cfg-matrix-symbols-preview">{{ gridSizesStr(gridActiveMode) }}</span>
                  </summary>
                  <div class="cfg-matrix-symbols-body">
                    <input class="input cfg-mono" type="text"
                           :value="gridSizesStr(gridActiveMode)"
                           @change="setGridSizesStr(gridActiveMode, $event.target.value)"
                           placeholder="3, 4, 5, 6">
                    <div class="cfg-hint" style="margin-top:6px;">
                      逗號分隔的正整數(範圍 1–20),例:<code>3, 4, 5, 6</code>。修改後會自動同步矩陣欄位。
                    </div>
                    <div v-if="modeRowRangeLabel(gridActiveMode)" class="cfg-hint" style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span>此模式 Megaways 列數範圍 <strong>{{ modeRowRangeLabel(gridActiveMode) }}</strong>(來自盤面頁逐模式設定)。</span>
                      <button class="cfg-matrix-btn" @click="applyModeRangeToGridSizes(gridActiveMode)" title="把格數欄設為此模式的列數範圍;重疊尺寸的權重保留、新尺寸填 100;可復原(Undo)">↔ 套用為格數欄</button>
                    </div>
                  </div>
                </details>
                <div class="cfg-matrix-sort-v2">
                  <label class="cfg-matrix-sort-v2-label">↕ 欄序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          @change="sortGridSizes(gridActiveMode, $event.target.value); $event.target.value = ''">
                    <option value="" disabled selected>選擇…</option>
                    <option value="num-asc">格數 小 → 大</option>
                    <option value="num-desc">格數 大 → 小</option>
                    <option value="weight-desc">權重 大 → 小</option>
                    <option value="weight-asc">權重 小 → 大</option>
                  </select>
                  <label class="cfg-matrix-sort-v2-label">↔ 列序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          :value="getRowSort('grid', gridActiveMode)"
                          @change="setRowSort('grid', gridActiveMode, $event.target.value)">
                    <option value="default">原序 R1 → Rn</option>
                    <option value="weight-desc">列權重 大 → 小</option>
                    <option value="weight-asc">列權重 小 → 大</option>
                  </select>
                </div>
              </div>

              <!-- 矩陣表(編輯模式) -->
              <div v-if="gridViewMode === 'edit' || modeNames.length < 2" class="cfg-matrix-wrap">
                <!-- v3.5:範圍選取浮動操作條(僅在有 selection 時顯示) -->
                <div v-if="matrixSelection.keys.size > 0" class="cfg-matrix-sel-bar">
                  <span class="cfg-matrix-sel-count">已選 {{ matrixSelection.keys.size }} 個 cell</span>
                  <div class="cfg-matrix-sel-actions">
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 100)" title="全部設為 100">⇶ 100</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 50)" title="全部設為 50">⇶ 50</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 10)" title="全部設為 10">⇶ 10</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 2)" title="所有選取值 ×2">×2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 0.5)" title="所有選取值 ÷2">÷2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('zero')" title="全部歸 0">歸 0</button>
                    <button class="cfg-matrix-btn cfg-matrix-btn-close" @click="clearMatrixSelection" title="取消選取">✕</button>
                  </div>
                  <span class="cfg-matrix-sel-hint">拖曳=框選 · Shift=範圍 · Ctrl/⌘=多選</span>
                </div>

                <table class="cfg-matrix" :class="{ 'is-dragging': matrixDrag.active }">
                  <thead>
                    <tr>
                      <th class="cfg-matrix-corner">R \ 格</th>
                      <th v-for="sz in gridW(gridActiveMode).grid_sizes" :key="sz"
                          class="cfg-matrix-colhead-clickable">
                        <div class="cfg-matrix-colhead-wrap">
                          <span class="cfg-matrix-colhead-name">{{ sz }} 格</span>
                          <span class="cfg-matrix-colhead-sum" :title="'整欄合計'">Σ{{ gridTotalForCol(gridActiveMode, sz) }}</span>
                          <span class="cfg-matrix-col-menu-host" @click.stop>
                            <button class="cfg-matrix-col-menu-btn"
                                    :class="{ active: colMenu.open && colMenu.kind === 'grid' && colMenu.mode === gridActiveMode && colMenu.sid === String(sz) }"
                                    @click="openColMenu('grid', gridActiveMode, String(sz))"
                                    title="整欄操作">⋯</button>
                            <div v-if="colMenu.open && colMenu.kind === 'grid' && colMenu.mode === gridActiveMode && colMenu.sid === String(sz)"
                                 class="cfg-matrix-col-menu-popover">
                              <div class="cfg-matrix-menu-title">{{ sz }} 格 · 整欄操作</div>
                              <button class="cfg-matrix-menu-item" @click="gridFillColUniform(gridActiveMode, sz, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 100</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="gridFillColUniform(gridActiveMode, sz, 50); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 50</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="gridFillColUniform(gridActiveMode, sz, 10); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 10</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="gridScaleCol(gridActiveMode, sz, 2); closeColMenu()">
                                <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整欄 ×2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="gridScaleCol(gridActiveMode, sz, 0.5); closeColMenu()">
                                <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整欄 ÷2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="gridNormalizeCol(gridActiveMode, sz, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="gridCopyColToAll(gridActiveMode, sz); closeColMenu()">
                                <span class="cfg-mmi-icon">⇨</span><span class="cfg-mmi-text">複製到所有格數欄</span>
                              </button>
                              <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                      @click="gridFillColUniform(gridActiveMode, sz, 0); closeColMenu()">
                                <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整欄歸 0</span>
                              </button>
                            </div>
                          </span>
                        </div>
                      </th>
                      <th class="cfg-matrix-total">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedReels('grid', gridActiveMode)" :key="r.reel_id"
                        @contextmenu.prevent="openRowMenu('grid', gridActiveMode, r.reel_id)">
                      <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                      <td v-for="sz in gridW(gridActiveMode).grid_sizes" :key="sz"
                          v-memo="[
                            gridW(gridActiveMode).weights[r.reel_id + '-' + sz],
                            isMatrixCellSelected('grid', gridActiveMode, r.reel_id, sz),
                            gridHeatClass(gridActiveMode, gridW(gridActiveMode).weights[r.reel_id + '-' + sz] || 0),
                            cellPercent('grid', gridActiveMode, r.reel_id, sz),
                            getMatrixDisplayMode('grid', gridActiveMode)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   gridHeatClass(gridActiveMode, gridW(gridActiveMode).weights[r.reel_id + '-' + sz] || 0),
                                   { 'is-selected': isMatrixCellSelected('grid', gridActiveMode, r.reel_id, sz) }]"
                          @pointerdown="onMatrixCellPointerDown('grid', gridActiveMode, r.reel_id, sz, $event)"
                          @pointerenter="onMatrixCellPointerEnter('grid', gridActiveMode, r.reel_id, sz, $event)"
                          @contextmenu.prevent="openCellPop($event.currentTarget, 'grid', gridActiveMode, r.reel_id, sz)">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               v-model.number.lazy="gridW(gridActiveMode).weights[r.reel_id + '-' + sz]">
                        <span v-if="cellPercent('grid', gridActiveMode, r.reel_id, sz)"
                              class="cfg-matrix-cell-pct"
                              :class="'is-' + getMatrixDisplayMode('grid', gridActiveMode)">{{ cellPercent('grid', gridActiveMode, r.reel_id, sz) }}</span>
                      </td>
                      <td class="cfg-matrix-total-cell">
                        <span class="cfg-matrix-row-menu-host" @click.stop>
                          <button class="cfg-matrix-total-chip"
                                  :class="{ active: rowMenu.open && rowMenu.kind === 'grid' && rowMenu.mode === gridActiveMode && rowMenu.reel === r.reel_id }"
                                  @click="openRowMenu('grid', gridActiveMode, r.reel_id)"
                                  title="整列操作">{{ gridTotalForRow(gridActiveMode, r.reel_id) }} <span class="cfg-matrix-total-chev">▾</span></button>
                          <div v-if="rowMenu.open && rowMenu.kind === 'grid' && rowMenu.mode === gridActiveMode && rowMenu.reel === r.reel_id"
                               class="cfg-matrix-row-menu-popover">
                            <div class="cfg-matrix-menu-title">R{{ r.reel_id }} · 整列操作</div>
                            <button class="cfg-matrix-menu-item" @click="gridFillRowUniform(gridActiveMode, r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 100</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="gridFillRowUniform(gridActiveMode, r.reel_id, 50); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 50</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="gridScaleRow(gridActiveMode, r.reel_id, 2); closeRowMenu()">
                              <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整列 ×2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="gridScaleRow(gridActiveMode, r.reel_id, 0.5); closeRowMenu()">
                              <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整列 ÷2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="gridNormalizeRow(gridActiveMode, r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                    @click="gridFillRowUniform(gridActiveMode, r.reel_id, 0); closeRowMenu()">
                              <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整列歸 0</span>
                            </button>
                          </div>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- v3.6 / #5:grid 並排模式(所有模式並列) -->
              <!-- v3.6 / #5:grid 差異模式(其他模式相對基準的 ±%) -->
              <div v-if="(gridViewMode === 'compare' || gridViewMode === 'diff') && modeNames.length >= 2"
                   class="cfg-mode-multi-wrap">
                <div class="cfg-mode-multi-legend">
                  <div class="cfg-mode-multi-legend-row">
                    <span v-if="gridViewMode === 'compare'">
                      <strong>並排模式</strong> · 當前可編輯 ·
                      其他模式唯讀,點欄頭可切換為「當前」
                    </span>
                    <span v-else>
                      <strong>差異模式</strong> · 相對於「{{ effectiveGridBaselineMode() }}」<span v-if="isGridBaselinePinned()" class="cfg-combo-baseline-pin-tag">📌 已釘</span> ·
                      <span class="cfg-diff-up-token">+綠</span>=增加 ·
                      <span class="cfg-diff-down-token">−紅</span>=減少 ·
                      <span class="cfg-diff-eq-token">=灰</span>=相同
                    </span>
                  </div>
                  <div v-if="gridViewMode === 'diff'" class="cfg-combo-baseline-picker">
                    <span class="cfg-combo-baseline-label">基準模式:</span>
                    <button v-for="m in modeNames" :key="'gb'+m"
                            class="cfg-combo-baseline-chip"
                            :class="{ active: m === effectiveGridBaselineMode() }"
                            @click="setGridBaselineMode(m === effectiveGridBaselineMode() && isGridBaselinePinned() ? null : m)"
                            :title="m === effectiveGridBaselineMode() ? '已是基準(點擊取消釘選)' : '釘選為基準模式'">
                      {{ m }}
                    </button>
                    <button v-if="isGridBaselinePinned()"
                            class="cfg-combo-baseline-reset"
                            @click="setGridBaselineMode(null)"
                            title="取消釘選,基準將追隨當前選中的模式">取消釘選</button>
                  </div>
                  <div v-if="modeNames.length >= 3" class="cfg-combo-steps-filter">
                    <span class="cfg-combo-steps-filter-label">顯示:</span>
                    <button v-for="m in modeNames" :key="'gv'+m"
                            class="cfg-combo-step-visibility-chip"
                            :class="{ hidden: !gridModeVisible(m) }"
                            @click="toggleGridModeVisible(m)"
                            :title="gridModeVisible(m) ? '點擊隱藏這個模式' : '點擊顯示這個模式'">
                      <span v-if="!gridModeVisible(m)">👁️‍🗨️</span>
                      <span v-else>👁</span>
                      {{ m }}
                    </button>
                    <button v-if="gridHiddenCount() > 0"
                            class="cfg-combo-steps-show-all"
                            @click="gridShowAllModes()"
                            :title="'目前隱藏 ' + gridHiddenCount() + ' 個模式'">
                      全部顯示
                    </button>
                  </div>
                </div>
                <div class="cfg-mode-multi-grid"
                     :style="{ 'grid-template-columns': 'repeat(' + gridVisibleModes().length + ', minmax(0, 1fr))' }">
                  <div v-for="m in gridVisibleModes()" :key="'gc'+m"
                       class="cfg-mode-multi-card"
                       :class="{
                         'is-active': m === gridActiveMode,
                         'is-baseline': gridViewMode === 'diff' && m === effectiveGridBaselineMode() && m !== gridActiveMode
                       }">
                    <div class="cfg-mode-multi-card-header"
                         @click="gridActiveMode = m; clearMatrixSelection()"
                         title="點擊切換為當前模式">
                      <span class="cfg-mode-multi-name">{{ m }}</span>
                      <span v-if="m === gridActiveMode" class="cfg-combo-multi-active-badge">當前</span>
                      <span v-else-if="gridViewMode === 'diff' && m === effectiveGridBaselineMode()" class="cfg-combo-multi-baseline-badge">基準</span>
                      <span v-else class="cfg-combo-multi-readonly-badge">唯讀</span>
                    </div>
                    <table class="cfg-matrix cfg-mode-multi-table"
                           :class="{ 'is-readonly': m !== gridActiveMode }">
                      <thead>
                        <tr>
                          <th class="cfg-matrix-corner">R</th>
                          <th v-for="sz in gridW(m).grid_sizes" :key="sz">{{ sz }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in sortedReels('grid', m)" :key="r.reel_id">
                          <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                          <template v-if="m === gridActiveMode && gridViewMode === 'compare'">
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[gridW(m).weights[r.reel_id + '-' + sz]]"
                                class="cfg-matrix-cell-wrap"
                                :class="gridHeatClass(m, gridW(m).weights[r.reel_id + '-' + sz] || 0)">
                              <input class="cfg-matrix-cell" type="number" min="0"
                                     v-model.number.lazy="gridW(m).weights[r.reel_id + '-' + sz]"
                                     @click.stop>
                            </td>
                          </template>
                          <template v-else-if="gridViewMode === 'compare'">
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[gridW(m).weights[r.reel_id + '-' + sz]]"
                                class="cfg-mode-multi-cell-ro"
                                :class="gridHeatClass(m, gridW(m).weights[r.reel_id + '-' + sz] || 0)">
                              {{ gridW(m).weights[r.reel_id + '-' + sz] || 0 }}
                            </td>
                          </template>
                          <template v-else-if="m === effectiveGridBaselineMode()">
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[gridW(m).weights[r.reel_id + '-' + sz]]"
                                class="cfg-mode-multi-cell-ro cfg-mode-multi-cell-base"
                                :class="gridHeatClass(m, gridW(m).weights[r.reel_id + '-' + sz] || 0)">
                              {{ gridW(m).weights[r.reel_id + '-' + sz] || 0 }}
                            </td>
                          </template>
                          <template v-else>
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[
                                  gridW(m).weights[r.reel_id + '-' + sz],
                                  gridW(effectiveGridBaselineMode()).weights[r.reel_id + '-' + sz]
                                ]"
                                class="cfg-mode-multi-cell-diff"
                                :class="'is-' + gridCellDiff(effectiveGridBaselineMode(), m, r.reel_id, sz).sign">
                              {{ cellDiffLabel(gridCellDiff(effectiveGridBaselineMode(), m, r.reel_id, sz)) }}
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div v-else-if="gridViewMode !== 'edit' && modeNames.length < 2"
                   class="cfg-mode-multi-empty">
                <div class="cfg-mode-multi-empty-icon">⚠</div>
                <div>
                  目前只有 1 個模式,無法使用並排/差異模式。
                  <button class="cfg-matrix-btn"
                          style="margin-left:8px;"
                          @click="setGridViewMode('edit')">回到編輯</button>
                </div>
              </div>

            </div>
          </div>
        </template>
      </div>

      <!-- ═══════ 06_Paylines 中獎線(v3.2 兩欄極簡)═══════ -->
      <div v-else-if="active === 'paylines'" class="cfg-form cfg-paylines-v2-form" style="display:flex;flex-direction:column;height:100%;">
        <!-- §2.1 peer 分段(中獎線 peer 檢視;與規則頁 peer 共用)-->
        <div class="cfg-rule-peers">
          <button class="cfg-rule-peer" :class="{ active: rulePeer === 'rules' }" @click="gotoPeer('rules')">規則</button>
          <button v-if="rulePeerLineVisible" class="cfg-rule-peer" :class="{ active: rulePeer === 'lines' }" @click="gotoPeer('lines')">中獎線</button>
          <button class="cfg-rule-peer" :class="{ active: rulePeer === 'gen' }" @click="gotoPeer('gen')">產牌</button>
        </div>
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">
            ➰ 06_Paylines · 中獎線
            <span class="cfg-paylines-mode-badge" :class="paylineLineMode ? 'is-line' : 'is-other'">
              {{ paylineLineMode ? 'LINE 模式' : (g.pay_type || '?') + ' 模式' }}
            </span>
            <span class="sym-info sym-info-below" data-tip="每輪各點一格即可（順序不拘）;同一輪再點會替換該格。涵蓋所有輪、且不與現有線重複時才能儲存。">ⓘ</span>
          </div>
          <div class="cfg-form-sub">
            <template v-if="paylineLineMode">
              <strong>LINE 模式規則:</strong>每條中獎線必須「每個 Reel 恰好一個點」、且前 3 格不可與其他線重疊。
              開啟點選模式後,系統會依 Reel 順序引導你建構路徑。
            </template>
            <template v-else>
              定義中獎路徑。座標格式 <code>(R,r)</code>:R = Reel 編號,r = 該 Reel 的列(1-based,1 = 最上)。
              當前 <code>pay_type = {{ g.pay_type }}</code> 不一定使用中獎線,可參考
              <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global</a>。
            </template>
            <span class="cfg-paylines-divider">·</span>
            盤面結構來自 <a href="#" @click.prevent="active='layout'" class="cfg-link">02_Layout</a>
          </div>
        </div>

        <div v-if="tabNotApplicable('paylines')" class="cfg-tab-na-notice">
          <div class="cfg-tab-na-notice-icon">🔒</div>
          <div class="cfg-tab-na-notice-title">中獎線在目前模式不適用</div>
          <div class="cfg-tab-na-notice-text">{{ tabNAReason('paylines') }}</div>
          <button class="cfg-chip" @click="navTo('global')">→ 前往 01_Global 調整賠付模型</button>
        </div>

        <div class="cfg-paylines-v2" v-show="!tabNotApplicable('paylines')">

          <!-- ════ 左欄:中獎線列表(含 mini SVG)════ -->
          <div class="cfg-paylines-v2-list">
            <div class="cfg-split-list-header">
              <div class="cfg-split-list-title">中獎線</div>
              <div class="cfg-split-list-count">
                共 {{ paylines.length }} 條<span v-if="paylineOverlapIdxs.size > 0" class="cfg-paylines-list-warn"> · {{ paylineOverlapIdxs.size }} 條前 3 格重疊</span>
              </div>
            </div>

            <!-- 總覽模式切換 -->
            <div class="cfg-paylines-v2-list-toolbar">
              <button class="cfg-paylines-overview-toggle"
                      :class="{ active: paylineOverviewMode }"
                      @click="paylineOverviewMode = !paylineOverviewMode"
                      :title="paylineOverviewMode ? '回到單條檢視' : '所有中獎線疊加顯示'">
                <span>{{ paylineOverviewMode ? '✦' : '◇' }}</span>
                <span>{{ paylineOverviewMode ? '總覽 ON' : '總覽' }}</span>
              </button>
              <button v-if="paylines.length > 0" class="cfg-payline-clear-btn"
                      @click="clearAllPaylines" title="清空全部中獎線">
                <span>🗑</span><span>清空</span>
              </button>
              <!-- #16:計分方向已收斂到 01_Global · 賠付模型,此處僅顯示 -->
              <div class="cfg-payline-global-dir" title="計分方向已移到 01_Global · 賠付模型">
                <span class="cfg-payline-global-dir-label">方向</span>
                <span class="cfg-payline-dir-readonly">{{ paylineDirLabel(curScanDir) }}</span>
                <a href="#" class="cfg-link" @click.prevent="navTo('global')">於 01_Global 調整</a>
              </div>
            </div>

            <div class="cfg-paylines-v2-list-body">
              <div v-for="(pl, idx) in paylines" :key="idx"
                   class="cfg-payline-v2-item"
                   :class="{
                     active: selectedPaylineIdx === idx,
                     'is-overlap': paylineOverlapIdxs.has(idx),
                     'is-invalid': pl.path && !paylineValid(pl).valid,
                     'is-incomplete': paylineLineMode && paylineValid(pl).valid && !paylineCompleteness(pl).isComplete,
                   }"
                   @click="selectedPaylineIdx = idx"
                   @dblclick="selectedPaylineIdx = idx"
                   @contextmenu.prevent="openPaylineCtx(idx, $event)">
                <!-- mini SVG -->
                <svg class="cfg-payline-mini"
                     :viewBox="paylineMiniSvg(pl).viewBox"
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg">
                  <rect v-for="(c, i) in paylineMiniSvg(pl).cells" :key="'mc'+i"
                        :x="c.x" :y="c.y" :width="c.w" :height="c.h"
                        rx="0.8" class="cfg-payline-mini-cell" />
                  <polyline v-if="paylineMiniSvg(pl).linePoints"
                            :points="paylineMiniSvg(pl).linePoints"
                            class="cfg-payline-mini-line"
                            :style="{ stroke: paylineColor(idx) }" />
                </svg>

                <div class="cfg-payline-v2-item-meta">
                  <div class="cfg-payline-v2-item-row">
                    <span class="cfg-payline-v2-item-id">L{{ pl.line_id }}</span>
                    <span v-if="paylineOverlapIdxs.has(idx)" class="cfg-payline-v2-badge overlap" title="前 3 格與其他線重疊">⚠</span>
                    <span v-else-if="pl.path && !paylineValid(pl).valid" class="cfg-payline-v2-badge err" title="路徑無效">⚠</span>
                    <span v-else-if="paylineLineMode && paylineValid(pl).valid && !paylineCompleteness(pl).isComplete" class="cfg-payline-v2-badge warn" title="LINE 完整度不足">!</span>
                    <span v-else-if="paylineValid(pl).valid" class="cfg-payline-v2-badge ok" title="路徑有效">✓</span>
                  </div>
                  <div class="cfg-payline-v2-item-sub" :title="pl.path">{{ humanizePaylinePath(pl) }}<span v-if="pl.notes" class="cfg-payline-v2-item-note"> · {{ pl.notes }}</span></div>
                </div>
                <button class="cfg-payline-kebab" @click.stop="openPaylineCtx(idx, $event)" title="編輯 / 刪除">⋯</button>
              </div>
            </div>

            <!-- §3.5:中獎線列右鍵 / ⋯ 選單(編輯 / 刪除;無複製;複用 cfg-cv-ctx)-->
            <div class="cfg-cv-ctx payline-ctx" v-if="paylineCtx.open" :style="{ left: paylineCtx.x + 'px', top: paylineCtx.y + 'px' }">
              <button class="cfg-cv-ctx-item" @click="paylineCtxEdit()">編輯</button>
              <button class="cfg-cv-ctx-item cfg-cv-ctx-danger" @click="paylineCtxDelete()" :disabled="paylines.length <= 1">刪除</button>
            </div>

            <!-- 新增按鈕(下拉範本) -->
            <div class="cfg-payline-add-host">
              <button class="cfg-payline-add-btn"
                      :class="{ active: paylineAddMenuOpen }"
                      @click="togglePaylineAddMenu">
                <span>+</span><span>新增中獎線</span><span class="cfg-payline-add-caret">▾</span>
              </button>
              <div v-if="paylineAddMenuOpen" class="cfg-payline-add-menu">
                <div class="cfg-payline-add-menu-title">選擇範本</div>
                <button v-for="p in PAYLINE_PRESETS" :key="p.key"
                        class="cfg-payline-add-menu-item"
                        @click="addPaylineFromPreset(p.key)">
                  <span class="cfg-payline-add-menu-icon">{{ p.icon }}</span>
                  <span class="cfg-payline-add-menu-label">
                    <span class="cfg-payline-add-menu-name">{{ p.label }}</span>
                    <span class="cfg-payline-add-menu-note">{{ p.note }}</span>
                  </span>
                </button>
              </div>
            </div>

            <!-- v6.2 / Q4:自動產生(批次) -->
            <div class="cfg-payline-gen-host">
              <button class="cfg-payline-gen-btn"
                      :class="{ active: paylineGenOpen }"
                      @click="togglePaylineGen">
                <span>⚙</span><span>自動產生</span><span class="cfg-payline-add-caret">▾</span>
              </button>
              <div v-if="paylineGenOpen" class="cfg-payline-gen-panel">
                <div class="cfg-payline-add-menu-title">中獎線自動產生</div>

                <!-- v6.3:不等高盤面改為「資訊提示」而非阻擋 — 演算法逐輪夾擠各輪上限 -->
                <div v-if="!paylineBoardUniform" class="cfg-payline-gen-note">
                  盤面各輪列數不一致;將逐輪夾擠產生平滑線(每輪限其各自列數上限)。
                </div>

                <!-- 方式 -->
                <div class="cfg-payline-gen-row">
                  <div class="cfg-payline-gen-label">方式</div>
                  <div class="cfg-payline-gen-chips">
                    <button class="cfg-chip" :class="{ active: paylineGenMethod==='general' }"
                            @click="paylineGenMethod='general'">一般線</button>
                    <button class="cfg-chip" :class="{ active: paylineGenMethod==='adjacent' }"
                            @click="paylineGenMethod='adjacent'">相鄰≤1</button>
                  </div>
                </div>
                <div class="cfg-hint cfg-payline-gen-hint">
                  一般線 = 水平 + V/Λ + 對角 + 淺彎(相鄰跨列≤2);相鄰≤1 = 相鄰輪列差不超過 1。
                </div>

                <!-- 線數 -->
                <div class="cfg-payline-gen-row">
                  <div class="cfg-payline-gen-label">線數</div>
                  <div class="cfg-payline-gen-stepper">
                    <button class="cfg-stepper-btn" @click="paylineGenCount = Math.max(10, (Number(paylineGenCount)||10) - 1)" title="線數 −1">−</button>
                    <input type="number" min="10" max="50" v-model.number="paylineGenCount" class="cfg-payline-gen-num" />
                    <button class="cfg-stepper-btn" @click="paylineGenCount = Math.min(50, (Number(paylineGenCount)||10) + 1)" title="線數 +1">+</button>
                  </div>
                  <div class="cfg-payline-gen-avail">上限 {{ paylineGenAvailable }}</div>
                </div>

                <!-- 寫入模式 -->
                <div class="cfg-payline-gen-row">
                  <div class="cfg-payline-gen-label">寫入</div>
                  <div class="cfg-payline-gen-chips">
                    <button class="cfg-chip" :class="{ active: paylineGenMode==='replace' }"
                            @click="paylineGenMode='replace'">取代全部</button>
                    <button class="cfg-chip" :class="{ active: paylineGenMode==='append' }"
                            @click="paylineGenMode='append'">追加</button>
                  </div>
                </div>

                <button class="cfg-payline-gen-run" @click="runPaylineGen">產生</button>
              </div>
            </div>
          </div>
          <div class="cfg-paylines-v2-stage">

            <!-- 空狀態 -->
            <div v-if="paylines.length === 0" class="cfg-split-empty">
              <div class="cfg-split-empty-icon">➰</div>
              <div>尚無中獎線,請從左下角「新增中獎線」開始</div>
            </div>

            <!-- 總覽模式 -->
            <template v-else-if="paylineOverviewMode">
              <div class="cfg-paylines-v2-overview-bar">
                <div class="cfg-paylines-v2-overview-title">
                  ✦ 全部中獎線總覽 · {{ paylines.length }} 條
                </div>
                <div class="cfg-paylines-v2-overview-legend">
                  <span v-for="(pl, idx) in paylines" :key="'lg'+idx"
                        class="cfg-paylines-overview-legend-item"
                        :class="{ active: selectedPaylineIdx === idx }"
                        @click="selectedPaylineIdx = idx; paylineOverviewMode = false">
                    <span class="cfg-paylines-overview-legend-dot" :style="{ background: paylineColor(idx) }"></span>
                    L{{ pl.line_id }}
                    <span v-if="paylineOverlapIdxs.has(idx)" class="cfg-paylines-overview-legend-warn" title="重疊">⚠</span>
                  </span>
                </div>
                <button class="cfg-paylines-svg-toggle" @click="paylineOverviewMode = false">
                  ← 回到單條編輯
                </button>
              </div>
              <div class="cfg-paylines-v2-svg-wrap is-overview">
                <svg :viewBox="layoutViewBox" class="cfg-paylines-v2-svg"
                     preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                  <!-- 背景 cells -->
                  <rect v-for="(c, i) in layoutCells" :key="'ovbg'+i"
                        :x="c.x" :y="c.y"
                        :width="LAYOUT_CELL_SIZE" :height="LAYOUT_CELL_SIZE"
                        :class="['cfg-payline-bg-cell', c.kind === 'sub' ? 'sub' : '']"
                        rx="3" />
                  <!-- 所有線疊加 -->
                  <polyline v-for="ln in paylineOverviewLines()" :key="'ovln'+ln.idx"
                            :points="ln.points"
                            :class="['cfg-payline-overview-line', { 'is-active': ln.isActive, 'is-overlap': ln.isOverlap }]"
                            :style="{ stroke: ln.color }" />
                </svg>
              </div>
            </template>

            <!-- 單條編輯模式 -->
            <template v-else-if="paylines[selectedPaylineIdx]">
              <!-- 頂部 inline 工具列:標題 + 欄位 + 點選/清空 -->
              <div class="cfg-paylines-v2-topbar cfg-reveal-zone">
                <!-- 左:身份徽章 + 完整度 -->
                <div class="cfg-paylines-v2-topbar-left">
                  <span class="cfg-paylines-v2-id">L{{ paylines[selectedPaylineIdx].line_id }}</span>
                  <div v-if="paylineLineMode && layout.length > 0"
                       class="cfg-paylines-v2-progress"
                       :class="{
                         'is-ok': paylineCompleteness(paylines[selectedPaylineIdx]).isComplete,
                         'is-warn': !paylineCompleteness(paylines[selectedPaylineIdx]).isComplete
                       }">
                    {{ paylineCompleteness(paylines[selectedPaylineIdx]).filled.size }}/{{ layout.length }} Reels
                  </div>
                </div>

                <!-- 右:點選模式 + 清空 + 刪除 -->
                <div class="cfg-paylines-v2-topbar-actions">
                  <button class="cfg-paylines-svg-toggle"
                          :class="{ active: paylineClickMode }"
                          @click="paylineClickMode = !paylineClickMode"
                          :title="paylineClickMode ? '關閉點選模式' : '開啟點選模式:在盤面直接點選 cell'">
                    <span>🖱</span>
                    <span>{{ paylineClickMode ? '點選中' : '點選模式' }}</span>
                  </button>
                  <button v-if="paylineClickMode && paylineLineMode"
                          class="cfg-paylines-guide-toggle"
                          :class="{ active: paylineGuideOn }"
                          @click="paylineGuideOn = !paylineGuideOn"
                          :title="paylineGuideOn ? '智能引導 ON:自動依 Reel 順序、灰掉已填' : '關閉智能引導,自由點選'">
                    <span>{{ paylineGuideOn ? '✨' : '○' }}</span>
                    <span>引導</span>
                  </button>
                  <button v-if="paylines[selectedPaylineIdx].path"
                          class="cfg-paylines-svg-clear cfg-reveal"
                          @click="clearPaylinePath"
                          title="清空此中獎線的所有點">✕ 清空</button>
                  <button class="cfg-split-detail-del cfg-reveal"
                          @click="removePayline(selectedPaylineIdx)"
                          :disabled="paylines.length <= 1"
                          :title="paylines.length <= 1 ? '至少需要保留一條中獎線' : '刪除此中獎線'">🗑</button>
                </div>
              </div>

              <!-- 狀態 banner(完整度 / 重疊 / 錯誤)-->
              <div v-if="activePaylineStatus.msg"
                   class="cfg-paylines-v2-status"
                   :class="'is-' + activePaylineStatus.kind">
                <span class="cfg-paylines-v2-status-icon">
                  {{ activePaylineStatus.kind === 'ok' ? '✓'
                     : activePaylineStatus.kind === 'warn' ? '⚠'
                     : activePaylineStatus.kind === 'error' ? '✕' : 'ⓘ' }}
                </span>
                <span class="cfg-paylines-v2-status-msg">{{ activePaylineStatus.msg }}</span>
                <span v-if="paylineClickMode" class="cfg-paylines-v2-status-hint">
                  左鍵=加/換點 · 右鍵=移除 · 同格再點=移除
                </span>
              </div>

              <!-- 大 SVG -->
              <div class="cfg-paylines-v2-svg-wrap">
                <svg :viewBox="layoutViewBox" class="cfg-paylines-v2-svg"
                     :class="{ 'cfg-paylines-click-mode': paylineClickMode, 'is-line-guide': paylineLineMode && paylineGuideOn && paylineClickMode }"
                     preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"
                     @contextmenu="onPaylineSvgRightClick">
                  <!-- 背景 cells -->
                  <g v-for="(c, i) in layoutCells" :key="'bg'+i">
                    <rect
                          :x="c.x" :y="c.y"
                          :width="LAYOUT_CELL_SIZE" :height="LAYOUT_CELL_SIZE"
                          :class="[
                            'cfg-payline-bg-cell',
                            c.kind === 'sub' ? 'sub' : '',
                            paylineClickMode && c.kind === 'main' ? 'clickable' : '',
                            paylineClickMode && c.kind === 'main' ? ('state-' + paylineCellState(c)) : '',
                            paylineCellPathIndex(c) > 0 ? 'in-path' : '',
                          ]"
                          rx="3"
                          @click="onPaylineCellClick(c)" />
                    <!-- 序號:已加入路徑的 cell -->
                    <text v-if="paylineClickMode && paylineCellPathIndex(c) > 0"
                          :x="c.x + LAYOUT_CELL_SIZE / 2"
                          :y="c.y + LAYOUT_CELL_SIZE / 2"
                          text-anchor="middle" dominant-baseline="central"
                          class="cfg-payline-cell-num"
                          pointer-events="none">{{ paylineCellPathIndex(c) }}</text>
                    <!-- 引導提示:expected cell 顯示 「↓」-->
                    <text v-else-if="paylineClickMode && paylineLineMode && paylineGuideOn && paylineCellState(c) === 'expected'"
                          :x="c.x + LAYOUT_CELL_SIZE / 2"
                          :y="c.y + LAYOUT_CELL_SIZE / 2"
                          text-anchor="middle" dominant-baseline="central"
                          class="cfg-payline-cell-hint"
                          pointer-events="none">·</text>
                  </g>

                  <!-- 路徑線 -->
                  <template v-if="paylineClickMode">
                    <polyline v-if="paylineCellsForClickMode().length >= 2"
                              :points="paylineCellsForClickMode().map(c => c.x + ',' + c.y).join(' ')"
                              class="cfg-payline-line cfg-payline-line-preview" />
                  </template>
                  <template v-else>
                    <polyline v-if="paylineCells(paylines[selectedPaylineIdx]).length >= 2"
                              :points="paylineCells(paylines[selectedPaylineIdx]).map(c => c.x + ',' + c.y).join(' ')"
                              class="cfg-payline-line" />
                    <g v-for="(c, i) in paylineCells(paylines[selectedPaylineIdx])" :key="'pt'+i">
                      <circle :cx="c.x" :cy="c.y" :r="9" class="cfg-payline-point" />
                      <text :x="c.x" :y="c.y" text-anchor="middle" dominant-baseline="central"
                            class="cfg-payline-num">{{ i + 1 }}</text>
                    </g>
                  </template>
                </svg>
              </div>

              <!-- v5.0-d:path / 備註移到棋盤下方 — 棋盤位置不再被欄位換行推擠 -->
              <div class="cfg-paylines-v2-fields-under">
                <div class="cfg-paylines-v2-field">
                  <label>path</label>
                  <input class="input cfg-mono cfg-paylines-v2-path-input" type="text"
                         :class="{ err: paylines[selectedPaylineIdx].path && !paylineValid(paylines[selectedPaylineIdx]).valid }"
                         v-model.trim="paylines[selectedPaylineIdx].path"
                         placeholder="(1,1)-(2,1)-(3,1)-(4,1)-(5,1)">
                </div>
                <div class="cfg-paylines-v2-field cfg-paylines-v2-field-notes">
                  <label>備註</label>
                  <input class="input cfg-paylines-v2-notes-input" type="text"
                         v-model.trim="paylines[selectedPaylineIdx].notes"
                         placeholder="(選填)">
                </div>
              </div>

              <!-- debug 折疊 -->
              <details class="cfg-debug cfg-paylines-v2-debug" @toggle="dbgOpen.paylines = $event.target.open">
                <summary>🔍 預覽目前 JSON({{ paylines.length }} 條中獎線)</summary>
                <pre v-if="dbgOpen.paylines" class="cfg-debug-pre">{{ paylinesDebugJson }}</pre>
              </details>
            </template>
          </div>

        </div>
      </div>


      <!-- ═══════ 07_Constraints 硬約束(v3.3 兩欄改造)═══════ -->
      <div v-else-if="active === 'constraints'" class="cfg-form cfg-constraints-v2-form" style="display:flex;flex-direction:column;height:100%;">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">🚫 07_Constraints · 硬約束</div>
          <div class="cfg-form-sub">
            限制特定符號的出現位置或數量。Symbol_ID 來自
            <a href="#" @click.prevent="active='symbols'" class="cfg-link">03_Symbols</a>,
            Mode_Scope 來自 <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>。
          </div>
        </div>

        <div class="cfg-constraints-v2">

          <!-- ════ 左欄:約束列表 ════ -->
          <div class="cfg-constraints-v2-list">
            <div class="cfg-split-list-header">
              <div class="cfg-split-list-title">硬約束</div>
              <div class="cfg-split-list-count">共 {{ constraints.length }} 條</div>
            </div>

            <div class="cfg-constraints-v2-list-body">
              <div v-for="(c, idx) in constraints" :key="'cs-' + idx"
                   class="cfg-constraint-v2-item"
                   :class="{
                     active: selectedConstraintIdx === idx,
                     'is-err': constraintStatus(c).kind === 'err',
                     'is-warn': constraintStatus(c).kind === 'warn',
                   }"
                   :title="humanizeConstraint(c)"
                   @click="selectedConstraintIdx = idx">
                <!-- mini SVG -->
                <svg class="cfg-constraint-mini"
                     :viewBox="constraintMiniSvg(c).viewBox"
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg">
                  <rect v-for="(cell, i) in constraintMiniSvg(c).cells" :key="'cmc'+i"
                        :x="cell.x" :y="cell.y" :width="cell.w" :height="cell.h"
                        rx="0.8"
                        :class="['cfg-constraint-mini-cell', 'state-' + cell.state]" />
                </svg>

                <div class="cfg-constraint-v2-item-meta">
                  <div class="cfg-constraint-v2-item-row">
                    <span class="cfg-constraint-v2-item-id">{{ c.constraint_id || '?' }}</span>
                    <span class="cfg-constraint-v2-item-type" :class="'ctype-' + c.ctype">{{ c.ctype }}</span>
                    <span v-if="constraintStatus(c).kind === 'err'" class="cfg-constraint-v2-badge err">✕</span>
                    <span v-else-if="constraintStatus(c).kind === 'warn'" class="cfg-constraint-v2-badge warn">!</span>
                    <span v-else class="cfg-constraint-v2-badge ok">✓</span>
                  </div>
                  <div class="cfg-constraint-v2-item-sub">
                    <span v-if="c.symbol_id" class="cfg-constraint-sym">{{ c.symbol_id }}</span>
                    <span v-else class="cfg-constraint-v2-item-empty">(未指定符號)</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="cfg-constraints-v2-list-add">
              <button class="cfg-payline-add-btn"
                      @click="addConstraint()">
                <span>+</span><span>新增約束</span>
              </button>
            </div>
          </div>

          <!-- ════ 右欄:選中約束的詳細編輯 ════ -->
          <div class="cfg-constraints-v2-stage">

            <!-- 空狀態 -->
            <div v-if="constraints.length === 0" class="cfg-split-empty">
              <div class="cfg-split-empty-icon">🚫</div>
              <div>尚無硬約束,點左下角「新增約束」開始</div>
            </div>

            <template v-else-if="constraints[selectedConstraintIdx]">
              <!-- 頂部:身份徽章 + 操作 -->
              <div class="cfg-constraints-v2-topbar cfg-reveal-zone">
                <div class="cfg-constraints-v2-topbar-left">
                  <input class="input cfg-mode-name-input cfg-constraints-v2-id-input"
                         :class="{ err: !constraints[selectedConstraintIdx].constraint_id.trim() || (constraintDuplicateIds.has(constraints[selectedConstraintIdx].constraint_id) && constraints[selectedConstraintIdx].constraint_id) }"
                         v-model.trim="constraints[selectedConstraintIdx].constraint_id"
                         placeholder="C001"
                         maxlength="20">
                </div>
                <div class="cfg-constraints-v2-topbar-actions">
                  <button class="cfg-split-detail-dup cfg-reveal"
                          @click="duplicateConstraint(selectedConstraintIdx)"
                          title="複製此約束">⎘</button>
                  <button class="cfg-split-detail-del cfg-reveal"
                          @click="removeConstraint(selectedConstraintIdx)"
                          title="刪除此約束">✕</button>
                </div>
              </div>

              <!-- 白話翻譯卡 -->
              <div class="cfg-rule-humanize-card cfg-constraint-humanize">
                <span class="cfg-rule-humanize-icon">💬</span>
                <span class="cfg-rule-humanize-text">{{ humanizeConstraint(constraints[selectedConstraintIdx]) }}</span>
              </div>

              <!-- 編號錯誤提示 -->
              <div v-if="!constraints[selectedConstraintIdx].constraint_id.trim()" class="cfg-warn cfg-warn-inline">⚠ 約束編號不能為空</div>
              <div v-else-if="constraintDuplicateIds.has(constraints[selectedConstraintIdx].constraint_id)" class="cfg-warn cfg-warn-inline">
                ⚠ 編號「{{ constraints[selectedConstraintIdx].constraint_id }}」與其他約束重複
              </div>

              <!-- 約束類型(大按鈕,帶 icon)-->
              <div class="cfg-constraints-v2-section">
                <div class="cfg-constraints-v2-section-title">約束類型 <span class="cfg-key">ctype</span></div>
                <div class="cfg-constraints-v2-ctype-row">
                  <button v-for="t in CONSTRAINT_TYPES" :key="t"
                          class="cfg-constraints-v2-ctype-btn"
                          :class="{ active: constraints[selectedConstraintIdx].ctype === t }"
                          @click="constraints[selectedConstraintIdx].ctype = t">
                    <span class="cfg-constraints-v2-ctype-icon">
                      {{ t === 'REEL_RESTRICT' ? '🎯' : (t === 'GLOBAL_MAX' ? '🔼' : '🔽') }}
                    </span>
                    <div class="cfg-constraints-v2-ctype-text">
                      <div class="cfg-constraints-v2-ctype-name">{{ t }}</div>
                      <div class="cfg-constraints-v2-ctype-desc">
                        {{ t === 'REEL_RESTRICT' ? '限制只能出現在某些 Reel'
                         : t === 'GLOBAL_MAX' ? '全盤上最多 N 個'
                         : '全盤上至少 N 個' }}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- 適用符號 -->
              <div class="cfg-constraints-v2-section">
                <div class="cfg-constraints-v2-section-title">適用符號 <span class="cfg-key">symbol_id</span></div>
                <div v-if="symbolNames.length > 0" class="cfg-chip-row cfg-symbol-chips" style="margin-bottom:6px;">
                  <button v-for="s in symbolNames" :key="s"
                          class="cfg-chip cfg-chip-sm"
                          :class="{ active: constraints[selectedConstraintIdx].symbol_id === s }"
                          @click="constraints[selectedConstraintIdx].symbol_id = s">{{ s }}</button>
                </div>
                <input class="input cfg-mono" type="text"
                       v-model.trim="constraints[selectedConstraintIdx].symbol_id"
                       placeholder="或自行輸入 Symbol_ID(如 WILD)">
              </div>

              <!-- REEL_RESTRICT:Reel chip 多選 + mini 預覽 -->
              <div v-if="constraints[selectedConstraintIdx].ctype === 'REEL_RESTRICT'"
                   class="cfg-constraints-v2-section">
                <div class="cfg-constraints-v2-section-title">
                  允許的 Reel <span class="cfg-key">reels_allowed</span>
                  <span class="cfg-constraints-v2-section-hint">
                    {{ parseReelsAllowed(constraints[selectedConstraintIdx].reels_allowed).length }} / {{ layout.length }} 已勾選
                  </span>
                </div>

                <!-- chip 多選 -->
                <div class="cfg-constraint-reel-chips">
                  <button v-for="rn in constraintActiveReelChips()" :key="rn"
                          class="cfg-constraint-reel-chip"
                          :class="{ active: constraintReelActive(constraints[selectedConstraintIdx], rn) }"
                          @click="toggleConstraintReel(constraints[selectedConstraintIdx], rn)">
                    R{{ rn }}
                  </button>
                </div>

                <!-- 大盤面預覽:高亮 allowed reel -->
                <div class="cfg-constraint-svg-preview">
                  <svg :viewBox="layoutViewBox" class="cfg-constraint-svg"
                       preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                    <rect v-for="(cell, i) in layoutCells" :key="'cb'+i"
                          :x="cell.x" :y="cell.y"
                          :width="LAYOUT_CELL_SIZE" :height="LAYOUT_CELL_SIZE"
                          :class="['cfg-constraint-svg-cell',
                                   constraintReelActive(constraints[selectedConstraintIdx], cell.reel) ? 'allowed' : 'restricted',
                                   cell.kind === 'sub' ? 'sub' : '']"
                          rx="3" />
                    <text v-for="(cell, i) in layoutCells.filter(c => c.kind === 'main' && c.row === 1)"
                          :key="'rl'+i"
                          :x="cell.x + LAYOUT_CELL_SIZE / 2"
                          :y="cell.y - 4"
                          text-anchor="middle"
                          class="cfg-constraint-svg-label">R{{ cell.reel }}</text>
                  </svg>
                </div>

                <!-- 輸入備援 -->
                <details class="cfg-constraints-v2-rawinput">
                  <summary>🔧 直接編輯字串(進階)</summary>
                  <input class="input cfg-mono" type="text"
                         v-model.trim="constraints[selectedConstraintIdx].reels_allowed"
                         placeholder="2,3,4">
                </details>
              </div>

              <!-- GLOBAL_MAX/MIN:門檻 -->
              <div v-if="constraints[selectedConstraintIdx].ctype === 'GLOBAL_MAX' || constraints[selectedConstraintIdx].ctype === 'GLOBAL_MIN'"
                   class="cfg-constraints-v2-section">
                <div class="cfg-constraints-v2-section-title">
                  門檻數量 <span class="cfg-key">threshold</span>
                </div>
                <input class="input input-w-num" type="number" min="0"
                       v-model.number="constraints[selectedConstraintIdx].threshold">
                <div class="cfg-hint">
                  {{ constraints[selectedConstraintIdx].ctype === 'GLOBAL_MAX'
                     ? '一個盤面上「' + (constraints[selectedConstraintIdx].symbol_id || '此符號') + '」最多可以出現幾個'
                     : '一個盤面上「' + (constraints[selectedConstraintIdx].symbol_id || '此符號') + '」至少要出現幾個(否則該盤面會被拒絕重抽)' }}
                </div>
              </div>

              <!-- 套用模式 + 備註 -->
              <div class="cfg-constraints-v2-section cfg-constraints-v2-footer">
                <div class="cfg-field cfg-field-compact">
                  <label class="cfg-label">套用模式 <span class="cfg-key">mode_scope · 可複選</span></label>
                  <div class="cfg-chip-row">
                    <button v-for="s in allModeScopes" :key="s"
                            class="cfg-chip cfg-chip-sm"
                            :class="{ active: constraintHasMode(constraints[selectedConstraintIdx], s) }"
                            @click="toggleConstraintMode(constraints[selectedConstraintIdx], s)">{{ s }}</button>
                  </div>
                </div>
                <div class="cfg-field cfg-field-compact">
                  <label class="cfg-label">備註 <span class="cfg-key">notes</span></label>
                  <input class="input input-w-name" type="text"
                         v-model.trim="constraints[selectedConstraintIdx].notes"
                         placeholder="(選填)">
                </div>
              </div>

              <!-- debug 折疊 -->
              <details class="cfg-debug cfg-constraints-v2-debug" @toggle="dbgOpen.constraints = $event.target.open">
                <summary>🔍 預覽目前 JSON({{ constraints.length }} 個約束)</summary>
                <pre v-if="dbgOpen.constraints" class="cfg-debug-pre">{{ constraintsDebugJson }}</pre>
              </details>
            </template>
          </div>

        </div>
      </div>


      <!-- ═══════ 08_Combo_Weights 連爆權重 ═══════ -->
      <div v-else-if="active === 'combo_weights'" class="cfg-form cfg-sticky-form">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">💥 08_Combo_Weights · 連爆權重</div>
          <div class="cfg-form-sub">
            一局內連續中獎 N 次後(N = combo_step)切換到另一套權重表。
            每個模式可有多個「爆」階段。符號預設取自
            <a href="#" @click.prevent="active='symbols'" class="cfg-link">03_Symbols</a>。
          </div>
        </div>

        <div v-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>
            新增至少一個模式。
          </div>
        </div>

        <template v-else>
          <!-- ── Sticky 雙行：模式 + 連爆階段 ── -->
          <div class="cfg-sticky-mode-bar cfg-sticky-mode-bar-combo">
            <div class="cfg-sticky-row">
              <span class="cfg-sticky-mode-label">模式</span>
              <button v-for="m in modeNames" :key="m"
                      class="cfg-chip"
                      :class="{ active: comboActiveModeBar === m }"
                      @click="comboActiveModeBar = m">{{ m }}</button>
            </div>
            <div class="cfg-sticky-row" v-if="comboActiveModeBar && comboW(comboActiveModeBar)">
              <span class="cfg-sticky-mode-label">連爆</span>
              <button v-for="step in comboW(comboActiveModeBar).steps" :key="step"
                      class="cfg-chip"
                      :class="{ active: comboActiveStep[comboActiveModeBar] === step }"
                      @click="comboActiveStep[comboActiveModeBar] = step; clearMatrixSelection()">第 {{ step }} 爆</button>
              <button class="cfg-chip cfg-chip-add"
                      @click="comboAddStep(comboActiveModeBar)"
                      title="新增下一個爆階段">+ 新增</button>
              <button class="cfg-chip cfg-chip-danger"
                      @click="comboRemoveStep(comboActiveModeBar, comboActiveStep[comboActiveModeBar])"
                      :disabled="comboW(comboActiveModeBar).steps.length <= 1"
                      title="刪除當前選中的爆階段">✕ 刪除</button>
              <!-- v3.5 / #4A + #4B:檢視模式切換 -->
              <span v-if="comboW(comboActiveModeBar).steps.length >= 2"
                    class="cfg-combo-view-toggle"
                    title="切換檢視模式">
                <button class="cfg-cvt-btn"
                        :class="{ active: comboViewMode === 'edit' }"
                        @click="setComboViewMode('edit'); clearMatrixSelection()"
                        title="編輯單一爆階段">編輯</button>
                <button class="cfg-cvt-btn"
                        :class="{ active: comboViewMode === 'compare' }"
                        @click="setComboViewMode('compare'); clearMatrixSelection()"
                        title="所有爆階段並排顯示,當前可編輯,其他唯讀">⊞ 並排</button>
                <button class="cfg-cvt-btn"
                        :class="{ active: comboViewMode === 'diff' }"
                        @click="setComboViewMode('diff'); clearMatrixSelection()"
                        title="並排顯示,其他階段顯示相對於當前的變化%">Δ 差異</button>
              </span>
              <!-- v3.5 / #13:跨爆階段複製 popover(從矩陣底部上移到 step bar) -->
              <span v-if="comboW(comboActiveModeBar).steps.length >= 2"
                    class="cfg-combo-step-copy-host" @click.stop>
                <button class="cfg-chip cfg-chip-copy"
                        :class="{ active: stepCopyMenu.open }"
                        @click="toggleStepCopyMenu()"
                        title="把當前爆階段的權重複製到其他階段">📋 複製到…</button>
                <div v-if="stepCopyMenu.open" class="cfg-combo-step-copy-popover">
                  <div class="cfg-matrix-menu-title">第 {{ comboActiveStep[comboActiveModeBar] }} 爆 → ?</div>
                  <button v-for="step in comboOtherSteps(comboActiveModeBar)" :key="step"
                          class="cfg-matrix-menu-item"
                          @click="comboCopyStepTo(comboActiveModeBar, comboActiveStep[comboActiveModeBar], step); closeStepCopyMenu()">
                    <span class="cfg-mmi-icon">→</span>
                    <span class="cfg-mmi-text">第 {{ step }} 爆</span>
                  </button>
                </div>
              </span>
              <span class="cfg-sticky-meta">
                Max: <strong>{{ comboMaxWeight(comboActiveModeBar, comboActiveStep[comboActiveModeBar]) }}</strong>
              </span>
              <!-- v3.5:顯示模式切換 -->
              <span class="cfg-matrix-display-toggle"
                    title="切換 cell 顯示模式(輸入值仍為絕對權重,百分比只是顯示)">
                <button class="cfg-mdt-btn"
                        :class="{ active: getMatrixDisplayMode('combo', comboActiveModeBar) === 'raw' }"
                        @click="setMatrixDisplayMode('combo', comboActiveModeBar, 'raw')"
                        title="顯示原始權重">數值</button>
                <button class="cfg-mdt-btn"
                        :class="{ active: getMatrixDisplayMode('combo', comboActiveModeBar) === 'pct_row' }"
                        @click="setMatrixDisplayMode('combo', comboActiveModeBar, 'pct_row')"
                        title="同 Reel 內各符號占比(當前爆階段)">%橫</button>
                <button class="cfg-mdt-btn"
                        :class="{ active: getMatrixDisplayMode('combo', comboActiveModeBar) === 'pct_col' }"
                        @click="setMatrixDisplayMode('combo', comboActiveModeBar, 'pct_col')"
                        title="同符號跨 Reel 分佈占比(當前爆階段)">%縱</button>
              </span>
              <!-- v3.6 / #2:Undo/Redo 按鈕 -->
              <span class="cfg-matrix-undo-host">
                <button class="cfg-matrix-undo-btn"
                        :disabled="!canUndo('combo', comboActiveModeBar)"
                        @click="undoMatrix()"
                        :title="canUndo('combo', comboActiveModeBar) ? ('復原最後批次操作(Ctrl+Z)· ' + undoCountForCurrent() + ' 步可復原') : '沒有可復原的操作'">
                  ↶
                  <span v-if="canUndo('combo', comboActiveModeBar)" class="cfg-matrix-undo-count">{{ undoCountForCurrent() }}</span>
                </button>
                <button class="cfg-matrix-undo-btn"
                        :disabled="!canRedo('combo', comboActiveModeBar)"
                        @click="redoMatrix()"
                        :title="canRedo('combo', comboActiveModeBar) ? ('重做(Ctrl+Y / Ctrl+Shift+Z)· ' + redoCountForCurrent() + ' 步可重做') : '沒有可重做的操作'">
                  ↷
                  <span v-if="canRedo('combo', comboActiveModeBar)" class="cfg-matrix-undo-count">{{ redoCountForCurrent() }}</span>
                </button>
              </span>
              <!-- ── #4 模式級操作下拉(combo)── -->
              <span class="cfg-matrix-menu-host">
                <button class="cfg-matrix-menu-btn"
                        :class="{ active: matrixMenu.open && matrixMenu.kind === 'combo' && matrixMenu.mode === comboActiveModeBar }"
                        @click.stop="openMatrixMenu('combo', comboActiveModeBar, comboActiveStep[comboActiveModeBar])"
                        title="批次操作:複製模式 / 縮放整表 / 正規化 / 清空">⋯ 模式操作</button>
                <div v-if="matrixMenu.open && matrixMenu.kind === 'combo' && matrixMenu.mode === comboActiveModeBar"
                     class="cfg-matrix-menu-popover" @click.stop>
                  <div class="cfg-matrix-menu-title">{{ comboActiveModeBar }} · 整表操作</div>
                  <!-- 範圍切換:當前爆 vs 全爆階段 -->
                  <div class="cfg-matrix-menu-scope">
                    <button class="cfg-matrix-menu-scope-btn"
                            :class="{ active: matrixMenu.step !== null }"
                            @click="matrixMenu.step = comboActiveStep[comboActiveModeBar]">
                      第 {{ comboActiveStep[comboActiveModeBar] }} 爆
                    </button>
                    <button class="cfg-matrix-menu-scope-btn"
                            :class="{ active: matrixMenu.step === null }"
                            @click="matrixMenu.step = null">
                      全爆階段
                    </button>
                  </div>

                  <template v-if="!matrixMenu.copyPick">
                    <button class="cfg-matrix-menu-item"
                            :disabled="matrixOtherModes(comboActiveModeBar).length === 0"
                            @click="matrixMenu.copyPick = true">
                      <span class="cfg-mmi-icon">📋</span>
                      <span class="cfg-mmi-text">從另一模式複製…</span>
                      <span class="cfg-mmi-chev">▸</span>
                    </button>
                  </template>
                  <template v-else>
                    <div class="cfg-matrix-menu-sub-title">
                      <button class="cfg-mmi-back" @click="matrixMenu.copyPick = false" title="回到主選單">‹</button>
                      選擇來源模式
                    </div>
                    <button v-for="src in matrixOtherModes(comboActiveModeBar)" :key="src"
                            class="cfg-matrix-menu-item"
                            @click="matrixCopyFromMode('combo', comboActiveModeBar, matrixMenu.step, src)">
                      <span class="cfg-mmi-icon">→</span>
                      <span class="cfg-mmi-text">{{ src }}</span>
                    </button>
                  </template>
                  <div v-if="!matrixMenu.copyPick">
                    <div class="cfg-matrix-menu-divider"></div>
                    <button class="cfg-matrix-menu-item" @click="matrixScale('combo', comboActiveModeBar, matrixMenu.step, 2)">
                      <span class="cfg-mmi-icon">✖</span><span class="cfg-mmi-text">整表 × 2</span>
                    </button>
                    <button class="cfg-matrix-menu-item" @click="matrixScale('combo', comboActiveModeBar, matrixMenu.step, 0.5)">
                      <span class="cfg-mmi-icon">½</span><span class="cfg-mmi-text">整表 × 0.5</span>
                    </button>
                    <button class="cfg-matrix-menu-item" @click="matrixFillAll('combo', comboActiveModeBar, matrixMenu.step, 100)">
                      <span class="cfg-mmi-icon">100</span><span class="cfg-mmi-text">整表填 100(重置)</span>
                    </button>
                    <button class="cfg-matrix-menu-item"
                            :disabled="matrixMenu.step === null"
                            :title="matrixMenu.step === null ? '請先切換到單一爆階段' : ''"
                            @click="matrixNormalizeRows('combo', comboActiveModeBar, matrixMenu.step)">
                      <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">每列正規化至 100</span>
                    </button>
                    <div class="cfg-matrix-menu-divider"></div>
                    <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                            @click="matrixClearAll('combo', comboActiveModeBar, matrixMenu.step)">
                      <span class="cfg-mmi-icon">✕</span><span class="cfg-mmi-text">整表清空為 0</span>
                    </button>
                  </div>
                </div>
              </span>
            </div>
          </div>

          <!-- v3.5 / #14:平均占比預覽 bar(08 只看當前 step) -->
          <div v-if="comboActiveModeBar" class="cfg-matrix-prob-bar">
            <button class="cfg-matrix-prob-toggle"
                    :class="{ collapsed: !probBarOpen }"
                    @click="toggleProbBar()"
                    :title="probBarOpen ? '收起占比預覽' : '展開占比預覽'">
              📊 第 {{ comboActiveStep[comboActiveModeBar] }} 爆平均占比 <span class="cfg-prob-chev">{{ probBarOpen ? '▾' : '▸' }}</span>
            </button>
            <div v-if="probBarOpen && comboSymbolAvgProb(comboActiveModeBar, comboActiveStep[comboActiveModeBar])" class="cfg-matrix-prob-chips">
              <span v-for="(p, sid) in comboSymbolAvgProb(comboActiveModeBar, comboActiveStep[comboActiveModeBar])" :key="sid" class="cfg-prob-chip">
                <span class="cfg-prob-chip-sid">{{ sid }}</span>
                <span class="cfg-prob-chip-val">{{ fmtPct(p) }}</span>
              </span>
            </div>
            <span v-if="probBarOpen" class="cfg-prob-hint">當前爆階段,每 Reel 平均符號占比</span>
            <span class="cfg-matrix-csv-host">
              <button class="cfg-matrix-csv-btn" @click="exportComboCSV(comboActiveModeBar, comboActiveStep[comboActiveModeBar])" title="匯出當前模式 + 當前爆階段為 CSV">⬇ CSV</button>
              <button class="cfg-matrix-csv-btn" @click="importComboCSV(comboActiveModeBar, comboActiveStep[comboActiveModeBar])" title="從 CSV 匯入(會覆寫當前爆階段)">⬆ CSV</button>
            </span>
          </div>

          <!-- ── 選中模式+步驟的矩陣 ── -->
          <div v-if="comboActiveModeBar" class="cfg-mode-card cfg-matrix-card cfg-combo-card" style="margin:0;">
            <div class="cfg-mode-card-body">

              <!-- 符號清單 -->
              <div class="cfg-field cfg-matrix-toolbar">
                <details class="cfg-matrix-symbols">
                  <summary class="cfg-matrix-symbols-summary">
                    <span class="cfg-matrix-symbols-icon">🔧</span>
                    <span class="cfg-matrix-symbols-label">符號欄位 <span class="cfg-matrix-symbols-sub">(所有爆共用)</span></span>
                    <span class="cfg-matrix-symbols-count">{{ comboW(comboActiveModeBar).symbol_ids.length }} 個</span>
                    <span class="cfg-matrix-symbols-preview">{{ comboSymbolIdsStr(comboActiveModeBar) }}</span>
                  </summary>
                  <div class="cfg-matrix-symbols-body">
                    <input class="input cfg-mono" type="text"
                           :value="comboSymbolIdsStr(comboActiveModeBar)"
                           @change="setComboSymbolIdsStr(comboActiveModeBar, $event.target.value)"
                           placeholder="WILD, H1, H2, H3, L1, L2, L3, L4">
                    <button class="cfg-matrix-btn cfg-matrix-sync-btn"
                            @click="comboSyncFromRegistry(comboActiveModeBar)"
                            title="從 03_Symbols 同步符號清單,新符號權重會被初始化為 100">
                      ⇆ 從 03_Symbols 同步
                    </button>
                    <div class="cfg-hint" style="margin-top:6px;">
                      所有爆階段共用同一份符號清單;切換爆階段從上方 sticky 列操作。
                    </div>
                  </div>
                </details>
                <div class="cfg-matrix-sort-v2">
                  <label class="cfg-matrix-sort-v2-label" title="跨所有爆階段加總後比較">↕ 欄序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          @change="sortComboSymbols(comboActiveModeBar, $event.target.value); $event.target.value = ''">
                    <option value="" disabled selected>選擇…</option>
                    <option value="alpha-asc">A → Z</option>
                    <option value="alpha-desc">Z → A</option>
                    <option value="weight-desc">權重 大 → 小</option>
                    <option value="weight-asc">權重 小 → 大</option>
                  </select>
                  <label class="cfg-matrix-sort-v2-label">↔ 列序</label>
                  <select class="cfg-matrix-sort-v2-select"
                          :value="getRowSort('combo', comboActiveModeBar)"
                          @change="setRowSort('combo', comboActiveModeBar, $event.target.value)">
                    <option value="default">原序 R1 → Rn</option>
                    <option value="weight-desc">列權重 大 → 小</option>
                    <option value="weight-asc">列權重 小 → 大</option>
                  </select>
                </div>
              </div>

              <!-- 當前爆階段的 Reel × Symbol 矩陣 -->
              <div v-if="comboViewMode === 'edit'" class="cfg-matrix-wrap">
                <!-- v3.5:範圍選取浮動操作條(僅在有 selection 時顯示) -->
                <div v-if="matrixSelection.keys.size > 0" class="cfg-matrix-sel-bar">
                  <span class="cfg-matrix-sel-count">已選 {{ matrixSelection.keys.size }} 個 cell</span>
                  <div class="cfg-matrix-sel-actions">
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 100)" title="全部設為 100">⇶ 100</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 50)" title="全部設為 50">⇶ 50</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('set', 10)" title="全部設為 10">⇶ 10</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 2)" title="所有選取值 ×2">×2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('mul', 0.5)" title="所有選取值 ÷2">÷2</button>
                    <button class="cfg-matrix-btn" @click="applyMatrixSelOp('zero')" title="全部歸 0">歸 0</button>
                    <button class="cfg-matrix-btn cfg-matrix-btn-close" @click="clearMatrixSelection" title="取消選取">✕</button>
                  </div>
                  <span class="cfg-matrix-sel-hint">拖曳=框選 · Shift=範圍 · Ctrl/⌘=多選</span>
                </div>

                <table class="cfg-matrix" :class="{ 'is-dragging': matrixDrag.active }">
                  <thead>
                    <tr>
                      <th class="cfg-matrix-corner">第 {{ comboActiveStep[comboActiveModeBar] }} 爆 · R \ Sym</th>
                      <th v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                          class="cfg-matrix-colhead-clickable">
                        <div class="cfg-matrix-colhead-wrap">
                          <span class="cfg-matrix-colhead-name">{{ sid }}</span>
                          <span class="cfg-matrix-colhead-sum" :title="'整欄合計(當前爆階段)'">Σ{{ comboTotalForCol(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid) }}</span>
                          <span class="cfg-matrix-col-menu-host" @click.stop>
                            <button class="cfg-matrix-col-menu-btn"
                                    :class="{ active: colMenu.open && colMenu.kind === 'combo' && colMenu.mode === comboActiveModeBar && colMenu.sid === sid }"
                                    @click="openColMenu('combo', comboActiveModeBar, sid)"
                                    title="整欄操作(當前爆階段)">⋯</button>
                            <div v-if="colMenu.open && colMenu.kind === 'combo' && colMenu.mode === comboActiveModeBar && colMenu.sid === sid"
                                 class="cfg-matrix-col-menu-popover">
                              <div class="cfg-matrix-menu-title">{{ sid }} · 第 {{ comboActiveStep[comboActiveModeBar] }} 爆整欄</div>
                              <button class="cfg-matrix-menu-item" @click="comboFillColUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 100</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="comboFillColUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 50); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 50</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="comboFillColUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 10); closeColMenu()">
                                <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整欄填 10</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="comboScaleCol(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 2); closeColMenu()">
                                <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整欄 ×2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="comboScaleCol(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 0.5); closeColMenu()">
                                <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整欄 ÷2</span>
                              </button>
                              <button class="cfg-matrix-menu-item" @click="comboNormalizeCol(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 100); closeColMenu()">
                                <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                              </button>
                              <div class="cfg-matrix-menu-divider"></div>
                              <button class="cfg-matrix-menu-item" @click="comboCopyColToAll(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid); closeColMenu()">
                                <span class="cfg-mmi-icon">⇨</span><span class="cfg-mmi-text">複製到所有符號欄</span>
                              </button>
                              <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                      @click="comboFillColUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], sid, 0); closeColMenu()">
                                <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整欄歸 0</span>
                              </button>
                            </div>
                          </span>
                        </div>
                      </th>
                      <th class="cfg-matrix-total">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedReels('combo', comboActiveModeBar)" :key="r.reel_id"
                        @contextmenu.prevent="openRowMenu('combo', comboActiveModeBar, r.reel_id, comboActiveStep[comboActiveModeBar])">
                      <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                      <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                          v-memo="[
                            comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid],
                            isMatrixCellSelected('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                            comboIsTopWeight(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, sid),
                            comboHeatClass(comboActiveModeBar, comboActiveStep[comboActiveModeBar], comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid] || 0),
                            cellPercent('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                            comboActiveStep[comboActiveModeBar],
                            getMatrixDisplayMode('combo', comboActiveModeBar)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   comboHeatClass(comboActiveModeBar, comboActiveStep[comboActiveModeBar], comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid] || 0),
                                   { 'is-selected': isMatrixCellSelected('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                                     'is-top': comboIsTopWeight(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, sid) }]"
                          @pointerdown="onMatrixCellPointerDown('combo', comboActiveModeBar, r.reel_id, sid, $event, comboActiveStep[comboActiveModeBar])"
                          @pointerenter="onMatrixCellPointerEnter('combo', comboActiveModeBar, r.reel_id, sid, $event, comboActiveStep[comboActiveModeBar])">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               v-model.number.lazy="comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid]">
                        <span v-if="cellPercent('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar])"
                              class="cfg-matrix-cell-pct"
                              :class="'is-' + getMatrixDisplayMode('combo', comboActiveModeBar)">{{ cellPercent('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]) }}</span>
                      </td>
                      <td class="cfg-matrix-total-cell">
                        <span class="cfg-matrix-row-menu-host" @click.stop>
                          <button class="cfg-matrix-total-chip"
                                  :class="{ active: rowMenu.open && rowMenu.kind === 'combo' && rowMenu.mode === comboActiveModeBar && rowMenu.reel === r.reel_id && rowMenu.step === comboActiveStep[comboActiveModeBar] }"
                                  @click="openRowMenu('combo', comboActiveModeBar, r.reel_id, comboActiveStep[comboActiveModeBar])"
                                  title="整列操作(當前爆階段)">{{ comboTotalForRow(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id) }} <span class="cfg-matrix-total-chev">▾</span></button>
                          <div v-if="rowMenu.open && rowMenu.kind === 'combo' && rowMenu.mode === comboActiveModeBar && rowMenu.reel === r.reel_id && rowMenu.step === comboActiveStep[comboActiveModeBar]"
                               class="cfg-matrix-row-menu-popover">
                            <div class="cfg-matrix-menu-title">R{{ r.reel_id }} · 第 {{ comboActiveStep[comboActiveModeBar] }} 爆整列</div>
                            <button class="cfg-matrix-menu-item" @click="comboFillRowUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 100</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="comboFillRowUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 50); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇶</span><span class="cfg-mmi-text">整列填 50</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="comboScaleRow(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 2); closeRowMenu()">
                              <span class="cfg-mmi-icon">×</span><span class="cfg-mmi-text">整列 ×2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="comboScaleRow(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 0.5); closeRowMenu()">
                              <span class="cfg-mmi-icon">÷</span><span class="cfg-mmi-text">整列 ÷2</span>
                            </button>
                            <button class="cfg-matrix-menu-item" @click="comboNormalizeRow(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 100); closeRowMenu()">
                              <span class="cfg-mmi-icon">⚖</span><span class="cfg-mmi-text">正規化至 100</span>
                            </button>
                            <div class="cfg-matrix-menu-divider"></div>
                            <button class="cfg-matrix-menu-item" @click="comboCopyToAllReels(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id); closeRowMenu()">
                              <span class="cfg-mmi-icon">⇩</span><span class="cfg-mmi-text">複製到所有 Reel</span>
                            </button>
                            <button class="cfg-matrix-menu-item cfg-matrix-menu-item-danger"
                                    @click="comboFillRowUniform(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, 0); closeRowMenu()">
                              <span class="cfg-mmi-icon">∅</span><span class="cfg-mmi-text">整列歸 0</span>
                            </button>
                          </div>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- v3.5 / #4A:並排模式(所有爆階段並列,當前可編輯,其他唯讀)-->
              <!-- v3.5 / #4B:差異模式(同並排,但非基準 step 顯示 ±%)-->
              <!-- v3.6 / #3:diff baseline picker / v3.6 / #4:可隱藏 step -->
              <div v-if="(comboViewMode === 'compare' || comboViewMode === 'diff') && comboW(comboActiveModeBar).steps.length >= 2"
                   class="cfg-combo-multi-wrap">
                <div class="cfg-combo-multi-legend">
                  <div class="cfg-combo-multi-legend-row">
                    <span v-if="comboViewMode === 'compare'">
                      <strong>並排模式</strong> · 當前可編輯 ·
                      其他爆階段唯讀,點欄頭可切換為「當前」
                    </span>
                    <span v-else>
                      <strong>差異模式</strong> · 相對於第 {{ effectiveDiffBaseline(comboActiveModeBar) }} 爆<span v-if="isComboDiffBaselinePinned(comboActiveModeBar)" class="cfg-combo-baseline-pin-tag">📌 已釘</span> ·
                      <span class="cfg-diff-up-token">+綠</span>=增加 ·
                      <span class="cfg-diff-down-token">−紅</span>=減少 ·
                      <span class="cfg-diff-eq-token">=灰</span>=相同
                    </span>
                  </div>
                  <!-- v3.6 / #3:diff 模式時的 baseline picker -->
                  <div v-if="comboViewMode === 'diff'" class="cfg-combo-baseline-picker">
                    <span class="cfg-combo-baseline-label">基準:</span>
                    <button v-for="step in comboW(comboActiveModeBar).steps" :key="'b'+step"
                            class="cfg-combo-baseline-chip"
                            :class="{ active: step === effectiveDiffBaseline(comboActiveModeBar) }"
                            @click="setComboDiffBaseline(comboActiveModeBar, step === effectiveDiffBaseline(comboActiveModeBar) && isComboDiffBaselinePinned(comboActiveModeBar) ? null : step)"
                            :title="step === effectiveDiffBaseline(comboActiveModeBar) ? '已是基準(點擊取消釘選,回到追隨當前)' : '釘選為基準'">
                      第 {{ step }} 爆
                    </button>
                    <button v-if="isComboDiffBaselinePinned(comboActiveModeBar)"
                            class="cfg-combo-baseline-reset"
                            @click="setComboDiffBaseline(comboActiveModeBar, null)"
                            title="取消釘選,基準將追隨當前選中的爆階段">取消釘選</button>
                  </div>
                  <!-- v3.6 / #4:step visibility 過濾 -->
                  <div v-if="comboW(comboActiveModeBar).steps.length >= 3" class="cfg-combo-steps-filter">
                    <span class="cfg-combo-steps-filter-label">顯示:</span>
                    <button v-for="step in comboW(comboActiveModeBar).steps" :key="'v'+step"
                            class="cfg-combo-step-visibility-chip"
                            :class="{ hidden: !comboStepVisible(comboActiveModeBar, step) }"
                            @click="toggleComboStepVisible(comboActiveModeBar, step)"
                            :title="comboStepVisible(comboActiveModeBar, step) ? '點擊隱藏這個爆階段' : '點擊顯示這個爆階段'">
                      <span v-if="!comboStepVisible(comboActiveModeBar, step)">👁️‍🗨️</span>
                      <span v-else>👁</span>
                      第 {{ step }} 爆
                    </button>
                    <button v-if="comboHiddenCount(comboActiveModeBar) > 0"
                            class="cfg-combo-steps-show-all"
                            @click="comboShowAllSteps(comboActiveModeBar)"
                            :title="'目前隱藏 ' + comboHiddenCount(comboActiveModeBar) + ' 個爆階段'">
                      全部顯示
                    </button>
                  </div>
                </div>
                <div class="cfg-combo-multi-grid"
                     :style="{ 'grid-template-columns': 'repeat(' + comboVisibleSteps(comboActiveModeBar).length + ', minmax(0, 1fr))' }">
                  <div v-for="step in comboVisibleSteps(comboActiveModeBar)" :key="step"
                       class="cfg-combo-multi-card"
                       :class="{
                         'is-active': step === comboActiveStep[comboActiveModeBar],
                         'is-baseline': comboViewMode === 'diff' && step === effectiveDiffBaseline(comboActiveModeBar) && step !== comboActiveStep[comboActiveModeBar]
                       }">
                    <div class="cfg-combo-multi-card-header"
                         @click="comboActiveStep[comboActiveModeBar] = step; clearMatrixSelection()"
                         title="點擊切換為當前爆階段">
                      <span class="cfg-combo-multi-step">第 {{ step }} 爆</span>
                      <span v-if="step === comboActiveStep[comboActiveModeBar]" class="cfg-combo-multi-active-badge">當前</span>
                      <span v-else-if="comboViewMode === 'diff' && step === effectiveDiffBaseline(comboActiveModeBar)" class="cfg-combo-multi-baseline-badge">基準</span>
                      <span v-else class="cfg-combo-multi-readonly-badge">唯讀</span>
                    </div>
                    <table class="cfg-matrix cfg-combo-multi-table"
                           :class="{ 'is-readonly': step !== comboActiveStep[comboActiveModeBar] }">
                      <thead>
                        <tr>
                          <th class="cfg-matrix-corner">R</th>
                          <th v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid">{{ sid }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in sortedReels('combo', comboActiveModeBar)" :key="r.reel_id">
                          <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                          <!-- 當前 step + compare 模式:可編輯 -->
                          <template v-if="step === comboActiveStep[comboActiveModeBar] && comboViewMode === 'compare'">
                            <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                                v-memo="[comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid]]"
                                class="cfg-matrix-cell-wrap"
                                :class="comboHeatClass(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0)">
                              <input class="cfg-matrix-cell" type="number" min="0"
                                     v-model.number.lazy="comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid]"
                                     @click.stop>
                            </td>
                          </template>
                          <!-- compare 模式 / 非當前 step:唯讀數值 -->
                          <template v-else-if="comboViewMode === 'compare'">
                            <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                                v-memo="[comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid]]"
                                class="cfg-combo-multi-cell-ro"
                                :class="comboHeatClass(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0)">
                              {{ comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <!-- diff 模式:基準 step 顯示原值,其他顯示 diff label -->
                          <template v-else-if="step === effectiveDiffBaseline(comboActiveModeBar)">
                            <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                                v-memo="[comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid]]"
                                class="cfg-combo-multi-cell-ro cfg-combo-multi-cell-base"
                                :class="comboHeatClass(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0)">
                              {{ comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <template v-else>
                            <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                                v-memo="[
                                  comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid],
                                  comboW(comboActiveModeBar).weights[effectiveDiffBaseline(comboActiveModeBar) + '-' + r.reel_id + '-' + sid]
                                ]"
                                class="cfg-combo-multi-cell-diff"
                                :class="'is-' + comboCellDiff(comboActiveModeBar, effectiveDiffBaseline(comboActiveModeBar), step, r.reel_id, sid).sign">
                              {{ comboDiffLabel(comboCellDiff(comboActiveModeBar, effectiveDiffBaseline(comboActiveModeBar), step, r.reel_id, sid)) }}
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- 不夠 2 個爆階段時的 compare/diff 提示 -->
              <div v-else-if="comboViewMode !== 'edit' && comboW(comboActiveModeBar).steps.length < 2"
                   class="cfg-combo-multi-empty">
                <div class="cfg-combo-multi-empty-icon">⚠</div>
                <div>
                  目前只有 1 個爆階段,無法使用並排/差異模式。
                  <button class="cfg-matrix-btn"
                          style="margin-left:8px;"
                          @click="setComboViewMode('edit')">回到編輯</button>
                </div>
              </div>

            </div>
          </div>
        </template>
      </div>

      <!-- ═══════ 09_Puzzle_Rules 腳本規則 + Condition 拼圖建構器 ═══════ -->
      <!-- ═══════ 規則 tab(v3.1 合併 09_Puzzle_Rules + 10_Discard_Rules)═══════ -->
      <div v-else-if="active === 'rules'" class="cfg-form cfg-rules-host" style="display:flex;flex-direction:row;height:100%;">

        <!-- v7.10:子分頁切換已移到左側分頁列(規則母項的縮排子項);此處直接渲染 section -->

        <!-- 右側:隨子分類切換 -->
        <div class="cfg-rules-sectionhost" style="flex:1;min-width:0;display:flex;flex-direction:column;height:100%;">

          <!-- §2.1 peer 分段:規則（拼圖 DSL）｜中獎線*｜產牌(中獎線僅 pay_type=LINE 顯示）-->
          <div class="cfg-rule-peers">
            <button class="cfg-rule-peer" :class="{ active: rulePeer === 'rules' }" @click="gotoPeer('rules')">規則</button>
            <button v-if="rulePeerLineVisible" class="cfg-rule-peer" :class="{ active: rulePeer === 'lines' }" @click="gotoPeer('lines')">中獎線</button>
            <button class="cfg-rule-peer" :class="{ active: rulePeer === 'gen' }" @click="gotoPeer('gen')">產牌</button>
          </div>

          <!-- Stage3:規則 peer 內子切換（模式 / 盤面圖示規則 / 通用規則）-->
          <div v-if="rulePeer === 'rules'" class="cfg-gen-subtoggle">
            <button class="cfg-gen-subbtn" :class="{ active: rulesSection === 'modes' }" @click="gotoRulesSub('modes')">模式</button>
            <button class="cfg-gen-subbtn" :class="{ active: rulesSection === 'board' }" @click="gotoRulesSub('board')">盤面 / 圖示規則</button>
            <button class="cfg-gen-subbtn" :class="{ active: rulesSection === 'general' }" @click="gotoRulesSub('general')">通用規則</button>
          </div>
          <!-- Stage2:產牌 peer 內子切換（產牌條件 genlimits / 棄牌條件 discard;§6 兩區併於此 peer）-->
          <div v-if="rulePeer === 'gen'" class="cfg-gen-subtoggle">
            <button class="cfg-gen-subbtn" :class="{ active: rulesSection === 'genlimits' }" @click="gotoRulesSub('genlimits')">產牌條件</button>
            <button class="cfg-gen-subbtn" :class="{ active: rulesSection === 'discard' }" @click="gotoRulesSub('discard')">棄牌條件</button>
          </div>

        <!-- ═══ 子分類:盤面圖示規則 / 通用規則(共用既有 puzzle 編輯器)═══ -->
        <div v-show="rulesSection === 'board' || rulesSection === 'general'"
             class="cfg-rules-section cfg-rules-section-puzzle"
             style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <!-- v8.15 #1:標題動態跟隨子分頁(盤面/圖示規則 · 通用規則 · 棄牌規則) -->
          <div class="cfg-form-title">
            {{ rulesSectionMeta.icon }} {{ rulesSectionMeta.label }}
            <button class="cfg-preset-btn" @click="presetDrawerOpen = !presetDrawerOpen"
                    :class="{ active: presetDrawerOpen }"
                    title="從規則庫中插入常用 slot 機制 preset(僅適用於拼圖規則)">
              📚 規則庫
            </button>
          </div>
          <div class="cfg-form-sub">
            <strong>拼圖規則</strong>:當 <strong>Trigger</strong> 發生且 <strong>Condition</strong> 成立時,執行 <strong>Actions</strong>。
            <strong>棄牌規則</strong>:滿足 condition 時將該局棄牌(HARD=完全排除/SOFT=仍計入但獨立追蹤)。
            點選左側項目進行編輯。
          </div>
          <div class="cfg-form-hint-banner">
            💡 對應 A.xlsx 的 <strong>09_Puzzle_Rules</strong> + <strong>10_Discard_Rules</strong> 兩個分頁(匯出時仍會分開為兩張分頁)。
            Condition 支援 <code>AND / OR / in / not_in / contains</code>。
          </div>
        </div>

        <!-- ── 規則庫抽屜(可摺疊)── -->
        <div v-if="presetDrawerOpen" class="cfg-preset-drawer">
          <div class="cfg-preset-drawer-header">
            <span class="cfg-preset-drawer-title">📚 規則庫 — 點 [插入] 一鍵加入清單</span>
            <div class="cfg-preset-drawer-search">
              <input class="input cfg-mono"
                     type="text"
                     v-model.trim="presetSearch"
                     placeholder="搜尋:fg / wild / 連爆 / 死局 ...">
            </div>
            <button class="cfg-preset-drawer-close" @click="presetDrawerOpen = false" title="關閉">✕</button>
          </div>
          <div class="cfg-preset-drawer-body">
            <div v-for="grp in filteredPresetGroups" :key="grp.label" class="cfg-preset-group">
              <div class="cfg-preset-group-title">
                <span class="cfg-preset-group-icon">{{ grp.icon }}</span>
                <span>{{ grp.label }}</span>
                <span class="cfg-preset-group-count">{{ grp.presets.length }}</span>
              </div>
              <div class="cfg-preset-cards">
                <div v-for="p in grp.presets" :key="p.key" class="cfg-preset-card">
                  <div class="cfg-preset-card-header">
                    <span class="cfg-preset-card-name">{{ p.name }}</span>
                    <button class="cfg-preset-card-btn"
                            @click="insertPreset(p)"
                            :title="'插入 ' + p.name">+ 插入</button>
                  </div>
                  <div class="cfg-preset-card-desc">{{ p.desc }}</div>
                  <div class="cfg-preset-card-meta">
                    <code class="cfg-preset-meta-trigger">{{ p.template.trigger }}</code>
                    <span class="cfg-preset-meta-sep">→</span>
                    <code v-for="(a, ai) in p.template.actions" :key="ai" class="cfg-preset-meta-act">{{ a.atype }}</code>
                  </div>
                  <div v-if="p.tags && p.tags.length" class="cfg-preset-card-tags">
                    <span v-for="t in p.tags" :key="t" class="cfg-preset-tag">{{ t }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="filteredPresetGroups.length === 0" class="cfg-preset-empty">
              找不到符合「{{ presetSearch }}」的 preset
            </div>
          </div>
        </div>

        <div class="cfg-split-layout">

          <!-- 左欄:混合列表(拼圖規則 + 棄牌規則) -->
          <div class="cfg-split-list">
            <div class="cfg-split-list-header">
              <div class="cfg-split-list-title">規則列表</div>
              <div class="cfg-split-list-count">拼圖 {{ rules.length }} · 棄牌 {{ discards.length }}</div>
              <button class="cfg-sim-refresh-btn"
                      v-if="latestSimStats"
                      @click="refreshLatestSimStats"
                      :title="'最近一次模擬:' + (latestSimStats.sourceName || '(未知)') + '\\n' + new Date(latestSimStats.ts).toLocaleString() + '\\n點此重整'">
                🔄
              </button>
            </div>

            <!-- v8.11/A-1:篩選重整 —— 子分頁(v7.10)已做規則分流,「全部/拼圖」chips 與其重疊,移除;
                 換上關鍵字搜尋(rule_id / 描述 / 動作類型);HARD/SOFT 僅棄牌子分頁保留(同清單內的類別分流)。 -->
            <div class="cfg-rules-filter-bar" style="display:flex; flex-wrap:nowrap; gap:4px; overflow-x:auto; align-items:center;">
              <input class="input cfg-rules-search"
                     type="search"
                     v-model.trim="rulesListSearch"
                     placeholder="🔍 搜尋 ID / 描述 / 動作"
                     style="flex:1 1 auto; min-width:0;">
              <!-- v8.15 #4:HARD/SOFT 過濾 chips 退役(類別以列表徽章呈現;搜尋為唯一過濾器) -->
            </div>

            <div class="cfg-split-list-body">
              <!-- v8.15 #2:三群合併清單 — 盤面/通用/棄牌恆列;當前子分頁的群置頂,
                   點到別群項目會自動切換子分頁並選中(清單隨之重排)。
                   拼圖類群保留 #17 拖曳排序(it.idx 為 rules 全域索引,排序語義不變)。 -->
              <template v-for="grp in rulesListGroups" :key="grp.key">
                <div v-if="grp.items.length > 0" class="cfg-rules-group-header">
                  <span class="cfg-rules-group-icon">{{ grp.icon }}</span>
                  <span>{{ grp.label }}</span>
                  <span class="cfg-rules-group-count">{{ grp.items.length }}</span>
                </div>
                <template v-if="grp.kind === 'puzzle'">
                  <div v-for="it in grp.items" :key="grp.key + '-' + (it.obj.rule_id || ('idx-' + it.idx))"
                       class="cfg-split-item cfg-split-item-draggable cfg-split-item-puzzle"
                       :class="{
                         active: selectedKind === 'puzzle' && selectedRuleIdx === it.idx,
                         'is-duplicate': ruleDuplicateIds.has(it.obj.rule_id) && it.obj.rule_id,
                         'is-dragging': rulesDragState.draggingIdx === it.idx,
                         'drop-before': rulesDragState.dragOverIdx === it.idx && rulesDragState.dropPosition === 'before',
                         'drop-after':  rulesDragState.dragOverIdx === it.idx && rulesDragState.dropPosition === 'after',
                       }"
                       :title="humanizeRule(it.obj)"
                       draggable="true"
                       @click="selectRuleFromList(grp.key, 'puzzle', it.idx)"
                       @contextmenu.prevent="openRuleCtx(it.idx, $event)"
                       @dragstart="onRuleDragStart(it.idx, $event)"
                       @dragover="onRuleDragOver(it.idx, $event)"
                       @dragleave="onRuleDragLeave(it.idx)"
                       @drop="onRuleDrop(it.idx, $event)"
                       @dragend="onRuleDragEnd">
                    <span class="cfg-rule-drag-handle" title="拖曳重排">⋮⋮</span>
                    <span class="cfg-split-item-id">{{ it.obj.rule_id || '?' }}</span>
                    <!-- v8.15 #5:第二行改「模式 · 觸發點」白話資訊(舊 trigger·atype 技術字串退場) -->
                    <span class="cfg-split-item-sub">
                      {{ ruleListSub(it.obj) }}
                      <span v-if="it.obj.enabled === false" class="cfg-split-item-disabled" title="此規則已停用">⊘</span>
                    </span>
                    <!-- 甲:來源徽章(源自圖示頁 ＋新增規則 / 尺寸事件)-->
                    <span v-if="it.obj.origin === 'icon'" class="cfg-rule-origin-badge" title="來自圖示頁新增">● 來自圖示</span>
                    <span v-else-if="it.obj.origin === 'size'" class="cfg-rule-origin-badge cfg-rule-origin-size" title="來自圖示尺寸事件">● 尺寸事件</span>
                    <!-- 最近一次模擬的觸發徽章 -->
                    <template v-if="getRuleSimBadge(it.obj.rule_id)">
                      <span v-if="getRuleSimBadge(it.obj.rule_id).dead"
                            class="cfg-rule-sim-badge cfg-rule-sim-badge-dead"
                            title="最近一次模擬此規則未觸發 — 可能是 dead code">0</span>
                      <span v-else
                            class="cfg-rule-sim-badge"
                            :title="'觸發 ' + getRuleSimBadge(it.obj.rule_id).count.toLocaleString() + ' 次' + (Math.abs(getRuleSimBadge(it.obj.rule_id).rtp) > 0.0001 ? ' · RTP 貢獻 ' + getRuleSimBadge(it.obj.rule_id).rtp.toFixed(2) : '')">
                        {{ getRuleSimBadge(it.obj.rule_id).count >= 1000
                            ? (getRuleSimBadge(it.obj.rule_id).count / 1000).toFixed(1) + 'k'
                            : getRuleSimBadge(it.obj.rule_id).count }}
                      </span>
                    </template>
                    <span v-if="!it.obj.rule_id.trim() || (ruleDuplicateIds.has(it.obj.rule_id) && it.obj.rule_id)"
                          class="cfg-split-item-warn" title="編號錯誤或重複"></span>
                  </div>
                </template>
                <template v-else-if="grp.kind === 'discard'">
                  <div v-for="it in grp.items" :key="'discard-' + it.idx"
                       class="cfg-split-item"
                       :class="{
                         active: selectedKind === 'discard' && selectedDiscardIdx === it.idx,
                         'cfg-split-item-hard': it.obj.discard_kind === 'HARD',
                         'cfg-split-item-soft': it.obj.discard_kind === 'SOFT',
                         'is-duplicate': discardDuplicateIds.has(it.obj.discard_id) && it.obj.discard_id,
                       }"
                       :title="humanizeDiscard(it.obj)"
                       @click="selectRuleFromList('discard', 'discard', it.idx)">
                    <span class="cfg-split-item-id">{{ it.obj.discard_id || '?' }}</span>
                    <!-- v8.15 #5:模式資訊(HARD/SOFT 保留徽章呈現) -->
                    <span class="cfg-split-item-sub">{{ discardListSub(it.obj) }}</span>
                    <span v-if="it.obj.discard_kind" class="cfg-split-item-badge"
                          :class="it.obj.discard_kind === 'HARD' ? 'hard' : 'soft'">
                      {{ it.obj.discard_kind }}
                    </span>
                    <span v-if="!it.obj.discard_id.trim() || (discardDuplicateIds.has(it.obj.discard_id) && it.obj.discard_id)"
                          class="cfg-split-item-warn" title="編號錯誤或重複"></span>
                  </div>
                </template>
                <!-- v8.15 批2 #F:產牌限制群 — 點擊跳「產牌限制」子分頁並選中該列 -->
                <template v-else>
                  <div v-for="it in grp.items" :key="'gl-' + it.idx"
                       class="cfg-split-item"
                       :title="humanizeGenLimit(it.obj)"
                       @click="selectGenLimitFromList(it.idx)">
                    <span class="cfg-split-item-id">{{ it.obj.limit_id || '?' }}</span>
                    <span class="cfg-split-item-sub">{{ genListSub(it.obj) }}</span>
                  </div>
                </template>
              </template>

              <!-- 空狀態 -->
              <div v-if="rules.length === 0 && discards.length === 0" class="cfg-rules-list-empty">
                尚無規則,從下方「+ 新增」開始
              </div>
              <div v-else-if="rulesListGroups.every(g => g.items.length === 0)" class="cfg-rules-list-empty">
                沒有符合「{{ rulesListSearch }}」的規則
              </div>
            </div>

            <div class="cfg-split-list-add cfg-rules-add-host">
              <button class="cfg-split-list-add-btn"
                      @click.stop="rulesAddMenuOpen = !rulesAddMenuOpen"
                      :class="{ active: rulesAddMenuOpen }">
                <span>+</span><span>新增</span>
                <span class="cfg-rules-add-arrow">{{ rulesAddMenuOpen ? '▾' : '▸' }}</span>
              </button>
              <!-- 下拉選單 -->
              <div v-if="rulesAddMenuOpen" class="cfg-rules-add-menu">
                <button class="cfg-rules-add-menu-item"
                        @click="addRuleFromMenu('puzzle')">
                  <span class="cfg-rules-add-menu-icon">🧩</span>
                  <span class="cfg-rules-add-menu-label">拼圖規則</span>
                  <span class="cfg-rules-add-menu-sub">trigger + condition + actions</span>
                </button>
                <!-- v8.15 批2:HARD/SOFT 合併為單一入口(彈窗內選類型;清單 HARD 置前) -->
                <button class="cfg-rules-add-menu-item"
                        @click="addRuleFromMenu('discard')">
                  <span class="cfg-rules-add-menu-icon">🗑</span>
                  <span class="cfg-rules-add-menu-label">棄牌規則</span>
                  <span class="cfg-rules-add-menu-sub">HARD(風控)/ SOFT(體感)於彈窗內選</span>
                </button>
                <button class="cfg-rules-add-menu-item"
                        @click="addRuleFromMenu('genlimit')">
                  <span class="cfg-rules-add-menu-icon">🎲</span>
                  <span class="cfg-rules-add-menu-label">產牌限制</span>
                  <span class="cfg-rules-add-menu-sub">符號在各區域的出現數量上下限</span>
                </button>
              </div>
              <!-- #17 自動重設 priority 開關(只對拼圖規則有意義)-->
              <label class="cfg-rules-autopri" v-if="rules.length > 0">
                <input type="checkbox" v-model="rulesAutoPriority">
                <span title="拖曳重排拼圖規則後,自動依新順序設定 priority(從 100 開始遞減)">拖曳時自動重設 priority</span>
              </label>
            </div>

            <!-- UI/UX 改版 P2:規則列右鍵選單(複用 cfg-cv-ctx 樣式)-->
            <div class="cfg-cv-ctx rule-ctx" v-if="ruleCtx.open" :style="{ left: ruleCtx.x + 'px', top: ruleCtx.y + 'px' }">
              <button class="cfg-cv-ctx-item" @click="ruleCtxDuplicate()">⎘ 複製此規則</button>
              <button class="cfg-cv-ctx-item" @click="ruleCtxToggleEnabled()">{{ rules[ruleCtx.data] && rules[ruleCtx.data].enabled === false ? '▶ 啟用此規則' : '⏸ 停用此規則' }}</button>
              <div class="cfg-cv-ctx-sep"></div>
              <button class="cfg-cv-ctx-item cfg-cv-ctx-danger" @click="ruleCtxDelete()">✕ 刪除此規則</button>
            </div>
          </div>

          <!-- 右欄:依 selectedKind 切換編輯器 -->
          <div class="cfg-split-detail">
            <!-- 完全空狀態 -->
            <div v-if="rules.length === 0 && discards.length === 0" class="cfg-split-empty">
              <div class="cfg-split-empty-icon">🧩</div>
              <div>尚無規則,請點擊左下角「+ 新增」</div>
            </div>

            <!-- ═══ 拼圖規則編輯器(原 09 右欄)═══ -->
            <template v-else-if="selectedKind === 'puzzle' && rules[selectedRuleIdx]">
              <!-- 標題列 -->
              <div class="cfg-split-detail-header cfg-reveal-zone">
                <div style="flex:1;">
                  <!-- v8.15 批2 #E:標題欄補提示(原本只剩一個無說明輸入框) -->
                  <label class="cfg-split-id-lbl">條件名稱 <span class="cfg-key">rule_id</span><span class="cfg-split-id-hint">規則的唯一編號,清單與 A.xlsx 都用它</span></label>
                  <input class="input cfg-mode-name-input cfg-split-id-input input-w-id"
                         :class="{ err: !rules[selectedRuleIdx].rule_id.trim() || (ruleDuplicateIds.has(rules[selectedRuleIdx].rule_id) && rules[selectedRuleIdx].rule_id) }"
                         v-model.trim="rules[selectedRuleIdx].rule_id"
                         placeholder="例:P001 / FG觸發"
                         maxlength="20"
                         @change="renameRuleBuilderState($event.target._oldVal, rules[selectedRuleIdx].rule_id)"
                         @focus="$event.target._oldVal = $event.target.value">
                </div>
                <button class="cfg-split-detail-dup cfg-reveal"
                        @click="duplicateRule(selectedRuleIdx)"
                        title="複製此規則(只改 ID,其他全部保留;priority +1)">⎘</button>
                <button class="cfg-split-detail-del cfg-reveal"
                        @click="removeRule(selectedRuleIdx)"
                        title="刪除此規則">✕</button>
              </div>

              <div v-if="!rules[selectedRuleIdx].rule_id.trim()" class="cfg-warn cfg-warn-inline">⚠ 規則編號不能為空</div>
              <div v-else-if="ruleDuplicateIds.has(rules[selectedRuleIdx].rule_id)" class="cfg-warn cfg-warn-inline">
                ⚠ 規則編號「{{ rules[selectedRuleIdx].rule_id }}」與其他規則重複
              </div>

              <!-- v3.3:整條規則的白話翻譯卡 -->
              <div class="cfg-rule-humanize-card" v-if="rules[selectedRuleIdx]">
                <span class="cfg-rule-humanize-icon">💬</span>
                <span class="cfg-rule-humanize-text">{{ humanizeRule(rules[selectedRuleIdx]) }}</span>
              </div>

              <!-- 規則 body 內容 -->
              <div class="cfg-split-rule-body">

          <!-- 基本欄位 -->
          <div class="cfg-mode-grid">
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                套用模式 <span class="cfg-key">mode_scope · 可複選</span>
              </label>
              <div class="cfg-chip-row">
                <button v-for="s in allModeScopes" :key="s"
                        class="cfg-chip cfg-chip-sm"
                        :class="{ active: scopeHasMode(rules[selectedRuleIdx], s) }"
                        @click="toggleScopeMode(rules[selectedRuleIdx], s)">{{ s }}</button>
              </div>
            </div>

            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                優先順序 <span class="cfg-key">priority</span>
              </label>
              <input class="input input-w-num" type="number" v-model.number="rules[selectedRuleIdx].priority">
              <div class="cfg-hint">數字越大越優先(同 trigger 下執行順序)</div>
            </div>

            <!-- v8.21 / G1:persistent 規則層修飾子(動作每回合重跑;界-2 sticky 重跑) -->
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                每回合重跑 <span class="cfg-key">persistent</span>
              </label>
              <div class="cfg-chip-row">
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: rules[selectedRuleIdx].persistent === true }"
                        @click="rules[selectedRuleIdx].persistent = true">開</button>
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: rules[selectedRuleIdx].persistent !== true }"
                        @click="rules[selectedRuleIdx].persistent = false">關</button>
              </div>
              <div class="cfg-hint">開啟後此規則的動作每個 spin / respin 重跑(如黏著符號逐回合再結算);純描述,執行交下游。</div>
            </div>

            <!-- v8.4 / R2 P5:隨機擇一組(同組同時觸發時依權重抽一條執行;描述層,由下游實作) -->
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                隨機組(可選) <span class="cfg-key">random_group</span>
              </label>
              <input class="input input-w-num cfg-mono" type="text" placeholder="—"
                     v-model="rules[selectedRuleIdx].random_group"
                     title="同組規則同時觸發時只隨機執行一條(如 Girl Power 三選一施放);留空=一般規則">
              <div class="cfg-hint">同組名的規則觸發時擇一執行</div>
            </div>
            <div class="cfg-field cfg-field-compact" v-if="rules[selectedRuleIdx].random_group">
              <label class="cfg-label">
                抽選權重 <span class="cfg-key">random_weight</span>
              </label>
              <input class="input input-w-num" type="number" min="0"
                     v-model.number="rules[selectedRuleIdx].random_weight">
              <div class="cfg-hint">同組內依權重抽選</div>
            </div>

            <!-- v8.49 / 缺口1:額外機率閘門(condition 之外再抽一次機率骰,才真正觸發;
                 用於無可數圖示條件的純機率直觸發,如 Fortune Rabbit / Lucky Neko) -->
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                觸發機率(可選) <span class="cfg-key">fire_chance</span>
              </label>
              <input class="input input-w-num" type="number" min="0" max="1" step="0.001"
                     v-model.number="rules[selectedRuleIdx].fire_chance">
              <div class="cfg-hint">0~1;1=100%=現行行為。condition 成立後再抽一次此機率骰,骰過才真正執行 actions；與 random_group 正交(可疊加)。</div>
            </div>
          </div>

          <!-- v8.28 / 缺口A:補充判斷說明(自由文字;給前端/下游的判斷規則,無法結構化者以文字補述) -->
          <div class="cfg-field">
            <label class="cfg-label">
              補充判斷說明(可選) <span class="cfg-key">notes</span>
            </label>
            <textarea class="input" rows="2"
                      v-model.trim="rules[selectedRuleIdx].notes"
                      placeholder="例:鳥的走位＝水平先、再垂直;同距取最短路徑"></textarea>
            <div class="cfg-hint">寫給前端 / 下游的「判斷規則」——無法用上方條件 / 動作結構化、但實作時須遵循者(移動順序、最短路徑等)。與規則說明分離;純描述,本工具不執行。</div>
          </div>

          <div class="cfg-field cfg-rule-seccard">
            <label class="cfg-label cfg-rule-seclabel">
              <span class="cfg-rule-secmark">◆</span> 當 · 觸發點 <span class="cfg-key">trigger</span>
            </label>
            <select class="input cfg-trigger-select" v-model="rules[selectedRuleIdx].trigger">
              <option v-for="t in TRIGGER_CATALOG" :key="t.type" :value="t.type">{{ t.label }} — {{ t.type }}</option>
            </select>
            <div class="cfg-hint" v-if="TRIGGER_BY_TYPE[rules[selectedRuleIdx].trigger]">
              💬 {{ TRIGGER_BY_TYPE[rules[selectedRuleIdx].trigger].desc }}
            </div>
            <!-- 甲:當段 規格對照 mono footer(對齊若 / 則）-->
            <div class="cfg-cond-footer">
              <span class="cfg-cond-footer-lbl">DSL</span>
              <code class="cfg-cond-footer-code">{{ rules[selectedRuleIdx].trigger || '(空)' }}</code>
            </div>
          </div>

          <!-- ═══ Condition 拼圖建構器 ═══ -->
          <div class="cfg-puzzle-section cfg-rule-seccard">
            <div class="cfg-puzzle-header">
              <span class="cfg-puzzle-title"><span class="cfg-rule-secmark">◆</span> 若 · 觸發條件 <span class="cfg-key">condition</span></span>
              <div class="cfg-puzzle-mode-toggle">
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: (ruleEditMode[rules[selectedRuleIdx].rule_id] || 'builder') !== 'raw' }"
                        @click="setRuleEditMode(rules[selectedRuleIdx], 'builder')">🧩 拼圖模式</button>
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: ruleEditMode[rules[selectedRuleIdx].rule_id] === 'raw' }"
                        @click="setRuleEditMode(rules[selectedRuleIdx], 'raw')">⌨ 原始 DSL</button>
              </div>
            </div>

            <!-- 確保 builder rows 已初始化(隱形觸發 ensureBuilderRows)-->
            <span style="display:none">{{ ensureBuilderRows(rules[selectedRuleIdx]), '' }}</span>

            <!-- ── 拼圖模式 ── -->
            <div v-if="(ruleEditMode[rules[selectedRuleIdx].rule_id] || 'builder') !== 'raw'" class="cfg-puzzle-body">

              <div v-if="!builderRowsMap[rules[selectedRuleIdx].rule_id] || builderRowsMap[rules[selectedRuleIdx].rule_id].length === 0"
                   class="cfg-puzzle-empty">
                尚無條件;按下方按鈕新增第一片拼圖
              </div>

              <!-- v8.15 批2 #B:或分組視圖(方案 C + 語義規範)—
                   以 OR 為斷點切「觸發組」:組內全部必要(且),任一組整組成立即觸發(或)。
                   語義單一真相 = condition_parser 優先序(AND 綁得比 OR 緊),純顯示層重排。 -->
              <div v-else class="cfg-cond-groups">
                <div v-if="condRowGroups(builderRowsMap[rules[selectedRuleIdx].rule_id]).length > 1"
                     class="cfg-cond-groups-hint">符合以下<strong>任一組</strong>,即觸發:</div>
                <template v-for="(gp, gi) in condRowGroups(builderRowsMap[rules[selectedRuleIdx].rule_id])" :key="'g' + gi">
                  <button v-if="gi > 0" class="cfg-cond-or-sep"
                          title="「或」:任一組成立即觸發。點擊可把此組併回上一組(改為 且)"
                          @click="gp[0].row.combinator = 'AND'; rebuildConditionForRule(selectedRuleIdx)">或</button>
                  <div class="cfg-puzzle-rows cfg-puzzle-pills cfg-cond-group">
                    <span v-if="condRowGroups(builderRowsMap[rules[selectedRuleIdx].rule_id]).length > 1"
                          class="cfg-cond-group-tag">第 {{ gi + 1 }} 組</span>
                    <template v-for="it in gp" :key="it.ri">

                  <!-- 組內連接符恆為「且」(必要);點擊改「或」= 從此拆出新組 -->
                  <button v-if="it.ri > gp[0].ri" class="cfg-cond-connector"
                          title="「且」:必要條件,同組內全部成立才觸發。點擊改為「或」(拆出新的擇一組)"
                          @click="it.row.combinator = 'OR'; rebuildConditionForRule(selectedRuleIdx)">
                    且
                  </button>

                  <!-- 收合態:白話膠囊 -->
                  <button v-if="!isCondRowOpen('rule:' + rules[selectedRuleIdx].rule_id, it.ri)"
                          class="cfg-cond-pill"
                          title="點擊展開編輯這片條件"
                          @click="toggleCondRow('rule:' + rules[selectedRuleIdx].rule_id, it.ri)">
                    <span class="cfg-cond-pill-text">{{ humanizeCondRow(it.row) }}</span>
                    <span class="cfg-cond-pill-edit">✎</span>
                  </button>

                  <!-- 展開態:四欄編輯列(緊湊寬度,不再撐滿) -->
                  <div v-else class="cfg-puzzle-row cfg-puzzle-row-compact">

                    <!-- 變數類別 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                      <label class="cfg-puzzle-piece-label">變數</label>
                      <select class="cfg-puzzle-select"
                              :value="it.row.category"
                              @change="changeRowCategory(selectedRuleIdx, it.ri, $event.target.value)">
                        <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ varCatLabel(cat.id) }}</option>
                      </select>
                    </div>

                    <!-- 子鍵(若需要)-->
                    <div v-if="rowCategoryMeta(it.row).needsSubkey"
                         class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                      <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(it.row).subkeyHint }}</label>
                      <!-- symbol_count 用下拉,其他用文字 -->
                      <select v-if="rowCategoryMeta(it.row).subkeySource === 'symbols' && symbolNames.length > 0"
                              class="cfg-puzzle-select"
                              v-model="it.row.subkey"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option value="">(選擇)</option>
                        <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                      </select>
                      <input v-else
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="it.row.subkey"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             :placeholder="rowCategoryMeta(it.row).subkeyHint">
                    </div>

                    <!-- 運算子 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                      <label class="cfg-puzzle-piece-label">運算</label>
                      <select class="cfg-puzzle-select cfg-puzzle-op"
                              v-model="it.row.op"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option v-for="o in OP_TYPES" :key="o" :value="o">{{ opLabel(o) }}</option>
                      </select>
                    </div>

                    <!-- 值 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                      <label class="cfg-puzzle-piece-label">
                        {{ OP_IS_LIST.has(it.row.op) ? '值清單(逗號分隔)' : '值' }}
                      </label>
                      <!-- in/not_in:強制文字輸入(可放多值) -->
                      <input v-if="OP_IS_LIST.has(it.row.op)"
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="it.row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="FG1, FG2, FG3">
                      <!-- valueType = mode:用 chip 列出模式 -->
                      <select v-else-if="rowCategoryMeta(it.row).valueType === 'mode' && modeNames.length > 0"
                              class="cfg-puzzle-select"
                              v-model="it.row.value"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                      </select>
                      <input v-else-if="rowCategoryMeta(it.row).valueType === 'number'"
                             class="cfg-puzzle-input cfg-mono"
                             type="number"
                             step="any"
                             v-model="it.row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="0">
                      <input v-else
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="it.row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="值">
                    </div>

                    <!-- v8.15 #6:完成(收合為膠囊)+ 刪除 -->
                    <button class="cfg-cond-row-done"
                            @click="toggleCondRow('rule:' + rules[selectedRuleIdx].rule_id, it.ri)"
                            title="完成,收合為白話膠囊">✓</button>
                    <button class="cfg-puzzle-row-del"
                            @click="removeBuilderRow(selectedRuleIdx, it.ri)"
                            title="移除此片拼圖">✕</button>
                  </div>
                    </template>
                  </div>
                </template>
              </div>

              <!-- 新增列按鈕(若已有列,顯示「AND / OR」兩個) -->
              <div class="cfg-puzzle-add">
                <!-- v8.15:修復舊版引用不存在的 idx(v-for 殘留)→ 走 UI 包裝,新列自動展開 -->
                <button v-if="!builderRowsMap[rules[selectedRuleIdx].rule_id] || builderRowsMap[rules[selectedRuleIdx].rule_id].length === 0"
                        class="cfg-mode-add-btn cfg-puzzle-add-btn"
                        @click="addBuilderRowUI('AND')">
                  <span style="font-size: 14px;">+</span>
                  <span>新增第一片條件</span>
                </button>
                <template v-else>
                  <!-- v8.15 批2 #B:語義化命名 — 必要(且)加入最後一組;擇一(或)另開新組 -->
                  <button class="cfg-puzzle-add-and" @click="addBuilderRowUI('AND')"
                          title="加到最後一組:同組內全部成立才觸發">
                    + 必要條件(且)
                  </button>
                  <button class="cfg-puzzle-add-or" @click="addBuilderRowUI('OR')"
                          title="另開一組:任一組整組成立即觸發(如 3 或 4 或 5 個 SCAT 都能觸發)">
                    + 擇一組(或)
                  </button>
                </template>
              </div>

            </div>

            <!-- ── 原始 DSL 模式 ── -->
            <div v-else class="cfg-puzzle-body">
              <input class="input cfg-mono cfg-puzzle-raw-input"
                     type="text"
                     v-model.trim="rules[selectedRuleIdx].condition"
                     placeholder="symbol_count.SCAT >= 3 AND mode == FG1">
              <div v-if="ruleParseError[rules[selectedRuleIdx].rule_id]" class="cfg-warn cfg-warn-inline">
                ⚠ {{ ruleParseError[rules[selectedRuleIdx].rule_id] }}
              </div>
              <div class="cfg-hint">
                直接編寫 DSL 字串。可用變數:<code>symbol_count.X</code> /
                <code>global.X</code> / <code>spin_locals.X</code> /
                <code>payload.X</code> / <code>mode</code> / <code>combo_step</code> /
                <code>total_multiplier</code>。
                切回拼圖模式時會自動嘗試重新解析(支援扁平 AND/OR;含括號的暫不支援)。
              </div>
            </div>

            <!-- v8.15 批2 #A:DSL + 釘選 合併單行 footer(區塊 4 段 → 2 段) -->
            <div class="cfg-cond-footer">
              <span class="cfg-cond-footer-lbl">DSL</span>
              <code class="cfg-cond-footer-code">{{ rules[selectedRuleIdx].condition || '(空)' }}</code>
              <button class="cfg-puzzle-pin-btn cfg-cond-footer-pin"
                      :class="{ active: pinnedTest && pinnedTest.kind === 'rule' && pinnedTest.id === rules[selectedRuleIdx].rule_id }"
                      @click="pinTest('rule', rules[selectedRuleIdx].rule_id, rules[selectedRuleIdx].rule_id)"
                      title="把這條規則釘到右下角的測試檢查器,即時看條件評估結果">
                <span>🧪</span>
                <span v-if="pinnedTest && pinnedTest.kind === 'rule' && pinnedTest.id === rules[selectedRuleIdx].rule_id">已釘住</span>
                <span v-else>釘到測試檢查器</span>
              </button>
            </div>
          </div>

          <!-- ═══ Action 動作清單(支援多個動作,按順序執行)═══ -->
          <div class="cfg-action-section cfg-rule-seccard">
            <div class="cfg-action-header">
              <span class="cfg-action-title"><span class="cfg-rule-secmark">◆</span> 則 · 動作清單 <span class="cfg-key">actions</span></span>
              <div class="cfg-action-header-right">
                <span class="cfg-action-count">{{ (rules[selectedRuleIdx].actions || []).length }} 個動作</span>
                <div class="cfg-puzzle-mode-toggle">
                  <button class="cfg-chip cfg-chip-sm"
                          :class="{ active: (actionEditMode[rules[selectedRuleIdx].rule_id] || 'visual') !== 'dsl' }"
                          @click="setActionEditMode(rules[selectedRuleIdx], 'visual')">🧩 視覺</button>
                  <button class="cfg-chip cfg-chip-sm"
                          :class="{ active: actionEditMode[rules[selectedRuleIdx].rule_id] === 'dsl' }"
                          @click="setActionEditMode(rules[selectedRuleIdx], 'dsl')">⌨ 原始 DSL</button>
                </div>
              </div>
            </div>

            <!-- ── 視覺模式:list of actions ── -->
            <div v-if="(actionEditMode[rules[selectedRuleIdx].rule_id] || 'visual') !== 'dsl'" class="cfg-action-body">

              <div v-if="(rules[selectedRuleIdx].actions || []).length === 0" class="cfg-puzzle-empty">
                尚無動作;規則僅會在條件成立時被「記錄一次」,實際無副作用。
              </div>

              <!-- 每個 action 一張卡片 -->
              <!-- v8.15 #6:動作卡收合 — 標頭一行白話(humanizeAction),點 caret 展開才見型別與參數;
                   未選型的空動作恆展開,避免無法選型。 -->
              <div v-for="(act, ai) in rules[selectedRuleIdx].actions" :key="ai"
                   class="cfg-action-card cfg-reveal-zone"
                   :class="{ 'is-collapsed': !isActionOpen(rules[selectedRuleIdx].rule_id, ai, act) }">
                <div class="cfg-action-card-header">
                  <button class="cfg-action-card-caret"
                          :class="{ open: isActionOpen(rules[selectedRuleIdx].rule_id, ai, act) }"
                          :disabled="!act.atype"
                          @click="toggleActionOpen(rules[selectedRuleIdx].rule_id, ai)"
                          title="展開 / 收合此動作">▸</button>
                  <span class="cfg-action-card-idx">#{{ ai + 1 }}</span>
                  <span v-if="!isActionOpen(rules[selectedRuleIdx].rule_id, ai, act)"
                        class="cfg-action-card-summary"
                        title="點擊展開編輯"
                        @click="toggleActionOpen(rules[selectedRuleIdx].rule_id, ai)">
                    {{ actionMeta(act.atype) ? actionMeta(act.atype).icon + ' ' : '' }}{{ humanizeAction(act) }}
                  </span>
                  <select v-else class="cfg-action-card-select cfg-mono"
                          :value="act.atype"
                          @change="changeActionAtType(selectedRuleIdx, ai, $event.target.value)">
                    <option value="">(選擇動作類型)</option>
                    <optgroup label="倍數 / 變數">
                      <option v-for="a in actionsByGroup.numeric" :key="a.type" :value="a.type">
                        {{ a.icon }} {{ a.label }} — {{ a.type }}
                      </option>
                    </optgroup>
                    <optgroup label="流程控制">
                      <option v-for="a in actionsByGroup.flow" :key="a.type" :value="a.type">
                        {{ a.icon }} {{ a.label }} — {{ a.type }}
                      </option>
                    </optgroup>
                    <optgroup label="盤面操作">
                      <option v-for="a in actionsByGroup.board" :key="a.type" :value="a.type">
                        {{ a.icon }} {{ a.label }} — {{ a.type }}
                      </option>
                    </optgroup>
                  </select>
                  <button class="cfg-action-card-btn cfg-reveal" @click="moveAction(selectedRuleIdx, ai, -1)"
                          :disabled="ai === 0" title="上移">▲</button>
                  <button class="cfg-action-card-btn cfg-reveal" @click="moveAction(selectedRuleIdx, ai, 1)"
                          :disabled="ai === rules[selectedRuleIdx].actions.length - 1" title="下移">▼</button>
                  <button class="cfg-action-card-btn cfg-reveal" @click="duplicateAction(selectedRuleIdx, ai)" title="複製">⎘</button>
                  <button class="cfg-action-card-del cfg-reveal" @click="removeAction(selectedRuleIdx, ai)" title="刪除">✕</button>
                </div>

                <template v-if="isActionOpen(rules[selectedRuleIdx].rule_id, ai, act)">
                <div v-if="actionMeta(act.atype)" class="cfg-action-desc">
                  💬 {{ actionMeta(act.atype).desc }}
                </div>
                <div v-else-if="act.atype" class="cfg-warn cfg-warn-inline">
                  ⚠ 「{{ act.atype }}」不在內建 catalog
                </div>

                <!-- 動態 params 表單 -->
                <div v-if="actionMeta(act.atype) && actionMeta(act.atype).params.length > 0"
                     class="cfg-action-params">
                  <div v-for="param in actionMeta(act.atype).params" :key="param.key"
                       class="cfg-field cfg-field-compact">
                    <label class="cfg-label">
                      {{ param.label }}
                      <span class="cfg-key">{{ param.key }}</span>
                      <span v-if="param.required" class="cfg-required">*</span>
                    </label>

                    <!-- mode 下拉 -->
                    <select v-if="param.type === 'mode'"
                            class="input cfg-mono"
                            :value="actParamValue(act, param.key)"
                            @change="setActParam(act, param.key, $event.target.value)">
                      <option value="">(選擇模式)</option>
                      <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                    </select>

                    <!-- symbol 下拉 + 自由輸入 -->
                    <template v-else-if="param.type === 'symbol'">
                      <select v-if="symbolNames.length > 0"
                              class="input cfg-mono"
                              :value="actParamValue(act, param.key)"
                              @change="setActParam(act, param.key, $event.target.value)">
                        <option value="">(選擇符號)</option>
                        <!-- v8.4 / R2 P3:哨兵值(param 有宣告 sentinels 才出現) -->
                        <option v-for="sv in (param.sentinels || [])" :key="'sv'+sv" :value="sv">{{ sv }}（{{ sv === 'BEST' ? '取最有利' : '隨機挑選' }}）</option>
                        <!-- v8.36 / 🟢-2:可家族化參數(groupable)追加符號家族選項 -->
                        <template v-if="param.groupable && symGroupOptions.length">
                          <option v-for="go in symGroupOptions" :key="'g'+go.value" :value="go.value">{{ go.label }}</option>
                        </template>
                        <option v-if="param.groupable && isOrphanGroupRef(actParamValue(act, param.key))"
                                :value="actParamValue(act, param.key)">{{ actParamValue(act, param.key) }}（⚠ 家族不存在）</option>
                        <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                      </select>
                      <input v-else class="input cfg-mono"
                             type="text"
                             :value="actParamValue(act, param.key)"
                             @input="setActParam(act, param.key, $event.target.value)"
                             :placeholder="param.placeholder">
                    </template>

                    <!-- enum:chip 列 -->
                    <div v-else-if="param.type === 'enum'" class="cfg-chip-row">
                      <button v-for="opt in param.options" :key="opt"
                              class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(act, param.key) === opt }"
                              @click="setActParam(act, param.key, opt)">{{ enumOptLabel(opt) }}</button>
                    </div>

                    <!-- bool:toggle chip -->
                    <div v-else-if="param.type === 'bool'" class="cfg-chip-row">
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(act, param.key) === true || actParamValue(act, param.key) === 'true' }"
                              @click="setActParam(act, param.key, true)">true</button>
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(act, param.key) === false || actParamValue(act, param.key) === 'false' || actParamValue(act, param.key) === '' }"
                              @click="setActParam(act, param.key, false)">false</button>
                    </div>

                    <!-- pos:格式 [reel,row] -->
                    <input v-else-if="param.type === 'pos'"
                           class="input cfg-mono input-w-id"
                           type="text"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value)"
                           :placeholder="param.placeholder || '[0,1]'">

                    <!-- dyn:數字或動態公式(v8.34 GAP-S1;必排在 number 之前) -->
                    <template v-else-if="param.dyn">
                      <input class="input cfg-mono"
                             type="text"
                             :value="actParamValue(act, param.key)"
                             @input="setActParamDyn(act, param.key, $event.target.value)"
                             :placeholder="param.placeholder || '數字或公式'">
                      <div v-if="dynParamWarn(actParamValue(act, param.key))"
                           class="cfg-warn cfg-warn-inline">{{ dynParamWarn(actParamValue(act, param.key)) }}</div>
                    </template>

                    <!-- number -->
                    <input v-else-if="param.type === 'number'"
                           class="input cfg-mono input-w-num"
                           type="number"
                           step="any"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value === '' ? '' : Number($event.target.value))"
                           :placeholder="param.placeholder">

                    <!-- text / auto -->
                    <input v-else
                           class="input cfg-mono"
                           type="text"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value)"
                           :placeholder="param.placeholder">

                    <div v-if="param.desc" class="cfg-hint">{{ param.desc }}</div>
                  </div>
                </div>

                <div v-else-if="actionMeta(act.atype) && actionMeta(act.atype).params.length === 0"
                     class="cfg-hint">此動作不需要參數</div>

                <!-- v8.20 / G5:範圍謂詞 scope(選用;動作層修飾子,任何動作皆可加) -->
                <div v-if="act.atype" class="cfg-field cfg-field-compact cfg-action-scope">
                  <label class="cfg-label">
                    作用範圍 <span class="cfg-key">scope · 選用</span>
                  </label>
                  <select class="input cfg-mono"
                          :value="scopeBaseOf(act)"
                          @change="setScope(act, $event.target.value, scopeArgOf(act))">
                    <option value="">（全盤 / 不限範圍）</option>
                    <option v-for="sc in SCOPE_CATALOG" :key="sc.key" :value="sc.key">{{ sc.zh }}（{{ sc.key }}）</option>
                  </select>
                  <!-- range / random_cells 帶參數 -->
                  <input v-if="scopeBaseOf(act) === 'range' || scopeBaseOf(act) === 'random_cells'"
                         class="input cfg-mono input-w-id"
                         type="text"
                         :value="scopeArgOf(act)"
                         @input="setScope(act, scopeBaseOf(act), $event.target.value)"
                         :placeholder="scopeBaseOf(act) === 'range' ? 'n..m（如 3..8）' : 'N（格數，如 5）'">
                  <div class="cfg-hint">限定動作作用的盤面範圍；純規格描述，實際命中交下游模擬工具。</div>
                </div>
                </template>
              </div>

              <!-- 新增 action 按鈕 -->
              <!-- v8.15 #4:元件契約 — 快捷 atype 一鍵鈕退役(與型別下拉重疊的第二套選擇機制);
                   統一走「+ 新增動作」→ 型別下拉。 -->
              <div class="cfg-action-add-row">
                <button class="cfg-action-add-btn" @click="addActionUI('')">
                  <span>+</span><span>新增動作</span>
                </button>
              </div>

              <!-- v8.15 批2 #A:Actions DSL 併入單行 footer -->
              <div class="cfg-cond-footer">
                <span class="cfg-cond-footer-lbl">DSL</span>
                <code class="cfg-cond-footer-code">{{ buildActionsDSL(rules[selectedRuleIdx].actions) || '(空)' }}</code>
              </div>
            </div>

            <!-- ── 原始 DSL 模式 ── -->
            <div v-else class="cfg-action-body">
              <label class="cfg-label">Actions DSL <span class="cfg-key">condition_parser.parse_actions 格式</span></label>
              <textarea class="input cfg-mono"
                        rows="3"
                        :value="buildActionsDSL(rules[selectedRuleIdx].actions)"
                        @change="setActionsFromDSL(selectedRuleIdx, $event.target.value)"
                        @blur="setActionsFromDSL(selectedRuleIdx, $event.target.value)"
                        placeholder='EMIT_EVENT(name=fg_trigger); SWITCH_MODE(target=FG1)'></textarea>
              <div class="cfg-hint">
                格式:<code>TYPE(key=val, key=val); TYPE(...)</code>。
                值可為數字、true/false、字串、<code>[1,2,3]</code> 清單、<code>{a:1,b:2}</code> 字典。
                變更會立即解析回視覺模式;解析失敗會保留現狀並顯示警告。
              </div>
              <div v-if="actionsParseError[rules[selectedRuleIdx].rule_id]" class="cfg-warn cfg-warn-inline">
                ⚠ {{ actionsParseError[rules[selectedRuleIdx].rule_id] }}
              </div>
            </div>
          </div>

          <!-- 啟用開關 + Emits 清單 + 描述 -->
          <div class="cfg-mode-grid">
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                啟用 <span class="cfg-key">enabled</span>
              </label>
              <div class="cfg-chip-row">
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: rules[selectedRuleIdx].enabled }"
                        @click="rules[selectedRuleIdx].enabled = true">啟用</button>
                <button class="cfg-chip cfg-chip-sm cfg-chip-danger"
                        :class="{ active: !rules[selectedRuleIdx].enabled }"
                        @click="rules[selectedRuleIdx].enabled = false">停用</button>
              </div>
              <div class="cfg-hint">停用後,規則不會被 LogicParser 執行(用於暫時除錯)</div>
            </div>
            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                Emits 宣告 <span class="cfg-key">emits</span>
              </label>
              <input class="input cfg-mono"
                     type="text"
                     :value="(rules[selectedRuleIdx].emits || []).join(', ')"
                     @input="rules[selectedRuleIdx].emits = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                     placeholder="fg_trigger, big_win">
              <div class="cfg-hint">本規則會 EMIT_EVENT 哪些事件(文件性;後端只看 actions 中的實際 EMIT_EVENT)</div>
            </div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              描述 <span class="cfg-key">description</span>
            </label>
            <input class="input" type="text" v-model.trim="rules[selectedRuleIdx].description"
                   placeholder="(選填)用一句話說明此規則的目的">
          </div>

              </div>

              <details class="cfg-debug" style="margin-top:8px;" @toggle="dbgOpen.rules = $event.target.open">
                <summary>🔍 預覽目前 JSON(拼圖規則 {{ rules.length }} 條)</summary>
                <pre v-if="dbgOpen.rules" class="cfg-debug-pre">{{ rulesDebugJson }}</pre>
              </details>
            </template>

            <!-- ═══ 棄牌規則編輯器(原 10 右欄)═══ -->
            <template v-else-if="selectedKind === 'discard' && discards[selectedDiscardIdx]">
              <!-- 標題列 -->
              <div class="cfg-split-detail-header cfg-reveal-zone">
                <div style="flex:1;">
                  <label class="cfg-split-id-lbl">條件名稱 <span class="cfg-key">discard_id</span><span class="cfg-split-id-hint">棄牌規則的唯一編號</span></label>
                  <input class="input cfg-mode-name-input cfg-split-id-input input-w-id"
                         :class="{ err: !discards[selectedDiscardIdx].discard_id.trim() || (discardDuplicateIds.has(discards[selectedDiscardIdx].discard_id) && discards[selectedDiscardIdx].discard_id) }"
                         v-model.trim="discards[selectedDiscardIdx].discard_id"
                         placeholder="例:D001 / 死局上限"
                         maxlength="20">
                </div>
                <button class="cfg-split-detail-dup cfg-reveal"
                        @click="duplicateDiscard(selectedDiscardIdx)"
                        title="複製此棄牌規則">⎘</button>
                <button class="cfg-split-detail-del cfg-reveal"
                        @click="removeDiscard(selectedDiscardIdx)"
                        title="刪除此棄牌規則">✕</button>
              </div>

              <div v-if="!discards[selectedDiscardIdx].discard_id.trim()" class="cfg-warn cfg-warn-inline">⚠ 棄牌編號不能為空</div>
              <div v-else-if="discardDuplicateIds.has(discards[selectedDiscardIdx].discard_id)" class="cfg-warn cfg-warn-inline">
                ⚠ 棄牌編號「{{ discards[selectedDiscardIdx].discard_id }}」與其他規則重複
              </div>

              <!-- v3.3:棄牌規則白話翻譯卡 -->
              <div class="cfg-rule-humanize-card cfg-rule-humanize-discard">
                <span class="cfg-rule-humanize-icon">💬</span>
                <span class="cfg-rule-humanize-text">{{ humanizeDiscard(discards[selectedDiscardIdx]) }}</span>
              </div>

              <div class="cfg-split-rule-body">

                <!-- 棄牌類型 -->
                <div class="cfg-field">
                  <label class="cfg-label">
                    棄牌類型 <span class="cfg-key">discard_kind</span>
                  </label>
                  <div class="cfg-chip-row">
                    <button v-for="k in DISCARD_KINDS" :key="k"
                            class="cfg-chip"
                            :class="{
                              active: discards[selectedDiscardIdx].discard_kind === k,
                              'cfg-chip-hard': k === 'HARD' && discards[selectedDiscardIdx].discard_kind === k,
                              'cfg-chip-soft': k === 'SOFT' && discards[selectedDiscardIdx].discard_kind === k,
                            }"
                            @click="discards[selectedDiscardIdx].discard_kind = k">{{ k }}</button>
                  </div>
                  <div class="cfg-hint">
                    <strong>HARD</strong>(風控):整局排除於統計;
                    <strong>SOFT</strong>(體感):仍計入,但獨立追蹤觸發率
                  </div>
                </div>

                <!-- 套用模式 -->
                <div class="cfg-field">
                  <label class="cfg-label">
                    套用模式 <span class="cfg-key">mode_scope · 可複選</span>
                  </label>
                  <div class="cfg-chip-row">
                    <button v-for="s in allModeScopes" :key="s"
                            class="cfg-chip cfg-chip-sm"
                            :class="{ active: scopeHasMode(discards[selectedDiscardIdx], s) }"
                            @click="toggleScopeMode(discards[selectedDiscardIdx], s)">{{ s }}</button>
                  </div>
                  <div class="cfg-hint">ALL = 所有模式;可點選多個模式(任一相符即適用)</div>
                </div>

                <!-- Condition 共用拼圖建構器(Session C) -->
                <div class="cfg-puzzle-section">
                  <span style="display:none">{{ discardCond.ensure(discards[selectedDiscardIdx]), '' }}</span>
                  <div class="cfg-puzzle-header">
                    <span class="cfg-puzzle-title">🧩 觸發條件 <span class="cfg-key">condition</span></span>
                    <div class="cfg-puzzle-mode-toggle">
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: (condBuilderState.mode[discardCond.key(discards[selectedDiscardIdx])] || 'builder') !== 'raw' }"
                              @click="discardCond.setMode(discards[selectedDiscardIdx], 'builder')">🧩 拼圖</button>
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: condBuilderState.mode[discardCond.key(discards[selectedDiscardIdx])] === 'raw' }"
                              @click="discardCond.setMode(discards[selectedDiscardIdx], 'raw')">⌨ 原始</button>
                    </div>
                  </div>

                  <!-- 拼圖模式 -->
                  <div v-if="(condBuilderState.mode[discardCond.key(discards[selectedDiscardIdx])] || 'builder') !== 'raw'" class="cfg-puzzle-body">
                    <div v-if="!condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])] || condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])].length === 0"
                         class="cfg-puzzle-empty">尚無條件;按下方按鈕新增第一片拼圖</div>

                    <!-- v8.15 批2 #B:棄牌條件同款或分組視圖 -->
                    <div v-else class="cfg-cond-groups">
                      <div v-if="condRowGroups(condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])]).length > 1"
                           class="cfg-cond-groups-hint">符合以下<strong>任一組</strong>,即棄牌:</div>
                      <template v-for="(gp, gi) in condRowGroups(condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])])" :key="'dg' + gi">
                        <button v-if="gi > 0" class="cfg-cond-or-sep"
                                title="「或」:任一組成立即棄牌。點擊可把此組併回上一組(改為 且)"
                                @click="gp[0].row.combinator = 'AND'; discardCond.rebuild(discards[selectedDiscardIdx])">或</button>
                        <div class="cfg-puzzle-rows cfg-puzzle-pills cfg-cond-group">
                          <span v-if="condRowGroups(condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])]).length > 1"
                                class="cfg-cond-group-tag">第 {{ gi + 1 }} 組</span>
                          <template v-for="it in gp" :key="it.ri">

                        <button v-if="it.ri > gp[0].ri" class="cfg-cond-connector"
                                title="「且」:必要條件,同組內全部成立才棄牌。點擊改為「或」(拆出新的擇一組)"
                                @click="it.row.combinator = 'OR'; discardCond.rebuild(discards[selectedDiscardIdx])">
                          且
                        </button>

                        <button v-if="!isCondRowOpen(discardCond.key(discards[selectedDiscardIdx]), it.ri)"
                                class="cfg-cond-pill"
                                title="點擊展開編輯這片條件"
                                @click="toggleCondRow(discardCond.key(discards[selectedDiscardIdx]), it.ri)">
                          <span class="cfg-cond-pill-text">{{ humanizeCondRow(it.row) }}</span>
                          <span class="cfg-cond-pill-edit">✎</span>
                        </button>

                        <div v-else class="cfg-puzzle-row cfg-puzzle-row-compact">
                          <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                            <label class="cfg-puzzle-piece-label">變數</label>
                            <select class="cfg-puzzle-select"
                                    :value="it.row.category"
                                    @change="discardCond.changeCat(discards[selectedDiscardIdx], it.ri, $event.target.value)">
                              <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ varCatLabel(cat.id) }}</option>
                            </select>
                          </div>

                          <div v-if="rowCategoryMeta(it.row).needsSubkey" class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                            <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(it.row).subkeyHint }}</label>
                            <select v-if="rowCategoryMeta(it.row).subkeySource === 'symbols' && symbolNames.length > 0"
                                    class="cfg-puzzle-select"
                                    v-model="it.row.subkey"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option value="">(選擇)</option>
                              <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                            </select>
                            <input v-else
                                   class="cfg-puzzle-input cfg-mono"
                                   type="text"
                                   v-model.trim="it.row.subkey"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   :placeholder="rowCategoryMeta(it.row).subkeyHint">
                          </div>

                          <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                            <label class="cfg-puzzle-piece-label">運算</label>
                            <select class="cfg-puzzle-select cfg-puzzle-op"
                                    v-model="it.row.op"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option v-for="o in OP_TYPES" :key="o" :value="o">{{ opLabel(o) }}</option>
                            </select>
                          </div>

                          <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                            <label class="cfg-puzzle-piece-label">值</label>
                            <select v-if="rowCategoryMeta(it.row).valueType === 'mode' && modeNames.length > 0"
                                    class="cfg-puzzle-select"
                                    v-model="it.row.value"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else-if="rowCategoryMeta(it.row).valueType === 'number'"
                                   class="cfg-puzzle-input cfg-mono"
                                   type="number" step="any"
                                   v-model="it.row.value"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   placeholder="0">
                            <input v-else
                                   class="cfg-puzzle-input cfg-mono"
                                   type="text"
                                   v-model.trim="it.row.value"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   placeholder="值">
                          </div>

                          <button class="cfg-cond-row-done"
                                  @click="toggleCondRow(discardCond.key(discards[selectedDiscardIdx]), ri)"
                                  title="完成,收合為白話膠囊">✓</button>
                          <button class="cfg-puzzle-row-del"
                                  @click="discardCond.removeRow(discards[selectedDiscardIdx], it.ri)"
                                  title="移除此片拼圖">✕</button>
                        </div>
                          </template>
                        </div>
                      </template>
                    </div>

                    <div class="cfg-puzzle-add">
                      <button v-if="!condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])] || condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])].length === 0"
                              class="cfg-mode-add-btn cfg-puzzle-add-btn"
                              @click="discardAddRowUI(discards[selectedDiscardIdx], 'AND')">
                        <span style="font-size: 14px;">+</span>
                        <span>新增第一片條件</span>
                      </button>
                      <template v-else>
                        <button class="cfg-puzzle-add-and" @click="discardAddRowUI(discards[selectedDiscardIdx], 'AND')"
                                title="加到最後一組:同組內全部成立才棄牌">+ 必要條件(且)</button>
                        <button class="cfg-puzzle-add-or" @click="discardAddRowUI(discards[selectedDiscardIdx], 'OR')"
                                title="另開一組:任一組整組成立即棄牌">+ 擇一組(或)</button>
                      </template>
                    </div>

                  </div>

                  <!-- 原始模式 -->
                  <div v-else class="cfg-puzzle-body">
                    <input class="input cfg-mono cfg-puzzle-raw-input"
                           type="text"
                           v-model.trim="discards[selectedDiscardIdx].condition"
                           placeholder="symbol_count.SCAT >= 5">
                    <div v-if="condBuilderState.error[discardCond.key(discards[selectedDiscardIdx])]" class="cfg-warn cfg-warn-inline">
                      ⚠ {{ condBuilderState.error[discardCond.key(discards[selectedDiscardIdx])] }}
                    </div>
                    <div v-if="!discards[selectedDiscardIdx].condition.trim()" class="cfg-warn cfg-warn-inline">
                      ⚠ 條件為空,此規則永遠不會觸發
                    </div>
                  </div>
                  <!-- v8.15 批2 #A:DSL + 釘選 合併單行 footer -->
                  <div class="cfg-cond-footer">
                    <span class="cfg-cond-footer-lbl">DSL</span>
                    <code class="cfg-cond-footer-code">{{ discards[selectedDiscardIdx].condition || '(空)' }}</code>
                    <button class="cfg-puzzle-pin-btn cfg-cond-footer-pin"
                            :class="{ active: pinnedTest && pinnedTest.kind === 'discard' && pinnedTest.id === discards[selectedDiscardIdx].discard_id }"
                            @click="pinTest('discard', discards[selectedDiscardIdx].discard_id, discards[selectedDiscardIdx].discard_id)"
                            :disabled="!discards[selectedDiscardIdx].discard_id"
                            title="把這條棄牌規則釘到右下角的測試檢查器,即時看條件評估結果">
                      <span>🧪</span>
                      <span v-if="pinnedTest && pinnedTest.kind === 'discard' && pinnedTest.id === discards[selectedDiscardIdx].discard_id">已釘住</span>
                      <span v-else>釘到測試檢查器</span>
                    </button>
                  </div>
                </div>

                <!-- 備註 -->
                <div class="cfg-field">
                  <label class="cfg-label">
                    備註 <span class="cfg-key">notes</span>
                  </label>
                  <input class="input" type="text" v-model.trim="discards[selectedDiscardIdx].notes" placeholder="(選填)">
                </div>
              </div>

              <details class="cfg-debug" style="margin-top:8px;" @toggle="dbgOpen.discards = $event.target.open">
                <summary>🔍 預覽目前 JSON(棄牌規則 {{ discards.length }} 條)</summary>
                <pre v-if="dbgOpen.discards" class="cfg-debug-pre">{{ discardsDebugJson }}</pre>
              </details>
            </template>
          </div>

        </div>

        <!-- ═══ v8.15 #3:新增規則彈窗(拼圖=兩步;棄牌=單步;沿用 v8.14 cfg-modedlg 視覺)═══ -->
        <div v-if="ruleDlg.open" class="cfg-modedlg-mask"
             @click.self="ruleDlg.open = false"
             @keydown.esc="ruleDlg.open = false">
          <div class="cfg-modedlg cfg-modedlg-wide" role="dialog" aria-label="新增規則">
            <div class="cfg-modedlg-title">
              {{ ruleDlg.kind === 'discard' ? '新增棄牌規則' : '新增規則' }}
              <span v-if="ruleDlg.kind === 'puzzle'" class="cfg-ruledlg-step">步驟 {{ ruleDlg.step }} / 2</span>
            </div>

            <!-- ── 第一步:條件設定 ── -->
            <template v-if="ruleDlg.step === 1">
              <!-- 條件名稱(唯一鍵 = rule_id / discard_id;撞名防呆) -->
              <div class="cfg-modedlg-field">
                <label class="cfg-label">條件名稱 <span class="cfg-key">必填 · 即規則編號</span></label>
                <input class="input cfg-ruledlg-name"
                       :class="{ err: ruleDlgNameTaken }"
                       type="text" v-model.trim="ruleDlg.name"
                       :placeholder="ruleDlg.kind === 'discard' ? '例:D001 / 死局上限' : '例:P001 / FG觸發'"
                       maxlength="20"
                       @keyup.enter="ruleDlg.kind === 'discard' ? confirmRuleDlg() : dlgStepNext()">
                <div v-if="ruleDlgNameTaken" class="cfg-warn cfg-warn-inline">⚠ 已有同名規則(不分大小寫),請換一個名稱</div>
              </div>

              <!-- 棄牌類型(僅棄牌) -->
              <div v-if="ruleDlg.kind === 'discard'" class="cfg-modedlg-field">
                <label class="cfg-label">棄牌類型 <span class="cfg-key">discard_kind</span></label>
                <div class="cfg-chip-row">
                  <button v-for="k in DISCARD_KINDS" :key="k"
                          class="cfg-chip"
                          :class="{ active: ruleDlg.hardness === k,
                                    'cfg-chip-hard': k === 'HARD' && ruleDlg.hardness === k,
                                    'cfg-chip-soft': k === 'SOFT' && ruleDlg.hardness === k }"
                          @click="ruleDlg.hardness = k">{{ k }}</button>
                </div>
                <div class="cfg-hint"><strong>HARD</strong>(風控):整局排除於統計;<strong>SOFT</strong>(體感):仍計入但獨立追蹤</div>
              </div>

              <!-- 套用模式(v8.16:複選;匯出折疊為 mode in [A, B] AND (…)) -->
              <div class="cfg-modedlg-field">
                <label class="cfg-label">套用模式 <span class="cfg-key">mode_scope · 可複選</span></label>
                <div class="cfg-chip-row">
                  <button v-for="s in allModeScopes" :key="s"
                          class="cfg-chip cfg-chip-sm"
                          :class="{ active: scopeStrHas(ruleDlg.mode, s) }"
                          @click="ruleDlg.mode = toggleScopeStr(ruleDlg.mode, s)">{{ s }}</button>
                </div>
                <div class="cfg-hint">ALL = 所有模式;可點選多個模式(任一相符即適用)</div>
              </div>

              <!-- 觸發點(僅拼圖;精靈流程例外維持 chip 快選) -->
              <div v-if="ruleDlg.kind === 'puzzle'" class="cfg-modedlg-field">
                <label class="cfg-label">觸發點 <span class="cfg-key">trigger</span></label>
                <div class="cfg-chip-row">
                  <button v-for="t in TRIGGER_CATALOG" :key="t.type"
                          class="cfg-chip cfg-chip-sm"
                          :class="{ active: ruleDlg.trigger === t.type }"
                          :title="t.desc"
                          @click="ruleDlg.trigger = t.type">{{ t.label }}</button>
                </div>
                <div class="cfg-hint" v-if="TRIGGER_BY_TYPE[ruleDlg.trigger]">💬 {{ TRIGGER_BY_TYPE[ruleDlg.trigger].desc }}</div>
              </div>

              <!-- 觸發條件(拼圖式;恆展開緊湊列;無 test inspector 釘選) -->
              <div class="cfg-modedlg-field">
                <label class="cfg-label">觸發條件 <span class="cfg-key">condition</span></label>
                <div v-if="ruleDlg.rows.length === 0" class="cfg-puzzle-empty">
                  尚無條件(可留空 = 觸發點發生即執行);按下方按鈕新增第一片拼圖
                </div>
                <div v-else class="cfg-cond-groups">
                  <div v-if="condRowGroups(ruleDlg.rows).length > 1" class="cfg-cond-groups-hint">符合以下<strong>任一組</strong>,即觸發:</div>
                  <template v-for="(gp, gi) in condRowGroups(ruleDlg.rows)" :key="'dlgg' + gi">
                    <button v-if="gi > 0" class="cfg-cond-or-sep"
                            title="「或」:任一組成立即觸發。點擊可把此組併回上一組(改為 且)"
                            @click="gp[0].row.combinator = 'AND'">或</button>
                    <div class="cfg-puzzle-rows cfg-puzzle-pills cfg-cond-group">
                      <span v-if="condRowGroups(ruleDlg.rows).length > 1" class="cfg-cond-group-tag">第 {{ gi + 1 }} 組</span>
                      <template v-for="it in gp" :key="it.ri">
                    <button v-if="it.ri > gp[0].ri" class="cfg-cond-connector"
                            title="「且」:必要條件。點擊改為「或」(拆出新的擇一組)"
                            @click="it.row.combinator = 'OR'">
                      且
                    </button>
                    <div class="cfg-puzzle-row cfg-puzzle-row-compact">
                      <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                        <label class="cfg-puzzle-piece-label">變數</label>
                        <select class="cfg-puzzle-select"
                                :value="it.row.category"
                                @change="dlgChangeCat(it.ri, $event.target.value)">
                          <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ varCatLabel(cat.id) }}</option>
                        </select>
                      </div>
                      <div v-if="rowCategoryMeta(it.row).needsSubkey" class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                        <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(it.row).subkeyHint }}</label>
                        <select v-if="rowCategoryMeta(it.row).subkeySource === 'symbols' && symbolNames.length > 0"
                                class="cfg-puzzle-select" v-model="it.row.subkey">
                          <option value="">(選擇)</option>
                          <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                        </select>
                        <input v-else class="cfg-puzzle-input cfg-mono" type="text"
                               v-model.trim="it.row.subkey" :placeholder="rowCategoryMeta(it.row).subkeyHint">
                      </div>
                      <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                        <label class="cfg-puzzle-piece-label">運算</label>
                        <select class="cfg-puzzle-select cfg-puzzle-op" v-model="it.row.op">
                          <option v-for="o in OP_TYPES" :key="o" :value="o">{{ opLabel(o) }}</option>
                        </select>
                      </div>
                      <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                        <label class="cfg-puzzle-piece-label">{{ OP_IS_LIST.has(it.row.op) ? '值清單(逗號分隔)' : '值' }}</label>
                        <input v-if="OP_IS_LIST.has(it.row.op)"
                               class="cfg-puzzle-input cfg-mono" type="text"
                               v-model.trim="it.row.value" placeholder="A, B, C">
                        <select v-else-if="rowCategoryMeta(it.row).valueType === 'mode' && modeNames.length > 0"
                                class="cfg-puzzle-select" v-model="it.row.value">
                          <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                        </select>
                        <input v-else-if="rowCategoryMeta(it.row).valueType === 'number'"
                               class="cfg-puzzle-input cfg-mono" type="number" step="any"
                               v-model="it.row.value" placeholder="0">
                        <input v-else class="cfg-puzzle-input cfg-mono" type="text"
                               v-model.trim="it.row.value" placeholder="值">
                      </div>
                      <button class="cfg-puzzle-row-del" @click="dlgRemoveRow(it.ri)" title="移除此片拼圖">✕</button>
                    </div>
                      </template>
                    </div>
                  </template>
                </div>
                <div class="cfg-puzzle-add">
                  <button v-if="ruleDlg.rows.length === 0"
                          class="cfg-mode-add-btn cfg-puzzle-add-btn" @click="dlgAddRow('AND')">
                    <span style="font-size: 14px;">+</span><span>新增第一片條件</span>
                  </button>
                  <template v-else>
                    <button class="cfg-puzzle-add-and" @click="dlgAddRow('AND')"
                            title="加到最後一組:同組內全部成立才觸發">+ 必要條件(且)</button>
                    <button class="cfg-puzzle-add-or" @click="dlgAddRow('OR')"
                            title="另開一組:任一組整組成立即觸發(如 3 或 4 或 5 個 SCAT 都能觸發)">+ 擇一組(或)</button>
                  </template>
                </div>
              </div>

              <div class="cfg-modedlg-actions">
                <button class="btn-pill" @click="ruleDlg.open = false">取消</button>
                <button v-if="ruleDlg.kind === 'puzzle'"
                        class="btn-pill cfg-modedlg-confirm"
                        :disabled="!ruleDlg.name.trim() || ruleDlgNameTaken"
                        @click="dlgStepNext">下一步</button>
                <button v-else
                        class="btn-pill cfg-modedlg-confirm"
                        :disabled="!ruleDlg.name.trim() || ruleDlgNameTaken"
                        @click="confirmRuleDlg">建立棄牌規則</button>
              </div>
            </template>

            <!-- ── 第二步(僅拼圖):動作事件 ── -->
            <template v-else>
              <!-- 唯讀回顧:條件名稱 + 口語化觸發條件 -->
              <div class="cfg-ruledlg-ro">
                <span class="cfg-ruledlg-ro-lbl">條件名稱</span>
                <span class="cfg-ruledlg-ro-val">{{ ruleDlg.name }}</span>
              </div>
              <div class="cfg-ruledlg-ro">
                <span class="cfg-ruledlg-ro-lbl">觸發條件</span>
                <span class="cfg-ruledlg-ro-val">{{ ruleDlgCondHuman }}</span>
              </div>

              <div class="cfg-ruledlg-subtitle">動作事件</div>

              <!-- 事件名稱(→ description;防呆:不得與條件名稱 / 其他規則描述完全一樣) -->
              <div class="cfg-modedlg-field">
                <label class="cfg-label">事件名稱 <span class="cfg-key">description</span></label>
                <input class="input"
                       :class="{ err: !!ruleDlgEventClash }"
                       type="text" v-model.trim="ruleDlg.eventName"
                       placeholder="例:觸發免費遊戲 / 全盤倍數提升"
                       maxlength="60">
                <div v-if="ruleDlgEventClash" class="cfg-warn cfg-warn-inline">⚠ {{ ruleDlgEventClash }}</div>
              </div>

              <!-- 執行動作(下拉;#4 契約)+ 動態參數(不含附加資料/備註欄) -->
              <div class="cfg-modedlg-field">
                <label class="cfg-label">執行動作 <span class="cfg-key">actions[0]</span></label>
                <select class="cfg-action-card-select cfg-mono"
                        :value="ruleDlg.action.atype"
                        @change="dlgChangeActionType($event.target.value)">
                  <option value="">(選擇動作類型;可先不選,之後在編輯區補)</option>
                  <optgroup label="倍數 / 變數">
                    <option v-for="a in actionsByGroup.numeric" :key="a.type" :value="a.type">{{ a.icon }} {{ a.label }} — {{ a.type }}</option>
                  </optgroup>
                  <optgroup label="流程控制">
                    <option v-for="a in actionsByGroup.flow" :key="a.type" :value="a.type">{{ a.icon }} {{ a.label }} — {{ a.type }}</option>
                  </optgroup>
                  <optgroup label="盤面操作">
                    <option v-for="a in actionsByGroup.board" :key="a.type" :value="a.type">{{ a.icon }} {{ a.label }} — {{ a.type }}</option>
                  </optgroup>
                </select>
                <div v-if="actionMeta(ruleDlg.action.atype)" class="cfg-action-desc">💬 {{ actionMeta(ruleDlg.action.atype).desc }}</div>

                <div v-if="actionMeta(ruleDlg.action.atype) && actionMeta(ruleDlg.action.atype).params.length > 0"
                     class="cfg-action-params">
                  <div v-for="param in actionMeta(ruleDlg.action.atype).params" :key="param.key"
                       class="cfg-field cfg-field-compact">
                    <label class="cfg-label">
                      {{ param.label }} <span class="cfg-key">{{ param.key }}</span>
                      <span v-if="param.required" class="cfg-required">*</span>
                    </label>
                    <select v-if="param.type === 'mode'" class="input cfg-mono"
                            :value="actParamValue(ruleDlg.action, param.key)"
                            @change="setActParam(ruleDlg.action, param.key, $event.target.value)">
                      <option value="">(選擇模式)</option>
                      <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                    </select>
                    <template v-else-if="param.type === 'symbol'">
                      <select v-if="symbolNames.length > 0" class="input cfg-mono"
                              :value="actParamValue(ruleDlg.action, param.key)"
                              @change="setActParam(ruleDlg.action, param.key, $event.target.value)">
                        <option value="">(選擇符號)</option>
                        <option v-for="sv in (param.sentinels || [])" :key="'sv'+sv" :value="sv">{{ sv }}（{{ sv === 'BEST' ? '取最有利' : '隨機挑選' }}）</option>
                        <!-- v8.36 / 🟢-2:可家族化參數(groupable)追加符號家族選項 -->
                        <template v-if="param.groupable && symGroupOptions.length">
                          <option v-for="go in symGroupOptions" :key="'g'+go.value" :value="go.value">{{ go.label }}</option>
                        </template>
                        <option v-if="param.groupable && isOrphanGroupRef(actParamValue(ruleDlg.action, param.key))"
                                :value="actParamValue(ruleDlg.action, param.key)">{{ actParamValue(ruleDlg.action, param.key) }}（⚠ 家族不存在）</option>
                        <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                      </select>
                      <input v-else class="input cfg-mono" type="text"
                             :value="actParamValue(ruleDlg.action, param.key)"
                             @input="setActParam(ruleDlg.action, param.key, $event.target.value)"
                             :placeholder="param.placeholder">
                    </template>
                    <div v-else-if="param.type === 'enum'" class="cfg-chip-row">
                      <button v-for="opt in param.options" :key="opt"
                              class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(ruleDlg.action, param.key) === opt }"
                              @click="setActParam(ruleDlg.action, param.key, opt)">{{ enumOptLabel(opt) }}</button>
                    </div>
                    <div v-else-if="param.type === 'bool'" class="cfg-chip-row">
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(ruleDlg.action, param.key) === true || actParamValue(ruleDlg.action, param.key) === 'true' }"
                              @click="setActParam(ruleDlg.action, param.key, true)">true</button>
                      <button class="cfg-chip cfg-chip-sm"
                              :class="{ active: actParamValue(ruleDlg.action, param.key) === false || actParamValue(ruleDlg.action, param.key) === 'false' || actParamValue(ruleDlg.action, param.key) === '' }"
                              @click="setActParam(ruleDlg.action, param.key, false)">false</button>
                    </div>
                    <input v-else-if="param.type === 'pos'" class="input cfg-mono input-w-id" type="text"
                           :value="actParamValue(ruleDlg.action, param.key)"
                           @input="setActParam(ruleDlg.action, param.key, $event.target.value)"
                           :placeholder="param.placeholder || '[0,1]'">
                    <!-- v8.34 GAP-S1:dyn 分支必排在 number 之前 -->
                    <template v-else-if="param.dyn">
                      <input class="input cfg-mono" type="text"
                             :value="actParamValue(ruleDlg.action, param.key)"
                             @input="setActParamDyn(ruleDlg.action, param.key, $event.target.value)"
                             :placeholder="param.placeholder || '數字或公式'">
                      <div v-if="dynParamWarn(actParamValue(ruleDlg.action, param.key))"
                           class="cfg-warn cfg-warn-inline">{{ dynParamWarn(actParamValue(ruleDlg.action, param.key)) }}</div>
                    </template>
                    <input v-else-if="param.type === 'number'" class="input cfg-mono input-w-num" type="number" step="any"
                           :value="actParamValue(ruleDlg.action, param.key)"
                           @input="setActParam(ruleDlg.action, param.key, $event.target.value === '' ? '' : Number($event.target.value))"
                           :placeholder="param.placeholder">
                    <input v-else class="input cfg-mono" type="text"
                           :value="actParamValue(ruleDlg.action, param.key)"
                           @input="setActParam(ruleDlg.action, param.key, $event.target.value)"
                           :placeholder="param.placeholder">
                    <div v-if="param.desc" class="cfg-hint">{{ param.desc }}</div>
                  </div>
                </div>
                <div v-else-if="actionMeta(ruleDlg.action.atype) && actionMeta(ruleDlg.action.atype).params.length === 0"
                     class="cfg-hint">此動作不需要參數</div>
              </div>

              <div class="cfg-modedlg-actions">
                <button class="btn-pill" @click="ruleDlg.open = false">取消</button>
                <button class="btn-pill" @click="ruleDlg.step = 1">← 上一步</button>
                <button class="btn-pill cfg-modedlg-confirm"
                        :disabled="!!ruleDlgEventClash"
                        @click="confirmRuleDlg">確認建立</button>
              </div>
            </template>
          </div>
        </div>
        </div><!-- /cfg-rules-section-puzzle -->

        <!-- §4.5/§4.10:棄牌條件 專屬簡單清單(SOFT;HARD 僅 round-trip 不呈現)-->
        <div v-show="rulesSection === 'discard'" class="cfg-rules-section cfg-rules-section-discard" style="display:flex;flex-direction:column;height:100%;min-height:0;">
          <div class="cfg-form-header" style="flex-shrink:0;">
            <div class="cfg-form-title">🗑 棄牌條件 <span class="sym-info sym-info-below" data-tip="符合條件的盤面生成後會被主動排除,並列入棄牌率計算。舊檔 HARD(風控)棄牌僅保留匯出,不在此清單編輯。">ⓘ</span></div>
            <div class="cfg-form-sub">符合條件時該局棄牌(SOFT:仍計入但獨立追蹤)。純靜態描述,執行交下游模擬工具。</div>
          </div>
          <div class="cfg-genlimits-head" style="flex-shrink:0;">
            <div class="cfg-genlimits-count">共 {{ softDiscardItems.length }} 條</div>
            <button class="btn-pill add" @click="openDiscardDlg(-1)">＋ 新增棄牌條件</button>
          </div>
          <div v-if="!softDiscardItems.length" class="cfg-genlimits-empty">
            尚無棄牌條件。符合條件的盤面會被主動排除(列入棄牌率)。按「＋ 新增棄牌條件」開始。
          </div>
          <div v-else class="cfg-gc-list" style="overflow:auto;">
            <div v-for="x in softDiscardItems" :key="x.d.discard_id || x.idx" class="cfg-gc-row" :class="{ 'cfg-dc-off': x.d.enabled === false }">
              <input type="checkbox" class="cfg-dc-sw" v-model="x.d.enabled" title="啟用 / 停用此棄牌條件">
              <span class="cfg-gc-text">{{ x.d.condition || '(空條件)' }}</span>
              <span style="flex:1"></span>
              <span class="cfg-dc-reason">原因:{{ x.d.notes || '（未填）' }}</span>
              <button class="cfg-gc-act" @click="openDiscardDlg(x.idx)" title="編輯">✎</button>
              <button class="cfg-gc-act" @click="dupDiscardRow(x.idx)" title="複製">⧉</button>
              <button class="cfg-gc-act danger" @click="removeDiscardRow(x.idx)" title="刪除">🗑</button>
            </div>
          </div>

          <!-- §4.10 棄牌條件 modal(條件 + 原因)-->
          <div v-if="discardDlg.open" class="cfg-gc-overlay" @click.self="closeDiscardDlg()">
            <div class="cfg-gc-modal">
              <h3 class="cfg-gc-modal-title">{{ discardDlg.editIdx >= 0 ? '編輯' : '新增' }}棄牌條件</h3>
              <div class="cfg-gc-frow">
                <label class="cfg-gc-fl">棄牌條件</label>
                <input class="cfg-dc-input" type="text" v-model="discardDlg.condition" placeholder="圖示數量 = 2 的盤" />
              </div>
              <div class="cfg-gc-frow">
                <label class="cfg-gc-fl">原因</label>
                <input class="cfg-dc-input" type="text" v-model="discardDlg.reason" placeholder="假期待預報過多" />
              </div>
              <div class="cfg-gc-modal-btns">
                <button class="cfg-gc-btn" @click="closeDiscardDlg()">取消</button>
                <button class="cfg-gc-btn pro" :disabled="!discardDlg.condition.trim()" @click="confirmDiscardDlg()">{{ discardDlg.editIdx >= 0 ? '儲存' : '新增' }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ 子分頁:模式(賠付橫幅 + 模式定義 + 玩法;原 01_Global 賠付/起始模式 + 11_Mode_Config)═══ -->
        <div v-show="rulesSection === 'modes'" class="cfg-rules-section cfg-rules-section-modes">


          <!-- 模式定義(原 01_Global col-modes / 11_Mode_Config)-->
          <div class="cfg-rules-modes-body">
          <!-- 區塊 3:模式定義(v3.1 合併自 11_Mode_Config) -->
        <div class="cfg-section">
          <div class="cfg-section-title">模式定義</div>

          <div class="cfg-field">
            <label class="cfg-label">
              起始模式 <span class="cfg-key">starting_mode</span>
            </label>
            <div v-if="modeNames.length > 0" class="cfg-chip-row">
              <button v-for="m in modeNames" :key="m"
                      class="cfg-chip"
                      :class="{ active: g.starting_mode === m }"
                      @click="g.starting_mode = m">{{ m }}</button>
            </div>
            <input v-else class="input input-w-id" type="text" v-model.trim="g.starting_mode" placeholder="NG">
            <div v-if="modeNames.length > 0 && !modeNames.includes(g.starting_mode)" class="cfg-warn">
              ⚠ 「{{ g.starting_mode }}」不在下方模式清單中,模擬將會失敗
            </div>
            <div class="cfg-hint">
              選擇模擬開局時的模式;從下方「模式清單」選一個
            </div>
          </div>

          <!-- ── 模式清單(從 11_Mode_Config 整段搬過來;v8.14 #1:對應備註自 UI 移除)── -->
          <div class="cfg-modes-list">
            <!-- G-9:符號池操作 Target 提示(規則頁專屬 datalist,不跨頁依賴)。 -->
            <datalist id="symbolOpTargets">
              <option v-for="h in SYMBOL_TARGET_HINTS" :key="h" :value="h"></option>
            </datalist>
            <!-- G-4:Hold&Win 連結彩池提示(規則頁專屬 datalist)。 -->
            <datalist id="holdWinJackpots">
              <option v-for="h in HOLD_WIN_JACKPOT_HINTS" :key="h" :value="h"></option>
            </datalist>
            <div v-for="(m, idx) in modes" :key="modeCardKey(m)" class="cfg-mode-card"
                 :class="{ 'is-duplicate': duplicateNames.has(m.mode) && m.mode,
                           'is-collapsed': !isModeExpanded(m) }">

              <!-- v5.0-d:摘要列(預設收合;點擊展開編輯)-->
              <div class="cfg-mode-summary cfg-reveal-zone" @click="toggleModeExpanded(m)"
                   :title="isModeExpanded(m) ? '點擊收合' : '點擊展開編輯'">
                <span class="cfg-mode-summary-caret">{{ isModeExpanded(m) ? '▾' : '▸' }}</span>
                <span class="cfg-mode-summary-name"
                      :class="{ err: !m.mode.trim() || (duplicateNames.has(m.mode) && m.mode) }">
                  {{ m.mode || '(未命名)' }}</span>
                <span v-if="g.starting_mode === m.mode && m.mode" class="cfg-mode-summary-badge start" title="起始模式">起始</span>
                <span class="cfg-mode-summary-meta">局數 {{ m.spin_count }}</span>
                <span class="cfg-mode-summary-trigger" :title="m.trigger_condition || '無觸發條件'">
                  {{ m.trigger_condition || '無條件' }}</span>
                <span v-if="!m.mode.trim() || duplicateNames.has(m.mode)" class="cfg-mode-summary-warn" title="名稱為空或重複">⚠</span>
                <span class="cfg-mode-summary-spacer"></span>
                <button class="cfg-mode-delete-btn cfg-reveal"
                        @click.stop="removeMode(idx)"
                        :disabled="modes.length <= 1"
                        :title="modes.length <= 1 ? '至少需要保留一個模式' : '刪除此模式'">✕</button>
              </div>

              <div v-show="isModeExpanded(m)" class="cfg-mode-card-expand">

              <!-- 卡片頂部:模式名稱 -->
              <div class="cfg-mode-card-header">
                <div class="cfg-mode-name-wrap">
                  <label class="cfg-mode-name-label">模式名稱</label>
                  <input class="input cfg-mode-name-input input-w-id"
                         :class="{ err: !m.mode.trim() || (duplicateNames.has(m.mode) && m.mode) }"
                         :value="m.mode"
                         @focus="$event.target.dataset.oldName = m.mode"
                         @change="renameMode(idx, $event.target.dataset.oldName, $event.target.value)"
                         @keyup.enter="$event.target.blur()"
                         placeholder="NG"
                         maxlength="20">
                </div>
              </div>

              <div v-if="!m.mode.trim()" class="cfg-warn cfg-warn-inline">⚠ 模式名稱不能為空</div>
              <div v-else-if="duplicateNames.has(m.mode)" class="cfg-warn cfg-warn-inline">
                ⚠ 模式名稱「{{ m.mode }}」與其他模式重複
              </div>

              <!-- 卡片內容：壓縮 3 欄 grid + 可折疊的觸發條件 -->
              <div class="cfg-mode-card-body">

                <div class="cfg-mode-grid3">
                  <div class="cfg-field cfg-field-compact">
                    <label class="cfg-label">
                      局數 <span class="cfg-key">spin_count</span>
                    </label>
                    <input class="input input-center input-w-num" type="number" min="0" v-model.number="m.spin_count">
                    <div class="cfg-hint">0 = 無限 / FG 通常 10–15</div>
                  </div>

                  <div class="cfg-field cfg-field-compact">
                    <label class="cfg-label">
                      繼承全域 <span class="cfg-key">inherit_globals</span>
                    </label>
                    <div class="cfg-chip-row">
                      <button class="cfg-chip" :class="{ active: m.inherit_globals === false }"
                              @click="m.inherit_globals = false">否</button>
                      <button class="cfg-chip" :class="{ active: m.inherit_globals === true }"
                              @click="m.inherit_globals = true">是</button>
                    </div>
                  </div>

                  <div class="cfg-field cfg-field-compact">
                    <label class="cfg-label">備註 <span class="cfg-key">notes</span></label>
                    <input class="input" type="text" v-model.trim="m.notes" placeholder="10 局免費">
                  </div>
                </div>

                <!-- trigger_condition：可折疊 -->
                <details class="cfg-mode-trigger-details">
                  <summary class="cfg-mode-trigger-summary">
                    🧩 觸發條件 <span class="cfg-key">trigger_condition</span>
                    <span class="cfg-mode-trigger-preview" v-if="m.trigger_condition">{{ m.trigger_condition }}</span>
                    <span class="cfg-mode-trigger-empty" v-else>(空 = 無條件，NG 用)</span>
                  </summary>
                  <div class="cfg-puzzle-section" style="margin-top:8px;">
                    <span style="display:none">{{ modeCond.ensure(m), '' }}</span>
                    <div class="cfg-puzzle-header">
                      <span class="cfg-puzzle-title">🧩 觸發條件 <span class="cfg-key">trigger_condition</span></span>
                      <div class="cfg-puzzle-mode-toggle">
                        <button class="cfg-chip cfg-chip-sm"
                                :class="{ active: (condBuilderState.mode[modeCond.key(m)] || 'builder') !== 'raw' }"
                                @click="modeCond.setMode(m, 'builder')">🧩 拼圖</button>
                        <button class="cfg-chip cfg-chip-sm"
                                :class="{ active: condBuilderState.mode[modeCond.key(m)] === 'raw' }"
                                @click="modeCond.setMode(m, 'raw')">⌨ 原始</button>
                      </div>
                    </div>

                    <!-- 拼圖模式 -->
                    <div v-if="(condBuilderState.mode[modeCond.key(m)] || 'builder') !== 'raw'" class="cfg-puzzle-body">
                      <div v-if="!condBuilderState.rows[modeCond.key(m)] || condBuilderState.rows[modeCond.key(m)].length === 0"
                           class="cfg-puzzle-empty">尚無條件;按下方按鈕新增第一片(NG 模式可留空)</div>

                      <div v-else class="cfg-puzzle-rows">
                        <template v-for="(row, ri) in condBuilderState.rows[modeCond.key(m)]" :key="ri">
                          <div v-if="ri > 0" class="cfg-puzzle-combinator">
                            <button class="cfg-chip cfg-chip-sm"
                                    :class="{ active: row.combinator === 'AND' }"
                                    @click="row.combinator = 'AND'; modeCond.rebuild(m)">AND</button>
                            <button class="cfg-chip cfg-chip-sm"
                                    :class="{ active: row.combinator === 'OR' }"
                                    @click="row.combinator = 'OR'; modeCond.rebuild(m)">OR</button>
                          </div>

                          <div class="cfg-puzzle-row">
                            <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                              <label class="cfg-puzzle-piece-label">變數</label>
                              <select class="cfg-puzzle-select"
                                      :value="row.category"
                                      @change="modeCond.changeCat(m, ri, $event.target.value)">
                                <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ varCatLabel(cat.id) }}</option>
                              </select>
                            </div>

                            <div v-if="rowCategoryMeta(row).needsSubkey" class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                              <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(row).subkeyHint }}</label>
                              <select v-if="rowCategoryMeta(row).subkeySource === 'symbols' && symbolNames.length > 0"
                                      class="cfg-puzzle-select"
                                      v-model="row.subkey"
                                      @change="modeCond.rebuild(m)">
                                <option value="">(選擇)</option>
                                <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                              </select>
                              <input v-else
                                     class="cfg-puzzle-input cfg-mono"
                                     type="text"
                                     v-model.trim="row.subkey"
                                     @input="modeCond.rebuild(m)"
                                     :placeholder="rowCategoryMeta(row).subkeyHint">
                            </div>

                            <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                              <label class="cfg-puzzle-piece-label">運算</label>
                              <select class="cfg-puzzle-select cfg-puzzle-op"
                                      v-model="row.op"
                                      @change="modeCond.rebuild(m)">
                                <option v-for="o in OP_TYPES" :key="o" :value="o">{{ opLabel(o) }}</option>
                              </select>
                            </div>

                            <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                              <label class="cfg-puzzle-piece-label">值</label>
                              <select v-if="rowCategoryMeta(row).valueType === 'mode' && modeNames.length > 0"
                                      class="cfg-puzzle-select"
                                      v-model="row.value"
                                      @change="modeCond.rebuild(m)">
                                <option v-for="mn in modeNames" :key="mn" :value="mn">{{ mn }}</option>
                              </select>
                              <input v-else-if="rowCategoryMeta(row).valueType === 'number'"
                                     class="cfg-puzzle-input cfg-mono"
                                     type="number" step="any"
                                     v-model="row.value"
                                     @input="modeCond.rebuild(m)"
                                     placeholder="0">
                              <input v-else
                                     class="cfg-puzzle-input cfg-mono"
                                     type="text"
                                     v-model.trim="row.value"
                                     @input="modeCond.rebuild(m)"
                                     placeholder="值">
                            </div>

                            <button class="cfg-puzzle-row-del"
                                    @click="modeCond.removeRow(m, ri)"
                                    title="移除此片拼圖">✕</button>
                          </div>
                        </template>
                      </div>

                      <div class="cfg-puzzle-add">
                        <button v-if="!condBuilderState.rows[modeCond.key(m)] || condBuilderState.rows[modeCond.key(m)].length === 0"
                                class="cfg-mode-add-btn cfg-puzzle-add-btn"
                                @click="modeCond.addRow(m, 'AND')">
                          <span style="font-size: 14px;">+</span>
                          <span>新增第一片條件</span>
                        </button>
                        <template v-else>
                          <button class="cfg-puzzle-add-and" @click="modeCond.addRow(m, 'AND')">+ AND 條件</button>
                          <button class="cfg-puzzle-add-or" @click="modeCond.addRow(m, 'OR')">+ OR 條件</button>
                        </template>
                      </div>

                      <div class="cfg-puzzle-dsl">
                        <span class="cfg-puzzle-dsl-label">生成的 DSL:</span>
                        <code class="cfg-puzzle-dsl-code">{{ m.trigger_condition || '(空 = NG 用,無條件進入)' }}</code>
                      </div>
                    </div>

                    <!-- 原始模式 -->
                    <div v-else class="cfg-puzzle-body">
                      <input class="input cfg-mono cfg-puzzle-raw-input"
                             type="text"
                             v-model.trim="m.trigger_condition"
                             placeholder="留空表示無觸發條件(NG 用)">
                      <div v-if="condBuilderState.error[modeCond.key(m)]" class="cfg-warn cfg-warn-inline">
                        ⚠ {{ condBuilderState.error[modeCond.key(m)] }}
                      </div>
                    </div>
                    <!-- ── #5 釘到 inspector ── -->
                    <div class="cfg-puzzle-pin">
                      <button class="cfg-puzzle-pin-btn"
                              :class="{ active: pinnedTest && pinnedTest.kind === 'mode' && pinnedTest.id === m.mode }"
                              @click="pinTest('mode', m.mode, m.mode)"
                              :disabled="!m.mode"
                              title="把這個模式的 trigger 條件釘到右下角的測試檢查器,即時看評估結果">
                        <span>🧪</span>
                        <span v-if="pinnedTest && pinnedTest.kind === 'mode' && pinnedTest.id === m.mode">已釘住 — 看右下測試檢查器</span>
                        <span v-else>釘到測試檢查器</span>
                      </button>
                    </div>
                  </div>

                  <div class="cfg-field cfg-field-compact" style="margin-top:8px;">
                    <label class="cfg-label">
                      進入時重置變數 <span class="cfg-key">on_enter_reset_vars</span>
                    </label>
                    <input class="input" type="text"
                           v-model.trim="m.on_enter_reset_vars"
                           placeholder="逗號分隔,例:fg_combo_count">
                    <div class="cfg-hint">進入此模式時要歸零的 spin_locals 變數名</div>
                  </div>
                </details><!-- /trigger_condition details -->

                <!-- v7.10:玩法設定(reset_scope + trigger_pays;additive 接線,引擎尚未消費)-->
                <div class="cfg-section cfg-section-card cfg-mode-gameplay"
                     :class="{ 'is-empty': !modeGpHasContent(m), 'is-closed': !isModeGpOpen(m) }">
                  <div class="cfg-section-title cfg-card-head" @click="toggleModeGp(m)">
                    <span class="cfg-section-title-text">玩法設定 <span class="cfg-key">11_Mode_Config</span></span>
                    <span v-if="!isModeGpOpen(m)" class="cfg-card-summary">
                      <span v-if="modeGpSummary(m)" class="cfg-card-summary-chip">{{ modeGpSummary(m) }}</span>
                      <span v-else class="cfg-card-summary-muted">未設定</span>
                    </span>
                    <span class="cfg-card-caret" :class="{ open: isModeGpOpen(m) }" title="展開 / 收合">›</span>
                  </div>
                  <div v-show="isModeGpOpen(m)" class="cfg-card-body">
                  <!-- v8.14 #1:「描述用…不計算 RTP」備註自 UI 移除(定位資訊由欄位 hint 承載) -->

                  <!-- v7.14:玩法種類(SPIN=旋轉;WHEEL/PICK/COLLECTION=bonus 小遊戲)-->
                  <div class="cfg-field" style="margin-top:8px;">
                    <label class="cfg-label">玩法種類 <span class="cfg-key">mode_kind</span></label>
                    <select class="input input-w-name" v-model="m.mode_kind">
                      <option v-for="opt in MODE_KIND_OPTIONS" :key="opt.v" :value="opt.v">{{ opt.label }}</option>
                    </select>
                    <div class="cfg-hint">選 WHEEL/PICK/COLLECTION 時,下方改設定 bonus 小遊戲獎項;何時觸發進入本模式仍由上方 trigger_condition 決定。</div>
                  </div>

                  <!-- SPIN 專屬:倍數 / 封頂 / 觸發給付(非 SPIN 時整區灰示不適用)-->
                  <div class="cfg-mode-spin-fields" :class="{ 'cfg-kind-na': isBonusKind(m) }">
                  <div v-if="isBonusKind(m)" class="cfg-hint cfg-kind-na-note">此玩法為 bonus 小遊戲,以下旋轉相關設定不適用。</div>

                  <template v-if="modeSectionOn(m, 'multipliers')">
                  <div class="cfg-field" style="margin-top:8px;">
                    <label class="cfg-label">倍數重置範圍 <span class="cfg-key">reset_scope</span>
                      <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'multipliers')" title="從卡片隱藏，值保留">隱藏</button>
                    </label>
                    <select class="input input-w-name" v-model="m.reset_scope">
                      <option v-for="opt in RESET_SCOPE_OPTIONS" :key="opt.v" :value="opt.v">{{ opt.label }}</option>
                    </select>
                    <div class="cfg-hint">此模式的進度/累積倍數重置時機;空白 = 繼承 15_Multipliers 的全域設定。</div>
                  </div>

                  <div class="cfg-field" style="margin-top:8px;">
                    <label class="cfg-label">倍數疊加方式 <span class="cfg-key">stack_mode</span></label>
                    <select class="input input-w-name" v-model="m.stack_mode">
                      <option v-for="opt in STACK_MODE_OPTIONS" :key="opt.v" :value="opt.v">{{ opt.label }}</option>
                    </select>
                    <div class="cfg-hint">此模式多倍數的疊加方式;空白 = 繼承全域。優先序:符號 &gt; 模式 &gt; 全域。</div>
                  </div>

                  <div class="cfg-field" style="margin-top:8px;">
                    <label class="cfg-label">封頂 / 上限 <span class="cfg-key">cap</span></label>
                    <div class="cfg-mode-cap-row">
                      <label class="cfg-check">
                        <input type="checkbox" :checked="m.cap_enabled === 'Y'"
                               @change="m.cap_enabled = $event.target.checked ? 'Y' : ''">
                        <span>有封頂</span>
                      </label>
                      <input class="input input-w-name" type="text" v-model="m.cap_value"
                             :disabled="m.cap_enabled !== 'Y'" placeholder="例:5,000×(可含區間)">
                    </div>
                    <div class="cfg-hint">此模式的贏分上限(規格書描述用);空白 = 不封頂。</div>
                  </div>
                  </template>

                  <!-- trigger_pays：不進 enabled_sections；沿用既有 spin-fields 顯示 -->
                  <div class="cfg-mode-tp">
                    <div class="cfg-label" style="margin-bottom:4px;">
                      觸發給付 <span class="cfg-key">trigger_pays</span>
                      <span class="cfg-hint" style="margin-left:6px;">scatter 數達標即付(非連線賠付),例:4/5/6 SCATTER → 5×/20×/100×</span>
                    </div>
                    <div v-if="(m.trigger_pays || []).length === 0" class="cfg-hint" style="margin:4px 0;">尚無觸發給付,按下方「+ 新增觸發給付」開始。</div>
                    <div v-for="(tp, ti) in m.trigger_pays" :key="'tp'+ti" class="cfg-mode-tp-row cfg-reveal-zone">
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">scatter 數</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="tp.scatter_count">
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">給付 ×注額</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="tp.pay">
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">給予免費局</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="tp.grants_spins">
                      </div>
                      <button class="cfg-mode-delete-btn cfg-reveal" @click="removeTriggerPay(m, ti)" title="刪除此列">✕</button>
                    </div>
                    <button class="cfg-mode-add-btn cfg-bonus-item-add cfg-btn-inline" @click="addTriggerPay(m)">
                      <span style="font-size:14px">+</span> 新增觸發給付
                    </button>
                  </div>
                  <!-- ── G-9:符號池操作(deck-thinning / 符號值升級;對接 CONVERT,執行歸下游)── -->
                  <div class="cfg-mode-tp">
                    <div class="cfg-label" style="margin-bottom:4px;">
                      符號池操作 <span class="cfg-key">symbol_ops</span>
                      <span class="cfg-hint" style="margin-left:6px;">feature 中移除符號（deck-thinning）或符號值升級；純描述，執行交下游</span>
                    </div>
                    <div v-if="(m.symbol_ops || []).length === 0" class="cfg-hint" style="margin:4px 0;">尚無符號池操作，按下方「+ 新增符號池操作」開始。</div>
                    <div v-for="(so, si) in m.symbol_ops" :key="'so' + si" class="cfg-mode-tp-row cfg-reveal-zone" style="flex-wrap:wrap;">
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">操作</span>
                        <select class="input input-w-name" v-model="so.op">
                          <option v-for="o in SYMBOL_OP_OPTIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
                        </select>
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">目標</span>
                        <input class="input input-w-id cfg-mono" type="text" list="symbolOpTargets" v-model.trim="so.target" placeholder="lowest / by_id:H1">
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">數量</span>
                        <input class="input input-w-num input-center cfg-mono" type="text" v-model.trim="so.count" placeholder="1">
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">豁免</span>
                        <input class="input input-w-id cfg-mono" type="text" v-model.trim="so.immune" placeholder="WILD,SCATTER">
                      </div>
                      <div class="cfg-mode-tp-cell">
                        <span class="cfg-mode-tp-lbl">觸發</span>
                        <input class="input input-w-id cfg-mono" type="text" v-model.trim="so.trigger" placeholder="on_win / SCAT">
                      </div>
                      <div class="cfg-mode-tp-cell cfg-bf-cell-grow">
                        <span class="cfg-mode-tp-lbl">備註</span>
                        <input class="input input-w-name" type="text" v-model.trim="so.notes" placeholder="移除最低符 / 寶石升級">
                      </div>
                      <button class="cfg-mode-delete-btn cfg-reveal" @click="removeSymbolOp(m, si)" title="刪除此列">✕</button>
                    </div>
                    <button class="cfg-mode-add-btn cfg-bonus-item-add cfg-btn-inline" @click="addSymbolOp(m)">
                      <span style="font-size:14px">+</span> 新增符號池操作
                    </button>
                  </div>
                  </div><!-- /cfg-mode-spin-fields -->

                  <!-- v8.5 / R3:玩家擇一 + Hold&Win Respin(所有玩法種類皆適用;規格描述,引擎不消費)-->
                  <div class="cfg-mode-r3-fields">
                    <div v-if="modeSectionOn(m, 'choice_group')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">玩家擇一組(可選) <span class="cfg-key">choice_group</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'choice_group')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <input class="input input-w-name cfg-mono" type="text" placeholder="—"
                             v-model.trim="m.choice_group"
                             title="同組名的模式=玩家擇一進入(二選一/三選一 FS;Dog House / Moon Princess)">
                      <div class="cfg-hint">觸發時由玩家在同組模式中選一個進入;留空 = 一般模式。同組需至少 2 個模式。</div>
                    </div>
                    <div v-if="modeSectionOn(m, 'hold_win')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">鎖點重轉(可選) <span class="cfg-key">Hold&Win Respin / respin_base</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'hold_win')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span class="cfg-bonus-ilabel">初始局數</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="m.respin_base">
                        <span class="cfg-bonus-ilabel">重置條件</span>
                        <select class="input" v-model="m.respin_reset_on" :disabled="!(Number(m.respin_base) > 0)">
                          <option value="">（未指定）</option>
                          <option value="NEW_SYMBOL">落新符號重置</option>
                          <option value="ANY_WIN">任何中獎重置</option>
                          <option value="NEVER">不重置</option>
                        </select>
                      </div>
                      <input class="input" type="text" style="margin-top:6px;" placeholder="停止條件（自由描述:盤面填滿 / SEVEN 出現…）"
                             v-model.trim="m.respin_stop_cond" :disabled="!(Number(m.respin_base) > 0)">
                      <div class="cfg-hint">符號落地即鎖、respin 計數的 Hold&Win 描述(Money Train / Lucky Wagon);0 = 未啟用。開放式停止條件(Toro「直到某符號出現」)寫在停止條件欄。</div>
                      <!-- ── G-4:hold-and-win / cash-on-reels 新欄(觸發符 / 持久值 / 收集規則 / 連結彩池)── -->
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px;">
                        <span class="cfg-bonus-ilabel">觸發/收集符</span>
                        <input class="input input-w-id cfg-mono" type="text" v-model.trim="m.hw_trigger_symbol" placeholder="COIN / BAMBOO" title="被鎖/收集的符號(金幣符)">
                        <label style="display:flex; align-items:center; gap:4px;">
                          <input type="checkbox" v-model="m.hw_persist_value">
                          <span class="cfg-bonus-ilabel" style="margin:0;">持久格值</span>
                        </label>
                      </div>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;">
                        <span class="cfg-bonus-ilabel">連結彩池</span>
                        <input class="input input-w-id cfg-mono" type="text" list="holdWinJackpots" v-model.trim="m.hw_link_jackpot" placeholder="GRAND / MAJOR" title="連結 19_Jackpot_Tiers 的級距;下游解析">
                      </div>
                      <input class="input" type="text" style="margin-top:6px;" placeholder="收集/結算規則(自由描述:填滿全付 / 達標升級 jackpot…)"
                             v-model.trim="m.hw_collect_rule">
                      <div class="cfg-hint">cash-on-reels / 金幣機描述:持久格值＝金額常駐(Big Bamboo / Cashman Bingo);連結彩池＝收集達標升級級距。純描述,對接 STICKY/PAY/COLLECT,執行交下游。</div>
                    </div>
                    <!-- v8.24 / G5:結構化結束謂詞(生存局 / 條件式結束;與上方自由文字停止條件並存)-->
                    <div class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">結束條件(結構化,可選) <span class="cfg-key">end_condition</span></label>
                      <input class="input cfg-mono" type="text" v-model.trim="m.end_condition"
                             placeholder="respins_left == 0 / symbol_count.SEVEN >= 1 …">
                      <div class="cfg-hint">生存局 / 條件式結束的結構化謂詞(White Rabbit 活到某條件、Toro 直到某符號)；拼圖層可用「結束 feature（END_FEATURE）」動作連動。與上方自由文字停止條件並存;純描述,判定交下游。</div>
                    </div>
                    <!-- v8.7 / R6 A-2:per-mode 賠付模型覆寫(規格描述) -->
                    <div v-if="modeSectionOn(m, 'pay_type')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">賠付模型覆寫(可選) <span class="cfg-key">pay_type_override</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'pay_type')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <select class="input input-w-name" v-model="m.pay_type_override">
                        <option value="">（繼承全域）</option>
                        <option value="LINE">LINE（固定中獎線）</option>
                        <option value="WAYS">WAYS（相鄰全路徑）</option>
                        <option value="SCATTER">SCATTER（任意位置散佈）</option>
                        <option value="CLUSTER">CLUSTER（相鄰成群）</option>
                      </select>
                      <div class="cfg-hint">混賠付模型遊戲用（NG 走 LINE、FG 走 SCATTER 等）；留空 = 沿用全域賠付模型。純描述,計分實作歸下游。</div>
                    </div>
                    <!-- v8.28 / 缺口B:解鎖前提(需先解鎖哪些模式才可進入;與擇一正交) -->
                    <div class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">解鎖前提(可選) <span class="cfg-key">unlock_requires</span></label>
                      <div v-if="modeNames.filter(x => x !== m.mode).length" class="cfg-chip-row">
                        <button v-for="nm in modeNames.filter(x => x !== m.mode)" :key="'ulk'+m.mode+nm"
                                class="cfg-chip cfg-chip-sm"
                                :class="{ active: modeUnlockHas(m, nm) }"
                                @click="modeUnlockToggle(m, nm)">{{ nm }}</button>
                      </div>
                      <div v-else class="cfg-hint">尚無其他模式可作為前提。</div>
                      <div class="cfg-hint">此模式需先「玩過 / 解鎖」勾選的模式才可進入（漸進解鎖 FS，如 Immortal Romance 密室鏈）。與「玩家擇一」正交（擇一＝互斥選擇；前提＝進入門檻）。空＝無前提。純描述,交下游遵循。</div>
                    </div>
                    <!-- v8.28 / 缺口C:此模式的跨來源倍數複合覆寫 -->
                    <div v-if="modeSectionOn(m, 'mult_compose')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">倍數複合覆寫(可選) <span class="cfg-key">mult_compose_override</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'mult_compose')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <select class="input input-w-name" v-model="m.mult_compose_override">
                        <option value="">（沿用全域）</option>
                        <option value="MUL">相乘</option>
                        <option value="ADD">相加</option>
                        <option value="MAX">取最高</option>
                      </select>
                      <div class="cfg-hint">此模式的多來源倍數複合方式;留空 = 沿用全域「跨來源倍數複合」設定。純描述,計分實作歸下游。</div>
                    </div>
                    <!-- v8.39 / GAP-F1:此模式的補盤軌道覆寫 -->
                    <div v-if="modeSectionOn(m, 'refill_track')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">補盤路徑覆寫(可選) <span class="cfg-key">refill_track_override</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'refill_track')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <select class="input input-w-name" v-model="m.refill_track_override">
                        <option value="">（沿用全域）</option>
                        <option v-for="to in trackOptions" :key="'rto'+to.value" :value="to.value">{{ to.label }}</option>
                        <option v-if="isOrphanTrackRef(m.refill_track_override)" :value="m.refill_track_override">{{ m.refill_track_override }}（⚠ 軌道不存在）</option>
                      </select>
                      <div class="cfg-hint">此模式的補盤軌道;留空 = 沿用全域「補盤路徑」。軌道於 02_Layout 頁定義。</div>
                    </div>

                    <!-- 架構檢閱 #6:消除連鎖(Cascade / Tumble)結構化宣告 -->
                    <div v-if="modeSectionOn(m, 'cascade')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">消除連鎖(Cascade)<span class="cfg-key">cascade_enabled</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'cascade')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <div class="cfg-chip-row">
                        <button class="cfg-chip cfg-chip-sm" :class="{ active: m.cascade_enabled === true }"
                                @click="m.cascade_enabled = true">開</button>
                        <button class="cfg-chip cfg-chip-sm" :class="{ active: m.cascade_enabled !== true }"
                                @click="m.cascade_enabled = false">關</button>
                      </div>
                      <div v-if="m.cascade_enabled" class="cfg-field" style="margin-top:6px;">
                        <label class="cfg-label">連鎖深度上限覆寫(可選) <span class="cfg-key">cascade_max_depth</span></label>
                        <input class="input input-sm cfg-mono" type="number" min="0" step="1"
                               v-model.number="m.cascade_max_depth" style="width:100px;" placeholder="0">
                        <div class="cfg-hint">0 = 沿用全域「連鎖深度上限」(01_Global.max_chain_depth)。</div>
                      </div>
                      <div class="cfg-hint">此模式是否走消除掉落 / 補位連鎖迴圈(Cascading / Tumbling / Avalanche)。實際消除規則(何時消除、如何補位)仍以「規則」頁的 BOARD_DESTROY / BOARD_FILL 拼圖規則為準;此旗標只是讓文件與下游一眼確認遊戲類型,不取代規則。</div>
                    </div>

                    <!-- v8.22 / G3:Hold&Win 設定面(常見收集玩法走設定;罕見互動走 G1 拼圖)-->
                    <div v-if="modeSectionOn(m, 'collect')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">Hold&amp;Win 收集設定 <span class="cfg-key">collect_*</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'collect')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <div class="cfg-collect-grid">
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">收集型 <span class="cfg-key">collect_enabled</span></span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.collect_enabled === true }"
                                    @click="m.collect_enabled = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.collect_enabled !== true }"
                                    @click="m.collect_enabled = false">關</button>
                          </div>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">重置符號 <span class="cfg-key">respin_reset_symbol</span></span>
                          <select class="input input-w-id" v-model="m.respin_reset_symbol">
                            <option value="">（依重置條件）</option>
                            <option v-for="s in symbolNames" :key="'rrs'+s" :value="s">{{ s }}</option>
                          </select>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">收集中擴張 <span class="cfg-key">grid_expand_in_collect</span></span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.grid_expand_in_collect === true }"
                                    @click="m.grid_expand_in_collect = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.grid_expand_in_collect !== true }"
                                    @click="m.grid_expand_in_collect = false">關</button>
                          </div>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">允許 persistent <span class="cfg-key">allow_persistent</span></span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.allow_persistent === true }"
                                    @click="m.allow_persistent = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: m.allow_persistent !== true }"
                                    @click="m.allow_persistent = false">關</button>
                          </div>
                        </div>
                      </div>
                      <div class="cfg-hint">Hold&amp;Win 常見收集玩法用此設定描述；落「重置符號」補回合、收集中可擴張盤面、允許 persistent 規則每回合重跑。純描述,執行交下游。</div>
                    </div>
                  </div>

                  <!-- v7.14:bonus 小遊戲編輯器(mode_kind != SPIN)-->
                  <div v-if="isBonusKind(m)" class="cfg-mode-minigame">
                    <div v-if="m.mode_kind === 'WHEEL' && modeSectionOn(m, 'wheel')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">升級目標 <span class="cfg-key">wheel_upgrade_to</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'wheel')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <select class="input input-w-name" v-model="m.wheel_upgrade_to">
                        <option value="">（無升級）</option>
                        <option v-for="wt in modeWheelTargets(m)" :key="wt.mode" :value="wt.mode">{{ wt.mode }}</option>
                      </select>
                      <div class="cfg-hint">轉到特定分段時升級到另一個 WHEEL 模式;空 = 無升級。目標必須也是 WHEEL 玩法。</div>
                    </div>
                    <div v-if="m.mode_kind === 'PICK' && modeSectionOn(m, 'pick')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">抽選次數 <span class="cfg-key">pick_count</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'pick')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="m.pick_count">
                      <div class="cfg-hint">可抽選的次數;0 = 抽到「結束」項為止。</div>
                    </div>
                    <div v-if="m.mode_kind === 'COLLECTION' && modeSectionOn(m, 'collect_target')" class="cfg-field" style="margin-top:8px;">
                      <label class="cfg-label">收集目標 <span class="cfg-key">collect_target</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'collect_target')" title="從卡片隱藏，值保留">隱藏</button>
                      </label>
                      <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="m.collect_target">
                      <div class="cfg-hint">達到此累積量即完成收集。</div>
                    </div>

                    <div v-if="modeSectionOn(m, 'bonus_items')" class="cfg-bonus-items" style="margin-top:8px;">
                      <div class="cfg-bonus-items-title">
                        {{ m.mode_kind === 'WHEEL' ? '輪盤分段' : m.mode_kind === 'PICK' ? '獎項池' : '收集獎勵' }}
                        <span v-if="modeExpected(m) != null && modeExpected(m) > 0" class="cfg-bonus-ev">期望 ×{{ modeExpected(m).toFixed(2) }}</span>
                        <button type="button" class="cfg-mode-sec-rm" @click="modeSectionRemove(m, 'bonus_items')" title="從卡片隱藏，值保留">隱藏</button>
                      </div>
                      <div v-if="(m.items || []).length === 0" class="cfg-hint" style="margin:4px 0;">尚無獎項,按下方「+ 新增獎項」開始。</div>
                      <div v-for="(it, ii) in m.items" :key="'mi'+ii" class="cfg-bonus-item-row cfg-reveal-zone">
                        <input class="input input-w-id" type="text" v-model.trim="it.label" placeholder="標籤">
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">{{ m.mode_kind === 'COLLECTION' ? '門檻' : '值×注額' }}</span>
                          <input class="input input-w-num input-center" type="number" min="0" step="any"
                                 v-model.number="it.value" :disabled="!!it.link_jackpot">
                        </div>
                        <div v-if="m.mode_kind !== 'COLLECTION'" class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">權重</span>
                          <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="it.weight">
                        </div>
                        <span v-if="m.mode_kind !== 'COLLECTION'" class="cfg-bonus-ipct">{{ (modeItemPct(m, ii) || 0).toFixed(1) }}%</span>
                        <label v-if="m.mode_kind === 'PICK'" class="cfg-bonus-end-toggle" title="抽到此項即結束（pooper）">
                          <input type="checkbox" v-model="it.is_end"> 結束
                        </label>
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">連結JP</span>
                          <select class="input input-w-id" v-model="it.link_jackpot">
                            <option value="">—</option>
                            <option v-for="j in modeItemJpOptions(m, it)" :key="j.jp_id" :value="j.jp_id">{{ j.name || j.jp_id }}</option>
                          </select>
                        </div>
                        <!-- v8.22 / G3:獎項角色 Item_Role -->
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">角色 <span class="cfg-key">item_role</span></span>
                          <select class="input input-w-id" v-model="it.item_role">
                            <option v-for="r in MODE_ITEM_ROLES" :key="'ir'+r.key" :value="r.key">{{ r.zh }}</option>
                          </select>
                        </div>
                        <!-- v8.27 / 批8:item→模式連結(WHEEL 分段跳轉 / PICK 多層進下一池)-->
                        <div v-if="m.mode_kind !== 'COLLECTION'" class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">連結模式 <span class="cfg-key">link_mode</span></span>
                          <select class="input input-w-id" v-model="it.link_mode">
                            <option value="">—</option>
                            <option v-for="mm in modeItemModeOptions(m)" :key="'lm'+mm" :value="mm">{{ mm }}</option>
                          </select>
                        </div>
                        <button class="cfg-mode-delete-btn cfg-reveal" @click="removeModeItem(m, ii)" title="刪除">✕</button>
                      </div>
                      <button class="cfg-mode-add-btn cfg-bonus-item-add" @click="addModeItem(m)">
                        <span style="font-size:14px">+</span> 新增獎項
                      </button>
                    </div>
                  </div><!-- /cfg-mode-minigame -->

                  <!-- 新增設定：列出尚未啟用的區段 -->
                  <div class="cfg-mode-add-section" v-if="modeSectionsAvailableToAdd(m).length">
                    <button type="button" class="cfg-mode-add-btn cfg-btn-inline"
                            @click="toggleModeAddSec(m)">
                      <span style="font-size:14px">+</span> 新增設定
                    </button>
                    <div v-if="isModeAddSecOpen(m)" class="cfg-mode-add-sec-menu">
                      <button v-for="sec in modeSectionsAvailableToAdd(m)" :key="'addsec'+sec.id"
                              type="button" class="cfg-mode-add-sec-item"
                              @click="modeSectionAdd(m, sec.id); closeModeAddSec(m)">
                        {{ sec.label }}
                      </button>
                    </div>
                  </div>

                  </div><!-- /cfg-card-body -->
                </div><!-- /cfg-mode-gameplay -->
              </div>
              </div><!-- /cfg-mode-card-expand (v5.0-d) -->
            </div>

            <button class="cfg-mode-add-btn" @click="openAddModeDlg">
              <span style="font-size: 16px;">+</span>
              <span>新增模式</span>
            </button>

            <!-- ═══ 新增模式三步精靈（步驟 1 共通／2 區段／3 預覽；僅末步可建立）═══ -->
            <div v-if="modeAddDlg.open" class="cfg-modedlg-mask"
                 @click.self="modeAddDlg.open = false"
                 @keydown.esc="modeAddDlg.open = false">
              <div class="cfg-modedlg cfg-modedlg-wide cfg-modedlg-mode-add" role="dialog" aria-label="新增模式">
                <div class="cfg-modedlg-title">
                  新增模式
                  <span class="cfg-ruledlg-step">步驟 {{ modeAddDlg.step }} / 3</span>
                </div>

                <!-- ── 步驟 1：名稱／玩法／觸發 ── -->
                <template v-if="modeAddDlg.step === 1">
                  <div class="cfg-modedlg-field">
                    <label class="cfg-label">模式名稱 <span class="cfg-req" aria-hidden="true">*</span></label>
                    <div class="cfg-modedlg-name-row">
                      <input class="input input-w-name cfg-modedlg-name"
                             :class="{ err: modeAddDlgNameTaken }"
                             type="text" v-model.trim="modeAddDlg.name"
                             placeholder="例:NG / FG / BG" maxlength="20"
                             @keyup.enter="modeAddDlgNext">
                      <span class="cfg-modedlg-quick-lbl">快選</span>
                      <button class="cfg-chip" :class="{ active: modeAddDlg.name === 'NG' }" @click="modeAddDlgPick('NG')">NG</button>
                      <button class="cfg-chip" :class="{ active: modeAddDlg.name === 'FG' }" @click="modeAddDlgPick('FG')">FG</button>
                      <button class="cfg-chip" :class="{ active: modeAddDlg.name === 'BG' }" @click="modeAddDlgPick('BG')">BG</button>
                    </div>
                    <div v-if="modeAddDlgNameTaken" class="cfg-warn cfg-warn-inline">⚠ 已有同名模式(不分大小寫),請換一個名稱</div>
                  </div>

                  <div class="cfg-modedlg-field">
                    <label class="cfg-label">玩法大方向 <span class="cfg-key">mode_kind</span></label>
                    <div class="cfg-chip-row cfg-modedlg-kind-row">
                      <button v-for="opt in MODE_KIND_OPTIONS" :key="opt.v"
                              class="cfg-chip" :class="{ active: modeAddDlg.kind === opt.v }"
                              @click="modeAddDlg.kind = opt.v">{{ opt.label }}</button>
                    </div>
                    <div v-if="modeAddDlg.kind === 'OTHER'" class="cfg-modedlg-other" style="margin-top:10px;">
                      <label class="cfg-label">玩法描述 <span class="cfg-req" aria-hidden="true">*</span></label>
                      <input class="input" type="text" v-model.trim="modeAddDlg.otherText"
                             placeholder="例：消除 / 過關" maxlength="80"
                             @keyup.enter="modeAddDlgNext">
                    </div>
                    <div class="cfg-hint">下一步會依玩法預勾可用設定；之後仍可在卡片內調整。</div>
                  </div>

                  <div class="cfg-modedlg-field">
                    <label class="cfg-label">觸發條件</label>
                    <div class="cfg-chip-row">
                      <button class="cfg-chip" :class="{ active: !modeAddDlg.triggerOn }"
                              @click="modeAddDlg.triggerOn = false">關</button>
                      <button class="cfg-chip" :class="{ active: modeAddDlg.triggerOn }"
                              @click="modeAddDlg.triggerOn = true">開</button>
                    </div>
                    <template v-if="modeAddDlg.triggerOn && modeAddDlg.draftMode">
                      <!-- 複用模式卡拼圖（無釘選測試檢查器） -->
                      <div class="cfg-puzzle-section" style="margin-top:8px;">
                        <span style="display:none">{{ modeCond.ensure(modeAddDlg.draftMode), '' }}</span>
                        <div class="cfg-puzzle-header">
                          <span class="cfg-puzzle-title">🧩 觸發條件 <span class="cfg-key">trigger_condition</span></span>
                          <div class="cfg-puzzle-mode-toggle">
                            <button class="cfg-chip cfg-chip-sm"
                                    :class="{ active: (condBuilderState.mode[modeCond.key(modeAddDlg.draftMode)] || 'builder') !== 'raw' }"
                                    @click="modeCond.setMode(modeAddDlg.draftMode, 'builder')">🧩 拼圖</button>
                            <button class="cfg-chip cfg-chip-sm"
                                    :class="{ active: condBuilderState.mode[modeCond.key(modeAddDlg.draftMode)] === 'raw' }"
                                    @click="modeCond.setMode(modeAddDlg.draftMode, 'raw')">⌨ 原始</button>
                          </div>
                        </div>
                        <div v-if="(condBuilderState.mode[modeCond.key(modeAddDlg.draftMode)] || 'builder') !== 'raw'" class="cfg-puzzle-body">
                          <div v-if="!condBuilderState.rows[modeCond.key(modeAddDlg.draftMode)] || condBuilderState.rows[modeCond.key(modeAddDlg.draftMode)].length === 0"
                               class="cfg-puzzle-empty">尚無條件;按下方按鈕新增第一片(可留空)</div>
                          <div v-else class="cfg-puzzle-rows">
                            <template v-for="(row, ri) in condBuilderState.rows[modeCond.key(modeAddDlg.draftMode)]" :key="'madr'+ri">
                              <div v-if="ri > 0" class="cfg-puzzle-combinator">
                                <button class="cfg-chip cfg-chip-sm"
                                        :class="{ active: row.combinator === 'AND' }"
                                        @click="row.combinator = 'AND'; modeCond.rebuild(modeAddDlg.draftMode)">AND</button>
                                <button class="cfg-chip cfg-chip-sm"
                                        :class="{ active: row.combinator === 'OR' }"
                                        @click="row.combinator = 'OR'; modeCond.rebuild(modeAddDlg.draftMode)">OR</button>
                              </div>
                              <div class="cfg-puzzle-row">
                                <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                                  <label class="cfg-puzzle-piece-label">變數</label>
                                  <select class="cfg-puzzle-select"
                                          :value="row.category"
                                          @change="modeCond.changeCat(modeAddDlg.draftMode, ri, $event.target.value)">
                                    <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ varCatLabel(cat.id) }}</option>
                                  </select>
                                </div>
                                <div v-if="rowCategoryMeta(row).needsSubkey" class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                                  <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(row).subkeyHint }}</label>
                                  <select v-if="rowCategoryMeta(row).subkeySource === 'symbols' && symbolNames.length > 0"
                                          class="cfg-puzzle-select"
                                          v-model="row.subkey"
                                          @change="modeCond.rebuild(modeAddDlg.draftMode)">
                                    <option value="">(選擇)</option>
                                    <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                                  </select>
                                  <input v-else
                                         class="cfg-puzzle-input cfg-mono"
                                         type="text"
                                         v-model.trim="row.subkey"
                                         @input="modeCond.rebuild(modeAddDlg.draftMode)"
                                         :placeholder="rowCategoryMeta(row).subkeyHint">
                                </div>
                                <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                                  <label class="cfg-puzzle-piece-label">運算</label>
                                  <select class="cfg-puzzle-select cfg-puzzle-op"
                                          v-model="row.op"
                                          @change="modeCond.rebuild(modeAddDlg.draftMode)">
                                    <option v-for="o in OP_TYPES" :key="o" :value="o">{{ opLabel(o) }}</option>
                                  </select>
                                </div>
                                <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                                  <label class="cfg-puzzle-piece-label">值</label>
                                  <select v-if="rowCategoryMeta(row).valueType === 'mode' && modeNames.length > 0"
                                          class="cfg-puzzle-select"
                                          v-model="row.value"
                                          @change="modeCond.rebuild(modeAddDlg.draftMode)">
                                    <option v-for="mn in modeNames" :key="mn" :value="mn">{{ mn }}</option>
                                  </select>
                                  <input v-else-if="rowCategoryMeta(row).valueType === 'number'"
                                         class="cfg-puzzle-input cfg-mono"
                                         type="number" step="any"
                                         v-model="row.value"
                                         @input="modeCond.rebuild(modeAddDlg.draftMode)"
                                         placeholder="0">
                                  <input v-else
                                         class="cfg-puzzle-input cfg-mono"
                                         type="text"
                                         v-model.trim="row.value"
                                         @input="modeCond.rebuild(modeAddDlg.draftMode)"
                                         placeholder="值">
                                </div>
                                <button class="cfg-puzzle-row-del"
                                        @click="modeCond.removeRow(modeAddDlg.draftMode, ri)"
                                        title="移除此片拼圖">✕</button>
                              </div>
                            </template>
                          </div>
                          <div class="cfg-puzzle-add">
                            <button v-if="!condBuilderState.rows[modeCond.key(modeAddDlg.draftMode)] || condBuilderState.rows[modeCond.key(modeAddDlg.draftMode)].length === 0"
                                    class="cfg-mode-add-btn cfg-puzzle-add-btn"
                                    @click="modeCond.addRow(modeAddDlg.draftMode, 'AND')">
                              <span style="font-size: 14px;">+</span>
                              <span>新增第一片條件</span>
                            </button>
                            <template v-else>
                              <button class="cfg-puzzle-add-and" @click="modeCond.addRow(modeAddDlg.draftMode, 'AND')">+ AND 條件</button>
                              <button class="cfg-puzzle-add-or" @click="modeCond.addRow(modeAddDlg.draftMode, 'OR')">+ OR 條件</button>
                            </template>
                          </div>
                          <div class="cfg-puzzle-dsl">
                            <span class="cfg-puzzle-dsl-label">生成的 DSL:</span>
                            <code class="cfg-puzzle-dsl-code">{{ modeAddDlg.draftMode.trigger_condition || '(空)' }}</code>
                          </div>
                        </div>
                        <div v-else class="cfg-puzzle-body">
                          <input class="input cfg-mono cfg-puzzle-raw-input"
                                 type="text"
                                 v-model.trim="modeAddDlg.draftMode.trigger_condition"
                                 placeholder="留空表示無觸發條件">
                          <div v-if="condBuilderState.error[modeCond.key(modeAddDlg.draftMode)]" class="cfg-warn cfg-warn-inline">
                            ⚠ {{ condBuilderState.error[modeCond.key(modeAddDlg.draftMode)] }}
                          </div>
                        </div>
                      </div>

                      <!-- 觸發給付：僅 SPIN 且名稱非 NG -->
                      <div v-if="modeAddDlgTpVisible" style="margin-top:10px;">
                        <label class="cfg-label">觸發給付 <span class="cfg-key">trigger_pays</span></label>
                        <div class="cfg-chip-row">
                          <button class="cfg-chip" :class="{ active: !modeAddDlg.tpEnabled }" @click="modeAddDlg.tpEnabled = false">關閉</button>
                          <button class="cfg-chip" :class="{ active: modeAddDlg.tpEnabled }" @click="modeAddDlg.tpEnabled = true">開啟</button>
                        </div>
                        <template v-if="modeAddDlg.tpEnabled">
                          <div v-for="(tp, ti) in modeAddDlg.tpRows" :key="'dtp'+ti" class="cfg-mode-tp-row">
                            <div class="cfg-mode-tp-cell">
                              <span class="cfg-mode-tp-lbl">scatter 數</span>
                              <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="tp.scatter_count">
                            </div>
                            <div class="cfg-mode-tp-cell">
                              <span class="cfg-mode-tp-lbl">給付 ×注額</span>
                              <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="tp.pay">
                            </div>
                            <div class="cfg-mode-tp-cell">
                              <span class="cfg-mode-tp-lbl">給予免費局</span>
                              <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="tp.grants_spins">
                            </div>
                            <button class="cfg-mode-delete-btn" @click="modeAddDlgTpRemove(ti)" title="刪除此列">✕</button>
                          </div>
                          <button class="cfg-mode-add-btn cfg-bonus-item-add cfg-btn-inline" @click="modeAddDlgTpAdd">
                            <span style="font-size:14px">+</span> 新增觸發給付
                          </button>
                        </template>
                      </div>

                      <div class="cfg-field" style="margin-top:10px;">
                        <label class="cfg-label">結束條件(可選) <span class="cfg-key">end_condition</span></label>
                        <input class="input cfg-mono" type="text" v-model.trim="modeAddDlg.end_condition"
                               placeholder="respins_left == 0 / symbol_count.SEVEN >= 1 …">
                      </div>
                      <div class="cfg-field" style="margin-top:8px;">
                        <label class="cfg-label">解鎖前提(可選) <span class="cfg-key">unlock_requires</span></label>
                        <div v-if="modeNames.length" class="cfg-chip-row">
                          <button v-for="nm in modeNames" :key="'madulk'+nm"
                                  class="cfg-chip cfg-chip-sm"
                                  :class="{ active: modeAddDlgUnlockHas(nm) }"
                                  @click="modeAddDlgUnlockToggle(nm)">{{ nm }}</button>
                        </div>
                        <div v-else class="cfg-hint">尚無其他模式可作為前提。</div>
                      </div>
                    </template>
                  </div>
                </template>

                <!-- ── 步驟 2：左勾選 + 右聚焦表單 ── -->
                <div class="cfg-modedlg-split" v-if="modeAddDlg.step === 2">
                  <aside class="cfg-modedlg-sec-nav">
                    <div class="cfg-label">可用設定</div>
                    <label v-for="sec in modeAddDlgSections" :key="'mas'+sec.id"
                           class="cfg-modedlg-sec-item"
                           :class="{ focused: modeAddDlg.focusSection === sec.id && modeAddDlg.enabled_sections.includes(sec.id) }">
                      <input type="checkbox"
                             :checked="modeAddDlg.enabled_sections.includes(sec.id)"
                             @change="modeAddDlgToggleSection(sec.id)">
                      <span @click.prevent="modeAddDlgFocusSection(sec.id)">{{ sec.label }}</span>
                    </label>
                  </aside>
                  <div class="cfg-modedlg-sec-pane">
                    <div v-if="!modeAddDlg.focusSection" class="cfg-hint">勾選左側設定後在此編輯</div>

                    <template v-if="modeAddDlg.focusSection === 'pay_type'">
                      <label class="cfg-label">賠付模型覆寫 <span class="cfg-key">pay_type_override</span></label>
                      <select class="input input-w-name" v-model="modeAddDlg.pay_type_override">
                        <option value="">（繼承全域）</option>
                        <option value="LINE">LINE（固定中獎線）</option>
                        <option value="WAYS">WAYS（相鄰全路徑）</option>
                        <option value="SCATTER">SCATTER（任意位置散佈）</option>
                        <option value="CLUSTER">CLUSTER（相鄰成群）</option>
                      </select>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'multipliers'">
                      <div class="cfg-field">
                        <label class="cfg-label">倍數重置範圍 <span class="cfg-key">reset_scope</span></label>
                        <select class="input input-w-name" v-model="modeAddDlg.reset_scope">
                          <option v-for="opt in RESET_SCOPE_OPTIONS" :key="opt.v" :value="opt.v">{{ opt.label }}</option>
                        </select>
                      </div>
                      <div class="cfg-field" style="margin-top:8px;">
                        <label class="cfg-label">倍數疊加方式 <span class="cfg-key">stack_mode</span></label>
                        <select class="input input-w-name" v-model="modeAddDlg.stack_mode">
                          <option v-for="opt in STACK_MODE_OPTIONS" :key="opt.v" :value="opt.v">{{ opt.label }}</option>
                        </select>
                      </div>
                      <div class="cfg-field" style="margin-top:8px;">
                        <label class="cfg-label">封頂 / 上限 <span class="cfg-key">cap</span></label>
                        <div class="cfg-mode-cap-row">
                          <label class="cfg-check">
                            <input type="checkbox" :checked="modeAddDlg.cap_enabled === 'Y'"
                                   @change="modeAddDlg.cap_enabled = $event.target.checked ? 'Y' : ''">
                            <span>有封頂</span>
                          </label>
                          <input class="input input-w-name" type="text" v-model="modeAddDlg.cap_value"
                                 :disabled="modeAddDlg.cap_enabled !== 'Y'" placeholder="例:5,000×">
                        </div>
                      </div>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'choice_group'">
                      <label class="cfg-label">玩家擇一組 <span class="cfg-key">choice_group</span></label>
                      <input class="input input-w-name cfg-mono" type="text" placeholder="—"
                             v-model.trim="modeAddDlg.choice_group">
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'hold_win'">
                      <label class="cfg-label">鎖點重轉 Hold&amp;Win</label>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span class="cfg-bonus-ilabel">初始局數</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="modeAddDlg.respin_base">
                        <span class="cfg-bonus-ilabel">重置條件</span>
                        <select class="input" v-model="modeAddDlg.respin_reset_on" :disabled="!(Number(modeAddDlg.respin_base) > 0)">
                          <option value="">（未指定）</option>
                          <option value="NEW_SYMBOL">落新符號重置</option>
                          <option value="ANY_WIN">任何中獎重置</option>
                          <option value="NEVER">不重置</option>
                        </select>
                      </div>
                      <input class="input" type="text" style="margin-top:6px;" placeholder="停止條件（自由描述）"
                             v-model.trim="modeAddDlg.respin_stop_cond" :disabled="!(Number(modeAddDlg.respin_base) > 0)">
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'collect'">
                      <label class="cfg-label">Hold&amp;Win 收集設定</label>
                      <div class="cfg-collect-grid">
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">收集型</span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.collect_enabled === true }"
                                    @click="modeAddDlg.collect_enabled = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.collect_enabled !== true }"
                                    @click="modeAddDlg.collect_enabled = false">關</button>
                          </div>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">重置符號</span>
                          <select class="input input-w-id" v-model="modeAddDlg.respin_reset_symbol">
                            <option value="">（依重置條件）</option>
                            <option v-for="s in symbolNames" :key="'madrrs'+s" :value="s">{{ s }}</option>
                          </select>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">收集中擴張</span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.grid_expand_in_collect === true }"
                                    @click="modeAddDlg.grid_expand_in_collect = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.grid_expand_in_collect !== true }"
                                    @click="modeAddDlg.grid_expand_in_collect = false">關</button>
                          </div>
                        </div>
                        <div class="cfg-collect-cell">
                          <span class="cfg-bonus-ilabel">允許 persistent</span>
                          <div class="cfg-chip-row">
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.allow_persistent === true }"
                                    @click="modeAddDlg.allow_persistent = true">開</button>
                            <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.allow_persistent !== true }"
                                    @click="modeAddDlg.allow_persistent = false">關</button>
                          </div>
                        </div>
                      </div>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'cascade'">
                      <label class="cfg-label">消除連鎖 <span class="cfg-key">cascade_enabled</span></label>
                      <div class="cfg-chip-row">
                        <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.cascade_enabled === true }"
                                @click="modeAddDlg.cascade_enabled = true">開</button>
                        <button class="cfg-chip cfg-chip-sm" :class="{ active: modeAddDlg.cascade_enabled !== true }"
                                @click="modeAddDlg.cascade_enabled = false">關</button>
                      </div>
                      <div v-if="modeAddDlg.cascade_enabled" class="cfg-field" style="margin-top:6px;">
                        <label class="cfg-label">連鎖深度上限覆寫</label>
                        <input class="input input-sm cfg-mono" type="number" min="0" step="1"
                               v-model.number="modeAddDlg.cascade_max_depth" style="width:100px;" placeholder="0">
                      </div>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'mult_compose'">
                      <label class="cfg-label">倍數複合覆寫 <span class="cfg-key">mult_compose_override</span></label>
                      <select class="input input-w-name" v-model="modeAddDlg.mult_compose_override">
                        <option value="">（沿用全域）</option>
                        <option value="MUL">相乘</option>
                        <option value="ADD">相加</option>
                        <option value="MAX">取最高</option>
                      </select>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'refill_track'">
                      <label class="cfg-label">補盤路徑覆寫 <span class="cfg-key">refill_track_override</span></label>
                      <select class="input input-w-name" v-model="modeAddDlg.refill_track_override">
                        <option value="">（沿用全域）</option>
                        <option v-for="to in trackOptions" :key="'madrto'+to.value" :value="to.value">{{ to.label }}</option>
                        <option v-if="isOrphanTrackRef(modeAddDlg.refill_track_override)" :value="modeAddDlg.refill_track_override">{{ modeAddDlg.refill_track_override }}（⚠ 軌道不存在）</option>
                      </select>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'wheel'">
                      <label class="cfg-label">升級目標 <span class="cfg-key">wheel_upgrade_to</span></label>
                      <select class="input input-w-name" v-model="modeAddDlg.wheel_upgrade_to">
                        <option value="">（無升級）</option>
                        <option v-for="wt in modes.filter(x => x.mode_kind === 'WHEEL' && (x.mode || '').trim())" :key="'madwt'+wt.mode" :value="wt.mode">{{ wt.mode }}</option>
                      </select>
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'pick'">
                      <label class="cfg-label">抽選次數 <span class="cfg-key">pick_count</span></label>
                      <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="modeAddDlg.pick_count">
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'collect_target'">
                      <label class="cfg-label">收集目標 <span class="cfg-key">collect_target</span></label>
                      <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="modeAddDlg.collect_target">
                    </template>

                    <template v-if="modeAddDlg.focusSection === 'bonus_items'">
                      <div class="cfg-bonus-items-title">
                        {{ modeAddDlg.kind === 'WHEEL' ? '輪盤分段' : modeAddDlg.kind === 'PICK' ? '獎項池' : '收集獎勵' }}
                      </div>
                      <div v-if="(modeAddDlg.items || []).length === 0" class="cfg-hint" style="margin:4px 0;">尚無獎項,按下方「+ 新增獎項」開始。</div>
                      <div v-for="(it, ii) in modeAddDlg.items" :key="'madmi'+ii" class="cfg-bonus-item-row cfg-reveal-zone">
                        <input class="input input-w-id" type="text" v-model.trim="it.label" placeholder="標籤">
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">{{ modeAddDlg.kind === 'COLLECTION' ? '門檻' : '值×注額' }}</span>
                          <input class="input input-w-num input-center" type="number" min="0" step="any"
                                 v-model.number="it.value" :disabled="!!it.link_jackpot">
                        </div>
                        <div v-if="modeAddDlg.kind !== 'COLLECTION'" class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">權重</span>
                          <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="it.weight">
                        </div>
                        <span v-if="modeAddDlg.kind !== 'COLLECTION'" class="cfg-bonus-ipct">{{ (modeItemPct({ mode_kind: modeAddDlg.kind, items: modeAddDlg.items }, ii) || 0).toFixed(1) }}%</span>
                        <label v-if="modeAddDlg.kind === 'PICK'" class="cfg-bonus-end-toggle" title="抽到此項即結束">
                          <input type="checkbox" v-model="it.is_end"> 結束
                        </label>
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">連結JP</span>
                          <select class="input input-w-id" v-model="it.link_jackpot">
                            <option value="">—</option>
                            <option v-for="j in modeItemJpOptions({ items: modeAddDlg.items }, it)" :key="j.jp_id" :value="j.jp_id">{{ j.name || j.jp_id }}</option>
                          </select>
                        </div>
                        <div class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">角色</span>
                          <select class="input input-w-id" v-model="it.item_role">
                            <option v-for="r in MODE_ITEM_ROLES" :key="'madir'+r.key" :value="r.key">{{ r.zh }}</option>
                          </select>
                        </div>
                        <div v-if="modeAddDlg.kind !== 'COLLECTION'" class="cfg-bonus-icell">
                          <span class="cfg-bonus-ilabel">連結模式</span>
                          <select class="input input-w-id" v-model="it.link_mode">
                            <option value="">—</option>
                            <option v-for="mm in modeItemModeOptions({ mode: '' })" :key="'madlm'+mm" :value="mm">{{ mm }}</option>
                          </select>
                        </div>
                        <button class="cfg-mode-delete-btn cfg-reveal" @click="removeModeItem({ items: modeAddDlg.items }, ii)" title="刪除">✕</button>
                      </div>
                      <button class="cfg-mode-add-btn cfg-bonus-item-add"
                              @click="addModeItem({ mode_kind: modeAddDlg.kind, items: modeAddDlg.items })">
                        <span style="font-size:14px">+</span> 新增獎項
                      </button>
                    </template>
                  </div>
                </div>

                <!-- ── 步驟 3：唯讀預覽 ── -->
                <div v-if="modeAddDlg.step === 3" class="cfg-modedlg-preview">
                  <pre class="cfg-modedlg-preview-text">{{ modeAddDlgPreview.join('\n') }}</pre>
                </div>

                <div class="cfg-modedlg-actions">
                  <button class="btn-pill" @click="modeAddDlg.open = false">取消</button>
                  <button v-if="modeAddDlg.step > 1" class="btn-pill" @click="modeAddDlgBack">上一步</button>
                  <button v-if="modeAddDlg.step < 3" class="btn-pill cfg-modedlg-confirm"
                          :disabled="!modeAddCanNext" @click="modeAddDlgNext">下一步</button>
                  <button v-else class="btn-pill cfg-modedlg-confirm"
                          :disabled="!modeAddCanConfirm" @click="confirmAddModeDlg">建立模式</button>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>

        <!-- ═══ 子分頁:產牌限制 / 生成期約束(v7.11)═══ -->
        <div v-show="rulesSection === 'genlimits'" class="cfg-rules-section cfg-rules-section-genlimits">
          <div class="cfg-form-header">
            <div class="cfg-form-title">🎲 產牌限制 · 生成期約束 <span class="sym-info sym-info-below" data-tip="產牌時的硬性條件,如指定全盤圖示上限。單一符號數量與圖示頁雙向同步;關聯條件(多符號/位置/盤面)寫入 07c。">ⓘ</span></div>
            <div class="cfg-form-sub">
              描述「某符號在某個區域（主盤 / 副輪 / 副盤）內的出現數量上下限」。
              這是<strong>產牌條件</strong>（生成期約束），與
              <a href="#" @click.prevent="active='constraints'" class="cfg-link">07_Constraints 硬約束</a>
              的位置 / 全盤上限正交。本工具負責格式書 / 企劃書；數值模擬由另一工具執行。
            </div>
          </div>

          <div class="cfg-genlimits">
            <div class="cfg-genlimits-toolbar">
              <div class="cfg-genlimits-count">共 {{ genLimits.length }} 條</div>
              <button class="btn-pill add" @click="addGenLimit()">＋ 新增產牌限制</button>
            </div>

            <div v-if="!genLimits.length" class="cfg-genlimits-empty">
              尚無產牌限制。按「＋ 新增產牌限制」開始，或到符號清單的「出現限制 / 規則」卡新增（兩處同步）。
            </div>

            <table v-else class="cfg-genlimits-table">
              <thead>
                <tr>
                  <th>編號</th><th>符號</th><th>區域</th><th>下限</th><th>上限</th><th>適用模式</th><th>備註</th><th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(gl, gi) in genLimits" :key="'gl'+gi" class="cfg-reveal-zone"
                    :class="{ 'is-warn': genLimitStatusOf(gl).kind === 'warn', 'is-err': genLimitStatusOf(gl).kind === 'err', 'is-selected': glSelectedIdx === gi }"
                    :title="humanizeGenLimit(gl)"
                    @click="glSelectedIdx = gi">
                  <td><input class="input input-sm" style="width:74px;" v-model="gl.limit_id" placeholder="GL001"></td>
                  <td>
                    <select class="input input-sm" v-model="gl.symbol_id">
                      <option value="">（選符號）</option>
                      <option v-for="sid in genLimitSymbolOptions" :key="sid" :value="sid">{{ sid }}</option>
                    </select>
                  </td>
                  <td>
                    <select class="input input-sm" v-model="gl.zone">
                      <option v-for="z in genLimitZoneOptions" :key="z.value" :value="z.value">{{ z.label }}</option>
                    </select>
                  </td>
                  <td><input class="input input-sm input-center" type="number" min="0" max="999" style="width:56px;" v-model.number="gl.min_count" title="0=無下限"></td>
                  <td><input class="input input-sm input-center" type="number" min="0" max="999" style="width:56px;" v-model.number="gl.max_count" placeholder="∞" title="空=無上限"></td>
                  <td><input class="input input-sm" style="width:92px;" v-model="gl.mode_scope" placeholder="ALL" title="ALL 或逗號多選(例:NG,FG1)"></td>
                  <td><input class="input input-sm" style="min-width:120px;" v-model="gl.notes" placeholder="備註"></td>
                  <td><button class="btn-pill del cfg-reveal" @click="removeGenLimit(gi)" title="刪除">🗑</button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- §4.4:關聯條件(07c;多符號合計 / 位置關係 / 盤面狀態)-->
          <div class="cfg-gc-block">
            <div class="cfg-genlimits-head">
              <div class="cfg-genlimits-count">關聯條件 共 {{ genConstraints.length }} 條</div>
              <button class="btn-pill add" @click="openGcDlg(-1)">＋ 新增關聯條件</button>
            </div>
            <div v-if="!genConstraints.length" class="cfg-genlimits-empty">
              尚無關聯條件。多符號數量合計 / 符號位置關係 / 整體盤面狀態的硬性條件在此新增。
            </div>
            <div v-else class="cfg-gc-list">
              <div v-for="(gc, ci) in genConstraints" :key="gc.constraint_id || ci"
                   class="cfg-gc-row" :class="{ 'is-off': !gc.enabled }">
                <button class="cfg-gc-sw" :class="{ on: gc.enabled }" @click="toggleGenConstraint(ci)" :title="gc.enabled ? '已啟用（點擊停用）' : '已停用（點擊啟用）'"></button>
                <span class="cfg-gc-ctype">{{ GC_CTYPE_LABEL[gc.ctype] || gc.ctype }}</span>
                <span class="cfg-gc-text">{{ humanizeGenConstraint(gc) }}</span>
                <span v-if="gc.enabled && gcHasConflict(gc)" class="cfg-gc-warndot" title="靜態衝突:與另一條相同符號合計條件的數值範圍矛盾(僅提示,不阻擋)">●</span>
                <span style="flex:1"></span>
                <button class="cfg-gc-act" @click="openGcDlg(ci)" title="編輯">✎</button>
                <button class="cfg-gc-act" @click="dupGenConstraint(ci)" title="複製">⧉</button>
                <button class="cfg-gc-act danger" @click="removeGenConstraint(ci)" title="刪除">🗑</button>
              </div>
            </div>
          </div>

          <!-- §4.8:產牌條件 modal(關聯型;3 型 + 值型別;「除了」builder 待 Stage 3)-->
          <div v-if="gcDlg.open" class="cfg-gc-overlay" @click.self="closeGcDlg()">
            <div class="cfg-gc-modal">
              <h3 class="cfg-gc-modal-title">{{ gcDlg.editIdx >= 0 ? '編輯' : '新增' }}產牌條件</h3>
              <div class="cfg-gc-frow">
                <label class="cfg-gc-fl">條件類型</label>
                <select class="cfg-gc-sel" style="width:170px" v-model="gcDlg.ctype">
                  <option value="sum">多符號數量合計</option>
                  <option value="pos">符號位置關係</option>
                  <option value="board">整體盤面狀態</option>
                </select>
              </div>
              <template v-if="gcDlg.ctype === 'sum'">
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">符號</label>
                  <div class="cfg-gc-chips">
                    <span v-for="(s, si) in gcDlg.symbols" :key="si" class="cfg-gc-symchip">{{ s }}<button @click="gcRemoveSym(si)" title="移除此符號">×</button></span>
                    <select class="cfg-gc-sel" style="width:110px" v-model="gcDlg.symPick" @change="gcAddSym()">
                      <option value="">＋ 加符號</option>
                      <option v-for="s in symbolList" :key="s.symbol_id" :value="s.symbol_id">{{ s.symbol_id }}</option>
                    </select>
                  </div>
                </div>
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">合計</label>
                  <div class="cfg-gc-chips">
                    <select class="cfg-gc-sel" style="width:70px" v-model="gcDlg.op"><option v-for="o in GC_OPS" :key="o.v" :value="o.v">{{ o.t }}</option></select>
                    <input class="cfg-gc-num" type="number" v-model.number="gcDlg.value" />
                  </div>
                </div>
              </template>
              <template v-else-if="gcDlg.ctype === 'pos'">
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">符號</label>
                  <div class="cfg-gc-chips">
                    <span v-for="(s, si) in gcDlg.symbols" :key="si" class="cfg-gc-symchip">{{ s }}<button @click="gcRemoveSym(si)" title="移除此符號">×</button></span>
                    <select class="cfg-gc-sel" style="width:110px" v-model="gcDlg.symPick" @change="gcAddSym()">
                      <option value="">＋ 加符號</option>
                      <option v-for="s in symbolList" :key="s.symbol_id" :value="s.symbol_id">{{ s.symbol_id }}</option>
                    </select>
                  </div>
                </div>
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">關係</label>
                  <select class="cfg-gc-sel" style="width:130px" v-model="gcDlg.relation"><option v-for="r in GC_RELATIONS" :key="r" :value="r">{{ r }}</option></select>
                </div>
              </template>
              <template v-else-if="gcDlg.ctype === 'board'">
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">狀態</label>
                  <select class="cfg-gc-sel" style="width:150px" v-model="gcDlg.board_state"><option v-for="b in GC_BOARD_STATES" :key="b" :value="b">{{ b }}</option></select>
                </div>
                <div class="cfg-gc-frow">
                  <label class="cfg-gc-fl">數量</label>
                  <div class="cfg-gc-chips">
                    <select class="cfg-gc-sel" style="width:70px" v-model="gcDlg.op"><option v-for="o in GC_OPS" :key="o.v" :value="o.v">{{ o.t }}</option></select>
                    <input class="cfg-gc-num" type="number" v-model.number="gcDlg.value" />
                  </div>
                </div>
              </template>
              <div class="cfg-gc-frow" v-if="gcHasValue(gcDlg.ctype)">
                <label class="cfg-gc-fl">值型別</label>
                <div class="cfg-gc-seg">
                  <button :class="{ on: gcDlg.value_type === 'fixed' }" @click="gcDlg.value_type = 'fixed'">固定值</button>
                  <button :class="{ on: gcDlg.value_type === 'dynamic' }" @click="gcDlg.value_type = 'dynamic'">動態值</button>
                </div>
              </div>
              <!-- §4.9:除了(巢狀 builder;任一/全部 + leaf/group 一層巢狀)-->
              <div class="cfg-gc-frow" style="align-items:stretch;">
                <label class="cfg-gc-fl">除了</label>
                <div class="cfg-gc-exbox">
                  <div class="cfg-gc-exconn">
                    <span class="cfg-gc-excap">符合下列</span>
                    <div class="cfg-gc-seg cfg-gc-seg-sm">
                      <button :class="{ on: gcDlg.except.connector === 'any' }" @click="gcDlg.except.connector = 'any'">任一</button>
                      <button :class="{ on: gcDlg.except.connector === 'all' }" @click="gcDlg.except.connector = 'all'">全部</button>
                    </div>
                  </div>
                  <template v-for="(it, ii) in gcDlg.except.items" :key="ii">
                    <div v-if="it.kind !== 'group'" class="cfg-gc-exleaf">
                      <select class="cfg-gc-sel" style="width:128px" v-model="it.type" @change="gcExOnLeafTypeChange(it)">
                        <option value="mode">特定模式</option>
                        <option value="symbol">出現特定符號</option>
                        <option value="board">特定盤面狀態</option>
                      </select>
                      <select class="cfg-gc-sel" style="width:128px" v-model="it.target">
                        <option v-for="o in gcExTargetOptions(it.type)" :key="o" :value="o">{{ o }}</option>
                      </select>
                      <span style="flex:1"></span>
                      <button class="cfg-gc-exrm" @click="gcExRemoveItem(gcDlg.except.items, ii)" title="移除">×</button>
                    </div>
                    <div v-else class="cfg-gc-exgrp">
                      <div class="cfg-gc-exgrp-head">
                        <span class="cfg-gc-excap">群組</span>
                        <div class="cfg-gc-seg cfg-gc-seg-sm">
                          <button :class="{ on: it.connector === 'any' }" @click="it.connector = 'any'">任一</button>
                          <button :class="{ on: it.connector === 'all' }" @click="it.connector = 'all'">全部</button>
                        </div>
                        <span style="flex:1"></span>
                        <button class="cfg-gc-exrm" @click="gcExRemoveItem(gcDlg.except.items, ii)" title="移除群組">×</button>
                      </div>
                      <div v-for="(lf, li) in it.items" :key="li" class="cfg-gc-exleaf">
                        <select class="cfg-gc-sel" style="width:118px" v-model="lf.type" @change="gcExOnLeafTypeChange(lf)">
                          <option value="mode">特定模式</option>
                          <option value="symbol">出現特定符號</option>
                          <option value="board">特定盤面狀態</option>
                        </select>
                        <select class="cfg-gc-sel" style="width:118px" v-model="lf.target">
                          <option v-for="o in gcExTargetOptions(lf.type)" :key="o" :value="o">{{ o }}</option>
                        </select>
                        <span style="flex:1"></span>
                        <button class="cfg-gc-exrm" @click="gcExRemoveItem(it.items, li)" title="移除">×</button>
                      </div>
                      <button class="cfg-gc-exadd" @click="gcExAddLeaf(it)">＋ 例外</button>
                    </div>
                  </template>
                  <div class="cfg-gc-exadds">
                    <button class="cfg-gc-exadd" @click="gcExAddLeaf(null)">＋ 例外</button>
                    <button class="cfg-gc-exadd" @click="gcExAddGroup()">＋ 群組</button>
                  </div>
                  <div class="cfg-gc-exprev">👁 {{ gcExSentence(gcDlg.except) || '（無例外）' }}</div>
                </div>
              </div>
              <div class="cfg-gc-modal-btns">
                <button class="cfg-gc-btn" @click="closeGcDlg()">取消</button>
                <button class="cfg-gc-btn pro" :disabled="!gcDlgValid()" @click="confirmGcDlg()">{{ gcDlg.editIdx >= 0 ? '儲存' : '新增' }}</button>
              </div>
            </div>
          </div>
        </div>

        </div><!-- /cfg-rules-sectionhost -->
      </div>

      <!-- ═══════ 12_Distribution_Bins 分佈區間 ═══════ -->
      <div v-else-if="active === 'distribution_bins'" class="cfg-form">
        <!-- 權重頁 W1:peer 分段(輪帶 / 分佈)+ 子切換;複用規則 peer / subtoggle CSS -->
        <div class="cfg-rule-peers">
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'reels' }" @click="gotoWeightPeer('reels')">輪帶</button>
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'dist' }" @click="gotoWeightPeer('dist')">分佈</button>
        </div>
        <div v-if="weightPeer === 'reels'" class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_weights' }" @click="active = 'reel_weights'">權重矩陣</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_strips' }" @click="active = 'reel_strips'">真實輪帶</button>
        </div>
        <div v-else class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'grid_size_weights' }" @click="active = 'grid_size_weights'">格數分佈</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'distribution_bins' }" @click="active = 'distribution_bins'">倍數區間</button>
        </div>
        <div class="cfg-form-header">
          <div class="cfg-form-title">📊 12_Distribution_Bins · 分佈區間</div>
          <div class="cfg-form-sub">
            每個模式各自的賠付倍數細顆粒度區間,用於 B 文件的分佈分析。
            模式清單來自
            <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>,
            新增模式時會自動套用預設區間。
          </div>
        </div>

        <div v-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global · 模式定義</a>
            新增至少一個模式。
          </div>
        </div>

        <div v-else class="cfg-bins-grid">
          <div v-for="m in modeNames" :key="m" class="cfg-mode-card">

            <div class="cfg-mode-card-header">
              <div class="cfg-mode-name-wrap">
                <label class="cfg-mode-name-label">對應模式 <span class="cfg-key">mode_scope</span></label>
                <div class="cfg-reel-id">{{ m }}</div>
              </div>
            </div>

            <div class="cfg-mode-card-body">

              <div class="cfg-field">
                <label class="cfg-label">
                  區間邊界 <span class="cfg-key">bin_edges</span>
                </label>
                <input class="input cfg-mono" type="text"
                       :class="{ err: !binsValid(m).valid }"
                       v-model.trim="binsFor(m).bin_edges"
                       placeholder="0, 0.001, 2, 10, 50">
                <div v-if="!binsValid(m).valid" class="cfg-warn cfg-warn-inline">
                  ⚠ {{ binsValid(m).msg }}
                </div>

                <!-- 視覺預覽:橫向 tick + 區段數量 -->
                <div v-if="binsValid(m).valid" class="cfg-bins-preview">
                  <div class="cfg-bins-preview-meta">
                    {{ binsValid(m).edges.length }} 個邊界 →
                    <strong>{{ binsValid(m).edges.length - 1 }} 個區間</strong>(末段含 +∞)
                  </div>
                  <div class="cfg-bins-axis">
                    <div v-for="(edge, i) in binsValid(m).edges" :key="i"
                         class="cfg-bins-tick"
                         :style="{ left: binTickPercent(binsValid(m).edges, i) + '%' }">
                      <span class="cfg-bins-tick-mark"></span>
                      <span class="cfg-bins-tick-label">{{ edge }}</span>
                    </div>
                  </div>
                </div>
                <div class="cfg-hint">
                  逗號分隔的嚴格遞增數字,至少 2 個。
                  例:<code>0, 0.001, 2, 10, 50</code> 表示 4 個區間:
                  [0, 0.001) / [0.001, 2) / [2, 10) / [10, 50) / [50, +∞)
                </div>
              </div>

              <div class="cfg-field">
                <label class="cfg-label">
                  備註 <span class="cfg-key">notes</span>
                </label>
                <input class="input input-w-name" type="text"
                       v-model.trim="binsFor(m).notes"
                       placeholder="(選填)">
              </div>

            </div>
          </div>
        </div>

        <details class="cfg-debug" @toggle="dbgOpen.bins = $event.target.open">
          <summary>🔍 預覽目前 JSON({{ Object.keys(bins).length }} 個區間定義)</summary>
          <pre v-if="dbgOpen.bins" class="cfg-debug-pre">{{ binsDebugJson }}</pre>
        </details>
      </div>

      <!-- ─── 14:加押 / 購買(v6.2:Extra Bet + Buy Feature,皆開關前置)─── -->
      <div v-else-if="active === 'bet_config'" class="cfg-form cfg-betconfig-form">

        <!-- §2.1:額外押注 群組卡（外框無總開關;內含加押 / 購買 / 比倍三張各有開關的內卡）-->
        <div class="cfg-betgroup-card">
          <div class="cfg-betgroup-title">額外押注</div>

        <div class="cfg-section cfg-section-card" :class="{ 'is-empty': !betConfig.ante_bet_enabled, 'is-closed': betConfig.ante_bet_enabled && !betCardOpen.ante, 'is-locked': !betConfig.ante_bet_enabled }">
          <div class="cfg-section-title cfg-section-title-switch cfg-card-head" @click="toggleBetCard('ante')">
            <span class="cfg-section-title-text">加押 <span class="cfg-key">Extra Bet</span></span>
            <span v-if="betConfig.ante_bet_enabled && !betCardOpen.ante" class="cfg-card-summary">
              <span class="cfg-card-summary-chip cfg-mono">{{ anteBetSummary }}</span>
            </span>
            <button type="button" class="cfg-section-switch" :class="{ on: betConfig.ante_bet_enabled }"
                    role="switch" :aria-checked="betConfig.ante_bet_enabled"
                    @click.stop="betConfig.ante_bet_enabled = !betConfig.ante_bet_enabled"
                    :title="betConfig.ante_bet_enabled ? '已啟用（點擊關閉）' : '已關閉（點擊啟用）'">
              <span class="cfg-section-switch-knob"></span>
            </button>
            <span class="cfg-card-caret" :class="{ open: betCardOpen.ante, 'is-hidden': !betConfig.ante_bet_enabled }" title="展開 / 收合">›</span>
          </div>

          <div v-show="!betConfig.ante_bet_enabled || betCardOpen.ante" class="cfg-card-body">
          <template v-if="betConfig.ante_bet_enabled">
            <div class="cfg-hint">加押功能：玩家選擇支付額外成本（通常 ×1.25），換取更高的特色觸發機率。</div>
            <div class="cfg-ante-grid">
              <div class="cfg-field">
                <label class="cfg-label">成本倍數 <span class="cfg-key">×注額</span></label>
                <input class="input input-w-num input-center" type="number" min="1" max="3" step="0.05"
                       v-model.number="betConfig.ante_bet_mult">
                <div class="cfg-hint">通常 1.25（玩家多付 25%）</div>
              </div>
              <div class="cfg-field">
                <label class="cfg-label">觸發倍率 <span class="cfg-key">×基礎機率</span></label>
                <input class="input input-w-num input-center" type="number" min="1" max="10" step="0.1"
                       v-model.number="betConfig.ante_bet_trigger_mult">
                <div class="cfg-hint">SCAT / 特色觸發率的倍數（如 2× = 觸發率翻倍）</div>
              </div>
            </div>
            <div class="cfg-field" style="margin-top:4px;">
              <label class="cfg-label">企劃說明 <span class="cfg-key">文件生成用</span></label>
              <input class="input input-w-name" type="text" v-model.trim="betConfig.ante_bet_desc"
                     placeholder="啟用後 SCAT 觸發率提升 ×2，費用 ×1.25 注額">
            </div>
            <!-- v8.6 / R5 E-15:Ante/Buy 互斥宣告(規格描述) -->
            <div class="cfg-field" style="margin-top:4px;">
              <label class="chk">
                <input type="checkbox" v-model="betConfig.ante_buy_exclusive">
                <span class="box"></span>
                <span>與購買互斥 <span class="cfg-key">ante_buy_exclusive</span></span>
              </label>
              <div class="cfg-hint">啟用加押時停用購買功能（Pragmatic 式）；寫進規格書供實作遵循。</div>
            </div>
          </template>
          <div v-else class="cfg-section-off-hint">加押功能未啟用 —— 玩家可支付額外成本換取更高特色觸發率。開啟開關以設定。</div>
          </div><!-- /cfg-card-body -->
        </div>

        <div class="cfg-section cfg-section-card" :class="{ 'is-empty': !betConfig.buy_feature_enabled, 'is-closed': betConfig.buy_feature_enabled && !betCardOpen.buy, 'is-locked': !betConfig.buy_feature_enabled }">
          <div class="cfg-section-title cfg-section-title-switch cfg-card-head" @click="toggleBetCard('buy')">
            <span class="cfg-section-title-text">購買 <span class="cfg-key">Buy Feature</span></span>
            <span v-if="betConfig.buy_feature_enabled && !betCardOpen.buy" class="cfg-card-summary">
              <span class="cfg-card-summary-chip">{{ buyFeatureSummary }}</span>
            </span>
            <button type="button" class="cfg-section-switch" :class="{ on: betConfig.buy_feature_enabled }"
                    role="switch" :aria-checked="betConfig.buy_feature_enabled"
                    @click.stop="betConfig.buy_feature_enabled = !betConfig.buy_feature_enabled"
                    :title="betConfig.buy_feature_enabled ? '已啟用（點擊關閉）' : '已關閉（點擊啟用）'">
              <span class="cfg-section-switch-knob"></span>
            </button>
            <span class="cfg-card-caret" :class="{ open: betCardOpen.buy, 'is-hidden': !betConfig.buy_feature_enabled }" title="展開 / 收合">›</span>
          </div>

          <div v-show="!betConfig.buy_feature_enabled || betCardOpen.buy" class="cfg-card-body">
          <template v-if="betConfig.buy_feature_enabled">
            <div class="cfg-hint">購買功能：玩家可支付一定倍數直接進入指定模式，需在此定義各模式的購買成本與 RTP 目標。</div>
            <div v-if="betConfig.buy_features.length === 0" class="cfg-hint" style="margin-bottom:8px;">
              尚未設定購買項目；點下方「新增購買項目」開始定義各模式的購買成本與 RTP 目標。
            </div>

            <div class="cfg-bf-list">
              <div v-for="(bf, bi) in betConfig.buy_features" :key="'bf' + bi" class="cfg-bf-row cfg-reveal-zone">
                <div class="cfg-bf-cell">
                  <label class="cfg-label">BF_ID</label>
                  <input class="input input-w-id cfg-mono" type="text" v-model.trim="bf.bf_id" placeholder="BF_FG">
                </div>
                <div class="cfg-bf-cell">
                  <label class="cfg-label">目標模式 <span v-if="!bf.target_mode || !modeNames.includes(bf.target_mode)" class="cfg-bf-warn" title="目標模式未設定或引用了不存在的模式（純靜態提醒，非阻擋）"></span></label>
                  <select class="input input-w-id" v-model="bf.target_mode">
                    <option value="">（請選擇）</option>
                    <option v-for="mn in modeNames" :key="mn" :value="mn">{{ mn }}</option>
                  </select>
                </div>
                <div class="cfg-bf-cell">
                  <label class="cfg-label">成本 <span class="cfg-key">×注額</span></label>
                  <input class="input input-w-num input-center" type="number" min="0" step="1"
                         v-model.number="bf.cost_mult">
                </div>
                <div class="cfg-bf-cell">
                  <label class="cfg-label">RTP 目標 <span class="cfg-key">%</span></label>
                  <input class="input input-w-num input-center" type="number" min="0" max="102" step="0.1"
                         v-model.number="bf.rtp_target">
                </div>
                <!-- v8.6 / R5 E-15:購買檔位型式 -->
                <div class="cfg-bf-cell">
                  <label class="cfg-label">檔位 <span class="cfg-key">kind</span></label>
                  <select class="input input-w-id" v-model="bf.kind"
                          title="DIRECT=直接進 feature;BOOST_RATE=提升觸發率(非直買);SUPER=進階強化版">
                    <option v-for="k in BF_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
                  </select>
                </div>
                <div class="cfg-bf-cell cfg-bf-cell-grow">
                  <label class="cfg-label">備註</label>
                  <input class="input input-w-name" type="text" v-model.trim="bf.notes"
                         placeholder="適用 SuperBet 模式">
                </div>
                <div class="cfg-bf-cell">
                  <label class="cfg-label">啟用</label>
                  <label class="chk">
                    <input type="checkbox" v-model="bf.enabled">
                    <span class="box"></span>
                  </label>
                </div>
                <button class="cfg-mode-delete-btn cfg-bf-del cfg-reveal" @click="removeBuyFeature(bi)" title="刪除">✕</button>
              </div>
            </div>

            <button class="cfg-mode-add-btn" @click="addBuyFeature">
              <span style="font-size:16px">+</span>
              <span>新增購買項目</span>
            </button>

            <!-- v8.6 / R5 E-15:Feature Drop 折抵(BTG 式;規格描述) -->
            <div class="cfg-field" style="margin-top:10px;">
              <label class="chk">
                <input type="checkbox" v-model="betConfig.feature_drop_enabled">
                <span class="box"></span>
                <span>贏分折抵 <span class="cfg-key">Feature Drop / feature_drop</span></span>
              </label>
              <div class="cfg-hint">累積贏分折抵購買成本（BTG 式）；細節描述於下欄。</div>
              <input v-if="betConfig.feature_drop_enabled" class="input" type="text" style="margin-top:6px;"
                     placeholder="折抵細節（如：每局贏分自動折抵購買價,折至 0 即免費進入）"
                     v-model.trim="betConfig.feature_drop_desc">
            </div>
          </template>
          <div v-else class="cfg-section-off-hint">購買功能未啟用 —— 玩家可付費直接進入指定模式。開啟開關以定義各模式的購買成本與 RTP 目標。</div>
          </div><!-- /cfg-card-body -->
        </div>

        <!-- v8.6 / R5 E-18:多市場 RTP 出證版本 + 市場別注限(規格描述;存於 betconfig.v1) -->
        <div class="cfg-section cfg-section-card">
          <div class="cfg-section-title">
            <span class="cfg-section-title-text">多市場 RTP 版本 <span class="cfg-key">14b_RTP_Variants</span></span>
          </div>
          <div class="cfg-hint">出證用 RTP 版本（如 96.5 / 94 / 92）與市場別注限；純規格描述,供數值 / 認證流程遵循。</div>
          <div v-if="(betConfig.rtp_variants || []).length === 0" class="cfg-hint" style="margin-bottom:6px;">尚未定義版本。</div>
          <div v-for="(rv, ri) in (betConfig.rtp_variants || [])" :key="'rv' + ri" class="cfg-bf-row cfg-reveal-zone">
            <div class="cfg-bf-cell">
              <label class="cfg-label">版本 / 市場</label>
              <input class="input input-w-id cfg-mono" type="text" v-model.trim="rv.variant" placeholder="EU_96">
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">目標 RTP <span class="cfg-key">%</span></label>
              <input class="input input-w-num input-center" type="number" min="0" max="120" step="0.1" v-model.number="rv.target_rtp">
            </div>
            <div class="cfg-bf-cell">
              <label class="cfg-label">注限 <span class="cfg-key">0=未設</span></label>
              <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="rv.max_bet">
            </div>
            <div class="cfg-bf-cell cfg-bf-cell-grow">
              <label class="cfg-label">備註</label>
              <input class="input input-w-name" type="text" v-model.trim="rv.notes" placeholder="MGA 出證 / 亞洲市場">
            </div>
            <button class="cfg-mode-delete-btn cfg-bf-del cfg-reveal" @click="removeRtpVariant(ri)" title="刪除">✕</button>
          </div>
          <button class="cfg-mode-add-btn" @click="addRtpVariant">
            <span style="font-size:16px">+</span>
            <span>新增 RTP 版本</span>
          </button>
        </div>

      <!-- ─── 18_Gamble 比倍（已併入押注頁「額外押注」群組）─── -->
        <div class="cfg-section cfg-section-card">
          <div class="cfg-section-title cfg-section-title-switch">
            <span class="cfg-section-title-text">比倍 <span class="cfg-key">18_Gamble</span></span>
            <button type="button" class="cfg-section-switch" :class="{ on: gamble.enabled }"
                    role="switch" :aria-checked="gamble.enabled"
                    @click.stop="gamble.enabled = !gamble.enabled"
                    :title="gamble.enabled ? '已啟用（點擊關閉）' : '已關閉（點擊啟用）'">
              <span class="cfg-section-switch-knob"></span>
            </button>
          </div>
          <template v-if="gamble.enabled">
            <div class="cfg-hint">贏分後可選擇比倍（Gamble / Double-Up）。純規格描述：本工具不執行、不計算 RTP。</div>
            <div class="cfg-field">
              <label class="cfg-label">型式 <span class="cfg-key">gamble_type</span></label>
              <select class="input input-w-name" v-model="gamble.gamble_type">
                <option v-for="t in GAMBLE_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <!-- LADDER/WHEEL:單行型式補充 -->
            <div class="cfg-field" v-if="gamble.gamble_type === 'LADDER' || gamble.gamble_type === 'WHEEL'">
              <label class="cfg-label">型式補充 <span class="cfg-key">type_desc</span></label>
              <input class="input" type="text" v-model.trim="gamble.type_desc"
                     placeholder="階梯表 / 轉輪分段">
            </div>
            <!-- §4.3 CUSTOM:自由描述式(多行;docgen 原樣收錄;不套結構欄位)-->
            <div class="cfg-field" v-if="gamble.gamble_type === 'CUSTOM'">
              <label class="cfg-label">玩法描述 <span class="cfg-key">type_desc</span></label>
              <textarea class="input cfg-gamble-custom-desc" v-model.trim="gamble.type_desc" rows="4"
                        placeholder="自由描述玩法 / 機率 / 升級條件（例:紅黑加倍,猜中 ×2,可比至免費局數上限;猜錯歸零…）。原樣寫入企劃書。"></textarea>
              <div class="cfg-hint">玩法差異大,不套結構欄位;此描述會原樣收錄進企劃書（docgen）。</div>
            </div>
            <!-- §4.3:非 CUSTOM 才顯示結構化欄位(CUSTOM 只留上方自由描述)-->
            <template v-if="gamble.gamble_type !== 'CUSTOM'">
            <div class="cfg-field">
              <label class="cfg-label">可選倍數 <span class="cfg-key">win_mult_options</span></label>
              <input class="input input-w-name cfg-mono" type="text" v-model.trim="gamble.win_mult_options" placeholder="2,4">
              <div class="cfg-hint">逗號分隔（猜牌色=2；含花色=2,4）。</div>
            </div>
            <div style="display:flex; align-items:flex-start; gap:14px; flex-wrap:wrap;">
              <div class="cfg-field">
                <label class="cfg-label">最大次數 <span class="cfg-key">0=無限</span></label>
                <input class="input input-w-num input-center" type="number" min="0" step="1" v-model.number="gamble.max_rounds">
              </div>
              <div class="cfg-field">
                <label class="cfg-label">封頂 <span class="cfg-key">×注額,0=無</span></label>
                <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="gamble.cap_mult">
              </div>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">適用範圍 <span class="cfg-key">applies_to</span></label>
              <select class="input input-w-name" v-model="gamble.applies_to">
                <option value="ALL_WINS">所有贏分可比</option>
                <option value="BELOW_LIMIT">僅低於門檻的贏分可比</option>
              </select>
              <input v-if="gamble.applies_to === 'BELOW_LIMIT'" class="input input-w-num input-center" type="number"
                     min="0" step="any" style="margin-top:6px;" v-model.number="gamble.applies_limit"
                     placeholder="門檻 ×注額">
            </div>
            <div class="cfg-field">
              <label class="chk">
                <input type="checkbox" v-model="gamble.collect_anytime">
                <span class="box"></span>
                <span>可隨時收下 <span class="cfg-key">collect_anytime</span></span>
              </label>
            </div>
            <!-- v8.23 / G2:非現金賭注/獎勵(規格描述;現金比倍留預設即可)-->
            <div style="display:flex; align-items:flex-start; gap:14px; flex-wrap:wrap;">
              <div class="cfg-field">
                <label class="cfg-label">賭注 <span class="cfg-key">stake_type</span></label>
                <select class="input input-w-name" v-model="gamble.stake_type">
                  <option value="WIN">贏分（WIN）</option>
                  <option value="FREE_SPINS">免費局（FREE_SPINS）</option>
                  <option value="BONUS_ENTRY">進 bonus 資格（BONUS_ENTRY）</option>
                  <option value="BONUS_LEVEL">bonus 等級（BONUS_LEVEL）</option>
                </select>
              </div>
              <div class="cfg-field">
                <label class="cfg-label">獎勵 <span class="cfg-key">reward_type</span></label>
                <select class="input input-w-name" v-model="gamble.reward_type">
                  <option value="MULTIPLY_WIN">倍增贏分（MULTIPLY_WIN）</option>
                  <option value="ADD_SPINS">加免費局（ADD_SPINS）</option>
                  <option value="ENTER_BONUS">進入 bonus（ENTER_BONUS）</option>
                  <option value="UPGRADE_LEVEL">升級等級（UPGRADE_LEVEL）</option>
                </select>
              </div>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">觸發時機（可選）<span class="cfg-key">trigger</span></label>
              <input class="input cfg-mono" type="text" v-model.trim="gamble.gamble_trigger"
                     placeholder="ON_ANY_WIN / BONUS_END …">
              <div class="cfg-hint">何時可比倍（自由描述）；留空 = 沿用型式預設。純描述,判定交下游。</div>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">備註 <span class="cfg-key">notes</span></label>
              <input class="input" type="text" v-model.trim="gamble.notes" placeholder="免費局贏分不可比倍…">
            </div>
            </template>
          </template>
          <div v-else class="cfg-section-off-hint">比倍未啟用 —— 贏分後猜牌色 / 花色 / 階梯翻倍。開啟開關以設定。</div>
        </div>
        </div><!-- /額外押注 群組卡 -->

        <!-- SP_JP_INSERT_ANCHOR:Stage3 將 13_Jackpots 彩池卡插入此處（在獎池級距之前）-->
      <div class="cfg-section cfg-section-card cfg-jackpot-card">
        <div class="cfg-form-header">
          <div class="cfg-form-title">💰 13_Jackpots · JP 彩金</div>
          <div class="cfg-form-sub">定義 JACKPOT 名稱、類型與觸發;文件生成自動帶入,匯出寫入選用分頁 13_Jackpots(模擬引擎忽略)。</div>
        </div>

        <div class="cfg-section">
          <!-- #2 全域類型 -->
          <div class="cfg-field" style="margin-bottom:10px;">
            <label class="cfg-label">全域類型 <span class="cfg-key">套用到所有 JP</span></label>
            <div class="cfg-chip-row">
              <button class="cfg-chip" :class="{ active: jpGlobalType==='FIXED' }" @click="setJpGlobalType('FIXED')" title="全部 JP 皆為固定倍數">固定</button>
              <button class="cfg-chip" :class="{ active: jpGlobalType==='PROGRESSIVE' }" @click="setJpGlobalType('PROGRESSIVE')" title="全部 JP 皆為累積彩池">累積</button>
              <button class="cfg-chip" :class="{ active: jpGlobalType==='CUSTOM' }" @click="setJpGlobalType('CUSTOM')" title="每個 JP 各自選類型">其他(各自設定)</button>
            </div>
            <div class="cfg-hint">選「固定」或「累積」會一次套用到全部 JP;選「其他」則每個 JP 可各自選類型。</div>
          </div>

          <!-- #1 快選新增 -->
          <div class="cfg-field" style="margin-bottom:10px;">
            <label class="cfg-label">快選新增 <span class="cfg-key">一按即新增命名 JP</span></label>
            <div class="cfg-chip-row">
              <button v-for="p in JP_PRESETS" :key="p" class="cfg-chip cfg-chip-sm" @click="addJackpotPreset(p)" title="新增一個命名為此的 JP">＋ {{ p }}</button>
            </div>
            <div class="cfg-hint">預設 0 個 JP。點上面任一顆即新增對應命名(MINI→GRAND 由小到大),也可用下方「新增 JP」自訂。</div>
          </div>

          <div v-if="jackpots.length === 0" class="cfg-hint" style="margin-bottom:8px;">
            尚未定義 JP;沒有 JP 的遊戲可留空,文件生成將不出現 JACKPOT 表。
          </div>

          <div class="cfg-jp-list">
            <div v-for="(j, ji) in jackpots" :key="'jp' + ji" class="cfg-jp-row cfg-reveal-zone">
              <div class="cfg-jp-cell">
                <label class="cfg-label">JP_ID</label>
                <input class="input input-w-num cfg-mono" type="text" v-model.trim="j.jp_id" placeholder="JP1" maxlength="10">
              </div>
              <div class="cfg-jp-cell">
                <label class="cfg-label">名稱</label>
                <input class="input input-w-id" type="text" v-model.trim="j.name" placeholder="GRAND">
              </div>
              <!-- 類型:僅在全域=其他時,每個 JP 才各自選 -->
              <div class="cfg-jp-cell" v-if="jpGlobalType === 'CUSTOM'">
                <label class="cfg-label">類型 <span class="cfg-key">Kind</span></label>
                <div class="cfg-chip-row">
                  <button class="cfg-chip cfg-chip-sm" :class="{ active: j.kind !== 'PROGRESSIVE' }"
                          @click="j.kind = 'FIXED'" title="固定倍數 JP(×注額)">固定</button>
                  <button class="cfg-chip cfg-chip-sm" :class="{ active: j.kind === 'PROGRESSIVE' }"
                          @click="j.kind = 'PROGRESSIVE'" title="累積彩池 JP(seed + 注金抽成)">累積</button>
                </div>
              </div>
              <div class="cfg-jp-cell">
                <label class="cfg-label">{{ j.kind === 'PROGRESSIVE' ? '起始彩池' : '倍數' }} <span class="cfg-key">×注額</span></label>
                <input class="input input-center input-w-num" type="number" min="0" step="any" v-model.number="j.mult">
              </div>
              <div v-if="j.kind === 'PROGRESSIVE'" class="cfg-jp-cell">
                <label class="cfg-label">抽成 <span class="cfg-key">% / 注</span></label>
                <input class="input input-center input-w-num" type="number" min="0" max="100" step="any" v-model.number="j.increment_pct">
              </div>
              <div v-if="j.kind === 'PROGRESSIVE'" class="cfg-jp-cell">
                <label class="cfg-label">必開上限 <span class="cfg-key">×注額,0=無</span></label>
                <input class="input input-center input-w-num" type="number" min="0" step="any" v-model.number="j.must_hit_by">
              </div>
              <div class="cfg-jp-cell cfg-jp-cell-grow">
                <label class="cfg-label">觸發說明</label>
                <input class="input input-w-name" type="text" v-model.trim="j.trigger_desc" placeholder="集滿 6 顆金幣（留空則用下方條件自動生成）">
              </div>
              <!-- v6.2 #4:觸發方式(累積 / 收集)+ 各自條件 -->
              <div class="cfg-jp-cell">
                <label class="cfg-label">觸發方式</label>
                <div class="cfg-chip-row">
                  <button class="cfg-chip cfg-chip-sm" :class="{ active: (j.trigger_type || 'COLLECT') === 'ACCUMULATE' }"
                          @click="j.trigger_type = 'ACCUMULATE'" title="隨投注 / 機制累積">累積</button>
                  <button class="cfg-chip cfg-chip-sm" :class="{ active: (j.trigger_type || 'COLLECT') === 'COLLECT' }"
                          @click="j.trigger_type = 'COLLECT'" title="收集符號 / 進入模式觸發">收集</button>
                </div>
              </div>
              <template v-if="(j.trigger_type || 'COLLECT') === 'ACCUMULATE'">
                <div class="cfg-jp-cell">
                  <label class="cfg-label">押注提撥 <span class="cfg-key">%</span></label>
                  <input class="input input-center input-w-num" type="number" min="0" max="100" step="any" v-model.number="j.accum_pct">
                </div>
                <div class="cfg-jp-cell cfg-jp-cell-grow">
                  <label class="cfg-label">或指定機制 / 符號</label>
                  <input class="input input-w-name" type="text" v-model.trim="j.accum_mech" placeholder="例：每次連爆 +1 進度">
                </div>
              </template>
              <template v-else>
                <div class="cfg-jp-cell">
                  <label class="cfg-label">出現機率 <span class="cfg-key">%</span></label>
                  <input class="input input-center input-w-num" type="number" min="0" max="100" step="any" v-model.number="j.collect_prob">
                </div>
                <div class="cfg-jp-cell cfg-jp-cell-grow">
                  <label class="cfg-label">或進入模式 <span class="cfg-key">FG/BG</span></label>
                  <input class="input input-w-name" type="text" v-model.trim="j.collect_enter" placeholder="例：進入 FG 才開始收集">
                </div>
                <!-- v6.3 / Q2(b):反查 — 哪些蒐集副盤餵入此 JP -->
                <div class="cfg-jp-cell cfg-jp-cell-grow" v-if="panelsFeedingJp(j.jp_id).length">
                  <label class="cfg-label">餵入副盤 <span class="cfg-key">來自 02 蒐集盤</span></label>
                  <div class="cfg-hint">{{ panelsFeedingJp(j.jp_id).map(p => p.panel_id).join('、') }}</div>
                </div>
              </template>
              <!-- §5:反查 — 哪些符號（攜帶值 · 彩金倍數 → JP）餵入此 JP;真相單向在圖示頁 -->
              <div class="cfg-jp-cell cfg-jp-cell-grow" v-if="symbolsFeedingJp(j.jp_id).length">
                <label class="cfg-label">餵入符號 <span class="cfg-key">來自圖示頁攜帶值</span></label>
                <div class="cfg-jp-symlinks">
                  <span v-for="sl in symbolsFeedingJp(j.jp_id)" :key="'sl'+sl.id" class="cfg-jp-symlink"
                        :title="'符號「' + sl.name + '」的彩金倍數連到此 JP（唯讀反查）'">
                    <span class="cfg-jp-symdot" :style="sl.color ? { background: sl.color } : {}"></span>{{ sl.name }}
                  </span>
                  <button class="cfg-jp-goicons" @click="goSymbolsPage()" title="前往圖示頁編輯攜帶值 · 彩金倍數 → JP 連結">前往圖示頁 ↗</button>
                </div>
                <div class="cfg-hint">真相在圖示頁「攜帶值 · 彩金倍數 → JP 連結」（單向）;此處僅唯讀反查。</div>
              </div>
              <div class="cfg-jp-cell cfg-jp-cell-modes">
                <label class="cfg-label">適用模式</label>
                <div class="cfg-chip-row">
                  <button class="cfg-chip cfg-chip-sm" :class="{ active: jackpotHasMode(j, 'ALL') }"
                          @click="toggleJackpotMode(j, 'ALL')">全部</button>
                  <button v-for="mn in modeNames" :key="mn"
                          class="cfg-chip cfg-chip-sm" :class="{ active: jackpotHasMode(j, mn) }"
                          @click="toggleJackpotMode(j, mn)">{{ mn }}</button>
                </div>
              </div>
              <button class="cfg-mode-delete-btn cfg-jp-del cfg-reveal" @click="removeJackpot(ji)" title="刪除此 JP">✕</button>
            </div>
          </div>

          <button class="cfg-mode-add-btn" @click="addJackpot">
            <span style="font-size: 16px;">+</span>
            <span>新增 JP(自訂)</span>
          </button>
        </div>
      </div>
        <!-- v8.25 / G4:獎池級距(與 13_Jackpots 正交;Grand/Major/Minor/Mini + 觸發方式)-->
        <div class="cfg-section" style="margin-top:14px;">
          <div class="cfg-section-title">獎池級距 <span class="cfg-key">19_Jackpot_Tiers</span></div>
          <div class="cfg-hint">Grand / Major / Minor / Mini 式級距階梯 + 整體觸發方式。只描述級距與觸發,不模擬命中率;執行交下游。</div>
          <div class="cfg-field" style="margin-top:8px;">
            <label class="cfg-label">觸發方式 <span class="cfg-key">jackpot_trigger</span></label>
            <select class="input input-w-name" v-model="jackpotCfg.trigger">
              <option v-for="o in JACKPOT_TRIGGER_OPTIONS" :key="'jt'+o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="cfg-field" style="margin-top:8px;">
            <label class="cfg-label">級距清單</label>
            <div v-if="jackpotCfg.tiers.length === 0" class="cfg-hint" style="margin:4px 0;">尚無級距,按下方「＋ 新增級距」開始(如 MINI／MINOR／MAJOR／GRAND)。</div>
            <div v-for="(t, ti) in jackpotCfg.tiers" :key="'jpt'+ti" class="cfg-bonus-item-row cfg-reveal-zone">
              <input class="input input-w-id" type="text" v-model.trim="t.tier" placeholder="層級">
              <input class="input input-w-id" type="text" v-model.trim="t.label" placeholder="名稱（GRAND…）">
              <div class="cfg-bonus-icell">
                <span class="cfg-bonus-ilabel">值×注額</span>
                <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="t.value">
              </div>
              <input class="input" type="text" v-model.trim="t.notes" placeholder="備註">
              <button class="cfg-mode-delete-btn cfg-reveal" @click="removeJackpotTier(ti)" title="刪除">✕</button>
            </div>
            <button class="cfg-action-add-btn" style="margin-top:6px;" @click="addJackpotTier">＋ 新增級距</button>
          </div>
        </div>

        <!-- 架構檢閱 #21:收集條 / 進度條(拼圖式機制原生只能描述單次事件→單次動作,
             收集條類玩法需要跨局/跨消除持續累積的狀態,故獨立成第一級描述)。 -->
        <div class="cfg-section" style="margin-top:14px;">
          <details class="cfg-section-collapsible" :open="meters.length > 0">
            <summary class="cfg-section-title">收集條 / 進度條 <span class="cfg-key">21_Collection_Meters</span></summary>
            <div class="cfg-hint">
              跨局/跨消除持續累積的進度條(如 Scatter 收集、金幣計量)。填充來源命中一次累積 Fill_Amount,
              到 Capacity 即視為集滿(0 = 無上限,純計數不觸發集滿動作)。純描述,本工具不模擬累積時機,執行交下游。
            </div>
            <div v-if="meters.length === 0" class="cfg-hint" style="margin:4px 0;">尚無收集條,按下方「新增收集條」開始(如 Scatter 收集、金幣計量)。</div>
            <div v-for="(mt, mi) in meters" :key="mt.meter_id || mi" class="cfg-field cfg-field-compact cfg-reveal-zone" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              <span class="cfg-key" style="min-width:52px;">{{ mt.meter_id }}</span>
              <input class="input input-sm" type="text" v-model.trim="mt.label" placeholder="顯示名(如:糖果收集條)" style="width:160px;">
              <input class="input input-sm cfg-mono" type="text" v-model.trim="mt.mode_scope" placeholder="ALL 或 NG,FG1" title="生效模式:ALL 或逗號多選" style="width:110px;">
              <input class="input input-sm cfg-mono" type="text" v-model.trim="mt.fill_source" placeholder="填充來源:symbol_id 或條件式" style="flex:1; min-width:180px;" title="慣例填 symbol_id(如 SCAT)或條件式(沿用規則頁 DSL 語彙)">
              <span class="cfg-bonus-icell">
                <span class="cfg-bonus-ilabel">每次+</span>
                <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="mt.fill_amount" style="width:64px;">
              </span>
              <span class="cfg-bonus-icell">
                <span class="cfg-bonus-ilabel">容量</span>
                <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="mt.capacity" style="width:64px;" title="0 = 無上限(純計數)">
              </span>
              <select class="input input-sm" v-model="mt.reset_scope" style="width:110px;" title="歸零範圍">
                <option v-for="rs in METER_RESET_SCOPES" :key="'mrs'+rs" :value="rs">{{ rs }}</option>
              </select>
              <input class="input input-sm" type="text" v-model.trim="mt.on_full_action"
                     :placeholder="Number(mt.tier_step) > 0 ? '每步動作(如 CONVERT:upgrade)' : '集滿動作(如 AWARD_FREE_SPIN)'"
                     :title="Number(mt.tier_step) > 0 ? '比率型:每 N 個觸發的動作' : '容量集滿時的終局動作'"
                     style="flex:1; min-width:160px;">
              <select class="input input-sm" v-model="mt.link_jackpot" style="width:130px;" title="集滿連動的彩池">
                <option value="">(不連動彩池)</option>
                <option v-for="j in jackpots" :key="'mtjp'+j.jp_id" :value="j.jp_id">{{ j.jp_id }}{{ j.name ? '·'+j.name : '' }}</option>
              </select>
              <label class="chk" title="切換模式時是否延續累積(否=視同離開此收集條情境)">
                <input type="checkbox" v-model="mt.carry_over">
                <span class="box"></span>
                <span>跨模式延續</span>
              </label>
              <input class="input input-sm" type="text" v-model="mt.notes" placeholder="備註" style="flex:1; min-width:120px;">
              <button class="btn-pill" @click="duplicateMeter(mi)" title="複製此收集條">⧉ 複製</button>
              <button class="cfg-mode-delete-btn cfg-reveal" @click="removeMeter(mi)" title="刪除此收集條">✕</button>
              <!-- G-1:分段門檻(絕對) / 比率型升級。純描述;觸發時機交下游。 -->
              <details class="cfg-meter-tiers" style="width:100%; margin-top:2px;"
                       :open="(mt.tiers && mt.tiers.length) || Number(mt.tier_step) > 0">
                <summary style="cursor:pointer; font-size:12px; opacity:.85; user-select:none;">
                  分段門檻 / 比率升級
                  <span v-if="Number(mt.tier_step) > 0" class="cfg-key">比率型・每 {{ mt.tier_step }} 個</span>
                  <span v-else-if="mt.tiers && mt.tiers.length" class="cfg-key">{{ mt.tiers.length }} 段</span>
                </summary>
                <div style="padding:6px 0 2px 8px;">
                  <div class="cfg-gen-subtoggle" style="margin-bottom:6px;">
                    <button class="cfg-gen-subbtn" :class="{ active: !(Number(mt.tier_step) > 0) }"
                            @click="setMeterTierMode(mi, 'absolute')">絕對門檻</button>
                    <button class="cfg-gen-subbtn" :class="{ active: Number(mt.tier_step) > 0 }"
                            @click="setMeterTierMode(mi, 'ratio')">比率型</button>
                  </div>
                  <!-- 絕對門檻 -->
                  <template v-if="!(Number(mt.tier_step) > 0)">
                    <div class="cfg-hint" style="margin:2px 0;">累積值達各門檻時觸發對應動作(如 Tome Portal 7/14/27/42)。上方「集滿動作」為容量集滿的終局動作,與此並存。</div>
                    <div v-for="(tr, ti) in mt.tiers" :key="'mt'+mi+'t'+ti" class="cfg-field cfg-field-compact"
                         style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:3px 0;">
                      <span class="cfg-bonus-icell">
                        <span class="cfg-bonus-ilabel">門檻</span>
                        <input class="input input-w-num input-center" type="number" min="0" step="any" v-model.number="tr.threshold" style="width:64px;">
                      </span>
                      <input class="input input-sm cfg-mono" type="text" list="meterTierActions" v-model.trim="tr.action" placeholder="動作(如 SPAWN)" style="width:160px;" title="ActionType 字面值或自由文字">
                      <input class="input input-sm" type="text" v-model.trim="tr.params" placeholder="參數(如 special_wild x2)" style="flex:1; min-width:150px;" title="動作參數(可含冒號;需含分號時整體改 JSON 匯出)">
                      <button class="cfg-mode-delete-btn" @click="removeMeterTier(mi, ti)" title="刪除此分段">✕</button>
                    </div>
                    <button class="btn-pill" @click="addMeterTier(mi)" title="新增一段門檻"><span style="font-size:14px">+</span> 分段門檻</button>
                  </template>
                  <!-- 比率型 -->
                  <template v-else>
                    <div class="cfg-hint" style="margin:2px 0;">每累積 N 個觸發一次上方「每步動作」(如 xWays Hoarder 每 3 升級)。</div>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                      <span class="cfg-bonus-icell">
                        <span class="cfg-bonus-ilabel">每</span>
                        <input class="input input-w-num input-center" type="number" min="1" step="1" v-model.number="mt.tier_step" style="width:64px;">
                        <span class="cfg-bonus-ilabel">個觸發</span>
                      </span>
                      <label class="chk" title="是否每個倍數都觸發(否=僅第一個 N 觸發一次)">
                        <input type="checkbox" v-model="mt.tier_repeat">
                        <span class="box"></span>
                        <span>可重複(每個倍數都觸發)</span>
                      </label>
                    </div>
                  </template>
                </div>
              </details>
              <div v-if="meterWarn(mt)" class="cfg-warn cfg-warn-inline" style="width:100%;">{{ meterWarn(mt) }}</div>
            </div>
            <!-- G-1:tier 動作建議清單(單一,置於 v-for 外避免重複 id;隨 ACTION_CATALOG 自動更新) -->
            <datalist id="meterTierActions">
              <option v-for="a in ACTION_CATALOG" :key="'mta'+a.type" :value="a.type">{{ a.label }}</option>
            </datalist>
            <button class="cfg-mode-add-btn" @click="addMeter">
              <span style="font-size:16px">+</span>
              <span>新增收集條</span>
            </button>
          </details>
        </div>
      </div><!-- /gamble -->

      <!-- ─── 04b:真實輪帶（v6.0-b）─── -->
      <div v-else-if="active === 'reel_strips'" class="cfg-form cfg-strips-form">
        <!-- 權重頁 W1:peer 分段(輪帶 / 分佈)+ 子切換;複用規則 peer / subtoggle CSS -->
        <div class="cfg-rule-peers">
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'reels' }" @click="gotoWeightPeer('reels')">輪帶</button>
          <button class="cfg-rule-peer" :class="{ active: weightPeer === 'dist' }" @click="gotoWeightPeer('dist')">分佈</button>
        </div>
        <div v-if="weightPeer === 'reels'" class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_weights' }" @click="active = 'reel_weights'">權重矩陣</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'reel_strips' }" @click="active = 'reel_strips'">真實輪帶</button>
        </div>
        <div v-else class="cfg-gen-subtoggle">
          <button class="cfg-gen-subbtn" :class="{ active: active === 'grid_size_weights' }" @click="active = 'grid_size_weights'">格數分佈</button>
          <button class="cfg-gen-subbtn" :class="{ active: active === 'distribution_bins' }" @click="active = 'distribution_bins'">倍數區間</button>
        </div>
        <div class="cfg-section">
          <div class="cfg-section-title">真實輪帶 <span class="cfg-key">04b_Reel_Strips</span></div>
          <div class="cfg-hint">
            實體輪帶序列（取代虛擬權重抽樣）。啟用後引擎以「隨機停點 + 連續視窗」方式落盤，
            連續相同符號會自然形成 <strong>stacked</strong>。可與 04 權重雙向轉換。
          </div>
          <div class="cfg-field">
            <label class="chk">
              <input type="checkbox" v-model="reelStrips.enabled">
              <span class="box"></span>
              <span>{{ reelStrips.enabled ? '已啟用（引擎用輪帶）' : '關閉（引擎用 04 權重）' }}</span>
            </label>
          </div>
        </div>

        <template v-if="reelStrips.enabled">
          <div v-if="modeNames.length === 0" class="cfg-empty-state">
            <div class="cfg-empty-icon">🚧</div>
            <div class="cfg-empty-text">請先到 <a href="#" @click.prevent="navTo('global')" class="cfg-link">01_Global</a> 新增模式。</div>
          </div>

          <template v-else>
            <!-- 模式選擇 + 批次工具 -->
            <div class="cfg-strips-bar">
              <div class="cfg-strips-modes">
                <button v-for="mn in modeNames" :key="mn"
                        class="cfg-chip" :class="{ active: stripActiveMode === mn }"
                        @click="stripActiveMode = mn">{{ mn }}</button>
                <!-- v8.43 / C-1:輪帶變體 chip(當前 base 模式的 "模式#變體名" 鍵;
                     SWITCH_STRIP(variant=) 引用;主帶零影響) -->
                <template v-for="vk in stripVariantsOf(stripActiveMode)" :key="vk">
                  <button class="cfg-chip cfg-chip-variant" :class="{ active: stripActiveMode === vk }"
                          :title="'輪帶變體 ' + vk + '(規則以 SWITCH_STRIP(variant=&quot;' + vk + '&quot;) 引用)'"
                          @click="selectStripKey(vk)">#{{ vk.slice(stripBaseOf(vk).length + 1) }}<span
                            class="cfg-chip-x" title="刪除此變體"
                            @click.stop="removeStripVariant(vk)">✕</span></button>
                </template>
                <button class="cfg-chip cfg-chip-add-variant" title="為當前模式新增輪帶變體(整帶置換用;White Rabbit 皇后輪式)"
                        @click="addStripVariant()">＋變體</button>
              </div>
              <div class="cfg-strips-tools">
                <label class="cfg-strips-tool-label">長度
                  <input type="number" min="5" max="500" step="1" v-model.number="stripGenLen" class="input input-w-num input-center">
                </label>
                <button class="cfg-matrix-btn" @click="stripGenLen = suggestedStripLen()"
                        :title="'依盤面自動建議(最大視窗列數 × 8):' + suggestedStripLen() + ' 格'">建議 {{ suggestedStripLen() }}</button>
                <label class="cfg-strips-tool-label">
                  <input type="checkbox" v-model="stripGenStacked"> stacked
                </label>
                <button class="cfg-matrix-btn" @click="genAllStripsFromWeights(stripActiveMode, stripGenLen, stripGenStacked)"
                        title="依 04 權重生成全部輪帶">⇄ 由權重生成全部</button>
                <button class="cfg-matrix-btn" @click="applyAllStripsToWeights(stripActiveMode)"
                        title="把全部輪帶計次寫回 04 權重">⇄ 全部轉回權重</button>
              </div>
            </div>

            <!-- v8.13/批C:07b 產牌限制 × 輪帶 必然衝突提示(可靠推論:min>0 但全部輪帶 0 次) -->
            <div v-if="stripLimitConflicts(stripActiveMode).length" class="cfg-strips-conflicts">
              <span class="cfg-strips-conflicts-icon">⚠</span>
              <span class="cfg-strips-conflicts-text">
                與 <a href="#" @click.prevent="gotoRulesSub('genlimits')" class="cfg-link">07b 產牌限制</a> 必然衝突:
                <template v-for="(cf, i) in stripLimitConflicts(stripActiveMode)" :key="cf.limit_id + cf.symbol_id">
                  <template v-if="i > 0">、</template>「{{ cf.symbol_id }}」要求盤面 ≥{{ cf.min }} 顆,但所有輪帶皆 0 次(永遠湊不出下限)
                </template>
              </span>
            </div>

            <!-- 每 reel 一條輪帶 -->
            <div class="cfg-strips-list">
              <div v-for="r in layout" :key="'strip'+r.reel_id" class="cfg-strip-row">
                <div class="cfg-strip-head">
                  <span class="cfg-strip-rid">R{{ r.reel_id }}</span>
                  <span class="cfg-strip-len" :class="{ err: stripLen(stripActiveMode, r.reel_id) > 0 && stripLen(stripActiveMode, r.reel_id) < r.max_rows }">
                    {{ stripLen(stripActiveMode, r.reel_id) }} 格<template v-if="stripLen(stripActiveMode, r.reel_id) < r.max_rows && stripLen(stripActiveMode, r.reel_id) > 0">（&lt; 顯示 {{ r.max_rows }}）</template>
                  </span>
                  <span class="cfg-strip-actions">
                    <button class="cfg-matrix-btn" @click="genStripFromWeights(stripActiveMode, r.reel_id, stripGenLen, stripGenStacked)" title="由此 reel 的 04 權重生成">⇄ 生成</button>
                    <button class="cfg-matrix-btn" @click="applyStripToWeights(stripActiveMode, r.reel_id)" title="此輪帶計次寫回 04 權重">⇄ 轉權重</button>
                  </span>
                </div>
                <textarea class="input cfg-mono cfg-strip-text"
                          v-model="stripStr[stripActiveMode][r.reel_id]"
                          @input="commitStrip(stripActiveMode, r.reel_id)"
                          rows="2"
                          placeholder="H1, H1, L1, WILD, L2, ...（逗號分隔;連續相同=stacked）"></textarea>
                <!-- W3:唯讀色帶預覽(§3.2「色帶呈現」;每段=一符號色,hover 顯 sid;與上方文字即時一致)-->
                <div v-if="stripLen(stripActiveMode, r.reel_id)" class="cfg-strip-band" title="真實輪帶序列(色帶預覽)">
                  <span v-for="(sid, si) in stripBand(stripActiveMode, r.reel_id)" :key="si"
                        class="cfg-strip-band-seg"
                        :style="{ background: stripSegColor(sid) }"
                        :title="sid"></span>
                </div>
                <!-- v8.13/批C:分佈 chips 升級為「輪帶% vs 04 權重目標% vs Δ」對照表;|Δ|>3% 高亮 -->
                <div v-if="stripLen(stripActiveMode, r.reel_id)" class="cfg-strip-cmp">
                  <div class="cfg-strip-cmp-row cfg-strip-cmp-head">
                    <span>符號</span><span>次數</span><span>輪帶%</span><span>權重目標%</span><span>Δ</span>
                  </div>
                  <div v-for="d in stripCompare(stripActiveMode, r.reel_id)" :key="d.sid"
                       class="cfg-strip-cmp-row"
                       :class="{ 'is-off': !d.unknown && d.delta !== null && Math.abs(d.delta) > 3, 'is-unknown': d.unknown }">
                    <span class="cfg-strip-cmp-sid">{{ d.sid }}<template v-if="d.unknown"> ⚠未定義</template></span>
                    <span>×{{ d.count }}</span>
                    <span>{{ d.stripPct.toFixed(1) }}%</span>
                    <span>{{ d.unknown ? '—' : d.weightPct.toFixed(1) + '%' }}</span>
                    <span class="cfg-strip-cmp-delta">{{ d.delta === null ? '—' : (d.delta >= 0 ? '+' : '') + d.delta.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
        <!-- ── v8.38 / GAP-T1:輪帶連動(04c_Reel_Links;Twin Spin 每局隨機抽連動組)── -->
        <div class="cfg-section">
          <details class="cfg-section-collapsible" :open="reelLinks.length > 0">
            <summary class="cfg-section-title">輪帶連動 <span class="cfg-key">04c_Reel_Links</span></summary>
            <div class="cfg-hint">
              相鄰/指定輪帶同步(內容相同或鏡射)。一列 = 一個連動配置選項,每局在同適用模式內依權重抽一列;
              「輪帶」留空 = 本局無連動選項。純描述,抽取與同步由下游實作。
            </div>
            <div v-for="(lk, li) in reelLinks" :key="lk.link_id || li" class="cfg-field cfg-field-compact" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              <span class="cfg-key" style="min-width:56px;">{{ lk.link_id }}</span>
              <select class="input input-sm" v-model="lk.mode_scope" style="width:110px;" title="適用模式">
                <option value="ALL">ALL</option>
                <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
              </select>
              <input class="input input-sm cfg-mono" v-model.trim="lk.reels" placeholder="輪帶(如 2,3;空=無連動)" style="width:150px;" title="1-based 輪號逗號清單">
              <input class="input input-sm cfg-mono" type="number" v-model.number="lk.weight" placeholder="權重" style="width:80px;" title="每局抽選權重">
              <span class="cfg-chip-row">
                <button class="cfg-chip cfg-chip-sm" :class="{ active: lk.link_kind === 'CLONE' }" @click="lk.link_kind = 'CLONE'" title="連動輪內容完全相同">相同</button>
                <button class="cfg-chip cfg-chip-sm" :class="{ active: lk.link_kind === 'MIRROR' }" @click="lk.link_kind = 'MIRROR'" title="連動輪內容左右鏡射">鏡射</button>
              </span>
              <input class="input input-sm" v-model="lk.notes" placeholder="備註" style="flex:1; min-width:120px;">
              <button class="btn-pill" @click="removeReelLink(li)" title="刪除此列">✕</button>
              <div v-if="reelLinkWarn(lk)" class="cfg-warn cfg-warn-inline" style="width:100%;">{{ reelLinkWarn(lk) }}</div>
            </div>
            <button class="btn-pill" @click="addReelLink">＋ 新增連動選項</button>
          </details>
        </div>
      </div><!-- /reel_strips -->

      <!-- v6.4 死碼移除:15_Multipliers / 16_Coin_Values 編輯 UI 區塊(分頁不可達)已移除。
           資料物件 multipliers/coinValues 仍由遷移/存檔/驗證層維護,見 setup.js。 -->



      <!-- ═══════ 📄 文件生成（跨分頁輸出，非 A.xlsx 設定）═══════ -->
      <div v-else-if="active === 'docgen'" class="cfg-docgen-host">
        <doc-gen-page @status="$emit('status', $event)"></doc-gen-page>
      </div>

      <!-- ═══════ 其他尚未實作的分頁 placeholder ═══════ -->
      <div v-else class="cfg-todo">
        <div class="cfg-todo-icon">{{ activeTab.icon }}</div>
        <div class="cfg-todo-sheet">{{ activeTab.sheet }}</div>
        <div class="cfg-todo-name">{{ activeTab.name }}</div>
        <div class="cfg-todo-status">尚未實作</div>
        <div v-if="activeTab.hint" class="cfg-todo-hint">
          <span class="cfg-todo-hint-icon">💡</span>
          <span>{{ activeTab.hint }}</span>
        </div>
      </div>

    </div>
  </div>

  <!-- ── #15 Ctrl+K 全編輯器搜尋 Modal ── -->
  <div v-if="searchOpen" class="cfg-search-overlay" @click.self="closeSearch">
    <div class="cfg-search-modal" @keydown="onSearchKeydown">
      <div class="cfg-search-input-wrap">
        <span class="cfg-search-input-icon">🔍</span>
        <input class="cfg-search-input"
               v-model="searchQuery"
               type="text"
               placeholder="搜尋分頁、模式、符號、規則、欄位…或直接執行動作(Esc 關閉)"
               autocomplete="off"
               spellcheck="false">
        <span class="cfg-search-kbd">Ctrl+K</span>
      </div>

      <div class="cfg-search-results">
        <div v-if="searchResults.length === 0" class="cfg-search-empty">
          沒有結果。試試模式名(FG1)、符號名(WILD)、分頁名(規則)、欄位 key(pay_type),或動作(匯出、重設、健檢)。
        </div>
        <div v-else>
          <div v-for="(item, idx) in searchResults" :key="item.id"
               class="cfg-search-item"
               :class="{ active: idx === searchSelectedIdx }"
               @click="executeSearchResult(item)"
               @mouseenter="searchSelectedIdx = idx">
            <span class="cfg-search-item-icon">{{ item.icon }}</span>
            <div class="cfg-search-item-text">
              <div class="cfg-search-item-title">{{ item.title }}</div>
              <div class="cfg-search-item-subtitle">{{ item.subtitle }}</div>
            </div>
            <span class="cfg-search-item-cat" :class="{ 'is-action': item.category === 'action' }">{{ item.categoryLabel }}</span>
          </div>
        </div>
      </div>

      <div class="cfg-search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 導覽</span>
        <span><kbd>Enter</kbd> 跳轉 / 執行</span>
        <span><kbd>Esc</kbd> 關閉</span>
        <span class="cfg-search-footer-count">{{ searchResults.length }} 個結果</span>
      </div>
    </div>
  </div>

  <!-- UI/UX 改版 P2:快捷鍵與右鍵選單一覽(降低學習成本;按 Shift+? 或點頂列「快捷鍵」開啟) -->
  <div v-if="shortcutsHelpOpen" class="cfg-search-overlay" @click.self="closeShortcutsHelp">
    <div class="cfg-shortcuts-modal">
      <div class="cfg-shortcuts-header">
        <span class="cfg-shortcuts-header-icon">⌨</span>
        <span class="cfg-shortcuts-header-title">快捷鍵與右鍵選單一覽</span>
        <button class="cfg-diff-close" @click="closeShortcutsHelp" title="關閉">✕</button>
      </div>
      <div class="cfg-shortcuts-body">
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">全站</div>
          <div class="cfg-shortcuts-row"><span>開啟全編輯器搜尋 / 快速動作</span><span class="cfg-shortcuts-keys"><kbd>Ctrl</kbd>+<kbd>K</kbd></span></div>
          <div class="cfg-shortcuts-row"><span>開啟 / 關閉本說明</span><span class="cfg-shortcuts-keys"><kbd>Shift</kbd>+<kbd>?</kbd></span></div>
          <div class="cfg-shortcuts-row"><span>關閉目前開啟的選單 / 彈窗 / 抽屜</span><span class="cfg-shortcuts-keys"><kbd>Esc</kbd></span></div>
        </div>
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">規則頁</div>
          <div class="cfg-shortcuts-row"><span>右鍵規則列:複製 / 停用 / 刪除</span><span class="cfg-shortcuts-keys">滑鼠右鍵</span></div>
          <div class="cfg-shortcuts-row"><span>刪除目前選取的規則</span><span class="cfg-shortcuts-keys"><kbd>Delete</kbd> / <kbd>Backspace</kbd></span></div>
          <div class="cfg-shortcuts-row"><span>複製目前選取的規則</span><span class="cfg-shortcuts-keys"><kbd>Ctrl</kbd>+<kbd>D</kbd></span></div>
        </div>
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">符號清單頁</div>
          <div class="cfg-shortcuts-row"><span>右鍵圖示:複製 / 停用 / 上移 / 下移 / 刪除</span><span class="cfg-shortcuts-keys">滑鼠右鍵</span></div>
          <div class="cfg-shortcuts-row"><span>刪除目前選取的圖示</span><span class="cfg-shortcuts-keys"><kbd>Delete</kbd> / <kbd>Backspace</kbd></span></div>
          <div class="cfg-shortcuts-row"><span>複製目前選取的圖示</span><span class="cfg-shortcuts-keys"><kbd>Ctrl</kbd>+<kbd>D</kbd></span></div>
        </div>
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">權重表(Reel / 格數 / 爆分連段)</div>
          <div class="cfg-shortcuts-row"><span>右鍵列上任一格:開啟「整列操作」(填值 / ×2÷2 / 正規化 / 複製到所有 Reel / 歸 0)</span><span class="cfg-shortcuts-keys">滑鼠右鍵</span></div>
          <div class="cfg-shortcuts-row"><span>復原 / 重做批次操作</span><span class="cfg-shortcuts-keys"><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></span></div>
        </div>
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">盤面結構頁</div>
          <div class="cfg-shortcuts-row"><span>右鍵畫布格子:依主輪格 / 副盤 / 空白顯示對應選單</span><span class="cfg-shortcuts-keys">滑鼠右鍵</span></div>
          <div class="cfg-shortcuts-row"><span>切換上一輪 / 下一輪</span><span class="cfg-shortcuts-keys"><kbd>←</kbd> / <kbd>→</kbd></span></div>
        </div>
        <div class="cfg-shortcuts-group">
          <div class="cfg-shortcuts-group-title">中獎線頁</div>
          <div class="cfg-shortcuts-row"><span>右鍵中獎線列:編輯 / 刪除</span><span class="cfg-shortcuts-keys">滑鼠右鍵</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── #16 範本 diff modal ── -->
  <div v-if="diffOpen" class="cfg-diff-overlay" @click.self="closeDiffModal">
    <div class="cfg-diff-modal">
      <div class="cfg-diff-header">
        <span class="cfg-diff-icon">⇄</span>
        <span class="cfg-diff-title">範本比較</span>
        <button class="cfg-diff-close" @click="closeDiffModal" title="關閉">✕</button>
      </div>

      <!-- 階段 1:選擇兩個範本 -->
      <template v-if="diffSelecting">
        <div class="cfg-diff-pickbar">
          <button class="cfg-diff-slot"
                  :class="{ active: diffPickFor === 'A', filled: !!diffPickA }"
                  @click="diffPickFor = 'A'">
            <span class="cfg-diff-slot-label">範本 A</span>
            <span class="cfg-diff-slot-name">{{ diffPickA ? (templateList.find(t => t.slug === diffPickA) || {}).name || diffPickA : '(尚未選擇)' }}</span>
          </button>
          <span class="cfg-diff-slot-arrow">→</span>
          <button class="cfg-diff-slot"
                  :class="{ active: diffPickFor === 'B', filled: !!diffPickB }"
                  @click="diffPickFor = 'B'">
            <span class="cfg-diff-slot-label">範本 B</span>
            <span class="cfg-diff-slot-name">{{ diffPickB ? (templateList.find(t => t.slug === diffPickB) || {}).name || diffPickB : '(尚未選擇)' }}</span>
          </button>
        </div>
        <div class="cfg-diff-pick-hint">
          目前選擇:<strong>{{ diffPickFor === 'A' ? '範本 A' : '範本 B' }}</strong> · 點下方範本可指派
        </div>
        <div class="cfg-diff-pick-list">
          <div v-for="t in templateList" :key="t.slug"
               class="cfg-diff-pick-item"
               :class="{
                 'is-a': diffPickA === t.slug,
                 'is-b': diffPickB === t.slug,
                 'is-auto': t.name && t.name.startsWith('🤖'),
               }"
               @click="pickTemplateForDiff(t.slug)">
            <div class="cfg-diff-pick-info">
              <div class="cfg-diff-pick-name">{{ t.name }}</div>
              <div class="cfg-diff-pick-meta">
                建立 {{ t.created.slice(0,10) }} ·
                模式 {{ t.counts.modes }} · 規則 {{ t.counts.rules }} · 符號 {{ t.counts.symbols }}
              </div>
            </div>
            <span v-if="diffPickA === t.slug" class="cfg-diff-pick-badge cfg-diff-pick-badge-a">A</span>
            <span v-if="diffPickB === t.slug" class="cfg-diff-pick-badge cfg-diff-pick-badge-b">B</span>
          </div>
        </div>
        <div class="cfg-diff-footer">
          <button class="cfg-diff-action-btn cfg-diff-cancel"
                  @click="closeDiffModal">取消</button>
          <button class="cfg-diff-action-btn cfg-diff-go"
                  @click="runTemplateDiff"
                  :disabled="!diffPickA || !diffPickB || diffPickA === diffPickB">
            ⇄ 開始比較
          </button>
        </div>
      </template>

      <!-- 階段 2:顯示 diff 結果 -->
      <template v-else>
        <div class="cfg-diff-headerbar">
          <button class="cfg-diff-back" @click="diffBackToSelecting" title="回到選擇">‹ 重新選擇</button>
          <div class="cfg-diff-pair">
            <span class="cfg-diff-pair-name cfg-diff-pair-a">{{ diffComparisonResult.tplA.name }}</span>
            <button class="cfg-diff-pair-swap" @click="diffSwapAB" title="交換 A / B">⇄</button>
            <span class="cfg-diff-pair-name cfg-diff-pair-b">{{ diffComparisonResult.tplB.name }}</span>
          </div>
          <span class="cfg-diff-total">{{ diffTotalCount }} 項差異</span>
        </div>

        <div class="cfg-diff-body">
          <div v-if="diffTotalCount === 0" class="cfg-diff-empty">
            <div class="cfg-diff-empty-emoji">≡</div>
            <div class="cfg-diff-empty-text">兩個範本的設定完全相同</div>
            <div class="cfg-diff-empty-sub">所有 12 個分頁的內容一致</div>
          </div>
          <div v-else>
            <div v-for="grp in diffComparisonResult.changes" :key="grp.tab" class="cfg-diff-tab-group">
              <div class="cfg-diff-tab-header">
                <span class="cfg-diff-tab-name">{{ grp.sheet }}</span>
                <span class="cfg-diff-tab-count">{{ grp.changes.length }}</span>
              </div>
              <div v-for="(c, idx) in grp.changes" :key="idx"
                   class="cfg-diff-item"
                   :class="'cfg-diff-item-' + c.kind">
                <span class="cfg-diff-item-icon">{{ c.kind === 'add' ? '+' : c.kind === 'remove' ? '−' : '~' }}</span>
                <div class="cfg-diff-item-text">
                  <div class="cfg-diff-item-msg">{{ c.text }}</div>
                  <div v-if="c.detail" class="cfg-diff-item-detail">{{ c.detail }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="cfg-diff-footer">
          <span class="cfg-diff-footer-hint">⚠ 「+」「−」是相對於 A 來說 B 新增/移除的內容</span>
          <button class="cfg-diff-action-btn cfg-diff-cancel"
                  @click="closeDiffModal">關閉</button>
        </div>
      </template>
    </div>
  </div>

  <!-- ── #5 Test Inspector dock(09/10/11 共用,fixed 在 viewport 右下)── -->
  <div v-if="isInPuzzleTab"
       class="cfg-inspector-dock"
       :class="{ collapsed: !inspectorOpen }">

    <!-- header(永遠顯示,點擊收合)-->
    <div class="cfg-inspector-header" @click="inspectorOpen = !inspectorOpen">
      <span class="cfg-inspector-header-icon">🧪</span>
      <span class="cfg-inspector-header-title">測試檢查器 <span class="cfg-key">Test Inspector</span></span>
      <template v-if="inspectorOpen && pinnedTest">
        <span class="cfg-inspector-pinned-chip">
          {{ pinnedKindLabel(pinnedTest.kind) }} · <code>{{ pinnedTest.label }}</code>
          <span class="cfg-inspector-unpin" @click.stop="unpinTest" title="取消釘住">✕</span>
        </span>
      </template>
      <template v-else-if="inspectorOpen">
        <span class="cfg-inspector-noting">未釘住任何條件</span>
      </template>
      <span class="cfg-inspector-collapse-caret">{{ inspectorOpen ? '▾' : '▴' }}</span>
    </div>

    <div v-if="inspectorOpen" class="cfg-inspector-body">

      <!-- 評估結果 -->
      <div class="cfg-inspector-result"
           :class="{
             'is-true':  evalPinned().result === true,
             'is-false': evalPinned().result === false,
             'is-empty': evalPinned().empty || evalPinned().nopin,
             'is-error': !evalPinned().ok,
           }">
        <template v-if="evalPinned().nopin">
          <span class="cfg-inspector-result-icon">📌</span>
          <span class="cfg-inspector-result-label">點任一規則「釘到測試檢查器」即可開始測試</span>
        </template>
        <template v-else-if="evalPinned().empty">
          <span class="cfg-inspector-result-icon">∅</span>
          <span class="cfg-inspector-result-label">此規則無條件可測試</span>
        </template>
        <template v-else-if="!evalPinned().ok">
          <span class="cfg-inspector-result-icon">⚠</span>
          <span class="cfg-inspector-result-label">錯誤:{{ evalPinned().error }}</span>
        </template>
        <template v-else-if="evalPinned().result === true">
          <span class="cfg-inspector-result-icon">✓</span>
          <span class="cfg-inspector-result-label">TRUE — 條件成立</span>
        </template>
        <template v-else>
          <span class="cfg-inspector-result-icon">✕</span>
          <span class="cfg-inspector-result-label">FALSE — 條件不成立</span>
        </template>
      </div>

      <!-- Trace(逐項判定)-->
      <div v-if="evalPinned().trace && evalPinned().trace.length > 0" class="cfg-inspector-trace">
        <div class="cfg-inspector-trace-title">逐項判定 ({{ evalPinned().trace.length }})</div>
        <div v-for="(t, ti) in evalPinned().trace" :key="ti"
             class="cfg-inspector-trace-row"
             :class="{ 'is-true': t.value === true, 'is-false': t.value === false }">
          <span class="cfg-inspector-trace-idx">{{ ti + 1 }}</span>
          <code class="cfg-inspector-trace-expr">{{ t.category }}{{ t.subkey ? '.' + t.subkey : '' }} {{ t.op }} {{ t.value === true || t.value === false ? '' : t.value }}</code>
          <span class="cfg-inspector-trace-arrow">→</span>
          <code class="cfg-inspector-trace-vals">lhs={{ JSON.stringify(t.lhs) }} / rhs={{ JSON.stringify(t.rhs) }}</code>
          <span class="cfg-inspector-trace-result">{{ t.value === true ? '✓' : (t.value === false ? '✕' : '?') }}</span>
        </div>
      </div>

      <!-- 測試 Context 編輯區(預設折疊節省空間)-->
      <div class="cfg-inspector-ctx">
        <button class="cfg-inspector-ctx-toggle" @click="inspectorCtxExpanded = !inspectorCtxExpanded">
          <span>📋 假 EvalContext</span>
          <span class="cfg-inspector-ctx-summary">
            mode={{ testCtx.mode }} ·
            symbol_count={{ testCtx.symbol_count_str || '∅' }}
          </span>
          <span class="cfg-inspector-ctx-caret">{{ inspectorCtxExpanded ? '▾' : '▸' }}</span>
        </button>
        <div v-if="inspectorCtxExpanded" class="cfg-inspector-ctx-grid">
          <div class="cfg-inspector-ctx-field">
            <label>mode</label>
            <input class="input cfg-mono input-w-id" type="text" v-model.trim="testCtx.mode">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>combo_step</label>
            <input class="input cfg-mono input-w-num" type="number" v-model.number="testCtx.combo_step">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>multiplier</label>
            <input class="input cfg-mono input-w-num" type="number" step="any" v-model.number="testCtx.multiplier">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>total_multiplier</label>
            <input class="input cfg-mono input-w-num" type="number" step="any" v-model.number="testCtx.total_multiplier">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>consecutive_dead_spins</label>
            <input class="input cfg-mono input-w-num" type="number" v-model.number="testCtx.consecutive_dead_spins">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>event(上一個 EMIT)</label>
            <input class="input cfg-mono input-w-id" type="text" v-model.trim="testCtx.event"
                   placeholder="fg_trigger">
          </div>
          <div class="cfg-inspector-ctx-field cfg-inspector-ctx-field-wide">
            <label>symbol_count (KV)</label>
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.symbol_count_str"
                   placeholder="SCAT:3, WILD:1, H1:5">
          </div>
          <div class="cfg-inspector-ctx-field cfg-inspector-ctx-field-wide">
            <label>global (KV)</label>
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.global_str"
                   placeholder="coin_pool:50, dead_count:0">
          </div>
          <div class="cfg-inspector-ctx-field cfg-inspector-ctx-field-wide">
            <label>spin_locals (KV)</label>
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.spin_locals_str"
                   placeholder="fg_combo_count:0">
          </div>
          <div class="cfg-inspector-ctx-field cfg-inspector-ctx-field-wide">
            <label>payload (KV)</label>
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.payload_str"
                   placeholder="event_name:fg_trigger">
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- v3.4 / B6:範本載入 diff preview modal -->
  <div v-if="tplLoadPreviewOpen && tplLoadPreviewData"
       class="cfg-tpl-diff-overlay" @click.self="closeTemplateDiff">
    <div class="cfg-tpl-diff-modal">
      <div class="cfg-tpl-diff-header">
        <span class="cfg-tpl-diff-icon">⇄</span>
        <div class="cfg-tpl-diff-titlewrap">
          <div class="cfg-tpl-diff-title">載入範本前的變化預覽</div>
          <div class="cfg-tpl-diff-sub">{{ tplLoadPreviewData.name }}<span v-if="tplLoadPreviewData.description"> · {{ tplLoadPreviewData.description }}</span></div>
        </div>
        <button class="cfg-tpl-diff-close" @click="closeTemplateDiff" title="取消">✕</button>
      </div>

      <div class="cfg-tpl-diff-body">
        <div class="cfg-tpl-diff-intro">
          <strong>載入後將替換目前所有設定。</strong>
          系統會先自動備份當前狀態為 <code>🤖 自動備份_時間戳</code>,可於範本清單還原。
        </div>

        <table class="cfg-tpl-diff-table">
          <thead>
            <tr>
              <th class="cfg-tpl-diff-th-icon"></th>
              <th class="cfg-tpl-diff-th-name">項目</th>
              <th class="cfg-tpl-diff-th-num">當前</th>
              <th class="cfg-tpl-diff-th-arrow"></th>
              <th class="cfg-tpl-diff-th-num">載入後</th>
              <th class="cfg-tpl-diff-th-delta">差異</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tplLoadPreviewData.diff" :key="row.key"
                :class="{
                  'cfg-tpl-diff-row-add': row.delta > 0,
                  'cfg-tpl-diff-row-sub': row.delta < 0,
                  'cfg-tpl-diff-row-zero': row.delta === 0,
                }">
              <td class="cfg-tpl-diff-icon-cell">{{ row.icon }}</td>
              <td class="cfg-tpl-diff-name-cell">{{ row.label }}</td>
              <td class="cfg-tpl-diff-num-cell">{{ row.before }}</td>
              <td class="cfg-tpl-diff-arrow-cell">→</td>
              <td class="cfg-tpl-diff-num-cell cfg-tpl-diff-num-after">{{ row.after }}</td>
              <td class="cfg-tpl-diff-delta-cell">
                <span v-if="row.delta > 0" class="cfg-tpl-diff-delta-plus">+{{ row.delta }}</span>
                <span v-else-if="row.delta < 0" class="cfg-tpl-diff-delta-minus">{{ row.delta }}</span>
                <span v-else class="cfg-tpl-diff-delta-zero">·</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="cfg-tpl-diff-summary"
             :class="{
               'is-significant': tplLoadPreviewData.totalChanges > 5,
               'is-minor': tplLoadPreviewData.totalChanges <= 5 && tplLoadPreviewData.totalChanges > 0,
               'is-zero': tplLoadPreviewData.totalChanges === 0,
             }">
          <span v-if="tplLoadPreviewData.totalChanges === 0">
            ✓ 結構幾乎相同,但內容可能仍有變動(權重、條件等)
          </span>
          <span v-else-if="tplLoadPreviewData.totalChanges > 5">
            ⚠ 共有 {{ tplLoadPreviewData.totalChanges }} 項數量變動 — 載入會大幅改變設定
          </span>
          <span v-else>
            🔄 共有 {{ tplLoadPreviewData.totalChanges }} 項數量變動
          </span>
        </div>
      </div>

      <div class="cfg-tpl-diff-footer">
        <button class="cfg-tpl-diff-cancel" @click="closeTemplateDiff">
          取消
        </button>
        <button class="cfg-tpl-diff-confirm" @click="confirmTemplateDiffLoad">
          確認載入 · 自動備份當前後重新整理
        </button>
      </div>
    </div>
  </div>

</div>
`;

  console.log('[config-editor/template] loaded', window.SlotPlanner.ConfigEditor.TEMPLATE.length, 'chars');

})();
