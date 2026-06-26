# backend/schemas.py (empty for now, will be used later)
from pydantic import BaseModel
from typing import Optional, Any

class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
    error: Optional[str] = None