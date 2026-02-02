import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessageAction,
    MessagingApi,
    MessagingApiBlob,
    ReplyMessageRequest,
    TemplateMessage,
    TextMessage,
)
from linebot.v3.messaging.models import ButtonsTemplate
from linebot.v3.webhooks import ImageMessageContent, MessageEvent, TextMessageContent

from app.response_message import reponse_message
from app.services.oil_log_store import OilLogEntry, OilLogStore
from app.services.pump_ocr import PumpOcrService


app = FastAPI()

load_dotenv(override=True)

# # LINE Access Key
# get_access_token = os.getenv('ACCESS_TOKEN')
# # LINE Secret Key
# get_channel_secret = os.getenv('CHANNEL_SECRET')


def get_secret_value(secret_name, default=None):
    """Try reading from a mounted file, fallback to env variable."""
    secret_path = f"/secrets/{secret_name}"
    if os.path.exists(secret_path):  # For Cloud Run with Secret Manager
        with open(secret_path, "r") as f:
            return f.read().strip()
    return os.getenv(secret_name, default)  # Fallback to env variable

get_access_token = get_secret_value('ACCESS_TOKEN')
get_channel_secret = get_secret_value('CHANNEL_SECRET')

configuration = Configuration(access_token=get_access_token)
handler = WebhookHandler(channel_secret=get_channel_secret)
ocr_service = PumpOcrService()
oil_log_store = OilLogStore()
pending_logs: Dict[str, dict] = {}
BANGKOK_TZ = timezone(timedelta(hours=7))
CONFIRM_KEYWORDS = {"ยืนยัน", "confirm", "ตกลง", "ok", "okay", "โอเค"}
CANCEL_KEYWORDS = {"ยกเลิก", "cancel", "ถ่ายใหม่", "แก้ไข", "ไม่ใช่"}

@app.post("/callback")
async def callback(request: Request, x_line_signature: str = Header(None)):
    body = await request.body()
    body_str = body.decode('utf-8')
    try:
        handler.handle(body_str, x_line_signature)
    except InvalidSignatureError:
        print("Invalid signature. Please check your channel access token/channel secret.")
        raise HTTPException(status_code=400, detail="Invalid signature.")

    return 'OK'

@handler.add(MessageEvent, message=TextMessageContent)
def handle_message(event: MessageEvent):
    with ApiClient(configuration) as api_client:
        line_bot_api = MessagingApi(api_client)

        confirmation_reply = _handle_confirmation(event)
        if confirmation_reply:
            line_bot_api.reply_message(
                ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[confirmation_reply],
                )
            )
            return

        reply_message = reponse_message(event)

        if not reply_message:
            return None

        line_bot_api.reply_message(
            ReplyMessageRequest(
                reply_token=event.reply_token,
                messages=[reply_message],
            )
        )


@handler.add(MessageEvent, message=ImageMessageContent)
def handle_image(event: MessageEvent):
    with ApiClient(configuration) as api_client:
        line_bot_api = MessagingApi(api_client)
        blob_api = MessagingApiBlob(api_client)

        try:
            image_bytes = bytes(blob_api.get_message_content(event.message.id))
            reading = ocr_service.analyze(image_bytes)
        except Exception as exc:  # pylint: disable=broad-except
            line_bot_api.reply_message(
                ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=f"เกิดข้อผิดพลาดในการอ่านภาพ: {exc}")],
                )
            )
            return

        if reading.liters is None or reading.amount is None:
            line_bot_api.reply_message(
                ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[
                        TextMessage(
                            text=(
                                "ยังไม่พบตัวเลขจากภาพ ลองถ่ายให้เห็นทั้งยอดเงินและปริมาณอีกครั้ง"
                            )
                        )
                    ],
                )
            )
            return

        user_id = _resolve_user_id(event)
        pending = _store_pending_reading(user_id, reading)
        confirmation_messages = _build_confirmation_messages(pending)

        line_bot_api.reply_message(
            ReplyMessageRequest(
                reply_token=event.reply_token,
                messages=confirmation_messages,
            )
        )


def _resolve_user_id(event: MessageEvent) -> str:
    source = getattr(event, "source", None)
    return getattr(source, "user_id", "unknown-user")


def _format_timestamp(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.astimezone(BANGKOK_TZ).strftime("%d/%m %H:%M")
    except ValueError:
        return iso_str


def _build_summary_text(entry: OilLogEntry, computed: bool) -> str:
    timestamp = _format_timestamp(entry.created_at)
    lines = [
        f"บันทึกสำเร็จ {timestamp}",
        f"จำนวน: {entry.liters:.2f} ลิตร",
        f"ราคาต่อ ลิตร: {entry.price_per_liter:.2f} บาท",
        f"ยอดเงิน: {entry.amount:.2f} บาท",
    ]
    if computed:
        lines.append("ℹ️ มีการคำนวณอัตโนมัติเพราะตัวเลขในรูปไม่ครบ")
    return "\n".join(lines)


def _build_confirmation_messages(pending: dict) -> list:
    price_value = pending.get("price_per_liter")
    if price_value in (None, 0):
        price_line = "3) ราคาต่อลิตร ไม่พบในภาพ ใช้ค่าระบบ"
        template_price = "ราคาลิตร ไม่มี"
    else:
        price_line = f"3) ราคาต่อลิตร {price_value:.2f} บาท"
        template_price = f"ราคาลิตร {price_value:.2f}฿"

    details = [
        f"1) ยอดขาย {pending['amount']:.2f} บาท",
        f"2) ปริมาณ {pending['liters']:.2f} ลิตร",
        price_line,
    ]
    if pending.get("computed"):
        details.append("ℹ️ มีการคำนวณอัตโนมัติ")

    summary_text = "\n".join(details)

    template_lines = [
        f"ยอดขาย {pending['amount']:.2f}฿",
        f"ปริมาณ {pending['liters']:.2f}L",
        template_price,
    ]
    template_text = _truncate_text("\n".join(template_lines), 60)

    template = ButtonsTemplate(
        title="ยืนยันข้อมูล",
        text=template_text,
        actions=[
            MessageAction(label="ยืนยัน", text="ยืนยัน"),
            MessageAction(label="ยกเลิก", text="ยกเลิก"),
        ],
    )

    return [
        TextMessage(text=_truncate_text(summary_text, 500)),
        TemplateMessage(
            alt_text="กรุณายืนยันข้อมูลน้ำมัน",
            template=template,
        ),
    ]


def _truncate_text(text: str, limit: int) -> str:
    clean_text = text.strip()
    if len(clean_text) <= limit:
        return clean_text
    return clean_text[: limit - 1] + "…"


def _store_pending_reading(user_id: str, reading) -> dict:
    pending = {
        "liters": reading.liters,
        "amount": reading.amount,
        "price_per_liter": reading.price_per_liter or 0.0,
        "confidence": reading.confidence,
        "raw_text": reading.raw_text,
        "computed": reading.computed,
    }
    pending_logs[user_id] = pending
    return pending


def _handle_confirmation(event: MessageEvent) -> Optional[TextMessage]:
    message_text = (event.message.text or "").strip().lower()
    user_id = _resolve_user_id(event)

    if message_text in CONFIRM_KEYWORDS:
        pending = pending_logs.pop(user_id, None)
        if not pending:
            return TextMessage(text="ยังไม่มีรายการที่รอการบันทึก")
        entry = oil_log_store.append(
            oil_log_store.build_entry(
                entry_id=str(uuid.uuid4()),
                user_id=user_id,
                liters=pending["liters"],
                amount=pending["amount"],
                price_per_liter=pending["price_per_liter"],
                confidence=pending["confidence"],
                raw_text=pending["raw_text"],
            )
        )
        summary_text = _build_summary_text(entry, pending["computed"])
        return TextMessage(text=f"บันทึกเรียบร้อย ✅\n{summary_text}")

    if message_text in CANCEL_KEYWORDS:
        pending = pending_logs.pop(user_id, None)
        if not pending:
            return TextMessage(text="ไม่มีรายการให้ยกเลิกครับ")
        return TextMessage(text="ยกเลิกรายการล่าสุดแล้ว กรุณาส่งรูปใหม่")

    return None


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0")