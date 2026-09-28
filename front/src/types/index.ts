// ============================================================================
// 《智能商贸提单助手 (TradeDoc AI)》 前后端统一数据模型与 API 契约 TypeScript 定义
// 对齐源：docs/03_dev_guidelines_and_api_contracts.md (SSOT)
// ============================================================================

/**
 * 2.1 统一 API 响应报文结构 (Standard Envelope)
 * 全站统一采用标准三值业务码：200(成功) | 400(业务校验失败/规则拦截) | 500(系统服务异常)
 */
export interface ApiResponse<T = any> {
  code: 200 | 400 | 500;
  message: string;
  data: T;
}

/**
 * 4.1 物资明细模型 (OrderItem)
 * 1:1 精确映射后端 OrderItemDTO
 */
export interface OrderItem {
  item_seq: number;
  material_code: string;
  material_name: string;
  specification: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  match_status?: 'ALIGNED' | 'CONFIRM' | 'UNMATCHED';
}

/**
 * 4.2 订单草稿与主档模型 (OrderDraft / OrderHeader)
 * 1:1 精确映射后端 OrderDraftDTO
 */
export interface OrderDraft {
  order_no?: string;
  order_type: 'SALES' | 'PURCHASE';
  contract_no: string;
  counterparty_name: string;
  project_name: string;
  delivery_address: string;
  contact_person?: string;
  business_name: string;
  procurement_mode: string;
  business_tag: string;
  settlement_method?: string;
  payment_term?: string;
  items: OrderItem[];
  total_amount: number;
  is_over_quota: boolean;
  special_approval_reason: string;
  order_status:
    | 'DRAFT'
    | 'PENDING_CONFIRM'
    | 'PENDING_SPECIAL_APPROVAL'
    | 'ACTIVE'
    | 'RETURNED'
    | 'REJECTED';
  operator_name: string;
  operator_dept: string;
  created_at?: string;
}

/**
 * 4.3 合同履约配额看板模型 (ContractQuota)
 * 1:1 精确映射后端 ContractQuotaDTO
 */
export interface ContractQuota {
  contract_no?: string;
  contract_type?: 'SALES' | 'PURCHASE';
  counterparty_name?: string;
  project_name?: string;
  default_delivery_address?: string;
  contract_total_amount: number;
  accumulated_order_amount: number;
  accumulated_order_count: number;
  remaining_quota_amount: number;
  remaining_order_count: number;
  max_order_count?: number;
  is_over_quota: boolean;
  over_amount: number;
}

/**
 * 订单台账全量记录 (OrderRecord)
 */
export interface OrderRecord extends OrderDraft {
  order_no: string;
  is_special_approved?: boolean;
  approver_name?: string;
  approval_comment?: string;
  created_at: string;
}

// ============================================================================
// 8 大核心端点请求与返回载荷契约定义
// ============================================================================

/**
 * EP-01: 自然语言文本解析 (POST /api/parse/chat)
 */
export interface ParseChatRequest {
  text: string;
  session_id?: string;
}

export interface ParseChatResult {
  draft: OrderDraft;
  quota: ContractQuota;
  clarification?: string;
}

/**
 * EP-02: 单据图片 OCR 结构化提单 (POST /api/parse/ocr)
 */
export interface ParseOcrResult {
  draft: OrderDraft;
  quota: ContractQuota;
  ocr_raw_text?: string;
}

/**
 * EP-03: Excel 批量表格逐行解析校验 (POST /api/parse/excel)
 */
export interface ExcelParsedRow {
  row_index: number;
  status: 'VALID' | 'ERROR';
  error_msg: string | null;
  contract_no: string;
  counterparty_name: string;
  project_name: string;
  material_code: string;
  material_name: string;
  specification: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  delivery_address: string;
}

export interface ExcelParseResult {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  rows: ExcelParsedRow[];
}

/**
 * EP-04: 正式提单提交 (额度合规) (POST /api/orders/submit)
 */
export interface OrderSubmitPayload {
  order_type: 'SALES' | 'PURCHASE';
  contract_no: string;
  counterparty_name?: string;
  project_name?: string;
  delivery_address?: string;
  contact_person?: string;
  business_name?: string;
  procurement_mode?: string;
  business_tag?: string;
  items: OrderItem[];
  total_amount: number;
  operator_name?: string;
  operator_dept?: string;
}

export interface OrderSubmitResult {
  order_no: string;
  order_status: 'ACTIVE';
  total_amount: number;
  created_at: string;
}

/**
 * EP-05: 超额特批申请提交 (POST /api/orders/submit-special)
 */
export interface OrderSubmitSpecialPayload extends OrderSubmitPayload {
  special_approval_reason: string;
}

export interface OrderSubmitSpecialResult {
  order_no: string;
  order_status: 'PENDING_SPECIAL_APPROVAL';
  is_over_quota: boolean;
  special_approval_reason: string;
  created_at: string;
}

/**
 * EP-06: 审批人裁决流转 (POST /api/orders/{order_no}/approve)
 */
export interface OrderApproveRequest {
  decision: 'PASS' | 'RETURN' | 'REJECT';
  comment: string;
  approver_name: string;
  approver_dept: string;
}

export interface OrderApproveResult {
  order_no: string;
  order_status: 'ACTIVE' | 'RETURNED' | 'REJECTED';
  decision: 'PASS' | 'RETURN' | 'REJECT';
  approved_at: string;
}

/**
 * EP-07: 商贸订单列表查询 (GET /api/orders)
 */
export interface OrderListQueryParams {
  page?: number;
  page_size?: number;
  order_type?: 'SALES' | 'PURCHASE';
  order_status?:
    | 'DRAFT'
    | 'PENDING_CONFIRM'
    | 'PENDING_SPECIAL_APPROVAL'
    | 'ACTIVE'
    | 'RETURNED'
    | 'REJECTED';
  keyword?: string;
  dept?: string;
}

export interface OrderListResult {
  total: number;
  page: number;
  page_size: number;
  list: OrderRecord[];
}

/**
 * EP-08: 合同配额看板查询 (GET /api/contracts/{contract_no}/quota)
 * 直接响应 ContractQuota 载荷
 */

// ============================================================================
// 前端交互与双模态 UI 实体
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestions?: string[];
}

export type AppDisplayMode = 'fullscreen' | 'floating';
