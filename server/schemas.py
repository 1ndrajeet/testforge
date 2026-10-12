"""schemas.py module."""

# backend/schemas.py (empty for now, will be used later)
from typing import Any, Optional

from pydantic import BaseModel


class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
    error: Optional[str] = None
