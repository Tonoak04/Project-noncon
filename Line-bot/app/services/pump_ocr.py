from __future__ import annotations

import os
import re
from dataclasses import dataclass
from io import BytesIO
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from rapidocr_onnxruntime import RapidOCR

DEFAULT_PRICE_PER_LITER = float(os.getenv("DEFAULT_PRICE_PER_LITER", "34.5"))


@dataclass
class PumpReading:
    liters: Optional[float]
    amount: Optional[float]
    price_per_liter: Optional[float]
    confidence: float
    raw_text: List[str]
    computed: bool


@dataclass
class OcrTextLine:
    text: str
    confidence: float
    row_index: Optional[int] = None


class PumpOcrService:
    """AI helper dedicated to parsing pump displays from images."""

    number_pattern = re.compile(r"(?<!\d)(\d{1,4}(?:[.,]\d{1,2})?)")

    def __init__(self, default_price: float = DEFAULT_PRICE_PER_LITER) -> None:
        self.reader = RapidOCR()
        self.default_price = default_price

    def analyze(self, image_bytes: bytes) -> PumpReading:
        image_array = self._to_numpy(image_bytes)
        text_lines = self._run_ocr(image_array)
        confidences = [line.confidence for line in text_lines]

        if image_array.size > 0:
            for idx, region in enumerate(self._detect_display_rows(image_array)):
                region_lines = self._run_ocr(region)
                if not region_lines:
                    continue
                for line in region_lines:
                    line.row_index = idx
                text_lines.extend(region_lines)
                confidences.extend([line.confidence for line in region_lines])

        liters, amount, price_per_liter, computed = self._infer_values(text_lines)

        if (liters is None or amount is None) and image_array.size > 0:
            for region in self._generate_focus_regions(image_array):
                region_lines = self._run_ocr(region)
                if not region_lines:
                    continue
                text_lines.extend(region_lines)
                confidences.extend([line.confidence for line in region_lines])
                liters, amount, price_per_liter, computed = self._infer_values(text_lines)
                if liters is not None and amount is not None:
                    break

        confidence = float(np.mean(confidences)) if confidences else 0.0

        return PumpReading(
            liters=liters,
            amount=amount,
            price_per_liter=price_per_liter,
            confidence=confidence,
            raw_text=[line.text for line in text_lines],
            computed=computed,
        )

    @staticmethod
    def _to_numpy(image_bytes: bytes) -> np.ndarray:
        try:
            with Image.open(BytesIO(image_bytes)) as img:
                return np.array(img.convert("RGB"))
        except UnidentifiedImageError as exc:
            raise ValueError("Invalid image. Please capture the pump display again.") from exc

    def _run_ocr(self, image: np.ndarray) -> List[OcrTextLine]:
        if image.size == 0:
            return []
        ocr_results, _ = self.reader(image)
        lines: List[OcrTextLine] = []
        for line in ocr_results or []:
            if len(line) < 3:
                continue
            try:
                conf = float(line[2])
            except (TypeError, ValueError):
                conf = 0.0
            lines.append(OcrTextLine(text=line[1], confidence=conf))
        return lines

    def _detect_display_rows(self, image: np.ndarray) -> List[np.ndarray]:
        if image.size == 0:
            return []

        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = 255 - thresh

        h, w = gray.shape
        kernel_width = max(5, int(w * 0.4))
        kernel_height = max(3, int(h * 0.03))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, kernel_height))
        closed = cv2.morphologyEx(inverted, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rows: List[Tuple[int, int, int, int]] = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if area < 0.01 * h * w:
                continue
            aspect = cw / float(ch)
            if aspect < 1.5 or aspect > 12:
                continue
            if ch < h * 0.05 or ch > h * 0.5:
                continue
            rows.append((x, y, cw, ch))

        rows.sort(key=lambda item: item[1])
        cropped: List[np.ndarray] = []
        for x, y, cw, ch in rows[:3]:
            pad_y = int(ch * 0.1)
            pad_x = int(cw * 0.05)
            x0 = max(x - pad_x, 0)
            y0 = max(y - pad_y, 0)
            x1 = min(x + cw + pad_x, w)
            y1 = min(y + ch + pad_y, h)
            cropped.append(image[y0:y1, x0:x1])

        return cropped

    def _generate_focus_regions(self, image: np.ndarray) -> List[np.ndarray]:
        if image.size == 0:
            return []

        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        inverted = 255 - thresh

        contours, _ = cv2.findContours(inverted, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        h, w = gray.shape
        min_area = 0.02 * h * w
        regions: List[np.ndarray] = []

        for cnt in sorted(contours, key=cv2.contourArea, reverse=True):
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if area < min_area:
                continue
            aspect = cw / float(ch)
            if aspect < 1.2 or aspect > 12:
                continue
            pad = int(min(w, h) * 0.02)
            x0 = max(x - pad, 0)
            y0 = max(y - pad, 0)
            x1 = min(x + cw + pad, w)
            y1 = min(y + ch + pad, h)
            regions.append(image[y0:y1, x0:x1])
            if len(regions) >= 4:
                break

        if not regions:
            band_height = int(h * 0.25)
            for center_ratio in (0.2, 0.5, 0.8):
                y_mid = int(h * center_ratio)
                y0 = max(y_mid - band_height // 2, 0)
                y1 = min(y_mid + band_height // 2, h)
                regions.append(image[y0:y1, :])

        return regions

    def _infer_values(self, texts: Sequence[OcrTextLine]) -> tuple:
        candidates = self._extract_numeric_candidates(texts)
        if not candidates:
            return None, None, None, False

        # Attempt to find a verified mathematical triple (A = B * C)
        triple_match = self._find_math_triple(candidates)
        if triple_match:
            return triple_match["liters"], triple_match["amount"], triple_match["price"], True

        amount_candidate = self._pick_amount(candidates)
        liters_candidate = self._pick_liters(candidates, amount_candidate)
        price_candidate = self._pick_price(candidates)

        liters = liters_candidate["value"] if liters_candidate else None
        amount = amount_candidate["value"] if amount_candidate else None
        price = price_candidate["value"] if price_candidate else None

        direct_signals = sum(1 for cand in (amount_candidate, liters_candidate, price_candidate) if cand)

        liters, amount, price, computed = self._fill_missing(liters, amount, price)

        if direct_signals < 2:
            return None, None, None, False

        if liters and amount and price and not self._is_consistent(liters, amount, price):
            return None, None, None, False

        return liters, amount, price, computed

    def _find_math_triple(self, candidates: List[dict]) -> Optional[dict]:
        """Brute-force checking if any 3 numbers satisfy Amount ~= Liters * Price."""
        # Clean candidates (remove duplicates, sort by distinct values)
        distinct_candidates = sorted(
            [c for c in candidates if c["value"] > 0], 
            key=lambda x: x["value"], 
            reverse=True
        )
        
        # We need at least 3 numbers to form a relationship, or 2 to infer the third if we assume constraints
        # But here we look for a perfect triple validation first
        if len(distinct_candidates) < 3:
            return None

        import itertools

        # Permutations of 3 distinct items
        for triple in itertools.combinations(distinct_candidates, 3):
            # Sort triple by value to quickly assign potential roles
            #Usually total amount > liters > price OR total amount > price > liters
            # But sometimes price > liters. 
            # Always: Amount is the product.
            vals = sorted([t["value"] for t in triple], reverse=True)
            v_amount, v_2, v_3 = vals[0], vals[1], vals[2]
            
            if v_2 <= 0 or v_3 <= 0: 
                continue
                
            # Check consistency: v_amount = v_2 * v_3
            if self._is_consistent(v_2, v_amount, v_3, tolerance=0.02):
                # Now distinguish which is Liters vs Price
                # Heuristic: Price is usually 20-50, Liters can be anything.
                # If both are in reasonable price range, look for hints.
                
                price = v_3
                liters = v_2
                
                # Swap if v_2 fits price profile better than v_3
                is_v2_price = (15 <= v_2 <= 60)
                is_v3_price = (15 <= v_3 <= 60)
                
                if is_v2_price and not is_v3_price:
                    price = v_2
                    liters = v_3
                elif is_v2_price and is_v3_price:
                    # Tie-breaker: look at source hints from text regions
                    # Find original candidate objects to check keywords
                    c_v2 = next(c for c in triple if c["value"] == v_2)
                    c_v3 = next(c for c in triple if c["value"] == v_3)
                    
                    if c_v2["is_price_hint"] and not c_v3["is_price_hint"]:
                        price = v_2
                        liters = v_3
                    elif c_v3["is_liter_hint"] and not c_v2["is_liter_hint"]:
                        price = v_2
                        liters = v_3
                
                return {"amount": v_amount, "liters": liters, "price": price}
                
        return None

    def _extract_numeric_candidates(self, texts: Sequence[OcrTextLine]) -> List[dict]:
        candidates: List[dict] = []
        for line in texts:
            text = line.text
            if self._should_skip_text(text):
                continue

            clean = text.replace(" ", "")
            lowered = text.lower()
            
            # Identify unit price first to avoid confusion with basic "liter"
            is_price_hint = self._has_any_keyword(lowered, ("price", "ต่อลิตร", "/l", "ค่าลิตร", "u.p", "unit"))
            
            # Liters: Look for volume related words. 
            # Exclude strict price hints (like 'baht/liter') if possible, but mainly ensure we don't pick 'per liter' as liter
            is_liter_hint = self._has_any_keyword(lowered, ("ลิตร", "liter", "ltr", "l", "vol", "ปริมาณ")) and not is_price_hint
            
            # Amount: Total, Sale, Baht
            is_amount_hint = self._has_any_keyword(lowered, ("บาท", "ยอด", "total", "amount", "รวม", "sale", "baht"))

            for raw_value in self.number_pattern.findall(clean):
                try:
                    value = float(raw_value.replace(",", "."))
                except ValueError:
                    continue

                score = self._heuristic_score(value, is_liter_hint, is_amount_hint, is_price_hint)
                candidates.append(
                    {
                        "value": value,
                        "text": text,
                        "score": score,
                        "is_liter_hint": is_liter_hint,
                        "is_amount_hint": is_amount_hint,
                        "is_price_hint": is_price_hint,
                        "row": line.row_index,
                    }
                )
        return candidates

    @staticmethod
    def _heuristic_score(value: float, liter_hint: bool, amount_hint: bool, price_hint: bool) -> float:
        weight = 1.0
        
        # Keyword boosts (stronger than range)
        if liter_hint:
            weight += 2.0
        if amount_hint:
            weight += 1.5
        if price_hint:
            weight += 2.0

        # Value range heuristics
        # Price: usually 15-60 (gas/diesel prices)
        if 15 <= value <= 60:
            weight += 0.5
            if price_hint:
                weight += 1.0
        
        # Liters: usually 1-200
        if 1 <= value <= 200:
            weight += 0.2
            if liter_hint:
                weight += 1.0

        # Amount: usually > 100 (unless very small fill)
        if value >= 50:
            if amount_hint:
                weight += 1.0
        
        if value >= 5000:
            weight -= 1.0
            
        return weight

    def _pick_amount(self, candidates: Sequence[dict]) -> Optional[dict]:
        if not candidates:
            return None

        top_row_candidates = [cand for cand in candidates if cand.get("row") == 0]
        if top_row_candidates:
            hint_top = [cand for cand in top_row_candidates if cand["is_amount_hint"]]
            if hint_top:
                return max(hint_top, key=lambda item: (item["value"], item["score"]))
            return max(top_row_candidates, key=lambda item: item["value"])

        hint_candidates = [cand for cand in candidates if cand["is_amount_hint"]]
        if hint_candidates:
            return max(hint_candidates, key=lambda item: (item["value"], item["score"]))

        plausible = [cand for cand in candidates if 50 <= cand["value"] <= 10000]
        if plausible:
            return max(plausible, key=lambda item: item["value"])

        return max(candidates, key=lambda item: item["value"])

    def _pick_liters(self, candidates: Sequence[dict], amount_candidate: Optional[dict]) -> Optional[dict]:
        amount_value = amount_candidate["value"] if amount_candidate else None
        max_row = max((cand.get("row") for cand in candidates if cand.get("row") is not None), default=None)

        if max_row is not None:
            row_candidates = [
                item
                for item in candidates
                if item.get("row") == max_row and 1 <= item["value"] <= 200
            ]
            if row_candidates:
                prioritized = [cand for cand in row_candidates if cand["is_liter_hint"]]
                if prioritized:
                    return max(prioritized, key=lambda item: item["score"])
                return max(row_candidates, key=lambda item: item["score"])

        prioritized = [
            item
            for item in candidates
            if 1 <= item["value"] <= 200 and item["is_liter_hint"]
        ]
        if prioritized:
            return max(prioritized, key=lambda item: item["score"])

        filtered = [
            item
            for item in candidates
            if 1 <= item["value"] <= 200 and (amount_value is None or abs(item["value"] - amount_value) > 0.01)
        ]
        if filtered:
            return max(filtered, key=lambda item: item["score"])
        return None

    def _pick_price(self, candidates: Sequence[dict]) -> Optional[dict]:
        price_candidates = [item for item in candidates if 15 <= item["value"] <= 60]
        if not price_candidates:
            return None

        prioritized = [item for item in price_candidates if item["is_price_hint"]]
        if prioritized:
            return max(prioritized, key=lambda item: item["score"])

        return max(price_candidates, key=lambda item: item["score"])

    def _fill_missing(
        self,
        liters: Optional[float],
        amount: Optional[float],
        price: Optional[float],
    ) -> tuple:
        computed = False
        if liters and amount and not price and liters > 0:
            price = round(amount / liters, 2)
            computed = True

        if price and liters and not amount:
            amount = round(liters * price, 2)
            computed = True
        elif price and amount and not liters and price > 0:
            liters = round(amount / price, 2)
            computed = True

        if price is None:
            price = round(self.default_price, 2)
            computed = True

        if liters is None and amount is not None and price:
            liters = round(amount / price, 2)
            computed = True
        elif amount is None and liters is not None and price:
            amount = round(liters * price, 2)
            computed = True

        return liters, amount, price, computed

    @staticmethod
    def _is_consistent(liters: float, amount: float, price: float, tolerance: float = 0.05) -> bool:
        if liters <= 0 or price <= 0:
            return True
        expected_amount = liters * price
        if expected_amount == 0:
            return True
        diff_ratio = abs(expected_amount - amount) / expected_amount
        return diff_ratio <= tolerance

    @staticmethod
    def _has_any_keyword(text: str, keywords: Sequence[str]) -> bool:
        return any(keyword in text for keyword in keywords)

    @staticmethod
    def _should_skip_text(text: str) -> bool:
        normalized = text.strip()
        if not normalized:
            return True

        lowered = normalized.lower()
        if any(marker in lowered for marker in ("เวลา", "วันที่")):
            return True

        if re.search(r"\b(time|date|am|pm)\b", lowered):
            return True

        if re.search(r"\d\s*[/:-]\s*\d", normalized):
            return True

        if re.fullmatch(r"[a-z]{1,4}-?\d{2,}", lowered):
            return True

        digit_count = sum(ch.isdigit() for ch in normalized)
        if digit_count <= 0:
            return True

        return False
