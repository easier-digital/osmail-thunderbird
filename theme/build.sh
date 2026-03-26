#!/usr/bin/env bash
# Builds the OSMail theme XPI from the theme/ directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Validate manifest
if [[ ! -f manifest.json ]]; then
  echo "ERROR: manifest.json not found in theme/" >&2
  exit 1
fi
python3 -m json.tool manifest.json > /dev/null 2>&1 || {
  echo "ERROR: manifest.json is not valid JSON" >&2
  exit 1
}

# Create output directory
mkdir -p ../distribution/extensions

# Build XPI (contents at root of zip, not wrapped in a subdirectory)
zip -r -FS ../distribution/extensions/yourorg-theme.xpi manifest.json icons/

echo "SHA256: $(sha256sum ../distribution/extensions/yourorg-theme.xpi)"
echo "Theme XPI built successfully."
