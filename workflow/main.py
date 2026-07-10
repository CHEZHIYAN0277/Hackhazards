"""Render Workflow entrypoint.

Registers a single durable task that executes the existing
PipelineRunner.execute() pipeline.  No agent, graph, prompt,
validation, or API logic lives here — this is a thin dispatch wrapper.
"""

import logging
import time

from render_sdk import Retry, Workflows

from backend.config import get_settings
from backend.orchestrator.runner import PipelineRunner
from backend.state.redis_store import RedisStore, create_redis_client

logger = logging.getLogger("workflow.main")

# ── Render-level retry policy ───────────────────────────────────────
# This retry applies ONLY when the entire Workflow task crashes due to
# infrastructure failures (OOM, container eviction, network partition,
# unhandled runtime error).  It does NOT duplicate any internal retry:
#
#   • A4 reinvestigation loop  → governed by edges.should_reinvestigate
#   • A7/A8 validation retries → governed by edges.after_mutation /
#                                 edges.after_security + Settings.max_retries
#   • Trust gating / draft PR  → governed by trust_gating.py
#
# Strategy: retry up to 2 times with 30-second back-off between
# attempts, giving transient infrastructure issues time to clear.
# ────────────────────────────────────────────────────────────────────
WORKFLOW_RETRY = Retry(max_retries=2, wait_duration_ms=30_000)

app = Workflows(default_retry=WORKFLOW_RETRY)


@app.task(retry=WORKFLOW_RETRY)
async def run_repository_analysis(run_id: str) -> None:
    """Execute the full bug-detection pipeline for a given run.

    Bootstraps its own Settings → Redis → RedisStore → PipelineRunner
    so the task is fully self-contained and stateless between invocations.

    Retry strategy (Render infrastructure level only):
        max_retries:      2       — at most 2 automatic restarts
        wait_duration_ms: 30 000  — 30 s back-off between attempts

    This is separate from the graph-internal retries managed by
    ``edges.py`` and ``trust_gating.py``, which handle validation
    failures within a single successful task execution.
    """
    logger.info("Workflow started | run_id=%s", run_id)
    start = time.monotonic()

    settings = get_settings()
    redis_client = await create_redis_client(settings)
    try:
        store = RedisStore(redis_client, settings)
        runner = PipelineRunner(store, settings)
        await runner.execute(run_id)

        elapsed = time.monotonic() - start
        logger.info(
            "Workflow completed | run_id=%s | elapsed=%.2fs",
            run_id,
            elapsed,
        )
    except Exception:
        elapsed = time.monotonic() - start
        logger.exception(
            "Workflow failed | run_id=%s | elapsed=%.2fs",
            run_id,
            elapsed,
        )
        raise
    finally:
        await redis_client.aclose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )
    app.start()

