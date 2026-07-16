# Config Editor Shell IA — Design Spec

**Date:** 2026-07-16  
**Phase:** P1 — A 設定檔編輯器殼層（Symbol 頁與各 sheet 細修下一輪）  
**Depth:** 2（版面整理）+ 3（分頁列 IA 重構，最小必要）  
**Approach:** 3 — 分頁列資訊架構重構  
**Builds on:** `2026-07-16-shared-ui-token-polish-design.md`（共用 token 已落地）

## Goal

把左側分頁列改成符合設計工作流的群組與順序，並同步加深殼層（topbar／tab rail／content 外殼）的呼吸感與視覺層級；不改 sheet 內部與業務資料模型。

## Current State (baseline)

Visible rail after v7.10:

| Group | Visible tabs |
|-------|----------------|
| 基礎設定 (`base`) | 規則 → 盤面結構 → 符號清單 → 押注 |
| 賠付 (`rule`) | 硬約束 only（單項群組偏空） |
| 權重表 (`weight`) | 權重 |
| 文件（template 硬編碼） | 文件生成 |

Hidden tabs and peer routing (rules/paylines, reel_weights peers, etc.) remain as today.

## New Information Architecture

| New group id | Label | Icon | Visible tab order |
|--------------|-------|------|-------------------|
| `structure` | 結構 | 🏗 | `layout` → `symbols` |
| `mechanic` | 機制 | 🎯 | `rules` → `bet_config` → `constraints` |
| `weight` | 機率 | 🎲 | `reel_weights` |
| `output` | 輸出 | 📄 | `docgen`（納入 metadata，不再硬編碼獨立區塊） |

### Tab `group` reassignment

| Tab id | Old group | New group | Notes |
|--------|-----------|-----------|-------|
| `layout` | base | structure | |
| `symbols` | base | structure | |
| `rules` | base | mechanic | Parent + peer active logic unchanged |
| `bet_config` | base | mechanic | |
| `constraints` | rule | mechanic | Eliminates single-item 賠付 group |
| `reel_weights` | weight | weight | Group label → 機率 |
| `docgen` | (hardcoded) | output | Add to `TABS` (or equivalent) with `group: 'output'`; no A.xlsx sheet |

Hidden tabs keep their existing `group` values **or** move with their logical parent group only if required for `TABS_BY_GROUP` filtering — prefer keeping `hidden: true` and current peer hosts so export/validation by tab id stays stable. Do not un-hide any tab.

### Compatibility (must not break)

- Tab `id` strings unchanged (`rules`, `layout`, `symbols`, …)
- Sheet ids / export / validation keyed by tab id unchanged
- Peer active highlighting for `rules` / `reel_weights` unchanged in behavior
- `hidden` tabs stay hidden from the rail

## Shell Visual (depth 2)

Apply in `css/theme_additions.css` (and dark overrides in `theme_v34.css` only if needed):

| Surface | Change |
|---------|--------|
| `.cfg-tabs` / `.cfg-tab-group-*` | Clearer group headers; larger inter-group gap via `--space-*`; type via `--fs-*` |
| `.cfg-tab` | Stronger name hierarchy; Hover / Active / Pressed aligned with shared button language; keep left active indicator |
| `.cfg-source-bar` | Slightly taller / looser padding; strengthen source text hierarchy — **no** overflow menu refactor |
| `.cfg-content` shell | Outer padding / radius rhythm only — **no** per-sheet internals |

Use existing design tokens from shared polish (`--space-*`, `--fs-*`, `--r-*`, `--hover`, `--press`). Transitions list properties explicitly (no `transition: all`). Keep `prefers-reduced-motion`.

## Structural seams (depth 3, minimal)

| File | Responsibility |
|------|----------------|
| `js/config-editor/helpers.js` | Update `TAB_GROUPS`, reassign `TABS[].group`, order visible tabs; register `docgen` in metadata if needed |
| `js/config-editor/template.js` | Render all groups from `visibleTabGroups` / `TABS_BY_GROUP`; remove hardcoded 文件 block once `output` exists |
| `css/theme_additions.css` | Shell visual tokens consumption |
| `css/modules/theme_v34.css` | Dark-mode tweaks for new group classes only if selectors break |

Prefer no `setup.js` logic changes unless `visibleTabGroups` / dirty-count helpers assume old group ids — then update id maps only.

## Out of Scope

- Symbol 獨立頁（P1 下一輪）
- 各 sheet 內部版面與矩陣密度
- 頂欄 overflow／工具收納（Approach 2）
- 業務驗證、匯出、xlsx sheet 結構
- 重新曝光 hidden tabs

## Verification

1. Open A 設定檔編輯器：左側群組為 結構／機制／機率／輸出，順序符合表。
2. Click each visible tab — content still loads; rules caret / peer active still works; reel_weights peers still highlight parent.
3. 文件生成 still opens via 輸出 group.
4. Dirty dots / issue badges / NA lock still appear on tabs.
5. Dark theme rail still readable.
6. No JS errors; export path still finds tabs by id.

## Success Criteria

- Single-item「賠付」群組消失；硬約束落在「機制」。
- 文件生成不再靠 template 硬編碼群組。
- Shell denser hierarchy and spacing without rewriting sheet UIs.
- Zero change to tab ids and hidden-tab peer routing behavior.
