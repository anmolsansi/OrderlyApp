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


import copy
import pytest
from pydantic import ValidationError

C3 = json.loads((CONTRACTS / 'c3.json').read_text())


@pytest.mark.parametrize('case', C3['negative'], ids=lambda case: case['name'])
def test_executable_invalid_catalog_contract(case, monkeypatch, isolated_environment):
    from fastapi.testclient import TestClient
    from app import main
    raw = copy.deepcopy(C3['positive']['restaurants'])
    override = case.get('catalog_override')
    if override == 'closed': raw[0]['is_open'] = False
    elif override == 'unavailable': raw[0]['menu'][0]['available'] = False
    elif override == 'three_available_extras':
        raw[0]['menu'][0]['modifier_groups'][1]['options'].extend([
            {'id': key, 'name': key, 'price_delta_cents': 0, 'available': True} for key in ('cheese', 'third')])
    elif override == 'second_restaurant':
        other = copy.deepcopy(raw[0]); other['id'] = 'fixture-r2'; other['menu'][0]['id'] = 'fixture-i2'; raw.append(other)
    snapshot = CatalogSnapshot.build(Restaurant.model_validate(r) for r in raw)
    request = case['request']
    if request['method'] == 'GET':
        monkeypatch.setattr(main, 'get_catalog_snapshot', lambda: snapshot)
        response = TestClient(main.app).get(request['path'])
        assert response.status_code == case['status']
        assert response.json()['error']['code'] == case['error']['code']
        fields = response.json()['error']['fields']
    else:
        try:
            items = [CartItemInput.model_validate(i) for i in request['body']['items']]
        except ValidationError as error:
            fields = ['items.0.' + '.'.join(str(part) for part in e['loc']) for e in error.errors()]
        else:
            result = validate_cart_input_items(items, snapshot)
            assert not result.ok
            fields = result.fields
    assert fields == case['error']['fields']
