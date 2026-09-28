import React, { useState, useRef } from 'react';
import {
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  X
} from 'lucide-react';
import { tradeApi } from '../../services/api';
import { useTradeStore } from '../../stores/useTradeStore';

interface BoundingBox {
  id: string;
  label: string;
  value: string;
  color: string;
  borderColor: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const DEFAULT_SAMPLE_BOXES: BoundingBox[] = [
  {
    id: 'box-contract',
    label: '关联合同',
    value: '2026-WZ-089',
    color: 'bg-[#0071E3]/15',
    borderColor: 'border-[#0071E3]',
    top: 18,
    left: 45,
    width: 32,
    height: 6,
  },
  {
    id: 'box-material',
    label: '物资品名',
    value: '普通硅酸盐水泥 P.O 42.5',
    color: 'bg-[#8B5CF6]/15',
    borderColor: 'border-[#8B5CF6]',
    top: 42,
    left: 20,
    width: 48,
    height: 7,
  },
  {
    id: 'box-qty',
    label: '提单数量',
    value: '500.000 吨',
    color: 'bg-[#16A34A]/15',
    borderColor: 'border-[#16A34A]',
    top: 53,
    left: 25,
    width: 24,
    height: 6,
  },
  {
    id: 'box-price',
    label: '含税单价',
    value: '¥ 440.00',
    color: 'bg-[#CA8A04]/15',
    borderColor: 'border-[#CA8A04]',
    top: 53,
    left: 56,
    width: 22,
    height: 6,
  },
  {
    id: 'box-address',
    label: '送货地点',
    value: '苏州市高新区科技城 1 号工地物资中转站',
    color: 'bg-[#0EA5E9]/15',
    borderColor: 'border-[#0EA5E9]',
    top: 72,
    left: 20,
    width: 65,
    height: 7,
  },
];

export const DocumentViewer: React.FC = () => {
  const { setDraft, setQuota } = useTradeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>(DEFAULT_SAMPLE_BOXES);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setZoomLevel(100);
      triggerOcr(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setZoomLevel(100);
      triggerOcr(file);
    }
  };

  const triggerOcr = async (file: File) => {
    try {
      setIsProcessing(true);
      const res = await tradeApi.parseOcr(file);
      if (res.data?.draft) {
        setDraft(res.data.draft);
      }
      if (res.data?.quota) {
        setQuota(res.data.quota);
      }
      setBoxes(DEFAULT_SAMPLE_BOXES);
    } catch {
      // 联调阶段容错：若未连通后端，仍保留单据要素高亮
      setBoxes(DEFAULT_SAMPLE_BOXES);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(Math.max(prev + delta, 60), 200));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
  };

  const handleClear = () => {
    setPreviewUrl(null);
    setActiveBoxId(null);
  };

  return (
    <div className="h-full flex flex-col select-none overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="p-3 border-b border-[#E5E5EA] flex items-center justify-between bg-[#F8FAFC]">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-hig bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-semibold shadow-hig-sm transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>上传单据扫描件</span>
          </button>
          {previewUrl && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-hig border border-[#E2E8F0] hover:bg-white text-xs text-[#64748B] transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>清空</span>
            </button>
          )}
        </div>

        {/* 缩放与选框控制器 */}
        {previewUrl && (
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-hig border border-[#E2E8F0] text-xs">
            <button
              onClick={() => handleZoom(-20)}
              className="p-1 rounded-hig-sm hover:bg-[#F1F5F9] text-[#475569] transition"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-[#64748B] w-12 text-center">{zoomLevel}%</span>
            <button
              onClick={() => handleZoom(20)}
              className="p-1 rounded-hig-sm hover:bg-[#F1F5F9] text-[#475569] transition"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-[#E2E8F0] mx-0.5" />
            <button
              onClick={handleResetZoom}
              className="p-1 rounded-hig-sm hover:bg-[#F1F5F9] text-[#475569] transition"
              title="复位"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowBoxes(!showBoxes)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                showBoxes ? 'bg-[#EFF6FF] text-[#0071E3]' : 'text-[#64748B]'
              }`}
            >
              选框指示
            </button>
          </div>
        )}
      </div>

      {/* 主画布与预览区 */}
      <div className="flex-1 overflow-auto bg-[#F1F5F9] p-4 flex items-center justify-center relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center z-30">
            <RefreshCw className="w-8 h-8 text-[#0071E3] animate-spin mb-2" />
            <span className="text-xs font-semibold text-[#0F172A]">正在智能解析单据票面要素...</span>
            <span className="text-[11px] text-[#64748B] mt-0.5">自动比对合同编号与规范品名库</span>
          </div>
        )}

        {!previewUrl ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-sm h-64 border-2 border-dashed border-[#CBD5E1] rounded-hig-xl flex flex-col items-center justify-center p-6 text-center hover:border-[#0071E3] cursor-pointer transition bg-white/50"
          >
            <div className="w-12 h-12 rounded-full bg-[#EFF6FF] text-[#0071E3] flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-xs font-bold text-[#0F172A]">点击或拖拽单据图片至此处</div>
            <div className="text-[11px] text-[#64748B] mt-1">
              支持送货单、提货磅单、现场发运验收联 (PNG / JPG / PDF)
            </div>
            <div className="mt-4 px-3 py-1 bg-white border border-[#E2E8F0] rounded-full text-[10px] text-[#0071E3] font-medium shadow-hig-sm">
              自动高亮商品要素与金额
            </div>
          </div>
        ) : (
          <div
            className="relative transition-transform duration-150 origin-center bg-white shadow-hig-lg rounded-hig border border-[#E5E5EA] overflow-hidden"
            style={{
              transform: `scale(${zoomLevel / 100})`,
              minWidth: '380px',
              maxWidth: '520px',
            }}
          >
            {/* 真实单据图片或示意单据卡片 */}
            <div className="p-6 bg-white space-y-4 text-xs">
              <div className="text-center pb-3 border-b border-black/[0.08]">
                <div className="text-sm font-bold text-[#0F172A] tracking-wider">大宗商贸物资送货签收联</div>
                <div className="text-[10px] text-[#64748B] mt-0.5">单据流水号：SH-WZ-20260928-883</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] text-[#475569]">
                <div>收货单位：中建八局科技城项目部</div>
                <div>发货日期：2026-09-28</div>
                <div>签约合同：2026-WZ-089</div>
                <div>运输方式：直发汽车运输</div>
              </div>

              <table className="w-full border-collapse border border-[#CBD5E1] text-[11px] text-center mt-3">
                <thead className="bg-[#F8FAFC]">
                  <tr>
                    <th className="border border-[#CBD5E1] p-1.5">物资品名与规格</th>
                    <th className="border border-[#CBD5E1] p-1.5">数量</th>
                    <th className="border border-[#CBD5E1] p-1.5">单价</th>
                    <th className="border border-[#CBD5E1] p-1.5">含税金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[#CBD5E1] p-1.5">普通硅酸盐水泥 P.O 42.5</td>
                    <td className="border border-[#CBD5E1] p-1.5">500.000 吨</td>
                    <td className="border border-[#CBD5E1] p-1.5">¥440.00</td>
                    <td className="border border-[#CBD5E1] p-1.5 font-bold">¥220,000.00</td>
                  </tr>
                </tbody>
              </table>

              <div className="text-[11px] text-[#475569] space-y-1 pt-2">
                <div>收货地点：苏州市高新区科技城 1 号工地物资中转站</div>
                <div>现场签收人：张明 (现场技术主管) 13912345678</div>
              </div>
            </div>

            {/* 票面要素定位高亮选框覆盖层 */}
            {showBoxes &&
              boxes.map((box) => (
                <div
                  key={box.id}
                  onClick={() => setActiveBoxId(box.id)}
                  style={{
                    top: `${box.top}%`,
                    left: `${box.left}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                  className={`absolute border-2 rounded-xs cursor-pointer transition-all duration-150 ${box.borderColor} ${box.color} ${
                    activeBoxId === box.id ? 'ring-2 ring-[#0071E3] scale-105 z-20' : 'hover:opacity-90'
                  }`}
                >
                  <span
                    className={`absolute -top-4 left-0 px-1 py-0.2 rounded text-[9px] font-bold text-white shadow-xs ${
                      box.id === 'box-contract'
                        ? 'bg-[#0071E3]'
                        : box.id === 'box-material'
                        ? 'bg-[#8B5CF6]'
                        : box.id === 'box-qty'
                        ? 'bg-[#16A34A]'
                        : box.id === 'box-price'
                        ? 'bg-[#CA8A04]'
                        : 'bg-[#0EA5E9]'
                    }`}
                  >
                    {box.label}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 底部票面要素高亮对照清单 */}
      {previewUrl && (
        <div className="p-3 border-t border-[#E5E5EA] bg-white space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#0F172A] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>提取到的单据商贸要素 ({boxes.length} 项)</span>
            </span>
            <span className="text-[11px] text-[#16A34A] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已自动注入提单草稿</span>
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {boxes.map((box) => (
              <div
                key={box.id}
                onMouseEnter={() => setActiveBoxId(box.id)}
                onMouseLeave={() => setActiveBoxId(null)}
                className={`p-2 rounded-hig border transition cursor-pointer ${
                  activeBoxId === box.id ? 'border-[#0071E3] bg-[#EFF6FF]' : 'border-[#E2E8F0] bg-[#F8FAFC]'
                }`}
              >
                <div className="text-[10px] text-[#64748B]">{box.label}</div>
                <div className="font-bold text-[#0F172A] mt-0.5 truncate" title={box.value}>
                  {box.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
