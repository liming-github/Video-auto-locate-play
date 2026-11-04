# 真实浏览器自测（Chrome Headless + CDP）

在 MacBook 上跑真 Chrome，通过 CDP 派发**真实鼠标事件**验证脚本行为（比 jsdom 更接近真实）。

## 一次性准备（NAS 上执行）

```sh
# 1) MacBook 上起测试站点 + Chrome
ssh macbook 'cd /tmp/cdpharness && nohup python3 -m http.server 8898 --bind 127.0.0.1 >/tmp/h.log 2>&1 &
  nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-test-profile --no-first-run \
    --disable-gpu --autoplay-policy=no-user-gesture-required about:blank >/tmp/chrome-cdp.log 2>&1 &'

# 2) NAS 上开隧道
nohup ssh -N -L 9222:127.0.0.1:9222 macbook >/tmp/tunnel.log 2>&1 &
```

## 跑测试

```sh
node tests/browser/cdp-test.mjs
```

## 场景

- `siteA.html`：单视频 + 站点反复自动恢复播放（模拟 hsck123）
- `siteB.html`：三视频 + 站点"播放一个就暂停其它"（模拟 91porna）

覆盖：点击暂停保持、点击恢复、悬停切换、其它视频不受影响。
