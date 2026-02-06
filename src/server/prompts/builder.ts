/**
 * Prompt Builder
 *
 * Builds prompts with Handlebars-style variable substitution.
 * Supports {{variable}}, {{#each items}}...{{/each}}, and {{#if condition}}...{{/if}}.
 */

/**
 * Validation result for variable checking
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly missingVariables: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Build prompt from template with variable substitution
 *
 * Supports:
 * - Simple variables: {{variable}}
 * - Iteration: {{#each items}}...{{/each}}
 * - Conditionals: {{#if condition}}...{{/if}}
 *
 * @param template - Template string with Handlebars-style syntax
 * @param variables - Variables to substitute
 * @returns Rendered prompt string
 */
export function buildPrompt(
  template: string,
  variables: Record<string, unknown>,
): string {
  let result = template;

  // Process {{#each}} blocks first
  result = processEachBlocks(result, variables);

  // Process {{#if}} blocks
  result = processIfBlocks(result, variables);

  // Process simple {{variable}} substitutions
  result = processSimpleVariables(result, variables);

  return result;
}

/**
 * Process {{#each items}}...{{/each}} blocks
 */
function processEachBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  const eachPattern = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return template.replace(
    eachPattern,
    (_match, varName: string, content: string) => {
      const value = variables[varName];

      // If variable is undefined or not an array, return empty string
      if (value === undefined || value === null) {
        return "";
      }

      if (!Array.isArray(value)) {
        return "";
      }

      // Render the content for each item
      return value
        .map((item, index) => {
          // Support item properties: {{path}}, {{status}}, etc.
          let itemContent = content;

          // Handle nested properties
          if (typeof item === "object" && item !== null) {
            const itemObj = item as Record<string, unknown>;
            for (const key of Object.keys(itemObj)) {
              const propValue = itemObj[key];
              const propStr = propValue !== undefined ? String(propValue) : "";
              itemContent = itemContent.replace(
                new RegExp(`\\{\\{${key}\\}\\}`, "g"),
                propStr,
              );
            }
          } else {
            // For primitive items, use {{.}} syntax
            itemContent = itemContent.replace(/\{\{\.\}\}/g, String(item));
          }

          // Support {{@index}} for current index
          itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));

          return itemContent;
        })
        .join("");
    },
  );
}

/**
 * Process {{#if condition}}...{{/if}} blocks
 */
function processIfBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  const ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return template.replace(
    ifPattern,
    (_match, varName: string, content: string) => {
      const value = variables[varName];

      // Truthy check: undefined, null, false, 0, empty string, empty array = falsy
      const isTruthy = (() => {
        if (value === undefined || value === null || value === false) {
          return false;
        }
        if (typeof value === "string" && value.length === 0) {
          return false;
        }
        if (typeof value === "number" && value === 0) {
          return false;
        }
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        return true;
      })();

      return isTruthy ? content : "";
    },
  );
}

/**
 * Process simple {{variable}} substitutions
 */
function processSimpleVariables(
  template: string,
  variables: Record<string, unknown>,
): string {
  const simplePattern = /\{\{(\w+)\}\}/g;

  return template.replace(simplePattern, (_match, varName: string) => {
    const value = variables[varName];

    // Handle undefined gracefully
    if (value === undefined || value === null) {
      return "";
    }

    // Convert to string
    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    // For arrays and objects, return JSON representation
    if (Array.isArray(value) || typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  });
}

/**
 * Extract all variable names from template
 *
 * Returns unique list of variable names found in the template,
 * including those in {{variable}}, {{#each}}, and {{#if}} blocks.
 *
 * @param template - Template string to analyze
 * @returns Array of unique variable names
 */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();

  // Extract from simple {{variable}}
  const simplePattern = /\{\{(\w+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = simplePattern.exec(template)) !== null) {
    const varName = match[1];
    if (varName !== undefined) {
      // Exclude special variables like @index
      if (!varName.startsWith("@")) {
        variables.add(varName);
      }
    }
  }

  // Extract from {{#each varName}}
  const eachPattern = /\{\{#each\s+(\w+)\}\}/g;
  while ((match = eachPattern.exec(template)) !== null) {
    const varName = match[1];
    if (varName !== undefined) {
      variables.add(varName);
    }
  }

  // Extract from {{#if varName}}
  const ifPattern = /\{\{#if\s+(\w+)\}\}/g;
  while ((match = ifPattern.exec(template)) !== null) {
    const varName = match[1];
    if (varName !== undefined) {
      variables.add(varName);
    }
  }

  return Array.from(variables).sort();
}

/**
 * Validate that all required variables are provided
 *
 * Checks if all variables used in the template are present in the
 * provided variables object. Variables used only within {{#each}} block content
 * (not the array variable itself) are not required at the top level.
 *
 * @param template - Template string
 * @param variables - Variables to validate
 * @returns Validation result with missing variables
 */
export function validateVariables(
  template: string,
  variables: Record<string, unknown>,
): ValidationResult {
  const allVars = new Set(extractVariables(template));
  const eachBlockIterationVars = new Set<string>();

  // Identify variables used inside {{#each}} blocks (iteration context vars)
  // These are properties of the items being iterated, not top-level vars
  const eachPattern = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = eachPattern.exec(template)) !== null) {
    const eachContent = match[2];

    if (eachContent !== undefined) {
      const innerPattern = /\{\{(\w+)\}\}/g;
      let innerMatch: RegExpExecArray | null;

      while ((innerMatch = innerPattern.exec(eachContent)) !== null) {
        const innerVar = innerMatch[1];
        if (innerVar !== undefined && !innerVar.startsWith("@")) {
          eachBlockIterationVars.add(innerVar);
        }
      }
    }
  }

  const providedVars = Object.keys(variables);
  const missingVars: string[] = [];
  const errors: string[] = [];

  // Check for missing variables
  for (const varName of allVars) {
    // Skip variables that are only used as iteration properties inside {{#each}} blocks
    // and are not used elsewhere in the template
    if (
      eachBlockIterationVars.has(varName) &&
      !isUsedOutsideEachBlockContent(template, varName)
    ) {
      continue;
    }

    if (!providedVars.includes(varName)) {
      missingVars.push(varName);
      errors.push(`Missing required variable: ${varName}`);
    }
  }

  const valid = missingVars.length === 0 && errors.length === 0;

  return {
    valid,
    missingVariables: missingVars,
    errors,
  };
}

/**
 * Check if a variable is used outside of {{#each}} block content
 * (but {{#each varName}} itself counts as "outside")
 */
function isUsedOutsideEachBlockContent(
  template: string,
  varName: string,
): boolean {
  // First check if it's used in {{#each varName}} itself
  const eachVarPattern = new RegExp(`\\{\\{#each\\s+${varName}\\}\\}`, "g");
  if (eachVarPattern.test(template)) {
    return true;
  }

  // Check if it's used in {{#if varName}}
  const ifVarPattern = new RegExp(`\\{\\{#if\\s+${varName}\\}\\}`, "g");
  if (ifVarPattern.test(template)) {
    return true;
  }

  // Check if it's used as a simple variable outside of any {{#each}} blocks
  // Remove all {{#each}} block content (but keep the opening tags)
  const templateWithoutEachContent = template.replace(
    /\{\{#each\s+\w+\}\}[\s\S]*?\{\{\/each\}\}/g,
    "",
  );

  const simpleVarPattern = new RegExp(`\\{\\{${varName}\\}\\}`, "g");
  return simpleVarPattern.test(templateWithoutEachContent);
}
