# Architecture Design

This document describes system architecture and design decisions.

## Overview

Architectural patterns, system structure, and technical decisions.

---

## Sections

### aynd (All You Need Is Diff)

A high-performance local diff viewer with git-xnotes integration.

**Detailed Design**: See [design-local-diff-viewer.md](./design-local-diff-viewer.md)

**Key Features**:
- Local branch/commit diff viewing (no GitHub required)
- git-xnotes integration for persistent commit comments
- Dual view modes: GitHub-style diff + Current State View
- High-performance Svelte 5 + virtualization architecture

**Technology Stack**:
- Runtime: Bun
- Frontend: Svelte 5
- Server: Hono
- Syntax Highlighting: Shiki
- Virtualization: svelte-tiny-virtual-list

---
