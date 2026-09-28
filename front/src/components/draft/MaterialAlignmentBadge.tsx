import React, { useState, useEffect } from 'react';
import { CheckCircle2, HelpCircle, AlertCircle, Sparkles, Check, ChevronDown, Edit3 } from 'lucide-react';
import { apiClient } from '../../services/api';
import { ApiResponse } from '../../types';

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
  const [candidates, setCandidates] = useState<MaterialCandidate[]>([]);

  useEffect(() => {
    // 从主数据加载真实物料候选
    apiClient
      .get<ApiResponse<any[]>>('/master/materials')
      .then((res) => {
        if (res.data?.data) {
          setCandidates(
            res.data.data.map((m) => ({
              code: m.material_code,
              name: m.material_name,
              spec: m.specification || '',
              similarity: 0.95,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

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
          text: 'text-[#DC2626]',
          border: 'border-[#FECACA]',
          icon: AlertCircle,
          label: `未对齐 (${Math.round(confidence * 100)}%)`,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleSelectCandidate = (candidate: MaterialCandidate) => {
    if (onAlignChange) {
      onAlignChange(candidate.code, candidate.name);
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
            {candidates.length > 0 && (
              <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5">
                <div className="text-[10px] text-[#64748B] flex items-center justify-between">
                  <span>或手动选用主档品名：</span>
                  <Edit3 className="w-3 h-3" />
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {candidates.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleSelectCandidate(c)}
                      className="w-full text-left p-1.5 rounded-hig-sm hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] flex items-center justify-between transition text-xs"
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium text-[#0F172A]">{c.name}</div>
                        <div className="text-[10px] text-[#64748B] font-mono">{c.code}</div>
                      </div>
                      {standardCode === c.code && <Check className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
