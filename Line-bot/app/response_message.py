import os
from textwrap import dedent

from linebot.v3.messaging import Emoji, FlexMessage, TextMessage


FORM_URL = os.getenv("DAILY_FORM_URL", "https://forms.gle/your-oil-log-form")

HELP_MESSAGE = dedent(
    """
    ⛽️ คำสั่งที่ใช้ได้
    1. พิมพ์ "บันทึกน้ำมัน" เพื่อดูวิธีส่งรูปตู้น้ำมัน
    2. พิมพ์ "แบบฟอร์ม" เพื่อกรอกข้อมูลรายวัน
    3. ส่งรูปหน้าตู้จ่ายน้ำมันเพื่อให้บอทอ่านค่าให้อัตโนมัติ จากนั้นพิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" หากต้องการถ่ายใหม่
    """
).strip()


def _hello_message(text: str) -> TextMessage:
    emoji_data = [
        {"index": 0, "productId": "5ac1bfd5040ab15980c9b435", "emojiId": "002"},
        {"index": max(len(text) - 1, 0), "productId": "5ac21c46040ab15980c9b442", "emojiId": "002"},
    ]
    emojis = [Emoji(**emoji) for emoji in emoji_data]
    return TextMessage(text=text, emojis=emojis)


def _oil_log_guide() -> TextMessage:
    instructions = dedent(
        """
        📷 แนบรูปหน้าตู้จ่ายน้ำมันให้เห็นค่าทั้ง "จำนวนลิตร" และ "จำนวนเงิน" ชัดเจน
        ✅ เมื่อได้รับข้อความสรุป ให้พิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อถ่ายใหม่

        """
    ).strip()
    return TextMessage(text=instructions)


def _form_message() -> FlexMessage:
    bubble = {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": "แบบฟอร์มบันทึกน้ำมัน", "weight": "bold", "size": "md"},
                {"type": "text", "text": "กรอกข้อมูลที่ขาดจาก AI", "size": "xs", "color": "#888888"},
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
                {"type": "text", "text": "1) วันที่/เวลา", "size": "sm"},
                {"type": "text", "text": "2) เลขไมล์/ชื่อเครื่อง", "size": "sm"},
                {"type": "text", "text": "3) ลิตร / จำนวนเงิน", "size": "sm"},
                {"type": "text", "text": "4) ราคาต่อ ลิตร + หมายเหตุ", "size": "sm"},
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "action": {"type": "uri", "label": "เปิดแบบฟอร์ม", "uri": FORM_URL},
                }
            ],
        },
    }
    return FlexMessage(alt_text="แบบฟอร์มบันทึกน้ำมัน", contents=bubble)


def reponse_message(event):
    request_message = (event.message.text or "").strip()
    lowered = request_message.lower()

    if lowered == "hello":
        return _hello_message("$ Hello/สวัสดีครับ $")

    if lowered == "hi":
        emoji = [{"index": 0, "productId": "5ac1bfd5040ab15980c9b435", "emojiId": "002"}]
        return TextMessage(text="$ Hiiiiiii/สวัสดีครับ from PythonDevBot ", emojis=[Emoji(**emoji[0])])

    if "บันทึก" in request_message and "น้ำมัน" in request_message:
        return _oil_log_guide()

    if "แบบฟอร์ม" in request_message or "form" in lowered:
        return _form_message()

    if lowered in {"help", "เมนู", "menu", "?"}:
        return TextMessage(text=HELP_MESSAGE)

    return TextMessage(text=HELP_MESSAGE)