import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FileSpreadsheet,
  Layers,
  Database,
  Sparkles,
  Check,
  X,
  ChevronDown,
  Users
} from 'lucide-react';
import { useTradeStore } from '../../stores/useTradeStore';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: '智能提单工作台', path: '/workbench', icon: Sparkles },
  { name: 'Excel 批量导入', path: '/batch', icon: FileSpreadsheet },
  { name: '供应链订单大盘', path: '/erp', icon: Layers, badge: 'ERP' },
  { name: '合同主数据与物料字典', path: '/master-data', icon: Database },
];

export interface PresetUser {
  id: string;
  name: string;
  dept: string;
  role: 'OPERATOR' | 'APPROVER' | 'ADMIN';
  roleName: string;
  defaultContract?: string;
  desc: string;
}

export const PRESET_USERS: PresetUser[] = [
  {
    id: 'zhangming',
    name: '张明',
    dept: '物资贸易二部',
    role: 'OPERATOR',
    roleName: '业务经办人',
    defaultContract: '2026-WZ-101',
    desc: '全新用户 · 专属合同 2026-WZ-101 (额度充足 ¥1000万，0操作)',
  },
  {
    id: 'liqiang',
    name: '李强',
    dept: '物资贸易一部',
    role: 'OPERATOR',
    roleName: '业务经办人',
    defaultContract: '2026-WZ-089',
    desc: '老用户 · 合同 2026-WZ-089 (已超额，用于特批与拦截测试)',
  },
  {
    id: 'wangjianguo',
    name: '王建国',
    dept: '华东贸易部',
    role: 'APPROVER',
    roleName: '业务审批主管',
    desc: '业务主管 · 专职在 ERP 大盘 720px 侧滑抽屉批复特批',
  },
  {
    id: 'admin',
    name: '系统管理员',
    dept: '运营保障中心',
    role: 'ADMIN',
    roleName: '系统管理员',
    desc: '系统管理 · 维护主数据台账与物料字典',
  },
];

export const Sidebar: React.FC = () => {
  const { draft, setDraft, currentUserRole, setCurrentUserRole } = useTradeStore();

  const [showMenu, setShowMenu] = useState(false);
  const [isCustomEditing, setIsCustomEditing] = useState(false);
  const [editName, setEditName] = useState(draft.operator_name || '张明');
  const [editDept, setEditDept] = useState(draft.operator_dept || '物资贸易二部');

  // 选择预设角色
  const handleSelectPreset = (user: PresetUser) => {
    setCurrentUserRole(user.role);
    const updatePayload: any = {
      operator_name: user.name,
      operator_dept: user.dept,
    };
    if (user.defaultContract) {
      updatePayload.contract_no = user.defaultContract;
    }
    setDraft(updatePayload);
    setShowMenu(false);
    setIsCustomEditing(false);
  };

  // 保存自定义经办人
  const handleSaveCustom = () => {
    setDraft({
      operator_name: editName.trim() || '业务经办人',
      operator_dept: editDept.trim() || '物资贸易二部',
    });
    setIsCustomEditing(false);
    setShowMenu(false);
  };

  const currentPreset = PRESET_USERS.find(
    (u) => u.name === draft.operator_name && u.dept === draft.operator_dept
  );

  return (
    <aside className="w-64 bg-white border-r border-black/[0.06] flex flex-col flex-shrink-0 z-20 select-none">
      {/* 现代纯粹 Web 品牌顶栏 */}
      <div className="h-14 px-5 border-b border-black/[0.06] flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-hig bg-[#0071E3] flex items-center justify-center text-white font-bold text-sm shadow-hig-sm font-mono tracking-tight">
            TD
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-hig-gray-900 leading-none">TradeDoc AI</span>
              <span className="text-[10px] bg-[#0071E3]/10 text-[#0071E3] font-semibold px-1 py-0.2 rounded">
                v1.0
              </span>
            </div>
            <p className="text-[10px] text-hig-gray-500 tracking-tight mt-0.5">智能商贸流通提单系统</p>
          </div>
        </div>
      </div>

      {/* 业务大盘与工作流导航 */}
      <div className="p-3 space-y-1 flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-hig-gray-500 uppercase tracking-wider">
          业务协同与工作流
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-hig text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#0071E3] text-white shadow-hig-sm'
                    : 'text-hig-gray-700 hover:bg-black/[0.04] active:bg-black/[0.08]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-hig-gray-600'}`} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isActive ? 'bg-white/25 text-white' : 'bg-hig-gray-200 text-hig-gray-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* 底部角色身份卡片与切换器 */}
      <div className="p-3 border-t border-black/[0.06] text-xs text-hig-gray-500 flex flex-col gap-2 bg-slate-50/70 relative">
        {/* 角色切换浮层菜单 */}
        {showMenu && (
          <div className="absolute bottom-[72px] left-3 right-3 bg-white rounded-hig-xl border border-[#CBD5E1] shadow-hig-lg p-2 z-50 flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between px-1.5 py-1 border-b border-[#F1F5F9]">
              <span className="text-[11px] font-bold text-hig-gray-900 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>选择测试角色身份</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="text-hig-gray-400 hover:text-hig-gray-700 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* 预设列表 */}
            <div className="space-y-1">
              {PRESET_USERS.map((user) => {
                const isSelected = draft.operator_name === user.name && draft.operator_dept === user.dept;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectPreset(user)}
                    className={`w-full text-left p-2 rounded-hig flex items-start justify-between gap-1.5 transition ${
                      isSelected
                        ? 'bg-[#0071E3]/10 border border-[#0071E3]/30'
                        : 'hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-hig-gray-900 text-xs">{user.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            user.role === 'APPROVER'
                              ? 'bg-purple-100 text-purple-700'
                              : user.role === 'ADMIN'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {user.roleName}
                        </span>
                        <span className="text-[10px] text-hig-gray-500 truncate max-w-[80px]">
                          ({user.dept})
                        </span>
                      </div>
                      <p className="text-[10px] text-hig-gray-500 leading-tight mt-0.5">{user.desc}</p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0071E3] shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {/* 自定义经办人编辑开关 */}
            <div className="pt-1.5 border-t border-[#F1F5F9]">
              {isCustomEditing ? (
                <div className="flex flex-col gap-1.5 p-1 bg-slate-50 rounded border border-[#E2E8F0]">
                  <div className="text-[10px] font-semibold text-[#475569]">自定义姓名与所属部门</div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="姓名"
                    className="px-2 py-0.5 text-xs bg-white border border-[#CBD5E1] rounded focus:outline-none focus:border-[#0071E3]"
                  />
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    placeholder="所属部门"
                    className="px-2 py-0.5 text-xs bg-white border border-[#CBD5E1] rounded focus:outline-none focus:border-[#0071E3]"
                  />
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <button
                      type="button"
                      onClick={handleSaveCustom}
                      className="px-2 py-0.5 bg-[#0071E3] text-white rounded text-[11px] font-medium"
                    >
                      确认采纳
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCustomEditing(false)}
                      className="px-2 py-0.5 bg-slate-200 text-[#475569] rounded text-[11px]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditName(draft.operator_name || '张明');
                    setEditDept(draft.operator_dept || '物资贸易二部');
                    setIsCustomEditing(true);
                  }}
                  className="w-full py-1 text-center text-[11px] text-[#0071E3] hover:underline font-medium"
                >
                  + 自定义经办人姓名与部门
                </button>
              )}
            </div>
          </div>
        )}

        {/* 当前身份按钮（点击弹出切换） */}
        <div
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 rounded-hig bg-white border border-[#CBD5E1] hover:border-[#0071E3] shadow-xs cursor-pointer transition flex items-center justify-between"
          title="点击快速切换角色身份"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                currentUserRole === 'APPROVER'
                  ? 'bg-purple-100 text-purple-700'
                  : currentUserRole === 'ADMIN'
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-blue-100 text-[#0071E3]'
              }`}
            >
              {draft.operator_name ? draft.operator_name.slice(0, 1) : '张'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-bold text-hig-gray-900 truncate max-w-[70px]">
                  {draft.operator_name || '张明'}
                </span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                    currentUserRole === 'APPROVER'
                      ? 'bg-purple-100 text-purple-700'
                      : currentUserRole === 'ADMIN'
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {currentPreset?.roleName || '经办人'}
                </span>
              </div>
              <div className="text-[10px] text-hig-gray-500 truncate max-w-[110px]">
                {draft.operator_dept || '物资贸易二部'}
              </div>
            </div>
          </div>

          <div className="flex items-center text-slate-400">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="text-[11px] text-hig-gray-400 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-hig-green" />
            <span>三端在线</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">127.0.0.1</span>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
