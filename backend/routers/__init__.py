# backend/routers/__init__.py
from .upload import router as upload_router
from .timetable import router as timetable_router
from .seatingchart import router as seatingchart_router

# Export all routers
__all__ = ['upload_router', 'timetable_router', 'seatingchart_router']