// GLTFExporter expects a browser FileReader; Node 22 has Blob but not FileReader.
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend && this.onloadend(); }); }
};
