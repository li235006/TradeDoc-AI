import React, { useState, useEffect } from 'react';
import { Sparkles, ShieldAlert } from 'lucide-react';

interface SpecialApprovalPromptProps {
  isOverQuota: boolean;
  overAmount?: number;
  contractNo?: string;
  reason: string;
  onReasonChange: (reason: string, isValid: boolean) => void;
  className?: string;
}

const TEMPLATE_REASONS = [
  '现场主体抢工期急需追加物资，已报备商务部补签增补协议',
  '施工设计方案局部变更增加用量，监理已签署工程变更单',
  '因道路临时管制提前批量备料，项目经理已书面确认',
];

export const SpecialApprovalPrompt: React.FC<SpecialApprovalPromptProps> = ({
  isOverQuota,
  overAmount = 0,
  contractNo = '',
  reason,
  onReasonChange,
  className = '',
}) => {
  const [confirmed, setConfirmed] = useState(false);

  // 严格字数统计（去除首尾空白）
  const trimmedLength = reason.trim().length;
  const isLengthValid = trimmedLength >= 10;
  const isValid = isLengthValid && confirmed;

  useEffect(() => {
    onReasonChange(reason, isValid);
  }, [confirmed, reason]);

  if (!isOverQuota) {
    return null;
  }

  const handleSelectTemplate = (template: string) => {
    onReasonChange(template, template.trim().length >= 10 && confirmed);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onReasonChange(val, val.trim().length >= 10 && confirmed);
  };

  return (
    <div
      className={`rounded-hig-xl border border-[#FECDD3] bg-[#FFF1F2]/80 p-4 space-y-3 shadow-hig-sm transition-all select-none ${className}`}
    >
      {/* 警告指示头 */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#FFE4E6] flex items-center justify-center text-[#E11D48] flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#991B1B]">合同履约超额预警 · 必须追加特批说明</h4>
            {overAmount > 0 && (
              <span className="text-[11px] font-bold text-[#E11D48] bg-white px-2 py-0.5 rounded-full border border-[#FECDD3]">
                超额差额 ¥{overAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9F1239] mt-0.5 leading-relaxed">
            关联合同 <span className="font-mono font-semibold">{contractNo || '当前合同'}</span>{' '}
            剩余可用配额不足以覆盖本次提单总额，禁止常规生效，需转入超额特批流程由业务主管审批。
          </p>
        </div>
      </div>

      {/* 快捷推荐理由模板 */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center gap-1 text-[11px] text-[#9F1239] font-medium">
          <Sparkles className="w-3 h-3 text-[#E11D48]" />
          <span>常用合规特批理由参考（点击自动填入）：</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_REASONS.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectTemplate(tpl)}
              className="text-left text-[11px] px-2.5 py-1 rounded-hig bg-white hover:bg-[#FFE4E6] text-[#881337] border border-[#FECDD3] transition"
            >
              {tpl}
            </button>
          ))}
        </div>
      </div>

      {/* 特批理由文本录入框 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <label className="font-bold text-[#881337]">追加特批理由说明（必填，不少于 10 字）</label>
          <span
            className={`font-semibold ${
              isLengthValid ? 'text-[#16A34A]' : 'text-[#E11D48]'
            }`}
          >
            {trimmedLength} / 最少 10 字
          </span>
        </div>
        <textarea
          value={reason}
          onChange={handleTextChange}
          rows={3}
          placeholder="请详述现场追加采购原因、工程进度节点及增补协议报备进展（例如：经现场项目经理确认抢工期追加钢材...）"
          className="w-full p-2.5 bg-white border border-[#FECDD3] rounded-hig text-xs text-[#0F172A] placeholder:text-[#FDA4AF] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/30 transition"
        />
        {!isLengthValid && trimmedLength > 0 && (
          <p className="text-[10px] text-[#E11D48]">特批说明字数不足，还需录入 {10 - trimmedLength} 个字符</p>
        )}
      </div>

      {/* 经办人核验承诺复选框 */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#FECDD3]/60">
        <input
          id="confirm-quota-check"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            const isChecked = e.target.checked;
            setConfirmed(isChecked);
            onReasonChange(reason, isLengthValid && isChecked);
          }}
          className="w-3.5 h-3.5 rounded text-[#E11D48] focus:ring-[#E11D48]/30 border-[#FECDD3]"
        />
        <label htmlFor="confirm-quota-check" className="text-[11px] text-[#881337] cursor-pointer">
          经办人承诺：已现场核实工程进度急需及商务增补报备，提交真实有效特批申请
        </label>
      </div>
    </div>
  );
};
