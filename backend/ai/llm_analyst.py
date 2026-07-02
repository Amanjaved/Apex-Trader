# LLM-powered senior analyst layer (Emergent universal key via emergentintegrations)
from __future__ import annotations

import os
import uuid
from typing import Any, Dict

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
MODEL = os.environ.get("LLM_MODEL", "gpt-5.4")

ANALYST_SYSTEM = (
    "You are 'Apex', a senior crypto derivatives trader and quant with 15+ years of experience across "
    "prop desks and market making. You are given a live quantitative snapshot computed from real Binance "
    "market data (trend, momentum, volatility, order flow, S/R zones, SMC structures, sentiment). "
    "Rules: (1) Ground every claim in the provided data — never invent price levels. "
    "(2) Be direct and skeptical; call out conflicting signals and low-conviction setups. "
    "(3) Think in probabilities and risk-reward, never certainties. "
    "(4) Always include invalidation levels. (5) Use tight markdown with ### headers and bold key numbers. "
    "(6) Never give financial advice disclaimers longer than one short line."
)

CHAT_SYSTEM = (
    "You are 'Apex', a senior crypto trading analyst (15y experience) embedded in the ApexTrader Pro terminal. "
    "Answer the user's question using the live quantitative market snapshot provided. Ground answers in the "
    "actual numbers given. Be concise (under 250 words), use markdown bold for key levels/values, and think in "
    "risk-reward terms. If the question is unrelated to trading/markets, answer briefly and steer back to the market."
)


def _fmt_levels(levels: Dict[str, Any]) -> str:
    out = []
    for r in levels.get("resistance", []):
        out.append(f"  R: {r['price']:.2f} (zone {r['low']:.2f}-{r['high']:.2f}, score {r['score']:.0f}) {r.get('label','')}")
    for s in levels.get("support", []):
        out.append(f"  S: {s['price']:.2f} (zone {s['low']:.2f}-{s['high']:.2f}, score {s['score']:.0f}) {s.get('label','')}")
    return "\n".join(out) or "  none detected"


def build_snapshot(symbol: str, interval: str, q: Dict[str, Any]) -> str:
    confs = "\n".join(f"  [{c['type']}] {c['txt']}" for c in q.get("confluences", [])[:18])
    regime = q.get("marketRegime", {})
    risk = q.get("riskMeter", {})
    return (
        f"SYMBOL: {symbol} | TIMEFRAME: {interval}\n"
        f"QUANT BIAS: {q.get('bias')} | confidence score: {q.get('score')}/100\n"
        f"LONG PROB: {q.get('longProb')}% | SHORT PROB: {q.get('shortProb')}%\n"
        f"MARKET REGIME: {regime.get('type')} (strength {regime.get('strength')}) | risk: {risk.get('risk')}\n"
        f"CONFLUENCE FACTORS:\n{confs}\n"
        f"S/R ZONES (rejection-scored, multi-timeframe):\n{_fmt_levels(q.get('levels', {}))}\n"
    )


async def _run(system_message: str, prompt: str) -> str:
    chat = LlmChat(
        api_key=LLM_KEY,
        session_id=f"apex-{uuid.uuid4().hex[:12]}",
        system_message=system_message,
    ).with_model(PROVIDER, MODEL)
    parts = []
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(parts)


async def deep_analysis(symbol: str, interval: str, quant: Dict[str, Any]) -> str:
    prompt = (
        f"{build_snapshot(symbol, interval, quant)}\n"
        "Produce a professional desk-note with exactly these sections:\n"
        "### Market Read — what the data actually says, including any conflicting signals\n"
        "### Trade Plan — direction (or NO TRADE), entry zone, stop (invalidation), TP1/TP2 with R:R math using the real S/R zones above\n"
        "### What Would Change My Mind — the specific price/structure events that flip the thesis\n"
        "### Conviction — X/10 with one-line justification\n"
        "If risk-reward to the nearest zones is below 1.5R or signals conflict heavily, explicitly say NO TRADE / WAIT."
    )
    return await _run(ANALYST_SYSTEM, prompt)


async def chat_reply(symbol: str, interval: str, message: str, quant: Dict[str, Any]) -> str:
    prompt = f"{build_snapshot(symbol, interval, quant)}\nUSER QUESTION: {message}"
    return await _run(CHAT_SYSTEM, prompt)
