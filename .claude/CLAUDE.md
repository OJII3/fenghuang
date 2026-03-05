# Fenghuang

A long-term memory layer designed for [vicissitude](https://github.com/ojii3/vicissitude).

Inspired by [plast-mem](https://github.com/moeru-ai/plast-mem). Built with Bun + TypeScript. Currently, only opencode is supported as an llm backend.

## Documentation

- docs/SPEC.md: Specification of the memory system.
- docs/PLAN.md: Milestone plan and risk register.
- docs/ARCHITECTURE.md: Layer design, data flow, major sequences and configuration.
- docs/RUNBOOK.md: Instructions for running, using, updating and repairing the system.
- docs/STATUS.md: Current status and progress updates. Known issues, recent tasks and handovers.

## Commands

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `bun test`     | Run tests                            |
| `bun build`    | Build                                |
| `nr lint`      | Run oxlint                           |
| `nr lint:fix`  | Run oxlint with auto-fix             |
| `nr fmt`       | Format with oxfmt                    |
| `nr fmt:check` | Check formatting (CI)                |
| `nr check`     | Run oxlint + oxfmt + tsc --noEmit    |

## Architecture Overview: Hexagonal Architecture (Ports & Adapters)

For more details, see docs/ARCHITECTURE.md

### Layer Design

```
┌─────────────────────────────────────────────┐
│                  Core Domain                 │
│                                              │
│  Segmenter → EpisodicMemory → FSRS          │
│              ConsolidationPipeline           │
│              SemanticMemory                  │
│              Retrieval                       │
│                                              │
│  依存するのは Port（interface）だけ          │
└──────────┬──────────────────┬───────────────┘
           │                  │
      LLMPort             StoragePort
      (interface)         (interface)
           │                  │
    ┌──────┴──────┐    ┌──────┴──────┐
    │  Adapters   │    │  Adapters   │
    ├─────────────┤    ├─────────────┤
    │ opencode    │    │ SQLite      │
    │ (Vercel AI) │    │ (Postgres)  │
    │ (Anthropic) │    │ in-memory   │
    └─────────────┘    └─────────────┘
```

### Directory Structure

```
src/
├── core/           # Core Domain (no external deps)
│   ├── domain/     # Entities (Episode, SemanticFact, FSRSCard)
│   ├── segmenter   # Event segmentation
│   ├── episodic    # Episodic memory service
│   ├── consolidation # Semantic consolidation pipeline
│   └── retrieval   # Memory retrieval service
├── ports/          # Interface definitions (LLMPort, StoragePort)
├── adapters/       # External dependencies
│   ├── llm/        # opencode, (vercel-ai), (anthropic)
│   └── storage/    # sqlite, in-memory
└── index.ts        # Public API + DI
```

### Dependency Rules

- Core MUST NOT import any external packages
- Core depends only on Port interfaces (src/ports/)
- Adapters implement Port interfaces and contain all external dependencies
- Assembly (DI) happens in index.ts — the caller decides which adapters to use
