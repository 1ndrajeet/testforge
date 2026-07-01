from fastapi import APIRouter

from .emarksheet import router as emarksheet_router
from .inventory import router as inventory_router
from .seatingarrangement import router as seatingarrangement_router
from .seatingchart import router as seatingchart_router
from .timetable import router as timetable_router
from .upload import router as upload_router

# Create a main router that includes all sub-routers
api_router = APIRouter(prefix="/api")

# Register all routers
api_router.include_router(upload_router)
api_router.include_router(timetable_router)
api_router.include_router(seatingchart_router)
api_router.include_router(seatingarrangement_router)
api_router.include_router(inventory_router)
api_router.include_router(emarksheet_router)

# Export only the api_router
__all__ = ["api_router"]
