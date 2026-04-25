# SHOPaBOT Design Audit — April 25, 2026

## Summary
The app has a solid dark-theme foundation with a consistent monospace/techy aesthetic. The core issues are:
1. **Monospace font overuse** — the landing page uses a heavy monospace (looks like Courier/Space Mono) for ALL text including body copy, making it feel retro/hacker rather than premium SaaS
2. **Color inconsistency** — cyan (#00d4ff) is the primary accent but it competes with yellow button outlines on the landing page
3. **Landing page hero** — "AUTONOMOUS E-COMMERCE" headline is all-caps monospace, very heavy; subtext is too small and low contrast
4. **Pricing cards** — inconsistent button styles (some cyan fill, some dashed outline), "Popular" badge placement is off
5. **Bot cards on landing** — good structure but the icon backgrounds use different colors (blue/teal/amber) without a clear system
6. **Onboarding** — clean and functional, but the step indicators are plain circles; could use more polish
7. **Dashboard (blocked by onboarding)** — need to skip onboarding to audit
8. **Sidebar** — functional but nav item hover states are subtle; active state could be more prominent
9. **Metrics strip on landing** — good content, but the card borders are too faint and the icon colors are inconsistent
10. **CTA buttons** — "GET STARTED" uses a cyan fill with dashed border on hover; inconsistent with the solid cyan primary buttons elsewhere

## Priority Issues to Fix

### P0 — Critical Visual Inconsistencies
- [x] Landing: Replace monospace body text with Inter/Geist (keep monospace only for headlines/brand)
- [x] Landing: Unify button styles — primary = solid cyan, secondary = outline white/transparent
- [x] Landing: Fix pricing card button styles (all should be consistent)
- [x] Landing: Increase hero subtext size and contrast (currently ~14px gray on black)
- [x] Landing: Add gradient/glow to hero headline for premium feel

### P1 — Polish & Hierarchy
- [x] Landing: Bot cards — unify icon background colors (all cyan/blue tonal, not mixed amber/teal)
- [x] Landing: Metrics strip — increase card border opacity, add subtle gradient backgrounds
- [x] Landing: Add visual separator between sections (subtle gradient dividers)
- [x] Landing: "NEW" badge on announcement bar — make it more prominent (pill shape, cyan bg)
- [x] Landing: Footer — too sparse, add more links and social icons
- [x] Onboarding: Step indicators — add labels below each step number
- [x] Onboarding: Bot cards — add hover state with border glow

### P2 — Dashboard Polish
- [x] Sidebar: Active nav item needs stronger visual treatment (left border accent + bg)
- [x] Sidebar: Logo area — add subtle bottom border separator
- [x] Home: Metric cards — add trend arrows and percentage change indicators
- [x] Home: Bot status cards — add real-time pulse animation when bot is "running"
- [x] Home: Empty state — improve with illustration or icon + clear CTA

### P3 — Component Consistency
- [x] All pages: Card hover states — standardize to subtle border-glow on hover
- [x] All pages: Loading skeletons — ensure consistent shimmer animation
- [x] All pages: Toast notifications — verify positioning and z-index
- [x] All pages: Error states — add retry button to all error cards
