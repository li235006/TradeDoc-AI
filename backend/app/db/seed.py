import json
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.config import settings
    from app.db import DatabaseManager, db_manager
except ImportError:
    from backend.app.config import settings
    from backend.app.db import DatabaseManager, db_manager

logger = logging.getLogger("tradedoc.seed")

# 定位外部数据源文件目录
SEEDS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "seeds"


def load_seeds(filename: str) -> List[Dict[str, Any]]:
    """从外部种子数据文件加载，杜绝代码内硬编码"""
    file_path = SEEDS_DIR / filename
    if not file_path.exists():
        logger.warning(f"Seed file not found: {file_path}")
        return []
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


CONTRACT_SEEDS: List[Dict[str, Any]] = load_seeds("contracts.json")
MATERIAL_SEEDS: List[Dict[str, Any]] = load_seeds("materials.json")


async def seed_master_data(db: AsyncIOMotorDatabase) -> Dict[str, int]:
    """向 MongoDB 注入合同与物资主数据，并建立唯一键索引"""
    logger.info("Initializing master data indexes and seeding collections from external JSON...")

    # 1. 创建唯一性索引
    await db.contracts.create_index("contract_no", unique=True)
    await db.materials.create_index("material_code", unique=True)

    # 2. 注入/更新 3 家合同
    contracts = load_seeds("contracts.json")
    contracts_count = 0
    for contract in contracts:
        await db.contracts.update_one(
            {"contract_no": contract["contract_no"]},
            {"$set": contract},
            upsert=True,
        )
        contracts_count += 1

    # 3. 注入/更新 4 类物资
    materials = load_seeds("materials.json")
    materials_count = 0
    for material in materials:
        await db.materials.update_one(
            {"material_code": material["material_code"]},
            {"$set": material},
            upsert=True,
        )
        materials_count += 1

    logger.info(f"Master data seeded successfully: {contracts_count} contracts, {materials_count} materials.")
    return {"contracts_seeded": contracts_count, "materials_seeded": materials_count}


async def main():
    """独立执行数据注入脚本入口"""
    logging.basicConfig(level=logging.INFO)
    logger.info("Starting standalone master data seed...")
    await db_manager.connect_mongo()
    try:
        await seed_master_data(db_manager.mongo_db)
    finally:
        await db_manager.close_mongo()
    logger.info("Standalone seed completed.")


if __name__ == "__main__":
    asyncio.run(main())
