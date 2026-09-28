import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.db import get_mongo_db
    from app.schemas.parse import ParseChatRequest, ParseResultData
    from app.services.parser import order_parser_service
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.schemas.parse import ParseChatRequest, ParseResultData
    from backend.app.services.parser import order_parser_service

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
