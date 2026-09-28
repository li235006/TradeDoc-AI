from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class ComplianceItemInput(BaseModel):
    item_seq: Optional[int] = Field(1, description="明细行序号")
    material_code: Optional[str] = Field(None, description="标准物料编码")
    material_name: Optional[str] = Field(None, description="物料名称")
    specification: Optional[str] = Field(None, description="规格型号")
    quantity: float = Field(0.0, ge=0, description="采购/销售数量")
    unit: Optional[str] = Field("吨", description="计量单位")
    unit_price: float = Field(..., ge=0, description="含税单价")
    total_amount: Optional[float] = Field(None, description="明细总金额")
    match_status: Optional[str] = Field("ALIGNED", description="字典匹配状态 (ALIGNED/PENDING_CONFIRM/UNMATCHED)")


class ComplianceVerifyRequest(BaseModel):
    contract_no: str = Field(..., description="关联合同编号")
    items: List[ComplianceItemInput] = Field(..., description="订单物资明细列表")
    total_amount: Optional[float] = Field(None, description="订单申报总金额")


class RuleHitItem(BaseModel):
    rule_code: str = Field(..., description="规则标识代码")
    rule_name: str = Field(..., description="风控规则名称")
    level: Literal["PASS", "WARNING", "BLOCKED"] = Field(..., description="规则命中风险等级")
    message: str = Field(..., description="规则评估说明")
    details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="规则上下文明细")


class ComplianceVerifyResult(BaseModel):
    level: Literal["PASS", "WARNING", "BLOCKED"] = Field(..., description="全局综合风控等级 (PASS绿/WARNING黄/BLOCKED红)")
    is_compliant: bool = Field(..., description="是否完全合规")
    over_amount: float = Field(0.0, description="超额差额数值 (未超额为 0.0)")
    deviation_rate: float = Field(0.0, description="物资单价最大偏离百分比 (如 20.0)")
    can_direct_submit: bool = Field(..., description="是否允许一键直接提单")
    can_special_submit: bool = Field(..., description="是否允许转入超额特批流程")
    rule_items: List[RuleHitItem] = Field(default_factory=list, description="命中风控规则清单")
    summary: str = Field(..., description="诊断摘要结论")
