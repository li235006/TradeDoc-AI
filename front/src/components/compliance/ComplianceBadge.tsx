import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';

export type ComplianceStatusType =
  | 'COMPLIANT'
  | 'WARNING'
  | 'BLOCKED'
  | 'OVER_QUOTA'
  | 'EXPIRED'
  | 'NORMAL';

interface ComplianceBadgeProps {
  status: ComplianceStatusType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({
  status,
  label,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'COMPLIANT':
      case 'NORMAL':
        return {
          defaultLabel: '合规通过',
          icon: CheckCircle2,
          bg: 'bg-[#DCFCE7]',
          text: 'text-[#16A34A]',
          border: 'border-[#BBF7D0]',
        };
      case 'WARNING':
        return {
          defaultLabel: '价格预警',
          icon: AlertTriangle,
          bg: 'bg-[#FEF9C3]',
          text: 'text-[#854D0E]',
          border: 'border-[#FEF08A]',
        };
      case 'OVER_QUOTA':
        return {
          defaultLabel: '超额需特批',
          icon: ShieldAlert,
          bg: 'bg-[#FFF1F2]',
          text: 'text-[#E11D48]',
          border: 'border-[#FECDD3]',
        };
      case 'EXPIRED':
      case 'BLOCKED':
        return {
          defaultLabel: '阻断拦截',
          icon: XCircle,
          bg: 'bg-[#FEE2E2]',
          text: 'text-[#991B1B]',
          border: 'border-[#FCA5A5]',
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;
  const displayLabel = label || config.defaultLabel;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-[11px] px-2 py-0.5 gap-1.5',
    lg: 'text-xs px-2.5 py-1 gap-1.5',
  }[size];

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className} transition-colors`}
    >
      {showIcon && <Icon className={`${iconSizes} flex-shrink-0`} />}
      <span>{displayLabel}</span>
    </span>
  );
};
