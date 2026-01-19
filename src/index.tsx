/* @refresh reload */
import { Buffer } from "buffer";
import { render } from "solid-js/web";
import "./index.css";
import App from "./App.tsx";
import { WebContainerTest } from "./components/WebContainerTest";

// Polyfill Buffer for isomorphic-git
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

const root = document.getElementById("root");

// Show test component if ?test=webcontainer is in URL
const urlParams = new URLSearchParams(window.location.search);
const testMode = urlParams.get("test");

if (testMode === "webcontainer") {
  render(() => <WebContainerTest />, root!);
} else {
  render(() => <App />, root!);
}
