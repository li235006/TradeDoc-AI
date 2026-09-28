import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Maximize2,
  Minimize2,
  Send,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { useTradeStore } from '../stores/useTradeStore';
import { orderApi } from '../services/orderApi';
import { apiClient } from '../services/api';

export const FloatingWidget: React.FC = () => {
  const navigate = useNavigate();
  const {
    draft,
    quota,
    messages,
    addMessage,
    setDraft,
    setQuota,
    resetDraft,
    displayMode,
    setDisplayMode,
  } = useTradeStore();

  const [isOpen, setIsOpen] = useState(false);

  // 当从工作台点击“缩小为悬浮窗”时，自动展开浮窗
  useEffect(() => {
    if (displayMode === 'floating') {
      setIsOpen(true);
    }
  }, [displayMode]);
  const [activeChannel, setActiveChannel] = useState<'text' | 'ocr' | 'batch'>('text');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 引导快捷指令
  const handleQuickTemplate = (text: string) => {
    setInputText(text);
  };

  // 快速提交解析
  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // 若当前为特批模式且输入的是特批理由
    if (quota.is_over_quota && !draft.special_approval_reason && trimmed.length >= 10) {
      setDraft({ special_approval_reason: trimmed });
      setInputText('');
      setFeedback({ type: 'success', message: '已成功录入超额特批申报理由' });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    addMessage({
      role: 'user',
      content: trimmed,
    });
    setInputText('');
    setIsProcessing(true);

    try {
      // 请求后端自然语言解析
      const res = await apiClient.post<any>('/parse/chat', { text: trimmed });
      if (res.data?.data) {
        const parsed = res.data.data;
        if (parsed.draft) {
          setDraft(parsed.draft);
        }
        if (parsed.quota) {
          setQuota(parsed.quota);
        }
        addMessage({
          role: 'assistant',
          content: parsed.reply || '已根据您的描述成功提取提单要素并同步至订单草稿。',
        });
      }
    } catch (error: any) {
      addMessage({
        role: 'assistant',
        content: '解析失败: ' + (error?.message || '网络连接或服务异常，请稍后重试'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 暂存草稿
  const handleSaveDraft = async () => {
    try {
      const res = await orderApi.saveDraft(draft);
      setFeedback({ type: 'success', message: res.message || '草稿已暂存' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '暂存失败，请检查网络或后端状态' });
    } finally {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // 提交特批
  const handleSubmitSpecial = async () => {
    if (!draft.special_approval_reason || draft.special_approval_reason.trim().length < 10) {
      setFeedback({ type: 'error', message: '请在输入框补充特批理由(不少于10字)' });
      return;
    }
    setIsProcessing(true);
    try {
      const res = await orderApi.submitSpecialApproval({
        order_type: draft.order_type,
        contract_no: draft.contract_no,
        counterparty_name: draft.counterparty_name,
        project_name: draft.project_name,
        delivery_address: draft.delivery_address,
        contact_person: draft.contact_person,
        business_name: draft.business_name,
        procurement_mode: draft.procurement_mode,
        business_tag: draft.business_tag,
        items: draft.items,
        total_amount: draft.total_amount,
        special_approval_reason: draft.special_approval_reason,
        operator_name: draft.operator_name,
        operator_dept: draft.operator_dept,
      });
      setFeedback({ type: 'success', message: `特批已提交！单号：${res.data.order_no}` });
      setDraft({ order_status: 'PENDING_SPECIAL_APPROVAL', order_no: res.data.order_no });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '特批提交失败，请检查网络或后端状态' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 正式提单
  const handleSubmitNormal = async () => {
    if (!draft.contract_no) {
      setFeedback({ type: 'error', message: '请先关联有效合同' });
      return;
    }
    if (draft.items.length === 0) {
      setFeedback({ type: 'error', message: '请先录入物资明细' });
      return;
    }
    setIsProcessing(true);
    try {
      const res = await orderApi.submitOrder({
        order_type: draft.order_type,
        contract_no: draft.contract_no,
        counterparty_name: draft.counterparty_name,
        project_name: draft.project_name,
        delivery_address: draft.delivery_address,
        contact_person: draft.contact_person,
        business_name: draft.business_name,
        procurement_mode: draft.procurement_mode,
        business_tag: draft.business_tag,
        items: draft.items,
        total_amount: draft.total_amount,
        operator_name: draft.operator_name,
        operator_dept: draft.operator_dept,
      });
      setFeedback({ type: 'success', message: `提单成功！单号：${res.data.order_no}` });
      setDraft({ order_status: 'ACTIVE', order_no: res.data.order_no });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '提交失败，请检查网络或后端状态' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 最新助手消息与用户消息
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto select-none">
      {/* 展开式 420px 智能提单轻量浮窗 */}
      {isOpen && (
        <div className="w-[420px] max-w-[calc(100vw-32px)] h-[620px] max-h-[85vh] bg-white rounded-hig-2xl shadow-hig-float border border-[#CBD5E1] overflow-hidden mb-3 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* 浮窗顶栏 (52px) */}
          <div className="h-[52px] px-4 border-b border-[#E2E8F0] bg-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-hig-sm bg-[#0071E3] flex items-center justify-center text-white text-xs font-bold font-mono">
                TD
              </div>
              <span className="text-sm font-bold text-hig-gray-900">智能提单助手</span>
              <span className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">
                实时核验就绪
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setDisplayMode('fullscreen');
                  setIsOpen(false);
                  navigate('/workbench');
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-hig-sm bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0071E3] text-[11px] font-bold transition"
                title="进入全屏完整工作台"
              >
                <Maximize2 className="w-3 h-3" />
                <span>全屏</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-hig-sm hover:bg-[#F1F5F9] flex items-center justify-center text-hig-gray-500 transition"
                title="最小化浮窗"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 模式胶囊切换 */}
          <div className="h-[38px] px-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setActiveChannel('text')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                activeChannel === 'text'
                  ? 'bg-[#0071E3] text-white shadow-hig-sm'
                  : 'text-hig-gray-500 hover:text-hig-gray-800'
              }`}
            >
              文本对话
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/workbench');
              }}
              className="px-2.5 py-1 rounded-full text-[11px] text-hig-gray-500 hover:text-hig-gray-800 transition"
            >
              单据识别
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/batch');
              }}
              className="px-2.5 py-1 rounded-full text-[11px] text-hig-gray-500 hover:text-hig-gray-800 transition"
            >
              批量导入
            </button>
          </div>

          {/* 反馈条 */}
          {feedback && (
            <div
              className={`px-3 py-1.5 text-[11px] flex items-center gap-1.5 border-b flex-shrink-0 animate-in fade-in duration-150 ${
                feedback.type === 'success'
                  ? 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]'
                  : 'bg-[#FFF1F2] text-[#E11D48] border-[#FFE4E6]'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="truncate">{feedback.message}</span>
            </div>
          )}

          {/* 浮窗主体滚动区 */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
            {/* 快捷引导条 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() =>
                  handleQuickTemplate('给中建八局下200吨400E 20圆钢，走2026-WZ-089合同，单价4000元送至一号工地')
                }
                className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] hover:bg-[#E2E8F0] text-hig-gray-700 text-[10px] transition"
              >
                + 新建销售
              </button>
              <button
                onClick={() =>
                  handleQuickTemplate('向江苏苏钢采购100吨HRB400E螺纹钢，走框架协议')
                }
                className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] hover:bg-[#E2E8F0] text-hig-gray-700 text-[10px] transition"
              >
                + 新建采购
              </button>
              <button
                onClick={() => {
                  if (draft.contract_no) {
                    handleQuickTemplate(`针对合同 ${draft.contract_no} 追加 50 吨`);
                  } else {
                    resetDraft();
                  }
                }}
                className="px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] hover:bg-[#E2E8F0] text-hig-gray-700 text-[10px] transition"
              >
                ↺ 继续上次
              </button>
            </div>

            {/* 用户最新输入气泡 */}
            {lastUserMsg && (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-hig-lg bg-[#0071E3] text-white text-xs leading-relaxed shadow-hig-sm">
                  {lastUserMsg.content}
                </div>
              </div>
            )}

            {/* 助手要素提取卡片 */}
            {lastAssistantMsg && (
              <div className="p-2.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-hig-gray-900 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />
                  <span className="truncate">
                    {draft.contract_no
                      ? `要素识别完成 · 匹配合同 ${draft.contract_no}`
                      : '提单助手分析'}
                  </span>
                </div>
                <div className="text-[11px] text-hig-gray-600 leading-snug">
                  {lastAssistantMsg.content}
                </div>
              </div>
            )}

            {/* 超额警示横幅 (超额时展现) */}
            {quota.is_over_quota && (
              <div className="p-2.5 rounded-hig bg-[#FFF1F2] border border-[#FECDD3] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-[#E11D48] flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-[#E11D48]">
                    合同履约超额预警 (超额 ¥{quota.over_amount.toLocaleString()})
                  </div>
                  <div className="text-[10px] text-[#9F1239] leading-tight">
                    合同剩余额度 ¥{quota.remaining_quota_amount.toLocaleString()}，本次占用 ¥
                    {draft.total_amount.toLocaleString()}，无法直接提单，需申请特批。
                  </div>
                </div>
              </div>
            )}

            {/* 订单草稿摘要卡 */}
            <div className="p-3 rounded-hig bg-white border border-[#E2E8F0] shadow-hig-xs space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#F1F5F9]">
                <div className="flex items-center gap-1.5 font-bold text-hig-gray-900">
                  <FileCheck className="w-3.5 h-3.5 text-[#0071E3]" />
                  <span>订单草稿摘要</span>
                </div>
                {quota.is_over_quota ? (
                  <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] text-[10px] font-bold">
                    待特批申请
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">
                    合规可生效
                  </span>
                )}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-hig-gray-500">签约客户</span>
                  <span className="font-semibold text-hig-gray-800 truncate max-w-[200px]">
                    {draft.counterparty_name || '未关联客户'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-hig-gray-500">关联合同</span>
                  <span className="font-semibold text-hig-gray-800 font-mono">
                    {draft.contract_no || '未关联合同'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-hig-gray-500">拟提物资</span>
                  <span className="font-semibold text-hig-gray-800 truncate max-w-[200px]">
                    {draft.items.length > 0
                      ? `${draft.items[0].material_name} (${draft.items[0].specification}) · ${draft.items[0].quantity}${draft.items[0].unit}`
                      : '暂无物料'}
                    {draft.items.length > 1 ? ` 等共${draft.items.length}项` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[#F8FAFC]">
                  <span className="text-hig-gray-500">总金额</span>
                  <span className="font-bold text-[#0071E3] font-mono">
                    ¥{draft.total_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (含税)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 浮窗底部操作区 */}
          <div className="p-3 border-t border-[#E2E8F0] bg-white flex flex-col gap-2 flex-shrink-0">
            {/* 输入框容器 */}
            <div className="h-10 px-2.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder={
                  quota.is_over_quota && !draft.special_approval_reason
                    ? '补充输入特批申报理由 (不少于10字)...'
                    : '输入口语化提单指令或合同号...'
                }
                className="flex-1 bg-transparent text-xs text-hig-gray-900 placeholder:text-hig-gray-400 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={isProcessing || !inputText.trim()}
                className="w-7 h-7 rounded-hig-sm bg-[#0071E3] hover:bg-[#0071E3]/90 disabled:opacity-40 text-white flex items-center justify-center transition"
                title="发送解析"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* 主操作按钮行 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={isProcessing}
                className="w-24 h-8 rounded-hig bg-[#F1F5F9] hover:bg-[#E2E8F0] text-hig-gray-700 text-xs font-semibold flex items-center justify-center transition"
              >
                暂存草稿
              </button>

              {quota.is_over_quota ? (
                <button
                  onClick={handleSubmitSpecial}
                  disabled={isProcessing}
                  className="flex-1 h-8 rounded-hig bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-hig-sm transition"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>提交超额特批申请</span>
                </button>
              ) : (
                <button
                  onClick={handleSubmitNormal}
                  disabled={isProcessing}
                  className="flex-1 h-8 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-hig-sm transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>一键正式提单</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 56px 常驻悬浮球 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-[#0071E3] text-white shadow-hig-lg hover:shadow-hig-float hover:scale-105 active:scale-95 flex items-center justify-center transition-all duration-200 relative group cursor-pointer"
        title="点击展开智能提单快捷助手"
      >
        <Sparkles className="w-6 h-6 transition-transform group-hover:rotate-12" />
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#E11D48] text-white text-[10px] font-bold ring-2 ring-white">
          AI
        </span>
        <span className="sr-only">智能提单入口</span>
      </button>
    </div>
  );
};
