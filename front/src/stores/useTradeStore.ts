import { create } from 'zustand';
import { OrderDraft, ContractQuota, OrderItem, ChatMessage, AppDisplayMode } from '../types';

const defaultDraft: OrderDraft = {
  order_type: 'SALES',
  contract_no: '',
  counterparty_name: '',
  project_name: '',
  delivery_address: '',
  business_name: '国内传统贸易',
  procurement_mode: '直发',
  business_tag: '传统贸易',
  items: [],
  total_amount: 0,
  is_over_quota: false,
  special_approval_reason: '',
  order_status: 'DRAFT',
  operator_name: '张明',
  operator_dept: '物资贸易二部',
};

const defaultQuota: ContractQuota = {
  contract_total_amount: 0,
  accumulated_order_amount: 0,
  accumulated_order_count: 0,
  remaining_quota_amount: 0,
  remaining_order_count: 0,
  is_over_quota: false,
  over_amount: 0,
};

interface TradeState {
  // 视窗形态：全屏工作台 vs 浮动窗口
  displayMode: AppDisplayMode;
  setDisplayMode: (mode: AppDisplayMode) => void;
  toggleDisplayMode: () => void;

  // 核心单源真相：订单草稿
  draft: OrderDraft;
  setDraft: (draft: Partial<OrderDraft>) => void;
  resetDraft: () => void;
  addDraftItem: (item: OrderItem) => void;
  updateDraftItem: (index: number, item: Partial<OrderItem>) => void;
  removeDraftItem: (index: number) => void;

  // 合同配额与履约看板
  quota: ContractQuota;
  setQuota: (quota: Partial<ContractQuota>) => void;

  // 智能对话消息流
  messages: ChatMessage[];
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  // 全局加载与通知状态
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  activeDrawerOrderNo: string | null;
  setActiveDrawerOrderNo: (orderNo: string | null) => void;

  // 当前用户角色身份：经办人 vs 审批主管 vs 管理员
  currentUserRole: 'OPERATOR' | 'APPROVER' | 'ADMIN';
  setCurrentUserRole: (role: 'OPERATOR' | 'APPROVER' | 'ADMIN') => void;
}

export const useTradeStore = create<TradeState>((set) => ({
  currentUserRole: 'OPERATOR',
  setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),
  displayMode: 'fullscreen',
  setDisplayMode: (displayMode) => set({ displayMode }),
  toggleDisplayMode: () =>
    set((state) => ({
      displayMode: state.displayMode === 'fullscreen' ? 'floating' : 'fullscreen',
    })),

  draft: defaultDraft,
  setDraft: (newDraft) =>
    set((state) => {
      const merged = { ...state.draft, ...newDraft };
      // 重新计算总金额
      if (newDraft.items) {
        merged.total_amount = newDraft.items.reduce(
          (sum, item) => sum + (Number(item.total_amount) || Number(item.quantity) * Number(item.unit_price) || 0),
          0
        );
      }
      return { draft: merged };
    }),
  resetDraft: () => set({ draft: defaultDraft, quota: defaultQuota }),
  addDraftItem: (item) =>
    set((state) => {
      const newItems = [...state.draft.items, item];
      const totalAmount = newItems.reduce((sum, it) => sum + Number(it.total_amount || 0), 0);
      return {
        draft: {
          ...state.draft,
          items: newItems,
          total_amount: totalAmount,
        },
      };
    }),
  updateDraftItem: (index, itemUpdate) =>
    set((state) => {
      const newItems = [...state.draft.items];
      if (newItems[index]) {
        const updated = { ...newItems[index], ...itemUpdate };
        if (itemUpdate.quantity !== undefined || itemUpdate.unit_price !== undefined) {
          updated.total_amount = Number((updated.quantity * updated.unit_price).toFixed(2));
        }
        newItems[index] = updated;
      }
      const totalAmount = newItems.reduce((sum, it) => sum + Number(it.total_amount || 0), 0);
      return {
        draft: {
          ...state.draft,
          items: newItems,
          total_amount: totalAmount,
        },
      };
    }),
  removeDraftItem: (index) =>
    set((state) => {
      const newItems = state.draft.items.filter((_, i) => i !== index);
      const totalAmount = newItems.reduce((sum, it) => sum + Number(it.total_amount || 0), 0);
      return {
        draft: {
          ...state.draft,
          items: newItems,
          total_amount: totalAmount,
        },
      };
    }),

  quota: defaultQuota,
  setQuota: (newQuota) =>
    set((state) => ({
      quota: { ...state.quota, ...newQuota },
    })),

  messages: [
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        '您好！我是 TradeDoc AI 智能提单助手。您可以直接向我输入提单需求（例如：“给中建八局下200吨400E 20圆钢，走2026-WZ-089合同”），或切换至拍照识别、批量表格通道。',
      timestamp: new Date().toISOString(),
      suggestions: [
        '给中建八局下200吨400E 20圆钢，走2026-WZ-089合同',
        '查询合同 2026-WZ-089 剩余配额',
        '给中铁十二局下100吨42.5散装水泥',
      ],
    },
  ],
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          timestamp: new Date().toISOString(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  activeDrawerOrderNo: null,
  setActiveDrawerOrderNo: (activeDrawerOrderNo) => set({ activeDrawerOrderNo }),
}));
