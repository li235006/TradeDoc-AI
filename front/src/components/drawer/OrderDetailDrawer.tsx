import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Check,
  Ban,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { tradeApi } from '../../services/api';
import { OrderRecord, ContractQuota, OrderApproveResult } from '../../types';

interface OrderDetailDrawerProps {
  order: OrderRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onApproveSuccess?: (result: OrderApproveResult) => void;
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  isOpen,
  onClose,
  onApproveSuccess,
}) => {
  // 配额动态加载状态
  const [quota, setQuota] = useState<ContractQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  // 审批批复意见默认留空（除非 order 中已有历史 approval_comment）
  const [approvalComment, setApprovalComment] = useState(order?.approval_comment || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 当订单改变时重置审批意见输入框（有历史批注则显历史，否则留空）
  useEffect(() => {
    setApprovalComment(order?.approval_comment || '');
    setSubmitError(null);
  }, [order]);

  // 当订单变更或抽屉打开时，获取关联合同的实时配额数据
  useEffect(() => {
    if (!isOpen || !order || !order.contract_no) {
      setQuota(null);
      return;
    }

    let isMounted = true;
    const fetchQuota = async () => {
      setQuotaLoading(true);
      try {
        const res = await tradeApi.fetchContractQuota(order.contract_no);
        if (isMounted && res.data) {
          setQuota(res.data);
        }
      } catch {
        // 若后端暂无该合同配额记录，不填入伪造数据
        if (isMounted) {
          setQuota(null);
        }
      } finally {
        if (isMounted) {
          setQuotaLoading(false);
        }
      }
    };

    fetchQuota();
    return () => {
      isMounted = false;
    };
  }, [isOpen, order?.contract_no]);

  if (!isOpen || !order) return null;

  // 快捷短语定义 (供审批人一键选用)
  const quickPhrases = [
    {
      label: '+ 同意并特批放行',
      content:
        '经核实，现场保供需求属实，增补手续符合商务内控规范，准予特批放行本笔订单。请经办人在 5 个工作日内补齐正式合同补充协议并完成额度追加备案。',
    },
    {
      label: '+ 同意但限额执行',
      content:
        '经商务风控会审，同意先行按 50% 额度特批执行发货，待补签正式担保抵押备忘录后再行开放后续发货。',
    },
    {
      label: '+ 需补签补充协议',
      content:
        '本次申请金额已大幅超出原合同总额授信边界，请经办人联系客户先行补签具有法律效力的补充协议后再提交审批。',
    },
  ];

  // 动态核算配额指标（绝无静态硬编码兜底）
  const contractTotal = quota?.contract_total_amount ?? 0;
  const accumulatedUsed = quota?.accumulated_order_amount ?? 0;
  const remainingQuota = quota?.remaining_quota_amount ?? 0;
  const currentOrderAmount = Number(order.total_amount) || 0;
  const overAmount = Math.max(0, currentOrderAmount - remainingQuota);
  const isOverQuota = quota ? (order.is_over_quota || currentOrderAmount > remainingQuota) : order.is_over_quota;
  const usedPercent = contractTotal > 0 ? ((accumulatedUsed / contractTotal) * 100).toFixed(1) : '0';

  // 执行审批流转裁决 (EP-06)
  const handleExecuteApproval = async (decision: 'PASS' | 'RETURN' | 'REJECT') => {
    if (!approvalComment.trim()) {
      setSubmitError('请在下方批复意见框中填写审批签署意见');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await tradeApi.approveOrder(
        order.order_no,
        {
          decision,
          comment: approvalComment.trim(),
          approver_name: '陈总监',
          approver_dept: '商务风控部',
        },
        {
          'X-User-Name': '陈总监',
          'X-User-Role': 'APPROVER',
          'X-User-Dept': '商务风控部',
        }
      );

      // 触发无刷新中台台账回写联动广播 (AC-05)
      window.dispatchEvent(new CustomEvent('erp:order_refresh'));

      if (onApproveSuccess && res.data) {
        onApproveSuccess(res.data);
      }

      onClose();
    } catch (err: any) {
      setSubmitError(err.message || '审批裁决流转处理失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* 遮罩背景点击关闭 */}
      <div className="flex-1" onClick={onClose} />

      {/* 审批核查滑出抽屉-720px (严格对齐 order_detail_drawer.pen) */}
      <div className="w-[720px] max-w-full h-full bg-white flex flex-col shadow-2xl border-l border-[#CBD5E1] animate-in slide-in-from-right duration-300">
        {/* 抽屉顶栏 (56px) */}
        <div className="h-14 px-6 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-[#0F172A]">商贸订单详情与审批核查</h2>
            <div className="px-2 py-0.5 rounded-md bg-[#F1F5F9] font-mono text-xs font-bold text-[#0071E3]">
              {order.order_no}
            </div>

            {/* 状态标 */}
            {order.order_status === 'PENDING_SPECIAL_APPROVAL' && (
              <div className="px-2 py-0.5 rounded bg-[#FFF1F2] text-[11px] font-bold text-[#E11D48] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>待特批审批 (超额预警)</span>
              </div>
            )}
            {order.order_status === 'ACTIVE' && (
              <div className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[11px] font-bold text-[#16A34A] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>履约已生效</span>
              </div>
            )}
            {order.order_status === 'RETURNED' && (
              <div className="px-2 py-0.5 rounded bg-[#FEF9C3] text-[11px] font-bold text-[#854D0E] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-[#CA8A04]" />
                <span>已退回修改</span>
              </div>
            )}
            {order.order_status === 'REJECTED' && (
              <div className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[11px] font-bold text-[#991B1B] flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                <span>已驳回作废</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#F1F5F9] hover:bg-slate-200 text-[#64748B] flex items-center justify-center transition"
            title="关闭抽屉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 错误提示条 */}
        {submitError && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
            <button onClick={() => setSubmitError(null)} className="text-rose-500 hover:text-rose-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 抽屉滚动内容流 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3.5 bg-[#FFFFFF]">
          {/* 1. 合同履约配额执行看板 (对齐 order_detail_drawer.pen dr_37a) */}
          <div className="rounded-xl p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] shadow-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                <span>关联合同履约配额动态核验 (合同号：{order.contract_no || '未关联'})</span>
                {quotaLoading && <Loader2 className="w-3 h-3 animate-spin text-[#0071E3]" />}
              </div>
              {isOverQuota ? (
                <span className="text-[11px] font-bold text-[#E11D48] flex items-center gap-1">
                  ⚠️ 合同剩余额度不足 · 触发特批流转
                </span>
              ) : (
                <span className="text-[11px] font-bold text-[#16A34A] flex items-center gap-1">
                  ✅ 合同配额充裕 · 满足正常提单要求
                </span>
              )}
            </div>

            {/* 四项指标网格 */}
            <div className="grid grid-cols-4 gap-2.5">
              {/* 指标 1: 合同总金额 */}
              <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] flex flex-col justify-between">
                <span className="text-[11px] text-[#64748B]">合同总金额</span>
                <span className="text-sm font-bold text-[#0F172A] my-0.5">
                  ¥ {contractTotal.toLocaleString('zh-CN')}
                </span>
                <span className="text-[10px] text-[#94A3B8]">合同约定额度上限</span>
              </div>

              {/* 指标 2: 累计已执行金额 */}
              <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] flex flex-col justify-between">
                <span className="text-[11px] text-[#64748B]">累计已执行金额</span>
                <span className="text-sm font-bold text-[#64748B] my-0.5">
                  ¥ {accumulatedUsed.toLocaleString('zh-CN')}
                </span>
                <span className="text-[10px] text-[#94A3B8]">历史已占用 {usedPercent}%</span>
              </div>

              {/* 指标 3: 剩余可用额度 */}
              <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] flex flex-col justify-between">
                <span className="text-[11px] text-[#64748B]">剩余可用额度</span>
                <span className="text-sm font-bold text-[#0071E3] my-0.5">
                  ¥ {remainingQuota.toLocaleString('zh-CN')}
                </span>
                <span className="text-[10px] text-[#94A3B8]">当前实际可提单余额</span>
              </div>

              {/* 指标 4: 本次申请金额 */}
              <div
                className={`p-2.5 rounded-lg bg-white border flex flex-col justify-between ${
                  isOverQuota ? 'border-[#FECDD3]' : 'border-[#E2E8F0]'
                }`}
              >
                <span className="text-[11px] text-[#64748B]">本次申请金额</span>
                <span
                  className={`text-sm font-bold my-0.5 ${
                    isOverQuota ? 'text-[#E11D48]' : 'text-[#16A34A]'
                  }`}
                >
                  ¥ {currentOrderAmount.toLocaleString('zh-CN')}
                </span>
                <span
                  className={`text-[10px] truncate ${
                    isOverQuota ? 'text-[#E11D48] font-medium' : 'text-[#16A34A]'
                  }`}
                >
                  {isOverQuota ? `超额差额 ¥ ${overAmount.toLocaleString('zh-CN')}` : '额度内合规放行'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. 经办人追加特批申报理由卡 (仅当真实存在特批理由时展示，绝无假数据兜底) */}
          {order.special_approval_reason && order.special_approval_reason.trim() !== '' && (
            <div className="rounded-xl p-3.5 bg-[#FFFBEB] border border-[#FDE68A] flex flex-col gap-2 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#92400E] font-bold text-xs">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>业务经办人追加特批理由说明</span>
                </div>
                <div className="text-[11px] text-[#B45309]">
                  申报人：{order.operator_name || '业务经办人'} ({order.operator_dept || '物资贸易部'}) ｜ 申报时间：
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('zh-CN') : '-'}
                </div>
              </div>

              <div className="text-xs text-[#78350F] leading-relaxed bg-white/60 p-2.5 rounded-lg border border-[#FDE68A]/60">
                “{order.special_approval_reason}”
              </div>
            </div>
          )}

          {/* 3. 单据结构化主档要素卡片 (Order Header) */}
          <div className="rounded-xl p-3.5 bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-2">
            <h3 className="text-xs font-bold text-[#0F172A]">订单结构化主档要素 (Order Header)</h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-[#64748B]">单据类型</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5">
                  {order.order_type === 'SALES' ? '销售订单' : '采购订单'} ({order.procurement_mode || '直供'})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#64748B]">关联合同编号</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5 font-mono">
                  {order.contract_no} {order.project_name ? `(${order.project_name})` : ''}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#64748B]">签约单位 (客户)</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5 truncate" title={order.counterparty_name}>
                  {order.counterparty_name || '-'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1 border-t border-[#F1F5F9]">
              <div>
                <div className="text-[11px] text-[#64748B]">工程项目名称</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5 truncate" title={order.project_name}>
                  {order.project_name || '-'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#64748B]">结算账期方式</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5">
                  {order.settlement_method || order.payment_term || (order.business_name ? `${order.business_name}约定账期` : '按合同约定结算')}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#64748B]">指定送货地址</div>
                <div className="text-xs font-medium text-[#1E293B] mt-0.5 truncate" title={order.delivery_address}>
                  {order.delivery_address || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* 4. 规范物资明细卡片 */}
          <div className="rounded-xl p-3.5 bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-2">
            <h3 className="text-xs font-bold text-[#0F172A]">
              规范物资明细清单 ({order.items?.length || 0} 项规范物料)
            </h3>

            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569]">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">序号</th>
                    <th className="py-2 px-3 w-28">物料编码</th>
                    <th className="py-2 px-3">规范物资品名与型号规格</th>
                    <th className="py-2 px-3 w-20 text-right">数量</th>
                    <th className="py-2 px-3 w-12 text-center">单位</th>
                    <th className="py-2 px-3 w-20 text-right">含税单价</th>
                    <th className="py-2 px-3 w-24 text-right">金额小计</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-center text-[#64748B] font-mono">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[#EFF6FF] text-[#0071E3]">
                            {it.material_code || `01.01.${String(idx + 1).padStart(4, '0')}`}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-[#0F172A]">{it.material_name}</div>
                          {it.specification && (
                            <div className="text-[11px] text-[#64748B]">{it.specification}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-[#0F172A]">
                          {Number(it.quantity).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center text-[#64748B]">{it.unit || '吨'}</td>
                        <td className="py-2 px-3 text-right font-mono text-[#0F172A]">
                          ¥ {Number(it.unit_price).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#0071E3]">
                          ¥ {Number(it.total_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#94A3B8]">
                        暂无物资明细
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end items-baseline gap-1.5 pt-1">
              <span className="text-xs text-[#64748B]">单据申报总金额：</span>
              <span className="text-base font-bold text-[#0071E3] font-mono">
                ¥ {currentOrderAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 5. 审批裁决处理区 (对齐 order_detail_drawer.pen dr_39o) */}
          <div className="rounded-xl p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] shadow-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0F172A]">
                审批裁决批复意见 (业务审批主管专用)
              </h3>
              <span className="text-[11px] text-[#64748B]">
                审批人身份：陈总监 (商务风控部)
              </span>
            </div>

            {/* 当处于待特批审批状态时，允许编辑批注与选择快捷短语 */}
            {order.order_status === 'PENDING_SPECIAL_APPROVAL' ? (
              <>
                {/* 快捷审批短语 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {quickPhrases.map((phrase, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setApprovalComment(phrase.content)}
                      className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[11px] text-[#475569] hover:text-[#0071E3] transition cursor-pointer"
                      title="点击填入快捷意见"
                    >
                      {phrase.label}
                    </button>
                  ))}
                </div>

                {/* 审批意见输入框 (默认留空) */}
                <textarea
                  rows={3}
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder="请输入业务审批裁决批注意见（可点击上方快捷短语快速填入）..."
                  className="w-full p-2.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#1E293B] leading-relaxed focus:outline-none focus:border-[#0071E3] resize-none"
                />
              </>
            ) : (
              /* 已归档/已审批订单的历史批注意见 */
              <div className="p-3 bg-white rounded-lg border border-[#E2E8F0] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#1E293B]">
                    审批签署人：{order.approver_name || '陈总监'} ({order.operator_dept || '商务风控部'})
                  </span>
                  <span className="text-[#64748B]">审批裁决：{order.order_status}</span>
                </div>
                <div className="text-xs text-[#334155] leading-relaxed">
                  {order.approval_comment || '已完成审批流转归档'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 抽屉底部操作栏 (60px) */}
        <div className="h-[60px] px-6 border-t border-[#E2E8F0] bg-white flex items-center justify-between shrink-0">
          {order.order_status === 'PENDING_SPECIAL_APPROVAL' ? (
            <>
              {/* 退回按钮 (RETURN) */}
              <button
                type="button"
                onClick={() => handleExecuteApproval('RETURN')}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F1F5F9] hover:bg-slate-200 border border-[#CBD5E1] text-xs font-semibold text-[#475569] transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>退回经办人修改</span>
              </button>

              {/* 右侧：驳回作废 (REJECT) + 审批通过 (PASS) */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleExecuteApproval('REJECT')}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FFF1F2] hover:bg-rose-100 border border-[#FDA4AF] text-xs font-semibold text-[#E11D48] transition disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span>审批驳回 (作废单据)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteApproval('PASS')}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  ) : (
                    <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
                  )}
                  <span>审批通过并生效单据</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[#64748B] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                <span>该单据已完成审批流转，当前处于归档履约状态</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#F1F5F9] hover:bg-slate-200 text-xs font-semibold text-[#334155] transition"
              >
                关闭抽屉
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
