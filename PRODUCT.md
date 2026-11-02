# Product

## Register

product

## Users

Nebulens serves creators and operators who want to generate, review, reuse, and locally archive AI images without leaving the workspace. They are usually in a focused desktop workflow: writing prompts, attaching optional reference images, comparing outputs, and returning to previous generations.

Each visitor signs in with a username and password; Google OAuth is also supported as an optional login method. Every account receives an independent daily generation quota. The product is a multi-account workstation rather than a single-user local tool — generation history is stored server-side in SQLite and persists across sessions and devices on the same deployment.

## Product Purpose

The product turns prompts and optional reference images into generated image batches, then keeps local history available for review, download, rerun, and deletion. Success means the interface feels calm, precise, and premium while keeping generation controls immediately usable.

## Brand Personality

Minimal, editorial, exacting. The product should feel like a high-end creative workstation: spacious, restrained, tactile, and confident rather than decorative or noisy.

## Anti-references

Avoid generic AI SaaS dashboards, crowded admin panels, neon sci-fi styling, heavy glassmorphism, gradient text, repeated metric cards, and anything that makes the generation workflow feel like a marketing page instead of a tool.

## Design Principles

1. Lead with spacious clarity, then keep task controls close to hand.
2. Use premium restraint: tactile surfaces, quiet motion, and precise hierarchy.
3. Treat image history as part of the creative workflow, not a separate database.
4. Keep all user-facing copy concise and Simplified Chinese in the app.
5. Preserve familiar product affordances even when the visual atmosphere is editorial.

## Accessibility & Inclusion

Target a practical WCAG AA baseline: visible focus states, sufficient text contrast, semantic controls, descriptive Simplified Chinese labels, and reduced-motion support for entrance animations.

## Theme

**Light theme: not yet enabled.** All design tokens in `frontend/src/styles/tokens.css` are defined exclusively for dark mode (`color-scheme: dark`). No light-mode token overrides or `prefers-color-scheme: light` media queries exist. A future light theme will require a parallel token set and a tested toggle mechanism. Until then, no light-theme UI should be shipped.
