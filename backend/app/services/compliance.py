import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.schemas.compliance import (
        ComplianceVerifyRequest,
        ComplianceVerifyResult,
        RuleHitItem,
    )
except ImportError:
    from backend.app.schemas.compliance import (
        ComplianceVerifyRequest,
        ComplianceVerifyResult,
        RuleHitItem,
    )

logger = logging.getLogger("tradedoc.compliance")


class ComplianceEngine:
    """确定性合规风控规则引擎 (4 大核心硬规则)"""

    PRICE_DEVIATION_WARN_THRESHOLD = 0.15  # 价格偏离度预警阈值 15%

    async def verify(
        self,
        request: ComplianceVerifyRequest,
        db: AsyncIOMotorDatabase,
    ) -> ComplianceVerifyResult:
        rule_hits: List[RuleHitItem] = []
        fatal_blocked = False  # 绝对不可特批阻断标志 (合同过期/物资未匹配)
        quota_blocked = False  # 额度超限阻断标志 (可转特批)
        over_amount = 0.0
        max_deviation_rate = 0.0

        # 计算并校验明细总金额
        calculated_total = 0.0
        for item in request.items:
            item_total = round(item.quantity * item.unit_price, 2)
            calculated_total += item_total
            if item.total_amount is None:
                item.total_amount = item_total
        calculated_total = round(calculated_total, 2)

        # ----------------------------------------------------
        # 规则 1: 物资字典匹配率判定 (RULE_MATERIAL_UNMATCHED)
        # ----------------------------------------------------
        for item in request.items:
            # 状态标记未匹配或无编码
            if item.match_status == "UNMATCHED" or not item.material_code:
                rule_hits.append(
                    RuleHitItem(
                        rule_code="RULE_MATERIAL_UNMATCHED",
                        rule_name="物资字典匹配阻断",
                        level="BLOCKED",
                        message=f"物资明细第 {item.item_seq} 行[{item.material_name or '未知物料'}]未对齐标准物料编码",
                        details={"item_seq": item.item_seq, "material_name": item.material_name},
                    )
                )
                fatal_blocked = True
                continue

            if item.quantity <= 0:
                rule_hits.append(
                    RuleHitItem(
                        rule_code="RULE_QUANTITY_INVALID",
                        rule_name="数量有效性核验",
                        level="WARNING",
                        message=f"物资明细第 {item.item_seq} 行[{item.material_name or '待确认'}]数量未填或为0，需人工核对补充",
                        details={"item_seq": item.item_seq, "quantity": item.quantity},
                    )
                )

            # 数据库核验物料编码真实存在
            material_doc = await db.materials.find_one({"material_code": item.material_code})
            if not material_doc:
                rule_hits.append(
                    RuleHitItem(
                        rule_code="RULE_MATERIAL_UNMATCHED",
                        rule_name="物资字典匹配阻断",
                        level="BLOCKED",
                        message=f"物资编码 [{item.material_code}] 不存在于标准主数据字典中",
                        details={"item_seq": item.item_seq, "material_code": item.material_code},
                    )
                )
                fatal_blocked = True
            else:
                # ----------------------------------------------------
                # 规则 2: 物料指导价偏离度判定 (RULE_PRICE_DEVIATION)
                # ----------------------------------------------------
                std_price = material_doc.get("standard_price", 0.0)
                if std_price > 0:
                    deviation = (item.unit_price - std_price) / std_price
                    if abs(deviation) > self.PRICE_DEVIATION_WARN_THRESHOLD:
                        dev_percent = round(deviation * 100, 1)
                        if abs(dev_percent) > max_deviation_rate:
                            max_deviation_rate = abs(dev_percent)

                        rule_name = "物资单价高价预警" if deviation > 0 else "物资单价低价预警"
                        direction = "高于" if deviation > 0 else "低于"
                        rule_hits.append(
                            RuleHitItem(
                                rule_code="RULE_PRICE_DEVIATION",
                                rule_name=rule_name,
                                level="WARNING",
                                message=(
                                    f"物资[{material_doc.get('material_name')}]单价 (¥{item.unit_price:,.2f}) "
                                    f"{direction}指导价 (¥{std_price:,.2f})，偏离度 {dev_percent:+}%，超出 ±15% 预警阈值"
                                ),
                                details={
                                    "material_code": item.material_code,
                                    "unit_price": item.unit_price,
                                    "standard_price": std_price,
                                    "deviation_rate": dev_percent,
                                },
                            )
                        )

        # ----------------------------------------------------
        # 规则 3: 合同效期与状态阻断 (RULE_CONTRACT_EXPIRED)
        # ----------------------------------------------------
        contract_doc = await db.contracts.find_one({"contract_no": request.contract_no})
        if not contract_doc:
            rule_hits.append(
                RuleHitItem(
                    rule_code="RULE_CONTRACT_NOT_FOUND",
                    rule_name="合同有效性阻断",
                    level="BLOCKED",
                    message=f"未找到关联合同 [{request.contract_no}]",
                    details={"contract_no": request.contract_no},
                )
            )
            fatal_blocked = True
        else:
            status = contract_doc.get("status", "ACTIVE")
            if status != "ACTIVE":
                rule_hits.append(
                    RuleHitItem(
                        rule_code="RULE_CONTRACT_EXPIRED",
                        rule_name="合同效期阻断",
                        level="BLOCKED",
                        message=f"合同 [{request.contract_no}] 处于非有效履约状态 ({status})，严禁提单",
                        details={"contract_no": request.contract_no, "status": status},
                    )
                )
                fatal_blocked = True

            # 校验截至有效日期
            valid_until = contract_doc.get("valid_until")
            if valid_until:
                try:
                    exp_date = datetime.strptime(valid_until, "%Y-%m-%d").date()
                    if exp_date < date.today():
                        rule_hits.append(
                            RuleHitItem(
                                rule_code="RULE_CONTRACT_EXPIRED",
                                rule_name="合同效期阻断",
                                level="BLOCKED",
                                message=f"合同 [{request.contract_no}] 已于 {valid_until} 届满失效，禁止提单",
                                details={"contract_no": request.contract_no, "valid_until": valid_until},
                            )
                        )
                        fatal_blocked = True
                except Exception:
                    pass

            # ----------------------------------------------------
            # 规则 4: 合同金额超限阻断 / 预警 (RULE_CONTRACT_OVER_QUOTA)
            # ----------------------------------------------------
            total_limit = contract_doc.get("total_amount", 0.0)
            accum_amount = contract_doc.get("accumulated_amount", 0.0)
            remaining_amount = round(total_limit - accum_amount, 2)
            
            max_orders = contract_doc.get("max_order_count", 9999)
            accum_orders = contract_doc.get("accumulated_order_count", 0)
            remaining_orders = max(0, max_orders - accum_orders)

            if calculated_total > remaining_amount or remaining_orders < 1:
                over_amount = round(max(0.0, calculated_total - remaining_amount), 2)
                quota_blocked = True
                rule_hits.append(
                    RuleHitItem(
                        rule_code="RULE_CONTRACT_OVER_QUOTA",
                        rule_name="合同金额超限阻断",
                        level="BLOCKED",
                        message=(
                            f"订单金额超限：本次提单金额 ¥{calculated_total:,.2f}，"
                            f"合同剩余可用额度 ¥{remaining_amount:,.2f}，超出差额 ¥{over_amount:,.2f}"
                        ),
                        details={
                            "contract_no": request.contract_no,
                            "order_amount": calculated_total,
                            "remaining_amount": remaining_amount,
                            "over_amount": over_amount,
                            "remaining_orders": remaining_orders,
                        },
                    )
                )

        # ----------------------------------------------------
        # 综合判定等级与流转决策
        # ----------------------------------------------------
        has_blocked = fatal_blocked or quota_blocked
        has_warning = any(r.level == "WARNING" for r in rule_hits)

        if has_blocked:
            overall_level = "BLOCKED"
            can_direct_submit = False
            # 仅在非致命阻断（如仅仅因为金额超额）时允许转入特批申请
            can_special_submit = (not fatal_blocked) and quota_blocked
            summary = "单据存在合规阻断项，无法直接提单生效" if fatal_blocked else "单据金额超出合同可用额度，需走超额特批流程"
        elif has_warning:
            overall_level = "WARNING"
            can_direct_submit = False
            can_special_submit = True
            summary = "单据存在风控预警项，允许经办人复核或走特批流转"
        else:
            overall_level = "PASS"
            can_direct_submit = True
            can_special_submit = False
            summary = "合规风控校验全部通过，额度充足，允许一键提单"

        return ComplianceVerifyResult(
            level=overall_level,
            is_compliant=(overall_level == "PASS"),
            over_amount=over_amount,
            deviation_rate=max_deviation_rate,
            can_direct_submit=can_direct_submit,
            can_special_submit=can_special_submit,
            rule_items=rule_hits,
            summary=summary,
        )


compliance_engine = ComplianceEngine()
