# Ace-Cadence base image — built once, tagged locally, and referenced via
# `FROM ace-cadence-base:latest` by every service's own Dockerfile.
#
# Build this BEFORE building any service image:
#   docker build -t ace-cadence-base:latest ./base-image
#
# Contains: the Python runtime, every dependency common to all services, and
# the `common` package (DB connection/session factory, shared settings base,
# audit-log helper, health-check router) — see base-image/common/.
FROM python:3.11-slim

# Pinned to 3.11: telephony-bridge-svc's DTMF tone synthesis uses the stdlib
# `audioop` module, removed in Python 3.13. Keeping every service on the same
# interpreter version avoids special-casing one service's base image.

# Build deps for asyncmy (compiles against libmysqlclient) — kept in the
# final image too since it's the smallest footprint that avoids a second
# multi-stage copy step; revisit with a slim multi-stage build if image size
# becomes a real concern.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc default-libmysqlclient-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common ./common

# Every service that FROMs this image inherits /app on PYTHONPATH, so
# `from common.db import get_db` works from any service's own app/ code
# without each service needing its own copy of this package.
ENV PYTHONPATH=/app
