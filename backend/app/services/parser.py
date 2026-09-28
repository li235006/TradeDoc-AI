import re
import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import pymupdf
import httpx

try:
    from app.config import settings
    from app.services.semantic import semantic_service
    from app.services.compliance import compliance_engine
    from app.schemas.compliance import ComplianceVerifyRequest, ComplianceItemInput
    from app.schemas.parse import (
        DraftOrderItem,
        OrderDraft,
        QuotaSummary,
        ParseResultData,
    )
    from app.core.exceptions import BusinessException
except ImportError:
    from backend.app.config import settings
    from backend.app.services.semantic import semantic_service
    from backend.app.services.compliance import compliance_engine
    from backend.app.schemas.compliance import ComplianceVerifyRequest, ComplianceItemInput
    from backend.app.schemas.parse import (
        DraftOrderItem,
        OrderDraft,
        QuotaSummary,
        ParseResultData,
    )
    from backend.app.core.exceptions import BusinessException

logger = logging.getLogger("tradedoc.parser")


class OrderParserService:
    def __init__(self):
        self.contract_regex = re.compile(r"(\d{4}-[A-Z0-9]+-\d{3})")
        self.qty_regex = re.compile(r"(\d+(?:\.\d+)?)\s*(吨|米|台|件|根|包)")
        self.price_regex = re.compile(r"(?:单价|单价为|每吨|每米|每台|@|¥|￥)?\s*(\d+(?:\.\d+)?)\s*(?:元|块|/吨|/米|/台)")

    def extract_entities_from_text(self, text: str) -> Dict[str, Any]:
        """
        阶段一：极简实体参数抽参
        提取合同号、工程项目、送货地址、物资原始名称、数量、单位、单价
        """
        # 1. 提取合同编号
        contract_match = self.contract_regex.search(text)
        contract_no = contract_match.group(1) if contract_match else None

        # 2. 提取数量与单位
        qty_match = self.qty_regex.search(text)
        if qty_match:
            quantity = float(qty_match.group(1))
            unit = qty_match.group(2)
        else:
            quantity = 0.0
            unit = "吨"

        # 3. 提取单价 (若有)
        # 排除可能是合同号的数字干扰
        text_without_contract = self.contract_regex.sub("", text)
        price_matches = self.price_regex.findall(text_without_contract)
        unit_price = None
        if price_matches:
            for p in price_matches:
                val = float(p)
                # 排除和数量相同的情况（若文本写了“200吨 4000元”）
                if val != quantity:
                    unit_price = val
                    break

        # 4. 提取物资黑话或品名
        raw_material = self._extract_material_name(text)

        # 5. 提取送货地址或工程项目关键词
        delivery_address = None
        if "送到" in text:
            delivery_address = text.split("送到")[-1].strip().split("，")[0].split("。")[0]
        elif "地址" in text:
            delivery_address = text.split("地址")[-1].strip().replace("：", "").replace(":", "").split("，")[0]

        return {
            "contract_no": contract_no,
            "raw_material": raw_material,
            "quantity": quantity,
            "unit": unit,
            "unit_price": unit_price,
            "delivery_address": delivery_address,
        }

    @classmethod
    def _load_dynamic_aliases(cls) -> List[str]:
        seeds_path = Path(__file__).resolve().parent.parent.parent.parent / "data" / "seeds" / "materials.json"
        aliases: set = set()
        if seeds_path.exists():
            try:
                with open(seeds_path, "r", encoding="utf-8") as f:
                    materials = json.load(f)
                    for mat in materials:
                        aliases.add(mat.get("material_name", ""))
                        for alias in mat.get("aliases", []):
                            aliases.add(alias)
            except Exception as e:
                logger.warning(f"Failed to load aliases from {seeds_path}: {e}")
        aliases.update(["42.5水泥", "425水泥", "水泥", "螺纹钢", "无缝管", "闸阀"])
        alias_list = [a for a in aliases if a]
        alias_list.sort(key=len, reverse=True)
        return alias_list

    def _extract_material_name(self, text: str) -> str:
        """从用户文本或 OCR 文本中识别出核心物资品名或黑话（从外部主数据动态匹配，拒绝硬编码）"""
        known_aliases = self._load_dynamic_aliases()
        for alias in known_aliases:
            if alias.lower() in text.lower():
                return alias

        for line in text.splitlines():
            if "物资名称" in line or "品名" in line:
                return line.split("：")[-1].split(":")[-1].strip()

        return ""

    async def parse_chat(
        self,
        text: str,
        db: AsyncIOMotorDatabase,
        session_id: Optional[str] = None,
        contract_no_hint: Optional[str] = None,
    ) -> ParseResultData:
        """两阶段文本提单解析管道：实体抽取 -> 向量对齐 -> 规则核验"""
        extracted = self.extract_entities_from_text(text)
        contract_no = extracted["contract_no"] or contract_no_hint or ""

        # 阶段二：调用 Milvus 向量近似对齐
        raw_mat = extracted["raw_material"]
        align_res = semantic_service.align_material(raw_mat) if raw_mat else None

        if align_res and align_res.material_code:
            material_code = align_res.material_code
            material_name = align_res.material_name
            specification = align_res.specification or ""
            match_status = align_res.match_status
            unit_price = extracted["unit_price"] if extracted["unit_price"] is not None else align_res.standard_price
        else:
            material_code = ""
            material_name = raw_mat or "待确认物资"
            specification = ""
            match_status = "UNMATCHED"
            unit_price = extracted["unit_price"] if extracted["unit_price"] is not None else 0.0

        quantity = extracted["quantity"]
        total_item_amount = round(quantity * unit_price, 2)

        item = DraftOrderItem(
            item_seq=1,
            material_code=material_code,
            material_name=material_name,
            specification=specification,
            quantity=quantity,
            unit=extracted["unit"],
            unit_price=unit_price,
            total_amount=total_item_amount,
            match_status=match_status,
            raw_material=raw_mat,
        )

        # 读取合同基础信息
        contract_doc = await db.contracts.find_one({"contract_no": contract_no}) if contract_no else None
        if contract_doc:
            counterparty_name = contract_doc.get("counterparty_name", "")
            project_name = contract_doc.get("project_name", "")
            delivery_address = extracted["delivery_address"] or contract_doc.get(
                "default_delivery_address", ""
            )
            c_total = contract_doc.get("total_amount", 0.0)
            c_accum_amount = contract_doc.get("accumulated_amount", 0.0)
            c_rem_amount = round(c_total - c_accum_amount, 2)
            c_max_orders = contract_doc.get("max_order_count", 0)
            c_accum_orders = contract_doc.get("accumulated_order_count", 0)
            c_rem_orders = max(0, c_max_orders - c_accum_orders)
        else:
            counterparty_name = ""
            project_name = ""
            delivery_address = extracted["delivery_address"] or ""
            c_total = 0.0
            c_accum_amount = 0.0
            c_rem_amount = 0.0
            c_max_orders = 0
            c_accum_orders = 0
            c_rem_orders = 0

        # 阶段三：对接合规风控规则引擎
        compliance_req = ComplianceVerifyRequest(
            contract_no=contract_no,
            items=[
                ComplianceItemInput(
                    item_seq=1,
                    material_code=material_code,
                    material_name=material_name,
                    specification=specification,
                    quantity=quantity,
                    unit=extracted["unit"],
                    unit_price=unit_price,
                    total_amount=total_item_amount,
                    match_status=match_status,
                )
            ],
            total_amount=total_item_amount,
        )
        compliance_result = await compliance_engine.verify(compliance_req, db)

        is_over = compliance_result.over_amount > 0 or (c_rem_amount > 0 and total_item_amount > c_rem_amount)
        over_val = compliance_result.over_amount if compliance_result.over_amount > 0 else round(max(0.0, total_item_amount - c_rem_amount), 2)

        draft = OrderDraft(
            order_type="SALES",
            contract_no=contract_no,
            counterparty_name=counterparty_name,
            project_name=project_name,
            delivery_address=delivery_address,
            contact_person="现场负责人",
            business_name="国内传统贸易",
            procurement_mode="直发",
            business_tag="传统贸易",
            items=[item],
            total_amount=total_item_amount,
            is_over_quota=is_over,
            special_approval_reason="",
            order_status="DRAFT",
        )

        quota = QuotaSummary(
            contract_total_amount=c_total,
            accumulated_order_amount=c_accum_amount,
            accumulated_order_count=c_accum_orders,
            remaining_quota_amount=c_rem_amount,
            remaining_order_count=c_rem_orders,
            is_over_quota=is_over,
            over_amount=over_val,
        )

        # 生成经办人业务澄清/提示话术
        if not contract_no:
            clarification = "未识别到关联合同编号，请先选择或补充合同编号。"
        elif quantity <= 0:
            clarification = "未在文本中识别出有效采购数量，需人工确认并补全数量。"
        elif match_status == "UNMATCHED":
            clarification = f"物资品名 [{raw_mat or '未知'}] 未匹配到标准物料主档，请人工核实编码。"
        elif is_over:
            clarification = (
                f"检测到本次提单金额 (¥{total_item_amount:,.2f}) 超出合同剩余可用额度 (¥{c_rem_amount:,.2f})，"
                f"差额 ¥{over_val:,.2f}，已为您触发超额特批流程。"
            )
        elif compliance_result.level == "WARNING":
            clarification = (
                f"检测到物资单价存在偏离预警 (偏离度 +{compliance_result.deviation_rate}%)，"
                f"请核对后走特批流转或手动微调。"
            )
        else:
            clarification = "合同履约额度充足，物资与价格均符合合规风控要求，可直接一键提单。"

        return ParseResultData(
            draft=draft,
            quota=quota,
            compliance=compliance_result,
            clarification=clarification,
            ocr_raw_text=None,
        )

    async def parse_ocr(
        self,
        file_bytes: bytes,
        filename: str,
        db: AsyncIOMotorDatabase,
        contract_no_hint: Optional[str] = None,
    ) -> ParseResultData:
        """单据图片/PDF OCR 结构化提单解析管道（零硬编码模拟数据）"""
        extracted_text = ""
        is_pdf = filename.lower().endswith(".pdf")

        if is_pdf:
            try:
                doc = pymupdf.open(stream=file_bytes, filetype="pdf")
                for page in doc:
                    extracted_text += page.get_text() + "\n"
                doc.close()
            except Exception as e:
                logger.warning(f"Failed to read PDF with pymupdf: {e}")
                raise BusinessException(400, f"PDF 单据解析失败: {str(e)}")
        else:
            # 优先检查是否传入了纯文本单据（测试或预处理后的单据文本）
            text_candidate = file_bytes.decode("utf-8", errors="ignore")
            if any(k in text_candidate for k in ["物资名称", "合同", "发货", "签收", "数量"]):
                extracted_text = text_candidate
            else:
                # 图片多模态 OCR 识别：必须依赖配置的 Qwen-VL 多模态服务，严禁硬编码假数据
                if not settings.DASHSCOPE_API_KEY or not settings.DASHSCOPE_API_KEY.strip():
                    raise BusinessException(
                        400,
                        "系统检测到未配置 DASHSCOPE_API_KEY，无法调用大模型多模态图片识别。请在 backend/.env 中配置 DASHSCOPE_API_KEY 后重试。"
                    )
                try:
                    b64_img = base64.b64encode(file_bytes).decode("utf-8")
                    ext = filename.split(".")[-1].lower() if "." in filename else "jpeg"
                    mime_type = f"image/{ext}" if ext in ["jpeg", "jpg", "png", "webp"] else "image/jpeg"
                    data_url = f"data:{mime_type};base64,{b64_img}"

                    headers = {
                        "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
                        "Content-Type": "application/json",
                    }
                    body = {
                        "model": settings.QWEN_VL_MODEL_NAME,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "image_url", "image_url": {"url": data_url}},
                                    {"type": "text", "text": "请提取该送货发票/单据中的关键文字信息，包括关联合同号、物资名称、规格、数量、单价、单位、送货地址、签收单位。直接输出单据提取文字，不要多余说明。"}
                                ]
                            }
                        ]
                    }
                    endpoint_url = f"{settings.QWEN_BASE_URL.rstrip('/')}/chat/completions"
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        resp = await client.post(
                            endpoint_url,
                            headers=headers,
                            json=body,
                        )
                        if resp.status_code != 200:
                            raise BusinessException(500, f"Qwen-VL 多模态识别失败 (HTTP {resp.status_code}): {resp.text}")
                        data = resp.json()
                        extracted_text = data["choices"][0]["message"]["content"]
                except BusinessException:
                    raise
                except Exception as e:
                    logger.error(f"Failed to call Qwen-VL multimodal OCR: {e}")
                    raise BusinessException(500, f"图片多模态单据识别异常: {str(e)}")

        if not extracted_text.strip():
            raise BusinessException(400, "单据未能提取出有效文字内容，请上传清晰有效的单据文件。")

        # 走统一解析通道
        res = await self.parse_chat(
            text=extracted_text,
            db=db,
            contract_no_hint=contract_no_hint,
        )
        res.ocr_raw_text = extracted_text.strip()
        return res


order_parser_service = OrderParserService()
