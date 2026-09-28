from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class OrderItemDTO(BaseModel):
    item_seq: int = Field(default=1, description="明细行号")
    material_code: str = Field(..., description="标准物料编码")
    material_name: str = Field(..., description="规范物资名称")
    specification: str = Field(..., description="规格型号")
    quantity: float = Field(..., gt=0, description="采购数量")
    unit: str = Field(..., description="计量单位")
    unit_price: float = Field(..., ge=0, description="单价(元)")
    total_amount: float = Field(..., ge=0, description="行总金额(元)")


class OrderWritebackDTO(BaseModel):
    order_no: Optional[str] = Field(default=None, description="指定订单号(用于幂等重试与唯一标识)")
    source_draft_id: Optional[str] = Field(default=None, description="TradeDoc AI 草稿流水号")
    order_type: str = Field(default="SALES", description="单据类型: SALES(销售订单) / PURCHASE(采购订单)")
    contract_no: str = Field(..., description="关联主合同编号")
    counterparty_name: str = Field(..., description="往来签约单位名称")
    project_name: str = Field(..., description="履约工程项目名称")
    delivery_address: str = Field(..., description="物资送达收货地址")
    contact_person: str = Field(..., description="现场收货联系人与电话")
    items: List[OrderItemDTO] = Field(..., min_length=1, description="订单物资明细列表")
    total_amount: float = Field(..., ge=0, description="订单核算总金额(元)")
    is_special_approved: bool = Field(default=False, description="是否申请特批申报")
    special_approval_reason: Optional[str] = Field(default=None, description="超额/溢价特批申报理由")
    operator_name: str = Field(default="李强", description="经办提单人姓名")
    operator_dept: str = Field(default="物资贸易一部", description="经办部门")


class ApprovalCallbackRequest(BaseModel):
    order_no: str = Field(..., description="被审批的订单号")
    action: Optional[str] = Field(default=None, description="审批动作: APPROVE/REJECT/RETURN/PASS")
    decision: Optional[str] = Field(default=None, description="裁决决策: PASS/RETURN/REJECT")
    approver_name: str = Field(default="审批人", description="审批人姓名")
    approver_dept: Optional[str] = Field(default="商贸风控审批部", description="审批人部门")
    comment: Optional[str] = Field(default=None, description="审批意见/理由")
    approval_comment: Optional[str] = Field(default=None, description="审批意见别名")
    approval_time: Optional[str] = Field(default=None, description="审批时间 ISO8601")


class ApprovalCallbackDTO(BaseModel):
    decision: Literal["PASS", "RETURN", "REJECT", "APPROVE"] = Field(..., description="裁决结果: PASS(通过) / RETURN(退回) / REJECT(驳回)")
    approver_name: str = Field(..., description="审批人姓名")
    approval_comment: Optional[str] = Field(default=None, description="审批意见")
    approval_time: Optional[str] = Field(default=None, description="审批时间 ISO8601")


class ContractQuotaOut(BaseModel):
    contract_no: str
    total_amount: float
    accumulated_amount: float
    remaining_amount: float
    utilization_rate: float
    is_over_quota: bool


class OrderOut(BaseModel):
    order_no: str
    source_draft_id: Optional[str] = None
    order_type: str
    contract_no: str
    counterparty_name: str
    project_name: str
    delivery_address: str
    contact_person: str
    items: List[OrderItemDTO]
    total_amount: float
    erp_status: str
    order_status: Optional[str] = None
    is_special_approved: bool
    special_approval_reason: Optional[str] = None
    operator_name: str
    operator_dept: str
    approver_name: Optional[str] = None
    approval_comment: Optional[str] = None
    created_at: str
    updated_at: str
