from pathlib import Path
from typing import List, Dict, Any
import yaml


def save_yaml(data: List[Dict[str, Any]], path: str = "repos.yaml") -> None:
    p = Path(path)

    # ✅ Ensure directory exists
    p.parent.mkdir(parents=True, exist_ok=True)

    p.write_text(
        yaml.safe_dump(
            data,
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
