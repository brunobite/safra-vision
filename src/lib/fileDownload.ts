export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function saveAsTextFile(fileName: string, content: string, mimeType = "text/plain;charset=utf-8") {
  downloadBlob(fileName, new Blob([content], { type: mimeType }));
}

export function saveAsJsonFile(fileName: string, payload: unknown) {
  saveAsTextFile(fileName, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}
