import {
  ShieldCheck,
  TrendingUp,
  Scale,
  Calendar,
  Layers
} from 'lucide-react';
import { ContractQuota, OrderDraft } from '../../types';
import { ComplianceBadge } from './ComplianceBadge';

interface ComplianceBoardProps {
  draft: OrderDraft;
  quota: ContractQuota;
  guidePrice?: number;
  currentUnitPrice?: number;
  className?: string;
}

export const ComplianceBoard: React.FC<ComplianceBoardProps> = ({
  draft,
  quota,
  guidePrice = 4000,
  currentUnitPrice,
  className = '',
}) => {
  // 单据本次申请金额
  const currentAmount = draft.total_amount || 0;
  const contractTotal = quota.contract_total_amount || 0;
  const accumulated = quota.accumulated_order_amount || 0;
  const remaining = quota.remaining_quota_amount || 0;

  // 额度计算
  const isOverQuota = currentAmount > remaining || quota.is_over_quota;
  const overAmount = isOverQuota ? Math.max(currentAmount - remaining, quota.over_amount || 0) : 0;

  // 占用百分比计算
  const historicalRatio = contractTotal > 0 ? Math.min((accumulated / contractTotal) * 100, 100) : 0;
  const currentRatio = contractTotal > 0 ? (currentAmount / contractTotal) * 100 : 0;
  const totalOccupiedRatio = contractTotal > 0 ? ((accumulated + currentAmount) / contractTotal) * 100 : 0;

  // 价格偏离度计算
  const activeUnitPrice = currentUnitPrice || (draft.items?.[0]?.unit_price ?? guidePrice);
  const priceDiff = activeUnitPrice - guidePrice;
  const priceDeviationPercent = guidePrice > 0 ? Number(((priceDiff / guidePrice) * 100).toFixed(1)) : 0;
  const isPriceWarning = priceDeviationPercent > 10;
  const isPriceBlocked = priceDeviationPercent > 25;

  // 诊断规则清单计算
  const checklist = [
    {
      key: 'validity',
      title: '合同法定期限核验',
      desc: draft.contract_no ? '关联合同在法定履行有效期内' : '尚未指定关联履约合同',
      status: draft.contract_no ? ('COMPLIANT' as const) : ('WARNING' as const),
      icon: Calendar,
    },
    {
      key: 'quota',
      title: '履约额度上限核算',
      desc: isOverQuota
        ? `本次申请超出可用额度 ¥${overAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
        : `合同可用配额充裕，剩余 ¥${remaining.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      status: isOverQuota ? ('OVER_QUOTA' as const) : ('COMPLIANT' as const),
      icon: Scale,
    },
    {
      key: 'count',
      title: '提单次数上限核对',
      desc:
        (quota.remaining_order_count ?? 1) > 0
          ? `合同尚有 ${quota.remaining_order_count ?? 2} 笔有效提单额度`
          : '合同提单约定笔数已达上限',
      status: (quota.remaining_order_count ?? 1) > 0 ? ('COMPLIANT' as const) : ('BLOCKED' as const),
      icon: Layers,
    },
    {
      key: 'price',
      title: '物料基准公允单价核验',
      desc: isPriceBlocked
        ? `成交含税单价高于基准指导价 ${priceDeviationPercent}%，存在严重价格偏差`
        : isPriceWarning
        ? `成交单价较基准指导价偏离 +${priceDeviationPercent}%，属于合理浮动预警范围`
        : `成交单价符合基准指导价公允区间 (偏离 ${priceDeviationPercent >= 0 ? '+' : ''}${priceDeviationPercent}%)`,
      status: isPriceBlocked
        ? ('BLOCKED' as const)
        : isPriceWarning
        ? ('WARNING' as const)
        : ('COMPLIANT' as const),
      icon: TrendingUp,
    },
  ];

  return (
    <div className={`bg-white rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm p-4 space-y-4 select-none ${className}`}>
      {/* 顶部标题与整体诊断结论 */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0071E3]" />
          <h3 className="text-xs font-bold text-[#0F172A]">合同履约与合规诊断看板</h3>
        </div>
        <div>
          {isOverQuota ? (
            <ComplianceBadge status="OVER_QUOTA" label="超额需特批" />
          ) : isPriceWarning ? (
            <ComplianceBadge status="WARNING" label="价格偏离预警" />
          ) : (
            <ComplianceBadge status="COMPLIANT" label="合规核验通过" />
          )}
        </div>
      </div>

      {/* 模块一：合同额度占用进度条 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#64748B] font-medium">履约额度占用分析</span>
          <span className="font-bold text-[#0F172A]">
            已占用 {totalOccupiedRatio.toFixed(1)}% / 100%
          </span>
        </div>

        {/* 组合多段进度条 */}
        <div className="w-full h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden flex relative">
          {/* 历史已占用段 (温和蓝) */}
          <div
            style={{ width: `${Math.min(historicalRatio, 100)}%` }}
            className="h-full bg-[#0071E3] transition-all duration-300"
            title={`历史已占用: ¥${accumulated.toLocaleString('zh-CN')}`}
          />
          {/* 本次占用段 (合规为绿，超额为温和红) */}
          <div
            style={{ width: `${Math.min(currentRatio, 100 - historicalRatio)}%` }}
            className={`h-full ${isOverQuota ? 'bg-[#E11D48]' : 'bg-[#16A34A]'} transition-all duration-300`}
            title={`本次提单占用: ¥${currentAmount.toLocaleString('zh-CN')}`}
          />
        </div>

        {/* 进度说明指标条 */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
          <div className="bg-[#F8FAFC] p-2 rounded-hig border border-[#E2E8F0]">
            <div className="text-[#64748B]">合同总额度</div>
            <div className="font-bold text-[#0F172A] mt-0.5">
              ¥{contractTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-[#F8FAFC] p-2 rounded-hig border border-[#E2E8F0]">
            <div className="text-[#64748B]">本次申请金额</div>
            <div className={`font-bold mt-0.5 ${isOverQuota ? 'text-[#E11D48]' : 'text-[#0071E3]'}`}>
              ¥{currentAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-[#F8FAFC] p-2 rounded-hig border border-[#E2E8F0]">
            <div className="text-[#64748B]">{isOverQuota ? '超额差额金额' : '履约剩余可用'}</div>
            <div className={`font-bold mt-0.5 ${isOverQuota ? 'text-[#E11D48]' : 'text-[#16A34A]'}`}>
              ¥{isOverQuota ? overAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : remaining.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* 模块二：物料指导价偏离度指示条 */}
      <div className="space-y-1.5 pt-2 border-t border-[#F1F5F9]">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-[#64748B]" />
            <span className="text-[#64748B] font-medium">基准价格公允度偏离分析</span>
          </div>
          <span
            className={`font-semibold text-[11px] ${
              isPriceBlocked ? 'text-[#991B1B]' : isPriceWarning ? 'text-[#854D0E]' : 'text-[#16A34A]'
            }`}
          >
            {priceDeviationPercent > 0 ? `+${priceDeviationPercent}% 偏离` : `${priceDeviationPercent}% 偏离`}
          </span>
        </div>

        {/* 偏离度刻度尺 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
            <span>-10%</span>
            <span>基准价 (¥{guidePrice.toLocaleString('zh-CN')})</span>
            <span>+10% 预警线</span>
            <span>+25% 阻断线</span>
          </div>
          <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full relative overflow-hidden">
            <div className="absolute left-[30%] w-[40%] h-full bg-[#BBF7D0]" title="公允浮动区间" />
            <div className="absolute left-[70%] w-[15%] h-full bg-[#FEF08A]" title="预警区间" />
            <div className="absolute left-[85%] w-[15%] h-full bg-[#FECDD3]" title="阻断区间" />
            {/* 浮动指示指针 */}
            <div
              className={`absolute top-0 bottom-0 w-1.5 rounded-full shadow-xs ${
                isPriceBlocked ? 'bg-[#E11D48]' : isPriceWarning ? 'bg-[#CA8A04]' : 'bg-[#16A34A]'
              }`}
              style={{
                left: `${Math.min(Math.max(50 + priceDeviationPercent * 2, 0), 98)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#64748B]">
            <span>公允基准：¥{guidePrice.toFixed(2)}</span>
            <span>本次提报单价：¥{activeUnitPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 模块三：合规风险诊断清单 */}
      <div className="space-y-2 pt-2 border-t border-[#F1F5F9]">
        <div className="text-xs font-semibold text-[#0F172A]">合规风控诊断清单 (4项硬规则)</div>
        <div className="space-y-1.5">
          {checklist.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between p-2 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-hig-sm bg-white border border-[#E2E8F0] flex items-center justify-center text-[#475569]">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#0F172A]">{item.title}</div>
                    <div className="text-[11px] text-[#64748B]">{item.desc}</div>
                  </div>
                </div>
                <ComplianceBadge status={item.status} size="sm" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
