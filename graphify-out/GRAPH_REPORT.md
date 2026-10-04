# Graph Report - /Users/mac/Documents/Projects/OrderlyApp  (2026-10-04)

## Corpus Check
- 79 files · ~50,385 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 483 nodes · 1037 edges · 70 communities (45 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend persistence and APIs
- Cart and checkout screens
- Fixture menus and pricing
- Package dependencies
- Frontend API adapter
- Local demo accounts
- TypeScript configuration
- Fixture restaurant discovery
- Design mockup generator
- Environment configuration
- Unused telemetry helpers
- HTTP error envelopes
- Documented storage architecture
- Homepage design intentions
- Discovery design intentions
- Menu design intentions
- Customization design intentions
- Checkout design intentions
- Confirmation design intentions
- Vercel configuration
- App layout
- Voice clarification principles
- Hosted verification checklist
- Historical release claims
- Next build configuration
- next-env.d.ts
- Order creation and lookup API
- Session cart API
- Container service health dependencies
- Managed Postgres and Redis provisioning
- Vercel frontend deployment
- Vertical slice PR workflow
- Cart expiration after 24 hours
- SQL migrations
- Browse customize cart checkout confirmation flow
- Cart preservation and recovery
- Mock sign-in checkout prompt
- Local console telemetry
- Playwright serial smoke coverage
- Midnight Market visual system
- Future conversational commerce
- Rule-based or model-backed interpretation decision
- Startup migration and seed
- Mock checkout
- Portfolio mock ordering demo
- Pizza ordering MVP

## God Nodes (most connected - your core abstractions)
1. `formatMoney()` - 17 edges
2. `compilerOptions` - 16 edges
3. `get_connection()` - 15 edges
4. `getRestaurant()` - 14 edges
5. `MarketplaceNav()` - 12 edges
6. `write_cart()` - 12 edges
7. `signUpWithCredentials()` - 12 edges
8. `routes` - 12 edges
9. `list_orders()` - 11 edges
10. `create_order()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Manual ordering alternative` --semantically_similar_to--> `Ambiguous voice clarification`  [INFERRED] [semantically similar]
  PRODUCT_CHARTER.md → docs/PRODUCT_FLOWS.md
- `Visible voice interpretation` --semantically_similar_to--> `Ambiguous voice clarification`  [INFERRED] [semantically similar]
  PRODUCT_CHARTER.md → docs/PRODUCT_FLOWS.md
- `Pending deployed demo verification` --semantically_similar_to--> `Hosted HTTPS API and CORS smoke checklist`  [INFERRED] [semantically similar]
  README.md → docs/DEPLOYMENT.md
- `AccountPage()` --calls--> `getSessionProfile()`  [EXTRACTED]
  app/account/page.tsx → lib/auth.ts
- `OrderConfirmationContent()` --calls--> `fetchOrder()`  [EXTRACTED]
  app/order-confirmation/page.tsx → lib/api.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Documented portfolio safety principles** — product_charter_portfolio_mock_ordering_demo, product_charter_manual_ordering_alternative, product_charter_mock_checkout, product_charter_visible_voice_interpretation [EXTRACTED 1.00]
- **Documented backend cart persistence paths** — backend_readme_session_cart_api, docs_architecture_redis_cart_sessions, docs_architecture_postgresql_primary_persistence, docs_architecture_json_emergency_fallback [EXTRACTED 1.00]
- **Documented remaining hosted demo gate** — readme_pending_deployed_demo_verification, docs_deployment_hosted_https_api_and_cors_smoke_checklist, docs_deployment_managed_postgres_and_redis_provisioning [EXTRACTED 1.00]

## Communities (70 total, 25 thin omitted)

### Community 0 - "Backend persistence and APIs"
Cohesion: 0.08
Nodes (68): database_url(), get_connection(), postgres_available(), Any, cart_pricing(), carts_clear(), carts_show(), carts_upsert() (+60 more)

### Community 1 - "Cart and checkout screens"
Cohesion: 0.09
Nodes (54): AccountPage(), CartPage(), CheckoutPage(), MarketplaceNav(), MarketplaceNavProps, OrderConfirmationContent(), OrdersPage(), HomePage() (+46 more)

### Community 2 - "Fixture menus and pricing"
Cohesion: 0.06
Nodes (51): RestaurantLoadResult, createMockOrderId(), categorizeMenu(), DEFAULT_SERVICE_FEE_CENTS, drinkItem(), drinkModifiers, emptyRestaurants, entreeItem() (+43 more)

### Community 3 - "Package dependencies"
Cohesion: 0.06
Nodes (32): next, dependencies, next, react, react-dom, devDependencies, @playwright/test, @types/node (+24 more)

### Community 4 - "Frontend API adapter"
Cohesion: 0.13
Nodes (29): ApiCart, ApiCartItem, ApiCartItemModifier, ApiMenuCategory, ApiMenuItem, ApiModifierGroup, ApiModifierOption, ApiOrder (+21 more)

### Community 5 - "Local demo accounts"
Cohesion: 0.18
Nodes (25): SignInContent(), accountToProfile(), AUTH_ACCOUNTS_STORAGE_KEY, AuthAccount, AuthResult, AuthSession, createAuthUserId(), ensureAddressProfile() (+17 more)

### Community 6 - "TypeScript configuration"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+19 more)

### Community 7 - "Fixture restaurant discovery"
Cohesion: 0.17
Nodes (18): formatDeliveryFee(), isRestaurantSort(), RestaurantsPage(), RestaurantsPageProps, sortLabels, cuisineRoadmap, discoveryCuisineFilters, discoveryMockStates (+10 more)

### Community 8 - "Design mockup generator"
Cohesion: 0.44
Nodes (8): card_restaurant(), footer_label(), menu_item(), nav(), phone(), pill(), rect(), text()

### Community 9 - "Environment configuration"
Cohesion: 0.33
Nodes (7): assertDevelopmentConfig(), AuthProvider, CheckoutMode, env, readEnum(), readOptionalUrl(), VoiceMode

### Community 10 - "Unused telemetry helpers"
Cohesion: 0.31
Nodes (6): clearTelemetryBuffer(), eventBuffer, getTelemetryBuffer(), TelemetryEvent, TelemetryEventName, trackEvent()

### Community 11 - "HTTP error envelopes"
Cohesion: 0.47
Nodes (6): http_exception_handler(), validation_exception_handler(), exception_handler, JSONResponse, Request, RequestValidationError

### Community 12 - "Documented storage architecture"
Cohesion: 0.33
Nodes (6): Browser local fallback mirrors, FastAPI backend, JSON emergency fallback, Next.js browser frontend, PostgreSQL primary persistence, Redis cart sessions

### Community 13 - "Homepage design intentions"
Cohesion: 0.40
Nodes (5): Illustrative delivery tracking, Marketplace discovery, Midnight Market theme, Homepage mockup, Multi-cuisine aspiration

### Community 14 - "Discovery design intentions"
Cohesion: 0.40
Nodes (5): Discovery filters, Map affordance, Restaurant results mockup, Restaurant comparison, Restaurant search

### Community 15 - "Menu design intentions"
Cohesion: 0.40
Nodes (5): Favorite affordance, Menu categories, Menu item selection, Restaurant menu mockup, Restaurant context

### Community 16 - "Customization design intentions"
Cohesion: 0.40
Nodes (5): Cart addition, Item configuration, Item customization mockup, Modifier pricing, Special instructions

### Community 17 - "Checkout design intentions"
Cohesion: 0.40
Nodes (5): Cart review, Delivery review, Illustrative payment, Checkout payment mockup, Price breakdown

### Community 18 - "Confirmation design intentions"
Cohesion: 0.40
Nodes (5): Mock order confirmation, Order confirmation mockup, Order progress, Receipt affordance, Reorder affordance

### Community 19 - "Vercel configuration"
Cohesion: 0.40
Nodes (4): buildCommand, devCommand, framework, installCommand

### Community 21 - "Voice clarification principles"
Cohesion: 0.67
Nodes (3): Ambiguous voice clarification, Manual ordering alternative, Visible voice interpretation

## Knowledge Gaps
- **139 isolated node(s):** `MarketplaceNavProps`, `metadata`, `RestaurantMenuPageProps`, `RestaurantsPageProps`, `sortLabels` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatMoney()` connect `Cart and checkout screens` to `Fixture menus and pricing`, `Fixture restaurant discovery`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `restaurants` connect `Fixture restaurant discovery` to `Cart and checkout screens`, `Fixture menus and pricing`, `Frontend API adapter`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `MarketplaceNavProps`, `metadata`, `RestaurantMenuPageProps` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend persistence and APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.08491228070175438 - nodes in this community are weakly interconnected._
- **Should `Cart and checkout screens` be split into smaller, more focused modules?**
  _Cohesion score 0.08823529411764706 - nodes in this community are weakly interconnected._
- **Should `Fixture menus and pricing` be split into smaller, more focused modules?**
  _Cohesion score 0.05747126436781609 - nodes in this community are weakly interconnected._
- **Should `Package dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
## Audit limitations

This is a local, undirected discovery graph, not execution evidence. 68 extracted edges have dangling endpoints and 25 relationships collapse to the same endpoint pairs. Four JSON/TOML files produced no AST nodes; SQL grammar is missing, so the migration is absent. No provider token usage is exposed; zeros mean unmeasured, not free. Documentation and mockup nodes represent claims and design intentions. Generated audit documents are outside this initial 79-file snapshot.
