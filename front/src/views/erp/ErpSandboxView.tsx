import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Sparkles,
  X,
  FileCheck,
  Check,
  RotateCcw,
  Ban
} from 'lucide-react';
import { tradeApi } from '../../services/api';
import { OrderRecord } from '../../types';
import { FloatingWidget } from '../../components/FloatingWidget';

// 预设商贸中台标准基准单据
const ENTERPRISE_SEED_ORDERS: OrderRecord[] = [
  {
    order_no: 'XSDD-YD-20260928-001',
    order_type: 'SALES',
    contract_no: '2026-WZ-089',
    counterparty_name: '中建八局第一建设有限公司',
    project_name: '科技城数字经济产业园一期项目',
    delivery_address: '苏州市高新区科技城 1 号工地物资中转站',
    contact_person: '张总 13912345678',
    business_name: '国内传统贸易',
    procurement_mode: '直发',
    business_tag: '传统贸易',
    items: [
      {
        item_seq: 1,
        material_code: 'STL-RB-400E-20',
        material_name: '热轧带肋钢筋',
        specification: 'HRB400E Φ20mm',
        quantity: 200.0,
        unit: '吨',
        unit_price: 4000.0,
        total_amount: 800000.0,
        match_status: 'ALIGNED',
      },
    ],
    total_amount: 800000.0,
    is_over_quota: true,
    special_approval_reason: '一期主体抢工期急需追加螺纹钢，已报备商务部补签增补协议。',
    order_status: 'PENDING_SPECIAL_APPROVAL',
    operator_name: '李思远',
    operator_dept: '物资贸易一部',
    created_at: '2026-09-28T02:15:00Z',
  },
  {
    order_no: 'XSDD-YD-20260928-002',
    order_type: 'SALES',
    contract_no: '2026-WZ-090',
    counterparty_name: '中铁十二局集团有限公司',
    project_name: '苏州轨道交通 8 号线 3 标',
    delivery_address: '苏州市工业园区娄葑工地物资转运点',
    contact_person: '王工 13800000000',
    business_name: '国内传统贸易',
    procurement_mode: '直发',
    business_tag: '传统贸易',
    items: [
      {
        item_seq: 1,
        material_code: 'CEM-PC-425',
        material_name: '普通硅酸盐水泥',
        specification: 'P.O 42.5 散装',
        quantity: 450.0,
        unit: '吨',
        unit_price: 440.0,
        total_amount: 198000.0,
        match_status: 'ALIGNED',
      },
    ],
    total_amount: 198000.0,
    is_over_quota: false,
    special_approval_reason: '',
    order_status: 'ACTIVE',
    operator_name: '王强',
    operator_dept: '物资贸易一部',
    created_at: '2026-09-28T01:30:00Z',
  },
  {
    order_no: 'XSDD-YD-20260927-015',
    order_type: 'SALES',
    contract_no: '2026-WZ-053',
    counterparty_name: '苏州工业园区建投有限公司',
    project_name: '现代产业园三期项目',
    delivery_address: '苏州市工业园区唯亭街道产业园项目部',
    contact_person: '刘工 13777777777',
    business_name: '国内传统贸易',
    procurement_mode: '直发',
    business_tag: '传统贸易',
    items: [
      {
        item_seq: 1,
        material_code: 'PIP-SM-20G-57',
        material_name: '无缝钢管',
        specification: '20G Φ57*3.5',
        quantity: 1000.0,
        unit: '米',
        unit_price: 120.0,
        total_amount: 120000.0,
        match_status: 'ALIGNED',
      },
    ],
    total_amount: 120000.0,
    is_over_quota: false,
    special_approval_reason: '',
    order_status: 'ACTIVE',
    operator_name: '赵晓雪',
    operator_dept: '物资贸易二部',
    created_at: '2026-09-27T08:40:00Z',
  },
  {
    order_no: 'XSDD-YD-20260927-014',
    order_type: 'SALES',
    contract_no: '2026-WZ-089',
    counterparty_name: '中建八局第一建设有限公司',
    project_name: '科技城数字经济产业园一期项目',
    delivery_address: '苏州市高新区科技城 1 号工地物资中转站',
    contact_person: '张总 13912345678',
    business_name: '国内传统贸易',
    procurement_mode: '直发',
    business_tag: '传统贸易',
    items: [
      {
        item_seq: 1,
        material_code: 'STL-PL-Q235-10',
        material_name: '普碳钢板',
        specification: 'Q235B 10*1500*6000',
        quantity: 80.0,
        unit: '吨',
        unit_price: 4200.0,
        total_amount: 336000.0,
        match_status: 'ALIGNED',
      },
    ],
    total_amount: 336000.0,
    is_over_quota: true,
    special_approval_reason: '申请特批追加中板，请领导审核。',
    order_status: 'RETURNED',
    operator_name: '李思远',
    operator_dept: '物资贸易一部',
    approval_comment: '请补充工程现场实际监理确认签字后再行报送。',
    created_at: '2026-09-27T06:10:00Z',
  },
];

export const ErpSandboxView: React.FC = () => {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderRecord[]>(ENTERPRISE_SEED_ORDERS);
  const [loading, setLoading] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // 侧滑订单详情与特批审批抽屉
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [approving, setApproving] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await tradeApi.fetchOrders({ page: 1, page_size: 50 });
      if (res.data?.list && res.data.list.length > 0) {
        setOrders(res.data.list);
      } else {
        setOrders(ENTERPRISE_SEED_ORDERS);
      }
    } catch {
      // 保持商贸标准基准单据
      setOrders(ENTERPRISE_SEED_ORDERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const handleRefresh = () => loadOrders();
    window.addEventListener('erp:order_refresh', handleRefresh);
    return () => window.removeEventListener('erp:order_refresh', handleRefresh);
  }, []);

  // 审批人裁决执行
  const handleApprove = async (decision: 'PASS' | 'RETURN' | 'REJECT') => {
    if (!selectedOrder) return;
    if (!approvalComment.trim()) {
      alert('请填写业务审批意见');
      return;
    }
    try {
      setApproving(true);
      await tradeApi.approveOrder(selectedOrder.order_no, {
        decision,
        comment: approvalComment.trim(),
        approver_name: '王总',
        approver_dept: '商贸风控审批部',
      });
      // 本地乐观更新单据状态
      setOrders((prev) =>
        prev.map((o) =>
          o.order_no === selectedOrder.order_no
            ? {
                ...o,
                order_status: decision === 'PASS' ? 'ACTIVE' : decision === 'RETURN' ? 'RETURNED' : 'REJECTED',
                approval_comment: approvalComment,
                approver_name: '王总',
              }
            : o
        )
      );
      setSelectedOrder(null);
      setApprovalComment('');
    } catch (e: any) {
      alert(e.message || '审批操作执行失败');
    } finally {
      setApproving(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== 'ALL' && order.order_status !== statusFilter) return false;
    if (!filterKeyword) return true;
    const kw = filterKeyword.toLowerCase();
    return (
      order.order_no.toLowerCase().includes(kw) ||
      order.contract_no.toLowerCase().includes(kw) ||
      order.counterparty_name.toLowerCase().includes(kw) ||
      order.project_name.toLowerCase().includes(kw)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            <span>履约已生效</span>
          </span>
        );
      case 'PENDING_SPECIAL_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FFF1F2] text-[#E11D48] font-semibold">
            <Clock className="w-3 h-3" />
            <span>待特批审核</span>
          </span>
        );
      case 'RETURNED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FEF9C3] text-[#854D0E] font-semibold">
            <AlertTriangle className="w-3 h-3 text-[#CA8A04]" />
            <span>已退回修改</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] font-semibold">
            <XCircle className="w-3 h-3" />
            <span>已驳回作废</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-medium">
            <span>经办草稿</span>
          </span>
        );
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 select-none relative">
      {/* 顶部业务大盘概览条 */}
      <div className="bg-white p-4 rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] text-[#64748B]">商贸供应链系统 &gt; 销售管理 &gt; 销售订单综合管理大盘</div>
          <div className="text-base font-bold text-[#0F172A] mt-0.5">销售订单台账明细大盘</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">本月提单总数</span>
            <span className="text-xs font-bold text-[#0F172A]">128 笔</span>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">履约中总金额</span>
            <span className="text-xs font-bold text-[#0071E3]">¥ 28,450,000</span>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-hig bg-[#FFF1F2] border border-[#FECDD3]">
            <span className="text-[11px] text-[#E11D48]">待特批超额单</span>
            <span className="text-xs font-bold text-[#E11D48]">2 笔需审批</span>
          </div>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-hig border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-medium text-[#475569] transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新台账</span>
          </button>
        </div>
      </div>

      {/* 过滤与搜索栏 */}
      <div className="bg-white p-3 rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="输入单据编号、客户名称、合同号..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#F1F5F9] rounded-hig text-xs focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
            />
          </div>

          <div className="flex items-center gap-1">
            {[
              { label: '全部', value: 'ALL' },
              { label: '已生效', value: 'ACTIVE' },
              { label: '待特批', value: 'PENDING_SPECIAL_APPROVAL' },
              { label: '已退回', value: 'RETURNED' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-2.5 py-1 rounded-hig-sm text-xs font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-[#0071E3] text-white shadow-hig-sm'
                    : 'bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/workbench')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-semibold shadow-hig-sm transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>智能提单开单</span>
          </button>
        </div>
      </div>

      {/* 订单表格主体 */}
      <div className="flex-1 bg-white rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] font-semibold sticky top-0 z-10">
                <th className="py-3 px-3.5">单据编号</th>
                <th className="py-3 px-3.5">关联合同</th>
                <th className="py-3 px-3.5">签约往来单位</th>
                <th className="py-3 px-3.5">所属工程项目</th>
                <th className="py-3 px-3.5 text-right">总金额</th>
                <th className="py-3 px-3.5">经办人</th>
                <th className="py-3 px-3.5">提报时间</th>
                <th className="py-3 px-3.5 text-center">履约状态</th>
                <th className="py-3 px-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredOrders.map((order) => (
                <tr key={order.order_no} className="hover:bg-[#F8FAFC]/80 transition">
                  <td className="py-3 px-3.5 font-mono font-bold text-[#0071E3]">{order.order_no}</td>
                  <td className="py-3 px-3.5 font-mono text-[#475569]">{order.contract_no}</td>
                  <td className="py-3 px-3.5 font-medium text-[#0F172A] truncate max-w-[180px]" title={order.counterparty_name}>
                    {order.counterparty_name}
                  </td>
                  <td className="py-3 px-3.5 text-[#64748B] truncate max-w-[180px]" title={order.project_name}>
                    {order.project_name}
                  </td>
                  <td className="py-3 px-3.5 text-right font-bold text-[#0F172A]">
                    ¥ {order.total_amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3.5 text-[#64748B]">{order.operator_name}</td>
                  <td className="py-3 px-3.5 text-[11px] text-[#94A3B8]">
                    {order.created_at ? order.created_at.replace('T', ' ').substring(0, 16) : '-'}
                  </td>
                  <td className="py-3 px-3.5 text-center">{getStatusBadge(order.order_status)}</td>
                  <td className="py-3 px-3.5 text-center">
                    <button
                      onClick={() => {
                        setSelectedOrder(order);
                        setApprovalComment(order.approval_comment || '');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-[#F1F5F9] text-[#0071E3] hover:bg-[#E2E8F0] font-semibold transition"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{order.order_status === 'PENDING_SPECIAL_APPROVAL' ? '审核流转' : '查看单据'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 挂载位点 1：56px 右下角常驻智能提单悬浮球与轻量展开面板 */}
      <FloatingWidget />

      {/* 挂载位点 2：侧滑订单详情与特批审批抽屉 (OrderDetailDrawer) */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50 flex justify-end animate-in fade-in duration-150">
          <div className="w-[520px] max-w-[90vw] h-full bg-white shadow-hig-float flex flex-col animate-in slide-in-from-right duration-200 border-l border-[#E5E5EA]">
            {/* 抽屉顶栏 */}
            <div className="p-4 border-b border-[#E5E5EA] flex items-center justify-between bg-[#F8FAFC]">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[#0071E3]" />
                  <span className="text-sm font-bold text-[#0F172A]">销售单据综合明细与审批核验</span>
                </div>
                <div className="text-[11px] font-mono text-[#0071E3] mt-0.5">{selectedOrder.order_no}</div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-7 h-7 rounded-hig hover:bg-[#E2E8F0] flex items-center justify-center text-[#64748B] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 抽屉内容区 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* 履约状态横幅 */}
              <div className="p-3 rounded-hig-lg border border-[#E5E5EA] bg-[#F8FAFC] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#64748B]">当前履约状态</div>
                  <div className="mt-1">{getStatusBadge(selectedOrder.order_status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#64748B]">全单核算总额</div>
                  <div className="text-base font-bold text-[#0071E3]">
                    ¥ {selectedOrder.total_amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* 主档信息 */}
              <div className="space-y-2">
                <div className="font-bold text-[#0F172A] border-b border-[#F1F5F9] pb-1">签约合同与工程</div>
                <div className="grid grid-cols-2 gap-2 text-[#475569]">
                  <div>
                    <span className="text-[#94A3B8]">关联合同：</span>
                    <span className="font-mono text-[#0F172A] ml-1">{selectedOrder.contract_no}</span>
                  </div>
                  <div>
                    <span className="text-[#94A3B8]">经办人：</span>
                    <span className="text-[#0F172A] ml-1">{selectedOrder.operator_name}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#94A3B8]">签约主体：</span>
                    <span className="text-[#0F172A] ml-1">{selectedOrder.counterparty_name}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#94A3B8]">所属工程：</span>
                    <span className="text-[#0F172A] ml-1">{selectedOrder.project_name}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#94A3B8]">送货地点：</span>
                    <span className="text-[#0F172A] ml-1">{selectedOrder.delivery_address || '苏州市高新区科技城 1 号工地'}</span>
                  </div>
                </div>
              </div>

              {/* 特批理由核验 */}
              {selectedOrder.is_over_quota && (
                <div className="p-3.5 rounded-hig-lg bg-[#FFF1F2] border border-[#FECDD3] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[#E11D48]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>超额提报特批理由说明</span>
                  </div>
                  <div className="text-[#991B1B] text-[11px] leading-relaxed">
                    {selectedOrder.special_approval_reason || '经现场项目经理确认，一期地下室抢工期急需追加钢材，已报备商务部。'}
                  </div>
                </div>
              )}

              {/* 物资明细 */}
              <div className="space-y-2">
                <div className="font-bold text-[#0F172A] border-b border-[#F1F5F9] pb-1">
                  物资明细清单 ({selectedOrder.items?.length || 0} 项)
                </div>
                <div className="border border-[#E2E8F0] rounded-hig overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#475569] font-medium border-b border-[#E2E8F0]">
                      <tr>
                        <th className="p-2">物资品名</th>
                        <th className="p-2 text-right">数量</th>
                        <th className="p-2 text-right">含税单价</th>
                        <th className="p-2 text-right">总额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {selectedOrder.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <div className="font-semibold text-[#0F172A]">{item.material_name}</div>
                            <div className="text-[10px] font-mono text-[#94A3B8]">{item.material_code}</div>
                          </td>
                          <td className="p-2 text-right font-medium">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="p-2 text-right">¥{item.unit_price.toFixed(2)}</td>
                          <td className="p-2 text-right font-bold text-[#0F172A]">¥{item.total_amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 历史审批批注 */}
              {selectedOrder.approval_comment && (
                <div className="p-3 rounded-hig-lg bg-[#FEF9C3] border border-[#FEF08A] text-[#854D0E] space-y-1">
                  <div className="font-bold text-[11px]">审批签署意见 ({selectedOrder.approver_name || '王总'})</div>
                  <div className="text-[11px]">{selectedOrder.approval_comment}</div>
                </div>
              )}

              {/* 审批操作输入 */}
              {selectedOrder.order_status === 'PENDING_SPECIAL_APPROVAL' && (
                <div className="space-y-2 pt-2 border-t border-[#E5E5EA]">
                  <div className="font-bold text-[#0F172A]">业务审批意见签署</div>
                  <textarea
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="输入签署意见（如：现场工期属实，增补协议已走OA，同意特批放行）..."
                    rows={3}
                    className="w-full p-2.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-hig text-xs placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
                  />
                </div>
              )}
            </div>

            {/* 抽屉底部操作栏 */}
            <div className="p-4 border-t border-[#E5E5EA] bg-[#F8FAFC] flex items-center justify-end gap-2">
              {selectedOrder.order_status === 'PENDING_SPECIAL_APPROVAL' ? (
                <>
                  <button
                    onClick={() => handleApprove('REJECT')}
                    disabled={approving}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-hig border border-[#FECDD3] bg-[#FFF1F2] text-[#E11D48] hover:bg-[#FFE4E6] text-xs font-semibold transition"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>否决驳回</span>
                  </button>
                  <button
                    onClick={() => handleApprove('RETURN')}
                    disabled={approving}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-hig border border-[#FEF08A] bg-[#FEF9C3] text-[#854D0E] hover:bg-[#FEF08A] text-xs font-semibold transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>退回修改</span>
                  </button>
                  <button
                    onClick={() => handleApprove('PASS')}
                    disabled={approving}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-hig bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold shadow-hig-sm transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>同意特批生效</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-1.5 rounded-hig bg-[#F1F5F9] text-[#475569] text-xs font-semibold hover:bg-[#E2E8F0] transition"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
