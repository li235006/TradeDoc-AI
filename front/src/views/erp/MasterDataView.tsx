import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Tag,
  Package,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '../../services/api';
import { ApiResponse } from '../../types';

interface ContractMasterItem {
  contract_no: string;
  contract_name?: string;
  counterparty_name: string;
  project_name: string;
  total_amount: number;
  accumulated_amount: number;
  remaining_amount: number;
  max_orders?: number;
  accumulated_orders?: number;
  remaining_orders?: number;
  max_order_count?: number;
  accumulated_order_count?: number;
  remaining_order_count?: number;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | string;
  valid_until?: string;
  default_delivery_address?: string;
}

interface MaterialMasterItem {
  material_code: string;
  material_name: string;
  specification: string;
  category?: string;
  unit: string;
  guide_price?: number;
  standard_price?: number;
  aliases: string[];
}

export const MasterDataView: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'contract' | 'material' | 'pricing'>('contract');
  const [contractKeyword, setContractKeyword] = useState('');
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 真实 API 主数据状态
  const [contracts, setContracts] = useState<ContractMasterItem[]>([]);
  const [materials, setMaterials] = useState<MaterialMasterItem[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);

  // 从真实 API 获取合同主数据
  const fetchContracts = async () => {
    setLoadingContracts(true);
    setContractError(null);
    try {
      const res = await apiClient.get<ApiResponse<ContractMasterItem[]>>('/master/contracts', {
        params: contractKeyword ? { keyword: contractKeyword } : undefined,
      });
      const list = (res.data?.data || []).map((c) => ({
        ...c,
        contract_name: c.contract_name || `${c.counterparty_name}采购合同`,
        max_orders: c.max_orders ?? c.max_order_count ?? 0,
        accumulated_orders: c.accumulated_orders ?? c.accumulated_order_count ?? 0,
        remaining_orders: c.remaining_orders ?? c.remaining_order_count ?? 0,
        remaining_amount: c.remaining_amount ?? (c.total_amount - (c.accumulated_amount || 0)),
      }));
      setContracts(list);
    } catch (err: any) {
      setContracts([]);
      setContractError(err?.message || '无法获取合同主数据列表');
    } finally {
      setLoadingContracts(false);
    }
  };

  // 从真实 API 获取物料主数据
  const fetchMaterials = async () => {
    setLoadingMaterials(true);
    setMaterialError(null);
    try {
      const res = await apiClient.get<ApiResponse<MaterialMasterItem[]>>('/master/materials', {
        params: materialKeyword ? { keyword: materialKeyword } : undefined,
      });
      const list = (res.data?.data || []).map((m) => ({
        ...m,
        guide_price: m.guide_price ?? m.standard_price ?? 0,
        category: m.category || '建筑大宗',
        aliases: m.aliases || [],
      }));
      setMaterials(list);
    } catch (err: any) {
      setMaterials([]);
      setMaterialError(err?.message || '无法获取物料主数据字典');
    } finally {
      setLoadingMaterials(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [contractKeyword]);

  useEffect(() => {
    fetchMaterials();
  }, [materialKeyword]);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const filteredContracts = contracts.filter((item) => {
    if (!contractKeyword) return true;
    const kw = contractKeyword.toLowerCase();
    return (
      item.contract_no.toLowerCase().includes(kw) ||
      (item.contract_name && item.contract_name.toLowerCase().includes(kw)) ||
      item.counterparty_name.toLowerCase().includes(kw) ||
      item.project_name.toLowerCase().includes(kw)
    );
  });

  const filteredMaterials = materials.filter((item) => {
    if (!materialKeyword) return true;
    const kw = materialKeyword.toLowerCase();
    return (
      item.material_code.toLowerCase().includes(kw) ||
      item.material_name.toLowerCase().includes(kw) ||
      item.specification.toLowerCase().includes(kw) ||
      item.aliases.some((a) => a.toLowerCase().includes(kw))
    );
  });

  const activeContractsCount = contracts.filter((c) => c.status === 'ACTIVE').length;
  const totalAliasesCount = materials.reduce((sum, m) => sum + (m.aliases?.length || 0), 0);

  return (
    <div className="h-full flex flex-col gap-4 select-none">
      {/* 顶部指标统计条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm">
        <div className="flex items-center gap-1.5 p-1 bg-[#E3E3E8] rounded-hig">
          <button
            onClick={() => setActiveTab('contract')}
            className={`px-3.5 py-1.5 rounded-hig-sm text-xs font-semibold transition ${
              activeTab === 'contract'
                ? 'bg-white text-[#1D1D1F] shadow-hig-sm'
                : 'text-[#64748B] hover:text-[#1D1D1F]'
            }`}
          >
            商贸合同主数据台账
          </button>
          <button
            onClick={() => setActiveTab('material')}
            className={`px-3.5 py-1.5 rounded-hig-sm text-xs font-semibold transition ${
              activeTab === 'material'
                ? 'bg-white text-[#1D1D1F] shadow-hig-sm'
                : 'text-[#64748B] hover:text-[#1D1D1F]'
            }`}
          >
            标准物资物料字典库
          </button>
          <button
            onClick={() => setActiveTab('pricing')}
            className={`px-3.5 py-1.5 rounded-hig-sm text-xs font-semibold transition ${
              activeTab === 'pricing'
                ? 'bg-white text-[#1D1D1F] shadow-hig-sm'
                : 'text-[#64748B] hover:text-[#1D1D1F]'
            }`}
          >
            公允指导价与风控参数
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">执行中有效合同</span>
            <span className="text-xs font-bold text-[#0F172A]">{activeContractsCount} 份</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">标准物料条目</span>
            <span className="text-xs font-bold text-[#16A34A]">{materials.length} 项</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">近义简称映射</span>
            <span className="text-xs font-bold text-[#64748B]">{totalAliasesCount} 条</span>
          </div>
          <button
            onClick={() => navigate('/workbench')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-medium shadow-hig-sm transition ml-1"
          >
            <span>进入提单工作台</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 主体工作台：双栏对开布局 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* 左栏：商贸合同主数据台账 (6 份) */}
        <div className="lg:col-span-6 flex flex-col bg-white rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm overflow-hidden">
          {/* 台账顶栏 */}
          <div className="p-4 border-b border-[#E5E5EA] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0071E3]" />
                <h3 className="text-sm font-bold text-[#0F172A]">商贸合同主数据台账</h3>
              </div>
              <p className="text-[11px] text-[#86868B] mt-0.5">
                提单履约额度核验底座 · 自动关联签约单位与送货地址
              </p>
            </div>
            <button
              onClick={fetchContracts}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-hig border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-medium text-[#475569] transition"
              title="重新获取合同数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingContracts ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>

          {/* 搜索过滤条 */}
          <div className="p-3 border-b border-[#F1F5F9] bg-[#F8FAFC]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={contractKeyword}
                onChange={(e) => setContractKeyword(e.target.value)}
                placeholder="搜索合同编号、签约主体、所属工程项目..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-hig text-xs placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              />
            </div>
          </div>

          {/* 错误提示 */}
          {contractError && (
            <div className="p-2.5 bg-[#FFF1F2] border-b border-[#FECDD3] text-xs text-[#E11D48] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{contractError}</span>
            </div>
          )}

          {/* 合同表格 */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] font-semibold sticky top-0 z-10">
                  <th className="py-2.5 px-3">合同编号</th>
                  <th className="py-2.5 px-3">签约主体与工程</th>
                  <th className="py-2.5 px-3 text-right">合同总额</th>
                  <th className="py-2.5 px-3 text-right">可用余额</th>
                  <th className="py-2.5 px-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredContracts.map((c) => (
                  <tr key={c.contract_no} className="hover:bg-[#F8FAFC]/80 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#0071E3]">{c.contract_no}</span>
                        <button
                          onClick={() => handleCopy(c.contract_no)}
                          title="复制编号"
                          className="text-[#94A3B8] hover:text-[#0071E3]"
                        >
                          {copiedCode === c.contract_no ? (
                            <Check className="w-3 h-3 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">有效期至 {c.valid_until || '长期'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-[#0F172A] truncate max-w-[200px]" title={c.counterparty_name}>
                        {c.counterparty_name}
                      </div>
                      <div className="text-[11px] text-[#64748B] truncate max-w-[200px]" title={c.project_name}>
                        {c.project_name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-[#0F172A]">
                      ¥ {c.total_amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      <div className="text-[10px] text-[#94A3B8]">上限 {c.max_orders} 笔</div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className={`font-bold ${c.remaining_amount <= 200000 ? 'text-[#E11D48]' : 'text-[#16A34A]'}`}>
                        ¥ {c.remaining_amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-[#64748B]">剩 {c.remaining_orders} 笔可用</div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {c.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#DCFCE7] text-[#16A34A]">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>履约中</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#E11D48]">
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>已过期</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredContracts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#94A3B8]">
                      {loadingContracts ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3]" />
                          <span>正在同步合同主数据...</span>
                        </div>
                      ) : (
                        <span>暂无符合条件的合同记录</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右栏：标准化物资物料字典库 (6 份) */}
        <div className="lg:col-span-6 flex flex-col bg-white rounded-hig-xl border border-[#E5E5EA] shadow-hig-sm overflow-hidden">
          {/* 物料顶栏 */}
          <div className="p-4 border-b border-[#E5E5EA] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#16A34A]" />
                <h3 className="text-sm font-bold text-[#0F172A]">标准物资物料字典与简称校准</h3>
              </div>
              <p className="text-[11px] text-[#86868B] mt-0.5">
                支持口语化简称与错别字自动校准纠错对齐标准库
              </p>
            </div>
            <button
              onClick={fetchMaterials}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-hig border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-medium text-[#475569] transition"
              title="重新获取物料数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMaterials ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>

          {/* 物料搜索条 */}
          <div className="p-3 border-b border-[#F1F5F9] bg-[#F8FAFC]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={materialKeyword}
                onChange={(e) => setMaterialKeyword(e.target.value)}
                placeholder="搜索标准编码、规格型号、近义简称词条..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-hig text-xs placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              />
            </div>
          </div>

          {/* 错误提示 */}
          {materialError && (
            <div className="p-2.5 bg-[#FFF1F2] border-b border-[#FECDD3] text-xs text-[#E11D48] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{materialError}</span>
            </div>
          )}

          {/* 物料表格 */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] font-semibold sticky top-0 z-10">
                  <th className="py-2.5 px-3">标准编码</th>
                  <th className="py-2.5 px-3">规范品名与规格</th>
                  <th className="py-2.5 px-3 text-right">公允指导价</th>
                  <th className="py-2.5 px-3">现场近义简称与行话</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredMaterials.map((m) => (
                  <tr key={m.material_code} className="hover:bg-[#F8FAFC]/80 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#0F172A]">{m.material_code}</span>
                        <button
                          onClick={() => handleCopy(m.material_code)}
                          title="复制编码"
                          className="text-[#94A3B8] hover:text-[#0071E3]"
                        >
                          {copiedCode === m.material_code ? (
                            <Check className="w-3 h-3 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.2 rounded bg-[#F1F5F9] text-[#64748B]">
                        {m.category}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#0F172A]">{m.material_name}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{m.specification}</div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-[#0F172A]">
                        ¥ {Number(m.guide_price || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-[#64748B] ml-1">/ {m.unit}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {m.aliases.map((alias, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]"
                          >
                            <Tag className="w-2.5 h-2.5 mr-0.5 text-[#94A3B8]" />
                            {alias}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredMaterials.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-[#94A3B8]">
                      {loadingMaterials ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3]" />
                          <span>正在同步物资字典数据...</span>
                        </div>
                      ) : (
                        <span>暂无符合条件的物料记录</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterDataView;
