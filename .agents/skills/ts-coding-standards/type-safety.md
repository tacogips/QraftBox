# Type Safety Best Practices

This guide covers modern TypeScript type safety patterns that leverage the strictest compiler settings.

## Strict Compiler Options

These options are mandatory for this project:

### `noUncheckedIndexedAccess`

Array and object indexed access may return `undefined`:

```typescript
const items = ['a', 'b', 'c'];

// BAD - assumes index exists
const first = items[0]; // Type: string | undefined (not just string)
console.log(first.toUpperCase()); // Error: possibly undefined

// GOOD - check before use
const first = items[0];
if (first !== undefined) {
  console.log(first.toUpperCase()); // Safe
}

// GOOD - use at() with nullish coalescing
const first = items.at(0) ?? 'default';
```

### `exactOptionalPropertyTypes`

Optional properties cannot be assigned `undefined` explicitly:

```typescript
interface Config {
  name: string;
  timeout?: number; // Optional, but NOT number | undefined
}

// BAD - explicit undefined not allowed
const config: Config = {
  name: 'test',
  timeout: undefined, // Error with exactOptionalPropertyTypes
};

// GOOD - omit the property
const config: Config = {
  name: 'test',
  // timeout is simply not present
};

// If you need explicit undefined, declare it:
interface ConfigWithUndefined {
  name: string;
  timeout?: number | undefined; // Now undefined is allowed
}
```

### `noPropertyAccessFromIndexSignature`

Forces bracket notation for index signature access:

```typescript
interface Dictionary {
  [key: string]: string;
  knownKey: string; // Known property
}

const dict: Dictionary = { knownKey: 'value' };

// BAD - dot notation hides the dynamic nature
const value = dict.unknownKey; // Error

// GOOD - bracket notation makes it explicit
const value = dict['unknownKey']; // OK, clearly dynamic access
const known = dict.knownKey; // OK, known property
```

## Branded Types

Prevent mixing up primitive values that represent different things:

```typescript
// Define branded types
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;
type Email = Brand<string, 'Email'>;

// Constructor functions
function createUserId(id: string): UserId {
  return id as UserId;
}

function createEmail(email: string): Email {
  if (!email.includes('@')) {
    throw new Error('Invalid email');
  }
  return email as Email;
}

// Usage - compiler prevents mixing
function getUser(id: UserId): User { /* ... */ }
function getOrder(id: OrderId): Order { /* ... */ }

const userId = createUserId('user-123');
const orderId = createUserId('order-456') as unknown as OrderId;

getUser(userId);  // OK
getUser(orderId); // Error: OrderId not assignable to UserId
```

## Mandatory: Branded Types for Domain Identifiers

**RULE**: All domain-specific string identifiers MUST use branded types. Raw `string` is prohibited for IDs, keys, and other values where type confusion could occur.

### When to Use Branded Types

Use a branded type whenever a `string` (or `number`) represents a specific domain concept that should not be interchangeable with other strings:

- Session IDs, request IDs, prompt IDs
- Entity identifiers (user IDs, order IDs, etc.)
- Worktree IDs, project identifiers
- API keys, tokens
- Any ID that is generated, looked up, or passed between components

### When NOT to Use Branded Types

- Free-form text: prompt content, messages, descriptions, error messages
- ISO timestamp strings (use `Date` or a date library instead where possible)
- File content strings
- Generic configuration values

### Adding New Branded Types

When adding a new domain identifier:

1. Define the branded type next to related types:
```typescript
export type MyEntityId = string & {
  readonly __brand: "MyEntityId";
};
```

2. Provide a generator function if the ID is created internally:
```typescript
export function generateMyEntityId(): MyEntityId {
  return `entity_${Date.now().toString(36)}` as MyEntityId;
}
```

3. Cast at system boundaries (URL params, JSON.parse, external APIs):
```typescript
const id = c.req.param("id") as MyEntityId;
const parsed = JSON.parse(content) as MyEntity; // id field is MyEntityId
```

4. Never cast within internal business logic -- let types flow from interfaces.

### Anti-Pattern: Raw String for IDs

```typescript
// BAD - raw string for a domain identifier
interface Session {
  id: string;
  claudeSessionId: string;
}
function getSession(id: string): Session { /* ... */ }

// GOOD - branded types prevent confusion
interface Session {
  id: QraftAiSessionId;
  claudeSessionId: ClaudeSessionId;
}
function getSession(id: QraftAiSessionId): Session { /* ... */ }
```

## Type Guards

Narrow types safely at runtime:

```typescript
// User-defined type guard
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Discriminated union type guard
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

// Usage
function processResult(result: Result<User, Error>): void {
  if (isOk(result)) {
    console.log(result.value.name); // Type narrowed to { ok: true; value: User }
  } else {
    console.error(result.error.message); // Type narrowed to { ok: false; error: Error }
  }
}

// Array type guard with filter
const items: (string | null)[] = ['a', null, 'b'];
const strings = items.filter((item): item is string => item !== null);
// strings is string[], not (string | null)[]
```

## Readonly and Immutability

Prevent accidental mutations:

```typescript
// Readonly properties
interface User {
  readonly id: string;
  readonly createdAt: Date;
  name: string; // Mutable
}

// Readonly arrays
function processItems(items: readonly string[]): void {
  items.push('new'); // Error: push does not exist on readonly string[]
}

// Deep readonly with utility type
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Readonly parameter with as const
const config = {
  api: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
  },
} as const;
// config.api.baseUrl = 'new'; // Error: readonly
```

## Discriminated Unions

Model state machines and complex types safely:

```typescript
// Request state machine
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function handleRequest<T>(state: RequestState<T>): string {
  switch (state.status) {
    case 'idle':
      return 'Ready to start';
    case 'loading':
      return 'Loading...';
    case 'success':
      return `Data: ${JSON.stringify(state.data)}`;
    case 'error':
      return `Error: ${state.error.message}`;
    default:
      // Exhaustiveness check
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${_exhaustive}`);
  }
}
```

## Template Literal Types

Create precise string types:

```typescript
// Event names
type EventName = `on${Capitalize<'click' | 'focus' | 'blur'>}`;
// 'onClick' | 'onFocus' | 'onBlur'

// Route paths
type ApiRoute = `/api/${string}`;
const route: ApiRoute = '/api/users'; // OK
const invalid: ApiRoute = '/users'; // Error

// CSS units
type CSSUnit = `${number}${'px' | 'rem' | 'em' | '%'}`;
const width: CSSUnit = '100px'; // OK
const invalid: CSSUnit = '100'; // Error
```

## Utility Types

Leverage built-in utility types:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

// Partial - all properties optional
type PartialUser = Partial<User>;

// Required - all properties required
type RequiredUser = Required<PartialUser>;

// Pick - select specific properties
type UserCredentials = Pick<User, 'email' | 'password'>;

// Omit - exclude specific properties
type PublicUser = Omit<User, 'password'>;

// Record - dictionary type
type UserMap = Record<string, User>;

// Extract/Exclude for union types
type StringOrNumber = string | number | boolean;
type OnlyStrings = Extract<StringOrNumber, string>; // string
type NoStrings = Exclude<StringOrNumber, string>; // number | boolean
```

## Self-Descriptive Naming

Variable names are part of type safety -- ambiguous names lead to misuse and bugs just as `any` does. All names MUST be self-descriptive so that a reader immediately understands what the variable holds.

### Variable and Parameter Names

```typescript
// BAD - ambiguous, could mean anything
const store = new Map();
store.get(id);
const res = await fetch(url);

// GOOD - self-descriptive
const sessionStore = new Map<QraftAiSessionId, AiSession>();
sessionStore.get(sessionId);
const diffResponse = await fetch(diffEndpointUrl);
```

### Lambda and Arrow Function Parameters

Single-character variable names are prohibited even in lambdas, callbacks, and short arrow functions. The name should describe the domain object being iterated.

```typescript
// BAD - single-character hides meaning
sessions.map(s => s.id);
files.filter(f => f.endsWith('.ts'));
entries.reduce((a, b) => a + b.size, 0);
Object.entries(map).forEach(([k, v]) => { /* ... */ });

// GOOD - descriptive names
sessions.map(session => session.id);
files.filter(filePath => filePath.endsWith('.ts'));
entries.reduce((totalSize, entry) => totalSize + entry.size, 0);
Object.entries(configMap).forEach(([configKey, configValue]) => { /* ... */ });
```

### Collections and Containers

Collection variable names should hint at their contents, not their data structure.

```typescript
// BAD - describes structure, not content
const list = getAll();
const map = new Map();
const items = fetchData();

// GOOD - describes content
const activeSessions = getAllSessions();
const worktreePathMap = new Map<WorktreeId, string>();
const pendingDiffEntries = fetchDiffEntries();
```

### Callbacks and Handlers

Callback names should describe their trigger or purpose.

```typescript
// BAD - opaque
const cb = () => cleanup();
const fn = (event) => { /* ... */ };

// GOOD - describes trigger
const onSessionExpired = () => cleanupExpiredSession();
const handleFileChange = (changeEvent: FileChangeEvent) => { /* ... */ };
```

## Anti-Patterns to Avoid

```typescript
// BAD: Using any
function process(data: any): void {
  data.foo.bar.baz(); // No type safety
}

// GOOD: Use unknown and narrow
function process(data: unknown): void {
  if (typeof data === 'object' && data !== null && 'foo' in data) {
    // Narrowed safely
  }
}

// BAD: Type assertion without validation
const user = JSON.parse(json) as User; // Unsafe

// GOOD: Validate at runtime
import { z } from 'zod';
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});
const user = UserSchema.parse(JSON.parse(json)); // Safe

// BAD: Ignoring null/undefined
const name = user.profile.name; // Could be undefined

// GOOD: Explicit handling
const name = user.profile?.name ?? 'Unknown';

// BAD: Non-exhaustive switch
function getLabel(status: 'active' | 'inactive' | 'pending'): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    // Missing 'pending' - no compile error without exhaustive check
  }
}

// GOOD: Exhaustive switch
function getLabel(status: 'active' | 'inactive' | 'pending'): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'pending':
      return 'Pending';
    default:
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
  }
}
```

## References

- [TypeScript Handbook - Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript Handbook - Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [Total TypeScript](https://www.totaltypescript.com/)
- [Type Challenges](https://github.com/type-challenges/type-challenges)
