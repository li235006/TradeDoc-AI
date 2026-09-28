import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.db import get_mongo_db
    from app.core.exceptions import BusinessException
    from app.schemas.orders import (
        DraftCreateRequest,
        DraftUpdateRequest,
        OrderSubmitRequest,
        OrderApprovalRequest,
    )
    from app.services.order_service import order_service
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.core.exceptions import BusinessException
    from backend.app.schemas.orders import (
        DraftCreateRequest,
        DraftUpdateRequest,
        OrderSubmitRequest,
        OrderApprovalRequest,
    )
    from backend.app.services.order_service import order_service

logger = logging.getLogger("tradedoc.orders.router")
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


@router.post("/draft", summary="保存/新建提单草稿")
async def create_or_save_draft(
    req: DraftCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    保存或新建草稿：
    录入或修改物资明细，计算总金额并持久化至 db.drafts，联动风控诊断
    """
    result = await order_service.create_or_save_draft(req, db)
    return make_response(code=200, message="草稿保存成功", data=result.model_dump())


@router.get("/draft/{draft_id}", summary="获取指定草稿详情")
async def get_draft_detail(
    draft_id: str,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """获取指定草稿并返回实时计算的合规风控诊断"""
    result = await order_service.get_draft(draft_id, db)
    return make_response(code=200, message="获取草稿详情成功", data=result.model_dump())


@router.put("/draft/{draft_id}", summary="修改草稿字段并实时重算")
async def update_draft(
    draft_id: str,
    req: DraftUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """修改草稿字段（物料、数量、单价、送货地址等），实时重算总额并联动 compliance 规则引擎验证"""
    result = await order_service.update_draft(draft_id, req, db)
    return make_response(code=200, message="草稿更新成功", data=result.model_dump())


@router.post("/submit", summary="正式提单提交")
async def submit_order(
    req: OrderSubmitRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-04 正式提单提交：
    验证合规状态，超额未填特批理由严格阻断；强制 Idempotency-Key；通过后写入 db.orders 并标记草稿为 SUBMITTED
    """
    if not idempotency_key or not idempotency_key.strip():
        raise BusinessException(message="缺少必需的请求头 Idempotency-Key", code=400)
    result = await order_service.submit_order(req, db, idempotency_key=idempotency_key, is_special_submission=False)
    msg = "提单成功，订单已生效" if result.order_status == "ACTIVE" else "超额特批申请已提交，等待业务审批人审核"
    return make_response(code=200, message=msg, data=result.model_dump())


@router.post("/submit-special", summary="超额特批单提交")
async def submit_special_order(
    req: OrderSubmitRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-05 超额特批申请提交：
    强制校验不少于10字特批说明，强制 Idempotency-Key，写入待特批订单
    """
    if not idempotency_key or not idempotency_key.strip():
        raise BusinessException(message="缺少必需的请求头 Idempotency-Key", code=400)
    result = await order_service.submit_order(req, db, idempotency_key=idempotency_key, is_special_submission=True)
    return make_response(code=200, message="超额特批申请已提交，等待业务审批人审核", data=result.model_dump())


@router.post("/{order_no}/approve", summary="EP-06 订单审批流转裁决")
async def approve_order(
    order_no: str,
    req: OrderApprovalRequest,
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-06 订单审批流转裁决：
    - 接收 action ('APPROVE'|'REJECT') 或 decision ('PASS'|'RETURN'|'REJECT')
    - 从请求头 X-User-Name、X-User-Dept、X-User-Role 获取审批人身份
    - 审批通过后调用 Mock ERP 回写与审批回调
    """
    result = await order_service.approve_order(
        order_no=order_no,
        req=req,
        db=db,
        header_name=x_user_name,
        header_dept=x_user_dept,
        header_role=x_user_role,
    )
    return make_response(code=200, message="订单审批流转成功", data=result.model_dump())


@router.get("", summary="获取商贸订单台账列表")
@router.get("/list", summary="获取商贸订单台账列表 (别名)")
async def list_orders(
    contract_no: Optional[str] = Query(None, description="关联合同编号"),
    order_status: Optional[str] = Query(None, description="订单状态筛选"),
    keyword: Optional[str] = Query(None, description="关键词 (订单号/往来单位/工程名)"),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """EP-07 商贸订单台账列表查询"""
    query: Dict[str, Any] = {}
    if contract_no:
        query["contract_no"] = contract_no
    if order_status:
        query["order_status"] = order_status
    if keyword:
        regex = {"$regex": keyword, "$options": "i"}
        query["$or"] = [
            {"order_no": regex},
            {"counterparty_name": regex},
            {"project_name": regex},
        ]

    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    orders = await cursor.to_list(length=limit)
    total = await db.orders.count_documents(query)

    return make_response(
        code=200,
        message="查询订单列表成功",
        data={"total": total, "list": orders},
    )
