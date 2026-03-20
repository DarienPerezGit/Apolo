# { "Depends": "py-genlayer:test" }

from genlayer import *


class DeliveryValidator(gl.Contract):
    results: TreeMap[str, bool]

    def __init__(self):
        pass

    def eq_principle_prompt_comparative(self, prompt: str) -> str:
        def nondet_llm() -> str:
            answer = gl.nondet.exec_prompt(prompt)
            normalized = str(answer).strip().upper()
            if normalized.startswith("YES"):
                return "YES"
            return "NO"

        result = gl.eq_principle.strict_eq(nondet_llm)
        return str(result).strip().upper()

    @gl.public.write
    def validate(self, intentHash: str, condition: str, evidenceUrl: str) -> bool:
        """
        Two validator outputs are equivalent if they both agree on whether
        the delivery condition was met, regardless of the reasoning process
        used to reach that conclusion.
        """
        evidence = gl.nondet.web.render(evidenceUrl, mode="text")
        prompt = (
            "Given this evidence, was the following condition met: "
            f"{condition}? Answer only YES or NO.\n\n"
            f"Evidence:\n{evidence}"
        )

        comparative_answer = self.eq_principle_prompt_comparative(prompt)
        approved = comparative_answer == "YES"
        self.results[intentHash] = approved
        return approved

    @gl.public.view
    def getResult(self, intentHash: str) -> bool:
        return self.results.get(intentHash, False)
