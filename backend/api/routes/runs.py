import asyncio
import os
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.deps import get_runner, get_settings_dep, get_store
from backend.config import Settings
from backend.orchestrator.runner import PipelineRunner
from backend.state.redis_store import RedisStore

router = APIRouter(prefix="/runs", tags=["runs"])


class CreateRunRequest(BaseModel):
    repo_path: str = Field(default='', description="Local path or URL to target repo")
    repo_url: str = Field(default='', description="Alias for repo_path used by frontend")
    issue_hint: str | None = Field(None, description="Optional hint for which bug to target")


class CreateRunResponse(BaseModel):
    run_id: str
    status: str


class RunSummary(BaseModel):
    run_id: str
    status: str
    current_agent: str
    force_draft_pr: bool
    retry_count: int
    pr_decision: dict | None = None
    errors: list[dict] = Field(default_factory=list)


@router.post("", response_model=CreateRunResponse)
async def create_run(
    body: CreateRunRequest,
    background_tasks: BackgroundTasks,
    store: Annotated[RedisStore, Depends(get_store)],
    runner: Annotated[PipelineRunner, Depends(get_runner)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> CreateRunResponse:
    run_id = str(uuid.uuid4())
    repo = body.repo_url or body.repo_path
    if not repo:
        raise HTTPException(status_code=400, detail="repo_path or repo_url is required")
    await store.init_run(run_id, repo, body.issue_hint)

    if settings.use_render_workflows:
    from render_sdk import RenderAsync

    print("========== RENDER DEBUG ==========")
    print("USE_RENDER_WORKFLOWS:", settings.use_render_workflows)
    print("WORKFLOW_SLUG:", settings.render_workflow_slug)
    print("RENDER_API_KEY exists:", "RENDER_API_KEY" in os.environ)
    print("RENDER_API_KEY length:", len(os.environ.get("RENDER_API_KEY", "")))
    print("=================================")

    render_client = RenderAsync(
        token=os.environ["RENDER_API_KEY"]
    )

    await render_client.workflows.start_task(
        settings.render_workflow_slug,
        [run_id],
    )
    else:
        background_tasks.add_task(runner.execute, run_id)

    return CreateRunResponse(run_id=run_id, status="pending")


@router.get("/{run_id}", response_model=RunSummary)
async def get_run(
    run_id: str,
    store: Annotated[RedisStore, Depends(get_store)],
) -> RunSummary:
    state = await store.load_state(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunSummary(
        run_id=state.run_id,
        status=state.status,
        current_agent=state.current_agent,
        force_draft_pr=state.force_draft_pr,
        retry_count=state.retry_count,
        pr_decision=state.pr_decision,
        errors=state.errors,
    )


@router.get("/{run_id}/sig")
async def get_sig(run_id: str, store: Annotated[RedisStore, Depends(get_store)]) -> dict:
    sig = await store.get_json(run_id, "sig")
    if sig is None:
        state = await store.load_state(run_id)
        if not state:
            raise HTTPException(status_code=404, detail="Run not found")
        return state.sig or {}
    return sig


@router.get("/{run_id}/events")
async def get_events(run_id: str, store: Annotated[RedisStore, Depends(get_store)]) -> list[dict]:
    state = await store.load_state(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    events = await store.get_events(run_id)
    return [e.model_dump(mode="json") for e in events]


@router.get("/{run_id}/proof/{issue_id}")
async def get_proof_bundle(
    run_id: str,
    issue_id: str,
    store: Annotated[RedisStore, Depends(get_store)],
) -> dict:
    from pathlib import Path

    import json

    from backend.models.proof import VerificationBundle

    cached = await store.get_json(run_id, f"proof:{issue_id}")
    if cached:
        return VerificationBundle.model_validate(cached).model_dump(mode="json")

    state = await store.load_state(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")

    if state.proof_bundle and state.proof_bundle.get("issue_id") == issue_id:
        return state.proof_bundle

    repo_path = state.repo_clone_path or state.repo_path
    proof_file = Path(repo_path) / ".proof-of-fix" / f"{issue_id}.json"
    if proof_file.exists():
        data = json.loads(proof_file.read_text(encoding="utf-8"))
        return VerificationBundle.model_validate(data).model_dump(mode="json")

    raise HTTPException(status_code=404, detail="Proof bundle not found")
