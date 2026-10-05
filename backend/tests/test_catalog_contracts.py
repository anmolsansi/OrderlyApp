"""Execute the shared catalog → basket → receipt example through provider code."""
import json
from datetime import datetime
from pathlib import Path

from app.catalog import CatalogSnapshot
from app.models import CartItemInput, CartResponse, CheckoutDetails, Restaurant
from app.pricing import build_receipt_snapshot, catalog_fingerprint
from app.store import validate_cart_input_items

CONTRACTS = Path(__file__).resolve().parents[2] / 'tests/fixtures/contracts'


def test_shared_catalog_basket_and_receipt_contracts():
    c3, c4, c5 = [json.loads((CONTRACTS / f'c{n}.json').read_text()) for n in (3, 4, 5)]
    snapshot = CatalogSnapshot.build(Restaurant.model_validate(r) for r in c3['positive']['restaurants'])
    result = validate_cart_input_items([CartItemInput.model_validate(i) for i in c4['write_request']['items']], snapshot)
    assert result.ok, result.fields
    assert CartResponse(revision=1, items=result.items).model_dump(mode='json', exclude_none=True) == c4['positive']
    expected = c5['positive']['receipt']
    receipt = build_receipt_snapshot(order_id=expected['id'], created_at=datetime.fromisoformat(expected['created_at']), snapshot=snapshot, items=result.items, checkout=CheckoutDetails.model_validate(expected['checkout']), promotion_code='DEMO5')
    assert receipt.model_dump(mode='json') == expected
    assert receipt.totals.total_cents == 1192
    assert catalog_fingerprint(snapshot, result.items) == c5['positive']['quote']['catalog_fingerprint']
