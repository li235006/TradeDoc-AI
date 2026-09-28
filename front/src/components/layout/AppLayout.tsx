import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useTradeStore } from '../../stores/useTradeStore';

export const AppLayout: React.FC = () => {
  const { displayMode } = useTradeStore();

  if (displayMode === 'floating') {
    // 悬浮窗轻量模式 (420px 挂件面板形态)
    return (
      <div className="min-h-screen bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-[440px] h-[720px] max-h-[90vh] bg-white rounded-hig-2xl shadow-hig-float border border-black/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <Header />
          <main className="flex-1 overflow-y-auto bg-hig-bg">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-hig-bg">
      {/* 侧边导航栏 */}
      <Sidebar />

      {/* 主界面区域 */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-[#F5F5F7] p-6">
          <div className="max-w-[1600px] mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
