"""A separate database location for the mobile wallet host."""

import os
from pathlib import Path


def data_dir():
    demo_dir = os.environ.get("EKSTRE_MOBILE_DEMO_DIR")
    if demo_dir:
        return Path(demo_dir).resolve()
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "FinansCuzdanimMobil" / "data"
