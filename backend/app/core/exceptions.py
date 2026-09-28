class BusinessException(Exception):
    """业务异常基类，对应统一 API 400 业务错误"""
    def __init__(self, message: str, code: int = 400, data: any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.data = data
