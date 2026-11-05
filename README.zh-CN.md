# 掼蛋研习社 · Guandan Study

[English](README.md) · [下载安装包](https://github.com/RichardLoZC/guandan-study/releases)

原项目由严锋教授创建。本项目在其原有工作基础上，由 Richard Lo 继续维护跨平台客户端。感谢原作者；原始署名和各组件许可均予以保留。

公开版支持离线练习与同一 Wi-Fi 内 2–4 人联机，空位由 DanLM 补齐；不需要账号或外部模型服务。

## 1.8.41 赛后统计

起手改为“强于多少比例的同级参考起手”，局中仅本人可见。赛后按两队展示起手牌力、最多可组炸弹、高牌比例及保住牌权次数；个人展示普通丢权、遇炸丢权、夺回牌权、领牌轮次、接风、用炸和名次。综合表现分、公式和待评说明已从赛后页移除；历史意见仍随设置中的存档备份导出。相对牌力不是胜率，训练奖惩保持关闭。

## 1.8.41 更新

- 对齐官方 DanLM v1 的历史编码、完整候选与贡还评分，修复大小王和百搭记录、候选压缩和双上后的补排名次。使用原权重，没有训练新模型。
- Apple 芯片 Mac 发布包使用官方原生核心；Windows、Android、Intel Mac 使用已对齐的 ONNX。未配置原生运行时的开发环境使用 ONNX。
- 单层手牌与平铺／叠牌；移除自动理牌、双层布局及秘籍策略，保留手动拖牌和按大小排序。
- 进贡、还贡、抗贡、接风、名次、打 A 尝试与胜利反馈；历史人物 AI 头像、表情与音效。
- 起手结构分仅本人可见；其他玩家剩余牌数在 7 张及以下才显示。每副结束提供试行表现分、技术统计及本机反馈导出。评分尚未校准，不启用训练奖惩。

相同固定局面复验中，1144 次选牌及 312 个贡还场景全部与官方同选；这是有限样本一致性，不是全输入数学等价或牌力提升证明。详见 [对齐说明](docs/DANLM-ALIGNMENT.md)。

## 安装

从 [Releases](https://github.com/RichardLoZC/guandan-study/releases) 下载：Mac Universal ZIP、Windows x64 ZIP、Android APK。Mac 解压后拖入应用程序；Windows 解压完整目录后运行 EXE；Android 手机和平板共用 APK，需 Android 8+ 与 WebView 120+。保留已有安装身份和签名。

本页的 GitHub 安装包是离线／局域网公开版。正在使用独立线上版的用户应继续使用该版本的更新入口，勿用本 APK 切换版本：历史包名相同，手动覆盖会替换功能；重新切回还受系统构建号限制。

Mac 使用本地 ad-hoc 签名，未公证；Windows 沿用便携包分发，未使用 Authenticode。

## 模型与规则

DanLM 只使用行动者手牌及公开历史。模型分数不是胜率；教学解释由规则层生成，不是模型内部思考。掼军自定义赛程规则保留，包含打 A 连续三次第一＋第四名后该队退回 2；其他结果打断计数。经典四人模式与旧拖 3 存档保持兼容。

局域网房主需保持运行，Android 房主退到后台会暂停；各端请更新至 1.8.40 或兼容的新版本（协议 3）。局域网使用 HTTP/UDP，房间码不提供加密，不应将端口暴露到公网。

## 开发

```sh
npm ci
npm test
npm start
npm run build:win
npm run build:android -- --debug
```

需 Node.js 22.12+。Android 还需 JDK17、Gradle8.13、SDK36；维护者的发布构建使用原签名，调试构建使用独立 `.dev` 包。Mac 原生构建见 [native/README.md](native/README.md)。详见 [构建说明](docs/BUILDING.md)与[公开发布边界](docs/PUBLIC-DISTRIBUTION.md)。

**DanLM 组件仅限非商业用途。** 本仓库不代表 DanLM 官方，各组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。


Ming persona update: 50 imaginative historical portraits; 25 classic and 25 ExpertStyle-v1 AI identities. ExpertStyle is a play-only variant; tribute/return always uses the original DanLM v1 checkpoint. This is a style choice, not a demonstrated strength improvement. Local human advice keeps the classic model. The jade silk tabletop and portrait atlases were generated with OpenAI ImageGen; prompts and asset hashes are in web/card-sources/ming50-generation.json. Existing DanLM license and attribution apply to the derived score head. No training rewards are enabled.
