import pytest
import httpx
from mock_erp.main import app
from mock_erp.db import db_manager


@pytest.fixture
async def client():
    await db_manager.connect()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    await db_manager.close()


@pytest.mark.asyncio
async def test_health_check_success(client):
    # 1. 验证主探针 /health
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    assert "健康检查通过" in body["message"]
    assert body["data"]["status"] == "UP"
    assert body["data"]["service"] == "mock_erp"
    assert body["data"]["database"]["mongodb"] == "CONNECTED"

    # 2. 验证 API 别名探针 /api/health
    res_alias = await client.get("/api/health")
    assert res_alias.status_code == 200
    assert res_alias.json()["code"] == 200

    # 3. 验证 ERP 别名探针 /api/erp/health
    res_erp = await client.get("/api/erp/health")
    assert res_erp.status_code == 200
    assert res_erp.json()["code"] == 200


@pytest.mark.asyncio
async def test_root_endpoint(client):
    res = await client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    assert "TradeDoc AI Mock ERP" in body["data"]["app"]


@pytest.mark.asyncio
async def test_database_manager_health():
    await db_manager.connect()
    try:
        health = await db_manager.check_health()
        assert health["status"] == "CONNECTED"
        assert "tradedoc_ai" in health["db_name"]
    finally:
        await db_manager.close()
