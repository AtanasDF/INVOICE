#!/bin/sh
# Opens the Supabase SQL editor in Atanas's browser with the SQL already in the box
# and on the clipboard, so all he does is press Run. Never describe where to paste.
# Usage: harness/open-sql.sh <file.sql> [browser app, default Safari]
set -e
[ -f "$1" ] || { echo "usage: $0 <file.sql> [browser]" >&2; exit 1; }
pbcopy < "$1"
q=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(open(sys.argv[1]).read()))' "$1")
open -a "${2:-Safari}" "https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new?content=$q"
echo "opened in ${2:-Safari}; also on the clipboard"
