# Fenghuang

A long-term memory layer designed for [vicissitude](https://github.com/ojii3/vicissitude).

Inspired by [plast-mem](https://github.com/moeru-ai/plast-mem). Built with Bun + TypeScript.

## Overview

Fenghuang provides cognitive-science-inspired memory for AI assistants:

- **Episodic Memory** — conversation segments with FSRS-based decay
- **Semantic Memory** — persistent facts extracted from episodes
- **Event Segmentation** — automatic conversation splitting via LLM
- **Hybrid Retrieval** — text search + vector similarity + FSRS reranking

## Architecture

Hexagonal Architecture (Ports & Adapters) — Core has zero external dependencies.

```
Core Domain (Segmenter, EpisodicMemory, FSRS, Consolidation, Retrieval)
       │                    │
    LLMPort            StoragePort
       │                    │
   Adapters             Adapters
   (Vercel AI)          (SQLite, in-memory)
```

## Usage

```typescript
import { createFenghuang } from "fenghuang";

const mem = createFenghuang({
	llm: yourLLMAdapter,
	storage: yourStorageAdapter,
});
```

## Development

Requires [Bun](https://bun.sh/) (provided via Nix flake).

```sh
bun install
bun test
```

## Documentation

- [SPEC.md](docs/SPEC.md) — Specification
- [PLAN.md](docs/PLAN.md) — Milestones & risks
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Design
- [RUNBOOK.md](docs/RUNBOOK.md) — Operations
- [STATUS.md](docs/STATUS.md) — Current status

## License

MIT
