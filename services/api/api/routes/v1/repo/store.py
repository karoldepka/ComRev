import yaml
from pathlib import Path
from typing import List
from .schema import Repo

DATA_PATH = Path(__file__).parent.parent.parent / "ComRev_Data" / "repos.yaml"


def load_repos() -> List[Repo]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    repos = []
    for item in raw:
        repos.append(Repo(**item))

    return repos