import logging
from datetime import datetime, timezone
import uuid
from typing import Optional, Dict, Any, List
from pymongo import ReturnDocument
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.schemas.orders import (
        DraftCreateRequest,
        DraftUpdateRequest,
        DraftResponseData,
        OrderSubmitRequest,
        OrderSubmitResponseData,
        OrderItemDTO,
    )
    from app.schemas.compliance import ComplianceVerifyRequest, ComplianceItemInput
    from app.services.compliance import compliance_engine
    from app.core.exceptions import BusinessException
except ImportError:
    from backend.app.schemas.orders import (
        DraftCreateRequest,
        DraftUpdateRequest,
        DraftResponseData,
        OrderSubmitRequest,
        OrderSubmitResponseData,
        OrderItemDTO,
    )
    from backend.app.schemas.compliance import ComplianceVerifyRequest, ComplianceItemInput
    from backend.app.services.compliance import compliance_engine
    from backend.app.core.exceptions import BusinessException

logger = logging.getLogger("tradedoc.orders")


class OrderService:
    async def create_or_save_draft(
        self,
        data: DraftCreateRequest,
        db: AsyncIOMotorDatabase,
    ) -> DraftResponseData:
        """保存或新建草稿 (持久化至 db.drafts)"""
        now = datetime.now(timezone.utc).isoformat()
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        draft_id = data.draft_id or f"DFT-{date_str}-{uuid.uuid4().hex[:6].upper()}"

        # 补全合同主数据默认信息
        contract = await db.contracts.find_one({"contract_no": data.contract_no})
        counterparty_name = data.counterparty_name or (contract.get("counterparty_name") if contract else "签约单位")
        project_name = data.project_name or (contract.get("project_name") if contract else "工程项目")
        delivery_address = data.delivery_address or (contract.get("default_delivery_address") if contract else "工地物资中转站")

        # 计算明细金额与总额
        calculated_total = 0.0
        items_payload = []
        for seq, item in enumerate(data.items, 1):
            item.item_seq = seq
            item_total = round(item.quantity * item.unit_price, 2)
            item.total_amount = item_total
            calculated_total += item_total
            items_payload.append(item)
        calculated_total = round(calculated_total, 2)

        # 联动合规规则引擎实时诊断
        compliance_req = ComplianceVerifyRequest(
            contract_no=data.contract_no,
            items=[
                ComplianceItemInput(
                    item_seq=i.item_seq,
                    material_code=i.material_code,
                    material_name=i.material_name,
                    specification=i.specification,
                    quantity=i.quantity,
                    unit=i.unit,
                    unit_price=i.unit_price,
                    total_amount=i.total_amount,
                    match_status=i.match_status,
                )
                for i in items_payload
            ],
            total_amount=calculated_total,
        )
        compliance_res = await compliance_engine.verify(compliance_req, db)

        doc = {
            "draft_id": draft_id,
            "order_type": data.order_type,
            "contract_no": data.contract_no,
            "counterparty_name": counterparty_name,
            "project_name": project_name,
            "delivery_address": delivery_address,
            "contact_person": data.contact_person or "现场负责人",
            "business_name": data.business_name or "国内传统贸易",
            "procurement_mode": data.procurement_mode or "直发",
            "business_tag": data.business_tag or "传统贸易",
            "items": [i.model_dump() for i in items_payload],
            "total_amount": calculated_total,
            "is_over_quota": compliance_res.over_amount > 0,
            "special_approval_reason": data.special_approval_reason or "",
            "status": "DRAFT",
            "compliance": compliance_res.model_dump(),
            "operator_name": data.operator_name or "李强",
            "operator_dept": data.operator_dept or "物资贸易一部",
            "created_at": now,
            "updated_at": now,
        }

        await db.drafts.update_one({"draft_id": draft_id}, {"$set": doc}, upsert=True)

        return DraftResponseData(
            draft_id=draft_id,
            order_type=doc["order_type"],
            contract_no=doc["contract_no"],
            counterparty_name=doc["counterparty_name"],
            project_name=doc["project_name"],
            delivery_address=doc["delivery_address"],
            contact_person=doc["contact_person"],
            business_name=doc["business_name"],
            procurement_mode=doc["procurement_mode"],
            business_tag=doc["business_tag"],
            items=items_payload,
            total_amount=calculated_total,
            is_over_quota=doc["is_over_quota"],
            special_approval_reason=doc["special_approval_reason"],
            status="DRAFT",
            compliance=compliance_res,
            created_at=now,
            updated_at=now,
        )

    async def get_draft(
        self,
        draft_id: str,
        db: AsyncIOMotorDatabase,
    ) -> DraftResponseData:
        """获取指定草稿"""
        doc = await db.drafts.find_one({"draft_id": draft_id}, {"_id": 0})
        if not doc:
            raise BusinessException(message=f"未找到草稿 [{draft_id}]", code=400)

        # 实时根据最新数据重新校验风控
        items_objs = [OrderItemDTO(**i) for i in doc.get("items", [])]
        compliance_req = ComplianceVerifyRequest(
            contract_no=doc["contract_no"],
            items=[
                ComplianceItemInput(
                    item_seq=i.item_seq,
                    material_code=i.material_code,
                    material_name=i.material_name,
                    specification=i.specification,
                    quantity=i.quantity,
                    unit=i.unit,
                    unit_price=i.unit_price,
                    total_amount=i.total_amount,
                    match_status=i.match_status,
                )
                for i in items_objs
            ],
            total_amount=doc.get("total_amount", 0.0),
        )
        compliance_res = await compliance_engine.verify(compliance_req, db)

        return DraftResponseData(
            draft_id=doc["draft_id"],
            order_type=doc.get("order_type", "SALES"),
            contract_no=doc["contract_no"],
            counterparty_name=doc.get("counterparty_name", ""),
            project_name=doc.get("project_name", ""),
            delivery_address=doc.get("delivery_address", ""),
            contact_person=doc.get("contact_person", "现场负责人"),
            business_name=doc.get("business_name", "国内传统贸易"),
            procurement_mode=doc.get("procurement_mode", "直发"),
            business_tag=doc.get("business_tag", "传统贸易"),
            items=items_objs,
            total_amount=doc.get("total_amount", 0.0),
            is_over_quota=compliance_res.over_amount > 0,
            special_approval_reason=doc.get("special_approval_reason", ""),
            status=doc.get("status", "DRAFT"),
            compliance=compliance_res,
            created_at=doc.get("created_at", ""),
            updated_at=doc.get("updated_at", ""),
        )

    async def update_draft(
        self,
        draft_id: str,
        data: DraftUpdateRequest,
        db: AsyncIOMotorDatabase,
    ) -> DraftResponseData:
        """更新草稿字段，实时重算金额并联动合规规则引擎"""
        doc = await db.drafts.find_one({"draft_id": draft_id})
        if not doc:
            raise BusinessException(message=f"未找到草稿 [{draft_id}]", code=400)

        now = datetime.now(timezone.utc).isoformat()
        update_fields: Dict[str, Any] = {"updated_at": now}

        if data.contract_no is not None:
            update_fields["contract_no"] = data.contract_no
        if data.order_type is not None:
            update_fields["order_type"] = data.order_type
        if data.counterparty_name is not None:
            update_fields["counterparty_name"] = data.counterparty_name
        if data.project_name is not None:
            update_fields["project_name"] = data.project_name
        if data.delivery_address is not None:
            update_fields["delivery_address"] = data.delivery_address
        if data.contact_person is not None:
            update_fields["contact_person"] = data.contact_person
        if data.special_approval_reason is not None:
            update_fields["special_approval_reason"] = data.special_approval_reason
        if data.status is not None:
            update_fields["status"] = data.status

        # 重新核算明细与总额
        current_contract_no = update_fields.get("contract_no", doc.get("contract_no"))
        if data.items is not None:
            recomputed_items = []
            calculated_total = 0.0
            for seq, item in enumerate(data.items, 1):
                item.item_seq = seq
                item_total = round(item.quantity * item.unit_price, 2)
                item.total_amount = item_total
                calculated_total += item_total
                recomputed_items.append(item)
            calculated_total = round(calculated_total, 2)
            update_fields["items"] = [i.model_dump() for i in recomputed_items]
            update_fields["total_amount"] = calculated_total
        else:
            recomputed_items = [OrderItemDTO(**i) for i in doc.get("items", [])]
            calculated_total = doc.get("total_amount", 0.0)

        # 联动合规风控诊断
        compliance_req = ComplianceVerifyRequest(
            contract_no=current_contract_no,
            items=[
                ComplianceItemInput(
                    item_seq=i.item_seq,
                    material_code=i.material_code,
                    material_name=i.material_name,
                    specification=i.specification,
                    quantity=i.quantity,
                    unit=i.unit,
                    unit_price=i.unit_price,
                    total_amount=i.total_amount,
                    match_status=i.match_status,
                )
                for i in recomputed_items
            ],
            total_amount=calculated_total,
        )
        compliance_res = await compliance_engine.verify(compliance_req, db)
        update_fields["compliance"] = compliance_res.model_dump()
        update_fields["is_over_quota"] = compliance_res.over_amount > 0

        await db.drafts.update_one({"draft_id": draft_id}, {"$set": update_fields})
        updated_doc = await db.drafts.find_one({"draft_id": draft_id}, {"_id": 0})

        return DraftResponseData(
            draft_id=updated_doc["draft_id"],
            order_type=updated_doc.get("order_type", "SALES"),
            contract_no=updated_doc["contract_no"],
            counterparty_name=updated_doc.get("counterparty_name", ""),
            project_name=updated_doc.get("project_name", ""),
            delivery_address=updated_doc.get("delivery_address", ""),
            contact_person=updated_doc.get("contact_person", "现场负责人"),
            business_name=updated_doc.get("business_name", "国内传统贸易"),
            procurement_mode=updated_doc.get("procurement_mode", "直发"),
            business_tag=updated_doc.get("business_tag", "传统贸易"),
            items=recomputed_items,
            total_amount=calculated_total,
            is_over_quota=update_fields["is_over_quota"],
            special_approval_reason=updated_doc.get("special_approval_reason", ""),
            status=updated_doc.get("status", "DRAFT"),
            compliance=compliance_res,
            created_at=updated_doc.get("created_at", ""),
            updated_at=updated_doc.get("updated_at", ""),
        )

    async def submit_order(
        self,
        data: OrderSubmitRequest,
        db: AsyncIOMotorDatabase,
        idempotency_key: Optional[str] = None,
        is_special_submission: bool = False,
    ) -> OrderSubmitResponseData:
        """正式提单提交：严格合规验证，超额未填特批理由阻断，写入 db.orders 并回写草稿"""
        now = datetime.now(timezone.utc).isoformat()
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")

        # 1. 幂等性控制 (60秒内相同 Idempotency-Key 直接返回)
        if idempotency_key:
            existing = await db.orders.find_one({"idempotency_key": idempotency_key}, {"_id": 0})
            if existing:
                logger.info(f"Idempotent hit for order {existing['order_no']}")
                return OrderSubmitResponseData(
                    order_no=existing["order_no"],
                    order_status=existing["order_status"],
                    total_amount=existing["total_amount"],
                    is_over_quota=existing.get("is_over_quota", False),
                    special_approval_reason=existing.get("special_approval_reason"),
                    created_at=existing["created_at"],
                )

        # 2. 计算实际订单总金额
        items_payload = []
        calculated_total = 0.0
        for seq, item in enumerate(data.items, 1):
            item.item_seq = seq
            item_total = round(item.quantity * item.unit_price, 2)
            item.total_amount = item_total
            calculated_total += item_total
            items_payload.append(item)
        calculated_total = round(calculated_total, 2)

        # 3. 严格执行合规风控诊断
        compliance_req = ComplianceVerifyRequest(
            contract_no=data.contract_no,
            items=[
                ComplianceItemInput(
                    item_seq=i.item_seq,
                    material_code=i.material_code,
                    material_name=i.material_name,
                    specification=i.specification,
                    quantity=i.quantity,
                    unit=i.unit,
                    unit_price=i.unit_price,
                    total_amount=i.total_amount,
                    match_status=i.match_status,
                )
                for i in items_payload
            ],
            total_amount=calculated_total,
        )
        compliance_res = await compliance_engine.verify(compliance_req, db)

        # 4. 超额与阻断风控判定
        is_over_quota = False
        reason = (data.special_approval_reason or "").strip()

        if is_special_submission:
            if not reason or len(reason) < 10:
                raise BusinessException(
                    message="超额特批申请必须填写不少于10字的特批说明",
                    code=400,
                )
            if compliance_res.level == "BLOCKED" and compliance_res.over_amount <= 0:
                raise BusinessException(
                    message=f"订单合规严重拦截 (合同失效或物资未对齐不可特批): {compliance_res.summary}",
                    code=400,
                )
            is_over_quota = compliance_res.over_amount > 0
            order_status = "PENDING_SPECIAL_APPROVAL"
        else:
            if compliance_res.level == "BLOCKED":
                if compliance_res.over_amount > 0:
                    # 超额情况：必须填特批说明且 >= 10 字
                    if not reason or len(reason) < 10:
                        contract_doc = await db.contracts.find_one({"contract_no": data.contract_no})
                        rem = contract_doc.get("total_amount", 0.0) - contract_doc.get("accumulated_amount", 0.0) if contract_doc else 0.0
                        raise BusinessException(
                            message=(
                                f"合同可用额度不足 (本次申请 ¥{calculated_total:,.2f} > 剩余可用 ¥{rem:,.2f})，"
                                f"禁止直接生效，超额提单必须填写不少于10字特批理由"
                            ),
                            code=400,
                        )
                    is_over_quota = True
                    order_status = "PENDING_SPECIAL_APPROVAL"
                else:
                    # 合同到期或物料未对齐绝对阻断
                    raise BusinessException(message=f"订单合规拦截: {compliance_res.summary}", code=400)
            elif compliance_res.level == "WARNING":
                if not reason or len(reason) < 10:
                    raise BusinessException(
                        message=f"单据存在价格偏离等风控预警，直接生效受限，须填写不少于10字说明走审批流程: {compliance_res.summary}",
                        code=400,
                    )
                is_over_quota = False
                order_status = "PENDING_SPECIAL_APPROVAL"
            else:
                is_over_quota = False
                order_status = "ACTIVE"

        # 5. 原子流水号自增发号器 (XSDD-WZGS-YYYYMMDD-001)
        counter_id = f"order_seq_{date_str}"
        seq_doc = await db.counters.find_one_and_update(
            {"_id": counter_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        seq_num = seq_doc["seq"] if seq_doc else 1
        order_no = f"XSDD-WZGS-{date_str}-{seq_num:03d}"

        # 6. 正式订单额度扣减 (仅对 ACTIVE 订单扣减，待特批审批单待审批后扣减)
        if order_status == "ACTIVE":
            await db.contracts.update_one(
                {"contract_no": data.contract_no},
                {
                    "$inc": {
                        "accumulated_amount": calculated_total,
                        "accumulated_order_count": 1,
                        "accumulated_orders": 1,
                        "remaining_amount": -calculated_total,
                        "remaining_order_count": -1,
                        "remaining_orders": -1,
                    }
                },
            )

        # 7. 写入 orders 集合
        order_doc = {
            "order_no": order_no,
            "idempotency_key": idempotency_key,
            "draft_id": data.draft_id,
            "order_type": data.order_type,
            "contract_no": data.contract_no,
            "counterparty_name": data.counterparty_name or "签约单位",
            "project_name": data.project_name or "工程项目",
            "delivery_address": data.delivery_address or "工地送货地址",
            "contact_person": data.contact_person or "现场负责人",
            "business_name": data.business_name or "国内传统贸易",
            "procurement_mode": data.procurement_mode or "直发",
            "business_tag": data.business_tag or "传统贸易",
            "items": [i.model_dump() for i in items_payload],
            "total_amount": calculated_total,
            "is_over_quota": is_over_quota,
            "special_approval_reason": reason if is_over_quota else None,
            "order_status": order_status,
            "operator_name": data.operator_name or "李强",
            "operator_dept": data.operator_dept or "物资贸易一部",
            "approver_name": None,
            "approval_comment": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.orders.insert_one(order_doc)

        # 8. 回写草稿状态为 SUBMITTED
        if data.draft_id:
            await db.drafts.update_one(
                {"draft_id": data.draft_id},
                {"$set": {"status": "SUBMITTED", "order_no": order_no, "updated_at": now}},
            )

        logger.info(f"Order created successfully: {order_no}, status: {order_status}")
        return OrderSubmitResponseData(
            order_no=order_no,
            order_status=order_status,
            total_amount=calculated_total,
            is_over_quota=is_over_quota,
            special_approval_reason=reason if is_over_quota else None,
            created_at=now,
        )


order_service = OrderService()
