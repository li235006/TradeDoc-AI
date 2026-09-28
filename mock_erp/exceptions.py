from typing import Any, Optional


class BusinessException(Exception):
    """业务统一异常，用于触发三值协议 code=400 提示"""

    def __init__(self, message: str, code: int = 400, data: Optional[Any] = None):
        self.message = message
        self.code = code
        self.data = data
        super().__init__(message)
