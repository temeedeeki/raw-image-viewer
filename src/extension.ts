import * as path from "node:path";
import * as vscode from "vscode";

import {
  inferDataType,
  inferDataTypeFromDimensions,
  inferDimensions,
  RAW_DATA_TYPE_INFO,
} from "./shared/raw";
import { getWebviewHtml } from "./webview/html";
import type { RawEditorState } from "./shared/raw";

const VIEW_TYPE = "raw-image-viewer.rawImage";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new RawImageEditorProvider(context),
    ),
  );
}

export function deactivate() {}

class RawImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri) {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
      ],
    };

    const stackData = await this.loadRawData(document.uri);
    const fileName = path.basename(document.uri.fsPath || document.uri.path);
    const parentDirectoryName = path.basename(
      path.dirname(document.uri.fsPath || document.uri.path),
    );
    const initialState = this.getInitialState(
      fileName,
      stackData.byteLength,
      parentDirectoryName,
      stackData.sliceCount,
      stackData.initialSliceIndex,
    );
    const fileDataBase64 = Buffer.from(stackData.buffer).toString("base64");

    webviewPanel.webview.html = getWebviewHtml({
      extensionUri: this.context.extensionUri,
      initialState,
      fileDataBase64,
      webview: webviewPanel.webview,
    });
  }

  private getInitialState(
    fileName: string,
    byteLength: number,
    parentDirectoryName?: string,
    sliceCount = 1,
    initialSliceIndex = 0,
  ): RawEditorState {
    const inferredDataType = inferDataType(fileName, parentDirectoryName);
    const dimensions = inferDimensions(
      fileName,
      Math.floor(byteLength / Math.max(1, sliceCount)),
      parentDirectoryName,
    );
    const depth =
      sliceCount > 1 && dimensions.width !== null && dimensions.height !== null
        ? sliceCount
        : dimensions.depth;
    const dataType =
      inferredDataType ??
      inferDataTypeFromDimensions(
        dimensions.width,
        dimensions.height,
        depth,
        byteLength,
      );

    return {
      fileName:
        sliceCount > 1 ? `${fileName} (${sliceCount} files stacked)` : fileName,
      width: dimensions.width,
      height: dimensions.height,
      depth,
      sliceIndex: initialSliceIndex,
      dataType,
      zoom: 1,
    };
  }

  private async loadRawData(uri: vscode.Uri) {
    const singleFileData = await vscode.workspace.fs.readFile(uri);
    const numericStemMatch = path
      .basename(uri.path, path.extname(uri.path))
      .match(/^\d+$/);
    if (!numericStemMatch) {
      return {
        buffer: singleFileData,
        byteLength: singleFileData.byteLength,
        sliceCount: 1,
        initialSliceIndex: 0,
      };
    }

    const directoryUri = vscode.Uri.joinPath(uri, "..");
    const siblings = await vscode.workspace.fs.readDirectory(directoryUri);
    const extension = path.extname(uri.path).toLowerCase();
    const numericSiblings = siblings
      .filter(([name, type]) => {
        return (
          type === vscode.FileType.File &&
          path.extname(name).toLowerCase() === extension &&
          /^\d+$/.test(path.basename(name, extension))
        );
      })
      .map(([name]) => ({
        name,
        index: Number.parseInt(path.basename(name, extension), 10),
      }))
      .sort((left, right) => left.index - right.index);

    if (numericSiblings.length <= 1) {
      return {
        buffer: singleFileData,
        byteLength: singleFileData.byteLength,
        sliceCount: 1,
        initialSliceIndex: 0,
      };
    }

    const currentName = path.basename(uri.path);
    const currentPosition = numericSiblings.findIndex(
      (entry) => entry.name === currentName,
    );
    if (currentPosition === -1) {
      return {
        buffer: singleFileData,
        byteLength: singleFileData.byteLength,
        sliceCount: 1,
        initialSliceIndex: 0,
      };
    }

    const contiguousStack = this.collectContiguousSequence(
      numericSiblings,
      currentPosition,
    );
    if (contiguousStack.length <= 1) {
      return {
        buffer: singleFileData,
        byteLength: singleFileData.byteLength,
        sliceCount: 1,
        initialSliceIndex: 0,
      };
    }

    const buffers: Uint8Array[] = [];
    const initialSliceIndex = contiguousStack.findIndex(
      (entry) => entry.name === currentName,
    );
    for (const entry of contiguousStack) {
      const entryUri = vscode.Uri.joinPath(directoryUri, entry.name);
      const entryData = await vscode.workspace.fs.readFile(entryUri);
      if (entryData.byteLength !== singleFileData.byteLength) {
        return {
          buffer: singleFileData,
          byteLength: singleFileData.byteLength,
          sliceCount: 1,
          initialSliceIndex: 0,
        };
      }
      buffers.push(entryData);
    }

    const combined = new Uint8Array(singleFileData.byteLength * buffers.length);
    let offset = 0;
    for (const buffer of buffers) {
      combined.set(buffer, offset);
      offset += buffer.byteLength;
    }

    return {
      buffer: combined,
      byteLength: combined.byteLength,
      sliceCount: buffers.length,
      initialSliceIndex: Math.max(0, initialSliceIndex),
    };
  }

  private collectContiguousSequence(
    entries: Array<{ name: string; index: number }>,
    currentPosition: number,
  ) {
    let start = currentPosition;
    let end = currentPosition;

    while (start > 0 && entries[start - 1].index === entries[start].index - 1) {
      start -= 1;
    }

    while (
      end < entries.length - 1 &&
      entries[end + 1].index === entries[end].index + 1
    ) {
      end += 1;
    }

    return entries.slice(start, end + 1);
  }
}
