---
name: verify-visual-change
version: 1.0.0
description: Confirm which component actually renders, then verify a CSS/layout change with a scripted headless-browser check before claiming it done.
pattern: procedure
when_to_use: After a CSS, layout, spacing, or visual change; before saying a visual fix is done; when a padding/offset fix might be a guess; when unsure which component renders for a route.
when_not_to_use: Non-visual logic changes, backend-only work, or when no browser/dev server is available.
next_skills: []
sub_agents: []
---

# Verify a visual change before claiming it done

Do not guess from source alone and ship. Confirm the component renders, change it, then measure the result in a real browser.

## 1. Confirm the component actually renders

Before editing any UI component:

1. Open the route's entry file (e.g. `page.tsx` / `layout.tsx` for that route).
2. Grep its imports and JSX for the component name you are about to edit.
3. Confirm it is imported AND rendered — not commented out, not behind a disabled flag, not superseded by another component with a similar name.
4. If it does not render, stop and find the component that actually renders for that route. Edit that one instead.

Never edit a component you have not confirmed renders. A commented-out or dead component will pass no visual check.

## 2. Make the change

1. Identify the actual cause before editing — inspect the rendered element, do not assume it is padding/margin/etc.
2. If the same visual property (radius, hairline rule, surface color, spacing token) repeats across multiple components, define the shared value once and apply it in a single pass across all affected files, rather than editing each file by trial and error.

## 3. Verify with a scripted render check

Write ONE reusable headless-browser check instead of a fresh ad-hoc script each iteration.

1. Start (or reuse) the dev server and note its URL.
2. Use a headless browser (e.g. Playwright) to load the affected route.
3. Measure the elements that the change was supposed to affect — read layout via `getBoundingClientRect`, computed styles, or offsets, and capture a screenshot of the affected section.
4. Run measurement/DOM code inside the browser page context (`page.evaluate`), NOT in the Node context. `window`, `document`, and `getBoundingClientRect` only exist in the browser — referencing them in Node throws `ReferenceError: window is not defined`.
5. Scroll to the target section before screenshotting so scroll-position does not clip or shift what you capture.

## 4. Compare against the expected result

1. Compare the measured values / screenshot to the intended layout.
2. If it does not match, adjust and re-run the SAME check — do not guess a second change blind.
3. Only claim the fix is done once the scripted check confirms the rendered result matches the intent.
