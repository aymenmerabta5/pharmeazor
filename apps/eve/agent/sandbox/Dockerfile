# syntax=docker/dockerfile:1
#
# Sandbox image for the pharmeazor eve agent.
#
# The agent reads and analyses regulated documents, so it needs a real Python
# runtime instead of a simulated shell. The image carries CPython plus the
# pinned document libraries and nothing else: no Node.js, no package manager,
# and no numerical or scientific stack. The agent therefore cannot grow the
# application dependency graph from inside a session.
#
# The build context is `apps/eve/agent/sandbox/`. The pinned requirements are
# seeded into every sandbox workspace, so the same file installs the libraries
# here and on the hosted provider.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# bash backs eve's sandbox runtime, ripgrep backs the grep and glob tools, and
# git backs repository work.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends \
      bash \
      ca-certificates \
      git \
      ripgrep \
 && rm --recursive --force /var/lib/apt/lists/*

# Every sandbox command runs as an unprivileged account.
RUN groupadd --gid 1000 sandbox \
 && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/sandbox --shell /bin/bash sandbox \
 && install --directory --owner sandbox --group sandbox /workspace

COPY workspace/requirements.txt /tmp/pharmeazor-requirements.txt
RUN python3 -m pip install --no-cache-dir --requirement /tmp/pharmeazor-requirements.txt \
 && rm /tmp/pharmeazor-requirements.txt

ENV HOME=/home/sandbox
WORKDIR /workspace
USER sandbox
