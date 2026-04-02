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
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import DataPart, Message, Part, Role, TextPart


logger = logging.getLogger("ApoloSLAWatcherAgent")


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
            await event_queue.enqueue_event(self._text_message("error: intentHash and slaUrl are required"))
            return

        logger.info("Starting SLA watcher for %s via %s", intent_hash, sla_url)

        check_results = []
        for i in range(checks_required):
            result = await self._check_sla(sla_url, expected_status)
            check_results.append(result)
            if i < checks_required - 1:
                await asyncio.sleep(1)

        passed = sum(1 for r in check_results if r["passed"])
        decision = "approved" if passed == checks_required else "rejected"
        decision_icon = "✅ APPROVED" if decision == "approved" else "❌ REJECTED"

        logger.info("Decision for %s: %s (%s/%s)", intent_hash, decision, passed, checks_required)

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
            Message(
                role=Role.agent,
                parts=[
                    Part(root=TextPart(text="\n".join(summary_lines))),
                    Part(root=DataPart(data=report)),
                ],
                message_id=f"msg-final-{time.time_ns()}",
            )
        )

    async def cancel(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        logger.info("Cancel requested for task %s", context.task_id)

    # ── Helpers ───────────────────────────────────────────────────────────

    def _parse_params(self, context: RequestContext) -> dict:
        """Extract task params from A2A MessageSend payloads across SDK variants."""
        try:
            messages = []
            if context.message:
                messages.append(context.message)

            task = context.current_task
            if task and getattr(task, "history", None):
                messages.extend(task.history or [])

            for message in messages:
                if message.role != Role.user:
                    continue
                for part in message.parts or []:
                    parsed = self._extract_from_part(part)
                    if parsed:
                        return parsed
        except Exception:
            logger.exception("Failed to parse A2A request payload")
            pass
        return {}

    def _text_message(self, text: str) -> Message:
        return Message(
            role=Role.agent,
            parts=[Part(root=TextPart(text=text))],
            message_id=f"msg-{time.time_ns()}",
        )

    def _data_message(self, data: dict) -> Message:
        return Message(
            role=Role.agent,
            parts=[Part(root=DataPart(data=data))],
            message_id=f"msg-data-{time.time_ns()}",
        )

    def _extract_from_part(self, part) -> dict:
        root = getattr(part, "root", part)
        kind = getattr(root, "kind", None)

        if kind == "data" or hasattr(root, "data"):
            for candidate in (getattr(root, "data", None), getattr(part, "data", None)):
                payload = self._coerce_payload(candidate)
                if payload:
                    return payload

            payload = self._extract_from_dump(self._model_dump(root))
            if payload:
                return payload

        if kind == "text" or hasattr(root, "text"):
            payload = self._coerce_payload(getattr(root, "text", None))
            if payload:
                return payload

        return self._extract_from_dump(self._model_dump(part))

    def _extract_from_dump(self, dumped) -> dict:
        if not isinstance(dumped, dict):
            return {}
        for candidate in (
            dumped,
            dumped.get("data"),
            dumped.get("root"),
            (dumped.get("root") or {}).get("data") if isinstance(dumped.get("root"), dict) else None,
        ):
            payload = self._coerce_payload(candidate)
            if payload:
                return payload
        return {}

    def _coerce_payload(self, candidate) -> dict:
        if isinstance(candidate, dict):
            return candidate
        if isinstance(candidate, str):
            try:
                parsed = json.loads(candidate)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        if hasattr(candidate, "model_dump"):
            dumped = candidate.model_dump(by_alias=True)
            return dumped if isinstance(dumped, dict) else {}
        return {}

    def _model_dump(self, value):
        if hasattr(value, "model_dump"):
            return value.model_dump(by_alias=True)
        return value

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
