import pytest
from httpx import AsyncClient, ASGITransport

try:
    from app.main import app
    from app.db import db_manager
    from app.db.seed import seed_master_data
except ImportError:
    from backend.app.main import app
    from backend.app.db import db_manager
    from backend.app.db.seed import seed_master_data


@pytest.fixture(autouse=True)
async def setup_db():
    await db_manager.connect_mongo()
    db_manager.connect_milvus()
    if db_manager.mongo_db is not None:
        await seed_master_data(db_manager.mongo_db)
    yield
    await db_manager.close_mongo()
    db_manager.close_milvus()


@pytest.mark.asyncio
async def test_case_a_compliant_pass():
    """Case A (合规通过): 华夏石化合同额度充裕，物料对齐且价格公允，三态结果 PASS"""
    payload = {
        "contract_no": "2026-WZ-090",
        "items": [
            {
                "item_seq": 1,
                "material_code": "PIP-SM-20G-57",
                "material_name": "无缝钢管",
                "specification": "20G Φ57*3.5",
                "quantity": 1000.0,
                "unit": "米",
                "unit_price": 120.00,
                "total_amount": 120000.00,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 120000.00,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]
    assert data["level"] == "PASS"
    assert data["is_compliant"] is True
    assert data["over_amount"] == 0.0
    assert data["deviation_rate"] == 0.0
    assert data["can_direct_submit"] is True
    assert data["can_special_submit"] is False
    assert len(data["rule_items"]) == 0


@pytest.mark.asyncio
async def test_case_b_price_deviation_warning():
    """Case B (高价预警特批): 单价 4800 偏离指导价 4000 超 15%，触发 WARNING 预警"""
    payload = {
        "contract_no": "2026-WZ-090",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 10.0,
                "unit": "吨",
                "unit_price": 4800.00,  # +20% 偏离
                "total_amount": 48000.00,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 48000.00,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]
    assert data["level"] == "WARNING"
    assert data["is_compliant"] is False
    assert data["deviation_rate"] == 20.0
    assert data["can_direct_submit"] is False
    assert data["can_special_submit"] is True

    rule_codes = [r["rule_code"] for r in data["rule_items"]]
    assert "RULE_PRICE_DEVIATION" in rule_codes


@pytest.mark.asyncio
async def test_case_c_contract_over_quota_blocked():
    """Case C (超额阻断): 远大合同仅剩 15 万可用，提单 80 万超额 65 万，触发 BLOCKED"""
    payload = {
        "contract_no": "2026-WZ-089",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 200.0,
                "unit": "吨",
                "unit_price": 4000.00,
                "total_amount": 800000.00,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 800000.00,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]
    assert data["level"] == "BLOCKED"
    assert data["is_compliant"] is False
    assert data["over_amount"] == 650000.00
    assert data["can_direct_submit"] is False
    assert data["can_special_submit"] is True  # 允许走超额特批流程

    rule_codes = [r["rule_code"] for r in data["rule_items"]]
    assert "RULE_CONTRACT_OVER_QUOTA" in rule_codes


@pytest.mark.asyncio
async def test_case_d_material_unmatched_blocked():
    """Case D (物资未匹配字典阻断): 包含未对齐物料，严禁提单且不可特批"""
    payload = {
        "contract_no": "2026-WZ-090",
        "items": [
            {
                "item_seq": 1,
                "material_code": "NON-EXISTENT-CODE",
                "material_name": "未知黑化物料",
                "quantity": 5.0,
                "unit": "吨",
                "unit_price": 3000.00,
                "match_status": "UNMATCHED",
            }
        ],
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    data = res["data"]
    assert data["level"] == "BLOCKED"
    assert data["can_direct_submit"] is False
    assert data["can_special_submit"] is False

    rule_codes = [r["rule_code"] for r in data["rule_items"]]
    assert "RULE_MATERIAL_UNMATCHED" in rule_codes


@pytest.mark.asyncio
async def test_case_contract_expired_blocked():
    """Case (合同效期阻断): 中原特钢合同处于 EXPIRED 状态，强制阻断"""
    payload = {
        "contract_no": "2025-WZ-012",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-PL-Q235-10",
                "material_name": "普碳钢板",
                "specification": "Q235B 10*1500*6000",
                "quantity": 10.0,
                "unit": "吨",
                "unit_price": 4200.00,
                "match_status": "ALIGNED",
            }
        ],
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    data = res["data"]
    assert data["level"] == "BLOCKED"
    assert data["can_direct_submit"] is False
    assert data["can_special_submit"] is False

    rule_codes = [r["rule_code"] for r in data["rule_items"]]
    assert "RULE_CONTRACT_EXPIRED" in rule_codes


@pytest.mark.asyncio
async def test_case_low_price_deviation_warning():
    """AC-04: 低价偏离 (-20%) 双向偏离触发 WARNING 预警"""
    payload = {
        "contract_no": "2026-WZ-090",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 10.0,
                "unit": "吨",
                "unit_price": 3200.00,  # -20% 偏离指导价 4000
                "total_amount": 32000.00,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 32000.00,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/compliance/verify", json=payload)

    assert response.status_code == 200
    res = response.json()
    data = res["data"]
    assert data["level"] == "WARNING"
    assert data["is_compliant"] is False
    assert abs(data["deviation_rate"]) == 20.0
    rule_codes = [r["rule_code"] for r in data["rule_items"]]
    assert "RULE_PRICE_DEVIATION" in rule_codes
