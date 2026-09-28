import { apiClient, generateIdempotencyKey } from './api';
import {
  ApiResponse,
  OrderDraft,
  OrderSubmitPayload,
  OrderSubmitResult,
  OrderSubmitSpecialPayload,
  OrderSubmitSpecialResult,
  OrderRecord,
} from '../types';

/**
 * 订单与草稿真实服务 API 模块 (Zero-Fake 真实调用)
 * 严格遵照 docs/03_dev_guidelines_and_api_contracts.md 铁律：
 * 绝不伪造成功响应，绝不在 catch 中注入假数据，错误真实抛出给调用方展示。
 */
export const orderApi = {
  // 获取当前经办人暂存草稿 (GET /api/orders/draft)
  getDraft: async (): Promise<ApiResponse<OrderDraft>> => {
    const res = await apiClient.get<ApiResponse<OrderDraft>>('/orders/draft');
    return res.data;
  },

  // 暂存草稿 (POST /api/orders/draft)
  saveDraft: async (draft: Partial<OrderDraft>): Promise<ApiResponse<OrderDraft>> => {
    const res = await apiClient.post<ApiResponse<OrderDraft>>('/orders/draft', draft);
    return res.data;
  },

  // 更新草稿 (PUT /api/orders/draft)
  updateDraft: async (draft: Partial<OrderDraft>): Promise<ApiResponse<OrderDraft>> => {
    const res = await apiClient.put<ApiResponse<OrderDraft>>('/orders/draft', draft);
    return res.data;
  },

  // 正式提单提交 (额度充足直接生效) (POST /api/orders/submit)
  submitOrder: async (
    payload: OrderSubmitPayload,
    idempotencyKey?: string
  ): Promise<ApiResponse<OrderSubmitResult>> => {
    const key = idempotencyKey || generateIdempotencyKey();
    const res = await apiClient.post<ApiResponse<OrderSubmitResult>>('/orders/submit', payload, {
      headers: { 'Idempotency-Key': key },
    });
    // 成功后广播 ERP 刷新
    window.dispatchEvent(new CustomEvent('erp:order_refresh'));
    return res.data;
  },

  // 超额特批申请提交 (必须理由 >= 10 字) (POST /api/orders/submit-special)
  submitSpecialApproval: async (
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
    window.dispatchEvent(new CustomEvent('erp:order_refresh'));
    return res.data;
  },

  // 中台订单回写 (TradeDoc -> Mock ERP: POST /api/erp/orders/writeback)
  writebackErp: async (payload: any): Promise<ApiResponse<any>> => {
    const res = await apiClient.post<ApiResponse<any>>('/erp/orders/writeback', payload);
    return res.data;
  },

  // 获取中台订单列表 (Mock ERP: GET /api/erp/orders)
  fetchErpOrders: async (params?: any): Promise<ApiResponse<{ items: OrderRecord[]; total: number }>> => {
    const res = await apiClient.get<ApiResponse<{ items: OrderRecord[]; total: number }>>('/erp/orders', { params });
    return res.data;
  },
};
