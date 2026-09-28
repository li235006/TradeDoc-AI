from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

try:
    from app.schemas.compliance import ComplianceVerifyResult
except ImportError:
    from backend.app.schemas.compliance import ComplianceVerifyResult


class OrderItemDTO(BaseModel):
    item_seq: int = Field(1, description="明细行号")
    material_code: str = Field(..., description="标准物料编码")
    material_name: str = Field(..., description="规范物资名称")
    specification: Optional[str] = Field("", description="规格型号")
    quantity: float = Field(..., gt=0, description="采购/销售数量")
    unit: str = Field("吨", description="计量单位")
    unit_price: float = Field(..., ge=0, description="含税单价")
    total_amount: Optional[float] = Field(None, description="明细总金额")
    match_status: Optional[str] = Field("ALIGNED", description="匹配状态 (ALIGNED/PENDING_CONFIRM/UNMATCHED)")
    raw_material: Optional[str] = Field(None, description="原始品名")


class DraftCreateRequest(BaseModel):
    draft_id: Optional[str] = Field(None, description="草稿ID (可选，默认系统派发)")
    contract_no: str = Field(..., description="关联合同编号")
    order_type: str = Field("SALES", description="单据类型 (SALES/PURCHASE)")
    counterparty_name: Optional[str] = Field(None, description="往来签约单位全称")
    project_name: Optional[str] = Field(None, description="工程项目名称")
    delivery_address: Optional[str] = Field(None, description="工地送货地址")
    contact_person: Optional[str] = Field("现场负责人", description="现场联系人")
    business_name: Optional[str] = Field("国内传统贸易", description="业务名称")
    procurement_mode: Optional[str] = Field("直发", description="采购模式")
    business_tag: Optional[str] = Field("传统贸易", description="业务标签")
    items: List[OrderItemDTO] = Field(default_factory=list, description="物资明细列表")
    total_amount: Optional[float] = Field(None, description="订单申报总金额")
    special_approval_reason: Optional[str] = Field("", description="超额特批理由")
    operator_name: Optional[str] = Field("李强", description="经办人姓名")
    operator_dept: Optional[str] = Field("物资贸易一部", description="经办人部门")


class DraftUpdateRequest(BaseModel):
    contract_no: Optional[str] = Field(None, description="关联合同编号")
    order_type: Optional[str] = Field(None, description="单据类型")
    counterparty_name: Optional[str] = Field(None, description="往来单位")
    project_name: Optional[str] = Field(None, description="项目名称")
    delivery_address: Optional[str] = Field(None, description="送货地址")
    contact_person: Optional[str] = Field(None, description="联系人")
    items: Optional[List[OrderItemDTO]] = Field(None, description="物资明细列表")
    total_amount: Optional[float] = Field(None, description="订单申报总金额")
    special_approval_reason: Optional[str] = Field(None, description="特批申请理由")
    status: Optional[str] = Field(None, description="草稿状态 (DRAFT/SUBMITTED)")


class DraftResponseData(BaseModel):
    draft_id: str = Field(..., description="草稿全局唯一ID")
    order_type: str = Field("SALES", description="单据类型")
    contract_no: str = Field(..., description="合同编号")
    counterparty_name: str = Field(..., description="往来单位全称")
    project_name: str = Field(..., description="项目名称")
    delivery_address: str = Field(..., description="送货地址")
    contact_person: str = Field("现场负责人", description="联系人")
    business_name: str = Field("国内传统贸易", description="业务名称")
    procurement_mode: str = Field("直发", description="采购模式")
    business_tag: str = Field("传统贸易", description="业务标签")
    items: List[OrderItemDTO] = Field(default_factory=list, description="物资明细列表")
    total_amount: float = Field(0.0, description="订单总金额")
    is_over_quota: bool = Field(False, description="是否超额")
    special_approval_reason: str = Field("", description="特批说明")
    status: str = Field("DRAFT", description="草稿状态 (DRAFT/SUBMITTED)")
    compliance: Optional[ComplianceVerifyResult] = Field(None, description="最新实时合规风控诊断")
    created_at: str = Field(..., description="创建时间")
    updated_at: str = Field(..., description="更新时间")


class OrderSubmitRequest(BaseModel):
    draft_id: Optional[str] = Field(None, description="关联草稿ID")
    contract_no: str = Field(..., description="关联合同编号")
    order_type: str = Field("SALES", description="单据类型 (SALES/PURCHASE)")
    counterparty_name: Optional[str] = Field(None, description="往来签约单位全称")
    project_name: Optional[str] = Field(None, description="归属工程项目名称")
    delivery_address: Optional[str] = Field(None, description="送货地址")
    contact_person: Optional[str] = Field("现场负责人", description="现场联系人")
    business_name: Optional[str] = Field("国内传统贸易", description="业务名称")
    procurement_mode: Optional[str] = Field("直发", description="采购模式")
    business_tag: Optional[str] = Field("传统贸易", description="业务标签")
    items: List[OrderItemDTO] = Field(default_factory=list, description="物资明细列表")
    total_amount: Optional[float] = Field(None, description="订单申报总金额")
    special_approval_reason: Optional[str] = Field(None, description="超额特批理由")
    operator_name: Optional[str] = Field("李强", description="经办人姓名")
    operator_dept: Optional[str] = Field("物资贸易一部", description="经办人部门")


class OrderSubmitResponseData(BaseModel):
    order_no: str = Field(..., description="正式商贸单据号")
    order_status: str = Field(..., description="订单状态 (ACTIVE/PENDING_SPECIAL_APPROVAL)")
    total_amount: float = Field(..., description="订单总金额")
    is_over_quota: bool = Field(False, description="是否超额")
    special_approval_reason: Optional[str] = Field(None, description="特批理由")
    created_at: str = Field(..., description="创建时间 (ISO-8601)")


class OrderApprovalRequest(BaseModel):
    action: Optional[Literal["APPROVE", "REJECT", "PASS", "RETURN"]] = Field(None, description="审批动作: APPROVE/REJECT")
    decision: Optional[Literal["PASS", "RETURN", "REJECT", "APPROVE"]] = Field(None, description="审批裁决: PASS/RETURN/REJECT")
    comment: Optional[str] = Field("审批处理", description="审批签署意见")
    approver_name: Optional[str] = Field(None, description="审批人姓名 (可从Header注入)")
    approver_dept: Optional[str] = Field(None, description="审批人部门 (可从Header注入)")
    approver_role: Optional[str] = Field(None, description="审批人角色 (可从Header注入)")


class OrderApprovalResponseData(BaseModel):
    order_no: str = Field(..., description="商贸单据号")
    order_status: str = Field(..., description="订单最新状态 (ACTIVE/REJECTED/RETURNED)")
    decision: str = Field(..., description="审批最终裁决")
    approver_name: str = Field(..., description="审批人")
    approval_comment: Optional[str] = Field(None, description="审批批注意见")
    approved_at: str = Field(..., description="审批完成时间 (ISO-8601)")
