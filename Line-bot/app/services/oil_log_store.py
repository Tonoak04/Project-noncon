from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "oil_logs.json"


def _ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


@dataclass
class OilLogEntry:
    entry_id: str
    user_id: str
    liters: float
    amount: float
    price_per_liter: float
    confidence: float
    raw_text: List[str]
    created_at: str
    notes: Optional[str] = None


class OilLogStore:
    """Simple JSON based persistence for oil logs."""

    def __init__(self) -> None:
        _ensure_storage()
        self.path = DATA_FILE

    def append(self, entry: OilLogEntry) -> OilLogEntry:
        entries = self._read_all()
        entries.append(asdict(entry))
        self.path.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return entry

    def _read_all(self) -> List[dict]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    @staticmethod
    def build_entry(
        *,
        entry_id: str,
        user_id: str,
        liters: float,
        amount: float,
        price_per_liter: float,
        confidence: float,
        raw_text: List[str],
        notes: Optional[str] = None,
    ) -> OilLogEntry:
        timestamp = datetime.now(timezone.utc).isoformat()
        return OilLogEntry(
            entry_id=entry_id,
            user_id=user_id,
            liters=liters,
            amount=amount,
            price_per_liter=price_per_liter,
            confidence=confidence,
            raw_text=raw_text,
            created_at=timestamp,
            notes=notes,
        )
