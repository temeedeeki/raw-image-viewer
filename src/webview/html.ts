import * as vscode from "vscode";

import { RAW_DATA_TYPE_INFO } from "../shared/raw";
import type { RawEditorState } from "../shared/raw";

type WebviewHtmlParams = {
  extensionUri: vscode.Uri;
  initialState: RawEditorState;
  fileDataBase64: string;
  webview: vscode.Webview;
};

type BootstrapPayload = {
  initialState: RawEditorState;
  fileDataBase64: string;
};

export function getWebviewHtml({
  extensionUri,
  initialState,
  fileDataBase64,
  webview,
}: WebviewHtmlParams): string {
  const nonce = String(Date.now()) + String(Math.random()).slice(2);
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "app.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "app.css"),
  );

  const bootstrapData: BootstrapPayload = { initialState, fileDataBase64 };
  const dataTypeOptions = Object.entries(RAW_DATA_TYPE_INFO)
    .map(
      ([value, info]) =>
        `<li data-value="${value}">${escapeHtml(info.label)}</li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>RAW Image Viewer</title>
</head>
<body>
  <form class="toolbar" id="controls">
    <div class="group">
      <label for="width">Width</label>
      <input id="width" type="number" min="1" step="1" value="${toInputValue(initialState.width)}">
    </div>
    <div class="group">
      <label for="height">Height</label>
      <input id="height" type="number" min="1" step="1" value="${toInputValue(initialState.height)}">
    </div>
    <div class="group">
      <label for="depth">Depth</label>
      <input id="depth" type="number" min="1" step="1" value="${toInputValue(initialState.depth)}">
    </div>
    <div class="group">
      <label for="dataType">Data type</label>
      <div class="custom-select">
        <button type="button" class="select-toggle" id="selectToggle">${getDataTypeLabel(initialState)}</button>
        <ul class="select-options" id="selectOptions" hidden>
          ${dataTypeOptions}
        </ul>
      </div>
    </div>
    <div class="group zoom-group">
      <label for="zoom">Zoom <span id="zoomValue"></span></label>
      <input id="zoom" type="range" min="0.25" max="16" step="0.25" value="${initialState.zoom}">
    </div>
  </form>

  <div class="meta">
    <span id="fileName">${escapeHtml(initialState.fileName)}</span>
    <span id="dataInfo"></span>
    <span id="warning" class="warning"></span>
    <span id="notice" class="notice"></span>
  </div>

  <div class="viewer">
    <div class="viewer-layout">
      <div class="viewer-main">
        <div class="canvas-wrap">
          <canvas id="canvas" width="128" height="128"></canvas>
        </div>
        <div class="below-controls">
          <input id="slice" type="range" min="0" step="1">
          <div class="range-controls">
            <div class="range-actions">
              <button type="button" class="action-button" id="resetRangeButton">Reset Range</button>
            </div>
            <div class="range-row">
              <label for="minVal">Min</label>
              <input id="minVal" type="number" step="any">
              <input id="minRange" type="range" step="0.01">
            </div>
            <div class="range-row">
              <label for="maxVal">Max</label>
              <input id="maxVal" type="number" step="any">
              <input id="maxRange" type="range" step="0.01">
            </div>
          </div>
        </div>
        <aside class="stats-panel" aria-label="Statistics">
          <div class="stats-topbar">
            <div class="stats-header">Statistics</div>
            <button type="button" class="action-button" id="savePngButton">Save PNG</button>
          </div>
          <div class="stats-note">Slice value (overall)</div>
          <div class="stats-grid">
            <span class="stats-label">Area</span>
            <span class="stats-value" id="statsArea">-</span>
            <span class="stats-label">Mean</span>
            <span class="stats-value" id="statsMean">-</span>
            <span class="stats-label">Min</span>
            <span class="stats-value" id="statsMin">-</span>
            <span class="stats-label">Max</span>
            <span class="stats-value" id="statsMax">-</span>
            <span class="stats-label">Sum</span>
            <span class="stats-value" id="statsSum">-</span>
          </div>
        </aside>
      </div>
    </div>
  </div>

  <script id="bootstrap" type="application/json">${serializeForHtml(bootstrapData)}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function toInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function getDataTypeLabel(state: RawEditorState) {
  return state.dataType === null
    ? "Select data type"
    : RAW_DATA_TYPE_INFO[state.dataType].label;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForHtml(value: BootstrapPayload) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
