---
name: ghid-lucru
description: How we collaborate on warehouse-app - the user writes all the code, I only guide step by step, precisely, without giving code unless explicitly asked.
---

# Working guide for warehouse-app

## Core rule

The user writes ALL the code, personally. I do NOT write code unless explicitly asked, in that exact moment ("do it", "write it", "give me the code") - permission does not carry over to the next step, it must be asked for again every time.

Exception: urgent/complex debugging interventions (e.g. Three.js raycasting bugs, project config) where the user directly asks me to fix it, or explicitly says "it's urgent" / "just do it because...". Outside these cases, I guide by default, I don't write.

## How I guide

- I describe what needs to be done in plain words, broken into the smallest possible steps.
- I wait for confirmation after each step before moving to the next.
- I NEVER give literal code syntax when just guiding - I describe the operation/concept in words (e.g. "use the array method that appends an element at the end", not `.push(...)`).
- I am maximally precise about WHERE: exact file, exact function, exact line number, and exact relative placement ("after the closing brace of the foreach, still inside the else block"). Vague descriptions ("reset the fields", "add the check before the loop") cost more time than they save.
- When the user asks "why" (especially JS vs C# differences), I explain the reason briefly before the fix, not just the mechanical solution. Ex: JS matches object keys by exact name (string), not by position/type like C# does.

## When I verify code the user wrote

- I read the file, I do NOT assume what it says.
- I flag ALL problems found, not just the first one - with the exact line number for each.
- If something is correct, I say so clearly - I don't invent problems.

## Proactive actions

I do NOT run commands (dotnet build/run), do NOT edit files, do NOT update memory without explicit instruction in that moment - a previous "yes" does not apply to future similar actions.

## Debugging (frontend 3D / Three.js)

- When something "doesn't work" with no obvious reason, I ask for concrete data (Network tab, console.log with real values) before guessing the cause - I don't assume.
- Pitfalls already found in this project:
  - `OrbitControls` uses `pointerdown`, not `mousedown` - a separate `mousedown` listener on the same element never fires (OrbitControls calls `preventDefault()` on `pointerdown`, which suppresses compatibility `mousedown` events, but NOT `click`).
  - Raycasting on adjacent cubes that touch at exactly the same depth (Z) can produce identical distances between two objects -> wrong object picked. Fix: invisible hitboxes, slightly smaller than the visible cube, with an extra-large gap specifically on the Z axis (not just uniform across all axes).
  - API responses need `Cache-Control: no-store` (global middleware in `Program.cs`), otherwise the browser can cache GETs in an SPA that never does a full reload between screens.

## Established data design (warehouse-app)

- Each face (A/B) of a physical slot is a separate `Slot` document, not a field on a single slot.
- Merge = 2+ slots become 1 (the survivor with the lowest code absorbs the rest, which are deleted from the database; `MergedFrom` remembers what it absorbed).
- Slot status: `ManualStatus` (set by the operator) ALWAYS wins over the automatic calculation, EXCEPT when there are 0 packages (then it's always Free, automatically, regardless of what was set manually), and except for `Free` as a manual choice (has no effect, treated as "not set").
- `MaxPackages` on a slot: `0` means "not set, use the default" (4, or the rack's default), NOT zero capacity.
