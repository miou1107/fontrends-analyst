# Presentation Engine Implementation Plan

> **For agentic workers:** Use subagent-driven-development

**Goal:** Build engine.js + 3 renderers + 4 schemas + default theme. Refactor 992-line generate-lv-gslides.js into reusable architecture.

**Spec:** production-center/spec.md

---

## Task 1: helpers.js — Shared utilities
- Color conversion (hex→RGB float, hex→hex-no-#)
- EMU/inches/pt helpers
- ID generator
- OAuth helper (reuse from existing script)
- ~100 lines

## Task 2: theme-default.json + brand-colors.json check
- Typography: Noto Sans TC, sizes for title/subtitle/body/table/note
- Table styles: headerBg from brand, row_alt_fill, border
- Spacing: page_margin 0.5, element_gap 0.3
- Shapes: corner_radius 0, shadow config

## Task 3: Schema presets (4 JSON files)
- full-13.json: all 13 pages with pageId, title, background, element types
- compact-8.json: cover, summary, KPI, trend, platform, sentiment, actions, closing
- executive-5.json: cover, summary, KPI, actions, closing
- mini-3.json: cover, summary+KPI combined, actions+closing combined

## Task 4: engine.js — Main engine
- CLI arg parsing (--run, --format, --schema)
- Read script.json / brand.json / theme.json from run folder
- If no script.json → fallback: read data.json + schema preset → auto-generate pages
- Assemble intermediate format (pages array)
- Load and call renderer
- Error handling + output-meta.json
- ~200 lines

## Task 5: gslides.js — Google Slides renderer
- Refactor from existing 992-line script
- Extract: createTextBox, addRect, addTable, addHeader, addStyledText, addKPICard, addBarChart
- OAuth from helpers.js
- Speaker notes support
- batchUpdate with auto-splitting (500 per batch)
- ~400 lines

## Task 6: pptx.js — pptxgenjs renderer
- Same intermediate format → pptxgenjs API calls
- Shadow factory (avoid mutation bug)
- breakLine arrays
- Hex without # for colors
- slide.addNotes() for speaker notes
- Output to ~/Desktop/{brand}_Report.pptx
- ~300 lines

## Task 7: gdocs.js — Google Docs renderer (basic)
- Create document with title
- Insert chapters as Heading1/Heading2
- Tables for data
- No shapes (Docs doesn't support)
- Speaker notes → footnotes
- ~150 lines

## Task 8: Smoke test with LV data
- Create test run folder with LV data.json + brand.json
- Run: node engine.js --run {path} --format gslides --schema full-13
- Run: node engine.js --run {path} --format pptx --schema full-13
- Run: node engine.js --run {path} --format gdocs --schema compact-8
- Verify all three outputs
