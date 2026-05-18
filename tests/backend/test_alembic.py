"""Tests for Alembic migration setup."""

import importlib.util
import inspect
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

MIGRATION_FILE = Path(__file__).resolve().parents[2] / "src/backend/alembic/versions/30246b22cf35_initial_tables.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("initial_tables", MIGRATION_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_initial_migration_importable() -> None:
    mod = _load_migration()
    assert hasattr(mod, "upgrade")
    assert hasattr(mod, "downgrade")
    assert callable(mod.upgrade)
    assert callable(mod.downgrade)


def test_alembic_script_directory_loads() -> None:
    cfg = Config("alembic.ini")
    scripts = ScriptDirectory.from_config(cfg)
    revisions = list(scripts.walk_revisions())
    assert len(revisions) >= 1
    assert any(r.revision == "30246b22cf35" for r in revisions)


def test_initial_migration_creates_all_tables() -> None:
    mod = _load_migration()
    source = inspect.getsource(mod.upgrade)
    expected_tables = ["users", "projects", "phases", "tasks", "task_dependencies", "materials", "budgets"]
    for table in expected_tables:
        assert table in source, f"Table '{table}' not found in upgrade()"
