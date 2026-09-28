import React, { useState } from 'react';
import { CheckCircle2, HelpCircle, AlertCircle, Sparkles, Check, ChevronDown, Edit3 } from 'lucide-react';

interface MaterialCandidate {
  code: string;
  name: string;
  spec: string;
  similarity: number;
}

interface MaterialAlignmentBadgeProps {
  status?: 'ALIGNED' | 'CONFIRM' | 'UNMATCHED';
  confidence?: number;
  originalText?: string;
  standardName?: string;
  standardCode?: string;
  onAlignChange?: (newCode: string, newName: string) => void;
  className?: string;
}

// 模拟标准候选主档供人工校准纠错
const CANDIDATES: MaterialCandidate[] = [
  { code: 'STL-RB-400E-20', name: '热轧带肋钢筋', spec: 'HRB400E Φ20mm', similarity: 0.96 },
  { code: 'STL-PL-Q235-10', name: '普碳钢板', spec: 'Q235B 10*1500*6000', similarity: 0.88 },
  { code: 'PIP-SM-20G-57', name: '无缝钢管', spec: '20G Φ57*3.5', similarity: 0.75 },
  { code: 'CEM-PC-425', name: '普通硅酸盐水泥', spec: 'P.O 42.5 散装', similarity: 0.94 },
];

export const MaterialAlignmentBadge: React.FC<MaterialAlignmentBadgeProps> = ({
  status = 'ALIGNED',
  confidence = 0.95,
  originalText = '',
  standardName = '',
  standardCode = '',
  onAlignChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'ALIGNED':
        return {
          bg: 'bg-[#DCFCE7]',
          text: 'text-[#16A34A]',
          border: 'border-[#BBF7D0]',
          icon: CheckCircle2,
          label: `已规范对齐 (${Math.round(confidence * 100)}%)`,
        };
      case 'CONFIRM':
        return {
          bg: 'bg-[#FEF9C3]',
          text: 'text-[#854D0E]',
          border: 'border-[#FEF08A]',
          icon: HelpCircle,
          label: `建议核对 (${Math.round(confidence * 100)}%)`,
        };
      case 'UNMATCHED':
      default:
        return {
          bg: 'bg-[#FEE2E2]',
          text: 'text-[#991B1B]',
          border: 'border-[#FECDD3]',
          icon: AlertCircle,
          label: '未自动对齐',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleSelectCandidate = (c: MaterialCandidate) => {
    if (onAlignChange) {
      onAlignChange(c.code, c.name);
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block select-none ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.bg} ${config.text} ${config.border} hover:opacity-90 active:scale-95 transition`}
        title="点击查看标准品名对齐分析或手动校准"
      >
        <Icon className="w-3 h-3 flex-shrink-0" />
        <span>{config.label}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {/* 点击弹出的对齐详情与手动校准弹层 */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-hig-lg shadow-hig-float border border-[#E5E5EA] p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] text-xs">
              <span className="font-bold text-[#0F172A] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>语义对齐分析</span>
              </span>
              <span className="text-[10px] text-[#64748B]">置信度 {(confidence * 100).toFixed(1)}%</span>
            </div>

            <div className="py-2 text-[11px] space-y-1 text-[#475569]">
              {originalText && (
                <div>
                  <span className="text-[#94A3B8]">原始提取品名：</span>
                  <span className="font-medium text-[#0F172A]">{originalText}</span>
                </div>
              )}
              {standardCode && (
                <div>
                  <span className="text-[#94A3B8]">标准物料编码：</span>
                  <span className="font-mono text-[#0071E3] font-semibold">{standardCode}</span>
                </div>
              )}
              {standardName && (
                <div>
                  <span className="text-[#94A3B8]">规范标准品名：</span>
                  <span className="font-medium text-[#0F172A]">{standardName}</span>
                </div>
              )}
            </div>

            {/* 手动对齐候选库 */}
            <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5">
              <div className="text-[10px] text-[#64748B] flex items-center justify-between">
                <span>或手动选用主档品名：</span>
                <Edit3 className="w-3 h-3" />
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {CANDIDATES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCandidate(c)}
                    className="w-full text-left p-1.5 rounded-hig-sm hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] flex items-center justify-between transition text-xs"
                  >
                    <div>
                      <div className="font-medium text-[#0F172A] text-[11px]">{c.name}</div>
                      <div className="text-[9px] font-mono text-[#64748B]">{c.code} · {c.spec}</div>
                    </div>
                    {c.code === standardCode ? (
                      <Check className="w-3 h-3 text-[#16A34A]" />
                    ) : (
                      <span className="text-[9px] text-[#64748B]">{Math.round(c.similarity * 100)}%</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
