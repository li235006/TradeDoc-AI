import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.db import get_mongo_db
    from app.schemas.master import ContractSchema, MaterialSchema
    from app.schemas.parse import MaterialAlignRequest
    from app.services.semantic import semantic_service
except ImportError:
    from backend.app.db import get_mongo_db
    from backend.app.schemas.master import ContractSchema, MaterialSchema
    from backend.app.schemas.parse import MaterialAlignRequest
    from backend.app.services.semantic import semantic_service


logger = logging.getLogger("tradedoc.master")
router = APIRouter()


def make_response(code: int, message: str, data: Any = None) -> JSONResponse:
    """标准三值统一响应"""
    return JSONResponse(
        status_code=200,
        content={
            "code": code,
            "message": message,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.get("/contracts", summary="获取合同主数据列表")
async def get_contracts(
    keyword: Optional[str] = Query(None, description="搜索关键词 (合同号/单位/项目)"),
    status: Optional[str] = Query(None, description="合同状态筛选 (ACTIVE/EXPIRED)"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status

    if keyword:
        regex = {"$regex": keyword, "$options": "i"}
        query["$or"] = [
            {"contract_no": regex},
            {"counterparty_name": regex},
            {"project_name": regex},
        ]

    cursor = db.contracts.find(query, {"_id": 0})
    contracts = await cursor.to_list(length=100)
    return make_response(code=200, message="获取主数据合同列表成功", data=contracts)


@router.get("/contracts/{contract_no}", summary="获取单笔合同详情")
async def get_contract_by_no(
    contract_no: str,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    contract = await db.contracts.find_one({"contract_no": contract_no}, {"_id": 0})
    if not contract:
        return make_response(code=400, message=f"未找到编号为 {contract_no} 的合同记录", data=None)
    return make_response(code=200, message="获取合同详情成功", data=contract)


@router.get("/materials", summary="获取物资主数据与黑话字典")
async def get_materials(
    keyword: Optional[str] = Query(None, description="搜索关键词 (品名/编码/黑话别名)"),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    query: Dict[str, Any] = {}
    if keyword:
        regex = {"$regex": keyword, "$options": "i"}
        query["$or"] = [
            {"material_code": regex},
            {"material_name": regex},
            {"specification": regex},
            {"aliases": regex},
        ]

    cursor = db.materials.find(query, {"_id": 0})
    materials = await cursor.to_list(length=100)
    return make_response(code=200, message="获取主数据物料列表成功", data=materials)


@router.get("/materials/{material_code}", summary="获取单个物资主数据")
async def get_material_by_code(
    material_code: str,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    material = await db.materials.find_one({"material_code": material_code}, {"_id": 0})
    if not material:
        return make_response(code=400, message=f"未找到编码为 {material_code} 的物资记录", data=None)
    return make_response(code=200, message="获取物资详情成功", data=material)


@router.post("/materials/align", summary="品名黑话 Milvus 向量近似对齐")
async def align_material_endpoint(
    req: MaterialAlignRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    query_text = req.get_query_text()
    if not query_text:
        return make_response(code=400, message="请输入需要对齐的物资别名或黑话文本", data=None)

    result = semantic_service.align_material(query_text)
    return make_response(code=200, message="物料对齐完成", data=result.model_dump())

