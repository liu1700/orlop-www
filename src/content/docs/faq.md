---
title: Frequently asked questions
description: Common questions about orlop — persistent zero-trust storage for AI agent sandboxes, how the mTLS isolation model works, and how it relates to agent memory.
---

## What is orlop in one sentence?

orlop gives each untrusted agent its own durable, per-tenant POSIX disk — mounted
over FUSE, backed by a remote content-addressed chunk store — **without ever
handing the agent a storage credential**.

## How is this different from just mounting a network filesystem?

A network filesystem or object bucket requires giving the sandbox a credential.
If the agent is compromised, that credential can read or destroy other tenants'
data. orlop instead issues each agent a **short-lived mTLS client certificate**
whose identity is the only thing that authorizes access, and the server
**confines every connection to that agent's own path prefix**. There is no shared
key to steal and no way to widen the path.

## Does the data survive when the sandbox is destroyed?

Yes. The bytes live in the remote chunk store, not in the sandbox. When the
sandbox dies the data persists, and the next run for the same agent re-mounts the
**same disk with zero idle compute**.

## Is orlop a memory system for agents?

No — orlop is the **storage substrate** for one. It stores bytes durably,
deduplicates by content hash, and isolates tenants, but it does no extraction,
ranking, or semantic consolidation. A memory layer built on top supplies that.
See [Agent memory](/reference/agent-memory/).

## What does an agent actually see?

An ordinary directory. orlop mounts over **FUSE on Linux** or an in-process
**NFSv3 loopback on macOS**, so existing tools read and write files normally.

## Why is it written in both Go and Rust?

The **mount client is Rust** because it runs inside the untrusted sandbox on the
hot path of every filesystem syscall — no GC pauses, small static binary, mature
FUSE/NFS/QUIC ecosystem. The **control and data planes are Go** because they are
network services where Go's ecosystem and velocity shine. The two halves share
only a wire protocol, so contributing to one rarely needs the other's toolchain.

## How do writes and re-reads stay fast over a WAN?

Writes are incremental: a single-byte edit ships **one ~4 MiB chunk**, not the
whole file. A persistent client cache makes re-reads run at **local-disk speed**.
Versioned, compare-and-swap manifests let a writer atomically replace a value in
place.

## Is it production-ready?

orlop is pre-1.0 and under active development. Read
[SECURITY.md](https://github.com/liu1700/orlop/blob/main/SECURITY.md) — covering
the isolation model, operator responsibilities, and known limits — before running
it with real tenants.

## How do I try it?

Follow the [Quickstart (single node)](/reference/standalone-quickstart/): a
complete stack — control plane, data-plane server, and one mounted disk — runs on
one host. The control plane ships an embedded SQLite backend, so it needs **no
external dependencies at all**, not even a database server.

## Do I need Postgres?

Not for a single node. The control plane can run on an embedded, pure-Go
**SQLite** backend (`DATABASE_URL=sqlite:./orlop.db`) — ideal for local dev, CI,
and self-hosting. Reach for **Postgres** when you run more than one control-plane
replica, or need real write concurrency and managed backups. See
[Database backends](/reference/database-backends/) for the full comparison.

## Where does the name come from?

In a ship, the *orlop* is the lowest deck — the layer everything else rests on.
That is the role orlop plays for an agent stack: the storage layer underneath.
