# Product

## Register

product

## Positioning

贝尔灵画 (Nebulens) is a design Agent: one request goes in, and a whole matching set of ready-to-use design material comes out. The public line is "设计 Agent，一句话出整套物料".

- It is not a "全场景" (every-scenario) platform. Claim only what ships. The product makes no 3D, video or UI prototypes, so no copy may suggest it does.
- Once project memory ships, the line becomes "会记住你品牌的设计 Agent".
- The visual language borrows from other AI design tools. The positioning, copy and brand must stay our own.

## Users

The users are people at work who need design material often but have no designer to ask: operations, marketing, pre-sales, product managers and small shop owners. They ask for deliverables, not pictures: an event poster in three formats, an e-commerce main image with its scene and selling-point shots, a report cover with its contents and divider pages, four logo directions. They judge three things: whether the set looks like one family, whether the text on it is right, and whether they can keep adjusting it.

Each visitor signs in with a username and password; Google OAuth is optional. Generating spends credits (积分). A new account starts at 0, the daily check-in grants some, and admins can grant more. Pictures are stored on the server. Agent conversations and canvas layouts still live in the browser until projects move to the server.

## Product Purpose

The product turns one request into a planned, matching set of design material, and keeps the set on a canvas where it can be adjusted and reused.

- The Agent (Agent 画布, `/agent`) is the main path:
  - It picks one of the skills, or plans the set itself.
  - It shows the plan and its credit cost before spending, unless set to run automatically.
  - It generates each picture, checks the text on it and redraws what is wrong.
  - Pictures selected on the canvas become references for the next request.
- Skills are the deliverables the Agent knows how to make as a set: poster, e-commerce, report, logo, infographic, storyboard and others.
- 生图 (`/generate`) stays as the quick way to make a single picture from a prompt.

Success means a non-designer gets material they can use as is, and the interface feels calm, precise and premium.

## Direction

Planned next, in this order:

1. Projects stored on the server, holding the canvas, the conversation and the pictures together.
2. Project memory: the brand kit, preferences the user has stated, and the pictures they kept or rejected, all fed to the Agent. Users can see and edit the memory.
3. Editing on the canvas: region redraw, outpaint, cut-out, text replace and upscale.
4. More image models, picked per task.

Video, 3D and UI come last, and only if users ask for them.

## Brand Personality

Minimal, editorial, exacting. The product should feel like a capable design partner inside a high-end workstation: spacious, restrained, tactile and confident rather than decorative or noisy.

## Anti-references

Avoid:

- generic AI SaaS dashboards and crowded admin panels
- neon sci-fi styling, heavy glassmorphism and gradient text
- repeated metric cards
- anything that makes the generation workflow feel like a marketing page instead of a tool
- copy that claims capabilities the product does not have, or that echoes a competitor's positioning

## Design Principles

1. The Agent is the main path: a request becomes a planned set on the canvas. Single-picture generation is the shortcut.
2. Speak in deliverables (物料, 一整套), not in prompts and pictures.
3. Show the Agent's plan, steps, cost and checks in the conversation, not in passing toasts.
4. Lead with spacious clarity, then keep task controls close to hand.
5. Use premium restraint: tactile surfaces, quiet motion, and precise hierarchy.
6. Treat image history and assets as part of the creative workflow, not a separate database.
7. Keep all user-facing copy concise and Simplified Chinese in the app.
8. Preserve familiar product affordances even when the visual atmosphere is editorial.

## Accessibility & Inclusion

Target a practical WCAG AA baseline: visible focus states, sufficient text contrast, semantic controls, descriptive Simplified Chinese labels, and reduced-motion support for entrance animations.

## Theme

**Light theme: not yet enabled.** All design tokens in `frontend/src/styles/tokens.css` are defined only for dark mode (`color-scheme: dark`). There are no light-mode token overrides and no `prefers-color-scheme: light` media queries. A future light theme will need a parallel token set and a tested toggle mechanism. Until then, no light-theme UI should ship.
