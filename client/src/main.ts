import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";

const target = document.getElementById("app");
if (target !== null) {
  mount(App, { target });
}
