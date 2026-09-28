import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Tag,
  Package,
  Copy,
  Check
} from 'lucide-react';

interface ContractMasterItem {
  contract_no: string;
  contract_name: string;
  counterparty_name: string;
  project_name: string;
  total_amount: number;
  accumulated_amount: number;
  remaining_amount: number;
  max_orders: number;
  accumulated_orders: number;
  remaining_orders: number;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  valid_until: string;
  default_delivery_address: string;
}

interface MaterialMasterItem {
  material_code: string;
  material_name: string;
  specification: string;
  category: string;
  unit: string;
  guide_price: number;
  aliases: string[];
}

const CONTRACT_DATA: ContractMasterItem[] = [
  {
    contract_no: '2026-WZ-089',
    contract_name: '科技城项目大宗钢材采销年度合同',
    counterparty_name: '中建八局第一建设有限公司',
    project_name: '科技城数字经济产业园一期项目',
    total_amount: 5000000.0,
    accumulated_amount: 4850000.0,
    remaining_amount: 150000.0,
    max_orders: 20,
    accumulated_orders: 18,
    remaining_orders: 2,
    status: 'ACTIVE',
    valid_until: '2026-12-31',
    default_delivery_address: '苏州市高新区科技城 1 号工地物资中转站',
  },
  {
    contract_no: '2026-WZ-090',
    contract_name: '苏州轨道交通工程水泥采购总协议',
    counterparty_name: '中铁十二局集团有限公司',
    project_name: '苏州轨道交通 8 号线 3 标',
    total_amount: 10000000.0,
    accumulated_amount: 2000000.0,
    remaining_amount: 8000000.0,
    max_orders: 50,
    accumulated_orders: 5,
    remaining_orders: 45,
    status: 'ACTIVE',
    valid_until: '2026-12-31',
    default_delivery_address: '苏州市工业园区娄葑工地',
  },
  {
    contract_no: '2025-WZ-012',
    contract_name: '郑州保税物流仓储特钢采购协议',
    counterparty_name: '中原特钢实业有限公司',
    project_name: '郑州保税物流仓储扩建工程',
    total_amount: 3000000.0,
    accumulated_amount: 1200000.0,
    remaining_amount: 1800000.0,
    max_orders: 30,
    accumulated_orders: 18,
    remaining_orders: 12,
    status: 'EXPIRED',
    valid_until: '2025-12-31',
    default_delivery_address: '郑州经开区综合保税区仓库',
  },
  {
    contract_no: '2026-WZ-053',
    contract_name: '现代产业园管材五金采销框架合同',
    counterparty_name: '苏州工业园区建投有限公司',
    project_name: '现代产业园三期项目',
    total_amount: 6500000.0,
    accumulated_amount: 2100000.0,
    remaining_amount: 4400000.0,
    max_orders: 25,
    accumulated_orders: 7,
    remaining_orders: 18,
    status: 'ACTIVE',
    valid_until: '2026-11-30',
    default_delivery_address: '苏州市工业园区唯亭街道产业园项目部',
  },
];

const MATERIAL_DATA: MaterialMasterItem[] = [
  {
    material_code: 'STL-RB-400E-20',
    material_name: '热轧带肋钢筋',
    specification: 'HRB400E Φ20mm',
    category: '建筑钢材',
    unit: '吨',
    guide_price: 4000.0,
    aliases: ['18螺纹', '20螺纹', '400E 20圆钢', '20厘螺纹钢', '三级螺纹钢20'],
  },
  {
    material_code: 'STL-PL-Q235-10',
    material_name: '普碳钢板',
    specification: 'Q235B 10*1500*6000',
    category: '建筑钢材',
    unit: '吨',
    guide_price: 4200.0,
    aliases: ['10个厚', 'Q235中板', '10厘板', '10厚普板'],
  },
  {
    material_code: 'PIP-SM-20G-57',
    material_name: '无缝钢管',
    specification: '20G Φ57*3.5',
    category: '管材型材',
    unit: '米',
    guide_price: 120.0,
    aliases: ['57管', '20G无缝管', '57无缝钢管', '57小口径管'],
  },
  {
    material_code: 'VLV-GT-Z41H-50',
    material_name: '铸钢法兰闸阀',
    specification: 'Z41H-16C DN50',
    category: '阀门五金',
    unit: '台',
    guide_price: 360.0,
    aliases: ['50闸阀', '高压50法兰闸阀', 'DN50铸钢闸阀'],
  },
  {
    material_code: 'CEM-PC-425',
    material_name: '普通硅酸盐水泥',
    specification: 'P.O 42.5 散装',
    category: '水泥建材',
    unit: '吨',
    guide_price: 440.0,
    aliases: ['42.5水泥', '425水泥', 'PO42.5', '42.5散装水泥', '42.5普硅水泥'],
  },
];

export const MasterDataView: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'contract' | 'material' | 'pricing'>('contract');
  const [contractKeyword, setContractKeyword] = useState('');
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const filteredContracts = CONTRACT_DATA.filter((item) => {
    if (!contractKeyword) return true;
    const kw = contractKeyword.toLowerCase();
    return (
      item.contract_no.toLowerCase().includes(kw) ||
      item.counterparty_name.toLowerCase().includes(kw) ||
      item.project_name.toLowerCase().includes(kw)
    );
  });

  const filteredMaterials = MATERIAL_DATA.filter((item) => {
    if (!materialKeyword) return true;
    const kw = materialKeyword.toLowerCase();
    return (
      item.material_code.toLowerCase().includes(kw) ||
      item.material_name.toLowerCase().includes(kw) ||
      item.specification.toLowerCase().includes(kw) ||
      item.aliases.some((a) => a.toLowerCase().includes(kw))
    );
  });

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
            <span className="text-[11px] text-[#64748B]">执行中销售合同</span>
            <span className="text-xs font-bold text-[#0F172A]">28 份</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">执行中采购合同</span>
            <span className="text-xs font-bold text-[#0071E3]">16 份</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">标准物料条目</span>
            <span className="text-xs font-bold text-[#16A34A]">1,420 项</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-hig bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B]">近义简称映射</span>
            <span className="text-xs font-bold text-[#64748B]">3,850 条</span>
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
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-semibold shadow-hig-sm transition">
              <Plus className="w-3.5 h-3.5" />
              <span>新建合同台账</span>
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
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">有效期至 {c.valid_until}</div>
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
                      ¥ {c.total_amount.toLocaleString('zh-CN')}
                      <div className="text-[10px] text-[#94A3B8]">上限 {c.max_orders} 笔</div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className={`font-bold ${c.remaining_amount <= 200000 ? 'text-[#E11D48]' : 'text-[#16A34A]'}`}>
                        ¥ {c.remaining_amount.toLocaleString('zh-CN')}
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
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-hig bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] text-xs font-semibold shadow-hig-sm transition">
              <Plus className="w-3.5 h-3.5" />
              <span>维护标准物资</span>
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
                        ¥ {m.guide_price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
