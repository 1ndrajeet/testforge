# backend/auth.py
from fastapi import HTTPException, Request
import logging
import httpx
from config import settings, db

logger = logging.getLogger(__name__)

async def get_exam_center_id(request: Request) -> str:
    """Get exam center ID from BetterAuth session"""
    
    if settings.TESTING:
        return settings.TEST_EXAM_CENTER_ID
    
    token = request.cookies.get('better-auth.session_token')
    if not token:
        raise HTTPException(status_code=401, detail="Missing session")
    
    try:
        async with httpx.AsyncClient() as client:
            # Use the correct endpoint - this should work with BetterAuth's [...all] route
            resp = await client.get(
                f"{settings.APP_URL}/api/auth/get-session",
                cookies={"better-auth.session_token": token},
                timeout=5.0
            )
            
            if resp.status_code != 200:
                logger.error(f"Session validation failed: {resp.status_code}")
                raise HTTPException(status_code=401, detail="Invalid session")
            
            data = resp.json()
            user_id = data.get('user', {}).get('id')
            
            if not user_id:
                raise HTTPException(status_code=401, detail="User not found")
        
        # Get exam center ID from database
        result = db.execute_query("""
            SELECT ec.id FROM exam_centers ec
            JOIN org_members om ON om.org_id = ec.org_id
            WHERE om.user_id = :user_id
        """, {"user_id": user_id})
        
        if not result:
            raise HTTPException(status_code=404, detail="Exam center not found")
        
        return result[0]["id"]
        
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Auth service timeout")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")