#!/usr/bin/env bash
#
# Mobile TOC - Project checks
# Render the website and book projects under tests/ and run their browser checks.
#
# @license MIT
# @copyright 2026 Mickaël Canouil
# @author Mickaël Canouil

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# project directory | rendered page | check script and fixture name, relative to tests/
CHECKS=(
	"website|index.html|_checks/website-check.mjs website"
	"website|index.html|_checks/axe-check.mjs website"
	"website|overflow.html|_checks/overflow-check.mjs website-overflow"
	"book|second.html|_checks/structure-check.mjs page"
	"book|second.html|_checks/focus-check.mjs focus"
	"book|second.html|_checks/layout-check.mjs page"
	"book|second.html|_checks/layout-check.mjs forced-colours"
	"book|second.html|_checks/axe-check.mjs book"
)

status=0
rendered=" "
for entry in "${CHECKS[@]}"; do
	project="${entry%%|*}"
	rest="${entry#*|}"
	page="${rest%%|*}"
	check="${rest#*|}"
	script="${check%% *}"
	fixture="${check#* }"

	if [[ ! -d "${project}" ]]; then
		echo "skip: tests/${project}/ does not exist yet" >&2
		continue
	fi

	if [[ "${rendered}" != *" ${project} "* ]]; then
		if [[ -d "../_extensions" ]]; then
			rm -rf "${project}/_extensions"
			mkdir -p "${project}/_extensions"
			cp -R ../_extensions/. "${project}/_extensions/"
		fi
		quarto render "${project}"
		rendered+="${project} "
	fi

	node "${script}" "${project}/$([[ ${project} == book ]] && echo _book || echo _site)/${page}" "${fixture}" || status=1
done

exit "${status}"
