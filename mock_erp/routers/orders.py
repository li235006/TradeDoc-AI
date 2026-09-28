import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Query, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from mock_erp.db import get_db
from mock_erp.exceptions import BusinessException
from mock_erp.schemas.orders import (
    OrderWritebackDTO,
    ApprovalCallbackDTO,
    ApprovalCallbackRequest,
)

router = APIRouter(prefix="/api/erp/orders", tags=["Mock ERP 订单中心"])


def format_order_record(order: Dict[str, Any]) -> Dict[str, Any]:
    """格式化中台订单数据，对齐前端 order_status 与中台 erp_status 双重语义契约"""
    erp_status = order.get("erp_status", "")
    if "order_status" not in order:
        if erp_status in ["AUDITED", "COMPLETED", "ACTIVE", "CLOSED"]:
            order["order_status"] = "ACTIVE"
        elif erp_status in ["PENDING_APPROVAL", "PENDING_SPECIAL_APPROVAL"]:
            order["order_status"] = "PENDING_SPECIAL_APPROVAL"
        elif erp_status in ["RETURNED", "REJECTED"]:
            order["order_status"] = erp_status
        else:
            order["order_status"] = erp_status or "DRAFT"
    return order


async def get_next_order_seq(db: AsyncIOMotorDatabase) -> int:
    """利用 MongoDB erp_counters 集合原子自增派发单号序号，杜绝并发冲突"""
    doc = await db.erp_counters.find_one_and_update(
        {"name": "order_seq"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["value"]


@router.get("", summary="获取中台订单列表 (带条件与分页，即时反映审批状态与批注)")
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
        # 支持按 erp_status 或 order_status 语义查询
        if erp_status == "ACTIVE":
            query["$or"] = [{"erp_status": "AUDITED"}, {"erp_status": "COMPLETED"}, {"erp_status": "ACTIVE"}]
        elif erp_status == "PENDING_SPECIAL_APPROVAL":
            query["$or"] = [{"erp_status": "PENDING_APPROVAL"}, {"erp_status": "PENDING_SPECIAL_APPROVAL"}]
        else:
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
    formatted_items = [format_order_record(item) for item in items]

    return {
        "code": 200,
        "message": "获取订单列表成功",
        "data": {
            "items": formatted_items,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    }


@router.get("/{order_no}", summary="获取中台订单单笔详情 (即时反映最新审批批注)")
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
        "data": format_order_record(order),
    }


@router.post("/writeback", summary="提单回写中台接口 (TradeDoc -> ERP，具备幂等性)")
async def writeback_order(
    payload: OrderWritebackDTO,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    now_iso = now.isoformat()

    # 1. 幂等性校验：如果指定了 order_no 或已有相同 order_no，直接返回已有记录，不重复创建
    if payload.order_no:
        existing = await db.erp_orders.find_one({"order_no": payload.order_no}, {"_id": 0})
        if existing:
            return {
                "code": 200,
                "message": "中台订单已存在(幂等返回)",
                "data": {
                    "order_no": existing["order_no"],
                    "erp_status": existing.get("erp_status"),
                    "created_at": existing.get("created_at"),
                },
            }
        order_no = payload.order_no
    else:
        # 2. 原子自增派发单号序号，循环检测防止历史编号碰撞
        while True:
            seq = await get_next_order_seq(db)
            order_no = f"XSDD-YD-{date_str}-{seq:03d}"
            existing = await db.erp_orders.find_one({"order_no": order_no})
            if not existing:
                break

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
                    "accumulated_order_count": 1,
                    "remaining_order_count": -1,
                },
                "$set": {"updated_at": now_iso},
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


@router.post("/approval-callback", summary="统一审批回调接口 (TradeDoc -> ERP)")
async def approval_callback_endpoint(
    payload: ApprovalCallbackRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    审批回调端点：
    - action: APPROVE -> 更新订单状态为 COMPLETED，原子扣减合同额度 ($inc accumulated_amount)
    - action: PASS -> 更新订单状态为 AUDITED，原子扣减合同额度
    - action: REJECT -> 更新订单状态为 REJECTED，不扣减额度
    - action: RETURN -> 更新订单状态为 RETURNED，不扣减额度
    """
    order = await db.erp_orders.find_one({"order_no": payload.order_no})
    if not order:
        raise BusinessException(message=f"订单 {payload.order_no} 不存在", code=400)

    now_iso = datetime.now(timezone.utc).isoformat()
    raw_action = (payload.action or payload.decision or "APPROVE").upper()

    if raw_action == "APPROVE":
        target_status = "COMPLETED"
    elif raw_action == "PASS":
        target_status = "AUDITED"
    elif raw_action in ["RETURN", "RETURNED"]:
        target_status = "RETURNED"
    elif raw_action in ["REJECT", "REJECTED"]:
        target_status = "REJECTED"
    else:
        target_status = raw_action

    is_approve = target_status in ["COMPLETED", "AUDITED"]

    # 若通过且此前未扣减过配额，原子扣减合同配额
    if is_approve and order.get("erp_status") not in ["COMPLETED", "AUDITED"]:
        order_amount = round(float(order.get("total_amount", 0.0)), 2)
        await db.erp_contracts.update_one(
            {"contract_no": order["contract_no"]},
            {
                "$inc": {
                    "accumulated_amount": order_amount,
                    "remaining_amount": -order_amount,
                    "accumulated_orders": 1,
                    "remaining_orders": -1,
                    "accumulated_order_count": 1,
                    "remaining_order_count": -1,
                },
                "$set": {"updated_at": now_iso},
            },
        )

    # 原子更新订单状态与审批批注
    comment = payload.comment or payload.approval_comment
    approver_name = payload.approver_name or "审批人"

    await db.erp_orders.update_one(
        {"order_no": payload.order_no},
        {
            "$set": {
                "erp_status": target_status,
                "approver_name": approver_name,
                "approval_comment": comment,
                "updated_at": payload.approval_time or now_iso,
            }
        },
    )

    contract = await db.erp_contracts.find_one({"contract_no": order["contract_no"]})
    accumulated_amount = contract.get("accumulated_amount") if contract else None

    return {
        "code": 200,
        "message": f"审批回调处理成功({target_status})",
        "data": {
            "order_no": payload.order_no,
            "erp_status": target_status,
            "order_status": "ACTIVE" if target_status in ["AUDITED", "COMPLETED"] else target_status,
            "accumulated_contract_amount": accumulated_amount,
        },
    }


@router.post("/{order_no}/callback", summary="单号路径式审批裁决回调通知 (兼容历史版本)")
async def callback_approval_legacy(
    order_no: str,
    payload: ApprovalCallbackDTO,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    order = await db.erp_orders.find_one({"order_no": order_no})
    if not order:
        raise BusinessException(message=f"订单 {order_no} 不存在", code=400)

    now_iso = datetime.now(timezone.utc).isoformat()
    raw_decision = payload.decision.upper()
    if raw_decision == "APPROVE":
        target_status = "COMPLETED"
    elif raw_decision == "PASS":
        target_status = "AUDITED"
    elif raw_decision in ["RETURN", "RETURNED"]:
        target_status = "RETURNED"
    elif raw_decision in ["REJECT", "REJECTED"]:
        target_status = "REJECTED"
    else:
        target_status = raw_decision

    is_approve = target_status in ["AUDITED", "COMPLETED"]

    # 特批通过后正式占用扣减合同配额
    if is_approve and order.get("erp_status") not in ["AUDITED", "COMPLETED"]:
        order_amount = round(float(order.get("total_amount", 0.0)), 2)
        await db.erp_contracts.update_one(
            {"contract_no": order["contract_no"]},
            {
                "$inc": {
                    "accumulated_amount": order_amount,
                    "remaining_amount": -order_amount,
                    "accumulated_orders": 1,
                    "remaining_orders": -1,
                    "accumulated_order_count": 1,
                    "remaining_order_count": -1,
                },
                "$set": {"updated_at": now_iso},
            },
        )

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
            "order_status": "ACTIVE" if target_status in ["AUDITED", "COMPLETED"] else target_status,
            "accumulated_contract_amount": accumulated_amount,
        },
    }
