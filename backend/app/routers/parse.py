import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.db import get_mongo_db
    from app.schemas.parse import ParseChatRequest, ParseResultData, ExcelParseResultData
    from app.services.parser import order_parser_service
    from app.services.excel_parser import excel_parser_service
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.schemas.parse import ParseChatRequest, ParseResultData, ExcelParseResultData
    from backend.app.services.parser import order_parser_service
    from backend.app.services.excel_parser import excel_parser_service

logger = logging.getLogger("tradedoc.parse.router")
router = APIRouter()


@router.post("/chat", summary="文本对话提单智能解析 (两阶段管道)")
async def parse_chat(
    req: ParseChatRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-01 文本解析契约端点：
    - 阶段一：极简实体提取 (合同号/品名/吨数)
    - 阶段二：Milvus 向量近似对齐品名黑话
    - 阶段三：纯代码合同履约指标核算与实时合规诊断
    """
    result: ParseResultData = await order_parser_service.parse_chat(
        text=req.text,
        db=db,
        session_id=req.session_id,
        contract_no_hint=req.contract_no,
    )
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "message": "解析完成",
            "data": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.post("/ocr", summary="单据图片/PDF OCR 结构化提单")
async def parse_ocr(
    file: UploadFile = File(..., description="发货单据/签收凭单图片或 PDF 文件"),
    contract_no: Optional[str] = Form(None, description="预选合同编号"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-02 单据图片/PDF 结构化提单端点：
    提取发货单据中的物资明细、吨数与单价，自动对齐标准主数据并完成合规风控诊断
    """
    file_bytes = await file.read()
    result: ParseResultData = await order_parser_service.parse_ocr(
        file_bytes=file_bytes,
        filename=file.filename or "upload.pdf",
        db=db,
        contract_no_hint=contract_no,
    )
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "message": "单据识别成功",
            "data": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.get("/excel/template", summary="下载标准 Excel 导入模板")
async def download_excel_template():
    """
    EP-03 附件：下载标准商贸订单 Excel 导入模板
    包含蓝底白字表头、字段宽度优化与标准两行示例数据
    """
    stream = excel_parser_service.generate_template()
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=TradeDoc_Order_Template.xlsx"
        },
    )


@router.post("/excel", summary="批量 Excel 订单表格穿透解析与合规校验")
async def parse_excel(
    file: UploadFile = File(..., description="待解析的 Excel 文件 (.xlsx 或 .xls)"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """
    EP-03 批量 Excel 提单解析与行级穿透合规校验端点：
    支持标准/非标准列名容错映射、合同有效性、物料编码/品名语义对齐、单价 ±15% 偏离预警及数量核查
    """
    file_bytes = await file.read()
    result: ExcelParseResultData = await excel_parser_service.parse_excel(
        file_bytes=file_bytes,
        filename=file.filename or "upload.xlsx",
        db=db,
    )
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "message": "批量文件解析校验完成",
            "data": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

