# backend/config.py
import logging

# backend/config.py
import os
from contextlib import contextmanager
from typing import Dict, List, Optional, Union
from urllib.parse import urlparse

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

logger = logging.getLogger(__name__)


class Settings:
    # Database - Use DATABASE_URL from environment
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:password@localhost:5432/testforge"
    )

    # App
    APP_NAME: str = "TestForge API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    # Upload
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", 10485760))

    APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

    # Testing
    TESTING: bool = os.getenv("TESTING", "True").lower() == "true"
    TEST_EXAM_CENTER_ID: str = os.getenv(
        "TEST_EXAM_CENTER_ID", "a3e5c386-efbb-373e-36d0-1bc812bde9d2"
    )

    @property
    def DB_HOST(self) -> str:
        parsed = urlparse(self.DATABASE_URL)
        return parsed.hostname or "localhost"

    @property
    def DB_PORT(self) -> int:
        parsed = urlparse(self.DATABASE_URL)
        return parsed.port or 5432

    @property
    def DB_NAME(self) -> str:
        return self.DATABASE_URL.split("/")[-1]

    @property
    def DB_USER(self) -> str:
        parsed = urlparse(self.DATABASE_URL)
        return parsed.username or "postgres"

    @property
    def DB_PASSWORD(self) -> str:
        parsed = urlparse(self.DATABASE_URL)
        return parsed.password or ""


settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# ============================================================================
# Database Manager
# ============================================================================


class DatabaseManager:
    def __init__(self):
        self.engine = None
        self.SessionLocal = None

    def connect(self):
        self.engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        logger.info(
            f"Database connection established to {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
        )

    @contextmanager
    def get_session(self):
        if not self.SessionLocal:
            self.connect()
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def execute_query(self, query: str, params: Optional[Dict] = None) -> List[Dict]:
        with self.get_session() as session:
            result = session.execute(text(query), params or {})
            return [dict(row._mapping) for row in result]

    def execute_update(self, query: str, params: Union[Dict, tuple, list, None] = None) -> int:
        """Execute update with dict or tuple/list parameters"""
        with self.get_session() as session:
            if params is None:
                result = session.execute(text(query))
            elif isinstance(params, dict):
                result = session.execute(text(query), params)
            elif isinstance(params, (tuple, list)):
                result = session.execute(text(query), params)
            else:
                result = session.execute(text(query))
            return result.rowcount


db = DatabaseManager()
