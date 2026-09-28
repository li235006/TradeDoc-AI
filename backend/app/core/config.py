try:
    from app.config import Settings, get_settings, settings
except ImportError:
    from backend.app.config import Settings, get_settings, settings


__all__ = ["Settings", "get_settings", "settings"]
