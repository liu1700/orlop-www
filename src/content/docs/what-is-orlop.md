---
title: What is orlop?
description: orlop is a zero-trust file plane that gives each untrusted AI agent its own durable, per-tenant POSIX disk — persistent storage for agent sandboxes with no shared storage credential.
---

**orlop is a multi-tenant, zero-trust file plane for agent sandboxes.** It gives
each untrusted AI agent its own durable, auto-expanding POSIX directory that the
agent mounts over FUSE and uses like an ordinary disk. The bytes live remotely in
a content-addressed chunk store, so the data outlives the sandbox and the next
run for the same agent re-mounts the same disk with zero idle compute.

## The problem it solves

AI agents run in ephemeral, untrusted sandboxes. They need a place to keep
working state — scratch files, tool outputs, datasets, and the raw transcripts a
memory layer later indexes — that is **durable**, **cheap to update**, and **safe
under multi-tenancy**. The usual options force a bad trade:

- A local disk in the sandbox is fast but **dies with the process**.
- A network filesystem or object bucket survives, but handing the agent a
  storage credential means **one compromised agent can read or destroy every
  other tenant's data**.

orlop removes the trade-off: persistent, POSIX-shaped storage where the agent
holds **no credential that could reach the store directly**.

## How the zero-trust model works

The property that separates orlop from "wrap a network filesystem in a CLI" is
that **the agent never sees a storage credential**:

- Each agent is issued its own **short-lived mTLS client certificate** whose
  identity (a SPIFFE SAN) is the only thing that authorizes access.
- The data-plane server **confines every connection to that agent's own path
  prefix**, server-side.
- A compromised agent therefore **cannot read another tenant's bytes, cannot
  widen its own path, and has no key it could exfiltrate** to reach the store.

## Architecture at a glance

orlop is three pieces joined only by a wire protocol (mTLS + QUIC + msgpack):

| Component | Language | Role |
| --- | --- | --- |
| `orlop-control` | Go | Control plane: CA, auth, disk allocation, enroll, lease issuance |
| `orlop-server` | Go | Data plane: content-addressed chunk store, manifests, GC, mTLS |
| `orlop` | Rust | Mount client that runs inside the sandbox (FUSE/NFS) |

The mount client is **Rust** because it sits on the hot path of every filesystem
syscall inside the untrusted sandbox — no GC pauses, a small static binary, and a
mature FUSE/NFS/QUIC ecosystem. The control and data planes are **Go** because
they are network services where Go's velocity and ecosystem shine.

## Where orlop fits in an agent-memory stack

orlop is the **substrate, not the memory system**. It stores bytes durably,
deduplicates them by content hash, and isolates tenants — but it does no
extraction, ranking, or semantic consolidation. A memory layer built on top gets
durable storage that survives the sandbox, keeps the full raw trace cheaply, and
can atomically overwrite a stale fact in place. See
[Agent memory](/reference/agent-memory/) for the full picture.

## Next steps

- [Quickstart (single node)](/reference/standalone-quickstart/) — run the whole
  stack on one host.
- [FAQ](/faq/) — common questions answered.
- [Design overview](/reference/design/) — system overview and filesystem layout.
