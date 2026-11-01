import * as monaco from 'monaco-editor/editor.js';
import 'monaco-editor/features/bracketMatching/register.js';
import 'monaco-editor/features/clipboard/register.js';
import 'monaco-editor/features/codicon/register.js';
import 'monaco-editor/features/contextmenu/register.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/features/gotoLine/register.js';
import 'monaco-editor/features/smartSelect/register.js';
import 'monaco-editor/features/unicodeHighlighter/register.js';
import 'monaco-editor/features/wordHighlighter/register.js';
import 'monaco-editor/features/wordOperations/register.js';
import 'monaco-editor/languages/definitions/register.all.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
document.fonts.addEventListener('loadingdone', () => monaco.editor.remeasureFonts());

export { monaco };
