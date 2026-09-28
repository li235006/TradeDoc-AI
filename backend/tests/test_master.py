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
async def ensure_db_and_seed():
    """测试前后确保数据库连接及数据就绪"""
    await db_manager.connect_mongo()
    db_manager.connect_milvus()
    if db_manager.mongo_db is not None:
        await seed_master_data(db_manager.mongo_db)
    yield
    await db_manager.close_mongo()
    db_manager.close_milvus()


@pytest.mark.asyncio
async def test_get_master_contracts():
    """验证 AC-01 & AC-03: 获取 3 家闭环合同并核对可用额度与三值响应"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/master/contracts")
    
    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    assert "timestamp" in res
    assert "获取主数据合同列表成功" in res["message"]
    
    contracts = res["data"]
    assert len(contracts) >= 3

    # 映射各合同号
    contract_map = {c["contract_no"]: c for c in contracts}
    
    # 1. 远大钢铁：总额 500 万，已用 485 万，可用 15 万
    assert "2026-WZ-089" in contract_map
    yd = contract_map["2026-WZ-089"]
    assert yd["counterparty_name"] == "远大钢铁销售总公司"
    assert yd["total_amount"] == 5000000.0
    assert yd["accumulated_amount"] == 4850000.0
    assert yd["remaining_amount"] == 150000.0
    assert yd["status"] == "ACTIVE"
    assert yd["remaining_order_count"] == 2

    # 2. 华夏石化：总额 1000 万，已用 200 万，可用 800 万
    assert "2026-WZ-090" in contract_map
    hx = contract_map["2026-WZ-090"]
    assert hx["counterparty_name"] == "华夏石化销售集团"
    assert hx["total_amount"] == 10000000.0
    assert hx["accumulated_amount"] == 2000000.0
    assert hx["remaining_amount"] == 8000000.0
    assert hx["status"] == "ACTIVE"
    assert hx["remaining_order_count"] == 45

    # 3. 中原特钢：已到期 (EXPIRED)
    assert "2025-WZ-012" in contract_map
    zy = contract_map["2025-WZ-012"]
    assert zy["counterparty_name"] == "中原特钢实业有限公司"
    assert zy["status"] == "EXPIRED"


@pytest.mark.asyncio
async def test_get_master_materials():
    """验证 AC-02 & AC-03: 获取 4 类物资及黑话别名，三值响应"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/master/materials")

    assert response.status_code == 200
    res = response.json()
    assert res["code"] == 200
    assert "timestamp" in res
    assert "获取主数据物料列表成功" in res["message"]

    materials = res["data"]
    assert len(materials) >= 4

    mat_map = {m["material_code"]: m for m in materials}

    # 1. 带肋钢筋
    assert "STL-RB-400E-20" in mat_map
    steel = mat_map["STL-RB-400E-20"]
    assert steel["material_name"] == "热轧带肋钢筋"
    assert steel["standard_price"] == 4000.0
    assert "18螺纹" in steel["aliases"]
    assert "20螺纹" in steel["aliases"]

    # 2. 普碳钢板
    assert "STL-PL-Q235-10" in mat_map
    plate = mat_map["STL-PL-Q235-10"]
    assert plate["material_name"] == "普碳钢板"
    assert plate["standard_price"] == 4200.0
    assert "10个厚" in plate["aliases"]

    # 3. 无缝钢管
    assert "PIP-SM-20G-57" in mat_map
    pipe = mat_map["PIP-SM-20G-57"]
    assert pipe["material_name"] == "无缝钢管"
    assert pipe["standard_price"] == 120.0
    assert "57管" in pipe["aliases"]

    # 4. 铸钢法兰闸阀
    assert "VLV-GT-Z41H-50" in mat_map
    valve = mat_map["VLV-GT-Z41H-50"]
    assert valve["material_name"] == "铸钢法兰闸阀"
    assert valve["standard_price"] == 360.0
    assert "50闸阀" in valve["aliases"]


@pytest.mark.asyncio
async def test_contracts_filtering():
    """验证合同按状态与关键词过滤"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 按状态过滤
        res_expired = await ac.get("/api/v1/master/contracts?status=EXPIRED")
        data = res_expired.json()["data"]
        assert len(data) >= 1
        assert all(c["status"] == "EXPIRED" for c in data)

        # 按关键词过滤
        res_kw = await ac.get("/api/v1/master/contracts?keyword=远大")
        data_kw = res_kw.json()["data"]
        assert len(data_kw) == 1
        assert data_kw[0]["contract_no"] == "2026-WZ-089"


@pytest.mark.asyncio
async def test_materials_filtering_and_single_lookup():
    """验证物资按关键词过滤与单物料查询"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 按黑话别名关键词搜索
        res_search = await ac.get("/api/v1/master/materials?keyword=10个厚")
        data = res_search.json()["data"]
        assert len(data) == 1
        assert data[0]["material_code"] == "STL-PL-Q235-10"

        # 单编码查询
        res_single = await ac.get("/api/v1/master/materials/PIP-SM-20G-57")
        assert res_single.json()["code"] == 200
        assert res_single.json()["data"]["material_name"] == "无缝钢管"
