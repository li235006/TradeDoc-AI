import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

try:
    from app.db import get_mongo_db
    from app.core.exceptions import BusinessException
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.core.exceptions import BusinessException

logger = logging.getLogger("tradedoc.contracts")
router = APIRouter()


def make_response(code: int, message: str, data: Any = None) -> JSONResponse:
    """标准三值统一响应"""
    return JSONResponse(
        status_code=200,
        content={
            "code": code,
            "message": message,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


class ContractQuota(BaseModel):
    contract_no: str = Field(..., description="合同编号")
    contract_type: str = Field("SALES", description="合同类型")
    counterparty_name: str = Field(..., description="签约往来单位")
    project_name: str = Field(..., description="工程项目名称")
    default_delivery_address: Optional[str] = Field("", description="默认送货地址")
    total_amount: float = Field(..., description="合同总限额")
    accumulated_amount: float = Field(..., description="已用累计金额")
    remaining_amount: float = Field(..., description="剩余可用金额")
    contract_total_amount: float = Field(..., description="合同总限额 (别名)")
    accumulated_order_amount: float = Field(..., description="已用累计金额 (别名)")
    accumulated_order_count: int = Field(..., description="已用提单笔数")
    remaining_quota_amount: float = Field(..., description="剩余可用金额 (别名)")
    remaining_order_count: int = Field(..., description="剩余可用笔数")
    max_order_count: int = Field(..., description="最大允许笔数")
    is_over_quota: bool = Field(..., description="是否已超额")
    over_amount: float = Field(0.0, description="超额金额")


@router.get("/{contract_no}/quota", summary="EP-08 查询合同履约配额")
async def get_contract_quota(
    contract_no: str,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-08: 合同配额看板查询
    查询指定合同的主数据与 4 项实时履约额度指标
    """
    contract = await db.contracts.find_one({"contract_no": contract_no})
    if not contract:
        raise BusinessException(message=f"合同编号 {contract_no} 不存在或已失效", code=400)

    total_amount = float(contract.get("total_amount", 0.0))
    accumulated_amount = float(contract.get("accumulated_amount", 0.0))
    remaining_amount = round(total_amount - accumulated_amount, 2)

    max_order_count = int(contract.get("max_order_count", contract.get("max_orders", 20)))
    accumulated_order_count = int(contract.get("accumulated_order_count", contract.get("accumulated_orders", 0)))
    remaining_order_count = max(0, max_order_count - accumulated_order_count)

    is_over = remaining_amount <= 0 or remaining_order_count <= 0
    over_amount = round(abs(remaining_amount), 2) if remaining_amount < 0 else 0.0

    data = ContractQuota(
        contract_no=contract["contract_no"],
        contract_type=contract.get("contract_type", "SALES"),
        counterparty_name=contract.get("counterparty_name", ""),
        project_name=contract.get("project_name", ""),
        default_delivery_address=contract.get("default_delivery_address", ""),
        total_amount=total_amount,
        accumulated_amount=accumulated_amount,
        remaining_amount=remaining_amount,
        contract_total_amount=total_amount,
        accumulated_order_amount=accumulated_amount,
        accumulated_order_count=accumulated_order_count,
        remaining_quota_amount=remaining_amount,
        remaining_order_count=remaining_order_count,
        max_order_count=max_order_count,
        is_over_quota=is_over,
        over_amount=over_amount,
    )

    return make_response(code=200, message="获取合同配额成功", data=data.model_dump())
