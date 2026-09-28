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
} from 'lucide-react';
import { orderApi } from '../../services/orderApi';
import { OrderRecord } from '../../types';
import { FloatingWidget } from '../../components/FloatingWidget';
import { OrderDetailDrawer } from '../../components/drawer/OrderDetailDrawer';
import { useTradeStore } from '../../stores/useTradeStore';

export const ErpSandboxView: React.FC = () => {
  const navigate = useNavigate();
  const activeDrawerOrderNo = useTradeStore((state) => state.activeDrawerOrderNo);
  const setActiveDrawerOrderNo = useTradeStore((state) => state.setActiveDrawerOrderNo);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // 侧滑订单详情与特批审批抽屉
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await orderApi.fetchErpOrders({ page: 1, page_size: 50 });
      if (res.data?.items) {
        setOrders(res.data.items);
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      setOrders([]);
      setFetchError(err?.message || '无法获取中台订单，请检查中台服务状态');
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

  // 响应来自全局 store 的抽屉唤起事件
  useEffect(() => {
    if (activeDrawerOrderNo && orders.length > 0) {
      const found = orders.find((o) => o.order_no === activeDrawerOrderNo);
      if (found) {
        setSelectedOrder(found);
      }
    }
  }, [activeDrawerOrderNo, orders]);

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

  const activeTotalAmount = orders
    .filter((o) => o.order_status === 'ACTIVE')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const pendingSpecialCount = orders.filter(
    (o) => o.order_status === 'PENDING_SPECIAL_APPROVAL'
  ).length;

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
            <span className="text-[11px] text-[#64748B]">台账订单总数</span>
            <span className="text-xs font-bold text-[#0F172A]">{orders.length} 笔</span>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">履约中总金额</span>
            <span className="text-xs font-bold text-[#0071E3]">
              ¥ {activeTotalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-hig bg-[#FFF1F2] border border-[#FECDD3]">
            <span className="text-[11px] text-[#E11D48]">待特批超额单</span>
            <span className="text-xs font-bold text-[#E11D48]">{pendingSpecialCount} 笔需审批</span>
          </div>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-hig border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-medium text-[#475569] transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新台账</span>
          </button>
          <button
            onClick={() => navigate('/workbench')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-semibold shadow-hig-sm transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>智能提单开单</span>
          </button>
        </div>
      </div>

      {/* 错误提示横幅 */}
      {fetchError && (
        <div className="p-3 bg-[#FFF1F2] border border-[#FECDD3] rounded-hig-lg flex items-center justify-between text-xs text-[#E11D48]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>中台数据同步异常：{fetchError}</span>
          </div>
          <button
            onClick={loadOrders}
            className="px-2.5 py-1 rounded bg-[#E11D48] text-white font-medium hover:bg-[#BE123C] transition"
          >
            重试
          </button>
        </div>
      )}

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
                        setActiveDrawerOrderNo(order.order_no);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-[#F1F5F9] text-[#0071E3] hover:bg-[#E2E8F0] font-semibold transition"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{order.order_status === 'PENDING_SPECIAL_APPROVAL' ? '审核流转' : '查看单据'}</span>
                    </button>
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#94A3B8]">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3]" />
                        <span>正在同步中台销售订单数据...</span>
                      </div>
                    ) : fetchError ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-[#E11D48]">
                        <AlertTriangle className="w-6 h-6" />
                        <span className="font-medium">{fetchError}</span>
                        <button
                          onClick={loadOrders}
                          className="mt-1 px-3 py-1 bg-[#F1F5F9] text-xs text-[#0F172A] rounded hover:bg-[#E2E8F0]"
                        >
                          点击重新同步
                        </button>
                      </div>
                    ) : (
                      <span>暂无销售订单记录</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 挂载位点 1：56px 右下角常驻智能提单悬浮球与轻量展开面板 */}
      <FloatingWidget />

      {/* 挂载位点 2：侧滑订单详情与特批审批抽屉 (OrderDetailDrawer) */}
      <OrderDetailDrawer
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        onClose={() => {
          setSelectedOrder(null);
          setActiveDrawerOrderNo(null);
        }}
        onApproveSuccess={() => {
          loadOrders();
        }}
      />
    </div>
  );
};

export default ErpSandboxView;
