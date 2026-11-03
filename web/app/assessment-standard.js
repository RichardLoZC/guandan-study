'use strict';
(function(root){
const standard={
  "standard_id": "guandan-performance-rating",
  "version": "0.1.0",
  "document_version": "1.2",
  "date": "2026-10-29",
  "status": "draft-for-expert-calibration",
  "scope": "只完善标准；未实现评审系统、游戏集成或安装包",
  "primary_goal": "固定 AI 队伍在冻结规则下完整冲 A 获胜；过程统计解释发挥",
  "units": [
    "决策",
    "闭合争夺轮",
    "团队控制片段",
    "小局",
    "完整比赛"
  ],
  "visibility": {
    "decision": "当时本人手牌及合法公开信息",
    "retrospective": "赛后全牌另列，不用于谴责当时未知信息下的选择"
  },
  "states": [
    "observed",
    "candidate",
    "estimated",
    "confirmed",
    "uncertain",
    "invalid"
  ],
  "null_policy": "缺失、无机会、窗口未闭合和无可信评审均不能记零分，必须带不同 reason_code",
  "metrics": [
    {
      "id": "P01",
      "name": "夺回自由领牌权",
      "opportunity": "对手为桌面领先方时，本人合法跟压",
      "numerator_or_value": "该轮结束后本队取得自由领牌的跟压次数",
      "denominator": "已闭合的此类跟压次数",
      "exclusions": "同一轮可能有多次跟压，逐次事件率与按轮成功率分开",
      "scoring_use": "统计，不自动加分"
    },
    {
      "id": "P02",
      "name": "团队控制转交",
      "opportunity": "本队曾取得自由领牌，随后重新确定归属",
      "numerator_or_value": "转交队友 / 转交对手分别计数",
      "denominator": "已闭合的本队控制片段数",
      "exclusions": "对家接风按规则记录；本人不再领牌不等于团队失权",
      "scoring_use": "统计，不自动扣分"
    },
    {
      "id": "P03",
      "name": "无收益失权",
      "opportunity": "实际路线交出主动权，且存在合法替代路线",
      "numerator_or_value": "可靠评审确认存在更好替代且实际路线无足够补偿的次数",
      "denominator": "完成同口径评审的失权机会数",
      "exclusions": "没有可行更好替代，或有价值的换权，不记错误",
      "scoring_use": "估计标签；独立确认后影响组织评分"
    },
    {
      "id": "P04",
      "name": "错失接管",
      "opportunity": "可合法接管，实际过牌或选择未建立后续的路线",
      "numerator_or_value": "评审确认接管能改善团队收益的未接管次数",
      "denominator": "已评审的可接管机会数",
      "exclusions": "有牌能压，不等于应该压；不存在好替代不扣分",
      "scoring_use": "估计标签；确认后影响跟牌评分"
    },
    {
      "id": "P05",
      "name": "抢权后续兑现",
      "opportunity": "本人抢得自由领牌",
      "numerator_or_value": "后续片段走牌数、再次抢权代价、队友收益分别记录",
      "denominator": "已闭合的本人抢权片段数",
      "exclusions": "后续被压不是当然失误；不能只追求出牌张数",
      "scoring_use": "事实＋评审，两者分开"
    },
    {
      "id": "F01",
      "name": "同花顺出手分布",
      "opportunity": "本人实际打出同花顺",
      "numerator_or_value": "领出 / 压普通牌 / 压炸弹 / 压队友分别计数",
      "denominator": "全部同花顺出手次数",
      "exclusions": "种类允许交叉标签；按分类分别报告，不能相加当总次数",
      "scoring_use": "事实统计"
    },
    {
      "id": "F02",
      "name": "可替代同花顺使用",
      "opportunity": "持有合法同花顺，并且存在其他合法选择",
      "numerator_or_value": "实际选择同花顺的次数",
      "denominator": "合法同花顺与替代选择同时存在的机会数",
      "exclusions": "过牌只在规则允许时进入替代；候选枚举不完整须注明",
      "scoring_use": "偏好统计，不是浪费率"
    },
    {
      "id": "F03",
      "name": "强控制牌过早消耗",
      "opportunity": "强控制牌实际出手，拥有合法替代",
      "numerator_or_value": "确认保留或其他出法更有利的次数与损失估计",
      "denominator": "已评审的此类出手机会数",
      "exclusions": "立即打出可直接走完或构成有效进攻时不得机械惩罚",
      "scoring_use": "估计标签；须与 F04 联合看"
    },
    {
      "id": "F04",
      "name": "该拦未拦",
      "opportunity": "有合法控制动作，选择未拦截",
      "numerator_or_value": "确认拦截更有利的次数与损失估计",
      "denominator": "已评审的可拦截机会数",
      "exclusions": "不能只依据对手后来赢牌判断；遵守当时信息限制",
      "scoring_use": "估计标签；防止只学会留炸"
    },
    {
      "id": "T01",
      "name": "有效供牌与接应",
      "opportunity": "本人的领牌或跟牌形成队友可响应局面",
      "numerator_or_value": "队友实际接续及其后续结果；有效贡献另估计",
      "denominator": "已闭合的供牌候选事件数",
      "exclusions": "赛后看见队友底牌的事实解释，与当时可知的决策质量分开",
      "scoring_use": "事实与贡献双栏"
    },
    {
      "id": "T02",
      "name": "关键助攻",
      "opportunity": "送牌、让权、拦截或接风后的组织候选",
      "numerator_or_value": "相对固定合法替代的队友头游、双上和整场收益变化",
      "denominator": "已独立确认的候选数；另报全部候选与评审覆盖率",
      "exclusions": "队友第一但整场收益下降，不能认定为有效团队助攻",
      "scoring_use": "估计贡献，不奖励次数"
    },
    {
      "id": "T03",
      "name": "个人目标与团队目标取舍",
      "opportunity": "实际与替代在个人名次、团队收益上方向不同",
      "numerator_or_value": "个人头游机会下降但团队收益可靠提高的次数",
      "denominator": "完成评审的此类取舍机会数",
      "exclusions": "自己第一对家第二与对家第一自己第二对称",
      "scoring_use": "估计标签"
    },
    {
      "id": "H01",
      "name": "起手资源画像",
      "opportunity": "进还贡结束、正式出牌开始的本人手牌",
      "numerator_or_value": "各牌型组合、冲突、散牌、控制资源、结构出牌下界",
      "denominator": "每个小局一个固定起点；贡还前另存独立版本",
      "exclusions": "结构丰富不等于实战强，组合重叠不得重复计值",
      "scoring_use": "描述指标，不直接等于牌力总分"
    },
    {
      "id": "H02",
      "name": "起手校正发挥",
      "opportunity": "存在通过校准的冻结参考策略",
      "numerator_or_value": "实际结果减相同合法起点的参考期望；各结果分项记录",
      "denominator": "完整小局或完整比赛，按相应目标统计",
      "exclusions": "单局含运气；参考不可用时返回 null，不能补造期望",
      "scoring_use": "条件校正结果；与过程评分分开"
    },
    {
      "id": "H03",
      "name": "优势牌型利用",
      "opportunity": "存在多种结构不同的合法路线",
      "numerator_or_value": "保留/使用优势组合的路线收益与机会损失",
      "denominator": "已评审的对应结构选择机会",
      "exclusions": "优势需结合已知历史与续打路线，不按某牌型数量最多认定",
      "scoring_use": "估计标签"
    },
    {
      "id": "I01",
      "name": "队友信息理解",
      "opportunity": "决策前产生并保存了队友能力/行为概率预测",
      "numerator_or_value": "概率误差、校准与加入此信息后的独立收益",
      "denominator": "事先保存预测且能验证目标的样本数",
      "exclusions": "没有事前预测就不能赛后声称读懂；不把私有状态共享算牌语",
      "scoring_use": "预测指标，不给传信次数奖励"
    },
    {
      "id": "R01",
      "name": "阶段与风险选择",
      "opportunity": "等级、冲 A、进贡或残局改变策略价值",
      "numerator_or_value": "实际与替代的双上及整场收益差",
      "denominator": "已评审的对应阶段机会数",
      "exclusions": "已能过 A 时盲争双上，和落后时合理争取，分别判断",
      "scoring_use": "估计标签"
    },
    {
      "id": "Q01",
      "name": "记录与评审可信度",
      "opportunity": "所有应记录的决策和结束事件",
      "numerator_or_value": "完整、可回放、合法、未知、冲突、评审覆盖分别计数",
      "denominator": "全部预定记录/评审对象",
      "exclusions": "非法行为归因于模型、接口或程序；不把采集故障当技术失误",
      "scoring_use": "质量门槛，禁止被高战术分抵消"
    }
  ],
  "scoring": {
    "process_scale": "expert-rubric-1-to-5",
    "anchors": {
      "1": "明确且严重的可避免团队损失",
      "2": "有明显更好的合法路线，存在中等损失",
      "3": "当时信息下合理，或与可行替代实质相当",
      "4": "有效利用资源/创造队友机会，有证据优于常见可行替代",
      "5": "关键局面中高质量组织或助攻，优势有独立证据"
    },
    "uncertain": "不适用 3 分；返回 null 与证据说明",
    "display_percentile": "仅有校准参考分布后可转换为 0–100 百分位；不代表正确率",
    "composite_enabled": false,
    "candidate_weights": {
      "组织与跟牌": 0.25,
      "控制资源管理": 0.2,
      "团队贡献": 0.3,
      "手牌结构利用": 0.15,
      "阶段与风险": 0.1
    },
    "weights_status": "待高手校准；未启用；缺失维度不得静默重分权重",
    "deduplication": "一条因果组织片段主归因一次；其他维度可交叉解释，禁止重复累计同一损失"
  },
  "review_protocol": {
    "pilot_rounds": 20,
    "calibration_positions": 120,
    "heldout_positions": 60,
    "reviewers_per_position": 3,
    "status": "建议初始规模，须招募与实际执行，尚无高手评分",
    "blind_to": [
      "模型身份",
      "系统评分与疑点标签",
      "未来行动",
      "最终输赢"
    ],
    "required_inputs": [
      "当时本人手牌",
      "合法公开历史",
      "当前等级与座位",
      "剩余张数",
      "实际动作与合法替代"
    ],
    "future_reveal": "提交独立决策评价后才可看赛后复盘；另存第二份反馈，不覆盖第一份"
  },
  "required_record_fields": [
    "standard_version",
    "rules_hash",
    "model_hash",
    "judge_hash",
    "match_id",
    "round_id",
    "event_id",
    "control_segment_id",
    "seat",
    "visibility_mode",
    "opportunity_type",
    "numerator",
    "denominator",
    "missing_reason",
    "initial_reference_version",
    "candidate_actions",
    "estimate_interval",
    "reviewer_id",
    "first_rating",
    "revision_history",
    "evidence_links"
  ]
};
if(typeof module==='object'&&module.exports)module.exports=standard;else root.GuandanAssessmentStandard=standard;
})(globalThis);
