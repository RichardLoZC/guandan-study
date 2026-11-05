#!/usr/bin/env python3
"""Local, private-pipe adapter for the upstream macOS DanLM core."""
import dataclasses
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import traceback

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "upstream"))
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")

import numpy as np
import torch
from danzero.engine.actions import get_legal_actions, make_pass_play
from danzero.engine.tribute import TributeRecord
from danzero.encoding.tokenizer import tokenize_state
from danzero.model.transformer import TransformerConfig, TransformerQNetwork
from danzero.eval.agents import TransformerAgent

torch.set_num_threads(2)
torch.set_num_interop_threads(1)
torch.use_deterministic_algorithms(True)
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["hearts", "spades", "clubs", "diamonds"]
TYPES = {"single": 1, "pair": 2, "triple": 3, "full-house": 4,
         "pair-run": 5, "triple-run": 6, "straight": 7, "bomb": 8,
         "straight-flush": 9, "joker-bomb": 10}


def card_index(card):
    card_id = card if isinstance(card, str) else card.get("id")
    if not isinstance(card_id, str):
        raise ValueError("牌编号无效")
    fields = card_id.split("-")
    if len(fields) != 3 or fields[0] not in ("1", "2"):
        raise ValueError("牌编号无效")
    _, suit, rank = fields
    if suit == "joker" and rank in ("SJ", "BJ"):
        return 52 if rank == "SJ" else 53
    if suit not in SUITS or rank not in RANKS:
        raise ValueError("牌面无效")
    return SUITS.index(suit) * 13 + RANKS.index(rank)


def hand_vector(cards, limit=27):
    if len(cards) > limit:
        raise ValueError("手牌数量无效")
    ids = [c if isinstance(c, str) else c.get("id") for c in cards]
    if len(set(ids)) != len(ids):
        raise ValueError("手牌实体重复")
    result = np.zeros(54, dtype=np.int8)
    for card in cards:
        index = card_index(card)
        result[index] += 1
        if result[index] > 2:
            raise ValueError("手牌数量无效")
    return result


def play_vector(play, level):
    if play is None:
        return make_pass_play()
    if not isinstance(play, dict) or play.get("type") not in TYPES:
        raise ValueError("出牌类型无效")
    cards = play.get("cards")
    if not isinstance(cards, list) or not cards:
        raise ValueError("出牌缺少牌面")
    vector = np.zeros(80, dtype=np.int8)
    vector[:54] = hand_vector(cards)
    vector[54 + TYPES[play["type"]]] = 1
    if play["type"] != "joker-bomb":
        sequence = play.get("sequence") or []
        value = play.get("primaryValue")
        if sequence:
            rank = (sequence[-1] - 2 + 13) % 13
        elif value == 14.5:
            rank = RANKS.index(level)
        elif isinstance(value, (int, float)) and math.isfinite(value):
            rank = value - 2
        else:
            raise ValueError("出牌点数无效")
        if not isinstance(rank, (int, float)) or int(rank) != rank or not 0 <= rank < 15:
            raise ValueError("出牌点数无效")
        vector[65 + int(rank)] = 1
    return vector


def prepared(observation):
    if not isinstance(observation, dict):
        raise ValueError("缺少局面")
    seat, level = observation.get("seat"), observation.get("level")
    if type(seat) is not int or seat not in range(4) or level not in RANKS:
        raise ValueError("座位或级牌无效")
    state = observation.get("state") or {}
    players, events = state.get("players"), state.get("actionHistory")
    if not isinstance(players, list) or len(players) != 4 or not isinstance(events, list) or len(events) > 400:
        raise ValueError("局面记录无效")
    for index, player in enumerate(players):
        if player.get("seat") != index or not isinstance(player.get("hand"), list):
            raise ValueError("座位记录无效")
        if index != seat and any(card is not None for card in player["hand"]):
            raise ValueError("拒绝接收其他玩家的隐藏手牌")
    hand = hand_vector(players[seat]["hand"])
    records = []
    for item in observation.get("tributeRecords") or []:
        giver, receiver = item.get("from"), item.get("to")
        if type(giver) is not int or giver not in range(4) or (receiver is not None and (type(receiver) is not int or receiver not in range(4))):
            raise ValueError("贡还记录无效")
        card = card_index(item.get("cardId"))
        # The upstream tokenizer represents an anti-tribute joker as -1.
        if giver == receiver and item.get("kind") == "give" and card == 53:
            card = -1
        records.append(TributeRecord(giver, -1 if receiver is None else receiver, card))
    history, finished, lead_owner = [], set(), None
    for event in events:
        actor, play, remaining = event.get("seat"), event.get("play"), event.get("handCountAfter")
        if type(actor) is not int or actor not in range(4) or type(remaining) is not int or not 0 <= remaining <= 27:
            raise ValueError("出牌历史无效")
        history.append((actor, play_vector(play, level)))
        if play is not None:
            lead_owner = actor
            if remaining == 0:
                finished.add(actor)
                history.append((actor, None))
            if event.get("hardWindTo") is not None and event.get("tablePlayAfter") is None:
                target = event["hardWindTo"]
                if type(target) is not int or target not in range(4):
                    raise ValueError("硬接风记录无效")
                history.append("wind")
                lead_owner = None
        elif event.get("tablePlayAfter") is None:
            if lead_owner is None:
                raise ValueError("牌权历史无效")
            history.append("wind" if lead_owner in finished else "subround")
            lead_owner = None
    tokens = tokenize_state(RANKS.index(level) + 2, records, history, seat)
    if not tokens or len(tokens) > 1280:
        raise ValueError("公开牌局记录超出官方模型支持的长度")
    table = state.get("tablePlay")
    lead = None if table is None else play_vector(table.get("play"), level)
    if bool(lead_owner is not None) != bool(table is not None):
        raise ValueError("桌面牌与公开历史不一致")
    return seat, RANKS.index(level) + 2, hand, tokens, lead


MODEL_IDENTITIES={
    'danlm-v1':('upstream/ckpts/DanLM_v1/dansformer_v1_best_eval.pt','5341d7316bac1ead4098c796ea03f7e38fb47f001cc647a52be3ed0d15cd7244'),
    'expert-style-v1':('upstream/ckpts/DanLM_ExpertStyle_v1/play.pt','4738435b59911b10327225d7ef48a5ec5ed9e4f8088215ad168375f6b59e11eb')
}
def load_model(relative,expected):
    path=BASE/relative
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('模型文件身份不一致')
    checkpoint=torch.load(path,map_location='cpu',weights_only=True)
    config=checkpoint.get('model_config') or checkpoint.get('config',{})
    fields={field.name for field in dataclasses.fields(TransformerConfig)}
    result=TransformerQNetwork(TransformerConfig(**{key:value for key,value in config.items() if key in fields}))
    result.load_state_dict(checkpoint.get('model_state_dict') or checkpoint['model'],strict=True)
    result.eval();return result
models={key:load_model(*identity) for key,identity in MODEL_IDENTITIES.items()}
model=models['danlm-v1']


def run(payload):
    policy_id=payload.get('policyId','danlm-v1')
    if policy_id not in models:raise ValueError('未知 AI 模型')
    if payload.get("health") is True:
        return {"ready": True, "engine": "official-danlm-macos", "commit": "d200e455f63fd46aa398e97b69a6bb94cf1ba098", "policyIds": list(models)}
    if "tribute" in payload:
        data = payload["tribute"]
        seat, level, phase = data.get("seat"), data.get("level"), data.get("phase")
        if type(seat) is not int or seat not in range(4) or level not in RANKS or phase not in ("give", "return"):
            raise ValueError("贡还局面无效")
        hand, choices = data.get("hand"), data.get("choices")
        if not isinstance(hand, list) or not isinstance(choices, list) or not choices:
            raise ValueError("贡还手牌或候选无效")
        vector = hand_vector(hand, 28)
        held = {c.get("id") for c in hand}
        if any(not isinstance(c, dict) or c.get("id") not in held for c in choices):
            raise ValueError("贡还候选不在行动者手中")
        legal = sorted(set(card_index(c) for c in choices))
        agent = TransformerAgent(model, device="cpu", max_seq_len=1280)
        agent.reset(seat, RANKS.index(level) + 2)
        with torch.inference_mode():
            if phase == "give":
                receiver = data.get("receiver")
                if receiver is not None and (type(receiver) is not int or receiver not in range(4)):
                    raise ValueError("进贡目标无效")
                scores = np.asarray(agent.get_tribute_give_q_values(vector, legal, bool(data.get("isDouble")), receiver))
            else:
                receiver = data.get("receiver")
                if type(receiver) is not int or receiver not in range(4):
                    raise ValueError("还贡目标无效")
                records = []
                for item in data.get("giveRecords") or []:
                    giver, target = item.get("from"), item.get("to")
                    if type(giver) is not int or giver not in range(4) or type(target) is not int or target not in range(4):
                        raise ValueError("进贡记录无效")
                    records.append(TributeRecord(giver, target, card_index(item.get("cardId"))))
                scores = np.asarray(agent.get_tribute_back_q_values(vector, legal, receiver, records))
        if scores.shape != (len(legal),) or not np.isfinite(scores).all():
            raise ValueError("官方贡还评分无效")
        best = int(np.argmax(scores))
        return {"engine": "official-danlm-macos", "cardIndex": legal[best], "score": float(scores[best]), "policyId":"danlm-v1", "checkpointSha256":MODEL_IDENTITIES["danlm-v1"][1]}
    seat, level, hand, tokens, lead = prepared(payload.get("observation"))
    actions = get_legal_actions(hand, level, lead)
    if not isinstance(actions, np.ndarray) or actions.ndim != 2 or actions.shape[1] != 80 or not len(actions) or len(actions) > 50000:
        raise ValueError("官方核心未返回有效候选")
    play_model=models[policy_id]
    with torch.inference_mode():
        context = play_model.encode(torch.tensor([tokens], dtype=torch.int64), self_abs=torch.tensor([seat], dtype=torch.int64))
        q = play_model.q_values_with_context(context, torch.from_numpy(hand.astype(np.float32)[None]), torch.from_numpy(actions.astype(np.float32)[None])).numpy().reshape(-1)
    if len(q) != len(actions) or not np.isfinite(q).all():
        raise ValueError("官方核心返回了无效评分")
    result = []
    for idx in np.argsort(-q, kind="stable"):
        row = actions[idx]
        type_slots, rank_slots = np.flatnonzero(row[54:65]), np.flatnonzero(row[65:80])
        if len(type_slots) != 1 or len(rank_slots) > 1:
            raise ValueError("官方候选格式无效")
        result.append({"cards": [[int(i), int(row[i])] for i in np.flatnonzero(row[:54])],
                       "type": int(type_slots[0]), "rank": int(rank_slots[0]) if len(rank_slots) else None,
                       "score": float(q[idx])})
    return {"engine": "official-danlm-macos", "candidates": result, "policyId":policy_id, "checkpointSha256":MODEL_IDENTITIES[policy_id][1]}


if __name__ == "__main__":
    for line in sys.stdin:
        request_id = None
        try:
            if len(line) > 4_000_000:
                raise ValueError("请求过大")
            message = json.loads(line)
            request_id = message["id"]
            response = {"id": request_id, "value": run(message["payload"])}
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            response = {"id": request_id, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":"), allow_nan=False), flush=True)
