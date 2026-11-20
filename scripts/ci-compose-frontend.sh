#!/usr/bin/env bash
set -euo pipefail

mode="$(jq -er '.mode' packages/shared/src/config/product-admin.json)"
case "$mode" in
  host)
    printf '%s\n' 'FRONTEND_URL=https://product.example.test' \
      'PRODUCT_ADMIN_ORIGIN=https://staff.example.test' >> "$GITHUB_ENV"
    ;;
  path)
    if [[ -n "${1:-}" ]]; then printf 'FRONTEND_URL=%s\n' "$1" >> "$GITHUB_ENV"; fi
    ;;
  *) exit 1 ;;
esac
