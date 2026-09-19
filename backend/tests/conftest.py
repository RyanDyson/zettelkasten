"""Integration tests use a unique temporary database, never the application database."""
import asyncio
import os
import tempfile
import uuid
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from fastapi.testclient import TestClient

admin_url = os.environ.get("ZK_TEST_ADMIN_URL", "postgresql://zk:zk@localhost:5433/postgres")
parts = urlsplit(admin_url)
database_name = "zk_test_" + uuid.uuid4().hex
test_url = urlunsplit(parts._replace(path="/" + database_name))
data = tempfile.TemporaryDirectory(prefix="zk-tests-")
os.environ["ZK_DATABASE_URL"] = test_url.replace("postgresql://", "postgresql+asyncpg://", 1)
os.environ["ZK_DATA_DIR"] = data.name
os.environ["ZK_WORKER_POLL_SECONDS"] = "0.02"


@pytest.fixture(scope="session", autouse=True)
def database():
    async def create():
        connection = await asyncpg.connect(admin_url)
        try:
            await connection.execute(f'CREATE DATABASE "{database_name}"')
        finally:
            await connection.close()

    async def drop():
        connection = await asyncpg.connect(admin_url)
        try:
            await connection.execute(f'DROP DATABASE "{database_name}" WITH (FORCE)')
        finally:
            await connection.close()

    asyncio.run(create())
    yield
    asyncio.run(drop())
    data.cleanup()


@pytest.fixture
def client(database):
    from app.main import app
    with TestClient(app) as client:
        yield client
