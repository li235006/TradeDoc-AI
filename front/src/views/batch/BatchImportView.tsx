import { Upload, Download } from 'lucide-react';

export const BatchImportView: React.FC = () => {
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-white rounded-hig-xl p-6 border border-black/[0.06] shadow-hig-sm flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-hig-gray-900">Excel 批量单据导入中心</h2>
          <p className="text-xs text-hig-gray-500 mt-1">
            支持标准商贸订单批量模板导入，服务端逐行流式解析，实时穿透合规规则校验。
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-hig border border-black/[0.08] hover:bg-black/[0.04] text-xs font-medium text-hig-gray-700 transition">
          <Download className="w-3.5 h-3.5 text-hig-blue" />
          <span>下载标准 Excel 模板</span>
        </button>
      </div>

      <div className="flex-1 bg-white rounded-hig-xl border border-black/[0.06] shadow-hig-sm p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-hig-blue/10 flex items-center justify-center text-hig-blue mb-4">
          <Upload className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-semibold text-hig-gray-900">拖拽 Excel 文件至此，或点击浏览</h3>
        <p className="text-xs text-hig-gray-500 mt-1 max-w-sm">
          支持 .xlsx, .xls 格式。单次最大支持 500 行物资条目，自动计算超额与品名纠错。
        </p>
        <button className="mt-5 px-4 py-2 bg-hig-blue text-white rounded-hig text-xs font-medium shadow-hig-sm hover:bg-hig-blue/90 transition">
          选择文件上传
        </button>
      </div>
    </div>
  );
};
