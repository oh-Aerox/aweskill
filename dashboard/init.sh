#!/bin/bash
# dashboard/init.sh
# Initialize the aweskill dashboard development environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Aweskill Dashboard Init ==="
echo "Project root: ${PROJECT_ROOT}"

# Step 1: Verify Node.js version
echo "Checking Node.js version..."
node -v || { echo "Node.js not found"; exit 1; }

# Step 2: Install dependencies if needed
if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
  echo "Installing dependencies..."
  cd "${PROJECT_ROOT}"
  npm install
fi

# Step 3: Ensure dashboard directory structure
echo "Ensuring dashboard structure..."
mkdir -p "${SCRIPT_DIR}"
for file in index.html style.css app.js; do
  if [ ! -f "${SCRIPT_DIR}/${file}" ]; then
    echo "  Missing: ${file} (will be created during implementation)"
  else
    echo "  OK: ${file}"
  fi
done

# Step 4: Verify aweskill store is initialized
echo "Checking aweskill store..."
if [ ! -d "${HOME}/.aweskill" ]; then
  echo "  Store not initialized. Run: aweskill store init"
else
  echo "  Store OK: ${HOME}/.aweskill"
fi

# Step 5: Quick build check
echo "Running type check..."
cd "${PROJECT_ROOT}"
npm run typecheck 2>/dev/null || echo "  (typecheck skipped - may have existing issues)"

echo ""
echo "=== Init Complete ==="
echo "Next steps:"
echo "  1. npm run dev -- serve --port 3456"
echo "  2. Open http://localhost:3456"
echo "  3. Or run: npm test -- tests/serve.test.ts"
