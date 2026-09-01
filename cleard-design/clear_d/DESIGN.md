---
name: Clear'd
colors:
  surface: '#fbf9f7'
  surface-dim: '#dbdad8'
  surface-bright: '#fbf9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f2'
  surface-container: '#efedec'
  surface-container-high: '#e9e8e6'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1b'
  on-surface-variant: '#444748'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#5d5f5e'
  on-secondary: '#ffffff'
  secondary-container: '#dcdddc'
  on-secondary-container: '#5f6161'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1b1a'
  on-tertiary-container: '#868382'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c7c6'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e6e2df'
  tertiary-fixed-dim: '#cac6c4'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484645'
  background: '#fbf9f7'
  on-background: '#1b1c1b'
  surface-variant: '#e4e2e1'
typography:
  display-serif:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: '500'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 34px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  amount-display:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 20px
  stack-gap: 12px
  section-gap: 32px
  gutter: 16px
---

## Brand & Style

The design system is rooted in the "New Editorial" movement—a blend of high-end publishing aesthetics and functional software utility. It rejects the over-embellished trends of contemporary SaaS in favor of clarity, restraint, and precision. The emotional response is one of organized calm, aimed at users who value intentionality in their financial lives.

The style is characterized by:
- **Minimalism:** Aggressive use of negative space to drive focus toward financial data.
- **Precision:** Mathematical alignment and consistent stroke weights.
- **Editorial Authority:** Leveraging serif typography to make financial status feel like a curated report rather than a chaotic feed.
- **Tactile Restraint:** Surfaces feel like premium paper or milled metal rather than digital "glass."

## Colors

This design system utilizes a monochromatic foundation with a "paper and ink" philosophy. Colors are strictly functional, reserved for state communication rather than brand expression.

- **Light Mode:** Uses an off-white (`#F9F9F8`) base to reduce eye strain and provide a premium, non-synthetic feel.
- **Dark Mode:** Switches to a deep charcoal (`#121212`) rather than pure black to maintain legible contrast levels.
- **Semantic Logic:**
  - **Green:** Indicates a "Cleared" status—funds have settled or a goal is reached.
  - **Amber:** Indicates "Pending" or "Scheduled"—temporal states requiring awareness but no immediate action.
  - **Red:** Indicates "Attention Required"—overdrafts, missed payments, or errors.
- **Grays:** Used to differentiate secondary information (labels, inactive states) from primary data (amounts, titles).

## Typography

The typography strategy creates a clear hierarchy between "narrative" and "data." 

- **Newsreader** is the voice of the app. It is used for storytelling elements: page headers, month names, and high-level financial summaries. It should always be set with slightly tighter tracking at larger sizes.
- **Inter** is the engine of the app. It handles all transactional data, numerical amounts, and interactive labels. Its high x-height ensures clarity in high-density lists.
- **Numerical Data:** Amounts should always use tabular figures (monospaced numbers) where possible to ensure columns of figures align vertically in lists and tables.

## Layout & Spacing

This design system uses a rigorous 4px baseline grid. The layout philosophy is centered on "density without clutter."

- **Mobile First:** A 4-column fluid grid with 20px outside margins. 
- **Desktop:** A fixed-width center container (max 768px) for financial utilities to maintain a focused "ledger" feel, or a 12-column grid for dashboard views.
- **Grouping:** Use white space instead of lines where possible. Related data points (e.g., a merchant name and a timestamp) should be grouped with a 4px or 8px gap, while distinct list items use 12px or 16px.
- **Alignment:** Financial amounts should be right-aligned in lists to allow for easy scanning of decimal points.

## Elevation & Depth

This design system avoids traditional drop shadows and physical "lift." Hierarchy is instead established through:

- **Tonal Layering:** In Light Mode, the primary surface is `#F9F9F8`. Secondary containers or "cards" use a subtle stroke (`1px #E5E5E5`) or a slightly cooler off-white background.
- **Hard Strokes:** Instead of shadows, use 1px solid borders to define interactive areas. In Dark Mode, these strokes should be low-contrast (`#2A2A2A`).
- **Surface Dimming:** When a modal or drawer is active, the background does not blur; it undergoes a simple tonal dimming (20% opacity black overlay) to maintain the crispness of the interface.

## Shapes

The shape language is "Soft" but disciplined. 

- **Standard Radius:** 4px (0.25rem) for most interactive elements like buttons and input fields. This provides enough softness to feel modern but retains the "precise" architectural feel.
- **Large Radius:** 8px (0.5rem) for main content containers or cards.
- **Strictness:** Do not use fully rounded pill shapes for buttons, as they conflict with the editorial, structured nature of the typography.

## Components

- **Buttons:** Primary buttons are solid monochromatic (Black in light mode, White in dark mode). Secondary buttons use a 1px stroke with no fill. Typography in buttons is always Inter Bold 14px.
- **Inputs:** Minimalist bottom-border only or a light 4px rounded frame. Labels sit above the input in `label-caps` style. No icons inside inputs unless strictly functional (e.g., a search loupe or a clear-text 'X').
- **Status Chips:** Small, rectangular with 2px radius. Use a light tinted background of the semantic color with a dark text version of that color (e.g., Light Green bg with Dark Green text).
- **Transaction Lists:** High-density. Merchant name in `title-md`, date/category in `body-sm` gray, and amount in `amount-display`. Right-aligned amounts.
- **Segmented Control:** A simple "pill" container where the active state is indicated by a subtle fill change or a simple high-contrast underline.
- **Cards:** Used sparingly. Cards should not have shadows; they should be defined by a 1px stroke. They are used to group "Summary" data at the top of a view.