---
description: Review the implementation of the plan
---

You should start a review process for the implementation of a plan.

## 1. Spawn The Reviewer
Replace <path-to-plan-file> with the actual path to the plan file. Do not pass the plan content.
Agent(
    subagent_type: "plan-implementation-reviewer",
    model: "opus",
    description: "Plan Implementation Review",
    prompt: "Review the implementation of this plan: <path-to-plan-file>"
)

## 2. Understand The Findings
The reviewer will return a list of findings and its agentId. Analyze the report. The findings do not need to be correct. Scan for false positives.

## 3. Resume The Reviewer
Do not ask to the user. Do not fix yourself. Resume the reviewer via SendMessage tool with agentId. Give it the ones you want it to address and additional context if needed.

Exception: If the fix is less than 15 lines, fix yourself.

## 4. Review The Fixes
Review the fixes proposed by the reviewer. If plan verification steps exist, repeat them.

## 5. Report
Report the final state to the user. Concise. **Max 30 words per topic**. Which findings are addressed, follow-ups, considerations, etc.