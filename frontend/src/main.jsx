import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SandboxApp from "./SandboxApp";
import "./styles.css";

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown render error" };
  }

  componentDidCatch(error, info) {
    // Keep details in console for quick debugging in browser devtools.
    // eslint-disable-next-line no-console
    console.error("Root render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
          <h2 style={{ marginBottom: "8px" }}>UI failed to render</h2>
          <p style={{ marginBottom: "12px" }}>
            The app hit a runtime error. Hard refresh once and try again.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "12px", borderRadius: "6px" }}>
            {this.state.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Entry point: render normal storefront (App) or sandbox (SandboxApp) based on URL.
 * Sandbox is used when the backend redirects high-risk/bot sessions (e.g. ?sandbox=true&reason=...).
 */
const urlParams = new URLSearchParams(window.location.search);
const isSandbox =
  urlParams.has("sandbox") ||
  urlParams.get("sandbox") === "true" ||
  window.location.pathname.includes("/sandbox") ||
  window.location.hostname.includes("sandbox") ||
  urlParams.has("reason");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      {isSandbox ? <SandboxApp /> : <App />}
    </RootErrorBoundary>
  </React.StrictMode>,
);

