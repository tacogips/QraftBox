/**
 * aynd - Main entry point
 *
 * All You Need Is Diff
 */

import { greet } from "./lib";

function main(): void {
  const message = greet("World");
  console.log(message);
}

main();
