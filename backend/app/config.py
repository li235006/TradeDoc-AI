import json
from functools import lru_cache
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# 定位 backend 根目录的 .env 文件
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # MongoDB 配置
    MONGO_HOST: str = "192.168.6.134"
    MONGO_PORT: int = 27017
    MONGO_DB_NAME: str = "tradedoc_ai"
    MONGO_URI: str = "mongodb://192.168.6.134:27017/tradedoc_ai"

    # Milvus 配置
    MILVUS_HOST: str = "192.168.6.134"
    MILVUS_PORT: int = 19530
    MILVUS_COLLECTION_NAME: str = "material_vector_index"

    # 模型服务配置
    DASHSCOPE_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL_NAME: str = "qwen-plus"
    QWEN_VL_MODEL_NAME: str = "qwen-vl-plus"

    # 服务运行参数
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = False
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.strip().startswith("["):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @property
    def milvus_uri(self) -> str:
        return f"http://{self.MILVUS_HOST}:{self.MILVUS_PORT}"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
