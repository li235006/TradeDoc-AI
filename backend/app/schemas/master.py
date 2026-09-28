from typing import List, Optional
from pydantic import BaseModel, Field


class ContractSchema(BaseModel):
    contract_no: str = Field(..., description="合同编号")
    contract_type: str = Field("SALES", description="合同类型 (SALES/PURCHASE)")
    counterparty_name: str = Field(..., description="往来签约单位全称")
    project_name: str = Field(..., description="归属工程项目名称")
    total_amount: float = Field(..., description="合同约定总金额")
    accumulated_amount: float = Field(0.0, description="历史累计已用金额")
    remaining_amount: Optional[float] = Field(None, description="剩余可用额度")
    max_order_count: int = Field(0, description="最大允许订单数")
    accumulated_order_count: int = Field(0, description="历史已下订单数")
    remaining_order_count: Optional[int] = Field(None, description="剩余可用笔数")
    default_delivery_address: Optional[str] = Field(None, description="默认工地收货地址")
    status: str = Field("ACTIVE", description="合同状态 (ACTIVE/EXPIRED/TERMINATED)")
    valid_until: Optional[str] = Field(None, description="合同有效截至日期")


class MaterialSchema(BaseModel):
    material_code: str = Field(..., description="标准物料编码")
    material_name: str = Field(..., description="规范物资名称")
    specification: str = Field(..., description="规格型号")
    category: Optional[str] = Field(None, description="物资类别")
    unit: str = Field(..., description="计量单位")
    standard_price: float = Field(..., description="指导基准单价")
    aliases: List[str] = Field(default_factory=list, description="现场行业俗称/黑话列表")
