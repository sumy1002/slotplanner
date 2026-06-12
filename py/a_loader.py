"""
A.xlsx 解析器與全分頁交叉驗證

職責:
  1. 讀取 A.xlsx 13 個分頁
  2. 解析為 schemas.AConfig
  3. 全分頁交叉驗證,任何錯誤拋 ConfigValidationError 並指出位置

驗證項目:
  - 01_Global: 必填欄位完整、starting_mode 在 11_Mode_Config 存在
  - 02_Layout: Reel_ID 連續、Max_Rows >= 1
  - 03_Symbols: Symbol_ID 唯一、Pay_3x..6x 數值合法
  - 04_Reel_Weights: 引用的 Symbol_ID 存在、Reel_ID 在 02_Layout 範圍、權重 > 0
  - 05_Grid_Size_Weights: Grid_Size <= Max_Rows、Mode 存在
  - 06_Paylines: 路徑座標合法(在不規則盤上有效)、★前 3 格重疊偵測★
  - 07_Constraints: Symbol_ID 存在、reels_allowed 在範圍
  - 08_Combo_Weights: 引用合法
  - 09_Puzzle_Rules: Priority 不重複、Trigger/Action 語法正確
  - 10_Discard_Rules: 條件語法正確
  - 11_Mode_Config: Mode 名稱唯一、starting_mode 存在
  - 12_Distribution_Bins: bin_edges 遞增、長度 >= 2
"""
from __future__ import annotations
import re
import pandas as pd
from pathlib import Path
from collections import defaultdict
from typing import Any

from core.schemas import (
    AConfig, GlobalConfig, LayoutConfig, ReelLayout, PanelDef,
    SymbolDef, SymbolType,
    ReelWeight, GridSizeWeight, ComboWeightOverride,
    Payline, Constraint, ConstraintType,
    PuzzleRule, TriggerType,
    DiscardRule, DiscardType,
    ModeConfig, DistributionBin,
    PayType, WaysDirection,
    ConfigValidationError,
)
from core.condition_parser import parse_condition, parse_actions


# ============================================================
# 公開入口
# ============================================================
def load_a_config(path: str | Path) -> AConfig:
    """載入並驗證 A.xlsx,失敗拋 ConfigValidationError"""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"找不到 A 設定檔: {path}")

    sheets = pd.read_excel(path, sheet_name=None, dtype=object, engine="openpyxl")

    # 必要分頁存在性檢查
    required = [
        "01_Global", "02_Layout", "03_Symbols", "04_Reel_Weights",
        "06_Paylines", "07_Constraints", "09_Puzzle_Rules",
        "10_Discard_Rules", "11_Mode_Config", "12_Distribution_Bins",
    ]
    for s in required:
        if s not in sheets:
            raise ConfigValidationError(s, f"缺少必要分頁 {s}")

    global_cfg = _parse_global(sheets["01_Global"])
    layout = _parse_layout(sheets["02_Layout"])
    # v4.7/v4.8:02b_Panels 與 03b_Symbol_Sets 皆為選用分頁（純加法,舊檔無此 sheet → 空）
    layout.panels = _parse_panels(sheets.get("02b_Panels"))
    symbol_sets = _parse_symbol_sets(sheets.get("03b_Symbol_Sets"))
    symbols = _parse_symbols(sheets["03_Symbols"])
    reel_weights = _parse_reel_weights(sheets["04_Reel_Weights"], symbols, layout)
    grid_size_weights = _parse_grid_size_weights(
        sheets.get("05_Grid_Size_Weights"), layout
    )
    paylines = _parse_paylines(sheets["06_Paylines"], layout)
    constraints = _parse_constraints(sheets["07_Constraints"], symbols, layout)
    combo_weights = _parse_combo_weights(
        sheets.get("08_Combo_Weights"), symbols, layout
    )
    puzzle_rules = _parse_puzzle_rules(sheets["09_Puzzle_Rules"])
    discard_rules = _parse_discard_rules(sheets["10_Discard_Rules"])
    modes = _parse_modes(sheets["11_Mode_Config"])
    distribution_bins = _parse_distribution_bins(sheets["12_Distribution_Bins"])

    cfg = AConfig(
        global_cfg=global_cfg,
        layout=layout,
        symbols=symbols,
        reel_weights=reel_weights,
        grid_size_weights=grid_size_weights,
        paylines=paylines,
        constraints=constraints,
        combo_weights=combo_weights,
        puzzle_rules=puzzle_rules,
        discard_rules=discard_rules,
        modes=modes,
        distribution_bins=distribution_bins,
        symbol_sets=symbol_sets,   # v4.7:panel 獨立符號集
        raw_dataframes=sheets,   # 留存用於 B 文件「A 參數回填」
    )

    # 全分頁交叉驗證
    _cross_validate(cfg)
    return cfg


# ============================================================
# 各分頁解析
# ============================================================
def _col(r, *names, default=None):
    """欄名別名容錯讀取:依序嘗試多個欄名,回傳第一個非 NaN 的值。

    v4.8:前端 aconfig-xlsx.js 匯出的標頭與舊版 loader 期望的欄名
    曾經分裂（Mode_Scope vs Mode、Mega_W vs Mega_Width、
    Discard_ID vs Rule_ID 等）,造成整張表被靜默跳過或硬炸。
    此 helper 讓兩種命名都吃,維持新舊 A.xlsx 完全相容。
    """
    for n in names:
        v = r.get(n)
        if v is not None and not (isinstance(v, float) and pd.isna(v)) and not pd.isna(v):
            return v
    return default


def _parse_global(df: pd.DataFrame) -> GlobalConfig:
    sheet = "01_Global"
    if "Key" not in df.columns or "Value" not in df.columns:
        raise ConfigValidationError(sheet, "必須包含 Key 與 Value 兩欄")

    kv = {str(r["Key"]).strip(): r["Value"]
          for _, r in df.iterrows()
          if pd.notna(r.get("Key"))}

    def _need(key: str) -> Any:
        if key not in kv or pd.isna(kv[key]):
            raise ConfigValidationError(sheet, f"缺少必填 Key: {key}")
        return kv[key]

    try:
        cfg = GlobalConfig(
            simulation_count=int(_need("simulation_count")),
            random_seed=int(_need("random_seed")),
            output_prefix=str(_need("output_prefix")),
            pay_type=PayType(str(_need("pay_type")).strip().upper()),
            ways_direction=WaysDirection(str(kv.get("ways_direction", "LTR")).strip().upper()),
            cluster_min_size=int(kv.get("cluster_min_size", 5) or 5),
            starting_mode=str(_need("starting_mode")),
            max_chain_depth=int(kv.get("max_chain_depth", 100) or 100),
            max_chain_per_rule=int(kv.get("max_chain_per_rule", 50) or 50),
            big_win_thresholds=_parse_csv_floats(kv.get("big_win_thresholds", "100,500")),
            dead_spin_buckets=_parse_csv_ints(kv.get("dead_spin_buckets", "2,3,4,5")),
        )
    except ValueError as e:
        raise ConfigValidationError(sheet, f"型別解析失敗: {e}")
    return cfg


def _parse_layout(df: pd.DataFrame) -> LayoutConfig:
    sheet = "02_Layout"
    reels = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Reel_ID")):
            continue
        try:
            reels.append(ReelLayout(
                reel_id=int(r["Reel_ID"]),
                y_offset=int(r.get("Y_Offset", 0) or 0),
                max_rows=int(r["Max_Rows"]),
                has_subreel=_to_bool(r.get("Has_SubReel")),
                subreel_position=_to_str(r.get("SubReel_Position")),
                subreel_rows=int(r.get("SubReel_Rows", 0) or 0),
                subreel_inherit_weight=_to_bool(r.get("SubReel_Inherit_Weight")),
                subreel_kind=(_to_str(r.get("SubReel_Kind")) or "STACK"),  # v4.6:空→STACK 向後相容
                subreel_symbol_set=_to_str(r.get("SubReel_Symbol_Set")),    # v5.1:選用欄,缺→空
            ))
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not reels:
        raise ConfigValidationError(sheet, "至少需要 1 個 Reel")
    # 排序並檢查 Reel_ID 連續
    reels.sort(key=lambda x: x.reel_id)
    expected = list(range(1, len(reels) + 1))
    actual = [r.reel_id for r in reels]
    if actual != expected:
        raise ConfigValidationError(
            sheet, f"Reel_ID 必須從 1 開始連續編號,目前: {actual}"
        )
    for r in reels:
        if r.max_rows < 1:
            raise ConfigValidationError(sheet, f"Reel {r.reel_id} 的 Max_Rows 必須 >= 1")
    return LayoutConfig(reels=reels)


def _parse_panels(df: pd.DataFrame | None) -> list[PanelDef]:
    """v4.7:02b_Panels 自由副盤。選用分頁,缺 sheet → []（向後相容）。"""
    if df is None:
        return []
    sheet = "02b_Panels"
    out: list[PanelDef] = []
    seen: set[str] = set()
    for idx, r in df.iterrows():
        pid = r.get("Panel_ID")
        if pd.isna(pid):
            continue
        pid = str(pid).strip()
        if not pid:
            continue
        if pid in seen:
            raise ConfigValidationError(sheet, f"Panel_ID 重複: {pid}", row=idx + 2)
        seen.add(pid)
        try:
            p = PanelDef(
                panel_id=pid,
                col=int(r.get("Col", 0) or 0),
                row=int(r.get("Row", 0) or 0),
                width=int(r.get("Width", 3) or 3),
                height=int(r.get("Height", 3) or 3),
                scroll=_to_bool(r.get("Scroll")),
                symbol_set=_to_str(r.get("Symbol_Set")),
                inherit_weight=_to_bool(r.get("Inherit_Weight")),
                join_payline=_to_bool(r.get("Join_Payline")),
                note=_to_str(r.get("Note")),
            )
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"Panel {pid} 解析失敗: {e}", row=idx + 2)
        if p.width < 1 or p.height < 1:
            raise ConfigValidationError(
                sheet, f"Panel {pid} 的 Width/Height 必須 >= 1", row=idx + 2
            )
        out.append(p)
    return out


def _parse_symbol_sets(df: pd.DataFrame | None) -> dict[str, list[str]]:
    """v4.7:03b_Symbol_Sets 符號集（panel 獨立符號集用）。選用分頁。"""
    if df is None:
        return {}
    out: dict[str, list[str]] = {}
    for _, r in df.iterrows():
        name = r.get("Set_Name")
        sid = r.get("Symbol_ID")
        if pd.isna(name) or pd.isna(sid):
            continue
        name = str(name).strip()
        sid = str(sid).strip()
        if not name or not sid:
            continue
        out.setdefault(name, [])
        if sid not in out[name]:
            out[name].append(sid)
    return out


def _parse_symbols(df: pd.DataFrame) -> dict[str, SymbolDef]:
    sheet = "03_Symbols"
    out = {}
    for idx, r in df.iterrows():
        sid = r.get("Symbol_ID")
        if pd.isna(sid):
            continue
        sid = str(sid).strip()
        if sid in out:
            raise ConfigValidationError(sheet, f"Symbol_ID 重複: {sid}", row=idx + 2)
        try:
            pay_table = {}
            for n in (3, 4, 5, 6):
                col = f"Pay_{n}x"
                v = r.get(col)
                if pd.notna(v):
                    pay_table[n] = float(v)
            sym = SymbolDef(
                symbol_id=sid,
                display_name=str(r.get("Display_Name") or sid),
                sym_type=SymbolType(str(r["Type"]).strip().upper()),
                pay_table=pay_table,
                mega_width=int(_col(r, "Mega_Width", "Mega_W", default=1) or 1),
                mega_height=int(_col(r, "Mega_Height", "Mega_H", default=1) or 1),
                is_wild=_to_bool(r.get("Is_Wild")),
                is_scatter=_to_bool(r.get("Is_Scatter")),
                notes=_to_str(r.get("Notes")),
            )
            out[sid] = sym
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"Symbol {sid} 解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需定義 1 個符號")
    return out


def _parse_reel_weights(
    df: pd.DataFrame, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[ReelWeight]:
    sheet = "04_Reel_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    valid_panels = {p.panel_id for p in layout.panels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        if mode_val is None or pd.isna(r.get("Reel_ID")):
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue   # 註解列
            reel_id_raw = str(r["Reel_ID"]).strip()
            # 浮點殘渣容錯:pandas 可能把數字欄讀成 "3.0"
            if re.fullmatch(r"\d+\.0", reel_id_raw):
                reel_id_raw = reel_id_raw[:-2]
            sid = str(r["Symbol_ID"]).strip()
            if sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 在 03_Symbols 不存在", row=idx + 2
                )
            weight = float(r["Weight"])
            if weight < 0:
                raise ConfigValidationError(sheet, "Weight 不可為負", row=idx + 2)

            # v4.7:Reel_ID 三種定址 — 純數字=主輪、<n>.sub=副輪、其他字串=Panel ID
            is_subreel = reel_id_raw.endswith(".sub")
            numeric_part = reel_id_raw[:-4] if is_subreel else reel_id_raw
            if re.fullmatch(r"\d+", numeric_part):
                reel_id = int(numeric_part)
                if reel_id not in valid_reels:
                    raise ConfigValidationError(
                        sheet, f"Reel_ID {reel_id} 不在 02_Layout 定義範圍", row=idx + 2
                    )
                out.append(ReelWeight(
                    mode=mode, reel_id=reel_id, is_subreel=is_subreel,
                    symbol_id=sid, weight=weight,
                ))
            else:
                # panel 字串 ID
                if reel_id_raw not in valid_panels:
                    raise ConfigValidationError(
                        sheet,
                        f"Reel_ID '{reel_id_raw}' 既非主輪編號也不在 02b_Panels 定義",
                        row=idx + 2,
                    )
                out.append(ReelWeight(
                    mode=mode, reel_id=0, is_subreel=False,
                    symbol_id=sid, weight=weight, panel_id=reel_id_raw,
                ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需 1 筆權重")
    return out


def _parse_grid_size_weights(
    df: pd.DataFrame | None, layout: LayoutConfig
) -> list[GridSizeWeight]:
    if df is None:
        return []
    sheet = "05_Grid_Size_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    layout_max = {r.reel_id: r.max_rows for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        if mode_val is None or pd.isna(r.get("Reel_ID")):
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue   # 註解列
            reel_id = int(r["Reel_ID"])
            if reel_id not in valid_reels:
                raise ConfigValidationError(
                    sheet, f"Reel_ID {reel_id} 不存在", row=idx + 2
                )
            grid_size = int(r["Grid_Size"])
            if grid_size > layout_max[reel_id]:
                raise ConfigValidationError(
                    sheet,
                    f"Reel {reel_id} 的 Grid_Size {grid_size} 超過 Max_Rows {layout_max[reel_id]}",
                    row=idx + 2,
                )
            out.append(GridSizeWeight(
                mode=mode,
                reel_id=reel_id,
                grid_size=grid_size,
                weight=float(r["Weight"]),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError):
            continue   # 灰色範例列允許略過
    return out


def _parse_paylines(df: pd.DataFrame, layout: LayoutConfig) -> list[Payline]:
    sheet = "06_Paylines"
    out = []
    valid_cells = {(r.reel_id, row)
                   for r in layout.reels
                   for row in range(1, r.max_rows + 1)}

    for idx, r in df.iterrows():
        if pd.isna(r.get("Line_ID")) or pd.isna(r.get("Path")):
            continue
        try:
            line_id = int(r["Line_ID"])
            path_str = str(r["Path"]).strip()
            path = _parse_path(path_str)
            for (reel, row) in path:
                if (reel, row) not in valid_cells:
                    raise ConfigValidationError(
                        sheet,
                        f"Line {line_id} 路徑點 ({reel},{row}) 在不規則盤面上不合法",
                        row=idx + 2,
                    )
            direction = WaysDirection(_to_str(r.get("Direction"), "LTR").upper())
            out.append(Payline(
                line_id=line_id,
                path=path,
                direction=direction,
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)

    # ★ 前 3 格重疊偵測 ★
    seen = {}
    for line in out:
        if len(line.path) < 3:
            continue
        prefix = tuple(line.path[:3])
        if prefix in seen:
            raise ConfigValidationError(
                sheet,
                f"Payline {line.line_id} 與 {seen[prefix]} 的前 3 格路徑完全重疊: {prefix}",
            )
        seen[prefix] = line.line_id
    return out


def _parse_path(s: str) -> list[tuple[int, int]]:
    """'(1,1)-(2,1)-(3,1)' → [(1,1),(2,1),(3,1)]"""
    parts = s.split("-")
    out = []
    for p in parts:
        m = re.match(r"\(\s*(\d+)\s*,\s*(\d+)\s*\)", p.strip())
        if not m:
            raise ValueError(f"無效路徑片段: {p!r}")
        out.append((int(m.group(1)), int(m.group(2))))
    return out


def _parse_constraints(
    df: pd.DataFrame, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[Constraint]:
    sheet = "07_Constraints"
    valid_reels = {r.reel_id for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Constraint_ID")):
            continue
        try:
            sid = _to_str(r.get("Symbol_ID"))
            if sid and sid.lower() != "nan" and sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 不存在", row=idx + 2
                )
            reels_str = _to_str(r.get("Reels_Allowed"))
            reels_allowed = []
            if reels_str and reels_str.lower() != "nan":
                reels_allowed = [int(x.strip()) for x in reels_str.split(",") if x.strip()]
                for reel in reels_allowed:
                    if reel not in valid_reels:
                        raise ConfigValidationError(
                            sheet, f"Reel {reel} 不存在", row=idx + 2
                        )
            threshold = 0
            v = r.get("Max_Count_Global")
            if pd.notna(v):
                threshold = int(v)
            out.append(Constraint(
                constraint_id=str(r["Constraint_ID"]).strip(),
                ctype=ConstraintType(str(r["Type"]).strip().upper()),
                symbol_id=sid,
                reels_allowed=reels_allowed,
                threshold=threshold,
                mode_scope=_to_str(r.get("Mode_Scope"), "ALL"),
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


def _parse_combo_weights(
    df: pd.DataFrame | None, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[ComboWeightOverride]:
    if df is None:
        return []
    sheet = "08_Combo_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        after_val = _col(r, "After_Combo", "Combo_Step")
        if mode_val is None or after_val is None:
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue
            reel_id = int(r["Reel_ID"])
            sid = str(r["Symbol_ID"]).strip()
            if reel_id not in valid_reels:
                continue   # 範例列略過
            if sid not in symbols:
                continue
            out.append(ComboWeightOverride(
                mode=mode,
                after_combo=int(after_val),
                reel_id=reel_id,
                symbol_id=sid,
                weight=float(r["Weight"]),
            ))
        except (ValueError, KeyError):
            continue
    return out


def _parse_puzzle_rules(df: pd.DataFrame) -> list[PuzzleRule]:
    sheet = "09_Puzzle_Rules"
    out = []
    seen_priorities = defaultdict(list)
    for idx, r in df.iterrows():
        if pd.isna(r.get("Rule_ID")):
            continue
        try:
            rule_id = str(r["Rule_ID"]).strip()
            priority = int(r["Priority"])
            trigger = TriggerType(str(r["Trigger"]).strip().upper())
            cond = parse_condition(_to_str(r.get("Condition")))
            actions = parse_actions(_to_str(r.get("Actions")))
            emits_str = _to_str(r.get("Emits"))
            emits = [s.strip() for s in emits_str.split(",") if s.strip()] if emits_str else []
            enabled = _to_bool(r.get("Enabled"))
            out.append(PuzzleRule(
                rule_id=rule_id,
                priority=priority,
                trigger=trigger,
                condition=cond,
                actions=actions,
                emits=emits,
                enabled=enabled,
                description=_to_str(r.get("Description")),
            ))
            seen_priorities[(trigger, priority)].append(rule_id)
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗 ({e})", row=idx + 2)

    # 同一 Trigger 內 Priority 重複 → 警告但不阻止(允許但顯示在 log)
    # 嚴格模式可改為錯誤
    for (trig, pri), rids in seen_priorities.items():
        if len(rids) > 1:
            print(f"⚠ [09_Puzzle_Rules] Trigger={trig.value} Priority={pri} 重複: {rids}. "
                  f"執行順序將以 Rule_ID 字典序為次要排序鍵。")
    return out


def _parse_discard_rules(df: pd.DataFrame) -> list[DiscardRule]:
    sheet = "10_Discard_Rules"
    out = []
    for idx, r in df.iterrows():
        rid_val = _col(r, "Rule_ID", "Discard_ID")
        if rid_val is None:
            continue
        try:
            cond = parse_condition(_to_str(r.get("Condition")))
            dtype_val = _col(r, "Type", "Discard_Kind")
            if dtype_val is None:
                raise KeyError("Type / Discard_Kind")
            out.append(DiscardRule(
                rule_id=str(rid_val).strip(),
                dtype=DiscardType(str(dtype_val).strip().upper()),
                mode_scope=_to_str(r.get("Mode_Scope"), "ALL"),
                condition=cond,
                reason_label=_to_str(r.get("Reason_Label")),
                notes=_to_str(r.get("Notes")),
            ))
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗 ({e})", row=idx + 2)
    return out


def _parse_modes(df: pd.DataFrame) -> dict[str, ModeConfig]:
    sheet = "11_Mode_Config"
    out = {}
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode")):
            continue
        try:
            mode = str(r["Mode"]).strip()
            if mode in out:
                raise ConfigValidationError(sheet, f"Mode {mode} 重複定義", row=idx + 2)
            cond = parse_condition(_to_str(r.get("Trigger_Condition")))
            reset_str = _to_str(r.get("On_Enter_Reset_Vars"))
            reset_vars = [s.strip() for s in reset_str.split(",") if s.strip()]
            out[mode] = ModeConfig(
                mode=mode,
                trigger_condition=cond,
                spin_count=int(r.get("Spin_Count", 0) or 0),
                inherit_globals=_to_bool(r.get("Inherit_Globals")),
                on_enter_reset_vars=reset_vars,
                notes=_to_str(r.get("Notes")),
            )
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需定義 1 個模式")
    return out


def _parse_distribution_bins(df: pd.DataFrame) -> dict[str, DistributionBin]:
    sheet = "12_Distribution_Bins"
    out = {}
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode_Scope")) or pd.isna(r.get("Bin_Edges")):
            continue
        try:
            scope = str(r["Mode_Scope"]).strip()
            edges = _parse_csv_floats(str(r["Bin_Edges"]))
            if len(edges) < 2:
                raise ConfigValidationError(
                    sheet, f"Bin_Edges 至少 2 個邊界,目前 {len(edges)}", row=idx + 2
                )
            for i in range(len(edges) - 1):
                if edges[i] >= edges[i + 1]:
                    raise ConfigValidationError(
                        sheet,
                        f"Bin_Edges 必須嚴格遞增,違反處: {edges[i]} >= {edges[i+1]}",
                        row=idx + 2,
                    )
            out[scope] = DistributionBin(
                mode_scope=scope,
                bin_edges=edges,
                notes=_to_str(r.get("Notes")),
            )
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


# ============================================================
# 全分頁交叉驗證
# ============================================================
def _cross_validate(cfg: AConfig):
    # starting_mode 必須存在
    if cfg.global_cfg.starting_mode not in cfg.modes:
        raise ConfigValidationError(
            "01_Global",
            f"starting_mode '{cfg.global_cfg.starting_mode}' 在 11_Mode_Config 未定義",
        )

    # 所有 Reel_Weights 引用的 Mode 必須存在
    for w in cfg.reel_weights:
        if w.mode not in cfg.modes:
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode '{w.mode}' 未在 11_Mode_Config 定義",
            )

    # 每個 Mode × Reel 至少要有一筆權重 (若該 Mode 在 Reel_Weights 出現)
    # v4.7:panel 權重(panel_id 非空)另行分組,不混入主輪/副輪檢查
    weight_groups = defaultdict(list)
    panel_weight_groups = defaultdict(list)
    for w in cfg.reel_weights:
        if getattr(w, "panel_id", ""):
            panel_weight_groups[(w.mode, w.panel_id)].append(w)
        else:
            weight_groups[(w.mode, w.reel_id, w.is_subreel)].append(w)
    for (mode, reel_id, is_sub), ws in weight_groups.items():
        total = sum(w.weight for w in ws)
        if total <= 0:
            tag = ".sub" if is_sub else ""
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode={mode} Reel={reel_id}{tag} 的權重總和必須 > 0",
            )
    for (mode, pid), ws in panel_weight_groups.items():
        if sum(w.weight for w in ws) <= 0:
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode={mode} Panel={pid} 的權重總和必須 > 0",
            )

    # v5.1:附掛副盤符號集交叉驗證(同 panel 的 symbol_set 規則)
    for reel in cfg.layout.reels:
        sset = getattr(reel, "subreel_symbol_set", "")
        if reel.has_subreel and sset:
            members = cfg.symbol_sets.get(sset)
            if not members:
                raise ConfigValidationError(
                    "02_Layout",
                    f"Reel {reel.reel_id} 副盤引用的符號集 '{sset}' "
                    f"未在 03b_Symbol_Sets 定義或為空",
                )

    # v4.7:panel 交叉驗證
    panels_with_weights = {pid for (_, pid) in panel_weight_groups}
    for p in cfg.layout.panels:
        # symbol_set 引用必須存在且非空
        if p.symbol_set:
            members = cfg.symbol_sets.get(p.symbol_set)
            if not members:
                raise ConfigValidationError(
                    "02b_Panels",
                    f"Panel {p.panel_id} 引用的符號集 '{p.symbol_set}' "
                    f"未在 03b_Symbol_Sets 定義或為空",
                )
        # 完全沒有權重來源(無專屬池、無符號集、不沿用) → 模擬會整片空白,提早警告
        if (p.panel_id not in panels_with_weights
                and not p.symbol_set and not p.inherit_weight):
            print(f"⚠ [02b_Panels] Panel {p.panel_id} 沒有任何權重來源"
                  f"(04 無專屬權重、無符號集、未沿用保底),模擬時此副盤會是空白。")

    # AWARD_FREE_SPIN(mode=X) 引用的 X 必須在 Mode_Config 存在
    for rule in cfg.puzzle_rules:
        for act in rule.actions:
            if act.atype.value == "AWARD_FREE_SPIN":
                target = act.params.get("mode")
                if target and target not in cfg.modes:
                    raise ConfigValidationError(
                        "09_Puzzle_Rules",
                        f"Rule {rule.rule_id} 的 AWARD_FREE_SPIN 引用未知模式 '{target}'",
                    )
            if act.atype.value == "SWITCH_MODE":
                target = act.params.get("target")
                if target and target not in cfg.modes:
                    raise ConfigValidationError(
                        "09_Puzzle_Rules",
                        f"Rule {rule.rule_id} 的 SWITCH_MODE 引用未知模式 '{target}'",
                    )

    # Discard 規則的 mode_scope 必須存在或為 ALL
    for d in cfg.discard_rules:
        if d.mode_scope != "ALL" and d.mode_scope not in cfg.modes:
            raise ConfigValidationError(
                "10_Discard_Rules",
                f"Rule {d.rule_id} 的 Mode_Scope '{d.mode_scope}' 未定義",
            )


# ============================================================
# 工具函式
# ============================================================
def _to_bool(v: Any) -> bool:
    if v is None or pd.isna(v):
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip().upper()
    return s in ("TRUE", "1", "YES", "Y", "T")


def _to_str(v: Any, default: str = "") -> str:
    """安全字串轉換:處理 NaN / None / 空白"""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return default
    s = str(v).strip()
    if s.lower() == "nan":
        return default
    return s


def _parse_csv_floats(s: Any) -> list[float]:
    if s is None or pd.isna(s):
        return []
    parts = str(s).split(",")
    return [float(x.strip()) for x in parts if x.strip()]


def _parse_csv_ints(s: Any) -> list[int]:
    if s is None or pd.isna(s):
        return []
    parts = str(s).split(",")
    return [int(float(x.strip())) for x in parts if x.strip()]
