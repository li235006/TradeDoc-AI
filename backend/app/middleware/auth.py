import logging
import urllib.parse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("tradedoc.middleware.auth")


class AuthHeaderMiddleware(BaseHTTPMiddleware):
    """
    轻量请求头鉴权中间件：
    从 X-User-Id、X-User-Name、X-User-Dept、X-User-Role 提取用户上下文并注入 request.state
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        raw_id = request.headers.get("X-User-Id")
        raw_name = request.headers.get("X-User-Name")
        raw_dept = request.headers.get("X-User-Dept")
        raw_role = request.headers.get("X-User-Role")

        user_id = urllib.parse.unquote(raw_id) if raw_id else "USR-2026-001"
        user_name = urllib.parse.unquote(raw_name) if raw_name else "李思远"
        user_dept = urllib.parse.unquote(raw_dept) if raw_dept else "物资贸易一部"
        user_role = urllib.parse.unquote(raw_role) if raw_role else "OPERATOR"

        request.state.user_id = user_id
        request.state.user_name = user_name
        request.state.user_dept = user_dept
        request.state.user_role = user_role

        return await call_next(request)
