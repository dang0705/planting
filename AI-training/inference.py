import base64
import binascii
import io
import json
import os
import urllib.request
from functools import lru_cache
from typing import Any, Dict, List, Optional

from PIL import Image
from transformers import pipeline

MODEL_ID = os.getenv("HF_MODEL_ID", "henglidadi/symptoms").strip() or "henglidadi/symptoms"
DEFAULT_TOP_K = max(1, int(os.getenv("HF_TOP_K", "3") or "3"))
SERVICE_VERSION = "hf_inference_service_v1"
ORGAN_CN_MAP = {
    "leaf": "叶片",
    "stem": "茎部",
    "root": "根部",
    "root_crown": "根颈",
    "whole_plant": "全株",
    "flower": "花部",
    "fruit": "果部",
    "other": "局部",
}


def _strip_data_url_prefix(value: str) -> str:
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[1]
    return value


def _decode_image_bytes(image_url: Optional[str] = None, image_base64: Optional[str] = None) -> bytes:
    if image_base64:
        try:
            return base64.b64decode(_strip_data_url_prefix(image_base64), validate=False)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("invalid_image_base64") from exc

    if image_url:
        request = urllib.request.Request(
            image_url,
            headers={
                "User-Agent": "planting-hf-autotrain-service/1.0"
            }
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()

    raise ValueError("image_source_missing")


def _open_image(image_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(image_bytes))
    return image.convert("RGB")


def infer_quality_grade(width: int, height: int) -> str:
    min_side = min(width, height)
    if min_side < 256:
        return "poor"
    if min_side >= 900:
        return "good"
    return "medium"


def infer_analyzability(quality_grade: str, top_score: float) -> str:
    if quality_grade == "poor" and top_score < 0.6:
        return "low"
    if top_score < 0.5:
        return "marginal"
    if quality_grade == "good" and top_score >= 0.8:
        return "high"
    return "medium"


def build_followup_capture(quality_grade: str, top_score: float, organ_hint: str = "") -> List[str]:
    organ_key = (organ_hint or "").strip()
    organ = ORGAN_CN_MAP.get(organ_key, "叶片")
    if quality_grade == "poor":
        return [f"补拍更清晰的{organ}近景图"]
    if top_score < 0.55:
        return [f"补拍同一{organ}的另一角度图"]
    return []


@lru_cache(maxsize=1)
def get_classifier():
    return pipeline("image-classification", model=MODEL_ID)


@lru_cache(maxsize=1)
def get_model_labels() -> Dict[int, str]:
    classifier = get_classifier()
    model = getattr(classifier, "model", None)
    config = getattr(model, "config", None)
    id2label = getattr(config, "id2label", {}) or {}
    return {int(key): str(value) for key, value in id2label.items()}


def predict_image(
    *,
    image_url: Optional[str] = None,
    image_base64: Optional[str] = None,
    top_k: Optional[int] = None,
    input_organ_hint: str = "",
) -> Dict[str, Any]:
    image_bytes = _decode_image_bytes(image_url=image_url, image_base64=image_base64)
    image = _open_image(image_bytes)
    width, height = image.size
    requested_top_k = max(1, int(top_k or DEFAULT_TOP_K))

    classifier = get_classifier()
    predictions = classifier(image, top_k=requested_top_k)
    normalized_predictions = [
        {
            "label": str(item.get("label", "")).strip(),
            "score": float(item.get("score", 0)),
        }
        for item in predictions
        if str(item.get("label", "")).strip()
    ]
    top_score = normalized_predictions[0]["score"] if normalized_predictions else 0.0
    quality_grade = infer_quality_grade(width, height)
    analyzability = infer_analyzability(quality_grade, top_score)
    suggested_followup_capture = build_followup_capture(
        quality_grade, top_score, organ_hint=input_organ_hint
    )

    notes: List[str] = []
    if quality_grade == "poor":
        notes.append("image_resolution_low")
    if top_score < 0.55:
        notes.append("hf_prediction_confidence_low")

    return {
        "provider": "hf_autotrain",
        "model_name": MODEL_ID,
        "service_version": SERVICE_VERSION,
        "top_label": normalized_predictions[0]["label"] if normalized_predictions else "",
        "predictions": normalized_predictions,
        "image_quality_grade": quality_grade,
        "analyzability": analyzability,
        "suggested_followup_capture": suggested_followup_capture,
        "normalization_notes": notes,
        "image_meta": {
            "width": width,
            "height": height,
            "mode": image.mode,
        },
    }


def build_health_payload() -> Dict[str, Any]:
    labels = [label for _, label in sorted(get_model_labels().items())]
    return {
        "status": "ok",
        "provider": "hf_autotrain",
        "model_name": MODEL_ID,
        "service_version": SERVICE_VERSION,
        "labels": labels,
    }


def dumps_json(data: Dict[str, Any]) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")
