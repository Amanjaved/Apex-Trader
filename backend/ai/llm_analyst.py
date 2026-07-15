# LLM-powered senior analyst layer (NVIDIA Integrate API)
from __future__ import annotations

import os
import sys
import json
import urllib.request
import urllib.error
import ssl
from typing import Any, Dict

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


def safe_print(text: str, end: str = "", flush: bool = True):
    try:
        sys.stdout.write(text)
    except UnicodeEncodeError:
        clean_text = text.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8')
        sys.stdout.write(clean_text)
    if end:
        sys.stdout.write(end)
    if flush:
        sys.stdout.flush()


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
    from openai import OpenAI
    import asyncio
    
    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="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"
    )
    
    try:
        loop = asyncio.get_running_loop()
        
        def _call_api():
            print("\n[NVIDIA thinking] starting inference...", flush=True)
            completion = client.chat.completions.create(
                model="nvidia/nemotron-3-super-120b-a12b",
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt}
                ],
                temperature=1,
                top_p=0.95,
                max_tokens=16384,
                extra_body={"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":16384},
                stream=True
            )
            
            collected_chunks = []
            
            for chunk in completion:
                if not chunk.choices:
                    continue
                reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
                if reasoning:
                    safe_print(reasoning)
                if chunk.choices[0].delta.content is not None:
                    safe_print(chunk.choices[0].delta.content)
                    collected_chunks.append(chunk.choices[0].delta.content)
            
            print("\n[NVIDIA thinking] completed inference.\n", flush=True)
            return "".join(collected_chunks)
            
        return await loop.run_in_executor(None, _call_api)
    except Exception as e:
        return f"Error generating content from NVIDIA API: {str(e)}"


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
