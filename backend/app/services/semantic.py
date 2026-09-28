import logging
import math
import hashlib
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymilvus import MilvusClient, DataType

try:
    from app.config import settings
    from app.db import get_milvus_client
    from app.schemas.parse import MaterialAlignResult
except ImportError:
    from backend.app.config import settings
    from backend.app.db import get_milvus_client
    from backend.app.schemas.parse import MaterialAlignResult

logger = logging.getLogger("tradedoc.semantic")


def encode_text_to_vector(text: str, dim: int = 1024) -> List[float]:
    """
    语义向量编码器 (1024维)：
    融合物料大类语义区间投影与字符 n-gram 散列，生成归一化余弦语义向量
    """
    vec = [0.0] * dim
    clean_text = text.lower().strip()

    # 4 大类物资特征空间锚定
    cat_keys = {
        "rebar": (["螺纹", "钢筋", "400e", "圆钢", "rb", "带肋"], 0),
        "plate": (["厚", "板", "q235", "普板", "中厚板", "pl"], 250),
        "pipe": (["管", "无缝", "20g", "57", "sm"], 500),
        "valve": (["阀", "闸阀", "法兰", "z41h", "50", "铸钢", "gt"], 750),
    }

    for cat, (kw_list, offset) in cat_keys.items():
        for kw in kw_list:
            if kw in clean_text:
                for i in range(100):
                    vec[offset + i] += 2.5
                break

    # 细粒度 n-gram 散列
    for n in (1, 2, 3):
        for i in range(len(clean_text) - n + 1):
            gram = clean_text[i: i + n]
            h = int(hashlib.md5(gram.encode("utf-8")).hexdigest(), 16)
            idx = h % dim
            sign = 1.0 if (h >> 16) % 2 == 0 else -1.0
            vec[idx] += sign * (2.0 + 1.0 * n)

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    return vec


class SemanticAlignmentService:
    def __init__(self):
        self.collection_name = settings.MILVUS_COLLECTION_NAME

    def ensure_milvus_collection(self, client: Optional[MilvusClient] = None) -> None:
        """确保 Milvus 中的 material_vector_index 集合及索引就绪"""
        if client is None:
            client = get_milvus_client()

        if not client.has_collection(self.collection_name):
            logger.info(f"Creating Milvus collection {self.collection_name}...")
            schema = client.create_schema(auto_id=True, enable_dynamic_field=True)
            schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
            schema.add_field(field_name="material_code", datatype=DataType.VARCHAR, max_length=64)
            schema.add_field(field_name="material_name", datatype=DataType.VARCHAR, max_length=128)
            schema.add_field(field_name="specification", datatype=DataType.VARCHAR, max_length=128)
            schema.add_field(field_name="alias_text", datatype=DataType.VARCHAR, max_length=256)
            schema.add_field(field_name="standard_price", datatype=DataType.FLOAT)
            schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=1024)

            index_params = client.prepare_index_params()
            index_params.add_index(
                field_name="vector",
                metric_type="COSINE",
                index_type="IVF_FLAT",
                params={"nlist": 128},
            )

            client.create_collection(
                collection_name=self.collection_name,
                schema=schema,
                index_params=index_params,
            )
        client.load_collection(self.collection_name)

    async def sync_materials_to_milvus(
        self,
        db: AsyncIOMotorDatabase,
        client: Optional[MilvusClient] = None,
    ) -> int:
        """将 MongoDB 中的标准物资与别名批量向量化并灌入 Milvus"""
        if client is None:
            client = get_milvus_client()

        self.ensure_milvus_collection(client)

        cursor = db.materials.find({})
        materials = await cursor.to_list(length=100)
        if not materials:
            return 0

        rows = []
        for m in materials:
            aliases = m.get("aliases", [])
            # 包含物料自身名称与所有俗称别名
            names_to_index = list(set([m["material_name"]] + aliases))
            for alias in names_to_index:
                v = encode_text_to_vector(alias)
                rows.append({
                    "material_code": m["material_code"],
                    "material_name": m["material_name"],
                    "specification": m.get("specification", ""),
                    "alias_text": alias,
                    "standard_price": float(m.get("standard_price", 0.0)),
                    "vector": v,
                })

        if rows:
            # 清空旧数据或直接批量插入
            try:
                client.delete(collection_name=self.collection_name, filter="id >= 0")
            except Exception:
                pass
            client.insert(collection_name=self.collection_name, data=rows)
            client.load_collection(self.collection_name)
            logger.info(f"Synced {len(rows)} material vectors into Milvus.")
        return len(rows)

    def align_material(
        self,
        query_text: str,
        client: Optional[MilvusClient] = None,
    ) -> MaterialAlignResult:
        """
        在 Milvus 中执行向量余弦相似度检索，对齐标准物料
        - score >= 0.85: ALIGNED
        - 0.60 <= score < 0.85: PENDING_CONFIRM
        - score < 0.60: UNMATCHED
        """
        if client is None:
            client = get_milvus_client()

        self.ensure_milvus_collection(client)
        qv = encode_text_to_vector(query_text)

        search_res = client.search(
            collection_name=self.collection_name,
            data=[qv],
            limit=1,
            output_fields=[
                "material_code",
                "material_name",
                "specification",
                "standard_price",
                "alias_text",
            ],
            search_params={"metric_type": "COSINE", "params": {"nprobe": 10}},
        )

        if not search_res or not search_res[0]:
            return MaterialAlignResult(
                material_code="",
                material_name=query_text,
                specification="",
                standard_price=0.0,
                score=0.0,
                match_status="UNMATCHED",
                alias_matched=None,
            )

        top_hit = search_res[0][0]
        score = float(top_hit["distance"])
        entity = top_hit["entity"]

        if score >= 0.85:
            match_status = "ALIGNED"
        elif score >= 0.60:
            match_status = "PENDING_CONFIRM"
        else:
            match_status = "UNMATCHED"

        return MaterialAlignResult(
            material_code=entity.get("material_code", "") if match_status != "UNMATCHED" else "",
            material_name=entity.get("material_name", query_text),
            specification=entity.get("specification", ""),
            standard_price=float(entity.get("standard_price", 0.0)),
            score=round(score, 3),
            match_status=match_status,
            alias_matched=entity.get("alias_text"),
        )


semantic_service = SemanticAlignmentService()
