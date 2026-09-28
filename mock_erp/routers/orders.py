import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from mock_erp.db import get_db
from mock_erp.exceptions import BusinessException
from mock_erp.schemas.orders import OrderWritebackDTO, ApprovalCallbackDTO

router = APIRouter(prefix="/api/erp/orders", tags=["Mock ERP 订单中心"])


@router.get("", summary="获取中台订单列表 (带条件与分页)")
async def list_orders(
    page: int = Query(1, ge=1, description="当前页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    erp_status: Optional[str] = Query(None, description="订单审批状态过滤"),
    contract_no: Optional[str] = Query(None, description="关联合同编号过滤"),
    keyword: Optional[str] = Query(None, description="单号/往来单位/工程模糊搜索"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query = {}
    if erp_status:
        query["erp_status"] = erp_status
    if contract_no:
        query["contract_no"] = contract_no
    if keyword:
        regex = re.compile(re.escape(keyword), re.IGNORECASE)
        query["$or"] = [
            {"order_no": regex},
            {"counterparty_name": regex},
            {"project_name": regex},
        ]

    total = await db.erp_orders.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.erp_orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(length=page_size)

    return {
        "code": 200,
        "message": "获取订单列表成功",
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    }


@router.get("/{order_no}", summary="获取中台订单单笔详情")
async def get_order_detail(
    order_no: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    order = await db.erp_orders.find_one({"order_no": order_no}, {"_id": 0})
    if not order:
        raise BusinessException(message=f"订单 {order_no} 不存在", code=400)

    return {
        "code": 200,
        "message": "获取订单详情成功",
        "data": order,
    }


@router.post("/writeback", summary="提单回写中台接口 (TradeDoc -> ERP)")
async def writeback_order(
    payload: OrderWritebackDTO,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    now_iso = now.isoformat()

    # 派发中台订单编号: XSDD-YD-YYYYMMDD-XXX
    count_today = await db.erp_orders.count_documents({"order_no": {"$regex": f"^XSDD-YD-{date_str}"}})
    order_no = f"XSDD-YD-{date_str}-{count_today + 1:03d}"

    # 状态机流转判定：常规提单直接 AUDITED，超额特批申报 PENDING_APPROVAL
    if payload.is_special_approved:
        erp_status = "PENDING_APPROVAL"
        approver_name = None
        approval_comment = None
    else:
        erp_status = "AUDITED"
        approver_name = "系统自动核准"
        approval_comment = "额度核验合规，正常提单自动生效"

    order_doc = {
        "order_no": order_no,
        "source_draft_id": payload.source_draft_id,
        "order_type": payload.order_type,
        "contract_no": payload.contract_no,
        "counterparty_name": payload.counterparty_name,
        "project_name": payload.project_name,
        "delivery_address": payload.delivery_address,
        "contact_person": payload.contact_person,
        "items": [item.model_dump() for item in payload.items],
        "total_amount": round(payload.total_amount, 2),
        "erp_status": erp_status,
        "is_special_approved": payload.is_special_approved,
        "special_approval_reason": payload.special_approval_reason,
        "operator_name": payload.operator_name,
        "operator_dept": payload.operator_dept,
        "approver_name": approver_name,
        "approval_comment": approval_comment,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.erp_orders.insert_one(order_doc)

    # 若为常规直接生效提单，扣减合同可用额度与笔数
    if erp_status == "AUDITED":
        await db.erp_contracts.update_one(
            {"contract_no": payload.contract_no},
            {
                "$inc": {
                    "accumulated_amount": round(payload.total_amount, 2),
                    "remaining_amount": -round(payload.total_amount, 2),
                    "accumulated_orders": 1,
                    "remaining_orders": -1,
                }
            },
        )

    return {
        "code": 200,
        "message": "中台订单回写成功",
        "data": {
            "order_no": order_no,
            "erp_status": erp_status,
            "created_at": now_iso,
        },
    }


@router.post("/{order_no}/callback", summary="审批裁决回调通知 (TradeDoc -> ERP)")
async def callback_approval(
    order_no: str,
    payload: ApprovalCallbackDTO,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    order = await db.erp_orders.find_one({"order_no": order_no})
    if not order:
        raise BusinessException(message=f"订单 {order_no} 不存在", code=400)

    now_iso = datetime.now(timezone.utc).isoformat()
    decision_map = {
        "PASS": "AUDITED",
        "RETURN": "RETURNED",
        "REJECT": "REJECTED",
    }
    target_status = decision_map.get(payload.decision, "AUDITED")

    # 特批通过后正式占用扣减合同配额
    if target_status == "AUDITED" and order.get("erp_status") != "AUDITED":
        await db.erp_contracts.update_one(
            {"contract_no": order["contract_no"]},
            {
                "$inc": {
                    "accumulated_amount": round(order["total_amount"], 2),
                    "remaining_amount": -round(order["total_amount"], 2),
                    "accumulated_orders": 1,
                    "remaining_orders": -1,
                }
            },
        )

    # 更新中台订单状态
    await db.erp_orders.update_one(
        {"order_no": order_no},
        {
            "$set": {
                "erp_status": target_status,
                "approver_name": payload.approver_name,
                "approval_comment": payload.approval_comment,
                "updated_at": payload.approval_time or now_iso,
            }
        },
    )

    contract = await db.erp_contracts.find_one({"contract_no": order["contract_no"]})
    accumulated_amount = contract.get("accumulated_amount") if contract else None

    return {
        "code": 200,
        "message": "审批回调处理成功，中台订单状态已更新",
        "data": {
            "order_no": order_no,
            "erp_status": target_status,
            "accumulated_contract_amount": accumulated_amount,
        },
    }
