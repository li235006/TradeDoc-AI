import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { tradeApi } from '../../services/api';
import {
  Layers,
  Sparkles,
  FileSpreadsheet,
  Database
} from 'lucide-react';

const titleMap: Record<string, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  '/workbench': { title: '智能提单工作台', subtitle: '自然语言提取 · 规范品名对齐 · 合同履约额度核算', icon: Sparkles },
  '/batch': { title: 'Excel 批量导入中心', subtitle: '单据批量解析 · 逐行合规校验 · 异常原位纠错', icon: FileSpreadsheet },
  '/erp': { title: '销售订单管理大盘', subtitle: '商贸订单台账 · 履约进度跟踪 · 特批审批流转', icon: Layers },
  '/master-data': { title: '合同主数据与物料字典', subtitle: '合同履约配额池 · 标准物资主档 · 行业别名对齐', icon: Database },
};

export const Header: React.FC = () => {
  const location = useLocation();
  const [healthStatus, setHealthStatus] = useState<{ online: boolean; checking: boolean }>({
    online: true,
    checking: false,
  });

  const currentInfo = titleMap[location.pathname] || {
    title: 'TradeDoc AI',
    subtitle: '商贸智能提单系统',
    icon: Sparkles,
  };
  const Icon = currentInfo.icon;

  useEffect(() => {
    // 基础心跳健康检查探针
    const check = async () => {
      try {
        setHealthStatus((prev) => ({ ...prev, checking: true }));
        await tradeApi.checkHealth();
        setHealthStatus({ online: true, checking: false });
      } catch {
        setHealthStatus({ online: false, checking: false });
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 px-6 flex items-center justify-between frosted-glass border-b border-black/[0.06] flex-shrink-0 z-10 bg-white">
      {/* Title & Path */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-hig flex items-center justify-center bg-black/[0.04] text-hig-gray-800">
          <Icon className="w-4 h-4 text-hig-blue" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-hig-gray-900">{currentInfo.title}</h1>
            <span className="text-[10px] bg-hig-blue/10 text-hig-blue font-medium px-1.5 py-0.5 rounded-full">
              商贸专版
            </span>
          </div>
          <p className="text-[11px] text-hig-gray-500 leading-tight">{currentInfo.subtitle}</p>
        </div>
      </div>

      {/* Right Actions & Health Status */}
      <div className="flex items-center gap-3">
        {/* 系统连通状态 */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.03] text-xs">
          {healthStatus.online ? (
            <>
              <div className="w-2 h-2 rounded-full bg-hig-green animate-pulse" />
              <span className="text-hig-gray-700 text-[11px] font-medium">系统在线</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-hig-orange" />
              <span className="text-hig-gray-600 text-[11px]">连接中</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
