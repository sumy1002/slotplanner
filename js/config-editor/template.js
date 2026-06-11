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

  <!-- ── 頂部資料來源指示器 ── -->
  <div class="cfg-source-bar">
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
      <!-- v3.4 / C12:暗色模式切換 -->
      <button class="cfg-theme-toggle"
              @click="cycleThemeMode"
              :title="'目前:' + themeModeLabel + '(點擊切換 auto → light → dark)'">
        <span class="cfg-theme-toggle-icon">{{ themeModeIcon }}</span>
        <span class="cfg-theme-toggle-label">{{ themeModeLabel }}</span>
      </button>

      <!-- ── #15 搜尋按鈕 ── -->
      <button class="cfg-search-btn"
              @click="openSearch"
              title="全編輯器搜尋(Ctrl+K)">
        <span class="cfg-search-btn-icon">🔍</span>
        <span class="cfg-search-btn-text">搜尋</span>
        <span class="cfg-search-btn-kbd">⌘K</span>
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
            <div v-for="grp in issuesByTab" :key="grp.tab.id" class="cfg-health-tab-group">
              <div class="cfg-health-tab-group-header">
                <span class="cfg-health-tab-icon">{{ grp.tab.icon }}</span>
                <span class="cfg-health-tab-name">{{ grp.tab.sheet }}</span>
                <span class="cfg-health-tab-count">{{ grp.issues.length }}</span>
                <button class="cfg-health-goto" @click="goToTabFromValidation(grp.tab.id)" title="前往這個分頁">前往 →</button>
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

    <!-- 群組 3:檔案動作 -->
    <div class="cfg-source-files">
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
      <span class="cfg-btn-text-full">範本{{ templateList.length > 0 ? ' (' + templateList.length + ')' : '' }}</span>
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
      <div v-for="t in filteredSortedTemplates" :key="t.slug" class="cfg-tpl-item"
           :class="{ 'cfg-tpl-item-auto': t.name && t.name.startsWith('🤖') }">
        <div class="cfg-tpl-info">
          <div class="cfg-tpl-name">{{ t.name }}</div>
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
          <button class="cfg-tpl-action cfg-tpl-delete"
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

    <!-- ── 左:分組分頁列 ── -->
    <div class="cfg-tabs">
      <div v-for="grp in visibleTabGroups" :key="grp.id" class="cfg-tab-group">
        <div class="cfg-tab-group-header">
          <span class="cfg-tab-group-icon">{{ grp.icon }}</span>
          <span class="cfg-tab-group-label">{{ grp.label }}</span>
          <span v-if="groupDirtyCount(grp) > 0"
                class="cfg-tab-group-dirty-count"
                :title="groupDirtyCount(grp) + ' 個分頁有未匯出的變動'">{{ groupDirtyCount(grp) }}</span>
        </div>
        <div v-for="t in grp.tabs" :key="t.id"
             class="cfg-tab"
             :class="{ active: active === t.id, 'cfg-tab-dirty': dirtyTabs[t.id], 'cfg-tab-na': tabNotApplicable(t.id) }"
             @click="active = t.id"
             :title="tabNotApplicable(t.id) ? tabNAReason(t.id) : ''">
          <span class="cfg-tab-icon">{{ t.icon }}</span>
          <div class="cfg-tab-text">
            <div class="cfg-tab-name">{{ t.name }}<span v-if="tabNotApplicable(t.id)" class="cfg-tab-na-lock" title="目前模式不適用">🔒</span></div>
            <div class="cfg-tab-sheet">{{ t.sheet }}</div>
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
      </div>

      <!-- 📄 文件群組（不在 TABS 內：跨分頁輸出步驟，不對應 A.xlsx sheet）-->
      <div class="cfg-tab-group">
        <div class="cfg-tab-group-header">
          <span class="cfg-tab-group-icon">📄</span>
          <span class="cfg-tab-group-label">文件</span>
        </div>
        <div class="cfg-tab"
             :class="{ active: active === 'docgen' }"
             @click="active = 'docgen'">
          <span class="cfg-tab-icon">📋</span>
          <div class="cfg-tab-text">
            <div class="cfg-tab-name">文件生成</div>
            <div class="cfg-tab-sheet">Excel / MD</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 右:當前分頁內容 ── -->
    <!-- 浮動「重設此頁」按鈕在 cfg-content 之外(cfg-body 內),避免被內部捲動帶走 -->
    <button v-if="active !== 'docgen' && activeTab.kind !== 'fullpane'"
            class="cfg-content-reset-fab"
            @click="resetCurrent"
            :title="'重設本分頁(' + (activeTab.name || '') + ')為預設值'">
      <span class="cfg-content-reset-icon">↺</span>
      <span class="cfg-content-reset-text">重設此頁</span>
    </button>
    <div class="cfg-content" :class="{ 'cfg-content-fullpane': activeTab.kind === 'fullpane' }">

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
      <div v-if="active === 'global'" class="cfg-form">
        <div class="cfg-form-header">
          <div class="cfg-form-title">⚙️ 01_Global · 全域設定</div>
          <div class="cfg-form-sub">控制整個模擬的核心參數;所有其他分頁的根。修改後自動儲存於本機。</div>
        </div>

        <div class="cfg-global-grid">
        <div class="cfg-global-col cfg-global-col-main">


        <!-- 區塊 2:賠付模型(可折疊,預設展開)-->
        <details class="cfg-section cfg-section-collapsible" open>
          <summary class="cfg-section-summary">
            <span class="cfg-section-title cfg-section-title-inline">賠付模型</span>
            <span class="cfg-section-summary-preview">{{ activePayModel }}<span v-if="scanDirApplicable"> · {{ curScanDir }}</span><span v-if="g.pay_type==='CLUSTER'"> · min {{ g.cluster_min_size }}</span></span>
          </summary>
          <div class="cfg-section-body">

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
            <div class="cfg-hint">LINE = 中獎線 / WAYS = 全路徑 / MEGAWAYS = 全路徑 + 每輪列數可變 / SCATTER = 任意位置 / CLUSTER = 同符相鄰群</div>
          </div>

          <div class="cfg-field" v-if="scanDirApplicable">
            <label class="cfg-label">
              計分方向 <span class="cfg-key">direction</span>
            </label>
            <div class="cfg-chip-row">
              <button v-for="d in WAYS_DIRS" :key="d"
                      class="cfg-chip"
                      :class="{ active: curScanDir === d }"
                      @click="setScanDir(d)">{{ d }}</button>
            </div>
            <div class="cfg-hint">LTR = 左到右 / RTL = 右到左 / BOTH = 雙向。此為全域唯一的計分方向,同時套用到中獎線與全路徑(WAYS / Megaways)。</div>
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
          </div>
        </details>

        <!-- 區塊 4:進階參數(可折疊,預設收起 — 通常不需修改)
             v3.1 合併原「腳本控制」尾段 + 「統計設定」 -->
        <details class="cfg-section cfg-section-collapsible">
          <summary class="cfg-section-summary">
            <span class="cfg-section-title cfg-section-title-inline">進階參數</span>
            <span class="cfg-section-summary-preview">遞迴 {{ g.max_chain_depth }}/{{ g.max_chain_per_rule }} · 大獎 {{ g.big_win_thresholds || '—' }} · 死局桶 {{ g.dead_spin_buckets || '—' }}</span>
          </summary>
          <div class="cfg-section-body">

          <div class="cfg-field">
            <label class="cfg-label">
              腳本最大遞迴深度 <span class="cfg-key">max_chain_depth</span>
            </label>
            <input class="input input-center" type="number" min="10" max="1000" v-model.number="g.max_chain_depth">
            <div class="cfg-hint">EMIT_EVENT 鏈式觸發的安全上限,防止死循環</div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              單規則最大觸發 <span class="cfg-key">max_chain_per_rule</span>
            </label>
            <input class="input input-center" type="number" min="5" max="500" v-model.number="g.max_chain_per_rule">
            <div class="cfg-hint">同一規則在一局內最多觸發次數</div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              大獎門檻(倍數) <span class="cfg-key">big_win_thresholds</span>
            </label>
            <input class="input" type="text" v-model.trim="g.big_win_thresholds" placeholder="100,500">
            <div class="cfg-hint">逗號分隔多個門檻,例:100,500,1000;B 文件會列各門檻命中率</div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              連續死局統計分桶 <span class="cfg-key">dead_spin_buckets</span>
            </label>
            <input class="input" type="text" v-model.trim="g.dead_spin_buckets" placeholder="2,3,4,5">
            <div class="cfg-hint">逗號分隔整數,例:2,3,4,5;統計連續 N 局零分的頻率</div>
          </div>
          </div>
        </details>

        <!-- 區塊 5:模擬參數(v3.1 移到最末 — 全部設好再決定跑多少局)-->
        <div class="cfg-section cfg-section-runtime">
          <div class="cfg-section-title cfg-section-title-runtime">
            <span class="cfg-section-runtime-icon">▶</span>
            <span>模擬參數</span>
            <span class="cfg-section-runtime-sub">— 全部設定完成後,在此決定如何執行模擬</span>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              模擬局數 <span class="cfg-key">simulation_count</span>
            </label>
            <div class="cfg-chip-row" style="margin-bottom:6px;">
              <button type="button" class="cfg-chip cfg-chip-sm"
                      :class="{ active: g.simulation_count === 10000 }"
                      @click="g.simulation_count = 10000" title="快速冒煙測試 ~10 秒">10K 冒煙</button>
              <button type="button" class="cfg-chip cfg-chip-sm"
                      :class="{ active: g.simulation_count === 100000 }"
                      @click="g.simulation_count = 100000" title="開發迭代 ~1 分鐘">100K 開發</button>
              <button type="button" class="cfg-chip cfg-chip-sm"
                      :class="{ active: g.simulation_count === 1000000 }"
                      @click="g.simulation_count = 1000000" title="正式分析 ~10 分鐘">1M 正式</button>
              <button type="button" class="cfg-chip cfg-chip-sm"
                      :class="{ active: g.simulation_count === 10000000 }"
                      @click="g.simulation_count = 10000000" title="嚴謹收斂(耗時)">10M 嚴謹</button>
            </div>
            <input class="input input-center" type="number" min="100" step="10000"
                   v-model.number="g.simulation_count">
            <div class="cfg-hint">建議 1,000,000;冒煙測試可改 10,000 加速</div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              隨機種子 <span class="cfg-key">random_seed</span>
            </label>
            <input class="input input-center" type="number" v-model.number="g.random_seed">
            <div class="cfg-hint">同種子 = 同結果可重現;改種子驗證穩健性</div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              輸出檔名前綴 <span class="cfg-key">output_prefix</span>
            </label>
            <input class="input" type="text" v-model.trim="g.output_prefix">
            <div class="cfg-hint">B.xlsx 的檔名前綴,實際輸出會加上時間戳</div>
          </div>
        </div>

        <!-- 區塊 6:JSON 預覽(除錯用) -->
        <details class="cfg-debug" @toggle="dbgOpen.global = $event.target.open">
          <summary>🔍 預覽目前 JSON</summary>
          <pre v-if="dbgOpen.global" class="cfg-debug-pre">{{ debugJson }}</pre>
        </details>
        </div>

        <div class="cfg-global-col cfg-global-col-modes">
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
            <input v-else class="input" type="text" v-model.trim="g.starting_mode" placeholder="NG">
            <div v-if="modeNames.length > 0 && !modeNames.includes(g.starting_mode)" class="cfg-warn">
              ⚠ 「{{ g.starting_mode }}」不在下方模式清單中,模擬將會失敗
            </div>
            <div class="cfg-hint">
              選擇模擬開局時的模式;從下方「模式清單」選一個
            </div>
          </div>

          <!-- ── 模式清單(從 11_Mode_Config 整段搬過來)── -->
          <div class="cfg-modes-inline-hint">
            模式清單(對應 A.xlsx 的 11_Mode_Config 分頁,匯出時仍會獨立成一張分頁)
          </div>
          <div class="cfg-modes-list">
            <div v-for="(m, idx) in modes" :key="modeCardKey(m)" class="cfg-mode-card"
                 :class="{ 'is-duplicate': duplicateNames.has(m.mode) && m.mode }">

              <!-- 卡片頂部:模式名稱 + 刪除 -->
              <div class="cfg-mode-card-header">
                <div class="cfg-mode-name-wrap">
                  <label class="cfg-mode-name-label">模式名稱</label>
                  <input class="input cfg-mode-name-input"
                         :class="{ err: !m.mode.trim() || (duplicateNames.has(m.mode) && m.mode) }"
                         v-model.trim="m.mode"
                         placeholder="NG"
                         maxlength="20">
                </div>
                <button class="cfg-mode-delete-btn"
                        @click="removeMode(idx)"
                        :disabled="modes.length <= 1"
                        :title="modes.length <= 1 ? '至少需要保留一個模式' : '刪除此模式'">✕</button>
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
                    <input class="input input-center" type="number" min="0" v-model.number="m.spin_count">
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
                                <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ cat.label }}</option>
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
                                <option v-for="o in OP_TYPES" :key="o" :value="o">{{ o }}</option>
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
                              title="把這個模式的 trigger 條件釘到右下角的 Test Inspector,即時看評估結果">
                        <span>🧪</span>
                        <span v-if="pinnedTest && pinnedTest.kind === 'mode' && pinnedTest.id === m.mode">已釘住 — 看右下 inspector</span>
                        <span v-else>釘到 Test Inspector</span>
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

              </div>
            </div>

            <button class="cfg-mode-add-btn" @click="addMode">
              <span style="font-size: 16px;">+</span>
              <span>新增模式</span>
            </button>
          </div>
        </div>
        </div>
              </div><!-- /cfg-global-flow -->
      </div>

      <!-- ═══════ 02_Layout 盤面結構 ═══════ -->
      <div v-else-if="active === 'layout'" class="cfg-form cfg-layout-v2" style="display:flex;flex-direction:column;height:100%;">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">🎰 02_Layout · 盤面結構</div>
          <div class="cfg-form-sub">
            定義每個 Reel 的位置與高度,可組出不規則盤(diamond / 含 SubReel)。
            Y_Offset 正值偏下、負值偏上,所有 Reel 以「列號」(row index)對齊。
          </div>

          <!-- v3.3:盤面範本快速套用 -->
          <div class="cfg-layout-preset-bar">
            <span class="cfg-layout-preset-label">📐 快速套用範本</span>
            <div class="cfg-layout-preset-chips">
              <button v-for="p in LAYOUT_PRESETS" :key="p.key"
                      class="cfg-layout-preset-chip"
                      :title="p.note"
                      @click="applyLayoutPreset(p.key)">
                <span class="cfg-layout-preset-chip-icon">{{ p.icon }}</span>
                <span class="cfg-layout-preset-chip-label">{{ p.label }}</span>
              </button>
            </div>
            <div class="cfg-layout-preset-hint">套用時會替換整個 layout(會跳確認框)</div>
          </div>
        </div>

        <!-- ── 新版三欄式：索引側欄 + 詳情大區（欄位 + 嵌入預覽） ── -->
        <div class="cfg-layout-v2-body">

          <!-- 左欄：Reel 索引 chip 列 -->
          <div class="cfg-layout-v2-index">
            <div class="cfg-layout-v2-index-scroll">
              <div v-for="(r, idx) in layout" :key="r.reel_id" class="cfg-layout-reel-chip-wrap">
              <button
                class="cfg-layout-reel-chip"
                :class="{
                  active: activeReelIdx === idx,
                  'group-selected': selectedReelIdxs.includes(idx),
                  'has-sub': r.has_subreel,
                  'drag-over': dragOverIdx === idx && dragReelIdx !== idx,
                  'dragging': dragReelIdx === idx
                }"
                draggable="true"
                @dragstart="onReelDragStart(idx, $event)"
                @dragover.prevent="onReelDragOver(idx)"
                @dragleave="onReelDragLeave(idx)"
                @drop.prevent="onReelDrop(idx)"
                @dragend="onReelDragEnd()"
                @click="onReelChipClick(idx, $event)"
                :title="'R' + r.reel_id + (r.has_subreel ? ' (含副 Reel)' : '') + ' · 點擊選取 · Ctrl/Shift 多選做群組編輯 · 可拖曳互換'"
              >
                <span class="cfg-layout-reel-chip-grip" title="拖曳互換">⋮⋮</span>
                <span class="cfg-layout-reel-chip-id">R{{ r.reel_id }}</span>
                <span v-if="r.has_subreel" class="cfg-layout-reel-chip-sub-dot" title="含副 Reel">●</span>
                <span class="cfg-layout-reel-chip-rows">{{ r.max_rows }}列</span>
              </button>
              <button v-if="r.has_subreel"
                      class="cfg-layout-subreel-chip"
                      :class="{ active: activeReelIdx === idx }"
                      @click="onReelChipClick(idx, $event)"
                      :title="'R' + r.reel_id + ' 的副盤 · ' + (SUBREEL_KINDS.find(k=>k.key===(r.subreel_kind||'STACK'))||{}).label + ' · ' + (r.subreel_position || 'BOTTOM') + ' · ' + r.subreel_rows + ' 列 · 點擊編輯'">
                <span class="cfg-layout-subreel-chip-icon">{{ (SUBREEL_KINDS.find(k=>k.key===(r.subreel_kind||'STACK'))||{}).icon || '↳' }}</span>
                <span class="cfg-layout-subreel-chip-label">副 R{{ r.reel_id }}</span>
                <span class="cfg-layout-reel-chip-rows">{{ r.subreel_rows }}列</span>
              </button>
              </div>
            </div>
            <div class="cfg-layout-v2-index-footer">
              <button class="cfg-layout-v2-add-btn" @click="addReel" title="新增 Reel">
                <span>＋</span>
              </button>
            </div>
          </div>

          <!-- 中欄：選中 Reel 的詳情欄位 -->
          <div class="cfg-layout-v2-detail" v-if="activeReel">
            <!-- 詳情 header -->
            <div class="cfg-layout-v2-detail-header">
              <div class="cfg-layout-v2-detail-title">
                <span class="cfg-reel-id">R{{ activeReel.reel_id }}</span>
                <span v-if="activeReel.has_subreel" class="cfg-layout-sub-badge">副 Reel</span>
              </div>
              <div class="cfg-layout-v2-detail-actions">
                <!-- 副 Reel 切換 -->
                <button class="cfg-reel-subreel-toggle"
                        :class="{ active: activeReel.has_subreel }"
                        @click="activeReel.has_subreel = !activeReel.has_subreel; if(activeReel.has_subreel){ if(!activeReel.subreel_kind) activeReel.subreel_kind='STACK'; if(!activeReel.subreel_position){ activeReel.subreel_position='BOTTOM'; } if(!activeReel.subreel_rows) activeReel.subreel_rows=1; }"
                        :title="activeReel.has_subreel ? '移除副盤' : '附加副盤/副輪'">
                  <span class="cfg-reel-subreel-icon">{{ activeReel.has_subreel ? '✓' : '+' }}</span>
                  <span>副盤</span>
                </button>
                <button class="cfg-mode-delete-btn"
                        @click="removeReel(activeReelIdx)"
                        :disabled="layout.length <= 1"
                        :title="layout.length <= 1 ? '至少需要保留一個 Reel' : '刪除此 Reel'">✕</button>
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
                    <button class="cfg-matrix-btn" @click="groupAdjustRows(1)">+1</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustRows(-1)">−1</button>
                  </div>
                  <div class="cfg-layout-group-bar-row">
                    <span class="cfg-mqb-label">偏移</span>
                    <input class="input input-sm input-center cfg-mqb-value" type="number" min="-9" max="9" v-model.number="groupOffsetValue">
                    <button class="cfg-matrix-btn" @click="groupSetOffset(groupOffsetValue)">設為此值</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustOffset(1)">+1</button>
                    <button class="cfg-matrix-btn" @click="groupAdjustOffset(-1)">−1</button>
                  </div>
                  <div class="cfg-layout-group-bar-row">
                    <button class="cfg-matrix-btn" @click="groupToggleSubreel()">切換整組副 Reel</button>
                    <span class="cfg-mqb-hint">鍵盤 ↑↓ 偏移、+− 列數 也會套用到整組</span>
                  </div>
                </div>

                <div class="cfg-layout-v2-field-group">
                  <div class="cfg-layout-v2-section-label">主 Reel 參數</div>
                  <div class="cfg-mode-grid">
                    <div class="cfg-field cfg-field-compact">
                      <label class="cfg-label">
                        縱向偏移 <span class="cfg-key">Y_Offset</span>
                      </label>
                      <input class="input" type="number" v-model.number="activeReel.y_offset">
                      <div class="cfg-hint">正值偏下、負值偏上；0 = 基準列對齊</div>
                    </div>
                    <div class="cfg-field cfg-field-compact">
                      <label class="cfg-label">
                        主 Reel 列數 <span class="cfg-key">Max_Rows</span>
                      </label>
                      <input class="input" type="number" min="1" max="9" v-model.number="activeReel.max_rows">
                      <div class="cfg-hint">此 Reel 顯示幾列符號（建議 1–9）</div>
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
                              @click="setSubreelKind(k.key)"
                              :title="k.desc">
                        <span class="cfg-subreel-kind-icon">{{ k.icon }}</span>
                        <span class="cfg-subreel-kind-label">{{ k.label }}</span>
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
                             class="input" type="number" min="1" max="9" v-model.number="activeReel.subreel_rows">
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
                    <div class="cfg-hint">獨立時須在 04_Reel_Weights 用「{{ activeReel.reel_id }}.sub」另設此副盤權重表;沿用主輪則複用主輪抽樣池。</div>
                  </div>

                  <!-- 雙盤面提醒 -->
                  <div v-if="(activeReel.subreel_kind||'STACK') === 'DUAL_PANEL'" class="cfg-subreel-dual-note">
                    ▦ 雙盤面：模擬時會在主輪同欄產生一張同尺寸、每次 spin 靜態重抽（無滾動）的第二盤。引擎已支援，B 結果中以 <code>is_subreel</code> 標記。
                  </div>
                </div>


                <!-- 快速導覽 hint -->
                <div class="cfg-layout-v2-nav-hint">
                  <span>← →</span> 選 Reel · <span>↑ ↓</span> 縱向偏移 · <span>+ −</span> 列數;也可在右側預覽<span>點選</span>或<span>拖曳互換</span>(連列高/副輪/權重一起換)
                  <span class="cfg-layout-v2-nav-count">共 {{ layout.length }} 個 Reel · {{ totalCells }} 格</span>
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
              <span>📐 盤面預覽</span>
              <span class="cfg-layout-split-preview-info">
                {{ layout.length }} 個 Reel · 主格 {{ layout.reduce((s,r)=>s+r.max_rows,0) }} ·
                副 {{ layout.reduce((s,r)=>s+(r.has_subreel?r.subreel_rows:0),0) }}
              </span>
            </div>
            <div class="cfg-layout-svg-wrap">
              <svg :viewBox="layoutViewBox" class="cfg-layout-svg"
                   preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                <text v-for="(lb, i) in layoutLabels" :key="'lb'+i"
                      :x="lb.x" :y="-6"
                      text-anchor="middle"
                      @click="selectReelById(lb.reel_id)"
                      :class="['cfg-layout-label', 'cfg-layout-label-interactive', lb.reel_id === (activeReel && activeReel.reel_id) ? 'cfg-layout-label-active' : '']">R{{ lb.reel_id }}</text>
                <rect v-for="(c, i) in layoutCells" :key="'c'+i"
                      :x="c.x" :y="c.y"
                      :width="LAYOUT_CELL_SIZE" :height="LAYOUT_CELL_SIZE"
                      :class="[
                        'cfg-layout-cell',
                        'cfg-layout-cell-interactive',
                        c.kind === 'sub' ? 'cfg-layout-cell-sub' : 'cfg-layout-cell-main',
                        c.kind === 'sub' && c.sub_kind ? ('cfg-layout-cell-sub-' + c.sub_kind) : '',
                        c.reel_id === (activeReel && activeReel.reel_id) ? 'cfg-layout-cell-active' : '',
                        (previewDragFrom >= 0 && previewDragOver === (c.reel - 1) && previewDragFrom !== (c.reel - 1)) ? 'cfg-layout-cell-dragover' : ''
                      ]"
                      @pointerdown="onPreviewPointerDown(c.reel - 1, $event)"
                      @pointerenter="onPreviewPointerEnter(c.reel - 1)"
                      rx="3" />
              </svg>
            </div>
            <div class="cfg-layout-v2-preview-legend">
              <span class="cfg-layout-v2-legend-item">
                <span class="cfg-layout-v2-legend-dot main"></span> 主格
              </span>
              <span class="cfg-layout-v2-legend-item">
                <span class="cfg-layout-v2-legend-dot sub"></span> 副格
              </span>
              <span class="cfg-layout-v2-legend-item">
                <span class="cfg-layout-v2-legend-dot active"></span> 選中
              </span>
            </div>
            <!-- 使用說明 -->
            <div class="cfg-layout-v2-tips">
              <div class="cfg-layout-v2-tip-title">使用說明</div>
              <div class="cfg-layout-v2-tip-item">
                <code class="cfg-key">Y_Offset</code> 正值往下偏、負值往上偏，製造 diamond 不規則盤面
              </div>
              <div class="cfg-layout-v2-tip-item">
                開啟副 Reel 後可在主 Reel 上/下方加一列，Hold &amp; Win 常用
              </div>
            </div>
          </div><!-- /cfg-layout-v2-preview -->

        </div><!-- /cfg-layout-v2-body -->
      </div>

      <!-- ═══════ 03_Symbols 符號清單(整合自 SymbolPage)═══════ -->
      <div v-else-if="active === 'symbols'" class="cfg-symbols-host">
        <symbol-page :registry="registry" @status="passStatus"></symbol-page>
      </div>

      <!-- ═══════ 04_Reel_Weights Reel 權重 ═══════ -->
      <div v-else-if="active === 'reel_weights'" class="cfg-form cfg-sticky-form">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">🎲 04_Reel_Weights · Reel 權重</div>
          <div class="cfg-form-sub">
            Mode × Reel × Symbol 三維權重表(熱力圖)。Symbol 預設取自
            <a href="#" @click.prevent="active='symbols'" class="cfg-link">03_Symbols</a>,
            首次進入該模式時自動建立 100 均勻權重。
          </div>
        </div>

        <div v-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>
            新增至少一個模式。
          </div>
        </div>

        <template v-else>
          <!-- ── Sticky 模式選擇列 ── -->
          <div class="cfg-sticky-mode-bar">
            <span class="cfg-sticky-mode-label">模式</span>
            <button v-for="m in modeNames" :key="m"
                    class="cfg-chip"
                    :class="{ active: reelActiveMode === m }"
                    @click="reelActiveMode = m">{{ m }}</button>
            <span class="cfg-sticky-meta" v-if="reelActiveMode">
              Max: <strong>{{ reelMaxWeight(reelActiveMode) }}</strong>
            </span>
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
                  <span class="cfg-mqb-hint">點欄頭=選整欄 · 點列頭=選整列 · Shift/Ctrl=範圍/多選</span>
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
                  <span class="cfg-matrix-sel-hint">Shift+Click=範圍 · Ctrl/⌘+Click=多選 · Click=單選</span>
                </div>

                <table class="cfg-matrix">
                  <thead>
                    <tr>
                      <th class="cfg-matrix-corner">R \ Sym</th>
                      <th v-for="sid in reelW(reelActiveMode).symbol_ids" :key="sid"
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
                      <th class="cfg-matrix-total">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedReels('reel', reelActiveMode)" :key="r.reel_id">
                      <td class="cfg-matrix-rowhead cfg-matrix-head-sel" @click="selectWholeRow('reel', reelActiveMode, r.reel_id)" title="點擊選取整列">R{{ r.reel_id }}</td>
                      <td v-for="sid in reelW(reelActiveMode).symbol_ids" :key="sid"
                          v-memo="[
                            reelW(reelActiveMode).weights[r.reel_id + '-' + sid],
                            isMatrixCellSelected('reel', reelActiveMode, r.reel_id, sid),
                            reelIsTopWeight(reelActiveMode, r.reel_id, sid),
                            cellPercent('reel', reelActiveMode, r.reel_id, sid),
                            getMatrixDisplayMode('reel', reelActiveMode)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   { 'is-selected': isMatrixCellSelected('reel', reelActiveMode, r.reel_id, sid),
                                     'is-top': reelIsTopWeight(reelActiveMode, r.reel_id, sid) }]"
                          :style="{ backgroundColor: reelHeatColor(reelActiveMode, reelW(reelActiveMode).weights[r.reel_id + '-' + sid] || 0) }"
                          @click.stop="toggleMatrixCell('reel', reelActiveMode, r.reel_id, sid, $event)">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               v-model.number.lazy="reelW(reelActiveMode).weights[r.reel_id + '-' + sid]"
                               @click.stop>
                        <span v-if="cellPercent('reel', reelActiveMode, r.reel_id, sid)"
                              class="cfg-matrix-cell-pct"
                              :class="'is-' + getMatrixDisplayMode('reel', reelActiveMode)">{{ cellPercent('reel', reelActiveMode, r.reel_id, sid) }}</span>
                      </td>
                      <td class="cfg-matrix-total-cell">
                        <span class="cfg-matrix-row-menu-host" @click.stop>
                          <button class="cfg-matrix-total-chip"
                                  :class="{ active: rowMenu.open && rowMenu.kind === 'reel' && rowMenu.mode === reelActiveMode && rowMenu.reel === r.reel_id }"
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
                                :style="{ backgroundColor: reelHeatColor(m, reelW(m).weights[r.reel_id + '-' + sid] || 0) }">
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
                                :style="{ backgroundColor: reelHeatColor(m, reelW(m).weights[r.reel_id + '-' + sid] || 0) }">
                              {{ reelW(m).weights[r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <!-- diff 模式:基準 mode 顯示原值 -->
                          <template v-else-if="m === effectiveReelBaselineMode()">
                            <td v-for="sid in reelW(m).symbol_ids" :key="sid"
                                v-memo="[reelW(m).weights[r.reel_id + '-' + sid]]"
                                class="cfg-mode-multi-cell-ro cfg-mode-multi-cell-base"
                                :style="{ backgroundColor: reelHeatColor(m, reelW(m).weights[r.reel_id + '-' + sid] || 0) }">
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
          <button class="cfg-chip" @click="active='global'">→ 前往 01_Global 切換成 Megaways</button>
        </div>

        <div v-else-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>
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
          <div class="cfg-sticky-mode-bar">
            <span class="cfg-sticky-mode-label">模式</span>
            <button v-for="m in modeNames" :key="m"
                    class="cfg-chip"
                    :class="{ active: gridActiveMode === m }"
                    @click="gridActiveMode = m">{{ m }}</button>
            <span class="cfg-sticky-meta" v-if="gridActiveMode">
              Max: <strong>{{ gridMaxWeight(gridActiveMode) }}</strong>
            </span>
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
                  <span class="cfg-matrix-sel-hint">Shift+Click=範圍 · Ctrl/⌘+Click=多選 · Click=單選</span>
                </div>

                <table class="cfg-matrix">
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
                    <tr v-for="r in sortedReels('grid', gridActiveMode)" :key="r.reel_id">
                      <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                      <td v-for="sz in gridW(gridActiveMode).grid_sizes" :key="sz"
                          v-memo="[
                            gridW(gridActiveMode).weights[r.reel_id + '-' + sz],
                            isMatrixCellSelected('grid', gridActiveMode, r.reel_id, sz),
                            cellPercent('grid', gridActiveMode, r.reel_id, sz),
                            getMatrixDisplayMode('grid', gridActiveMode)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   { 'is-selected': isMatrixCellSelected('grid', gridActiveMode, r.reel_id, sz) }]"
                          @click.stop="toggleMatrixCell('grid', gridActiveMode, r.reel_id, sz, $event)">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               v-model.number.lazy="gridW(gridActiveMode).weights[r.reel_id + '-' + sz]"
                               @click.stop>
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
                                :style="{ backgroundColor: gridHeatColor ? gridHeatColor(m, gridW(m).weights[r.reel_id + '-' + sz] || 0) : '' }">
                              <input class="cfg-matrix-cell" type="number" min="0"
                                     v-model.number.lazy="gridW(m).weights[r.reel_id + '-' + sz]"
                                     @click.stop>
                            </td>
                          </template>
                          <template v-else-if="gridViewMode === 'compare'">
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[gridW(m).weights[r.reel_id + '-' + sz]]"
                                class="cfg-mode-multi-cell-ro"
                                :style="{ backgroundColor: gridHeatColor ? gridHeatColor(m, gridW(m).weights[r.reel_id + '-' + sz] || 0) : '' }">
                              {{ gridW(m).weights[r.reel_id + '-' + sz] || 0 }}
                            </td>
                          </template>
                          <template v-else-if="m === effectiveGridBaselineMode()">
                            <td v-for="sz in gridW(m).grid_sizes" :key="sz"
                                v-memo="[gridW(m).weights[r.reel_id + '-' + sz]]"
                                class="cfg-mode-multi-cell-ro cfg-mode-multi-cell-base"
                                :style="{ backgroundColor: gridHeatColor ? gridHeatColor(m, gridW(m).weights[r.reel_id + '-' + sz] || 0) : '' }">
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
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">
            ➰ 06_Paylines · 中獎線
            <span class="cfg-paylines-mode-badge" :class="paylineLineMode ? 'is-line' : 'is-other'">
              {{ paylineLineMode ? 'LINE 模式' : (g.pay_type || '?') + ' 模式' }}
            </span>
          </div>
          <div class="cfg-form-sub">
            <template v-if="paylineLineMode">
              <strong>LINE 模式規則:</strong>每條中獎線必須「每個 Reel 恰好一個點」、且前 3 格不可與其他線重疊。
              開啟點選模式後,系統會依 Reel 順序引導你建構路徑。
            </template>
            <template v-else>
              定義中獎路徑。座標格式 <code>(R,r)</code>:R = Reel 編號,r = 該 Reel 的列(1-based,1 = 最上)。
              當前 <code>pay_type = {{ g.pay_type }}</code> 不一定使用中獎線,可參考
              <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global</a>。
            </template>
            <span class="cfg-paylines-divider">·</span>
            盤面結構來自 <a href="#" @click.prevent="active='layout'" class="cfg-link">02_Layout</a>
          </div>
        </div>

        <div v-if="tabNotApplicable('paylines')" class="cfg-tab-na-notice">
          <div class="cfg-tab-na-notice-icon">🔒</div>
          <div class="cfg-tab-na-notice-title">中獎線在目前模式不適用</div>
          <div class="cfg-tab-na-notice-text">{{ tabNAReason('paylines') }}</div>
          <button class="cfg-chip" @click="active='global'">→ 前往 01_Global 調整賠付模型</button>
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
              <!-- #16:計分方向已收斂到 01_Global · 賠付模型,此處僅顯示 -->
              <div class="cfg-payline-global-dir" title="計分方向已移到 01_Global · 賠付模型">
                <span class="cfg-payline-global-dir-label">方向</span>
                <span class="cfg-payline-dir-readonly">{{ paylineDirLabel(curScanDir) }}</span>
                <a href="#" class="cfg-link" @click.prevent="active='global'">於 01_Global 調整</a>
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
                   @click="selectedPaylineIdx = idx">
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
              </div>
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
          </div>

          <!-- ════ 右欄:超大 SVG + 頂部 inline 工具列 ════ -->
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
              <div class="cfg-paylines-v2-topbar">
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

                <!-- 中:欄位(path / direction / notes 緊湊排)-->
                <div class="cfg-paylines-v2-topbar-fields">
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
                          class="cfg-paylines-svg-clear"
                          @click="clearPaylinePath"
                          title="清空此中獎線的所有點">✕ 清空</button>
                  <button class="cfg-split-detail-del"
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
            Mode_Scope 來自 <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>。
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
              <div class="cfg-constraints-v2-topbar">
                <div class="cfg-constraints-v2-topbar-left">
                  <input class="input cfg-mode-name-input cfg-constraints-v2-id-input"
                         :class="{ err: !constraints[selectedConstraintIdx].constraint_id.trim() || (constraintDuplicateIds.has(constraints[selectedConstraintIdx].constraint_id) && constraints[selectedConstraintIdx].constraint_id) }"
                         v-model.trim="constraints[selectedConstraintIdx].constraint_id"
                         placeholder="C001"
                         maxlength="20">
                </div>
                <div class="cfg-constraints-v2-topbar-actions">
                  <button class="cfg-split-detail-dup"
                          @click="duplicateConstraint(selectedConstraintIdx)"
                          title="複製此約束">⎘</button>
                  <button class="cfg-split-detail-del"
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
                <input class="input" type="number" min="0"
                       v-model.number="constraints[selectedConstraintIdx].threshold"
                       style="max-width:200px;">
                <div class="cfg-hint">
                  {{ constraints[selectedConstraintIdx].ctype === 'GLOBAL_MAX'
                     ? '一個盤面上「' + (constraints[selectedConstraintIdx].symbol_id || '此符號') + '」最多可以出現幾個'
                     : '一個盤面上「' + (constraints[selectedConstraintIdx].symbol_id || '此符號') + '」至少要出現幾個(否則該盤面會被拒絕重抽)' }}
                </div>
              </div>

              <!-- 套用模式 + 備註 -->
              <div class="cfg-constraints-v2-section cfg-mode-grid">
                <div class="cfg-field cfg-field-compact">
                  <label class="cfg-label">套用模式 <span class="cfg-key">mode_scope</span></label>
                  <div class="cfg-chip-row">
                    <button v-for="s in allModeScopes" :key="s"
                            class="cfg-chip cfg-chip-sm"
                            :class="{ active: constraints[selectedConstraintIdx].mode_scope === s }"
                            @click="constraints[selectedConstraintIdx].mode_scope = s">{{ s }}</button>
                  </div>
                </div>
                <div class="cfg-field cfg-field-compact">
                  <label class="cfg-label">備註 <span class="cfg-key">notes</span></label>
                  <input class="input" type="text"
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
            <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>
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
                  <span class="cfg-matrix-sel-hint">Shift+Click=範圍 · Ctrl/⌘+Click=多選 · Click=單選</span>
                </div>

                <table class="cfg-matrix">
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
                    <tr v-for="r in sortedReels('combo', comboActiveModeBar)" :key="r.reel_id">
                      <td class="cfg-matrix-rowhead">R{{ r.reel_id }}</td>
                      <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                          v-memo="[
                            comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid],
                            isMatrixCellSelected('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                            comboIsTopWeight(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, sid),
                            cellPercent('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                            comboActiveStep[comboActiveModeBar],
                            getMatrixDisplayMode('combo', comboActiveModeBar)
                          ]"
                          :class="['cfg-matrix-cell-wrap',
                                   { 'is-selected': isMatrixCellSelected('combo', comboActiveModeBar, r.reel_id, sid, comboActiveStep[comboActiveModeBar]),
                                     'is-top': comboIsTopWeight(comboActiveModeBar, comboActiveStep[comboActiveModeBar], r.reel_id, sid) }]"
                          :style="{ backgroundColor: comboHeatColor(comboActiveModeBar, comboActiveStep[comboActiveModeBar], comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid] || 0) }"
                          @click.stop="toggleMatrixCell('combo', comboActiveModeBar, r.reel_id, sid, $event, comboActiveStep[comboActiveModeBar])">
                        <input class="cfg-matrix-cell" type="number" min="0"
                               v-model.number.lazy="comboW(comboActiveModeBar).weights[comboActiveStep[comboActiveModeBar] + '-' + r.reel_id + '-' + sid]"
                               @click.stop>
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
                                :style="{ backgroundColor: comboHeatColor(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0) }">
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
                                :style="{ backgroundColor: comboHeatColor(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0) }">
                              {{ comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0 }}
                            </td>
                          </template>
                          <!-- diff 模式:基準 step 顯示原值,其他顯示 diff label -->
                          <template v-else-if="step === effectiveDiffBaseline(comboActiveModeBar)">
                            <td v-for="sid in comboW(comboActiveModeBar).symbol_ids" :key="sid"
                                v-memo="[comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid]]"
                                class="cfg-combo-multi-cell-ro cfg-combo-multi-cell-base"
                                :style="{ backgroundColor: comboHeatColor(comboActiveModeBar, step, comboW(comboActiveModeBar).weights[step + '-' + r.reel_id + '-' + sid] || 0) }">
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
      <div v-else-if="active === 'rules'" class="cfg-form" style="display:flex;flex-direction:column;height:100%;">
        <div class="cfg-form-header" style="flex-shrink:0;">
          <div class="cfg-form-title">
            🧩 規則 · 拼圖規則 + 棄牌規則
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

            <!-- 過濾 chip -->
            <div class="cfg-rules-filter-bar">
              <button class="cfg-chip cfg-chip-sm"
                      :class="{ active: rulesListFilter === 'all' }"
                      @click="rulesListFilter = 'all'">全部</button>
              <button class="cfg-chip cfg-chip-sm"
                      :class="{ active: rulesListFilter === 'puzzle' }"
                      @click="rulesListFilter = 'puzzle'"
                      title="只看拼圖規則">🧩 拼圖</button>
              <button class="cfg-chip cfg-chip-sm cfg-chip-hard"
                      :class="{ active: rulesListFilter === 'hard' }"
                      @click="rulesListFilter = 'hard'"
                      title="只看 HARD 棄牌(風控)">HARD</button>
              <button class="cfg-chip cfg-chip-sm cfg-chip-soft"
                      :class="{ active: rulesListFilter === 'soft' }"
                      @click="rulesListFilter = 'soft'"
                      title="只看 SOFT 棄牌(體感)">SOFT</button>
            </div>

            <div class="cfg-split-list-body">
              <!-- 拼圖規則(可拖曳排序;只在 filter=all 或 filter=puzzle 時顯示)-->
              <template v-if="rulesListFilter === 'all' || rulesListFilter === 'puzzle'">
                <div v-if="rules.length > 0" class="cfg-rules-group-header">
                  <span class="cfg-rules-group-icon">🧩</span>
                  <span>拼圖規則</span>
                  <span class="cfg-rules-group-count">{{ rules.length }}</span>
                </div>
                <div v-for="(r, idx) in rules" :key="'puzzle-' + (r.rule_id || ('idx-' + idx))"
                     class="cfg-split-item cfg-split-item-draggable cfg-split-item-puzzle"
                     :class="{
                       active: selectedKind === 'puzzle' && selectedRuleIdx === idx,
                       'is-duplicate': ruleDuplicateIds.has(r.rule_id) && r.rule_id,
                       'is-dragging': rulesDragState.draggingIdx === idx,
                       'drop-before': rulesDragState.dragOverIdx === idx && rulesDragState.dropPosition === 'before',
                       'drop-after':  rulesDragState.dragOverIdx === idx && rulesDragState.dropPosition === 'after',
                     }"
                     :title="humanizeRule(r)"
                     draggable="true"
                     @click="selectItem('puzzle', idx)"
                     @dragstart="onRuleDragStart(idx, $event)"
                     @dragover="onRuleDragOver(idx, $event)"
                     @dragleave="onRuleDragLeave(idx)"
                     @drop="onRuleDrop(idx, $event)"
                     @dragend="onRuleDragEnd">
                  <span class="cfg-rule-drag-handle" title="拖曳重排">⋮⋮</span>
                  <span class="cfg-split-item-id">{{ r.rule_id || '?' }}</span>
                  <span class="cfg-split-item-sub">
                    {{ r.trigger || '–' }}
                    · {{ (r.actions && r.actions[0] && r.actions[0].atype) || '(無動作)' }}
                    <span v-if="r.actions && r.actions.length > 1">+{{ r.actions.length - 1 }}</span>
                    <span v-if="r.enabled === false" class="cfg-split-item-disabled" title="此規則已停用">⊘</span>
                  </span>
                  <!-- 最近一次模擬的觸發徽章 -->
                  <template v-if="getRuleSimBadge(r.rule_id)">
                    <span v-if="getRuleSimBadge(r.rule_id).dead"
                          class="cfg-rule-sim-badge cfg-rule-sim-badge-dead"
                          title="最近一次模擬此規則未觸發 — 可能是 dead code">0</span>
                    <span v-else
                          class="cfg-rule-sim-badge"
                          :title="'觸發 ' + getRuleSimBadge(r.rule_id).count.toLocaleString() + ' 次' + (Math.abs(getRuleSimBadge(r.rule_id).rtp) > 0.0001 ? ' · RTP 貢獻 ' + getRuleSimBadge(r.rule_id).rtp.toFixed(2) : '')">
                      {{ getRuleSimBadge(r.rule_id).count >= 1000
                          ? (getRuleSimBadge(r.rule_id).count / 1000).toFixed(1) + 'k'
                          : getRuleSimBadge(r.rule_id).count }}
                    </span>
                  </template>
                  <span v-if="!r.rule_id.trim() || (ruleDuplicateIds.has(r.rule_id) && r.rule_id)"
                        class="cfg-split-item-warn" title="編號錯誤或重複"></span>
                </div>
              </template>

              <!-- 棄牌規則(不可拖曳;依 filter 決定顯示哪些)-->
              <template v-if="rulesListFilter === 'all' || rulesListFilter === 'hard' || rulesListFilter === 'soft'">
                <div v-if="discards.length > 0" class="cfg-rules-group-header">
                  <span class="cfg-rules-group-icon">🗑</span>
                  <span>棄牌規則</span>
                  <span class="cfg-rules-group-count">{{ discards.length }}</span>
                </div>
                <template v-for="(d, idx) in discards" :key="'discard-' + idx">
                  <div v-if="rulesListFilter === 'all' ||
                             (rulesListFilter === 'hard' && d.discard_kind === 'HARD') ||
                             (rulesListFilter === 'soft' && d.discard_kind === 'SOFT')"
                       class="cfg-split-item"
                       :class="{
                         active: selectedKind === 'discard' && selectedDiscardIdx === idx,
                         'cfg-split-item-hard': d.discard_kind === 'HARD',
                         'cfg-split-item-soft': d.discard_kind === 'SOFT',
                         'is-duplicate': discardDuplicateIds.has(d.discard_id) && d.discard_id,
                       }"
                       :title="humanizeDiscard(d)"
                       @click="selectItem('discard', idx)">
                    <span class="cfg-split-item-id">{{ d.discard_id || '?' }}</span>
                    <span v-if="d.discard_kind" class="cfg-split-item-badge"
                          :class="d.discard_kind === 'HARD' ? 'hard' : 'soft'">
                      {{ d.discard_kind }}
                    </span>
                    <span v-if="!d.discard_id.trim() || (discardDuplicateIds.has(d.discard_id) && d.discard_id)"
                          class="cfg-split-item-warn" title="編號錯誤或重複"></span>
                  </div>
                </template>
              </template>

              <!-- 空狀態 -->
              <div v-if="rules.length === 0 && discards.length === 0" class="cfg-rules-list-empty">
                尚無規則,從下方「+ 新增」開始
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
                <button class="cfg-rules-add-menu-item"
                        @click="addRuleFromMenu('hard')">
                  <span class="cfg-rules-add-menu-icon cfg-text-hard">⛔</span>
                  <span class="cfg-rules-add-menu-label">棄牌 HARD</span>
                  <span class="cfg-rules-add-menu-sub">風控:整局排除於統計</span>
                </button>
                <button class="cfg-rules-add-menu-item"
                        @click="addRuleFromMenu('soft')">
                  <span class="cfg-rules-add-menu-icon cfg-text-soft">⚠</span>
                  <span class="cfg-rules-add-menu-label">棄牌 SOFT</span>
                  <span class="cfg-rules-add-menu-sub">體感:仍計入但獨立追蹤</span>
                </button>
              </div>
              <!-- #17 自動重設 priority 開關(只對拼圖規則有意義)-->
              <label class="cfg-rules-autopri" v-if="rules.length > 0">
                <input type="checkbox" v-model="rulesAutoPriority">
                <span title="拖曳重排拼圖規則後,自動依新順序設定 priority(從 100 開始遞減)">拖曳時自動重設 priority</span>
              </label>
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
              <div class="cfg-split-detail-header">
                <div style="flex:1;">
                  <input class="input cfg-mode-name-input"
                         style="font-size:15px;"
                         :class="{ err: !rules[selectedRuleIdx].rule_id.trim() || (ruleDuplicateIds.has(rules[selectedRuleIdx].rule_id) && rules[selectedRuleIdx].rule_id) }"
                         v-model.trim="rules[selectedRuleIdx].rule_id"
                         placeholder="P001"
                         maxlength="20"
                         @change="renameRuleBuilderState($event.target._oldVal, rules[selectedRuleIdx].rule_id)"
                         @focus="$event.target._oldVal = $event.target.value">
                </div>
                <button class="cfg-split-detail-dup"
                        @click="duplicateRule(selectedRuleIdx)"
                        title="複製此規則(只改 ID,其他全部保留;priority +1)">⎘</button>
                <button class="cfg-split-detail-del"
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
                套用模式 <span class="cfg-key">mode_scope</span>
              </label>
              <div class="cfg-chip-row">
                <button v-for="s in allModeScopes" :key="s"
                        class="cfg-chip cfg-chip-sm"
                        :class="{ active: rules[selectedRuleIdx].mode_scope === s }"
                        @click="rules[selectedRuleIdx].mode_scope = s">{{ s }}</button>
              </div>
            </div>

            <div class="cfg-field cfg-field-compact">
              <label class="cfg-label">
                優先順序 <span class="cfg-key">priority</span>
              </label>
              <input class="input" type="number" v-model.number="rules[selectedRuleIdx].priority">
              <div class="cfg-hint">數字越大越優先(同 trigger 下執行順序)</div>
            </div>
          </div>

          <div class="cfg-field">
            <label class="cfg-label">
              觸發點 <span class="cfg-key">trigger</span>
            </label>
            <div class="cfg-chip-row">
              <button v-for="t in TRIGGER_CATALOG" :key="t.type"
                      class="cfg-chip cfg-chip-sm"
                      :class="{ active: rules[selectedRuleIdx].trigger === t.type }"
                      :title="t.desc"
                      @click="rules[selectedRuleIdx].trigger = t.type">{{ t.label }}</button>
            </div>
            <div class="cfg-hint" v-if="TRIGGER_BY_TYPE[rules[selectedRuleIdx].trigger]">
              💬 {{ TRIGGER_BY_TYPE[rules[selectedRuleIdx].trigger].desc }}
            </div>
          </div>

          <!-- ═══ Condition 拼圖建構器 ═══ -->
          <div class="cfg-puzzle-section">
            <div class="cfg-puzzle-header">
              <span class="cfg-puzzle-title">🧩 觸發條件 <span class="cfg-key">condition</span></span>
              <div class="cfg-puzzle-mode-toggle">
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: (ruleEditMode[rules[selectedRuleIdx].rule_id] || 'builder') !== 'raw' }"
                        @click="setRuleEditMode(r, 'builder')">🧩 拼圖模式</button>
                <button class="cfg-chip cfg-chip-sm"
                        :class="{ active: ruleEditMode[rules[selectedRuleIdx].rule_id] === 'raw' }"
                        @click="setRuleEditMode(r, 'raw')">⌨ 原始 DSL</button>
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

              <div v-else class="cfg-puzzle-rows">
                <template v-for="(row, ri) in builderRowsMap[rules[selectedRuleIdx].rule_id]" :key="ri">

                  <!-- AND/OR 連接器(第一列不顯示)-->
                  <div v-if="ri > 0" class="cfg-puzzle-combinator">
                    <button class="cfg-chip cfg-chip-sm"
                            :class="{ active: row.combinator === 'AND' }"
                            @click="row.combinator = 'AND'; rebuildConditionForRule(selectedRuleIdx)">AND</button>
                    <button class="cfg-chip cfg-chip-sm"
                            :class="{ active: row.combinator === 'OR' }"
                            @click="row.combinator = 'OR'; rebuildConditionForRule(selectedRuleIdx)">OR</button>
                  </div>

                  <!-- 拼圖列 -->
                  <div class="cfg-puzzle-row">

                    <!-- 變數類別 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                      <label class="cfg-puzzle-piece-label">變數</label>
                      <select class="cfg-puzzle-select"
                              :value="row.category"
                              @change="changeRowCategory(selectedRuleIdx, ri, $event.target.value)">
                        <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ cat.label }}</option>
                      </select>
                    </div>

                    <!-- 子鍵(若需要)-->
                    <div v-if="rowCategoryMeta(row).needsSubkey"
                         class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                      <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(row).subkeyHint }}</label>
                      <!-- symbol_count 用下拉,其他用文字 -->
                      <select v-if="rowCategoryMeta(row).subkeySource === 'symbols' && symbolNames.length > 0"
                              class="cfg-puzzle-select"
                              v-model="row.subkey"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option value="">(選擇)</option>
                        <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                      </select>
                      <input v-else
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="row.subkey"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             :placeholder="rowCategoryMeta(row).subkeyHint">
                    </div>

                    <!-- 運算子 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                      <label class="cfg-puzzle-piece-label">運算</label>
                      <select class="cfg-puzzle-select cfg-puzzle-op"
                              v-model="row.op"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option v-for="o in OP_TYPES" :key="o" :value="o">{{ o }}</option>
                      </select>
                    </div>

                    <!-- 值 -->
                    <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                      <label class="cfg-puzzle-piece-label">
                        {{ OP_IS_LIST.has(row.op) ? '值清單(逗號分隔)' : '值' }}
                      </label>
                      <!-- in/not_in:強制文字輸入(可放多值) -->
                      <input v-if="OP_IS_LIST.has(row.op)"
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="FG1, FG2, FG3">
                      <!-- valueType = mode:用 chip 列出模式 -->
                      <select v-else-if="rowCategoryMeta(row).valueType === 'mode' && modeNames.length > 0"
                              class="cfg-puzzle-select"
                              v-model="row.value"
                              @change="rebuildConditionForRule(selectedRuleIdx)">
                        <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                      </select>
                      <input v-else-if="rowCategoryMeta(row).valueType === 'number'"
                             class="cfg-puzzle-input cfg-mono"
                             type="number"
                             step="any"
                             v-model="row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="0">
                      <input v-else
                             class="cfg-puzzle-input cfg-mono"
                             type="text"
                             v-model.trim="row.value"
                             @input="rebuildConditionForRule(selectedRuleIdx)"
                             placeholder="值">
                    </div>

                    <!-- 刪除此列 -->
                    <button class="cfg-puzzle-row-del"
                            @click="removeBuilderRow(selectedRuleIdx, ri)"
                            title="移除此片拼圖">✕</button>
                  </div>
                </template>
              </div>

              <!-- 新增列按鈕(若已有列,顯示「AND / OR」兩個) -->
              <div class="cfg-puzzle-add">
                <button v-if="!builderRowsMap[rules[selectedRuleIdx].rule_id] || builderRowsMap[rules[selectedRuleIdx].rule_id].length === 0"
                        class="cfg-mode-add-btn cfg-puzzle-add-btn"
                        @click="addBuilderRow(idx, 'AND')">
                  <span style="font-size: 14px;">+</span>
                  <span>新增第一片條件</span>
                </button>
                <template v-else>
                  <button class="cfg-puzzle-add-and" @click="addBuilderRow(idx, 'AND')">
                    + AND 條件
                  </button>
                  <button class="cfg-puzzle-add-or" @click="addBuilderRow(idx, 'OR')">
                    + OR 條件
                  </button>
                </template>
              </div>

              <!-- 生成的 DSL 預覽 -->
              <div class="cfg-puzzle-dsl">
                <span class="cfg-puzzle-dsl-label">生成的 DSL:</span>
                <code class="cfg-puzzle-dsl-code">{{ rules[selectedRuleIdx].condition || '(空)' }}</code>
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

            <!-- ── #5 釘到 inspector(原折疊測試區改為頁底固定面板)── -->
            <div class="cfg-puzzle-pin">
              <button class="cfg-puzzle-pin-btn"
                      :class="{ active: pinnedTest && pinnedTest.kind === 'rule' && pinnedTest.id === rules[selectedRuleIdx].rule_id }"
                      @click="pinTest('rule', rules[selectedRuleIdx].rule_id, rules[selectedRuleIdx].rule_id)"
                      title="把這條規則釘到右下角的 Test Inspector,即時看條件評估結果">
                <span>🧪</span>
                <span v-if="pinnedTest && pinnedTest.kind === 'rule' && pinnedTest.id === rules[selectedRuleIdx].rule_id">已釘住 — 看右下 inspector</span>
                <span v-else>釘到 Test Inspector</span>
              </button>
            </div>
          </div>

          <!-- ═══ Action 動作清單(支援多個動作,按順序執行)═══ -->
          <div class="cfg-action-section">
            <div class="cfg-action-header">
              <span class="cfg-action-title">⚡ 動作清單 <span class="cfg-key">actions</span></span>
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
              <div v-for="(act, ai) in rules[selectedRuleIdx].actions" :key="ai"
                   class="cfg-action-card">
                <div class="cfg-action-card-header">
                  <span class="cfg-action-card-idx">#{{ ai + 1 }}</span>
                  <select class="cfg-action-card-select cfg-mono"
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
                  <button class="cfg-action-card-btn" @click="moveAction(selectedRuleIdx, ai, -1)"
                          :disabled="ai === 0" title="上移">▲</button>
                  <button class="cfg-action-card-btn" @click="moveAction(selectedRuleIdx, ai, 1)"
                          :disabled="ai === rules[selectedRuleIdx].actions.length - 1" title="下移">▼</button>
                  <button class="cfg-action-card-btn" @click="duplicateAction(selectedRuleIdx, ai)" title="複製">⎘</button>
                  <button class="cfg-action-card-del" @click="removeAction(selectedRuleIdx, ai)" title="刪除">✕</button>
                </div>

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
                              @click="setActParam(act, param.key, opt)">{{ opt }}</button>
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
                           class="input cfg-mono"
                           type="text"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value)"
                           :placeholder="param.placeholder || '[0,1]'">

                    <!-- number -->
                    <input v-else-if="param.type === 'number'"
                           class="input cfg-mono"
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
              </div>

              <!-- 新增 action 按鈕 -->
              <div class="cfg-action-add-row">
                <button class="cfg-action-add-btn" @click="addAction(selectedRuleIdx, '')">
                  <span>+</span><span>新增動作</span>
                </button>
                <!-- 快捷:常用幾個 atype 直接一鍵新增 -->
                <button class="cfg-action-add-quick" @click="addAction(selectedRuleIdx, 'EMIT_EVENT')" title="EMIT_EVENT">📢 EMIT</button>
                <button class="cfg-action-add-quick" @click="addAction(selectedRuleIdx, 'ADJUST_MULTIPLIER')" title="ADJUST_MULTIPLIER">✖️ MULT</button>
                <button class="cfg-action-add-quick" @click="addAction(selectedRuleIdx, 'UPDATE_GLOBAL')" title="UPDATE_GLOBAL">🌐 GLOBAL</button>
                <button class="cfg-action-add-quick" @click="addAction(selectedRuleIdx, 'SWITCH_MODE')" title="SWITCH_MODE">🔀 MODE</button>
              </div>

              <!-- 預覽生成的 DSL(複製貼進 xlsx Actions 欄會直接被後端 parse_actions 認得)-->
              <div class="cfg-puzzle-dsl">
                <span class="cfg-puzzle-dsl-label">編譯成 Actions DSL:</span>
                <code class="cfg-puzzle-dsl-code">{{ buildActionsDSL(rules[selectedRuleIdx].actions) || '(空)' }}</code>
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
              <div class="cfg-split-detail-header">
                <div style="flex:1;">
                  <input class="input cfg-mode-name-input"
                         style="font-size:15px;"
                         :class="{ err: !discards[selectedDiscardIdx].discard_id.trim() || (discardDuplicateIds.has(discards[selectedDiscardIdx].discard_id) && discards[selectedDiscardIdx].discard_id) }"
                         v-model.trim="discards[selectedDiscardIdx].discard_id"
                         placeholder="D001"
                         maxlength="20">
                </div>
                <button class="cfg-split-detail-dup"
                        @click="duplicateDiscard(selectedDiscardIdx)"
                        title="複製此棄牌規則">⎘</button>
                <button class="cfg-split-detail-del"
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
                    套用模式 <span class="cfg-key">mode_scope</span>
                  </label>
                  <div class="cfg-chip-row">
                    <button v-for="s in allModeScopes" :key="s"
                            class="cfg-chip cfg-chip-sm"
                            :class="{ active: discards[selectedDiscardIdx].mode_scope === s }"
                            @click="discards[selectedDiscardIdx].mode_scope = s">{{ s }}</button>
                  </div>
                  <div class="cfg-hint">ALL = 所有模式;或指定某個模式</div>
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

                    <div v-else class="cfg-puzzle-rows">
                      <template v-for="(row, ri) in condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])]" :key="ri">
                        <div v-if="ri > 0" class="cfg-puzzle-combinator">
                          <button class="cfg-chip cfg-chip-sm"
                                  :class="{ active: row.combinator === 'AND' }"
                                  @click="row.combinator = 'AND'; discardCond.rebuild(discards[selectedDiscardIdx])">AND</button>
                          <button class="cfg-chip cfg-chip-sm"
                                  :class="{ active: row.combinator === 'OR' }"
                                  @click="row.combinator = 'OR'; discardCond.rebuild(discards[selectedDiscardIdx])">OR</button>
                        </div>

                        <div class="cfg-puzzle-row">
                          <div class="cfg-puzzle-piece cfg-puzzle-piece-var">
                            <label class="cfg-puzzle-piece-label">變數</label>
                            <select class="cfg-puzzle-select"
                                    :value="row.category"
                                    @change="discardCond.changeCat(discards[selectedDiscardIdx], ri, $event.target.value)">
                              <option v-for="cat in VAR_CATEGORIES" :key="cat.id" :value="cat.id">{{ cat.label }}</option>
                            </select>
                          </div>

                          <div v-if="rowCategoryMeta(row).needsSubkey" class="cfg-puzzle-piece cfg-puzzle-piece-subkey">
                            <label class="cfg-puzzle-piece-label">.{{ rowCategoryMeta(row).subkeyHint }}</label>
                            <select v-if="rowCategoryMeta(row).subkeySource === 'symbols' && symbolNames.length > 0"
                                    class="cfg-puzzle-select"
                                    v-model="row.subkey"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option value="">(選擇)</option>
                              <option v-for="s in symbolNames" :key="s" :value="s">{{ s }}</option>
                            </select>
                            <input v-else
                                   class="cfg-puzzle-input cfg-mono"
                                   type="text"
                                   v-model.trim="row.subkey"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   :placeholder="rowCategoryMeta(row).subkeyHint">
                          </div>

                          <div class="cfg-puzzle-piece cfg-puzzle-piece-op">
                            <label class="cfg-puzzle-piece-label">運算</label>
                            <select class="cfg-puzzle-select cfg-puzzle-op"
                                    v-model="row.op"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option v-for="o in OP_TYPES" :key="o" :value="o">{{ o }}</option>
                            </select>
                          </div>

                          <div class="cfg-puzzle-piece cfg-puzzle-piece-value">
                            <label class="cfg-puzzle-piece-label">值</label>
                            <select v-if="rowCategoryMeta(row).valueType === 'mode' && modeNames.length > 0"
                                    class="cfg-puzzle-select"
                                    v-model="row.value"
                                    @change="discardCond.rebuild(discards[selectedDiscardIdx])">
                              <option v-for="m in modeNames" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else-if="rowCategoryMeta(row).valueType === 'number'"
                                   class="cfg-puzzle-input cfg-mono"
                                   type="number" step="any"
                                   v-model="row.value"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   placeholder="0">
                            <input v-else
                                   class="cfg-puzzle-input cfg-mono"
                                   type="text"
                                   v-model.trim="row.value"
                                   @input="discardCond.rebuild(discards[selectedDiscardIdx])"
                                   placeholder="值">
                          </div>

                          <button class="cfg-puzzle-row-del"
                                  @click="discardCond.removeRow(discards[selectedDiscardIdx], ri)"
                                  title="移除此片拼圖">✕</button>
                        </div>
                      </template>
                    </div>

                    <div class="cfg-puzzle-add">
                      <button v-if="!condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])] || condBuilderState.rows[discardCond.key(discards[selectedDiscardIdx])].length === 0"
                              class="cfg-mode-add-btn cfg-puzzle-add-btn"
                              @click="discardCond.addRow(discards[selectedDiscardIdx], 'AND')">
                        <span style="font-size: 14px;">+</span>
                        <span>新增第一片條件</span>
                      </button>
                      <template v-else>
                        <button class="cfg-puzzle-add-and" @click="discardCond.addRow(discards[selectedDiscardIdx], 'AND')">+ AND 條件</button>
                        <button class="cfg-puzzle-add-or" @click="discardCond.addRow(discards[selectedDiscardIdx], 'OR')">+ OR 條件</button>
                      </template>
                    </div>

                    <div class="cfg-puzzle-dsl">
                      <span class="cfg-puzzle-dsl-label">生成的 DSL:</span>
                      <code class="cfg-puzzle-dsl-code">{{ discards[selectedDiscardIdx].condition || '(空)' }}</code>
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
                  <!-- ── #5 釘到 inspector ── -->
                  <div class="cfg-puzzle-pin">
                    <button class="cfg-puzzle-pin-btn"
                            :class="{ active: pinnedTest && pinnedTest.kind === 'discard' && pinnedTest.id === discards[selectedDiscardIdx].discard_id }"
                            @click="pinTest('discard', discards[selectedDiscardIdx].discard_id, discards[selectedDiscardIdx].discard_id)"
                            :disabled="!discards[selectedDiscardIdx].discard_id"
                            title="把這條棄牌規則釘到右下角的 Test Inspector,即時看條件評估結果">
                      <span>🧪</span>
                      <span v-if="pinnedTest && pinnedTest.kind === 'discard' && pinnedTest.id === discards[selectedDiscardIdx].discard_id">已釘住 — 看右下 inspector</span>
                      <span v-else>釘到 Test Inspector</span>
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
      </div>

      <!-- ═══════ 12_Distribution_Bins 分佈區間 ═══════ -->
      <div v-else-if="active === 'distribution_bins'" class="cfg-form">
        <div class="cfg-form-header">
          <div class="cfg-form-title">📊 12_Distribution_Bins · 分佈區間</div>
          <div class="cfg-form-sub">
            每個模式各自的賠付倍數細顆粒度區間,用於 B 文件的分佈分析。
            模式清單來自
            <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>,
            新增模式時會自動套用預設區間。
          </div>
        </div>

        <div v-if="modeNames.length === 0" class="cfg-empty-state">
          <div class="cfg-empty-icon">🚧</div>
          <div class="cfg-empty-text">
            尚未定義任何模式,請先到
            <a href="#" @click.prevent="active='global'" class="cfg-link">01_Global · 模式定義</a>
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
                <input class="input" type="text"
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
               placeholder="搜尋分頁、模式、符號、規則、欄位…(Esc 關閉)"
               autocomplete="off"
               spellcheck="false">
        <span class="cfg-search-kbd">Ctrl+K</span>
      </div>

      <div class="cfg-search-results">
        <div v-if="searchResults.length === 0" class="cfg-search-empty">
          沒有結果。試試模式名(FG1)、符號名(WILD)、分頁名(規則)、或欄位 key(random_seed)。
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
            <span class="cfg-search-item-cat">{{ item.categoryLabel }}</span>
          </div>
        </div>
      </div>

      <div class="cfg-search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 導覽</span>
        <span><kbd>Enter</kbd> 跳轉</span>
        <span><kbd>Esc</kbd> 關閉</span>
        <span class="cfg-search-footer-count">{{ searchResults.length }} 個結果</span>
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
      <span class="cfg-inspector-header-title">Test Inspector</span>
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
          <span class="cfg-inspector-result-label">點任一規則「釘到 Test Inspector」即可開始測試</span>
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
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.mode">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>combo_step</label>
            <input class="input cfg-mono" type="number" v-model.number="testCtx.combo_step">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>multiplier</label>
            <input class="input cfg-mono" type="number" step="any" v-model.number="testCtx.multiplier">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>total_multiplier</label>
            <input class="input cfg-mono" type="number" step="any" v-model.number="testCtx.total_multiplier">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>consecutive_dead_spins</label>
            <input class="input cfg-mono" type="number" v-model.number="testCtx.consecutive_dead_spins">
          </div>
          <div class="cfg-inspector-ctx-field">
            <label>event(上一個 EMIT)</label>
            <input class="input cfg-mono" type="text" v-model.trim="testCtx.event"
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
