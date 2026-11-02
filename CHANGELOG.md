# 更新日志

## 1.6.0
- 整理元数据（@homepageURL / @supportURL / @updateURL / @downloadURL），支持通过 Greasyfork 或 GitHub raw 自动更新
- 统一脚本命名为「视频增强 · Video Enhancer」，避免与早期版本重复安装

## 1.5
- 修复：退出全屏后页面跳回顶部的问题（记录滚动位置 + 多阶段还原 + 视频重新居中）

## 1.4
- 新增：回车 / F 全屏切换，ESC 退出全屏

## 1.3
- 新增：自动滚动定位到视频、V 键定位、F 键全屏

## 1.2
- 新增：自动播放、P 画中画、M 静音、Shift+Alt+A 站点自动播放开关
- 音量支持纯文字进度条提示

## 1.1
- 新增：↑/↓ 音量调节、空格播放暂停、顶部提示条

## 1.0
- 首个版本：←/→ 快退快进，解决必须 Tab 到进度条才能快进的问题

## 1.7.1
- 移除脚本内 @updateURL / @downloadURL，改为跟随安装来源更新（Greasyfork 安装走 Greasyfork，GitHub raw 安装走 GitHub）
- 回车接管修复：页面存在播放器时，即使焦点在链接/按钮上也进全屏，不再触发页面刷新
