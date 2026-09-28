import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.db import get_mongo_db
    from app.schemas.compliance import (
        ComplianceVerifyRequest,
        ComplianceVerifyResult,
    )
    from app.services.compliance import compliance_engine
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.schemas.compliance import (
        ComplianceVerifyRequest,
        ComplianceVerifyResult,
    )
    from backend.app.services.compliance import compliance_engine

logger = logging.getLogger("tradedoc.compliance.router")
router = APIRouter()


@router.post("/verify", summary="单据合规性确定性核验")
async def verify_compliance(
    request: ComplianceVerifyRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    单据合规校验端点：
    落地合同效期阻断、合同金额超限阻断/预警、物料指导价偏离度判定、物料字典匹配率 4 大硬规则
    返回三态风控诊断级别 (PASS/WARNING/BLOCKED)、超额值、偏离度与命中规则项
    """
    result: ComplianceVerifyResult = await compliance_engine.verify(request, db)
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "message": "合规诊断完成",
            "data": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
