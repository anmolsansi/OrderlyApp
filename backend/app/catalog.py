from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from .models import CartItem, CartItemModifier, MenuItem, ModifierGroup, Restaurant

MAX_CART_LINES = 50
MAX_QUANTITY = 10
MAX_SPECIAL_INSTRUCTIONS_LENGTH = 500
MAX_QUERY_LENGTH = 100
MAX_CUISINE_LENGTH = 100


class CatalogConfigurationError(RuntimeError):
    """Raised when authoritative catalog data cannot satisfy the C3 contract."""


@dataclass(frozen=True)
class CatalogIssue:
    field: str
    message: str


@dataclass(frozen=True)
class CatalogValidationResult:
    items: List[CartItem]
    issues: List[CatalogIssue]

    @property
    def ok(self) -> bool:
        return not self.issues

    @property
    def fields(self) -> List[str]:
        return list(dict.fromkeys(issue.field for issue in self.issues))


@dataclass(frozen=True)
class CatalogSnapshot:
    restaurants: List[Restaurant]
    restaurants_by_id: Dict[str, Restaurant]
    items_by_key: Dict[Tuple[str, str], MenuItem]

    @classmethod
    def build(cls, restaurants: Iterable[Restaurant]) -> "CatalogSnapshot":
        normalized_restaurants: List[Restaurant] = []
        restaurants_by_id: Dict[str, Restaurant] = {}
        items_by_key: Dict[Tuple[str, str], MenuItem] = {}

        for raw_restaurant in restaurants:
            restaurant = normalize_restaurant(raw_restaurant)
            if restaurant.id in restaurants_by_id:
                raise CatalogConfigurationError(f"Duplicate restaurant id: {restaurant.id}")
            restaurants_by_id[restaurant.id] = restaurant
            normalized_restaurants.append(restaurant)

            seen_item_ids: set[str] = set()
            for item in restaurant.menu:
                if item.id in seen_item_ids:
                    raise CatalogConfigurationError(
                        f"Duplicate menu item id {item.id} in restaurant {restaurant.id}"
                    )
                seen_item_ids.add(item.id)
                items_by_key[(restaurant.id, item.id)] = item

        return cls(
            restaurants=normalized_restaurants,
            restaurants_by_id=restaurants_by_id,
            items_by_key=items_by_key,
        )

    def restaurant(self, restaurant_id: str) -> Optional[Restaurant]:
        return self.restaurants_by_id.get(restaurant_id)

    def menu_item(self, restaurant_id: str, menu_item_id: str) -> Optional[MenuItem]:
        return self.items_by_key.get((restaurant_id, menu_item_id))


def normalize_restaurant(restaurant: Restaurant) -> Restaurant:
    normalized_items: List[MenuItem] = []
    for item in restaurant.menu:
        normalized_groups: List[ModifierGroup] = []
        seen_group_ids: set[str] = set()
        for group in item.modifier_groups:
            if group.id in seen_group_ids:
                raise CatalogConfigurationError(
                    f"Duplicate modifier group id {group.id} in menu item {item.id}"
                )
            seen_group_ids.add(group.id)
            normalized_groups.append(normalize_modifier_group(group, item.id))
        normalized_items.append(item.model_copy(update={"modifier_groups": normalized_groups}))
    return restaurant.model_copy(update={"menu": normalized_items})


def normalize_modifier_group(group: ModifierGroup, menu_item_id: str) -> ModifierGroup:
    if not group.options:
        raise CatalogConfigurationError(
            f"Modifier group has no options in {menu_item_id}/{group.id}"
        )

    option_ids: set[str] = set()
    for option in group.options:
        if option.id in option_ids:
            raise CatalogConfigurationError(
                f"Duplicate modifier option id {option.id} in {menu_item_id}/{group.id}"
            )
        option_ids.add(option.id)

    if group.type == "single":
        min_selected = group.min_selected if group.min_selected is not None else (1 if group.required else 0)
        max_selected = group.max_selected if group.max_selected is not None else 1
        if min_selected < 0 or min_selected > 1 or max_selected != 1 or min_selected > max_selected:
            raise CatalogConfigurationError(
                f"Invalid single-choice bounds in {menu_item_id}/{group.id}"
            )
        if group.required and min_selected != 1:
            raise CatalogConfigurationError(
                f"Required single-choice group must select one option in {menu_item_id}/{group.id}"
            )

        available_options = [option for option in group.options if option.available]
        if min_selected > len(available_options):
            raise CatalogConfigurationError(
                f"Not enough available options in {menu_item_id}/{group.id}"
            )

        default_option_id = group.default_option_id
        if default_option_id is None and group.required and available_options:
            default_option_id = available_options[0].id
        if default_option_id is not None:
            default = next((option for option in group.options if option.id == default_option_id), None)
            if default is None or not default.available:
                raise CatalogConfigurationError(
                    f"Invalid default option in {menu_item_id}/{group.id}"
                )

        return group.model_copy(
            update={
                "min_selected": min_selected,
                "max_selected": max_selected,
                "default_option_id": default_option_id,
            }
        )

    min_selected = group.min_selected if group.min_selected is not None else (1 if group.required else 0)
    max_selected = group.max_selected if group.max_selected is not None else len(group.options)
    if (
        min_selected < 0
        or max_selected < 0
        or min_selected > max_selected
        or max_selected > len(group.options)
    ):
        raise CatalogConfigurationError(
            f"Invalid multiple-choice bounds in {menu_item_id}/{group.id}"
        )
    available_count = sum(1 for option in group.options if option.available)
    if min_selected > available_count:
        raise CatalogConfigurationError(
            f"Not enough available options in {menu_item_id}/{group.id}"
        )
    if group.required and min_selected < 1:
        raise CatalogConfigurationError(
            f"Required multiple-choice group must select at least one option in {menu_item_id}/{group.id}"
        )

    return group.model_copy(
        update={
            "min_selected": min_selected,
            "max_selected": max_selected,
            "default_option_id": None,
        }
    )


def search_snapshot(
    snapshot: CatalogSnapshot,
    query: str = "",
    cuisine: str = "",
    sort: str = "recommended",
    open_now: bool = False,
) -> List[Restaurant]:
    normalized_query = query.strip().lower()
    normalized_cuisine = cuisine.strip().lower()

    if len(normalized_query) > MAX_QUERY_LENGTH:
        raise ValueError("query exceeds 100 characters")
    if len(normalized_cuisine) > MAX_CUISINE_LENGTH:
        raise ValueError("cuisine exceeds 100 characters")
    if sort not in {"recommended", "rating", "fee"}:
        raise ValueError("unsupported catalog sort")

    def matches(restaurant: Restaurant) -> bool:
        menu_match = any(
            normalized_query in item.name.lower() or normalized_query in item.description.lower()
            for item in restaurant.menu
        )
        query_match = (
            not normalized_query
            or normalized_query in restaurant.name.lower()
            or normalized_query in restaurant.cuisine.lower()
            or menu_match
        )
        cuisine_match = (
            not normalized_cuisine
            or normalized_cuisine in {"all", "all pizza", "all restaurants"}
            or restaurant.cuisine.lower() == normalized_cuisine
            or normalized_cuisine in [tag.lower() for tag in restaurant.tags]
        )
        open_match = not open_now or restaurant.is_open
        return query_match and cuisine_match and open_match

    filtered = [restaurant for restaurant in snapshot.restaurants if matches(restaurant)]
    if sort == "rating":
        return sorted(filtered, key=lambda restaurant: restaurant.rating, reverse=True)
    if sort == "fee":
        return sorted(filtered, key=lambda restaurant: restaurant.delivery_fee_cents)
    return filtered


def canonicalize_cart_items(
    cart_items: List[CartItem],
    snapshot: CatalogSnapshot,
) -> CatalogValidationResult:
    issues: List[CatalogIssue] = []
    canonical_items: List[CartItem] = []

    if len(cart_items) > MAX_CART_LINES:
        issues.append(CatalogIssue("items", f"Cart cannot contain more than {MAX_CART_LINES} lines"))

    seen_line_ids: set[str] = set()
    first_restaurant_id: Optional[str] = None

    for item_index, cart_item in enumerate(cart_items):
        item_path = f"items.{item_index}"

        if cart_item.id in seen_line_ids:
            issues.append(CatalogIssue(f"{item_path}.id", "Cart line id must be unique"))
        else:
            seen_line_ids.add(cart_item.id)

        if type(cart_item.quantity) is not int or not 1 <= cart_item.quantity <= MAX_QUANTITY:
            issues.append(
                CatalogIssue(
                    f"{item_path}.quantity",
                    f"Quantity must be an integer between 1 and {MAX_QUANTITY}",
                )
            )

        if (
            cart_item.special_instructions is not None
            and len(cart_item.special_instructions) > MAX_SPECIAL_INSTRUCTIONS_LENGTH
        ):
            issues.append(
                CatalogIssue(
                    f"{item_path}.special_instructions",
                    f"Special instructions cannot exceed {MAX_SPECIAL_INSTRUCTIONS_LENGTH} characters",
                )
            )

        if first_restaurant_id is None:
            first_restaurant_id = cart_item.restaurant_id
        elif cart_item.restaurant_id != first_restaurant_id:
            issues.append(
                CatalogIssue(
                    f"{item_path}.restaurant_id",
                    "Cart can only contain items from one restaurant",
                )
            )

        restaurant = snapshot.restaurant(cart_item.restaurant_id)
        if restaurant is None:
            issues.append(CatalogIssue(f"{item_path}.restaurant_id", "Restaurant is not in the catalog"))
            continue
        if not restaurant.is_open:
            issues.append(CatalogIssue(f"{item_path}.restaurant_id", "Restaurant is closed"))

        menu_item = snapshot.menu_item(cart_item.restaurant_id, cart_item.menu_item_id)
        if menu_item is None:
            issues.append(CatalogIssue(f"{item_path}.menu_item_id", "Menu item is not in the catalog"))
            continue
        if not menu_item.available:
            issues.append(CatalogIssue(f"{item_path}.menu_item_id", "Menu item is unavailable"))

        groups_by_id = {group.id: group for group in menu_item.modifier_groups}
        selections_by_group: Dict[str, Tuple[int, CartItemModifier]] = {}

        for modifier_index, modifier in enumerate(cart_item.modifiers):
            modifier_path = f"{item_path}.modifiers.{modifier_index}"
            if modifier.group_id in selections_by_group:
                issues.append(CatalogIssue(f"{modifier_path}.group_id", "Modifier group is duplicated"))
                continue

            group = groups_by_id.get(modifier.group_id)
            if group is None:
                issues.append(CatalogIssue(f"{modifier_path}.group_id", "Modifier group is not in the catalog"))
                continue

            selections_by_group[modifier.group_id] = (modifier_index, modifier)
            seen_option_ids: set[str] = set()
            option_by_id = {option.id: option for option in group.options}

            for option_index, option_id in enumerate(modifier.option_ids):
                option_path = f"{modifier_path}.option_ids.{option_index}"
                if option_id in seen_option_ids:
                    issues.append(CatalogIssue(option_path, "Modifier option is duplicated"))
                    continue
                seen_option_ids.add(option_id)

                option = option_by_id.get(option_id)
                if option is None:
                    issues.append(CatalogIssue(option_path, "Modifier option is not in the catalog"))
                elif not option.available:
                    issues.append(CatalogIssue(option_path, "Modifier option is unavailable"))

        canonical_modifiers: List[CartItemModifier] = []
        for group in menu_item.modifier_groups:
            selection_entry = selections_by_group.get(group.id)
            selected_ids = selection_entry[1].option_ids if selection_entry else []
            min_selected = group.min_selected or 0
            max_selected = group.max_selected if group.max_selected is not None else len(group.options)

            if len(selected_ids) < min_selected:
                field = (
                    f"{item_path}.modifiers.{selection_entry[0]}.option_ids"
                    if selection_entry
                    else f"{item_path}.modifiers"
                )
                issues.append(
                    CatalogIssue(field, f"Modifier group requires at least {min_selected} selection(s)")
                )
            if len(selected_ids) > max_selected:
                field = (
                    f"{item_path}.modifiers.{selection_entry[0]}.option_ids"
                    if selection_entry
                    else f"{item_path}.modifiers"
                )
                issues.append(
                    CatalogIssue(field, f"Modifier group allows at most {max_selected} selection(s)")
                )

            if selection_entry:
                option_by_id = {option.id: option for option in group.options}
                canonical_option_ids = [
                    option_id
                    for option_id in selected_ids
                    if option_id in option_by_id and option_by_id[option_id].available
                ]
                canonical_modifiers.append(
                    CartItemModifier(group_id=group.id, option_ids=canonical_option_ids)
                )

        canonical_items.append(
            CartItem(
                id=cart_item.id,
                restaurant_id=restaurant.id,
                menu_item_id=menu_item.id,
                name=menu_item.name,
                quantity=cart_item.quantity,
                base_price_cents=menu_item.price_cents,
                modifiers=canonical_modifiers,
                special_instructions=cart_item.special_instructions,
            )
        )

    return CatalogValidationResult(items=canonical_items, issues=issues)


def calculate_canonical_item_unit_cents(
    snapshot: CatalogSnapshot,
    cart_item: CartItem,
) -> int:
    item = snapshot.menu_item(cart_item.restaurant_id, cart_item.menu_item_id)
    if item is None:
        raise CatalogConfigurationError("Canonical cart item no longer exists in catalog snapshot")

    groups_by_id = {group.id: group for group in item.modifier_groups}
    option_delta_cents = 0
    for modifier in cart_item.modifiers:
        group = groups_by_id.get(modifier.group_id)
        if group is None:
            raise CatalogConfigurationError("Canonical cart contains an unknown modifier group")
        options_by_id = {option.id: option for option in group.options}
        for option_id in modifier.option_ids:
            option = options_by_id.get(option_id)
            if option is None or not option.available:
                raise CatalogConfigurationError("Canonical cart contains an unavailable modifier option")
            option_delta_cents += option.price_delta_cents

    return item.price_cents + option_delta_cents
