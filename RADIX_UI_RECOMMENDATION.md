# Radix UI Component Recommendation for Meridian

Research conducted 2026-03-19. Based on Radix Primitives docs, Radix Themes docs, and full audit of the current Meridian codebase.

---

## Overall Recommendation: Radix Primitives (NOT Radix Themes)

**Use Radix Primitives with custom CSS. Do NOT use Radix Themes.**

Reasons:

1. **Meridian has a strong visual identity** — Georgia serif, glassmorphic panels with backdrop-filter blur, radial gradient backgrounds, a teal/ember/ink/sand palette. Radix Themes ships its own design system (Inter font, standardized spacing/color tokens, opinionated card/button styles). Adopting Themes means fighting its defaults to preserve the Meridian look.

2. **Radix Themes is all-or-nothing** — It requires wrapping the entire app in `<Theme>`, importing `@radix-ui/themes/styles.css`, and accepting its reset layer. The glassmorphic panels, custom gradient hero sections, and translucent cards cannot be expressed through Theme tokens alone. You would need heavy CSS overrides that defeat the purpose of a pre-styled library.

3. **Primitives give you accessibility for free with zero visual opinions** — Every Radix Primitive handles ARIA roles, keyboard navigation, focus management, and screen-reader announcements. You style them with the same CSS classes you already have. The migration is additive, not a rewrite.

4. **Bundle size** — Primitives are tree-shakeable individual packages. Themes ships a full CSS bundle (~30KB+) whether you use 3 components or 30.

**Bottom line**: Install individual `radix-ui` primitive packages. Keep globals.css as the styling layer. Replace hand-rolled interactive patterns with Radix Primitives for accessibility and interaction quality. Keep all visual CSS.

---

## Component-by-Component Mapping

### 1. Navigation — Sticky Nav Bar

**Current**: Hand-rolled `<nav>` with `<ul>/<li>/<Link>` and `.nav-bar`/`.nav-link`/`.active` CSS classes.

**Recommendation**: **Radix Primitive `NavigationMenu`**

Why: NavigationMenu provides `NavigationMenu.Link` with an `active` prop and `[data-active]` attribute for styling. It handles ARIA roles, keyboard arrow-key navigation, roving tabindex, and focus management — all missing from the current implementation. The current nav is simple enough that NavigationMenu may be overkill for 3 route links with no submenus.

**Alternative**: Keep the current `<nav>/<ul>/<Link>` structure. It is semantically correct. The main thing missing is `role="navigation"` (already has `<nav>`) and keyboard support between items, which is a nice-to-have for a simple top nav.

**Verdict**: **Keep current implementation. NavigationMenu adds complexity without proportional benefit for 3 flat links with no dropdowns.** If submenus are ever added, switch to NavigationMenu.

Custom CSS: Keep all `.nav-bar`, `.nav-link`, `.nav-brand` styles as-is.

---

### 2. Navigation — Back Button

**Current**: `<button className="back-btn">` with click handler.

**Recommendation**: **No Radix component needed.** A `<button>` with `onClick` calling router navigation is correct. Consider making it a `<Link>` for proper semantics (it navigates to a page).

Custom CSS: Keep `.back-btn` styles.

---

### 3. Layout — Page Shell / Container

**Current**: `<main className="shell">` with `min(1100px, calc(100% - 32px))` max-width.

**Recommendation**: **No Radix component needed.** Radix Themes has `Container` (448px-1136px presets) but we are not using Themes. A `<main>` with a max-width CSS class is the correct semantic pattern.

Custom CSS: Keep `.shell` styles.

---

### 4. Layout — Feature Stack

**Current**: `<div className="featureStack">` — a vertical grid with 20px gap.

**Recommendation**: **No Radix component needed.** This is a CSS `display: grid; gap: 20px` one-liner. Radix Themes `Flex` or `Grid` would do the same but add a dependency for no benefit when not using Themes.

Custom CSS: Keep `.featureStack`.

---

### 5. Layout — 2-Column Trade Layout / Market Grid / 3-Column Metric Grid

**Current**: CSS Grid classes (`.trade-layout`, `.market-card-list`, `.trade-meta-grid`, `.heroSummary`) with responsive breakpoints.

**Recommendation**: **No Radix component needed.** These are pure layout concerns. CSS Grid is the correct tool.

Custom CSS: Keep all grid classes. The responsive breakpoint at 800px is clean.

---

### 6. Cards & Panels — Panel (glassmorphic)

**Current**: `.panel` class — `backdrop-filter: blur(8px)`, translucent white background, border-radius 24px, shadow.

**Recommendation**: **No Radix component.** Radix Themes `Card` offers `surface`/`classic`/`ghost` variants but cannot express glassmorphism (backdrop-filter + translucent backgrounds). This is custom CSS territory.

Custom CSS: Keep `.panel`, `.ticket-panel`, `.book-panel`, `.redeem-section`. These are the signature visual element of the app.

---

### 7. Cards & Panels — Market Card (clickable)

**Current**: `<li className="market-row market-card">` with `onClick`, `role="button"`, `tabIndex`, `onKeyDown` for Enter/Space.

**Recommendation**: **No Radix component needed**, but the hand-rolled keyboard handling is exactly what Radix Primitives would give you for free. Consider wrapping in a `<button>` styled with `asChild` pattern instead of a `<li role="button">`. A `<button>` natively handles Enter/Space and focus, eliminating 8 lines of keyboard handler code.

Alternatively, since these navigate to trade pages, use Next.js `<Link>` (which is an `<a>` tag and handles keyboard/focus natively).

Custom CSS: Keep `.market-card`, `.market-row`, `.market-card-head`, etc.

---

### 8. Cards & Panels — Quote Card, Balance Chip, Meta Card, Side Quote Card

**Current**: Simple `<div>` containers with label `<span>` and value `<strong>`.

**Recommendation**: **No Radix component.** These are pure presentational containers. No interactivity, no accessibility concerns beyond semantic HTML.

Custom CSS: Keep `.quote-card`, `.balance-chip`, `.trade-meta-card`, `.side-quote-card`.

---

### 9. Interactive Controls — Buy/Sell Segmented Control

**Current**: Two `<button>` elements in a `.segmented-control` grid, using `aria-pressed` and manual `onClick` state toggling.

**Recommendation**: **Radix Primitive `ToggleGroup`** with `type="single"`

```
ToggleGroup.Root type="single" value={tradeDirection} onValueChange={setTradeDirection}
  ToggleGroup.Item value="buy"  -> Buy
  ToggleGroup.Item value="sell" -> Sell
```

Why: ToggleGroup provides roving tabindex (arrow-key navigation between options), ARIA `role="group"` with proper `aria-pressed` management, and `[data-state="on"|"off"]` attributes for CSS styling. The current code manually handles `aria-pressed` but lacks keyboard arrow navigation.

Enforce "always one selected" with: `onValueChange={(v) => { if (v) setTradeDirection(v) }}`

Custom CSS: Keep `.segmented-control`, `.segment`, `.segment.active`. Target `[data-state="on"]` instead of `.active` class.

---

### 10. Interactive Controls — Yes/No Segmented Control

**Current**: Same as above but with teal/ember active colors.

**Recommendation**: **Same Radix `ToggleGroup`** with `type="single"`.

Custom CSS: Keep `.segment.yes.active`, `.segment.no.active`. Map to `[data-state="on"]` combined with a data attribute or class for the outcome color.

---

### 11. Interactive Controls — Quantity Input

**Current**: `<input type="number" id="qty-input">` with `<label htmlFor="qty-input">`.

**Recommendation**: **Radix Primitive `Label`** for the label element. The input itself is a native `<input>`. Radix `Label` wraps the native `<label>` and ensures correct association with form controls.

This is a minor improvement — the current `<label htmlFor>` already works correctly. The benefit is marginal.

Custom CSS: Keep `.quantity-row input`, `.quantity-row label` styles.

---

### 12. Interactive Controls — Quantity Shortcuts (1, 5, 10 pills)

**Current**: Row of `<button>` elements, one visually "active" based on matching the quantity state.

**Recommendation**: **Radix Primitive `ToggleGroup`** with `type="single"` — same component as the Buy/Sell toggle, but with 3 items.

```
ToggleGroup.Root type="single" value={String(quantity)} onValueChange={v => setQuantity(Number(v))}
  ToggleGroup.Item value="1"  -> 1
  ToggleGroup.Item value="5"  -> 5
  ToggleGroup.Item value="10" -> 10
```

Note: Since the user can also type a custom value in the input, the shortcut group might have no active item when the input value is not 1/5/10. ToggleGroup handles this gracefully — if `value` does not match any item, nothing is pressed.

Custom CSS: Keep `.shortcut`, `.shortcut.active`.

---

### 13. Interactive Controls — Submit Button (Trade / Redeem)

**Current**: `<button className="trade-submit buy yes">` with gradient backgrounds and disabled state.

**Recommendation**: **No Radix component.** This is a standard `<button>` with custom styling. Radix Themes `Button` offers loading states and variants, but we are not using Themes. The current implementation is correct.

Custom CSS: Keep `.trade-submit` and all its variants (`.buy.yes`, `.buy.no`, `.sell.yes`, `.sell.no`).

---

### 14. Interactive Controls — Refresh Button / Panel Action Button

**Current**: `<button className="panelActionButton">` with disabled state.

**Recommendation**: **No Radix component needed.** Standard button.

Custom CSS: Keep `.panelActionButton`.

---

### 15. Interactive Controls — Wallet Connect Button

**Current**: Dynamically imported `WalletMultiButton` from `@solana/wallet-adapter-react-ui`.

**Recommendation**: **Leave as-is.** This is a third-party component with its own modal and styles. Do not replace with Radix.

---

### 16. Data Display — Order Book Tables

**Current**: `<table className="ob-table">` with `<thead>/<tbody>/<tr>/<th>/<td>` and `.bid-cell`/`.ask-cell` coloring.

**Recommendation**: **No Radix component.** Radix Themes `Table` (Root, Header, Body, Row, Cell) is pre-styled and would need heavy overrides for monospace font, teal/ember coloring, and compact density. Native `<table>` is semantically correct and accessible out of the box.

Custom CSS: Keep `.ob-table`, `.bid-cell`, `.ask-cell`, `.price-cell`.

---

### 17. Data Display — Position List & History List

**Current**: `<ul>/<li>` with flex layout and separator borders.

**Recommendation**: **Radix Primitive `Separator`** between list items (optional, cosmetic). The lists themselves are simple unordered lists. The current CSS border-bottom approach is equivalent and simpler.

**Verdict**: Keep current approach. No Radix component needed.

Custom CSS: Keep `.panel ul`, `.panel li` styles.

---

### 18. Status & Feedback — Phase Badge

**Current**: `<span className="phase-badge settled|closed|live">` with variant classes.

**Recommendation**: **No Radix component.** This is a static display element. Radix Themes `Badge` offers `solid`/`soft`/`surface`/`outline` variants with color props, but we are not using Themes. A styled `<span>` is the correct pattern.

Custom CSS: Keep `.phase-badge`, `.phase-badge.settled`, `.phase-badge.closed`, `.phase-badge.live`.

---

### 19. Status & Feedback — Error Message

**Current**: `<p className="trade-error">` with ember-tinted background.

**Recommendation**: **No Radix component for display.** However, if you want transient error notifications (auto-dismiss after N seconds), **Radix Primitive `Toast`** is the right choice. Toast provides:
- Auto-dismiss with configurable `duration`
- Swipe-to-dismiss
- Pause on hover
- ARIA live-region announcements
- Viewport management for stacking multiple toasts

This would be an upgrade from the current inline error paragraph, which stays visible until the next action.

**Verdict**: **Add Toast for transaction feedback** (success confirmations, error notifications). Keep the inline error display as a fallback for persistent errors.

Custom CSS: Toast content needs custom styling to match the glassmorphic theme. Style the Toast.Content with translucent background, backdrop-filter, and border-radius matching `.panel`.

---

### 20. Status & Feedback — Payoff Display

**Current**: `<p className="payoff">` with teal-tinted background.

**Recommendation**: **No Radix component.** Static display.

Custom CSS: Keep `.payoff`.

---

### 21. Status & Feedback — Guidance Text

**Current**: `<p className="guidance">`.

**Recommendation**: **No Radix component.** Static text.

Custom CSS: Keep `.guidance`.

---

### 22. Status & Feedback — Loading/Empty States

**Current**: Conditional renders showing "Loading...", "No active positions", "No history".

**Recommendation**: **No Radix component.** However, if you want skeleton loading states, Radix Themes `Skeleton` is well-designed (wrap content with `<Skeleton loading={isLoading}>`, it shows a placeholder of the same dimensions). Since we are not using Themes, implement skeleton loading with a simple CSS animation class if desired.

Custom CSS: Create a `.skeleton` class with a shimmer animation if needed.

---

### 23. Tooltip (future use)

**Current**: Not currently used in the app.

**Recommendation**: **Radix Primitive `Tooltip`** for any future hover hints (e.g., explaining what "settlement" means, what bid/ask prices represent). Tooltip provides correct ARIA, keyboard focus triggers, positioning with collision detection, and configurable delay.

Wrap with `Tooltip.Provider` at the app root for shared delay configuration.

---

### 24. Dialog (future use)

**Current**: No modals in the app (wallet modal comes from the wallet adapter).

**Recommendation**: **Radix Primitive `Dialog`** or **`AlertDialog`** if/when you need confirmation dialogs (e.g., "Confirm trade of 10 Yes at $0.65?"). AlertDialog specifically requires user acknowledgment and prevents dismiss-by-clicking-outside, making it safer for financial actions.

Custom CSS: Style Dialog.Overlay with a translucent backdrop and Dialog.Content with the glassmorphic panel style.

---

### 25. Popover (future use)

**Current**: Not used.

**Recommendation**: **Radix Primitive `Popover`** for inline contextual info (e.g., clicking a price to see depth, or a position to see details). Better than a tooltip when the content is interactive or rich.

---

### 26. Select (future use)

**Current**: No dropdowns in the app.

**Recommendation**: **Radix Primitive `Select`** if you ever need dropdowns (e.g., market/ticker selector). Handles keyboard navigation, typeahead, ARIA roles, and portal rendering.

---

### 27. ScrollArea (future use)

**Current**: Not used. Order book tables are short (4 rows max).

**Recommendation**: **Radix Primitive `ScrollArea`** if the order book depth increases and needs a scrollable container with custom-styled scrollbars matching the theme.

---

## Summary: What to Install

### Install now (immediate value)

| Package | Use case |
|---------|----------|
| `@radix-ui/react-toggle-group` | Buy/Sell toggle, Yes/No toggle, Quantity shortcuts |
| `@radix-ui/react-toast` | Transaction success/error notifications |
| `@radix-ui/react-tooltip` | Hover hints on prices, balances, badges |

### Install later (when needed)

| Package | Use case |
|---------|----------|
| `@radix-ui/react-alert-dialog` | Trade confirmation modal |
| `@radix-ui/react-dialog` | General modals |
| `@radix-ui/react-popover` | Inline contextual panels |
| `@radix-ui/react-select` | Dropdown selectors |
| `@radix-ui/react-scroll-area` | Deep order book scrolling |

### Do NOT install

| Package | Why |
|---------|-----|
| `@radix-ui/themes` | Conflicts with Meridian's custom visual identity |
| `@radix-ui/react-navigation-menu` | Overkill for 3 flat nav links |
| `@radix-ui/react-tabs` | The app uses segmented controls (ToggleGroup), not tab panels with content switching |
| `@radix-ui/react-separator` | CSS border-bottom achieves the same effect with less code |
| `@radix-ui/react-label` | Native `<label htmlFor>` already works |
| `@radix-ui/react-avatar` | Not needed — no user avatars |
| `@radix-ui/react-aspect-ratio` | Not needed — no images/media |
| `@radix-ui/react-accordion` | Not needed — no collapsible sections |

---

## CSS Strategy

### Keep the current approach

The existing `globals.css` is clean, well-structured, and expresses the Meridian brand. Do not replace it with a CSS-in-JS solution or Radix Themes tokens.

### Integration pattern for Radix Primitives

Radix Primitives render unstyled HTML elements with `data-state` and `data-*` attributes. Style them using standard CSS selectors:

```css
/* Replace .segment.active with data-state targeting */
.segment[data-state="on"] {
  background: rgba(19, 34, 48, 0.9);
  color: #fff;
}

.segment.yes[data-state="on"] {
  background: rgba(47, 111, 106, 0.92);
}

.segment.no[data-state="on"] {
  background: rgba(182, 90, 49, 0.92);
}
```

### Glassmorphic design preservation

The glassmorphic panels (`backdrop-filter: blur`, translucent backgrounds, layered shadows) are the visual signature of Meridian. Radix has no opinion on this. All panel/card/hero styles remain as CSS classes. No changes needed.

### Gradient backgrounds

The radial gradient HTML background and linear gradient hero sections are pure CSS. No Radix involvement.

### Typography

Georgia serif remains the body font. Monospace for financial data (`SFMono-Regular`, Consolas, etc.). Radix Primitives do not impose any font choices.

---

## What to CUT from the Current UI

These simplifications would reduce surface area without losing core user flows:

### Remove

1. **InfoPanel / TradingOverviewPanel** (`info-panel.tsx`, `trading/view.tsx`) — This is a developer-facing explanation of how the order book works. End users do not need to see "Buy Yes Book Flow" / "Sell Yes Book Flow" descriptions. Remove it.

2. **Hero summary metrics on landing page** — The 3 cards showing "Settlement: $1.00 binary payout", "Venue: Phoenix order book", "Network: Solana devnet" are marketing/developer copy. They add visual weight without helping the user trade. Consider removing or moving to an About/FAQ page.

3. **Side quote cards on the book panel** — The `SideQuoteCard` components (showing best bid/ask per side) duplicate information already visible in the `LadderView` tables directly below them. Pick one: either the summary cards or the ladder tables. The ladders are more informative.

4. **Quote strip in ticket panel** — Four quote cards (Best bid, Best ask, Spread, Est. cost) above the quantity input. The Est. cost card is useful; the other three duplicate the book panel. Consider keeping only Est. cost/proceeds inline with the submit button.

### Simplify

5. **Merge landing page hero and market list** — The hero takes up the full viewport. The market list is below the fold. Consider a compact hero or header-only treatment that gets the user to the market list faster.

6. **Balance chips** — Currently three separate chips (Cash, Yes, No). Consider a single compact row or inline display in the trade ticket header.

7. **Responsive breakpoint** — Currently only one breakpoint at 800px. This is fine for an MVP. No need to add more complexity.

### Keep (core flows)

- Nav bar (Markets, Portfolio, History)
- Market discovery list with cards
- Trading screen with trade ticket + order book ladders
- Buy/Sell and Yes/No toggles
- Quantity input + shortcuts
- Submit button with gradient coloring
- Phase badge with countdown
- Error display
- Portfolio position list
- History event list
- Wallet connect button
- Redeem flow for settled markets

---

## Migration Priority

**Phase 1 (high value, low effort)**:
- Replace Buy/Sell and Yes/No button groups with `ToggleGroup` — removes ~20 lines of manual aria-pressed/onClick handling, adds keyboard arrow navigation
- Replace Quantity shortcuts with `ToggleGroup` — same benefit

**Phase 2 (medium value, medium effort)**:
- Add `Toast` for transaction notifications — better UX than inline error paragraph
- Add `Tooltip` on financial terms and price displays

**Phase 3 (when needed)**:
- Add `AlertDialog` for trade confirmation
- Add `ScrollArea` if order book depth increases
- Add `Select` if market/ticker selection UI is needed
