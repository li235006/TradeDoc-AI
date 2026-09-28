import re
from typing import Optional

from fastapi import APIRouter, Query, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from mock_erp.db import get_db
from mock_erp.exceptions import BusinessException

router = APIRouter(prefix="/api/erp", tags=["Mock ERP 主数据中心"])


@router.get("/contracts", summary="获取合同台账列表")
async def list_contracts(
    status: Optional[str] = Query(None, description="合同状态过滤: ACTIVE / EXPIRED"),
    keyword: Optional[str] = Query(None, description="合同号/签约单位/工程名称搜索"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query = {}
    if status:
        query["status"] = status
    if keyword:
        regex = re.compile(re.escape(keyword), re.IGNORECASE)
        query["$or"] = [
            {"contract_no": regex},
            {"contract_name": regex},
            {"counterparty_name": regex},
            {"project_name": regex},
        ]

    cursor = db.erp_contracts.find(query, {"_id": 0})
    contracts = await cursor.to_list(length=100)
    return {
        "code": 200,
        "message": "获取合同列表成功",
        "data": {
            "items": contracts,
            "total": len(contracts),
        },
    }


@router.get("/contracts/{contract_no}/quota", summary="获取单笔合同额度详情与可用余额")
async def get_contract_quota(
    contract_no: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    合同额度查询端点：
    返回 { contract_no, total_amount, accumulated_amount, remaining_amount, utilization_rate, is_over_quota }
    """
    contract = await db.erp_contracts.find_one({"contract_no": contract_no}, {"_id": 0})
    if not contract:
        raise BusinessException(message=f"合同 {contract_no} 不存在", code=400)

    total_amount = round(float(contract.get("total_amount", 0.0)), 2)
    accumulated_amount = round(float(contract.get("accumulated_amount", 0.0)), 2)
    remaining_amount = round(float(contract.get("remaining_amount", total_amount - accumulated_amount)), 2)
    utilization_rate = round(accumulated_amount / total_amount * 100, 2) if total_amount > 0 else 0.0
    is_over_quota = accumulated_amount > total_amount or remaining_amount < 0

    return {
        "code": 200,
        "message": "获取合同额度详情成功",
        "data": {
            "contract_no": contract["contract_no"],
            "total_amount": total_amount,
            "accumulated_amount": accumulated_amount,
            "remaining_amount": remaining_amount,
            "utilization_rate": utilization_rate,
            "is_over_quota": is_over_quota,
        },
    }


@router.get("/contracts/{contract_no}", summary="获取单笔合同履约详情与可用额度")
async def get_contract_detail(
    contract_no: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    contract = await db.erp_contracts.find_one({"contract_no": contract_no}, {"_id": 0})
    if not contract:
        raise BusinessException(message=f"合同 {contract_no} 不存在", code=400)

    return {
        "code": 200,
        "message": "获取合同详情成功",
        "data": contract,
    }


@router.get("/materials", summary="获取物资主数据与黑话别名列表")
async def list_materials(
    category: Optional[str] = Query(None, description="物资品类过滤"),
    keyword: Optional[str] = Query(None, description="品名/编码/规格/黑话俗称搜索"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query = {}
    if category:
        query["category"] = category
    if keyword:
        regex = re.compile(re.escape(keyword), re.IGNORECASE)
        query["$or"] = [
            {"material_code": regex},
            {"material_name": regex},
            {"specification": regex},
            {"aliases": {"$in": [regex]}},
        ]

    cursor = db.erp_materials.find(query, {"_id": 0})
    materials = await cursor.to_list(length=100)
    return {
        "code": 200,
        "message": "获取物资字典列表成功",
        "data": {
            "items": materials,
            "total": len(materials),
        },
    }


@router.get("/materials/{material_code}", summary="获取单种物资主数据与黑话别名详情")
async def get_material_detail(
    material_code: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    material = await db.erp_materials.find_one({"material_code": material_code}, {"_id": 0})
    if not material:
        raise BusinessException(message=f"物资编码 {material_code} 不存在", code=400)

    return {
        "code": 200,
        "message": "获取物资主数据详情成功",
        "data": material,
    }
