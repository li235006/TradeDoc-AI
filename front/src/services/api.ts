import axios, { AxiosResponse } from 'axios';
import {
  ApiResponse,
  ParseChatRequest,
  ParseChatResult,
  ParseOcrResult,
  ExcelParseResult,
  OrderSubmitPayload,
  OrderSubmitResult,
  OrderSubmitSpecialPayload,
  OrderSubmitSpecialResult,
  OrderApproveRequest,
  OrderApproveResult,
  OrderListQueryParams,
  OrderListResult,
  ContractQuota,
} from '../types';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：统一解包与标准三值错误治理 (200 | 400 | 500)
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data;
    // 当业务码为 400 或 500 时，直接转为 Reject 抛出业务异常，避免引发前端白屏
    if (res && typeof res.code === 'number' && res.code !== 200) {
      return Promise.reject(new Error(res.message || '业务处理失败'));
    }
    return response;
  },
  (error) => {
    const msg =
      error.response?.data?.message ||
      error.message ||
      '网络连接超时或后端服务未就绪，请检查服务状态';
    return Promise.reject(new Error(msg));
  }
);

/**
 * 客户端 UUIDv4 幂等防重键生成器
 */
export function generateIdempotencyKey(): string {
  return 'idem-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

/**
 * 8 大核心业务 API 契约调用封装 (Zero-Fake 真实调用)
 * 对齐源：docs/03_dev_guidelines_and_api_contracts.md#三、标准-api-契约规范
 */
export const tradeApi = {
  // 健康检查探针
  checkHealth: async (): Promise<ApiResponse<{ status: string; db: boolean; milvus: boolean }>> => {
    const res = await apiClient.get('/health');
    return res.data;
  },

  // EP-01: 文本对话智能解析 (POST /api/parse/chat)
  parseChat: async (payload: ParseChatRequest): Promise<ApiResponse<ParseChatResult>> => {
    const res = await apiClient.post<ApiResponse<ParseChatResult>>('/parse/chat', payload);
    return res.data;
  },

  // EP-02: 单据图片 OCR 结构化提单 (POST /api/parse/ocr)
  parseOcr: async (file: File, contractNo?: string): Promise<ApiResponse<ParseOcrResult>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (contractNo) {
      formData.append('contract_no', contractNo);
    }
    const res = await apiClient.post<ApiResponse<ParseOcrResult>>('/parse/ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // EP-03 附件: 下载标准 Excel 导入模板 (GET /api/parse/excel/template)
  downloadExcelTemplate: async (): Promise<Blob> => {
    const res = await apiClient.get('/parse/excel/template', {
      responseType: 'blob',
    });
    return res.data;
  },

  // EP-03: Excel 批量表格逐行解析校验 (POST /api/parse/excel)
  parseExcel: async (file: File): Promise<ApiResponse<ExcelParseResult>> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<ApiResponse<ExcelParseResult>>('/parse/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // EP-04: 正式提单提交 (额度合规) (POST /api/orders/submit)
  submitOrder: async (
    payload: OrderSubmitPayload,
    idempotencyKey?: string
  ): Promise<ApiResponse<OrderSubmitResult>> => {
    const key = idempotencyKey || generateIdempotencyKey();
    const res = await apiClient.post<ApiResponse<OrderSubmitResult>>('/orders/submit', payload, {
      headers: { 'Idempotency-Key': key },
    });
    return res.data;
  },

  // EP-05: 超额特批申请提交 (POST /api/orders/submit-special)
  submitSpecialOrder: async (
    payload: OrderSubmitSpecialPayload,
    idempotencyKey?: string
  ): Promise<ApiResponse<OrderSubmitSpecialResult>> => {
    const key = idempotencyKey || generateIdempotencyKey();
    const res = await apiClient.post<ApiResponse<OrderSubmitSpecialResult>>(
      '/orders/submit-special',
      payload,
      {
        headers: { 'Idempotency-Key': key },
      }
    );
    return res.data;
  },

  // EP-06: 审批人裁决流转 (POST /api/orders/{order_no}/approve)
  approveOrder: async (
    orderNo: string,
    payload: OrderApproveRequest,
    customHeaders?: Record<string, string>
  ): Promise<ApiResponse<OrderApproveResult>> => {
    const headers: Record<string, string> = {
      'X-User-Name': payload.approver_name || '陈总监',
      'X-User-Role': 'APPROVER',
      'X-User-Dept': payload.approver_dept || '商务风控部',
      ...customHeaders,
    };
    const res = await apiClient.post<ApiResponse<OrderApproveResult>>(
      `/orders/${encodeURIComponent(orderNo)}/approve`,
      payload,
      { headers }
    );
    return res.data;
  },

  // EP-07: 商贸订单列表查询 (GET /api/orders)
  fetchOrders: async (
    params?: OrderListQueryParams
  ): Promise<ApiResponse<OrderListResult>> => {
    const res = await apiClient.get<ApiResponse<OrderListResult>>('/orders', { params });
    return res.data;
  },

  // EP-08: 合同配额看板查询 (GET /api/contracts/{contract_no}/quota)
  fetchContractQuota: async (contractNo: string): Promise<ApiResponse<ContractQuota>> => {
    const res = await apiClient.get<ApiResponse<ContractQuota>>(
      `/contracts/${encodeURIComponent(contractNo)}/quota`
    );
    return res.data;
  },
};
