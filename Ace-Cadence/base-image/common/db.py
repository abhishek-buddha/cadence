"""Shared async SQLAlchemy engine/session factory.

Every service imports `get_db` as a FastAPI dependency and talks to MySQL
with plain SQL (`sqlalchemy.text(...)`) — there are no ORM model classes
here. Table structure lives in the database itself (created separately, not
duplicated as Python classes); this file only owns connection pooling/config
so no service reinvents it.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from common.config import CommonSettings

_settings = CommonSettings()

engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a session, closes it after the request.

    Usage in a service's router:
        @router.get("/things")
        async def list_things(db: AsyncSession = Depends(get_db)):
            result = await db.execute(text("SELECT * FROM things"))
            return rows_to_dicts(result)
    """
    async with AsyncSessionLocal() as session:
        yield session
