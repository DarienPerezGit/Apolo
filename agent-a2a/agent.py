"""
ApoloSLAWatcherAgent — A2A Server
Monitors SLA conditions and triggers Apolo escrow settlement automatically.

Flow:
  1. Accept task: { intentHash, slaUrl, expectedStatus, checksRequired, solverUrl }
  2. Perform N HTTP checks against slaUrl
  3. Decision: approved if all checks pass, rejected otherwise
  4. POST {solverUrl}/settle → on-chain release/refund
  5. Return structured proof report
"""

import asyncio
import json
import os
import time
from datetime import datetime, timezone

import httpx

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import DataPart, Message, Part, Role, TaskState, TextPart


class ApoloSLAWatcherAgent(AgentExecutor):
    """
    External orchestration agent for Apolo V1.5.
    Implements the A2A AgentExecutor interface.
    Trust model: relayer/solver is trusted (V1 documented).
    """

    async def execute(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        params = self._parse_params(context)

        intent_hash = params.get("intentHash", "")
        sla_url = params.get("slaUrl", "")
        expected_status = int(params.get("expectedStatus", 200))
        checks_required = int(params.get("checksRequired", 3))
        solver_url = params.get(
            "solverUrl", os.getenv("SOLVER_URL", "http://localhost:3001")
        )

        if not intent_hash or not sla_url:
            await event_queue.enqueue_event(
                self._text_message("error: intentHash and slaUrl are required")
            )
            await event_queue.enqueue_event(TaskState.failed)
            return

        # ── Step 1: SLA verification ─────────────────────────────────────
        await event_queue.enqueue_event(
            self._text_message(
                f"[ApoloSLAWatcher] Starting SLA check → {sla_url} "
                f"(expected={expected_status}, checks={checks_required})"
            )
        )

        check_results = []
        for i in range(checks_required):
            result = await self._check_sla(sla_url, expected_status)
            check_results.append(result)
            status_icon = "✅" if result["passed"] else "❌"
            await event_queue.enqueue_event(
                self._text_message(
                    f"  {status_icon} Check {i + 1}/{checks_required}: "
                    f"HTTP {result['status_code']} — {result['latency_ms']}ms"
                )
            )
            if i < checks_required - 1:
                await asyncio.sleep(1)

        passed = sum(1 for r in check_results if r["passed"])
        decision = "approved" if passed == checks_required else "rejected"
        decision_icon = "✅ APPROVED" if decision == "approved" else "❌ REJECTED"

        await event_queue.enqueue_event(
            self._text_message(
                f"[ApoloSLAWatcher] Decision: {decision_icon} "
                f"({passed}/{checks_required} checks passed)"
            )
        )

        # ── Step 2: Submit settlement ─────────────────────────────────────
        evidence = {
            "agent": "ApoloSLAWatcherAgent/1.0",
            "slaUrl": sla_url,
            "expectedStatus": expected_status,
            "checks": check_results,
            "passed": passed,
            "total": checks_required,
            "decision": decision,
            "agentTimestamp": datetime.now(timezone.utc).isoformat(),
        }

        await event_queue.enqueue_event(
            self._text_message(
                f"[ApoloSLAWatcher] Submitting settlement → {solver_url}/settle"
            )
        )

        settlement = await self._submit_settlement(
            solver_url, intent_hash, decision, evidence
        )

        tx_hash = settlement.get("txHash", "")
        bscscan = f"https://bscscan.com/tx/{tx_hash}" if tx_hash else "N/A"
        settle_error = settlement.get("error", "")

        # ── Step 3: Final proof report ────────────────────────────────────
        report = {
            "intentHash": intent_hash,
            "contractAddress": "0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d",
            "chainId": 56,
            "decision": decision,
            "evidence": evidence,
            "settlement": {
                "action": settlement.get("action", ""),
                "txHash": tx_hash,
                "bscScanUrl": bscscan,
                "status": settlement.get("status", ""),
                "error": settle_error,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        summary_lines = [
            "",
            "=" * 62,
            "  APOLO SLA WATCHER — CASE STUDY PROOF REPORT",
            "=" * 62,
            f"  intentHash:   {intent_hash}",
            f"  slaUrl:       {sla_url}",
            f"  decision:     {decision.upper()}",
            f"  checks:       {passed}/{checks_required} passed",
            f"  settleTx:     {tx_hash or settle_error}",
            f"  bscScan:      {bscscan}",
            "=" * 62,
        ]
        await event_queue.enqueue_event(
            self._text_message("\n".join(summary_lines))
        )

        # Emit structured data part for programmatic consumers
        await event_queue.enqueue_event(self._data_message(report))
        await event_queue.enqueue_event(TaskState.completed)

    async def cancel(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        await event_queue.enqueue_event(TaskState.canceled)

    # ── Helpers ───────────────────────────────────────────────────────────

    def _parse_params(self, context: RequestContext) -> dict:
        """Extract task params from the first user message."""
        try:
            task = context.current_task
            for message in task.history or []:
                if message.role == Role.user:
                    for part in message.parts or []:
                        root = getattr(part, "root", part)
                        # DataPart
                        if hasattr(root, "data") and isinstance(root.data, dict):
                            return root.data
                        # TextPart — try JSON parse
                        if hasattr(root, "text"):
                            try:
                                parsed = json.loads(root.text)
                                if isinstance(parsed, dict):
                                    return parsed
                            except (json.JSONDecodeError, AttributeError):
                                pass
            # Fallback: try context.message
            if context.message:
                for part in context.message.parts or []:
                    root = getattr(part, "root", part)
                    if hasattr(root, "data") and isinstance(root.data, dict):
                        return root.data
        except Exception:
            pass
        return {}

    def _text_message(self, text: str) -> Message:
        return Message(
            role=Role.agent,
            parts=[Part(root=TextPart(text=text))],
            messageId=f"msg-{time.time_ns()}",
        )

    def _data_message(self, data: dict) -> Message:
        return Message(
            role=Role.agent,
            parts=[Part(root=DataPart(data=data))],
            messageId=f"msg-data-{time.time_ns()}",
        )

    async def _check_sla(self, url: str, expected_status: int) -> dict:
        start = time.monotonic()
        ts = datetime.now(timezone.utc).isoformat()
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                resp = await client.get(url)
                latency = int((time.monotonic() - start) * 1000)
                return {
                    "url": url,
                    "status_code": resp.status_code,
                    "passed": resp.status_code == expected_status,
                    "latency_ms": latency,
                    "ts": ts,
                    "error": None,
                }
        except Exception as exc:
            latency = int((time.monotonic() - start) * 1000)
            return {
                "url": url,
                "status_code": 0,
                "passed": False,
                "latency_ms": latency,
                "ts": ts,
                "error": str(exc),
            }

    async def _submit_settlement(
        self, solver_url: str, intent_hash: str, decision: str, evidence: dict
    ) -> dict:
        agent_key = os.getenv("AGENT_API_KEY", "")
        headers = {"Content-Type": "application/json"}
        if agent_key:
            headers["X-APOLO-AGENT-KEY"] = agent_key
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{solver_url}/settle",
                    json={
                        "intentHash": intent_hash,
                        "decision": decision,
                        "evidence": evidence,
                    },
                    headers=headers,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "txHash": ""}
        except Exception as exc:
            return {"error": str(exc), "txHash": ""}
