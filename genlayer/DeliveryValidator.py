# { "Depends": "py-genlayer:test" }

from genlayer import *


class DeliveryValidator(gl.Contract):
    """
    Intent Validation Layer for Rebyt.

    Architecture:
    - Normalization layer: All LLM outputs are collapsed to strict YES/NO
      before any consensus step. This is the critical layer — not the LLM
      itself, but the interpretation contract over its output.
    - Consensus mode: prompt_non_comparative — validators evaluate independently;
      consensus holds if the normalized outputs agree across the validator set.
    - Evidence layer: gl.nondet.web.render fetches real evidence URL content
      and injects it into the prompt, grounding evaluation in facts.
    - Storage: intentHash → approved (bool), write-once per hash.

    V1 Trust Model:
    - Solver/relayer is trusted to call validate() with correct intentHash.
    - getResult() is readable by anyone; used by relayer to gate settlement.
    """

    results: TreeMap[str, bool]
    recordsSeen: TreeMap[str, bool]
    consensusStatus: TreeMap[str, str]
    finalityStatus: TreeMap[str, str]
    observedAt: TreeMap[str, bigint]
    finalizedAt: TreeMap[str, bigint]
    validationRef: TreeMap[str, str]

    def __init__(self):
        pass

    # ── Normalization Layer ─────────────────────────────────────────────────
    # This is the portable, backend-agnostic core.
    # Same function can run in off-chain validation with any LLM provider.

    def _normalize(self, raw: str) -> str:
        """
        Collapse any LLM output to strict "YES" or "NO".
        Rules (in order):
          1. Strip whitespace, uppercase
          2. If starts with YES → "YES"
          3. Everything else → "NO"  (fail-safe: ambiguity = reject)
        """
        normalized = str(raw).strip().upper()
        if normalized.startswith("YES"):
            return "YES"
        return "NO"

    # ── Evaluation Layer ────────────────────────────────────────────────────
    # Fetches evidence and evaluates condition against it.
    # Isolated so it can be replaced with off-chain equivalent.

    def _evaluate(self, condition: str, evidenceUrl: str) -> str:
        def nondet_llm() -> str:
            evidence = gl.nondet.web.render(evidenceUrl, mode="text")
            prompt = (
                "Given this evidence, was the following condition met? "
                f"{condition}? Answer only YES or NO.\n\n"
                f"Evidence:\n{evidence}"
            )
            answer = gl.nondet.exec_prompt(prompt)
            return self._normalize(answer)

        # prompt_non_comparative: each validator runs independently,
        # consensus holds when normalized outputs agree.
        result = gl.eq_principle.prompt_non_comparative(
            nondet_llm,
            task="Determine if a delivery condition was met based on web evidence",
            criteria="The result must be YES or NO indicating whether the condition was satisfied",
        )
        return str(result).strip().upper()

    def _normalize_consensus_status(self, value: str) -> str:
        normalized = str(value).strip().upper()
        if normalized in ("ACCEPTED", "MAJORITY_AGREE", "PENDING"):
            return normalized
        return "ACCEPTED"

    def _normalize_finality_status(self, value: str) -> str:
        normalized = str(value).strip().upper()
        if normalized in ("PENDING", "CONFIRMED", "FINALIZED"):
            return normalized
        return "PENDING"

    # ── Public Interface ────────────────────────────────────────────────────

    @gl.public.write
    def validate(self, intentHash: str, condition: str, evidenceUrl: str) -> bool:
        """
        Evaluate condition against evidence and store binary result.

        Two validator outputs are equivalent if they both agree on whether
        the delivery condition was met, regardless of reasoning path.

        Args:
            intentHash:  EIP-712 keccak256 of the payment intent
            condition:   Natural language delivery condition
            evidenceUrl: URL to publicly verifiable evidence

        Returns:
            True if condition is satisfied, False otherwise.
        """
        raw_result = self._evaluate(condition, evidenceUrl)
        approved = raw_result == "YES"
        self.results[intentHash] = approved
        self.recordsSeen[intentHash] = True
        self.consensusStatus[intentHash] = "ACCEPTED"
        self.finalityStatus[intentHash] = "PENDING"
        self.observedAt[intentHash] = bigint(0)
        self.finalizedAt[intentHash] = bigint(0)
        self.validationRef[intentHash] = ""
        return approved

    @gl.public.write
    def recordConsensus(
        self,
        intentHash: str,
        approved: bool,
        consensusStatus: str,
        finalityStatus: str,
        validationRef: str,
        observedAt: bigint,
    ) -> bool:
        """
        V1 trusted-solver anchoring endpoint.

        Stores explicit onchain evidence for consensus phase after validation.
        Called by relayer with deterministic values.
        """
        self.results[intentHash] = bool(approved)
        self.recordsSeen[intentHash] = True
        self.consensusStatus[intentHash] = self._normalize_consensus_status(consensusStatus)
        self.finalityStatus[intentHash] = self._normalize_finality_status(finalityStatus)
        self.validationRef[intentHash] = str(validationRef)
        self.observedAt[intentHash] = bigint(observedAt)
        if self.finalizedAt.get(intentHash, bigint(0)) < bigint(0):
            self.finalizedAt[intentHash] = bigint(0)
        return True

    @gl.public.write
    def recordFinality(self, intentHash: str, finalityStatus: str, finalizedAt: bigint) -> str:
        """
        V1 trusted-solver anchoring endpoint.

        Marks finality phase onchain (PENDING/CONFIRMED/FINALIZED).
        """
        normalized = self._normalize_finality_status(finalityStatus)
        self.recordsSeen[intentHash] = True
        self.finalityStatus[intentHash] = normalized
        if normalized in ("CONFIRMED", "FINALIZED"):
            self.finalizedAt[intentHash] = bigint(finalizedAt)
        return normalized

    @gl.public.view
    def getResult(self, intentHash: str) -> bool:
        """Read stored validation result. Returns False if not yet validated."""
        return self.results.get(intentHash, False)

    @gl.public.view
    def getRecord(self, intentHash: str) -> tuple[bool, bool, str, str, bigint, bigint, str]:
        """
        Returns:
          (exists, approved, consensus_status, finality_status, observed_at, finalized_at, validation_ref)
        """
        return (
            self.recordsSeen.get(intentHash, False),
            self.results.get(intentHash, False),
            self.consensusStatus.get(intentHash, "PENDING"),
            self.finalityStatus.get(intentHash, "PENDING"),
            self.observedAt.get(intentHash, bigint(0)),
            self.finalizedAt.get(intentHash, bigint(0)),
            self.validationRef.get(intentHash, ""),
        )
