import os
import logging
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger("mock_erp.db")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://192.168.6.134:27017/tradedoc_ai")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "tradedoc_ai")


class DatabaseManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self) -> None:
        """初始化 MongoDB 异步连接池并验证连通性"""
        logger.info(f"Connecting to MongoDB at {MONGO_URI} (db: {MONGO_DB_NAME})...")
        self.client = AsyncIOMotorClient(
            MONGO_URI,
            minPoolSize=5,
            maxPoolSize=50,
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
            socketTimeoutMS=5000,
        )
        # 探测连通性
        await self.client.admin.command("ping")
        self.db = self.client[MONGO_DB_NAME]
        logger.info("MongoDB connection established successfully.")

    async def close(self) -> None:
        """关闭 MongoDB 连接"""
        if self.client:
            logger.info("Closing MongoDB client...")
            self.client.close()
            self.client = None
            self.db = None

    async def check_health(self) -> Dict[str, Any]:
        """检查 MongoDB 连通性探针"""
        try:
            if not self.client:
                temp_client = AsyncIOMotorClient(
                    MONGO_URI,
                    serverSelectionTimeoutMS=2000,
                )
                await temp_client.admin.command("ping")
                temp_client.close()
                return {"status": "CONNECTED", "host": MONGO_URI.split("@")[-1], "db_name": MONGO_DB_NAME}
            await self.client.admin.command("ping")
            return {"status": "CONNECTED", "host": MONGO_URI.split("@")[-1], "db_name": MONGO_DB_NAME}
        except Exception as e:
            logger.warning(f"MongoDB health check failed: {e}")
            return {"status": "DISCONNECTED", "error": str(e), "db_name": MONGO_DB_NAME}


db_manager = DatabaseManager()


def get_db() -> AsyncIOMotorDatabase:
    if db_manager.db is None:
        raise RuntimeError("MongoDB is not initialized. Ensure app lifespan is active.")
    return db_manager.db


def get_client() -> AsyncIOMotorClient:
    if db_manager.client is None:
        raise RuntimeError("MongoDB client is not initialized.")
    return db_manager.client
