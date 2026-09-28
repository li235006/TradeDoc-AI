import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

try:
    from mock_erp.db import db_manager
    from mock_erp.exceptions import BusinessException
    from mock_erp.routers.orders import router as orders_router
    from mock_erp.routers.master import router as master_router
    from mock_erp.data.initial_data import init_seed_data
except ImportError:
    from db import db_manager
    from exceptions import BusinessException
    from routers.orders import router as orders_router
    from routers.master import router as master_router
    from data.initial_data import init_seed_data

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("mock_erp.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：初始化与优雅关闭 MongoDB 连接池，并自动同步种子数据"""
    logger.info("Starting up Mock ERP Service...")
    try:
        await db_manager.connect()
        if db_manager.db is not None:
            await init_seed_data(db_manager.db)
    except Exception as e:
        logger.error(f"Failed to connect or seed MongoDB during startup: {e}")
    yield
    logger.info("Shutting down Mock ERP Service...")
    await db_manager.close()


app = FastAPI(
    title="TradeDoc AI - Mock ERP Service",
    description="大宗商贸流通核心系统中台沙箱 (远大商贸 ERP 模拟服务)",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 全局异常捕获处理 (统一三值协议: code 200/400/500, HTTP 状态码统一为 200)
@app.exception_handler(BusinessException)
async def business_exception_handler(request: Request, exc: BusinessException):
    return JSONResponse(
        status_code=200,
        content={"code": exc.code, "message": exc.message, "data": exc.data},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        err = errors[0]
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        msg = f"参数校验失败 [{field}]: {err.get('msg', '格式不合法')}"
    else:
        msg = "请求参数校验失败"
    return JSONResponse(
        status_code=200,
        content={"code": 400, "message": msg, "data": None},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = exc.status_code if exc.status_code in [400, 500] else (400 if exc.status_code < 500 else 500)
    return JSONResponse(
        status_code=200,
        content={"code": code, "message": str(exc.detail), "data": None},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=200,
        content={"code": 500, "message": f"服务器内部异常: {str(exc)}", "data": None},
    )


# 挂载业务路由
app.include_router(orders_router)
app.include_router(master_router)


@app.get("/health", summary="中台健康探针")
@app.get("/api/health", summary="中台健康探针 (API 前缀)")
@app.get("/api/erp/health", summary="中台健康探针 (ERP 前缀)")
async def health_check():
    """
    健康探针接口：检查服务自身及 MongoDB (192.168.6.134:27017) 连通性
    遵循 docs/03_dev_guidelines_and_api_contracts.md 与 docs/05_mock_erp_design.md 规范统一响应结构
    """
    mongo_health = await db_manager.check_health()
    is_healthy = mongo_health.get("status") == "CONNECTED"
    current_time = datetime.now(timezone.utc).isoformat()

    code = 200 if is_healthy else 500
    message = "中台服务健康检查通过" if is_healthy else "中台数据库连接异常"

    return JSONResponse(
        status_code=200,
        content={
            "code": code,
            "message": message,
            "data": {
                "status": "UP" if is_healthy else "DEGRADED",
                "service": "mock_erp",
                "timestamp": current_time,
                "database": {
                    "mongodb": mongo_health.get("status"),
                    "host": mongo_health.get("host"),
                    "db_name": mongo_health.get("db_name"),
                },
            },
        },
    )


@app.get("/", summary="根路由")
async def root():
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "message": "TradeDoc AI Mock ERP Service is running",
            "data": {
                "app": "TradeDoc AI Mock ERP",
                "version": "0.1.0",
                "docs_url": "/docs",
            },
        },
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("mock_erp.main:app", host="0.0.0.0", port=port, reload=True)
