---
name: ts-coding-standards
description: Use when writing, reviewing, or refactoring TypeScript code. Provides type safety patterns, error handling, project layout, and async programming guidelines.
allowed-tools: Read, Grep, Glob
---

# TypeScript Coding Standards

This skill provides modern TypeScript coding guidelines and best practices for this project.

## When to Apply

Apply these standards when:
- Writing new TypeScript code
- Reviewing or refactoring existing TypeScript code
- Designing module APIs and interfaces
- Implementing error handling strategies

## Core Principles

1. **Type Safety Over Convenience** - Never sacrifice type safety for shorter code
2. **Explicit Over Implicit** - Make types and intentions clear
3. **Simple Over Clever** - Prefer readable code over clever abstractions
4. **Fail Fast** - Catch errors at compile time, not runtime

## Quick Reference

### Must-Use Patterns

| Pattern | Use Case |
|---------|----------|
| Discriminated Unions | State machines, API responses, Result types |
| Branded Types | IDs, emails, validated strings |
| `readonly` | Data that should not mutate |
| `unknown` in catch | Safe error handling |
| Explicit undefined checks | Array/object indexed access |

### Must-Avoid Anti-Patterns

| Anti-Pattern | Alternative |
|--------------|-------------|
| `any` type | `unknown` with type guards |
| Throwing exceptions for control flow | Result type pattern |
| Optional chaining without null check | Explicit narrowing |
| Deep folder nesting (>3 levels) | Flat, feature-based structure |
| Implicit `undefined` in optional props | Explicit `T \| undefined` |
| Ambiguous variable names (`store`, `id`, `data`) | Self-descriptive names (`sessionStore`, `sessionId`, `userData`) |
| Single-character lambda params (`x => x.name`) | Descriptive params (`session => session.name`) |

## Naming Conventions: Self-Descriptive Variable Names

**RULE**: All variable, parameter, and property names MUST be self-descriptive. Avoid short, ambiguous names that require surrounding context to understand. Code should read like prose -- a reader should understand what a variable holds without looking at its declaration or surrounding code.

### Prohibited Patterns

```typescript
// BAD - ambiguous, requires context to understand
store.get(id);
const res = await fetch(url);
const val = map.get(key);
items.filter(x => x.active);
data.forEach(d => process(d));
const cb = () => { /* ... */ };

// GOOD - self-descriptive, intention is immediately clear
sessionStore.get(sessionId);
const apiResponse = await fetch(endpointUrl);
const configValue = configMap.get(configKey);
sessions.filter(session => session.active);
diffEntries.forEach(diffEntry => processDiffEntry(diffEntry));
const onSessionExpired = () => { /* ... */ };
```

### Single-Character Variables Are Prohibited

Even in lambda expressions, arrow functions, and short callbacks, single-character variable names (`x`, `e`, `d`, `v`, `i`, `k`) are prohibited. Use descriptive names that convey what the value represents.

```typescript
// BAD - single-character params hide meaning
users.map(u => u.name);
entries.filter(e => e.isValid);
Object.entries(obj).forEach(([k, v]) => console.log(k, v));
for (let i = 0; i < items.length; i++) { /* ... */ }

// GOOD - descriptive params
users.map(user => user.name);
entries.filter(entry => entry.isValid);
Object.entries(configMap).forEach(([configKey, configValue]) => console.log(configKey, configValue));
for (let itemIndex = 0; itemIndex < items.length; itemIndex++) { /* ... */ }
```

### General Guidelines

1. **Variable names should describe WHAT, not HOW**: `sessionStore` (what it stores) over `store` (generic)
2. **Parameters should describe the domain concept**: `sessionId` over `id`, `filePath` over `path`
3. **Collections should hint at their contents**: `sessions` over `items`, `diffEntries` over `data`
4. **Callbacks should describe their trigger**: `onSessionExpired` over `cb`, `handleFileChange` over `fn`

## Detailed Guidelines

For comprehensive guidance, see:
- [Error Handling Patterns](./error-handling.md) - Result types, discriminated unions, neverthrow
- [Type Safety Best Practices](./type-safety.md) - Branded types, strict config, type guards
- [Project Layout Conventions](./project-layout.md) - Directory structure, file naming, imports
- [Async Programming Patterns](./async-patterns.md) - Promise handling, concurrent execution
- [Security Guidelines](./security.md) - Credential protection, path sanitization, sensitive data handling

## tsconfig.json Strict Mode

This project uses maximum TypeScript strictness. Ensure your code compiles with:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## References

- [TypeScript Advanced Patterns 2025](https://dev.to/frontendtoolstech/typescript-advanced-patterns-writing-cleaner-safer-code-in-2025-4gbn)
- [The Strictest TypeScript Config](https://whatislove.dev/articles/the-strictest-typescript-config/)
- [neverthrow - Type-Safe Errors](https://github.com/supermacro/neverthrow)
