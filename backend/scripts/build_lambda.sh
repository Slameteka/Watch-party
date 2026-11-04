#!/usr/bin/env bash
# =============================================================================
# build_lambda.sh
# 
# Builds production Lambda zip artifacts for Python 3.14 (arm64 / aarch64)
# using uv export and uv pip install according to architecture.md §12.6.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${BACKEND_DIR}/build"
DIST_DIR="${BACKEND_DIR}/dist"

echo "============================================================"
echo "🚀 Building Backend Lambda Artifacts (Python 3.14 arm64)"
echo "============================================================"
echo "Backend directory: ${BACKEND_DIR}"
echo "Output directory:  ${DIST_DIR}"

# 1. Clean previous build and dist directories
rm -rf "${BUILD_DIR}" "${DIST_DIR}"
mkdir -p "${BUILD_DIR}/package" "${DIST_DIR}"

# 2. Export locked production dependencies
echo "📦 Exporting locked dependencies from uv.lock..."
(cd "${BACKEND_DIR}" && uv export --no-dev --format requirements-txt -o "${BUILD_DIR}/requirements.txt")

# 3. Install production wheels for arm64 (aarch64) Linux
echo "📥 Installing wheels for aarch64-manylinux2014 (Python 3.14)..."
(cd "${BACKEND_DIR}" && uv pip install \
  --no-installer-metadata \
  --python-version 3.14 \
  --python-platform aarch64-manylinux2014 \
  --target "${BUILD_DIR}/package" \
  -r "${BUILD_DIR}/requirements.txt")

# 4. Copy backend source code into package
echo "📂 Bundling src/ into package..."
cp -r "${BACKEND_DIR}/src" "${BUILD_DIR}/package/"

# 5. Remove any unnecessary cache or metadata files
find "${BUILD_DIR}/package" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${BUILD_DIR}/package" -type f -name "*.pyc" -delete 2>/dev/null || true
find "${BUILD_DIR}/package" -type f -name "*.pyo" -delete 2>/dev/null || true
find "${BUILD_DIR}/package" -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true

# 6. Create zip artifacts using Python zipfile (zero dependency on system zip utility)
echo "🗜️  Creating deployment zip packages..."
python3 -c '
import sys, os, zipfile

zip_path = sys.argv[1]
source_dir = sys.argv[2]

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(source_dir):
        # Exclude hidden files / dirs
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            if file.startswith("."):
                continue
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, source_dir)
            zf.write(full_path, arcname)
' "${DIST_DIR}/backend.zip" "${BUILD_DIR}/package"

cp "${DIST_DIR}/backend.zip" "${DIST_DIR}/rest-api.zip"
cp "${DIST_DIR}/backend.zip" "${DIST_DIR}/realtime.zip"

# Clean up build staging directory
rm -rf "${BUILD_DIR}"

echo "============================================================"
echo "✅ Build Completed Successfully!"
echo "============================================================"
ls -lh "${DIST_DIR}"/*.zip
echo ""
echo "SHA256 checksums:"
sha256sum "${DIST_DIR}"/*.zip
echo "============================================================"
