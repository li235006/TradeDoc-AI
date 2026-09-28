import logging
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymilvus import MilvusClient, connections

try:
    from app.config import settings
except ImportError:
    from backend.app.config import settings

logger = logging.getLogger("tradedoc.db")


class DatabaseManager:
    def __init__(self):
        self.mongo_client: Optional[AsyncIOMotorClient] = None
        self.mongo_db: Optional[AsyncIOMotorDatabase] = None
        self.milvus_client: Optional[MilvusClient] = None

    async def connect_mongo(self) -> None:
        """初始化 MongoDB 异步客户端与连接池"""
        try:
            logger.info(f"Connecting to MongoDB at {settings.MONGO_URI}...")
            self.mongo_client = AsyncIOMotorClient(
                settings.MONGO_URI,
                minPoolSize=10,
                maxPoolSize=100,
                serverSelectionTimeoutMS=3000,
                connectTimeoutMS=3000,
                socketTimeoutMS=5000,
            )
            # 探测连通性
            await self.mongo_client.admin.command("ping")
            self.mongo_db = self.mongo_client[settings.MONGO_DB_NAME]
            logger.info("MongoDB connection pool initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise e

    def connect_milvus(self) -> None:
        """初始化 Milvus 客户端与连接"""
        try:
            logger.info(f"Connecting to Milvus at {settings.milvus_uri}...")
            self.milvus_client = MilvusClient(
                uri=settings.milvus_uri,
                timeout=3.0,
            )
            # 同时注册 ORM connections alias 供高级语义操作使用
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                if not connections.has_connection("default"):
                    connections.connect(
                        alias="default",
                        host=settings.MILVUS_HOST,
                        port=str(settings.MILVUS_PORT),
                        timeout=3.0,
                    )
            logger.info("Milvus connection initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            raise e

    async def close_mongo(self) -> None:
        """关闭 MongoDB 连接"""
        if self.mongo_client:
            logger.info("Closing MongoDB client...")
            self.mongo_client.close()
            self.mongo_client = None
            self.mongo_db = None

    def close_milvus(self) -> None:
        """关闭 Milvus 连接"""
        if self.milvus_client:
            logger.info("Closing Milvus client...")
            try:
                self.milvus_client.close()
            except Exception:
                pass
            self.milvus_client = None
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                if connections.has_connection("default"):
                    connections.disconnect("default")
        except Exception:
            pass

    async def check_mongo_health(self) -> Dict[str, Any]:
        """检查 MongoDB 探针状态"""
        try:
            if not self.mongo_client:
                temp_client = AsyncIOMotorClient(
                    settings.MONGO_URI,
                    serverSelectionTimeoutMS=2000,
                )
                await temp_client.admin.command("ping")
                temp_client.close()
                return {"status": "CONNECTED"}
            await self.mongo_client.admin.command("ping")
            return {"status": "CONNECTED"}
        except Exception as e:
            logger.warning(f"MongoDB health check failed: {e}")
            return {"status": "DISCONNECTED", "error": str(e)}

    def check_milvus_health(self) -> Dict[str, Any]:
        """检查 Milvus 探针状态"""
        try:
            client = self.milvus_client or MilvusClient(uri=settings.milvus_uri, timeout=2.0)
            collections = client.list_collections()
            return {"status": "CONNECTED", "collections_count": len(collections)}
        except Exception as e:
            logger.warning(f"Milvus health check failed: {e}")
            return {"status": "DISCONNECTED", "error": str(e)}

    async def check_all_health(self) -> Dict[str, Any]:
        """综合探针检查"""
        mongo_status = await self.check_mongo_health()
        milvus_status = self.check_milvus_health()
        is_healthy = (
            mongo_status.get("status") == "CONNECTED"
            and milvus_status.get("status") == "CONNECTED"
        )
        return {
            "overall_status": "UP" if is_healthy else "DEGRADED",
            "mongodb": mongo_status,
            "milvus": milvus_status,
        }


db_manager = DatabaseManager()


def get_mongo_db() -> AsyncIOMotorDatabase:
    if db_manager.mongo_db is None:
        raise RuntimeError("MongoDB is not initialized. Ensure app lifespan is active.")
    return db_manager.mongo_db


def get_mongo_client() -> AsyncIOMotorClient:
    if db_manager.mongo_client is None:
        raise RuntimeError("MongoDB client is not initialized.")
    return db_manager.mongo_client


def get_milvus_client() -> MilvusClient:
    if db_manager.milvus_client is None:
        raise RuntimeError("Milvus client is not initialized.")
    return db_manager.milvus_client
