import sys
from pathlib import Path
sys.path.insert(0, str(Path(r"D:\slotplanner\engine")))
from core.a_loader import load_a_config

p = Path(sys.argv[1])
cfg = load_a_config(p)
print("symbols:", len(cfg.symbols))
print("reels:", len(cfg.layout.reels))
print("modes:", len(cfg.modes))
print("rules:", len(cfg.puzzle_rules))
print("cell_attrs:", len(cfg.cell_attrs))
print("OK round-trip:", p.name)
