import pytest
from httpx import AsyncClient, ASGITransport

try:
    from app.main import app
    from app.core.exceptions import BusinessException
except ImportError:
    from backend.app.main import app
    from backend.app.core.exceptions import BusinessException


@pytest.mark.asyncio
async def test_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert "timestamp" in data
    assert "TradeDoc AI Backend" in data["message"]


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
    
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["code"] == 200
    assert "timestamp" in res_json
    assert res_json["message"] == "服务健康检查通过"
    assert res_json["data"]["status"] == "UP"
    assert res_json["data"]["mongodb"] == "CONNECTED"
    assert res_json["data"]["milvus"] == "CONNECTED"


@pytest.mark.asyncio
async def test_api_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/health")
    
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["code"] == 200
    assert "timestamp" in res_json
    assert res_json["data"]["status"] == "UP"


@pytest.mark.asyncio
async def test_cors_headers():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            }
        )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.asyncio
async def test_business_and_validation_exceptions():
    # 动态注册测试异常路由
    @app.get("/test/business-err")
    async def throw_biz_error():
        raise BusinessException(message="物料价格偏离基准价超限", code=400)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 业务异常响应
        res_biz = await ac.get("/test/business-err")
        assert res_biz.status_code == 200
        biz_json = res_biz.json()
        assert biz_json["code"] == 400
        assert biz_json["message"] == "物料价格偏离基准价超限"
        assert biz_json["data"] is None
        assert "timestamp" in biz_json
