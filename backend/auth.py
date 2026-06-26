# backend/auth.py
from fastapi import HTTPException, Header
from typing import Optional
import jwt
import logging

from config import settings

logger = logging.getLogger(__name__)

async def get_exam_center_id(authorization: Optional[str] = Header(None)) -> str:
    """Get exam center ID from JWT token or return test ID if TESTING=True"""
    
    if settings.TESTING:
        logger.debug(f"TESTING mode: Using test exam center ID: {settings.TEST_EXAM_CENTER_ID}")
        return settings.TEST_EXAM_CENTER_ID
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        exam_center_id = payload.get("exam_center_id")
        if not exam_center_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing exam_center_id")
        return exam_center_id
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")