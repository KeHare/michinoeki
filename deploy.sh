#!/bin/bash
# 廻（めぐり）を Cloudflare Pages（michinoeki-meguri.pages.dev）へ出す
# dist/ を毎回まるごと組み直す（直接アップロードは「上げたフォルダ＝サイト全体」。data/ の生データは含めない）
# functions/（旅帳API）と wrangler.toml（D1の紐づけ）はこのフォルダから読まれる
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp index.html manifest.webmanifest service-worker.js dist/
cp -R assets dist/
find dist -name .DS_Store -delete
echo "dist: $(find dist -type f | wc -l | tr -d ' ') files"
npx wrangler pages deploy --branch=main --commit-dirty=true
rm -rf .wrangler
