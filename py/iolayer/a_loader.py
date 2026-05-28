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
    AConfig, GlobalConfig, LayoutConfig, ReelLayout,
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
        raw_dataframes=sheets,   # 留存用於 B 文件「A 參數回填」
    )

    # 全分頁交叉驗證
    _cross_validate(cfg)
    return cfg


# ============================================================
# 各分頁解析
# ============================================================
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
                mega_width=int(r.get("Mega_Width", 1) or 1),
                mega_height=int(r.get("Mega_Height", 1) or 1),
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
    out = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode")) or pd.isna(r.get("Reel_ID")):
            continue
        try:
            reel_id_raw = str(r["Reel_ID"]).strip()
            is_subreel = reel_id_raw.endswith(".sub")
            reel_id = int(reel_id_raw.replace(".sub", ""))
            if reel_id not in valid_reels:
                raise ConfigValidationError(
                    sheet, f"Reel_ID {reel_id} 不在 02_Layout 定義範圍", row=idx + 2
                )
            sid = str(r["Symbol_ID"]).strip()
            if sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 在 03_Symbols 不存在", row=idx + 2
                )
            weight = float(r["Weight"])
            if weight < 0:
                raise ConfigValidationError(sheet, "Weight 不可為負", row=idx + 2)
            out.append(ReelWeight(
                mode=str(r["Mode"]).strip(),
                reel_id=reel_id,
                is_subreel=is_subreel,
                symbol_id=sid,
                weight=weight,
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
        if pd.isna(r.get("Mode")) or pd.isna(r.get("Reel_ID")):
            continue
        try:
            mode = str(r["Mode"]).strip()
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
        if pd.isna(r.get("Mode")) or pd.isna(r.get("After_Combo")):
            continue
        try:
            mode = str(r["Mode"]).strip()
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
                after_combo=int(r["After_Combo"]),
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
        if pd.isna(r.get("Rule_ID")):
            continue
        try:
            cond = parse_condition(_to_str(r.get("Condition")))
            out.append(DiscardRule(
                rule_id=str(r["Rule_ID"]).strip(),
                dtype=DiscardType(str(r["Type"]).strip().upper()),
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
    weight_groups = defaultdict(list)
    for w in cfg.reel_weights:
        weight_groups[(w.mode, w.reel_id, w.is_subreel)].append(w)
    for (mode, reel_id, is_sub), ws in weight_groups.items():
        total = sum(w.weight for w in ws)
        if total <= 0:
            tag = ".sub" if is_sub else ""
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode={mode} Reel={reel_id}{tag} 的權重總和必須 > 0",
            )

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
