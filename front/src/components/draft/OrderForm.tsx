import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCheck,
  Plus,
  Trash2,
  Save,
  Send,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building,
  FileText,
  MapPin,
  User,
  ChevronDown,
  Minimize2
} from 'lucide-react';
import { useTradeStore } from '../../stores/useTradeStore';
import { orderApi } from '../../services/orderApi';
import { apiClient } from '../../services/api';
import { ComplianceBoard } from '../compliance/ComplianceBoard';
import { SpecialApprovalPrompt } from '../compliance/SpecialApprovalPrompt';
import { MaterialAlignmentBadge } from './MaterialAlignmentBadge';
import { OrderItem, ApiResponse } from '../../types';

interface ContractOption {
  contract_no: string;
  contract_name?: string;
  counterparty_name: string;
  project_name: string;
  default_delivery_address?: string;
  contact_person?: string;
  total_amount: number;
  accumulated_amount?: number;
  remaining_amount?: number;
  max_orders?: number;
  max_order_count?: number;
  accumulated_orders?: number;
  accumulated_order_count?: number;
  remaining_orders?: number;
  remaining_order_count?: number;
}

interface MaterialOption {
  material_code: string;
  material_name: string;
  specification: string;
  unit: string;
  standard_price?: number;
  guide_price?: number;
}

export const OrderForm: React.FC = () => {
  const navigate = useNavigate();
  const {
    draft,
    quota,
    setDraft,
    updateDraftItem,
    removeDraftItem,
    addDraftItem,
    resetDraft,
    setQuota,
    setDisplayMode,
  } = useTradeStore();

  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSpecialValid, setIsSpecialValid] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 从真实 API 加载合同与物料主数据字典
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [cRes, mRes] = await Promise.all([
          apiClient.get<ApiResponse<ContractOption[]>>('/master/contracts'),
          apiClient.get<ApiResponse<MaterialOption[]>>('/master/materials'),
        ]);
        if (cRes.data?.data) {
          setContracts(cRes.data.data);
        }
        if (mRes.data?.data) {
          setMaterials(mRes.data.data);
        }
      } catch {
        // 主数据加载容错，不阻断手动编辑
      }
    };
    loadMasterData();
  }, []);

  // 监听并动态核算合同额度与超额诊断
  useEffect(() => {
    if (quota.remaining_quota_amount > 0 || quota.contract_total_amount > 0) {
      const isOver = draft.total_amount > quota.remaining_quota_amount;
      const overAmount = isOver ? Number((draft.total_amount - quota.remaining_quota_amount).toFixed(2)) : 0;
      if (quota.is_over_quota !== isOver || quota.over_amount !== overAmount) {
        setQuota({
          is_over_quota: isOver,
          over_amount: overAmount,
        });
        setDraft({
          is_over_quota: isOver,
        });
      }
    }
  }, [draft.total_amount, quota.remaining_quota_amount]);

  // 选择关联合同 (从真实合同主数据驱动)
  const handleSelectContract = (contractNo: string) => {
    const found = contracts.find((c) => c.contract_no === contractNo);
    if (found) {
      const remainingAmount = Number(
        found.remaining_amount ?? (found.total_amount - (found.accumulated_amount || 0))
      );
      setDraft({
        contract_no: found.contract_no,
        counterparty_name: found.counterparty_name,
        project_name: found.project_name,
        delivery_address: found.default_delivery_address || '',
        contact_person: found.contact_person || '',
      });
      setQuota({
        contract_no: found.contract_no,
        counterparty_name: found.counterparty_name,
        project_name: found.project_name,
        contract_total_amount: found.total_amount,
        accumulated_order_amount: found.accumulated_amount || 0,
        accumulated_order_count: found.accumulated_orders ?? found.accumulated_order_count ?? 0,
        remaining_quota_amount: remainingAmount,
        remaining_order_count: found.remaining_orders ?? found.remaining_order_count ?? 0,
        is_over_quota: draft.total_amount > remainingAmount,
        over_amount:
          draft.total_amount > remainingAmount
            ? Number((draft.total_amount - remainingAmount).toFixed(2))
            : 0,
      });
    }
  };

  // 添加空物料行 (从真实物料主数据选型)
  const handleAddRow = () => {
    const nextSeq = draft.items.length + 1;
    const firstMat = materials.length > 0 ? materials[0] : null;
    const price = Number(firstMat?.standard_price ?? firstMat?.guide_price ?? 3500);

    const newItem: OrderItem = {
      item_seq: nextSeq,
      material_code: firstMat?.material_code || `01.01.${String(nextSeq).padStart(4, '0')}`,
      material_name: firstMat?.material_name || '新物资品名',
      specification: firstMat?.specification || '标准规格型号',
      quantity: 1,
      unit: firstMat?.unit || '吨',
      unit_price: price,
      total_amount: price,
      match_status: 'ALIGNED',
    };
    addDraftItem(newItem);
  };

  // 暂存草稿
  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await orderApi.saveDraft(draft);
      setFeedback({ type: 'success', message: res.message || '草稿已成功暂存至业务数据库' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '暂存失败，请检查网络或后端状态' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 一键正式提单
  const handleSubmitOrder = async () => {
    if (!draft.contract_no) {
      setFeedback({ type: 'error', message: '提单前请先选择或输入关联合同号' });
      return;
    }
    if (draft.items.length === 0) {
      setFeedback({ type: 'error', message: '提单明细不能为空，请添加物资产品' });
      return;
    }
    if (quota.is_over_quota) {
      setFeedback({ type: 'error', message: '当前单据金额已超出合同履约剩余配额，需提交特批申报' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
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
      setFeedback({
        type: 'success',
        message: `正式提单成功！订单编号：${res.data.order_no}，已同步回写ERP系统`,
      });
      setDraft({ order_status: 'ACTIVE', order_no: res.data.order_no });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '正式提单提交异常，请稍后重试' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // 提交超额特批申请
  const handleSubmitSpecialApproval = async () => {
    if (!draft.contract_no) {
      setFeedback({ type: 'error', message: '请先明确关联合同号' });
      return;
    }
    if (!draft.special_approval_reason || draft.special_approval_reason.trim().length < 10) {
      setFeedback({ type: 'error', message: '超额特批申请理由不能少于10个汉字' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
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
      setFeedback({
        type: 'success',
        message: `超额特批申请已提交！单号：${res.data.order_no}，进入业务主管待审流`,
      });
      setDraft({ order_status: 'PENDING_SPECIAL_APPROVAL', order_no: res.data.order_no });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '特批提交失败，请联系系统管理员' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-hig-xl border border-black/[0.06] shadow-hig-sm overflow-hidden">
      {/* 顶栏标题区 */}
      <div className="p-4 border-b border-black/[0.06] flex items-center justify-between bg-hig-gray-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-hig bg-[#0071E3]/10 flex items-center justify-center text-[#0071E3]">
            <FileCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-hig-gray-900">提单草稿核对与编审 (SSOT)</h2>
            <div className="text-[11px] text-hig-gray-500">统一数据源 · 实时合规核验与中台直通</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 缩小为悬浮窗 */}
          <button
            type="button"
            onClick={() => {
              setDisplayMode('floating');
              navigate('/erp');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-hig border border-[#CBD5E1] bg-white hover:bg-slate-50 text-xs font-semibold text-[#0071E3] transition shadow-xs"
            title="缩小为右下角轻量悬浮球，切换至供应链宿主大盘"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>缩小为悬浮窗</span>
          </button>

          {/* 单据类型切换 */}
          <div className="flex items-center bg-black/[0.04] p-0.5 rounded-hig">
            <button
              onClick={() => setDraft({ order_type: 'SALES' })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-hig-sm transition ${
                draft.order_type === 'SALES'
                  ? 'bg-white text-[#0071E3] shadow-hig-sm'
                  : 'text-hig-gray-600 hover:text-hig-gray-900'
              }`}
            >
              销售提单
            </button>
            <button
              onClick={() => setDraft({ order_type: 'PURCHASE' })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-hig-sm transition ${
                draft.order_type === 'PURCHASE'
                  ? 'bg-white text-[#0071E3] shadow-hig-sm'
                  : 'text-hig-gray-600 hover:text-hig-gray-900'
              }`}
            >
              采购提单
            </button>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-hig-gray-500 font-medium">总金额 (含税)</div>
            <div className="text-base font-bold text-[#0071E3] leading-none">
              ¥{draft.total_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* 提示条 */}
      {feedback && (
        <div
          className={`px-4 py-2 text-xs flex items-center gap-2 border-b animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]'
              : 'bg-[#FFF1F2] text-[#E11D48] border-[#FFE4E6]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 核心表单区域 */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* 合规诊断看板 */}
        <ComplianceBoard draft={draft} quota={quota} />

        {/* 超额特批申请卡片 (当超额时显示) */}
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

        {/* 合同主档与基本商务信息 */}
        <div className="p-3.5 bg-[#F8FAFC] rounded-hig-lg border border-[#E5E5EA] space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-hig-gray-900 border-b border-black/[0.04] pb-2">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>合同主档与基本信息</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-hig-gray-500 font-normal">快速关联生效合同：</span>
              <div className="relative">
                <select
                  value={draft.contract_no}
                  onChange={(e) => handleSelectContract(e.target.value)}
                  className="text-xs bg-white border border-[#CBD5E1] rounded-hig px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-[#0071E3] appearance-none"
                >
                  <option value="">-- 选择主数据合同 --</option>
                  {contracts.map((c) => (
                    <option key={c.contract_no} value={c.contract_no}>
                      {c.contract_no} ({c.contract_name || c.project_name || c.counterparty_name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-hig-gray-400 absolute right-1.5 top-2 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">关联合同号</label>
              <input
                type="text"
                value={draft.contract_no}
                onChange={(e) => setDraft({ contract_no: e.target.value })}
                placeholder="例如：2026-WZ-089"
                className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              />
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">
                {draft.order_type === 'SALES' ? '签约客户 (对手方)' : '供货厂商 (对手方)'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={draft.counterparty_name}
                  onChange={(e) => setDraft({ counterparty_name: e.target.value })}
                  placeholder="例如：中建八局第一建设有限公司"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
                />
                <Building className="w-3.5 h-3.5 text-hig-gray-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">对应工程项目</label>
              <input
                type="text"
                value={draft.project_name}
                onChange={(e) => setDraft({ project_name: e.target.value })}
                placeholder="例如：科技城数字经济产业园一期项目"
                className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-hig-gray-500 font-medium mb-1">送达地址 / 交货地点</label>
              <div className="relative">
                <input
                  type="text"
                  value={draft.delivery_address}
                  onChange={(e) => setDraft({ delivery_address: e.target.value })}
                  placeholder="请输入具体工地现场或仓储配送地址"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
                />
                <MapPin className="w-3.5 h-3.5 text-hig-gray-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">现场联系人及电话</label>
              <div className="relative">
                <input
                  type="text"
                  value={draft.contact_person || ''}
                  onChange={(e) => setDraft({ contact_person: e.target.value })}
                  placeholder="姓名与联系电话"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
                />
                <User className="w-3.5 h-3.5 text-hig-gray-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">业务类型</label>
              <select
                value={draft.business_name}
                onChange={(e) => setDraft({ business_name: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              >
                <option value="国内传统贸易">国内传统贸易</option>
                <option value="工程直发配送">工程直发配送</option>
                <option value="自营现货经销">自营现货经销</option>
              </select>
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">交货方式</label>
              <select
                value={draft.procurement_mode}
                onChange={(e) => setDraft({ procurement_mode: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-hig text-hig-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              >
                <option value="直发">直发（直抵工地）</option>
                <option value="库发">库发（仓储中转）</option>
                <option value="自提">自提（客户自运）</option>
              </select>
            </div>

            <div>
              <label className="block text-hig-gray-500 font-medium mb-1">经办人 / 部门</label>
              <div className="px-2.5 py-1.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-hig text-hig-gray-700">
                {draft.operator_name} · {draft.operator_dept}
              </div>
            </div>
          </div>
        </div>

        {/* 物资产品明细表 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-hig-gray-900">物资产品订购明细</span>
              <span className="text-[11px] text-hig-gray-500">共 {draft.items.length} 项</span>
            </div>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1 px-3 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-hig-gray-800 text-xs font-semibold rounded-hig transition"
            >
              <Plus className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>添加物料行</span>
            </button>
          </div>

          {draft.items.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-[#CBD5E1] rounded-hig-lg bg-hig-gray-50/50">
              <FileText className="w-8 h-8 text-hig-gray-300 mx-auto mb-2" />
              <div className="text-xs text-hig-gray-500 font-medium">暂无物资明细</div>
              <div className="text-[11px] text-hig-gray-400 mt-1">
                可通过左侧对话提单或单据扫描提取，或点击上方“添加物料行”手动录入
              </div>
            </div>
          ) : (
            <div className="border border-[#E2E8F0] rounded-hig overflow-x-auto shadow-hig-sm">
              <table className="w-full text-left text-xs border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-hig-gray-600 font-semibold">
                    <th className="py-2.5 px-3 w-12 text-center">序号</th>
                    <th className="py-2.5 px-3 w-32">标准物料编码</th>
                    <th className="py-2.5 px-3 min-w-[140px]">品名与规格型号</th>
                    <th className="py-2.5 px-3 w-36 text-center">规范对齐状态</th>
                    <th className="py-2.5 px-3 w-28 text-right">数量</th>
                    <th className="py-2.5 px-3 w-32 text-right">含税单价 (元)</th>
                    <th className="py-2.5 px-3 w-32 text-right">小计金额 (元)</th>
                    <th className="py-2.5 px-3 w-12 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {draft.items.map((item, index) => (
                    <tr key={index} className="hover:bg-hig-gray-50/80 group transition">
                      <td className="py-2 px-3 text-center text-hig-gray-400 font-mono">{item.item_seq}</td>
                      <td className="py-2 px-3 font-mono text-[11px] font-semibold text-[#0071E3]">
                        <input
                          type="text"
                          value={item.material_code}
                          onChange={(e) => updateDraftItem(index, { material_code: e.target.value })}
                          className="w-full px-1.5 py-0.5 bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#0071E3] rounded text-[11px] font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.material_name}
                          onChange={(e) => updateDraftItem(index, { material_name: e.target.value })}
                          placeholder="物资品名"
                          className="w-full px-1.5 py-0.5 font-semibold text-hig-gray-900 bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#0071E3] rounded"
                        />
                        <input
                          type="text"
                          value={item.specification}
                          onChange={(e) => updateDraftItem(index, { specification: e.target.value })}
                          placeholder="规格型号"
                          className="w-full px-1.5 py-0.5 text-[11px] text-hig-gray-500 bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#0071E3] rounded mt-0.5"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <MaterialAlignmentBadge
                          status={item.match_status || 'ALIGNED'}
                          standardCode={item.material_code}
                          standardName={item.material_name}
                          onAlignChange={(newCode, newName) => {
                            updateDraftItem(index, { material_code: newCode, material_name: newName });
                          }}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateDraftItem(index, { quantity: Number(e.target.value) || 0 })}
                            className="w-16 px-1.5 py-0.5 text-right font-medium bg-white border border-[#CBD5E1] rounded focus:outline-none focus:border-[#0071E3]"
                          />
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateDraftItem(index, { unit: e.target.value })}
                            className="w-10 px-1 py-0.5 text-center text-hig-gray-600 bg-white border border-[#CBD5E1] rounded text-[11px]"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.unit_price}
                          onChange={(e) => updateDraftItem(index, { unit_price: Number(e.target.value) || 0 })}
                          className="w-24 px-1.5 py-0.5 text-right font-medium bg-white border border-[#CBD5E1] rounded focus:outline-none focus:border-[#0071E3]"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-hig-gray-900 font-mono">
                        ¥{Number(item.total_amount || item.quantity * item.unit_price).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => removeDraftItem(index)}
                          className="p-1 rounded text-hig-gray-400 hover:text-[#E11D48] hover:bg-rose-50 transition"
                          title="删除该行"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 底部业务操作栏 */}
      <div className="p-4 border-t border-black/[0.06] bg-hig-gray-50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm('确认清空当前草稿内容吗？')) {
                resetDraft();
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-hig-gray-600 hover:text-hig-gray-900 hover:bg-black/[0.05] rounded-hig transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>清空重置</span>
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-hig-gray-700 bg-white border border-[#CBD5E1] hover:bg-hig-gray-50 rounded-hig shadow-hig-sm active:scale-95 transition"
          >
            <Save className="w-3.5 h-3.5 text-hig-gray-500" />
            <span>暂存草稿</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {quota.is_over_quota ? (
            <button
              onClick={handleSubmitSpecialApproval}
              disabled={isSubmitting || !isSpecialValid}
              className="flex items-center gap-1.5 px-4 py-2 rounded-hig bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-xs font-bold shadow-hig-sm active:scale-95 transition"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{isSubmitting ? '正在申报...' : '提交超额特批申请'}</span>
            </button>
          ) : (
            <button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 disabled:opacity-50 text-white text-xs font-bold shadow-hig-sm active:scale-95 transition"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? '正在提单...' : '一键正式提单'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
