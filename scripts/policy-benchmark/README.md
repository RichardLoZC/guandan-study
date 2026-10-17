# DanLM 实际模型对照测试

运行程序内置的 ONNX/WASM 模型和同一套规则，不用随机出牌代替模型，不接触正在玩的应用、存档或浏览器牌局。每轮测试开始时冻结运行文件，记录 SHA-256、源码提交、版本、种子、级牌、先手、全部行动和最终名次。隐藏手牌在每次推理前检查遮蔽。

使用 Node.js 22.12+ 和项目指定版本的 Electron。`--electron` 必须指向已有、可信的 Electron 可执行文件；输出目录必须没有旧测试结果。两条命令各自执行完成后再运行对应分析器。

```sh
node scripts/policy-benchmark/run.mjs --pairs=128 --levels=2,5,9,A --mode=book-vs-raw --seed=danlm-vs-book-1.8.22-20261015-main --lanes=2 --output=/absolute/path/team-results --electron=/absolute/path/Electron
node scripts/policy-benchmark/analyze.mjs /absolute/path/team-results

node scripts/policy-benchmark/run.mjs --pairs=256 --levels=2,5,9,A --mode=teammate --seed=danlm-partner-only-1.8.22-20261015-heldout --lanes=2 --output=/absolute/path/partner-results --electron=/absolute/path/Electron
node scripts/policy-benchmark/analyze-partner.mjs /absolute/path/partner-results

# 两次 teammate 测试须使用相同种子、级牌、先手和配对数，并分别通过重放分析。
node scripts/policy-benchmark/compare-partners.mjs /absolute/path/previous-partner-results /absolute/path/new-partner-results
```

- `book-vs-raw`：一队两个秘籍 AI 对另一队两个原版 AI。同副牌交换双方策略再打一局，以一副牌的两局为配对单位。主指标是秘籍队胜率。
- `teammate`：座位 0、1、3 始终原版；同副牌只切换座位 2 的秘籍开关。主指标是我方胜率的配对差值，不是把两组胜率当成独立试验。
- `raw-control`：四个座位全部原版，同副牌重复。用于核验重复运行的行动哈希，不能用该结果估计秘籍收益。

每副牌重新发牌，使用 108 张实体牌。按级牌与先手均衡分配；没有跨副贡还、连续升级或真人参与。固定样本量，不因暂时领先或落后提前终止。运行失败必须查明原因，不能删除失败牌局后继续报胜率。两个正式分析器都会逐手重放合法行动、核对终局与行动哈希。

95% 区间使用 20,000 次 bootstrap，随机种子 20261015；每次在各级牌内重采样整组配对。两个相同发牌的游戏不能当作两份完全独立的样本。这个区间只表达约定测试分布上的抽样不确定性，不覆盖模型错误、规则偏差或真人风格差异。

开发组件对照可用 `--book-policy=/absolute/path/policy-variant.js` 指定可信的本地秘籍实现。它只替换该次实验冻结的文件，不改变正在运行的应用。输出保存实际策略和 worker 的源码快照及哈希；策略比较会检查两轮原版对照的行动哈希完全一致。观察过的数据属于开发样本；确定策略后，须用事先固定的新种子、新牌局数验证，不能根据验收结果反复改参数再宣称独立验证。

2026-10-15 的第一轮旧日志含一个按名称匹配的 `originalRow` 字段；不同花色的同花顺可能重名，该字段有歧义。分析器完全不使用它，新日志也已删除该字段。最终行动、改选标记、合法性和胜负统计不受影响。
