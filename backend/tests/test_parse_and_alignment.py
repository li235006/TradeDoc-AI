import pytest
from httpx import AsyncClient, ASGITransport
import pymupdf

try:
    from app.main import app
    from app.db import db_manager
    from app.db.seed import seed_master_data
    from app.services.semantic import semantic_service
except ImportError:
    from backend.app.main import app
    from backend.app.db import db_manager
    from backend.app.db.seed import seed_master_data
    from backend.app.services.semantic import semantic_service


@pytest.fixture(autouse=True)
async def setup_db_and_vectors():
    await db_manager.connect_mongo()
    db_manager.connect_milvus()
    if db_manager.mongo_db is not None:
        await seed_master_data(db_manager.mongo_db)
        if db_manager.milvus_client is not None:
            await semantic_service.sync_materials_to_milvus(db_manager.mongo_db, db_manager.milvus_client)
    yield
    await db_manager.close_mongo()
    db_manager.close_milvus()


@pytest.mark.asyncio
async def test_material_vector_alignment_endpoint():
    """验证 AC-02: POST /api/v1/master/materials/align 向量近似检索端点"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 现场黑话 1: "18螺纹" -> 热轧带肋钢筋
        res1 = await ac.post("/api/v1/master/materials/align", json={"text": "18螺纹"})
        assert res1.status_code == 200
        d1 = res1.json()["data"]
        assert d1["material_code"] == "STL-RB-400E-20"
        assert d1["material_name"] == "热轧带肋钢筋"
        assert d1["match_status"] == "ALIGNED"
        assert d1["score"] >= 0.85

        # 2. 现场黑话 2: "10个厚" -> 普碳钢板
        res2 = await ac.post("/api/v1/master/materials/align", json={"text": "10个厚"})
        assert res2.status_code == 200
        d2 = res2.json()["data"]
        assert d2["material_code"] == "STL-PL-Q235-10"
        assert d2["material_name"] == "普碳钢板"
        assert d2["match_status"] == "ALIGNED"
        assert d2["score"] >= 0.85

        # 3. 现场黑话 3: "57管" -> 无缝钢管
        res3 = await ac.post("/api/v1/master/materials/align", json={"text": "57管"})
        assert res3.status_code == 200
        d3 = res3.json()["data"]
        assert d3["material_code"] == "PIP-SM-20G-57"
        assert d3["material_name"] == "无缝钢管"
        assert d3["match_status"] == "ALIGNED"

        # 4. 现场黑话 4: "50闸阀" -> 铸钢法兰闸阀
        res4 = await ac.post("/api/v1/master/materials/align", json={"text": "50闸阀"})
        assert res4.status_code == 200
        d4 = res4.json()["data"]
        assert d4["material_code"] == "VLV-GT-Z41H-50"
        assert d4["material_name"] == "铸钢法兰闸阀"
        assert d4["match_status"] == "ALIGNED"

        # 5. 未知/不相关物料 -> UNMATCHED
        res5 = await ac.post("/api/v1/master/materials/align", json={"text": "绝密未知航天特种陶瓷材料"})
        assert res5.status_code == 200
        d5 = res5.json()["data"]
        assert d5["match_status"] == "UNMATCHED"
        assert d5["score"] < 0.60


@pytest.mark.asyncio
async def test_parse_chat_endpoint_compliant():
    """验证 AC-01 & AC-03: 文本提单要素抽取与合规风控联动 (合规通过场景)"""
    payload = {
        "text": "走2026-WZ-090合同，订购1000米57管，送到相城区盾构基地",
        "session_id": "test-chat-01",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/parse/chat", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]

    # 验证草稿实体抽取与向量对齐
    draft = data["draft"]
    assert draft["contract_no"] == "2026-WZ-090"
    assert draft["counterparty_name"] == "华夏石化销售集团"
    assert len(draft["items"]) == 1
    item = draft["items"][0]
    assert item["material_code"] == "PIP-SM-20G-57"
    assert item["material_name"] == "无缝钢管"
    assert item["quantity"] == 1000.0
    assert item["unit"] == "米"
    assert item["unit_price"] == 120.0
    assert item["total_amount"] == 120000.0
    assert item["match_status"] == "ALIGNED"

    # 验证合规规则引擎判定
    compliance = data["compliance"]
    assert compliance["level"] == "PASS"
    assert compliance["is_compliant"] is True
    assert compliance["can_direct_submit"] is True

    # 验证配额
    quota = data["quota"]
    assert quota["is_over_quota"] is False
    assert quota["remaining_quota_amount"] == 8000000.0


@pytest.mark.asyncio
async def test_parse_chat_endpoint_over_quota():
    """验证 AC-01 & AC-03: 文本提单抽取与超额特批联动 (超额预警场景)"""
    payload = {
        "text": "给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同，后天送到一号工地",
        "session_id": "test-chat-02",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/parse/chat", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]

    draft = data["draft"]
    assert draft["contract_no"] == "2026-WZ-089"
    assert draft["counterparty_name"] == "远大钢铁销售总公司"
    assert draft["total_amount"] == 800000.0
    assert draft["is_over_quota"] is True

    # 80万 超过剩余可用 15万，超额 65万
    quota = data["quota"]
    assert quota["is_over_quota"] is True
    assert quota["over_amount"] == 650000.0

    compliance = data["compliance"]
    assert compliance["level"] == "BLOCKED"
    assert compliance["over_amount"] == 650000.0
    assert compliance["can_special_submit"] is True

    assert "650,000.00" in data["clarification"]


@pytest.mark.asyncio
async def test_parse_ocr_pdf_endpoint():
    """验证 AC-01: 单据 PDF OCR 结构化提单解析端点"""
    # 构造轻量单据 PDF 内存流
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text(
        (50, 100),
        "物资送货发票签收单\n关联合同：2026-WZ-090\n物资名称：57管\n发货数量：1000米\n单价：120元\n签收单位：华夏石化销售集团",
        fontname="china-ss",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/parse/ocr",
            files={"file": ("delivery_bill.pdf", pdf_bytes, "application/pdf")},
            data={"contract_no": "2026-WZ-090"},
        )

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]

    assert data["draft"]["contract_no"] == "2026-WZ-090"
    assert data["draft"]["items"][0]["material_code"] == "PIP-SM-20G-57"
    assert data["draft"]["items"][0]["quantity"] == 1000.0
    assert "57管" in data["ocr_raw_text"]
    assert data["compliance"]["level"] == "PASS"
