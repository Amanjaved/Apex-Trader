# In-memory mock database stub to handle future persistence layer queries (PostgreSQL configuration)
from typing import Dict, Any

class RepositoryStub:
    def __init__(self):
        self._data: Dict[str, Any] = {}

    def save_layout(self, user_id: str, layout_name: str, layout_data: Dict[str, Any]) -> None:
        self._data[f"layout:{user_id}:{layout_name}"] = layout_data

    def load_layout(self, user_id: str, layout_name: str) -> Dict[str, Any] | None:
        return self._data.get(f"layout:{user_id}:{layout_name}")
