import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Edit2,
  Save,
  X,
  FileText,
  Info,
  Check,
  ChevronRight,
  ShieldCheck,
  Building2,
  Trash2,
} from 'lucide-react';
import { tradeApi } from '../../services/api';
import { useTradeStore } from '../../stores/useTradeStore';
import { ExcelParsedRow, OrderItem } from '../../types';

interface FileMetadata {
  name: string;
  size: string;
  parsedAt: string;
}

export const BatchImportView: React.FC = () => {
  const navigate = useNavigate();
  const setDraft = useTradeStore((state) => state.setDraft);

  // 上传与解析状态
  const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 解析结果列表与就地编辑状态
  const [rows, setRows] = useState<ExcelParsedRow[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<Partial<ExcelParsedRow>>({});

  // 筛选与搜索
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'ERROR'>('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 提示信息定时关闭
  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3500);
  };

  // 统计指标计算
  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.status === 'VALID').length;
    const error = rows.filter((r) => r.status === 'ERROR').length;
    const totalAmount = rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    const contracts = Array.from(new Set(rows.map((r) => r.contract_no).filter(Boolean)));
    const validPercentage = total > 0 ? Math.round((valid / total) * 100) : 0;
    const errorPercentage = total > 0 ? Math.round((error / total) * 100) : 0;

    return {
      total,
      valid,
      error,
      totalAmount,
      contracts,
      validPercentage,
      errorPercentage,
    };
  }, [rows]);

  // 下载标准商贸订单 Excel 模板 (真实后端流式下载)
  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setErrorMessage(null);
    try {
      const blob = await tradeApi.downloadExcelTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'TradeDoc_Order_Template.xlsx';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showToast('标准商贸订单模板已成功下载');
    } catch (err: any) {
      setErrorMessage(err.message || '模板下载失败，请检查网络或后端服务');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // 处理文件上传与服务端解析校验
  const processUploadedFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMessage('仅支持上传 .xlsx 或 .xls 格式的标准 Excel 文件');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    try {
      const res = await tradeApi.parseExcel(file);
      const parseData = res.data;

      setFileMeta({
        name: file.name,
        size: sizeFormatted,
        parsedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      });

      setRows(parseData.rows || []);
      setEditingIndex(null);
      showToast(`成功解析 ${parseData.total_rows} 行单据，合规 ${parseData.valid_rows} 笔`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Excel 文件解析校验异常，请确认表格格式与网络状态');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
    // 重置 input 以便允许重复上传同名文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 拖拽支持
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // 开启就地行级编辑
  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingRow({ ...rows[index] });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingRow({});
  };

  // 保存就地编辑修正
  const handleSaveEdit = (index: number) => {
    if (!editingRow) return;

    const qty = Number(editingRow.quantity) || 0;
    const price = Number(editingRow.unit_price) || 0;
    const amount = Number((qty * price).toFixed(2));

    const updatedRow: ExcelParsedRow = {
      ...rows[index],
      contract_no: editingRow.contract_no?.trim() || rows[index].contract_no,
      counterparty_name: editingRow.counterparty_name?.trim() || rows[index].counterparty_name,
      material_name: editingRow.material_name?.trim() || rows[index].material_name,
      specification: editingRow.specification?.trim() || rows[index].specification,
      quantity: qty,
      unit: editingRow.unit?.trim() || rows[index].unit,
      unit_price: price,
      total_amount: amount,
      // 经人工修正且必备要素完整，自动将状态晋升为 VALID
      status: editingRow.contract_no?.trim() && editingRow.material_name?.trim() && qty > 0 ? 'VALID' : rows[index].status,
      error_msg:
        editingRow.contract_no?.trim() && editingRow.material_name?.trim() && qty > 0
          ? '✅ 已完成就地人工核验与校准，待转入提单'
          : rows[index].error_msg,
    };

    const newRows = [...rows];
    newRows[index] = updatedRow;
    setRows(newRows);
    setEditingIndex(null);
    setEditingRow({});
    showToast(`第 ${updatedRow.row_index} 行明细已成功就地校准`);
  };

  // 删除单行
  const handleDeleteRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    if (editingIndex === index) {
      setEditingIndex(null);
    }
    showToast('该记录已从批量清单中移除');
  };

  // 导出异常行清单 (CSV 格式 UTF-8 BOM 防止乱码)
  const handleExportErrors = () => {
    const errorList = rows.filter((r) => r.status === 'ERROR');
    if (errorList.length === 0) {
      showToast('当前清单中无异常行，无需导出');
      return;
    }

    const headers = [
      '行号',
      '签约单位',
      '关联合同号',
      '规范物资品名',
      '规格型号',
      '数量',
      '单位',
      '含税单价',
      '金额小计',
      '异常诊断说明',
    ];

    const csvContent =
      '\uFEFF' +
      [
        headers.join(','),
        ...errorList.map((r) =>
          [
            r.row_index,
            `"${(r.counterparty_name || '').replace(/"/g, '""')}"`,
            `"${(r.contract_no || '').replace(/"/g, '""')}"`,
            `"${(r.material_name || '').replace(/"/g, '""')}"`,
            `"${(r.specification || '').replace(/"/g, '""')}"`,
            r.quantity,
            `"${r.unit || '吨'}"`,
            r.unit_price,
            r.total_amount,
            `"${(r.error_msg || '').replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TradeDoc_待修正异常明细_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
    showToast(`已成功导出 ${errorList.length} 笔异常待核验记录`);
  };

  // 转入全屏工作台草稿
  const handleTransferToWorkbench = (onlyValid: boolean = true) => {
    const targetRows = onlyValid ? rows.filter((r) => r.status === 'VALID') : rows;

    if (targetRows.length === 0) {
      setErrorMessage(onlyValid ? '当前暂无校验合规的明细行，请先校准异常行' : '暂无单据明细');
      return;
    }

    const primaryRow = targetRows[0];
    const items: OrderItem[] = targetRows.map((r, idx) => ({
      item_seq: idx + 1,
      material_code: r.material_code || `MAT-${String(idx + 1).padStart(4, '0')}`,
      material_name: r.material_name,
      specification: r.specification || '-',
      quantity: Number(r.quantity) || 0,
      unit: r.unit || '吨',
      unit_price: Number(r.unit_price) || 0,
      total_amount: Number(r.total_amount) || Number((r.quantity * r.unit_price).toFixed(2)),
      match_status: r.status === 'VALID' ? 'ALIGNED' : 'CONFIRM',
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);

    setDraft({
      order_type: 'SALES',
      contract_no: primaryRow.contract_no || '',
      counterparty_name: primaryRow.counterparty_name || '',
      project_name: primaryRow.project_name || '',
      delivery_address: primaryRow.delivery_address || '',
      items,
      total_amount: totalAmount,
      business_name: '国内传统贸易',
      procurement_mode: '直发',
      business_tag: '批量Excel导入',
    });

    navigate('/workbench');
  };

  // 筛选后的展示行
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        return (
          r.contract_no?.toLowerCase().includes(kw) ||
          r.counterparty_name?.toLowerCase().includes(kw) ||
          r.material_name?.toLowerCase().includes(kw) ||
          r.specification?.toLowerCase().includes(kw) ||
          r.error_msg?.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [rows, statusFilter, searchKeyword]);

  return (
    <div className="h-full flex flex-col gap-3.5 bg-[#F5F5F7] p-4 overflow-y-auto">
      {/* 隐藏的文件上传 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 消息提示浮层 */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{successToast}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 顶部标题栏与导航 */}
      <div className="bg-white rounded-xl px-5 py-3.5 border border-[#E5E5EA] shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0071E3] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            TD
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[#1D1D1F]">
                Excel 批量导入与多维度规则校验中心
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#86868B]">
                v2.1.0 穿透校验版
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              支持标准销售要料计划批量流式解析、主数据黑话对齐与合同履约风控就地校准
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-xs font-medium text-[#0071E3] transition shadow-xs disabled:opacity-50"
          >
            {isDownloadingTemplate ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0071E3]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#0071E3]" />
            )}
            <span>下载官方标准模板</span>
          </button>

          <button
            onClick={() => navigate('/workbench')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-xs font-medium text-[#334155] transition shadow-xs"
          >
            <span>返回提单工作台</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#64748B]" />
          </button>
        </div>
      </div>

      {/* 批量导入流程导航条 (对齐 batch_import.pen bi_1k2) */}
      <div className="bg-white rounded-xl px-5 py-2.5 border border-[#E5E5EA] shadow-sm flex items-center justify-between">
        {/* 步骤 1 */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              fileMeta ? 'bg-[#16A34A] text-white' : 'bg-[#0071E3] text-white'
            }`}
          >
            {fileMeta ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
          </div>
          <div>
            <div className="text-xs font-medium text-[#1E293B]">上传 Excel 单据清单</div>
            <div className="text-[10px] text-[#86868B]">
              {fileMeta ? `已完成 (${fileMeta.name} ${fileMeta.size})` : '支持 .xlsx / .xls 格式'}
            </div>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-[#CBD5E1]" />

        {/* 步骤 2 */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isUploading
                ? 'bg-[#0071E3] text-white animate-pulse'
                : rows.length > 0
                ? 'bg-[#16A34A] text-white'
                : 'bg-[#E2E8F0] text-[#64748B]'
            }`}
          >
            {rows.length > 0 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
          </div>
          <div>
            <div
              className={`text-xs ${
                rows.length > 0 || isUploading ? 'font-bold text-[#0071E3]' : 'font-medium text-[#1E293B]'
              }`}
            >
              智能解析与多维度规则校验
            </div>
            <div className="text-[10px] text-[#86868B]">
              {isUploading
                ? '后台服务穿透核验中...'
                : rows.length > 0
                ? `核验完成 (${rows.length} 笔单据已解析)`
                : '待上传后自动执行'}
            </div>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-[#CBD5E1]" />

        {/* 步骤 3 */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              rows.length > 0
                ? stats.error > 0
                  ? 'bg-amber-500 text-white'
                  : 'bg-[#0071E3] text-white'
                : 'bg-[#E2E8F0] text-[#64748B]'
            }`}
          >
            3
          </div>
          <div>
            <div className="text-xs font-medium text-[#1E293B]">异常就地校对与批量入库</div>
            <div className="text-[10px] text-[#86868B]">
              {rows.length > 0
                ? stats.error > 0
                  ? `待就地修正 ${stats.error} 笔异常`
                  : '要素完整，可直接转入提交'
                : '待提交入库生成正式单号'}
            </div>
          </div>
        </div>
      </div>

      {/* 当尚未上传文件时：空态大拖拽区域 */}
      {rows.length === 0 && !isUploading && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex-1 bg-white rounded-xl border-2 border-dashed transition-all p-10 flex flex-col items-center justify-center text-center shadow-sm min-h-[360px] ${
            isDragging
              ? 'border-[#0071E3] bg-blue-50/40'
              : 'border-[#CBD5E1] hover:border-[#0071E3]/50'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-[#0071E3] mb-4 shadow-xs">
            <Upload className="w-8 h-8" />
          </div>
          <h2 className="text-sm font-bold text-[#0F172A]">
            拖拽商贸订单 Excel 清单至此，或点击浏览上传
          </h2>
          <p className="text-xs text-[#64748B] mt-1.5 max-w-md leading-relaxed">
            支持标准 .xlsx, .xls 格式。服务端自动对齐物料编码库，实时穿透关联合同配额与单价浮动风控校验。
          </p>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-[#0071E3] hover:bg-[#0071E3]/90 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>选择本地文件上传</span>
            </button>

            <button
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="px-4 py-2.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#334155] rounded-lg text-xs font-medium transition flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>获取标准导入模板</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6 mt-10 max-w-xl text-left border-t border-[#F1F5F9] pt-6">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[#1E293B]">全维度风控核算</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  合同有效期、已占用配额及超额自动标识
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-[#0071E3] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[#1E293B]">物料黑话模糊映射</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  自动将业务简称对齐标准品名与规格
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[#1E293B]">就地双击异常修正</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  无需重新传表，表格行内直接校对修正
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 上传中状态 */}
      {isUploading && (
        <div className="flex-1 bg-white rounded-xl border border-[#E5E5EA] p-12 flex flex-col items-center justify-center shadow-sm min-h-[360px]">
          <RefreshCw className="w-10 h-10 text-[#0071E3] animate-spin mb-4" />
          <h2 className="text-sm font-bold text-[#0F172A]">正在逐行流式解析与多维度规则穿透核验...</h2>
          <p className="text-xs text-[#64748B] mt-1">
            正在校验关联合同有效性、计算物料向量相似度并评估履约配额占用情况
          </p>
        </div>
      )}

      {/* 当已解析出明细数据时：指标汇总卡片 + 校验明细表格 */}
      {rows.length > 0 && !isUploading && (
        <>
          {/* 文件信息与 4 个 KPI 指标行 (对齐 batch_import.pen bi_1kn) */}
          <div className="grid grid-cols-12 gap-3">
            {/* 解析文件卡片 (5列) */}
            <div className="col-span-4 bg-white rounded-xl p-3 border border-[#E5E5EA] shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] flex items-center justify-center text-[#16A34A] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0F172A] truncate" title={fileMeta?.name}>
                    {fileMeta?.name || '批量要料清单.xlsx'}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    {fileMeta?.size} · 解析时间 {fileMeta?.parsedAt} · 提取 {stats.total} 笔记录
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 rounded bg-[#F1F5F9] hover:bg-slate-200 text-[11px] font-medium text-[#334155] transition flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3 text-[#64748B]" />
                  <span>重传</span>
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-2 py-1 rounded border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[11px] font-medium text-[#0071E3] transition flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>模板</span>
                </button>
              </div>
            </div>

            {/* 指标 1: 导入单据总金额 (2列) */}
            <div className="col-span-2 bg-white rounded-xl p-3 border border-[#E5E5EA] shadow-xs flex flex-col justify-between">
              <div className="text-[11px] font-medium text-[#64748B]">导入单据总金额</div>
              <div className="text-sm font-bold text-[#0F172A] my-0.5">
                ¥ {stats.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#94A3B8]">本次批量申请总占用</div>
            </div>

            {/* 指标 2: 校验合规通过 (2列) */}
            <div className="col-span-2 bg-white rounded-xl p-3 border border-[#E5E5EA] shadow-xs flex flex-col justify-between">
              <div className="text-[11px] font-medium text-[#64748B]">校验合规通过</div>
              <div className="text-sm font-bold text-[#16A34A] my-0.5">
                {stats.valid} 笔 ({stats.validPercentage}%)
              </div>
              <div className="text-[10px] text-[#94A3B8]">要素完整且配额合规</div>
            </div>

            {/* 指标 3: 异常待修正 (2列) */}
            <div className="col-span-2 bg-white rounded-xl p-3 border border-[#E5E5EA] shadow-xs flex flex-col justify-between">
              <div className="text-[11px] font-medium text-[#64748B]">异常待修正</div>
              <div
                className={`text-sm font-bold my-0.5 ${
                  stats.error > 0 ? 'text-[#E11D48]' : 'text-slate-400'
                }`}
              >
                {stats.error} 笔 ({stats.errorPercentage}%)
              </div>
              <div className="text-[10px] text-[#94A3B8] truncate">
                {stats.error > 0 ? '⚠️ 含合同或品名异常' : '暂无阻断异常'}
              </div>
            </div>

            {/* 指标 4: 关联执行合同 (2列) */}
            <div className="col-span-2 bg-white rounded-xl p-3 border border-[#E5E5EA] shadow-xs flex flex-col justify-between">
              <div className="text-[11px] font-medium text-[#64748B]">关联执行合同</div>
              <div className="text-sm font-bold text-[#0071E3] my-0.5">
                {stats.contracts.length} 份商贸合同
              </div>
              <div className="text-[10px] text-[#94A3B8] truncate" title={stats.contracts.join(', ')}>
                {stats.contracts.slice(0, 2).join(' / ') || '未识别合同'}
              </div>
            </div>
          </div>

          {/* 批量校验表格卡片 (对齐 batch_import.pen bi_1li) */}
          <div className="flex-1 bg-white rounded-xl border border-[#E5E5EA] shadow-sm flex flex-col min-h-0 overflow-hidden">
            {/* 表格工具栏：过滤与搜索 */}
            <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    statusFilter === 'ALL'
                      ? 'bg-[#0071E3] text-white shadow-xs'
                      : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                  }`}
                >
                  全部明细 ({stats.total})
                </button>
                <button
                  onClick={() => setStatusFilter('VALID')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    statusFilter === 'VALID'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                  }`}
                >
                  合规通过 ({stats.valid})
                </button>
                <button
                  onClick={() => setStatusFilter('ERROR')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    statusFilter === 'ERROR'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                  }`}
                >
                  异常待修正 ({stats.error})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="搜索合同号 / 单位 / 物资品名..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="px-3 py-1 text-xs border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#0071E3] w-56"
                />
                <button
                  onClick={() => {
                    setRows([]);
                    setFileMeta(null);
                  }}
                  className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-md border border-rose-200 transition"
                  title="清空当前导入列表"
                >
                  清空列表
                </button>
              </div>
            </div>

            {/* 表格主体 */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead className="bg-[#F8FAFC] sticky top-0 z-10 border-b border-[#E2E8F0]">
                  <tr className="text-[11px] font-bold text-[#475569]">
                    <th className="py-2.5 px-3 w-12 text-center">行号</th>
                    <th className="py-2.5 px-3 w-28">校验状态</th>
                    <th className="py-2.5 px-3 w-24">单据类型</th>
                    <th className="py-2.5 px-3 w-48">签约单位 (需方/供方)</th>
                    <th className="py-2.5 px-3 w-40">关联合同编号</th>
                    <th className="py-2.5 px-3 w-52">规范物资品名与型号规格</th>
                    <th className="py-2.5 px-3 w-24 text-right">数量</th>
                    <th className="py-2.5 px-3 w-24 text-right">含税单价</th>
                    <th className="py-2.5 px-3 w-28 text-right">金额小计</th>
                    <th className="py-2.5 px-3">履约核验与异常诊断说明</th>
                    <th className="py-2.5 px-3 w-24 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-[#94A3B8]">
                        没有符合筛选条件的明细条目
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const actualIndex = rows.findIndex((r) => r.row_index === row.row_index);
                      const isEditing = editingIndex === actualIndex;

                      return (
                        <tr
                          key={row.row_index}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            row.status === 'ERROR' ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          {/* 行号 */}
                          <td className="py-2.5 px-3 text-center text-[#64748B] font-mono">
                            {row.row_index}
                          </td>

                          {/* 状态胶囊 */}
                          <td className="py-2.5 px-3">
                            {row.status === 'VALID' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#DCFCE7] text-[#16A34A]">
                                <Check className="w-3 h-3 stroke-[3]" />
                                校验通过
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-[#E11D48]">
                                <AlertTriangle className="w-3 h-3" />
                                异常待修正
                              </span>
                            )}
                          </td>

                          {/* 单据类型 */}
                          <td className="py-2.5 px-3 text-[#334155] font-medium">销售订单</td>

                          {/* 签约单位 */}
                          <td className="py-2.5 px-3 text-[#0F172A] font-medium truncate max-w-[190px]" title={row.counterparty_name}>
                            {row.counterparty_name || '-'}
                          </td>

                          {/* 关联合同编号 (支持就地编辑) */}
                          <td className="py-2.5 px-3 font-mono">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingRow.contract_no || ''}
                                onChange={(e) =>
                                  setEditingRow({ ...editingRow, contract_no: e.target.value })
                                }
                                placeholder="输入有效合同号"
                                className="w-full px-2 py-1 border border-[#0071E3] rounded text-xs bg-white focus:outline-none"
                              />
                            ) : (
                              <span
                                className={`${
                                  !row.contract_no ? 'text-rose-500 font-semibold' : 'text-[#334155]'
                                }`}
                              >
                                {row.contract_no || '未关联有效合同'}
                              </span>
                            )}
                          </td>

                          {/* 物资品名与规格型号 (支持就地编辑) */}
                          <td className="py-2.5 px-3">
                            {isEditing ? (
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={editingRow.material_name || ''}
                                  onChange={(e) =>
                                    setEditingRow({ ...editingRow, material_name: e.target.value })
                                  }
                                  placeholder="规范品名"
                                  className="w-full px-2 py-0.5 border border-[#0071E3] rounded text-xs bg-white"
                                />
                                <input
                                  type="text"
                                  value={editingRow.specification || ''}
                                  onChange={(e) =>
                                    setEditingRow({ ...editingRow, specification: e.target.value })
                                  }
                                  placeholder="规格型号"
                                  className="w-full px-2 py-0.5 border border-[#CBD5E1] rounded text-[11px] bg-white text-slate-600"
                                />
                              </div>
                            ) : (
                              <div>
                                <div className="font-semibold text-[#0F172A]">{row.material_name}</div>
                                {row.specification && (
                                  <div className="text-[11px] text-[#64748B]">
                                    {row.specification}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 数量 */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingRow.quantity ?? ''}
                                onChange={(e) =>
                                  setEditingRow({
                                    ...editingRow,
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-[#0071E3] rounded text-xs text-right bg-white"
                              />
                            ) : (
                              <span className="font-mono text-[#334155]">
                                {Number(row.quantity).toLocaleString()} {row.unit || '吨'}
                              </span>
                            )}
                          </td>

                          {/* 含税单价 */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingRow.unit_price ?? ''}
                                onChange={(e) =>
                                  setEditingRow({
                                    ...editingRow,
                                    unit_price: Number(e.target.value),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-[#0071E3] rounded text-xs text-right bg-white"
                              />
                            ) : (
                              <span className="font-mono text-[#334155]">
                                ¥ {Number(row.unit_price).toLocaleString()}
                              </span>
                            )}
                          </td>

                          {/* 金额小计 */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A]">
                            {isEditing ? (
                              `¥ ${(
                                (Number(editingRow.quantity) || 0) *
                                (Number(editingRow.unit_price) || 0)
                              ).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
                            ) : (
                              `¥ ${Number(row.total_amount).toLocaleString('zh-CN', {
                                minimumFractionDigits: 2,
                              })}`
                            )}
                          </td>

                          {/* 履约核验与异常诊断说明 */}
                          <td className="py-2.5 px-3">
                            {row.status === 'VALID' ? (
                              <div className="text-[11px] text-[#16A34A] leading-snug">
                                {row.error_msg || '✅ 履约额度充裕，物料已对齐标准库'}
                              </div>
                            ) : (
                              <div className="text-[11px] text-[#E11D48] leading-snug font-medium">
                                ⚠️ {row.error_msg || '缺少关键履约要素，请双击校对'}
                              </div>
                            )}
                          </td>

                          {/* 操作列 */}
                          <td className="py-2.5 px-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleSaveEdit(actualIndex)}
                                  className="p-1 rounded bg-[#0071E3] text-white hover:bg-[#0071E3]/90 transition"
                                  title="保存校准"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1 rounded bg-slate-200 text-[#64748B] hover:bg-slate-300 transition"
                                  title="取消"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleStartEdit(actualIndex)}
                                  className="p-1 rounded text-[#0071E3] hover:bg-blue-50 transition"
                                  title="就地校准该条目"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRow(actualIndex)}
                                  className="p-1 rounded text-rose-500 hover:bg-rose-50 transition"
                                  title="移除该行"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 底部批量操作栏 (对齐 batch_import.pen bi_1ok) */}
          <div className="bg-white rounded-xl px-5 py-3 border border-[#E5E5EA] shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-[#334155]">
              <Info className="w-4 h-4 text-[#0071E3] shrink-0" />
              <span>
                共导入 <strong className="text-[#0F172A]">{stats.total}</strong> 行数据，
                <strong className="text-[#16A34A]">{stats.valid}</strong> 笔校验合规可直接提单，
                {stats.error > 0 ? (
                  <>
                    <strong className="text-[#E11D48]">{stats.error}</strong> 笔存在业务异常需在线校对
                  </>
                ) : (
                  <span>全量合规</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {stats.error > 0 && (
                <button
                  onClick={handleExportErrors}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-xs font-medium text-[#334155] transition shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-[#475569]" />
                  <span>导出异常行清单</span>
                </button>
              )}

              {stats.valid > 0 && stats.error > 0 && (
                <button
                  onClick={() => handleTransferToWorkbench(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-slate-200 border border-[#CBD5E1] text-xs font-semibold text-[#334155] transition shadow-xs"
                >
                  <span>仅提单合规行 ({stats.valid}笔)</span>
                </button>
              )}

              <button
                onClick={() => handleTransferToWorkbench(stats.error === 0)}
                disabled={stats.valid === 0}
                className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                <span>批量转入提单工作台</span>
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
