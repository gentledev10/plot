import type { ReviewCodeSelection, ReviewRange } from '@shared/review-unit';
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { codeFontStack, editorTheme, editorThemeName } from '../appearance/appearance';
import { useCommand } from '../keymap/KeymapProvider';
import {
  anchorLine,
  type ChangeDecoration,
  type ChangeKind,
  changeDecorations,
  type Direction,
  findAdjacentChange,
  type LineChange,
} from './changes';
import styles from './DiffViewer.module.css';
import { languageForPath } from './language';
import { monaco } from './monaco';
import './diff-colors.css';

export interface ChangePosition {
  index: number;
  total: number;
}

export interface DiffViewerHandle {
  goToChange(direction: Direction): ChangePosition | undefined;
}

export interface LineRequest {
  line: number;
  key: number | string;
  side?: 'original' | 'modified';
}

export interface DiffSettings {
  collapseUnchanged: boolean;
  ignoreWhitespace: boolean;
  sideBySide: boolean;
}

interface DiffViewerProps {
  path: string;
  original: string;
  modified: string;
  settings: DiffSettings;
  initialChange?: 'first' | 'last';
  revealLine?: LineRequest;
  onChangesComputed?(total: number): void;
  onReveal?(position: ChangePosition): void;
  ref?: Ref<DiffViewerHandle>;
  focusRanges?: { original: ReviewRange[]; modified: ReviewRange[] };
  onCodeSelection?(selection: ReviewCodeSelection | undefined): void;
}

const EDITOR_OPTIONS: monaco.editor.IStandaloneDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  automaticLayout: true,
  renderIndicators: false,
  renderMarginRevertIcon: false,
  renderGutterMenu: false,
  useInlineViewWhenSpaceIsLimited: false,
  diffAlgorithm: 'advanced',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  occurrencesHighlight: 'singleFile',
  stickyScroll: { enabled: false },
  scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
  unicodeHighlight: {
    ambiguousCharacters: true,
    invisibleCharacters: true,
    nonBasicASCII: false,
    allowedLocales: { _os: true, _vscode: true },
  },
};

const MARKER_VARIABLES: Record<ChangeKind, string> = {
  inserted: '--diff-inserted-marker',
  modified: '--diff-modified-marker',
  deleted: '--diff-deleted-marker',
};

export function DiffViewer({
  path,
  original,
  modified,
  settings,
  initialChange,
  revealLine,
  onChangesComputed,
  onReveal,
  ref,
  focusRanges,
  onCodeSelection,
}: DiffViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const decorationsRef = useRef<DecorationCollections | null>(null);
  const changes = useRef<LineChange[]>([]);
  const caretTouched = useRef(false);
  const pendingJump = useRef(initialChange);
  const latest = useRef({ settings, onChangesComputed, onReveal, onCodeSelection, path });
  latest.current = { settings, onChangesComputed, onReveal, onCodeSelection, path };
  const { theme, colors, appearance } = useAppearance();
  const { family, size } = appearance.codeFont;

  const decorate = useCallback(() => {
    const collections = decorationsRef.current;
    if (!collections) {
      return;
    }
    const enabled = latest.current.settings.sideBySide;
    collections.original.set(
      enabled ? toMonaco(changeDecorations(changes.current, 'original')) : [],
    );
    collections.modified.set(
      enabled ? toMonaco(changeDecorations(changes.current, 'modified')) : [],
    );
  }, []);

  useEffect(() => {
    if (!container.current) {
      return;
    }
    const editor = monaco.editor.createDiffEditor(container.current, EDITOR_OPTIONS);
    editorRef.current = editor;
    decorationsRef.current = {
      original: editor.getOriginalEditor().createDecorationsCollection(),
      modified: editor.getModifiedEditor().createDecorationsCollection(),
      focusOriginal: editor.getOriginalEditor().createDecorationsCollection(),
      focusModified: editor.getModifiedEditor().createDecorationsCollection(),
    };

    const diffUpdates = editor.onDidUpdateDiff(() => {
      changes.current = (editor.getLineChanges() ?? []) as LineChange[];
      decorate();
      const total = changes.current.length;
      latest.current.onChangesComputed?.(total);
      if (pendingJump.current && total > 0) {
        const index = pendingJump.current === 'first' ? 0 : total - 1;
        pendingJump.current = undefined;
        reveal(editor, changes.current, index);
        caretTouched.current = true;
        latest.current.onReveal?.({ index, total });
      }
    });
    const caretMoves = editor.getModifiedEditor().onDidChangeCursorPosition((event) => {
      if (event.source !== 'api') {
        caretTouched.current = true;
      }
    });

    const selections = (['original', 'modified'] as const).map((side) => {
      const source = side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor();
      return source.onDidChangeCursorSelection((event) => {
        if (event.source === 'api') return;
        const range = event.selection;
        const endLine =
          range.endLineNumber -
          Number(range.endColumn === 1 && range.endLineNumber > range.startLineNumber);
        latest.current.onCodeSelection?.(
          endLine - range.startLineNumber < 120
            ? {
                path: latest.current.path,
                side,
                startLine: range.startLineNumber,
                endLine,
              }
            : undefined,
        );
      });
    });
    return () => {
      diffUpdates.dispose();
      caretMoves.dispose();
      for (const selection of selections) selection.dispose();
      editor.dispose();
      editorRef.current = null;
      decorationsRef.current = null;
    };
  }, [decorate]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const language = languageForPath(path, monaco.languages.getLanguages());
    const previous = editor.getModel();
    caretTouched.current = false;
    editor.setModel({
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    });
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [path, original, modified]);

  useEffect(() => {
    pendingJump.current = initialChange;
  }, [initialChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine) {
      return;
    }
    pendingJump.current = undefined;
    const modified =
      revealLine.side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor();
    modified.setPosition({ lineNumber: revealLine.line, column: 1 });
    modified.revealLineInCenter(revealLine.line);
    caretTouched.current = true;
  }, [revealLine]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: decorations must be reapplied after replacing models, even when their ranges are unchanged
  useEffect(() => {
    const editor = editorRef.current;
    const collections = decorationsRef.current;
    if (!editor || !collections) return;
    for (const side of ['original', 'modified'] as const) {
      const model =
        side === 'original'
          ? editor.getOriginalEditor().getModel()
          : editor.getModifiedEditor().getModel();
      const count = model?.getLineCount() ?? 0;
      const decorations = (focusRanges?.[side] ?? [])
        .filter((range) => range.startLine <= count)
        .map((range) => ({
          range: new monaco.Range(range.startLine, 1, Math.min(range.endLine, count), 1),
          options: { isWholeLine: true, linesDecorationsClassName: 'review-unit-line-marker' },
        }));
      (side === 'original' ? collections.focusOriginal : collections.focusModified).set(
        decorations,
      );
    }
  }, [focusRanges, path, original, modified]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      hideUnchangedRegions: { enabled: settings.collapseUnchanged },
      ignoreTrimWhitespace: settings.ignoreWhitespace,
      renderSideBySide: settings.sideBySide,
    });
  }, [settings.collapseUnchanged, settings.ignoreWhitespace, settings.sideBySide]);

  useEffect(() => {
    const data = editorTheme(theme, colors, settings.sideBySide);
    const name = editorThemeName(data);
    monaco.editor.defineTheme(name, data);
    monaco.editor.setTheme(name);
    decorate();
  }, [theme, colors, settings.sideBySide, decorate]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontFamily: codeFontStack(family),
      fontSize: size,
      lineHeight: Math.round(size * 1.54),
    });
    void document.fonts.load(`${size}px "${family}"`).then(
      () => monaco.editor.remeasureFonts(),
      () => {},
    );
  }, [family, size]);

  function runEditorAction(actionId: string) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const original = editor.getOriginalEditor();
    const target = original.hasTextFocus() ? original : editor.getModifiedEditor();
    target.focus();
    void target.getAction(actionId)?.run();
  }

  useCommand('editor.goToLine', () => runEditorAction('editor.action.gotoLine'));
  useCommand('editor.extendSelection', () => runEditorAction('editor.action.smartSelect.expand'));
  useCommand('editor.shrinkSelection', () => runEditorAction('editor.action.smartSelect.shrink'));

  useImperativeHandle(
    ref,
    () => ({
      goToChange(direction) {
        const editor = editorRef.current;
        if (!editor) {
          return undefined;
        }
        const line = caretTouched.current
          ? (editor.getModifiedEditor().getPosition()?.lineNumber ?? 0)
          : 0;
        const index = findAdjacentChange(changes.current, line, direction);
        if (index === undefined) {
          return undefined;
        }
        reveal(editor, changes.current, index);
        caretTouched.current = true;
        return { index, total: changes.current.length };
      },
    }),
    [],
  );

  return <div ref={container} className={styles.viewer} data-testid="diff-viewer" />;
}

interface DecorationCollections {
  original: monaco.editor.IEditorDecorationsCollection;
  modified: monaco.editor.IEditorDecorationsCollection;
  focusOriginal: monaco.editor.IEditorDecorationsCollection;
  focusModified: monaco.editor.IEditorDecorationsCollection;
}

function reveal(editor: monaco.editor.IStandaloneDiffEditor, changes: LineChange[], index: number) {
  const change = changes[index];
  if (!change) {
    return;
  }
  const line = anchorLine(change);
  const modified = editor.getModifiedEditor();
  modified.setPosition({ lineNumber: line, column: 1 });
  modified.revealLineInCenterIfOutsideViewport(line);
}

function toMonaco(decorations: ChangeDecoration[]): monaco.editor.IModelDeltaDecoration[] {
  const styles = getComputedStyle(document.documentElement);
  return decorations.map((decoration) => {
    const range = new monaco.Range(
      decoration.startLineNumber,
      decoration.startColumn,
      decoration.endLineNumber,
      decoration.endColumn,
    );
    if (!decoration.wholeLine) {
      return { range, options: { inlineClassName: `diff-word-${decoration.kind}` } };
    }
    return {
      range,
      options: {
        isWholeLine: true,
        className: `diff-line-${decoration.kind}`,
        marginClassName: `diff-line-${decoration.kind}`,
        overviewRuler: {
          color: styles.getPropertyValue(MARKER_VARIABLES[decoration.kind]).trim(),
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    };
  });
}
