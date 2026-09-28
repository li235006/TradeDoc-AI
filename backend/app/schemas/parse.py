from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

try:
    from app.schemas.compliance import ComplianceVerifyResult
except ImportError:
    from backend.app.schemas.compliance import ComplianceVerifyResult


class ParseChatRequest(BaseModel):
    text: str = Field(..., min_length=2, max_length=1000, description="用户输入的提单自然语言文本")
    session_id: Optional[str] = Field(None, description="会话追溯 ID")
    contract_no: Optional[str] = Field(None, description="预选合同编号")


class MaterialAlignRequest(BaseModel):
    text: Optional[str] = Field(None, description="现场黑话/俗称输入文本")
    alias: Optional[str] = Field(None, description="别名文本 (兼容字段)")
    query: Optional[str] = Field(None, description="查询词 (兼容字段)")

    def get_query_text(self) -> str:
        return (self.text or self.alias or self.query or "").strip()


class MaterialAlignResult(BaseModel):
    material_code: str = Field(..., description="对齐的标准物料编码")
    material_name: str = Field(..., description="对齐的规范物资名称")
    specification: str = Field(..., description="规格型号")
    standard_price: float = Field(..., description="官方基准指导价")
    score: float = Field(..., description="Milvus 余弦相似度置信度 (0~1.0)")
    match_status: Literal["ALIGNED", "PENDING_CONFIRM", "UNMATCHED"] = Field(
        ..., description="对齐结论 (>=0.85 ALIGNED, 0.6~0.85 PENDING_CONFIRM, <0.6 UNMATCHED)"
    )
    alias_matched: Optional[str] = Field(None, description="命中的别名参考")


class DraftOrderItem(BaseModel):
    item_seq: int = Field(1, description="明细行号")
    material_code: str = Field(..., description="标准物料编码")
    material_name: str = Field(..., description="规范物资名称")
    specification: str = Field(..., description="规格型号")
    quantity: float = Field(..., description="采购/销售数量")
    unit: str = Field("吨", description="计量单位")
    unit_price: float = Field(..., description="含税单价")
    total_amount: float = Field(..., description="明细总金额")
    match_status: Literal["ALIGNED", "PENDING_CONFIRM", "UNMATCHED"] = Field("ALIGNED", description="匹配状态")
    raw_material: Optional[str] = Field(None, description="原始输入品名")


class OrderDraft(BaseModel):
    order_type: str = Field("SALES", description="单据类型 (SALES/PURCHASE)")
    contract_no: str = Field(..., description="关联合同编号")
    counterparty_name: str = Field(..., description="往来签约单位全称")
    project_name: str = Field(..., description="归属工程项目名称")
    delivery_address: str = Field(..., description="工地送货地址")
    contact_person: Optional[str] = Field("现场负责人", description="现场联系人")
    business_name: str = Field("国内传统贸易", description="业务名称")
    procurement_mode: str = Field("直发", description="采购模式")
    business_tag: str = Field("传统贸易", description="业务标签")
    items: List[DraftOrderItem] = Field(default_factory=list, description="物资明细列表")
    total_amount: float = Field(0.0, description="订单申报总金额")
    is_over_quota: bool = Field(False, description="是否超额")
    special_approval_reason: str = Field("", description="超额特批理由")
    order_status: str = Field("DRAFT", description="订单状态 (DRAFT)")


class QuotaSummary(BaseModel):
    contract_total_amount: float = Field(0.0, description="合同约定总金额")
    accumulated_order_amount: float = Field(0.0, description="累计已下金额")
    accumulated_order_count: int = Field(0, description="累计已下订单数")
    remaining_quota_amount: float = Field(0.0, description="剩余可用金额")
    remaining_order_count: int = Field(0, description="剩余可用笔数")
    is_over_quota: bool = Field(False, description="是否超额")
    over_amount: float = Field(0.0, description="超额金额")


class ParseResultData(BaseModel):
    draft: OrderDraft = Field(..., description="提单结构化初稿")
    quota: QuotaSummary = Field(..., description="关联合同配额核算结果")
    compliance: ComplianceVerifyResult = Field(..., description="对接风控引擎实时诊断报文")
    clarification: Optional[str] = Field(None, description="面向经办人的中文业务提示/澄清话术")
    ocr_raw_text: Optional[str] = Field(None, description="单据 OCR 识别原始文本 (若有)")


class ExcelRowResult(BaseModel):
    row_index: int = Field(..., description="Excel 行号 (从 1 开始)")
    status: Literal["VALID", "ERROR"] = Field(..., description="校验状态: VALID / ERROR")
    error_msg: Optional[str] = Field(None, description="校验失败原因说明 (如无异常则为 null)")
    contract_no: Optional[str] = Field(None, description="关联合同编号")
    counterparty_name: Optional[str] = Field(None, description="签约往来单位")
    project_name: Optional[str] = Field(None, description="工程项目名称")
    material_code: Optional[str] = Field(None, description="标准物料编码")
    material_name: Optional[str] = Field(None, description="规范物资名称")
    specification: Optional[str] = Field("", description="规格型号")
    quantity: float = Field(0.0, description="采购数量")
    unit: str = Field("吨", description="计量单位")
    unit_price: float = Field(0.0, description="含税单价")
    total_amount: float = Field(0.0, description="明细总金额")
    delivery_address: Optional[str] = Field(None, description="工地送货地址")


class ExcelParseResultData(BaseModel):
    total_rows: int = Field(..., description="Excel 导入数据总行数")
    valid_rows: int = Field(..., description="合规校验通过有效行数")
    error_rows: int = Field(..., description="存在异常/阻断行数")
    rows: List[ExcelRowResult] = Field(default_factory=list, description="逐行校验明细清单")
