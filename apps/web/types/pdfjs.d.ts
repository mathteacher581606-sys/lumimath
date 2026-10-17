declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  export class WorkerMessageHandler {
    constructor();
  }
}

declare module '@toast-ui/react-image-editor' {
  import * as React from 'react';
  const ImageEditor: React.ComponentType<any>;
  export default ImageEditor;
}

declare module 'tui-image-editor' {
  const ImageEditor: any;
  export default ImageEditor;
}
