import uuid
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
async def test_submit_missing_idempotency_key_blocked():
    """AC-09: 验证提交端点缺失 Idempotency-Key 请求头时强阻断并返回 400"""
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
                    "quantity": 10.0,
                    "unit": "米",
                    "unit_price": 120.0,
                    "match_status": "ALIGNED",
                }
            ],
        }
        # 不传 Idempotency-Key
        res1 = await ac.post("/api/v1/orders/submit", json=payload)
        assert res1.json()["code"] == 400
        assert "Idempotency-Key" in res1.json()["message"]

        res2 = await ac.post("/api/v1/orders/submit-special", json=payload)
        assert res2.json()["code"] == 400
        assert "Idempotency-Key" in res2.json()["message"]


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
        headers = {"Idempotency-Key": "IDEM-TEST-OQ-01"}
        res_submit = await ac.post("/api/v1/orders/submit", json=over_quota_payload, headers=headers)
        res_data = res_submit.json()
        assert res_data["code"] == 400
        assert "合同可用额度不足" in res_data["message"]
        assert "不少于10字" in res_data["message"]

        # 特批理由小于10字拦截
        over_quota_payload["special_approval_reason"] = "额度不够用"  # 5字
        headers2 = {"Idempotency-Key": "IDEM-TEST-OQ-02"}
        res_short = await ac.post("/api/v1/orders/submit", json=over_quota_payload, headers=headers2)
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
        headers = {"Idempotency-Key": f"IDEM-SPEC-{uuid.uuid4().hex[:8]}"}
        # 通过 submit-special 接口提交
        res_special = await ac.post("/api/v1/orders/submit-special", json=special_payload, headers=headers)
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
        headers = {"Idempotency-Key": f"IDEM-ACT-{uuid.uuid4().hex[:8]}"}
        res_submit = await ac.post("/api/v1/orders/submit", json=submit_payload, headers=headers)
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
        test_key = f"IDEM-SEQ-{uuid.uuid4().hex[:8]}"
        headers = {"Idempotency-Key": test_key}
        res1 = await ac.post("/api/v1/orders/submit", json=payload, headers=headers)
        order_no1 = res1.json()["data"]["order_no"]

        res2 = await ac.post("/api/v1/orders/submit", json=payload, headers=headers)
        order_no2 = res2.json()["data"]["order_no"]

        assert order_no1 == order_no2


@pytest.mark.asyncio
async def test_approve_order_endpoint_and_quota_flow():
    """AC-01 ~ AC-04: 测试 EP-06 /orders/{order_no}/approve 完整三态流转 (PASS/RETURN/REJECT) 与额度原子扣减断言"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        import urllib.parse
        approve_headers = {
            "X-User-Name": urllib.parse.quote("王风控总监"),
            "X-User-Dept": urllib.parse.quote("商贸风控审批部"),
            "X-User-Role": "APPROVER",
        }
        special_payload = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 50.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "special_approval_reason": "现场工期提前追加采购50吨高标号钢筋",
        }

        # -----------------------------
        # 1. 态一：APPROVE / PASS 审批放行 -> 状态转 ACTIVE，原子扣减合同额度
        # -----------------------------
        headers1 = {"Idempotency-Key": f"IDEM-APP-PASS-{uuid.uuid4().hex[:8]}"}
        res_sub1 = await ac.post("/api/v1/orders/submit-special", json=special_payload, headers=headers1)
        order_no1 = res_sub1.json()["data"]["order_no"]

        contract_before_pass = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        accum_before_pass = contract_before_pass["accumulated_amount"]
        rem_before_pass = contract_before_pass["remaining_amount"]

        approve_body_pass = {
            "decision": "PASS",
            "comment": "现场情况属实，商务部报备完成，同意特批放行",
        }
        res_pass = await ac.post(f"/api/v1/orders/{order_no1}/approve", json=approve_body_pass, headers=approve_headers)
        assert res_pass.status_code == 200
        data_pass = res_pass.json()["data"]
        assert data_pass["order_status"] == "ACTIVE"
        assert data_pass["decision"] == "PASS"
        assert data_pass["approver_name"] == "王风控总监"
        assert "2026" in data_pass["approved_at"]

        # 断言 PASS 后合同配额扣减
        contract_after_pass = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        assert contract_after_pass["accumulated_amount"] == accum_before_pass + 200000.0
        assert contract_after_pass["remaining_amount"] == rem_before_pass - 200000.0

        # 断言 MongoDB orders 集合状态更新为 ACTIVE
        order_doc1 = await db_manager.mongo_db.orders.find_one({"order_no": order_no1})
        assert order_doc1["order_status"] == "ACTIVE"
        assert order_doc1["approver_name"] == "王风控总监"

        # -----------------------------
        # 2. 态二：RETURN 退回修改 -> 状态转 RETURNED，合同额度不占用
        # -----------------------------
        headers2 = {"Idempotency-Key": f"IDEM-APP-RET-{uuid.uuid4().hex[:8]}"}
        res_sub2 = await ac.post("/api/v1/orders/submit-special", json=special_payload, headers=headers2)
        order_no2 = res_sub2.json()["data"]["order_no"]

        contract_before_ret = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        accum_before_ret = contract_before_ret["accumulated_amount"]

        return_body = {
            "decision": "RETURN",
            "comment": "请经办人补充现场监理签收确认单后再报",
        }
        res_ret = await ac.post(f"/api/v1/orders/{order_no2}/approve", json=return_body, headers=approve_headers)
        assert res_ret.status_code == 200
        data_ret = res_ret.json()["data"]
        assert data_ret["order_status"] == "RETURNED"
        assert data_ret["decision"] == "RETURN"
        assert data_ret["approval_comment"] == "请经办人补充现场监理签收确认单后再报"

        # 断言 RETURN 后合同配额绝不扣减
        contract_after_ret = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        assert contract_after_ret["accumulated_amount"] == accum_before_ret

        # 断言 MongoDB orders 集合状态更新为 RETURNED
        order_doc2 = await db_manager.mongo_db.orders.find_one({"order_no": order_no2})
        assert order_doc2["order_status"] == "RETURNED"

        # -----------------------------
        # 3. 态三：REJECT 驳回作废 -> 状态转 REJECTED，合同额度不占用
        # -----------------------------
        headers3 = {"Idempotency-Key": f"IDEM-APP-REJ-{uuid.uuid4().hex[:8]}"}
        res_sub3 = await ac.post("/api/v1/orders/submit-special", json=special_payload, headers=headers3)
        order_no3 = res_sub3.json()["data"]["order_no"]

        contract_before_rej = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        accum_before_rej = contract_before_rej["accumulated_amount"]

        reject_body = {
            "action": "REJECT",
            "comment": "工程预算超标且严重违规，审批驳回作废",
        }
        res_rej = await ac.post(f"/api/v1/orders/{order_no3}/approve", json=reject_body, headers=approve_headers)
        assert res_rej.status_code == 200
        data_rej = res_rej.json()["data"]
        assert data_rej["order_status"] == "REJECTED"
        assert data_rej["decision"] == "REJECT"

        # 断言 REJECT 后合同配额绝不扣减
        contract_after_rej = await db_manager.mongo_db.contracts.find_one({"contract_no": "2026-WZ-089"})
        assert contract_after_rej["accumulated_amount"] == accum_before_rej

        # 断言 MongoDB orders 集合状态更新为 REJECTED
        order_doc3 = await db_manager.mongo_db.orders.find_one({"order_no": order_no3})
        assert order_doc3["order_status"] == "REJECTED"


@pytest.mark.asyncio
async def test_get_contract_quota_endpoint():
    """AC-03: 测试 EP-08 GET /api/v1/contracts/{contract_no}/quota 端点"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/contracts/2026-WZ-089/quota")
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["contract_no"] == "2026-WZ-089"
        assert data["contract_total_amount"] == 5000000.0
        assert "remaining_quota_amount" in data
        assert "remaining_amount" in data
        assert "is_over_quota" in data

        # 测试不存在合同返回 400
        res_err = await ac.get("/api/v1/contracts/NON-EXISTENT-CONTRACT/quota")
        assert res_err.json()["code"] == 400


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
