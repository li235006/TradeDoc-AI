import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FileSpreadsheet,
  Layers,
  Database,
  Sparkles,
  Bot
} from 'lucide-react';

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

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 h-screen flex flex-col frosted-glass-sidebar border-r border-black/[0.08] select-none flex-shrink-0 z-20">
      {/* Brand & Traffic light Header */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-black/[0.06]">
        {/* macOS style traffic dots */}
        <div className="flex items-center gap-1.5 mr-1">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/50" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/50" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/50" />
        </div>
        <div className="flex items-center gap-2 font-semibold text-hig-gray-900 tracking-tight text-sm">
          <div className="w-6 h-6 rounded-hig-sm bg-hig-blue flex items-center justify-center text-white shadow-hig-sm">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span>TradeDoc AI</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold text-hig-gray-500 uppercase tracking-wider">
          业务功能通道
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
                    ? 'bg-hig-blue text-white shadow-hig-sm'
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
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-hig-gray-200 text-hig-gray-600'
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

      {/* Footer Info */}
      <div className="p-3 border-t border-black/[0.06] text-xs text-hig-gray-500 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-hig-gray-700">经办人：李强</span>
          <span className="text-[11px] bg-hig-gray-200/80 px-1.5 py-0.5 rounded text-hig-gray-600">物资一部</span>
        </div>
        <div className="text-[11px] text-hig-gray-400 mt-1 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-hig-green" />
          <span>服务状态：正常在线</span>
        </div>
      </div>
    </aside>
  );
};
