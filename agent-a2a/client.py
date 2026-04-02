"""
ApoloSLAWatcherAgent — Sample Client

Sends a task to the ApoloSLAWatcherAgent via the A2A JSON-RPC protocol.
Uses raw httpx (no SDK client) so it works with any A2A-compatible server.

Usage:
  python client.py                                        # uses httpbin test endpoint
  python client.py https://your-api.com/health           # custom SLA URL
  python client.py <slaUrl> <intentHash>                 # provide your own intentHash

Prerequisites:
  - ApoloSLAWatcherAgent is running on http://localhost:8080
  - Apolo solver is running on http://localhost:3001
  - Escrow is already funded on BNB Mainnet for that intentHash
    (or use --fund flag to fund first via the solver)
"""

import asyncio
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

import httpx

AGENT_URL = os.getenv("AGENT_URL", "http://localhost:8080")
SOLVER_URL = os.getenv("SOLVER_URL", "http://localhost:3001")


def random_intent_hash() -> str:
    return "0x" + "".join(random.choices("0123456789abcdef", k=64))


def extract_parts(parts, report):
    for part in parts or []:
        if part.get("kind") == "text" and part.get("text"):
            print(part["text"])
        if part.get("kind") == "data" and part.get("data"):
            report = part["data"]
    return report


async def fund_escrow(intent_hash: str, amount_wei: str = "100000000000000") -> dict:
    """
    Fund an escrow via the Apolo solver (defer=true skips auto-settlement).
    Returns { txHash, status, bscScanUrl }
    """
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{SOLVER_URL}/intent",
            json={
                "intentHash": intent_hash,
                "defer": True,
                "intent": {
                    "amountWei": amount_wei,
                    "condition": "HTTP endpoint returns 200",
                    "evidenceUrl": "",
                },
            },
        )
        resp.raise_for_status()
        return resp.json()


async def send_task_to_agent(
    intent_hash: str,
    sla_url: str,
    expected_status: int = 200,
    checks_required: int = 3,
) -> dict:
    """
    Send a task to ApoloSLAWatcherAgent using A2A JSON-RPC (message/send).
    Streams text events and returns the final data report.
    """
    message_id = f"msg-{int(time.time_ns())}"
    task_id = f"task-{int(time.time())}"

    payload = {
        "jsonrpc": "2.0",
        "id": task_id,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "messageId": message_id,
                "parts": [
                    {
                        "kind": "data",
                        "data": {
                            "intentHash": intent_hash,
                            "slaUrl": sla_url,
                            "expectedStatus": expected_status,
                            "checksRequired": checks_required,
                            "solverUrl": SOLVER_URL,
                        },
                    }
                ],
            }
        },
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            AGENT_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        result = resp.json()

    # Extract text messages and final data from response
    report = {}
    try:
        task = result.get("result", {})

        if task.get("kind") == "message":
            report = extract_parts(task.get("parts") or [], report)
            return report

        artifacts = task.get("artifacts") or []
        history = task.get("history") or []
        status_msg = (task.get("status") or {}).get("message") or {}

        # Collect all messages for display
        all_messages = history + ([status_msg] if status_msg else [])
        for msg in all_messages:
            report = extract_parts(msg.get("parts") or [], report)

        for artifact in artifacts:
            report = extract_parts(artifact.get("parts") or [], report)
    except Exception as exc:
        print(f"[client] Warning: could not parse response — {exc}")
        print(f"[client] Raw response: {json.dumps(result, indent=2)[:2000]}")

    return report


async def main():
    sla_url = sys.argv[1] if len(sys.argv) > 1 else "https://httpbin.org/status/200"
    intent_hash = sys.argv[2] if len(sys.argv) > 2 else None
    fund_first = "--fund" in sys.argv

    print("=" * 62)
    print("  APOLO V1.5 — EXTERNAL AGENT CASE STUDY")
    print("=" * 62)
    print(f"  Agent:      {AGENT_URL}")
    print(f"  Solver:     {SOLVER_URL}")
    print(f"  SLA URL:    {sla_url}")
    print()

    # ── Step 1: Fund escrow (optional) ───────────────────────────────────
    if fund_first or not intent_hash:
        intent_hash = intent_hash or random_intent_hash()
        print(f"[1/3] Funding escrow on BNB Mainnet...")
        print(f"  intentHash: {intent_hash}")
        try:
            fund_result = await fund_escrow(intent_hash)
            fund_tx = fund_result.get("txHash", "")
            print(f"  Fund TX:  {fund_tx}")
            if fund_tx:
                print(f"  BSCScan:  https://bscscan.com/tx/{fund_tx}")
            print()
            # Small wait for block confirmation
            await asyncio.sleep(3)
        except Exception as exc:
            print(f"  ⚠️  Fund failed: {exc}")
            print("  Continuing — intent may already be funded or solver offline")
            print()
    else:
        print(f"[1/3] Using existing intentHash: {intent_hash}")
        print()

    # ── Step 2: Trigger A2A agent ─────────────────────────────────────────
    print(f"[2/3] Sending task to ApoloSLAWatcherAgent...")
    print()
    report = await send_task_to_agent(intent_hash, sla_url)
    print()

    # ── Step 3: Print proof summary ───────────────────────────────────────
    print("[3/3] Proof collected:")
    if report:
        settlement = report.get("settlement", {})
        tx = settlement.get("txHash", "")
        print(f"  decision:   {report.get('decision', 'unknown').upper()}")
        print(f"  settleTx:   {tx or '(none)'}")
        if tx:
            print(f"  bscScan:    https://bscscan.com/tx/{tx}")
        print(f"  timestamp:  {report.get('timestamp', '')}")
    else:
        print("  (no structured report received — check agent logs)")

    print()
    print("  Full report saved to: agent-report.json")
    with open("agent-report.json", "w") as f:
        json.dump(
            {
                "intentHash": intent_hash,
                "slaUrl": sla_url,
                "report": report,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            },
            f,
            indent=2,
        )


if __name__ == "__main__":
    asyncio.run(main())
