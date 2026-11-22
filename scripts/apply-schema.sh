#!/usr/bin/env bash
# Owner only: needs the caller's `az login`, SQL_SERVER and SQL_DATABASE in the
# shell, and the caller's IP on the SQL server firewall. Agents never run it.
#
# Usage: ./scripts/apply-schema.sh [--dry-run | --check | --verify]
set -euo pipefail
cd "$(dirname "$0")/../backend"
exec poetry run python -m tools.apply_schema "$@"
