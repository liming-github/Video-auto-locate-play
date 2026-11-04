#!/usr/bin/env bash
# 一键发布新版本：递增版本号 → 提交 → 推送 GitHub → 把文件推到 MacBook 桌面 → 打印 Greasyfork 上传页
# 用法：./scripts/release.sh 1.7.2 "修复 xxx"
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_VER="${1:?用法: ./scripts/release.sh <新版本号> [更新说明]}"
NOTE="${2:-}"
OLD_VER=$(grep -oE '@version +[0-9.]+' video-enhancer.user.js | head -1 | awk '{print $2}')

sed -i '' -E "s/@version +${OLD_VER}/@version      ${NEW_VER}/" video-enhancer.user.js
node --check video-enhancer.user.js

if [ -n "$NOTE" ]; then
  printf '\n## %s\n- %s\n' "$NEW_VER" "$NOTE" >> CHANGELOG.md
fi

# 生成可直接粘贴到 Greasyfork「更新说明」的版本备注
mkdir -p releases
{
  echo "v${NEW_VER} 更新说明"
  echo
  [ -n "$NOTE" ] && echo "- ${NOTE}"
  echo "- 详细变更见 CHANGELOG.md"
} > "releases/v${NEW_VER}.md"
echo "📝 版本说明已写入 releases/v${NEW_VER}.md（上传 Greasyfork 时粘贴到「更新说明」）"

git add -A
git commit -m "release: v${NEW_VER}${NOTE:+ - $NOTE}"
git push origin main

# 推到 MacBook 桌面，方便在 Greasyfork 上传
if ssh -o ConnectTimeout=8 macbook 'true' 2>/dev/null; then
  scp -q video-enhancer.user.js macbook:~/Desktop/video-enhancer.user.js
  echo "✅ 已放到 MacBook 桌面：~/Desktop/video-enhancer.user.js"
fi

echo
echo "✅ GitHub 已更新到 v${NEW_VER}"
echo "👉 最后一步：打开下面地址，选择桌面文件上传并发布"
echo "   https://greasyfork.org/zh-CN/scripts/603438/versions/new"
