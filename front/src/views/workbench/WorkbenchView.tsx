import React, { useState } from 'react';
import {
  MessageSquare,
  Camera,
  FileCheck
} from 'lucide-react';
import { useTradeStore } from '../../stores/useTradeStore';
import { ComplianceBoard } from '../../components/compliance/ComplianceBoard';
import { ComplianceBadge } from '../../components/compliance/ComplianceBadge';
import { SpecialApprovalPrompt } from '../../components/compliance/SpecialApprovalPrompt';
import { ChatPanel } from '../../components/chat/ChatPanel';
import { DocumentViewer } from '../../components/document/DocumentViewer';
import { MaterialAlignmentBadge } from '../../components/draft/MaterialAlignmentBadge';

export const WorkbenchView: React.FC = () => {
  const { draft, quota, setDraft, updateDraftItem } = useTradeStore();
  const [activeChannel, setActiveChannel] = useState<'chat' | 'ocr'>('chat');
  const [isSpecialValid, setIsSpecialValid] = useState(false);

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

      {/* 主体工作区：双栏左右联动 */}
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

        {/* 右栏：提单草稿核对与明细核验区 (7 份) */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-hig-xl border border-black/[0.06] shadow-hig-sm overflow-hidden">
          <div className="p-4 border-b border-black/[0.06] flex items-center justify-between bg-hig-gray-50/50">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-hig-blue" />
              <h2 className="text-xs font-bold text-hig-gray-900">提单草稿核对区 (SSOT)</h2>
            </div>
            <div className="text-xs font-semibold text-hig-gray-900">
              单据总金额：
              <span className="text-sm font-bold text-hig-blue ml-1">
                ¥{draft.total_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 草稿内容与合规看板滚动区 */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {/* 合规状态诊断看板 */}
            <ComplianceBoard draft={draft} quota={quota} />

            {/* 超额特批交互卡片 (仅超额时触发) */}
            {quota.is_over_quota && (
              <SpecialApprovalPrompt
                isOverQuota={quota.is_over_quota}
                overAmount={quota.over_amount}
                contractNo={draft.contract_no}
                reason={draft.special_approval_reason}
                onReasonChange={(reason, valid) => {
                  setDraft({ special_approval_reason: reason });
                  setIsSpecialValid(valid);
                }}
              />
            )}

            {/* 草稿基础信息 */}
            <div className="p-3.5 rounded-hig-lg border border-[#E5E5EA] grid grid-cols-2 md:grid-cols-3 gap-3 bg-[#F8FAFC] text-xs">
              <div>
                <span className="text-hig-gray-500">关联合同号：</span>
                <span className="font-mono font-bold text-[#0071E3] ml-1">{draft.contract_no || '未关联'}</span>
              </div>
              <div>
                <span className="text-hig-gray-500">业务类型：</span>
                <span className="font-medium text-hig-gray-900 ml-1">{draft.business_name}</span>
              </div>
              <div>
                <span className="text-hig-gray-500">交货方式：</span>
                <span className="font-medium text-hig-gray-900 ml-1">{draft.procurement_mode}</span>
              </div>
              <div className="col-span-2">
                <span className="text-hig-gray-500">工程项目：</span>
                <span className="font-medium text-hig-gray-900 ml-1">{draft.project_name || '待填入'}</span>
              </div>
              <div>
                <span className="text-hig-gray-500">经办部门：</span>
                <span className="font-medium text-hig-gray-900 ml-1">{draft.operator_dept}</span>
              </div>
            </div>

            {/* 物资产品明细列表 */}
            <div>
              <div className="text-xs font-semibold text-[#0F172A] mb-2">物资产品明细表</div>
              {draft.items.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-hig-gray-400 text-xs border border-dashed border-[#E2E8F0] rounded-hig">
                  <FileCheck className="w-6 h-6 text-hig-gray-300 mb-1.5" />
                  <span>暂无物资明细，请在左侧解析单据或对话录入</span>
                </div>
              ) : (
                <div className="border border-[#E2E8F0] rounded-hig overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-hig-gray-500 font-medium">
                        <th className="py-2.5 px-3">序号</th>
                        <th className="py-2.5 px-3">标准物料编码</th>
                        <th className="py-2.5 px-3">规范品名与规格</th>
                        <th className="py-2.5 px-3 text-center">规范对齐</th>
                        <th className="py-2.5 px-3 text-right">数量</th>
                        <th className="py-2.5 px-3 text-right">含税单价</th>
                        <th className="py-2.5 px-3 text-right">金额 (元)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {draft.items.map((item, index) => (
                        <tr key={index} className="hover:bg-hig-gray-50">
                          <td className="py-2.5 px-3">{item.item_seq}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#0071E3] font-semibold">
                            {item.material_code}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-hig-gray-900">{item.material_name}</div>
                            <div className="text-[11px] text-hig-gray-500">{item.specification}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <MaterialAlignmentBadge
                              status={item.match_status || 'ALIGNED'}
                              standardCode={item.material_code}
                              standardName={item.material_name}
                              onAlignChange={(newCode, newName) => {
                                updateDraftItem(index, { material_code: newCode, material_name: newName });
                              }}
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right">¥{item.unit_price.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-hig-gray-900">
                            ¥{item.total_amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="p-4 border-t border-black/[0.06] bg-hig-gray-50 flex items-center justify-between">
            <span className="text-xs text-hig-gray-500">经办人：{draft.operator_name}</span>
            <div className="flex items-center gap-2">
              {quota.is_over_quota ? (
                <button
                  disabled={!isSpecialValid}
                  className="px-4 py-2 rounded-hig bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-xs font-semibold shadow-hig-sm active:scale-95 transition"
                >
                  提交超额特批申请
                </button>
              ) : (
                <button className="px-4 py-2 rounded-hig bg-hig-blue text-white text-xs font-semibold shadow-hig-sm hover:bg-hig-blue/90 active:scale-95 transition">
                  一键正式提单
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
