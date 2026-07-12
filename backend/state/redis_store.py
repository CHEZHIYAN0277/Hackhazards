import json
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

from backend.config import Settings, get_settings
from backend.state.events import AgentStatusEvent
from backend.state.schema import (
    RunState,
    RunStateModel,
    model_to_state,
    state_to_model,
)


class RedisStore:
    def __init__(self, client: aioredis.Redis, settings: Settings | None = None):
        self.client = client
        self.settings = settings or get_settings()
        self.ttl = self.settings.state_ttl_seconds

    def _prefix(self, run_id: str) -> str:
        return f"bugfix:{run_id}"

    async def init_run(
        self,
        run_id: str,
        repo_path: str,
        issue_hint: str | None = None,
    ) -> RunStateModel:
        state = RunStateModel(
            run_id=run_id,
            repo_path=repo_path,
            issue_hint=issue_hint,
            status="pending",
        )

        await self.save_state(state)

        meta = {
            "status": state.status,
            "repo_path": repo_path,
            "created_at": state.created_at.isoformat(),
            "retry_count": "0",
            "force_draft_pr": "false",
        }

        key = f"{self._prefix(run_id)}:meta"

        await self.client.hset(key, mapping=meta)
        await self.client.expire(key, self.ttl)

        return state

    async def save_state(
        self,
        state: RunStateModel | RunState,
    ) -> None:

        if isinstance(state, RunStateModel):
            model = state
        else:
            model = state_to_model(state)

        key = f"{self._prefix(model.run_id)}:state"

        await self.client.set(
            key,
            model.model_dump_json(),
            ex=self.ttl,
        )

        # Keep lightweight metadata synchronized.
        await self.update_meta(
            model.run_id,
            status=model.status,
            current_agent=model.current_agent,
            retry_count=str(model.retry_count),
            force_draft_pr=str(model.force_draft_pr).lower(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    async def load_state(
        self,
        run_id: str,
    ) -> RunStateModel | None:

        key = f"{self._prefix(run_id)}:state"

        raw = await self.client.get(key)

        if not raw:
            return None

        try:
            return RunStateModel.model_validate_json(raw)

        except Exception:
            import traceback

            print("=" * 80)
            print("FAILED TO LOAD RUN STATE")
            print("RUN ID:", run_id)
            print("RAW REDIS DATA:")
            print(raw)
            traceback.print_exc()
            print("=" * 80)

            raise

    async def set_json(
        self,
        run_id: str,
        suffix: str,
        data: dict | list,
    ) -> None:

        key = f"{self._prefix(run_id)}:{suffix}"

        await self.client.set(
            key,
            json.dumps(data),
            ex=self.ttl,
        )

    async def get_json(
        self,
        run_id: str,
        suffix: str,
    ) -> Any | None:

        key = f"{self._prefix(run_id)}:{suffix}"

        raw = await self.client.get(key)

        if not raw:
            return None

        return json.loads(raw)

    async def append_event(
        self,
        event: AgentStatusEvent,
    ) -> None:

        key = f"{self._prefix(event.run_id)}:events"

        await self.client.xadd(
            key,
            {"data": event.model_dump_json()},
            maxlen=1000,
        )

        await self.client.expire(key, self.ttl)

        channel = f"bugfix:{event.run_id}:live"

        await self.client.publish(
            channel,
            event.model_dump_json(),
        )

    async def get_events(
        self,
        run_id: str,
        count: int = 100,
    ) -> list[AgentStatusEvent]:

        key = f"{self._prefix(run_id)}:events"

        entries = await self.client.xrevrange(
            key,
            count=count,
        )

        events = []

        for _entry_id, fields in reversed(entries):

            data = fields.get(b"data") or fields.get("data")

            if data:

                if isinstance(data, bytes):
                    data = data.decode()

                events.append(
                    AgentStatusEvent.model_validate_json(data)
                )

        return events

    async def update_meta(
        self,
        run_id: str,
        **fields: str,
    ) -> None:

        key = f"{self._prefix(run_id)}:meta"

        if fields:
            await self.client.hset(
                key,
                mapping=fields,
            )

        await self.client.expire(
            key,
            self.ttl,
        )

    async def acquire_lock(
        self,
        run_id: str,
        ttl: int = 60,
    ) -> bool:

        key = f"{self._prefix(run_id)}:lock"

        return bool(
            await self.client.set(
                key,
                "1",
                nx=True,
                ex=ttl,
            )
        )

    async def release_lock(
        self,
        run_id: str,
    ) -> None:

        key = f"{self._prefix(run_id)}:lock"

        await self.client.delete(key)

    def sig_cache_redis_key(
        self,
        version: str,
        repo_hash: str,
    ) -> str:
        return f"sig_cache:{version}:{repo_hash}"

    async def get_sig_cache(
        self,
        version: str,
        repo_hash: str,
    ) -> str | None:

        key = self.sig_cache_redis_key(
            version,
            repo_hash,
        )

        raw = await self.client.get(key)

        if raw is None:
            return None

        if isinstance(raw, bytes):
            return raw.decode()

        return raw

    async def set_sig_cache(
        self,
        version: str,
        repo_hash: str,
        payload_json: str,
        ttl: int,
    ) -> None:

        key = self.sig_cache_redis_key(
            version,
            repo_hash,
        )

        await self.client.set(
            key,
            payload_json,
            ex=ttl,
        )


async def create_redis_client(
    settings: Settings | None = None,
) -> aioredis.Redis:

    settings = settings or get_settings()

    return aioredis.from_url(
        settings.redis_url,
        decode_responses=False,
    )