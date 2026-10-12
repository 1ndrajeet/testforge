# server/auth.py
import base64
import json
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, Request

from config import db, settings

logger = logging.getLogger(__name__)


def extract_supabase_token(request: Request) -> Optional[str]:
    """Extract Supabase access token from Authorization header or cookies."""
    # 1. Authorization header (Bearer token)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    # 2. Direct cookie names
    direct_token = request.cookies.get("sb-access-token") or request.cookies.get("supabase-auth-token")
    if direct_token:
        return direct_token

    # 3. Supabase SSR cookies: find sb-*-auth-token or chunked sb-*-auth-token.<index>
    matching_cookies = {}
    for key, val in request.cookies.items():
        if "auth-token" in key:
            matching_cookies[key] = val

    if not matching_cookies:
        return None

    # Handle chunked cookies: sb-<ref>-auth-token.0, sb-<ref>-auth-token.1, etc.
    base_keys = set()
    for key in matching_cookies.keys():
        if "." in key:
            base_keys.add(key.rsplit(".", 1)[0])
        else:
            base_keys.add(key)

    raw_val = ""
    for base in base_keys:
        if base in matching_cookies:
            raw_val = matching_cookies[base]
            break
        # Reassemble chunks
        chunks = []
        idx = 0
        while f"{base}.{idx}" in matching_cookies:
            chunks.append(matching_cookies[f"{base}.{idx}"])
            idx += 1
        if chunks:
            raw_val = "".join(chunks)
            break

    if not raw_val:
        return None

    # Decode payload
    try:
        # Check if base64 encoded by @supabase/ssr (prefixed with 'base64-')
        if raw_val.startswith("base64-"):
            decoded_bytes = base64.b64decode(raw_val[7:])
            parsed = json.loads(decoded_bytes.decode("utf-8"))
        elif raw_val.startswith("[") or raw_val.startswith("{"):
            parsed = json.loads(raw_val)
        else:
            # Might be raw JWT
            return raw_val

        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed[0]
        if isinstance(parsed, dict):
            return parsed.get("access_token")
    except Exception as e:
        logger.debug(f"Failed to parse cookie payload: {e}")
        return raw_val

    return None


async def get_exam_center_id(request: Request) -> str:
    """
    Get exam center ID for current authenticated user.
    Supports Supabase Auth and Testing Mode.
    """
    # 1. Testing / Local Debug Override
    if settings.TESTING:
        return settings.TEST_EXAM_CENTER_ID

    header_override = request.headers.get("X-Exam-Center-Id")
    if settings.DEBUG and header_override:
        return header_override

    # 2. Extract Token
    token = extract_supabase_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Supabase authentication session")

    # 3. Validate Token with Supabase Auth API
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.SUPABASE_ANON_KEY or settings.SUPABASE_SERVICE_ROLE_KEY,
                },
                timeout=5.0,
            )

            if resp.status_code != 200:
                logger.error(f"Supabase auth validation failed: {resp.status_code} - {resp.text}")
                raise HTTPException(status_code=401, detail="Invalid Supabase session")

            user_data = resp.json()
            user_id = user_data.get("id")

            if not user_id:
                raise HTTPException(status_code=401, detail="Supabase user not found")

        # 4. Lookup Exam Center in Supabase (owned by user)
        result = db.execute_query(
            """
            SELECT id FROM exam_centers
            WHERE owner_id = :user_id 
              AND is_active = true 
              AND is_deleted = false
            LIMIT 1
            """,
            {"user_id": user_id},
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Exam center not found for the authenticated user",
            )

        return result[0]["id"]

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Supabase Auth service timeout")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
