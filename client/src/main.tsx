import { render } from "solid-js/web";
import { parseAppHash } from "../../client-shared/src/contracts/navigation";
import type { ScreenRouteState } from "../../client-shared/src/contracts/navigation";
import type { SolidAppBootstrapOptions } from "./app/types";
import { createSolidBootstrapState } from "./app/bootstrap-state";
import { App } from "./App";
import "./app.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Solid app root element was not found");
}

const parsedRoute = parseAppHash(window.location.hash);
const initialRoute: ScreenRouteState = {
  ...parsedRoute,
  contextId: null,
  selectedPath: null,
};

const bootstrapOptions: SolidAppBootstrapOptions = {
  initialRoute,
  apiBaseUrl: "/api",
};

const bootstrapState = createSolidBootstrapState(
  bootstrapOptions.initialRoute,
  bootstrapOptions.apiBaseUrl,
);

render(() => <App bootstrapState={bootstrapState} />, rootElement);
