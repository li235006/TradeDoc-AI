import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

try:
    from app.config import settings
    from app.core.exceptions import BusinessException
    from app.db import db_manager
    from app.db.seed import seed_master_data
    from app.routers.master import router as master_router
    from app.routers.compliance import router as compliance_router
    from app.routers.parse import router as parse_router
    from app.routers.orders import router as orders_router
    from app.routers.contracts import router as contracts_router
    from app.services.semantic import semantic_service
    from app.middleware.auth import AuthHeaderMiddleware
except ImportError:
    from backend.app.config import settings
    from backend.app.core.exceptions import BusinessException
    from backend.app.db import db_manager
    from backend.app.db.seed import seed_master_data
    from backend.app.routers.master import router as master_router
    from backend.app.routers.compliance import router as compliance_router
    from backend.app.routers.parse import router as parse_router
    from backend.app.routers.orders import router as orders_router
    from backend.app.routers.contracts import router as contracts_router
    from backend.app.services.semantic import semantic_service
    from backend.app.middleware.auth import AuthHeaderMiddleware

# 配置全局日志
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("tradedoc.main")


def api_response(code: int, message: str, data: Any = None) -> JSONResponse:
    """标准三值统一响应封装 (code, message, data, timestamp)"""
    return JSONResponse(
        status_code=200,
        content={
            "code": code,
            "message": message,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：自动探测与初始化 MongoDB (27017) 与 Milvus (19530) 连接池，并执行自愈种子注入"""
    logger.info("Initializing TradeDoc AI backend infrastructure connections...")

    # 1. 探测并连接 192.168.6.134:27017 MongoDB 并注入主数据
    try:
        await db_manager.connect_mongo()
        if db_manager.mongo_db is not None:
            await seed_master_data(db_manager.mongo_db)
            # AC-08: 在 lifespan 启动阶段建立必要索引
            try:
                await db_manager.mongo_db.orders.create_index("order_no", unique=True)
                await db_manager.mongo_db.orders.create_index([("contract_no", 1), ("order_status", 1)])
                await db_manager.mongo_db.drafts.create_index("draft_id", unique=True)
                await db_manager.mongo_db.drafts.create_index("operator_name")
                await db_manager.mongo_db.counters.create_index("name", unique=True, sparse=True)
                logger.info("Successfully established core collection indexes on MongoDB.")
            except Exception as ie:
                logger.warning(f"Index creation warning: {ie}")
    except Exception as e:
        logger.error(f"Failed to connect MongoDB or seed master data at {settings.MONGO_URI}: {e}")

    # 2. 探测并连接 192.168.6.134:19530 Milvus 并同步向量索引
    try:
        db_manager.connect_milvus()
        if db_manager.mongo_db is not None and db_manager.milvus_client is not None:
            await semantic_service.sync_materials_to_milvus(db_manager.mongo_db, db_manager.milvus_client)
    except Exception as e:
        logger.error(f"Failed to connect Milvus or sync vectors at {settings.milvus_uri}: {e}")

    yield

    # 优雅关闭连接池
    logger.info("Closing TradeDoc AI backend infrastructure connections...")
    await db_manager.close_mongo()
    db_manager.close_milvus()


app = FastAPI(
    title="TradeDoc AI Backend",
    description="TradeDoc AI 智能商贸单据与合同风控核心服务",
    version="0.1.0",
    lifespan=lifespan,
)

# 配置 CORS 跨域中间件与请求头鉴权中间件
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthHeaderMiddleware)


# 全局异常捕获处理 (统一三值协议: code 200/400/500, HTTP 状态码统一为 200)
@app.exception_handler(BusinessException)
async def business_exception_handler(request: Request, exc: BusinessException):
    return api_response(code=exc.code, message=exc.message, data=exc.data)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        err = errors[0]
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        msg = f"参数校验失败 [{field}]: {err.get('msg', '格式不合法')}"
    else:
        msg = "请求参数校验失败"
    return api_response(code=400, message=msg, data=None)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = exc.status_code if exc.status_code in [400, 500] else (400 if exc.status_code < 500 else 500)
    return api_response(code=code, message=str(exc.detail), data=None)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url.path}: {exc}")
    return api_response(code=500, message=f"服务器内部异常: {str(exc)}", data=None)


# 注册主数据路由与合规风控路由
app.include_router(master_router, prefix="/api/v1/master", tags=["MasterData"])
app.include_router(master_router, prefix="/api/master", tags=["MasterData"])
app.include_router(compliance_router, prefix="/api/v1/compliance", tags=["Compliance"])
app.include_router(compliance_router, prefix="/api/compliance", tags=["Compliance"])
app.include_router(parse_router, prefix="/api/v1/parse", tags=["Parse"])
app.include_router(parse_router, prefix="/api/parse", tags=["Parse"])
app.include_router(orders_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(orders_router, prefix="/api/orders", tags=["Orders"])
app.include_router(contracts_router, prefix="/api/v1/contracts", tags=["Contracts"])
app.include_router(contracts_router, prefix="/api/contracts", tags=["Contracts"])


@app.get("/health", summary="系统健康探针")
@app.get("/api/health", summary="系统健康探针 (API 前缀)")
async def health_check():
    """探针接口：检查服务自身及 MongoDB(27017)、Milvus(19530) 双数据库连通性"""
    health_info = await db_manager.check_all_health()
    is_healthy = health_info.get("overall_status") == "UP"

    code = 200 if is_healthy else 500
    message = "服务健康检查通过" if is_healthy else "基础设施连接异常"

    return api_response(
        code=code,
        message=message,
        data={
            "status": health_info.get("overall_status"),
            "mongodb": health_info.get("mongodb", {}).get("status"),
            "milvus": health_info.get("milvus", {}).get("status"),
            "details": health_info,
        },
    )


@app.get("/", summary="根路由")
async def root():
    return api_response(
        code=200,
        message="TradeDoc AI Backend Service is running",
        data={
            "app": "TradeDoc AI Backend",
            "version": "0.1.0",
            "docs_url": "/docs",
        },
    )
