#!/bin/bash
# PPT QA: 轉 PDF → 轉圖片 → 供視覺檢查
# Usage: bash ppt-qa.sh input.pptx output_dir
set -e

INPUT="$1"
OUTPUT_DIR="${2:-./qa-output}"
BASENAME=$(basename "$INPUT" .pptx)

# Check dependencies
command -v libreoffice >/dev/null 2>&1 || { echo "Error: libreoffice not installed"; exit 1; }
command -v pdftoppm >/dev/null 2>&1 || { echo "Error: pdftoppm not installed (install poppler-utils)"; exit 1; }

mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: PPTX → PDF ==="
libreoffice --headless --convert-to pdf --outdir "$OUTPUT_DIR" "$INPUT"

echo "=== Step 2: PDF → JPEG (each page) ==="
pdftoppm -jpeg -r 150 "$OUTPUT_DIR/$BASENAME.pdf" "$OUTPUT_DIR/$BASENAME"

echo "=== Done ==="
echo "QA images saved to: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR/"*.jpg 2>/dev/null || echo "No JPEG files generated"
