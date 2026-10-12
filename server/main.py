"""main.py module."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import db, settings
from routers import api_router

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers - just one line!
app.include_router(api_router)


# Health check
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "testing_mode": settings.TESTING,
    }


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "testing_mode": settings.TESTING,
    }


# Startup event
@app.on_event("startup")
async def startup():
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Testing mode: {settings.TESTING}")
    if settings.TESTING:
        logger.info(f"Using test exam center ID: {settings.TEST_EXAM_CENTER_ID}")
    logger.info(f"Upload directory: {settings.UPLOAD_DIR}")
    db.connect()
    logger.info("Database connected")


# Shutdown event
@app.on_event("shutdown")
async def shutdown():
    logger.info(f"Shutting down {settings.APP_NAME}")
