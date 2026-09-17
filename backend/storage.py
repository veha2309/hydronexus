"""Small content-addressed artifact store used by the local vertical slice.

Production deployments can replace this implementation with S3 without changing
adapter contracts. Files are immutable: the SHA-256 digest is part of the key.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any


class ArtifactStore:
    def __init__(self, root: str | Path | None = None):
        configured = root or os.getenv('HYDRONEXUS_DATA_DIR') or '.hydronexus-data'
        self.root = Path(configured).resolve()

    def put_json(self, stage: str, source: str, payload: Any) -> dict[str, Any]:
        body = json.dumps(
            payload, ensure_ascii=False, allow_nan=False, sort_keys=True,
            separators=(',', ':'),
        ).encode('utf-8')
        digest = sha256(body).hexdigest()
        directory = self.root / stage / source
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f'{digest}.json'
        if not target.exists():
            temporary = directory / f'.{digest}.{os.getpid()}.tmp'
            temporary.write_bytes(body)
            try:
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
        return {
            'sha256': digest,
            'storageKey': target.relative_to(self.root).as_posix(),
            'bytes': len(body),
            'storedAt': datetime.now(timezone.utc).isoformat(),
        }

    def latest_json(self, stage: str, source: str) -> dict[str, Any] | None:
        directory = self.root / stage / source
        if not directory.exists():
            return None
        candidates = sorted(
            directory.glob('*.json'), key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for candidate in candidates:
            try:
                value = json.loads(candidate.read_text(encoding='utf-8'))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(value, dict):
                return value
        return None
