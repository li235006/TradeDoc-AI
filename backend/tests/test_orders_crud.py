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
async def test_create_and_get_draft():
    """测试创建提单草稿并获取详情，验证实时风控诊断与数据持久化"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        draft_payload = {
            "contract_no": "2026-WZ-090",
            "order_type": "SALES",
            "counterparty_name": "华夏石化销售集团",
            "project_name": "苏州轨道交通 8 号线 3 标",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "PIP-SM-20G-57",
                    "material_name": "无缝钢管",
                    "specification": "20G Φ57*3.5",
                    "quantity": 100.0,
                    "unit": "米",
                    "unit_price": 120.0,
                    "match_status": "ALIGNED",
                }
            ],
        }
        res_create = await ac.post("/api/v1/orders/draft", json=draft_payload)
        assert res_create.status_code == 200
        data_create = res_create.json()["data"]
        draft_id = data_create["draft_id"]
        assert draft_id.startswith("DFT-")
        assert data_create["status"] == "DRAFT"
        assert data_create["total_amount"] == 12000.0
        assert data_create["compliance"]["level"] == "PASS"

        # 获取草稿详情
        res_get = await ac.get(f"/api/v1/orders/draft/{draft_id}")
        assert res_get.status_code == 200
        data_get = res_get.json()["data"]
        assert data_get["draft_id"] == draft_id
        assert data_get["status"] == "DRAFT"
        assert len(data_get["items"]) == 1
        assert data_get["compliance"]["can_direct_submit"] is True


@pytest.mark.asyncio
async def test_update_draft_recalculation():
    """测试草稿字段修改后，自动重新计算明细金额、订单总额并联动风控规则引擎"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 创建初始草稿
        draft_payload = {
            "contract_no": "2026-WZ-090",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 10.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
        }
        res_create = await ac.post("/api/v1/orders/draft", json=draft_payload)
        draft_id = res_create.json()["data"]["draft_id"]
        assert res_create.json()["data"]["compliance"]["level"] == "PASS"

        # 2. 修改草稿为高价物料 (+20% 偏离指导价 4000 -> 4800)
        update_payload = {
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 20.0,
                    "unit": "吨",
                    "unit_price": 4800.0,
                    "match_status": "ALIGNED",
                }
            ]
        }
        res_update = await ac.put(f"/api/v1/orders/draft/{draft_id}", json=update_payload)
        assert res_update.status_code == 200
        data_update = res_update.json()["data"]
        assert data_update["total_amount"] == 96000.0  # 20 * 4800
        # 验证实时联动合规风控诊断触发 WARNING
        assert data_update["compliance"]["level"] == "WARNING"
        assert data_update["compliance"]["deviation_rate"] == 20.0


@pytest.mark.asyncio
async def test_submit_order_over_quota_blocked_without_reason():
    """测试超额提单未填写特批理由或理由不足10字时，严格拦截并返回400"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 合同 2026-WZ-089 可用额度为 15 万，申请 80 万，超额 65 万
        over_quota_payload = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 200.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "special_approval_reason": "",  # 未填
        }
        res_submit = await ac.post("/api/v1/orders/submit", json=over_quota_payload)
        res_data = res_submit.json()
        assert res_data["code"] == 400
        assert "合同可用额度不足" in res_data["message"]
        assert "不少于10字" in res_data["message"]

        # 特批理由小于10字拦截
        over_quota_payload["special_approval_reason"] = "额度不够用"  # 5字
        res_short = await ac.post("/api/v1/orders/submit", json=over_quota_payload)
        assert res_short.json()["code"] == 400


@pytest.mark.asyncio
async def test_submit_order_special_approval_success():
    """测试超额提单填写合规特批理由(>=10字)后，成功流转为 PENDING_SPECIAL_APPROVAL 待审批订单"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        special_payload = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 200.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "special_approval_reason": "科技城数字经济产业园二期抢工期急需追加高规格钢材储备",  # >10字
        }
        # 通过 submit-special 接口提交
        res_special = await ac.post("/api/v1/orders/submit-special", json=special_payload)
        assert res_special.status_code == 200
        data_special = res_special.json()["data"]
        assert data_special["order_status"] == "PENDING_SPECIAL_APPROVAL"
        assert data_special["is_over_quota"] is True
        assert data_special["order_no"].startswith("XSDD-WZGS-")

        # 检查合同累计金额未被扣减（待特批单不直接扣减）
        contract_doc = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        assert contract_doc["accumulated_amount"] == 4850000.0


@pytest.mark.asyncio
async def test_submit_order_compliant_active_and_quota_deducted():
    """测试合规订单正式提交：状态为 ACTIVE，生成规范单号，扣减合同额度，并回写草稿状态为 SUBMITTED"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 先保存草稿
        draft_res = await ac.post(
            "/api/v1/orders/draft",
            json={
                "contract_no": "2026-WZ-090",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "PIP-SM-20G-57",
                        "material_name": "无缝钢管",
                        "specification": "20G Φ57*3.5",
                        "quantity": 1000.0,
                        "unit": "米",
                        "unit_price": 120.0,
                        "match_status": "ALIGNED",
                    }
                ],
            },
        )
        draft_id = draft_res.json()["data"]["draft_id"]

        # 获取合同初始额度
        contract_before = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-090"})
        accum_before = contract_before["accumulated_amount"]

        # 2. 提交正式订单
        submit_payload = {
            "draft_id": draft_id,
            "contract_no": "2026-WZ-090",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "PIP-SM-20G-57",
                    "material_name": "无缝钢管",
                    "specification": "20G Φ57*3.5",
                    "quantity": 1000.0,
                    "unit": "米",
                    "unit_price": 120.0,
                    "match_status": "ALIGNED",
                }
            ],
        }
        res_submit = await ac.post("/api/v1/orders/submit", json=submit_payload)
        assert res_submit.status_code == 200
        data_submit = res_submit.json()["data"]
        assert data_submit["order_status"] == "ACTIVE"
        assert data_submit["total_amount"] == 120000.0
        order_no = data_submit["order_no"]
        assert order_no.startswith("XSDD-WZGS-")

        # 3. 验证草稿回写
        draft_doc = await db_manager.mongo_db.drafts.find_one({"draft_id": draft_id})
        assert draft_doc["status"] == "SUBMITTED"
        assert draft_doc["order_no"] == order_no

        # 4. 验证合同额度扣减
        contract_after = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-090"})
        assert contract_after["accumulated_amount"] == accum_before + 120000.0


@pytest.mark.asyncio
async def test_order_idempotency_control():
    """测试幂等性控制：相同 Idempotency-Key 重复提交直接返回已生成的订单"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "contract_no": "2026-WZ-090",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "PIP-SM-20G-57",
                    "material_name": "无缝钢管",
                    "specification": "20G Φ57*3.5",
                    "quantity": 100.0,
                    "unit": "米",
                    "unit_price": 120.0,
                    "match_status": "ALIGNED",
                }
            ],
        }
        headers = {"Idempotency-Key": "IDEM-TEST-SEQ-001"}
        res1 = await ac.post("/api/v1/orders/submit", json=payload, headers=headers)
        order_no1 = res1.json()["data"]["order_no"]

        res2 = await ac.post("/api/v1/orders/submit", json=payload, headers=headers)
        order_no2 = res2.json()["data"]["order_no"]

        assert order_no1 == order_no2


@pytest.mark.asyncio
async def test_list_orders_filtering():
    """测试商贸订单台账列表查询与多维度筛选"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/orders?contract_no=2026-WZ-090&limit=10")
        assert res.status_code == 200
        data = res.json()["data"]
        assert "total" in data
        assert "list" in data
        assert isinstance(data["list"], list)
