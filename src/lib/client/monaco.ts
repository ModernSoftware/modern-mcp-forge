import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

import * as monaco from 'monaco-editor';

type MonacoEnvironmentShape = {
  getWorker: (_workerId: string, label: string) => Worker;
};

const globalScope = self as typeof self & {
  MonacoEnvironment?: MonacoEnvironmentShape;
};

globalScope.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'typescript' || label === 'javascript') {
      return new TypeScriptWorker();
    }

    return new EditorWorker();
  }
};

export { monaco };
