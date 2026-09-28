import React, { useState } from 'react';
import { MessageSquare, Camera } from 'lucide-react';
import { useTradeStore } from '../../stores/useTradeStore';
import { ComplianceBadge } from '../../components/compliance/ComplianceBadge';
import { ChatPanel } from '../../components/chat/ChatPanel';
import { DocumentViewer } from '../../components/document/DocumentViewer';
import { OrderForm } from '../../components/draft/OrderForm';

export const WorkbenchView: React.FC = () => {
  const { draft, quota } = useTradeStore();
  const [activeChannel, setActiveChannel] = useState<'chat' | 'ocr'>('chat');

  return (
    <div className="h-full flex flex-col gap-6 select-none">
      {/* 顶部指标看板 Quota Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-shrink-0">
        <div className="bg-white rounded-hig-lg p-4 border border-black/[0.06] shadow-hig-sm">
          <div className="text-[12px] font-medium text-hig-gray-500">当前主合同</div>
          <div className="text-base font-semibold text-hig-gray-900 mt-1">
            {draft.contract_no || '未指定关联合同'}
          </div>
          <div className="text-[11px] text-hig-gray-500 mt-1 truncate">
            {draft.counterparty_name || '待智能解析填入'}
          </div>
        </div>

        <div className="bg-white rounded-hig-lg p-4 border border-black/[0.06] shadow-hig-sm">
          <div className="text-[12px] font-medium text-hig-gray-500">合同约定总额</div>
          <div className="text-base font-semibold text-hig-gray-900 mt-1">
            ¥{quota.contract_total_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-hig-gray-500 mt-1">
            已下单 {quota.accumulated_order_count} 笔
          </div>
        </div>

        <div className="bg-white rounded-hig-lg p-4 border border-black/[0.06] shadow-hig-sm">
          <div className="text-[12px] font-medium text-hig-gray-500">剩余可用配额</div>
          <div className="text-base font-semibold text-hig-blue mt-1">
            ¥{quota.remaining_quota_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-hig-gray-500 mt-1">
            已用额度 ¥{quota.accumulated_order_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white rounded-hig-lg p-4 border border-black/[0.06] shadow-hig-sm">
          <div className="text-[12px] font-medium text-hig-gray-500">本次合规诊断</div>
          <div className="mt-1">
            {quota.is_over_quota ? (
              <ComplianceBadge status="OVER_QUOTA" label="超额需特批" />
            ) : (
              <ComplianceBadge status="COMPLIANT" label="额度充足 合规" />
            )}
          </div>
          <div className="text-[11px] text-hig-gray-500 mt-1">
            {quota.is_over_quota ? `超额差额 ¥${quota.over_amount.toFixed(2)}` : '可直接生效提交'}
          </div>
        </div>
      </div>

      {/* 主体工作区：双模态左右联动 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* 左栏：多模态智能输入交互区 (5 份) */}
        <div className="lg:col-span-5 flex flex-col bg-white rounded-hig-xl border border-black/[0.06] shadow-hig-sm overflow-hidden">
          {/* 通道切换 Tab */}
          <div className="p-3 border-b border-black/[0.06] flex items-center justify-between bg-hig-gray-50/50">
            <div className="flex items-center gap-1 bg-black/[0.04] p-1 rounded-hig">
              <button
                onClick={() => setActiveChannel('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-hig-sm text-xs font-semibold transition ${
                  activeChannel === 'chat'
                    ? 'bg-white text-hig-gray-900 shadow-hig-sm'
                    : 'text-hig-gray-600 hover:text-hig-gray-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-hig-blue" />
                <span>自然语言提单</span>
              </button>
              <button
                onClick={() => setActiveChannel('ocr')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-hig-sm text-xs font-semibold transition ${
                  activeChannel === 'ocr'
                    ? 'bg-white text-hig-gray-900 shadow-hig-sm'
                    : 'text-hig-gray-600 hover:text-hig-gray-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-hig-purple" />
                <span>单据识别预览</span>
              </button>
            </div>
            <span className="text-[11px] text-hig-gray-500 font-medium">双模态通道</span>
          </div>

          {/* 交互工作流容器 */}
          <div className="flex-1 min-h-0">
            {activeChannel === 'chat' ? <ChatPanel /> : <DocumentViewer />}
          </div>
        </div>

        {/* 右栏：提单草稿核对与编审区 (7 份) */}
        <div className="lg:col-span-7 flex flex-col min-h-0">
          <OrderForm />
        </div>
      </div>
    </div>
  );
};
export default WorkbenchView;
