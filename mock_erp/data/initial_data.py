import json
import logging
from pathlib import Path
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("mock_erp.seed")

# 定位外部数据源文件目录
SEEDS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "seeds"


def load_seeds(filename: str) -> List[Dict[str, Any]]:
    """从外部种子数据文件加载模拟数据，杜绝代码内硬编码"""
    file_path = SEEDS_DIR / filename
    if not file_path.exists():
        logger.warning(f"Seed file not found: {file_path}")
        return []
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


INITIAL_CONTRACTS = load_seeds("contracts.json")
INITIAL_MATERIALS = load_seeds("materials.json")
INITIAL_ORDERS = load_seeds("orders.json")


async def init_seed_data(db: AsyncIOMotorDatabase) -> None:
    """初始化并同步中台种子数据（合同、物料、初始订单）与关键索引"""
    logger.info("Initializing mock ERP seed data and indexes from external data files...")

    # 1. 创建唯一索引
    await db.erp_contracts.create_index("contract_no", unique=True)
    await db.erp_materials.create_index("material_code", unique=True)
    await db.erp_orders.create_index("order_no", unique=True)
    await db.erp_orders.create_index([("contract_no", 1), ("erp_status", 1)])
    await db.erp_orders.create_index([("created_at", -1)])

    # 2. 注入合同数据 (upsert)
    contracts = load_seeds("contracts.json")
    for c in contracts:
        await db.erp_contracts.update_one(
            {"contract_no": c["contract_no"]},
            {"$set": c},
            upsert=True,
        )

    # 3. 注入物料数据 (upsert)
    materials = load_seeds("materials.json")
    for m in materials:
        await db.erp_materials.update_one(
            {"material_code": m["material_code"]},
            {"$set": m},
            upsert=True,
        )

    # 4. 注入初始订单数据 (upsert)
    orders = load_seeds("orders.json")
    for o in orders:
        await db.erp_orders.update_one(
            {"order_no": o["order_no"]},
            {"$set": o},
            upsert=True,
        )

    logger.info(f"Mock ERP seed data initialized successfully: {len(contracts)} contracts, {len(materials)} materials, {len(orders)} orders.")
