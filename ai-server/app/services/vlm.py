"""Qwen2.5-VL ผ่าน API แบบ OpenAI (Ollama ในเครื่อง หรือ Hugging Face router)"""
import base64
import io
import json
import re

from openai import OpenAI
from PIL import Image

from app.config import VLM_API_KEY, VLM_BASE_URL, VLM_MODEL

_client = OpenAI(base_url=VLM_BASE_URL, api_key=VLM_API_KEY, timeout=600)


def image_part(img: Image.Image) -> dict:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}}


def parse_json(text: str) -> dict:
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    text = m.group(1) if m else text
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start : end + 1])


def ask_json(prompt: str, img: Image.Image, system: str = "") -> dict:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": [image_part(img), {"type": "text", "text": prompt}]})
    res = _client.chat.completions.create(
        model=VLM_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    return parse_json(res.choices[0].message.content or "")
