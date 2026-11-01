import type { CSSProperties, ReactNode } from 'react';
import styles from './AppearancePreview.module.css';
import { type CodeFont, type CustomColor, codeFontStack } from './appearance';
import type { Theme } from './themes';

type Token = 'keyword' | 'string' | 'number' | 'comment';

interface Line {
  id: string;
  kind: 'same' | 'inserted' | 'deleted' | 'modified' | 'filler';
  code?: ReactNode;
}

const LINE_PARTS: Partial<Record<Line['kind'], CustomColor>> = {
  inserted: 'diff-inserted-line',
  modified: 'diff-modified-line',
  deleted: 'diff-deleted-line',
};

const MARKER_PARTS: Partial<Record<Line['kind'], CustomColor>> = {
  inserted: 'diff-inserted-marker',
  modified: 'diff-modified-marker',
  deleted: 'diff-deleted-marker',
};

interface AppearancePreviewProps {
  theme: Theme;
  font: CodeFont;
  highlight?: CustomColor;
}

export function AppearancePreview({ theme, font, highlight }: AppearancePreviewProps) {
  const active = (part: CustomColor | undefined) => part !== undefined && part === highlight;
  const token = (kind: Token, text: string) => (
    <span style={{ color: `#${theme.syntax.find((rule) => rule.token === kind)?.foreground}` }}>
      {text}
    </span>
  );
  const changed = (children: ReactNode) => (
    <span className={styles.word} data-active={active('diff-modified-word')}>
      {children}
    </span>
  );
  const imports = (
    <>
      {token('keyword', 'import')} {'{ send }'} {token('keyword', 'from')}{' '}
      {token('string', "'./client'")}
      {';'}
    </>
  );
  const comment = token('comment', '// Send again after a pause');
  const call = <>{token('keyword', 'await')} send(hook);</>;
  const sides: { id: string; lines: Line[] }[] = [
    {
      id: 'original',
      lines: [
        { id: 'import', kind: 'same', code: imports },
        {
          id: 'tries',
          kind: 'modified',
          code: (
            <>
              {token('keyword', 'const')} tries = {changed(token('number', '3'))}
              {';'}
            </>
          ),
        },
        { id: 'log', kind: 'deleted', code: <>log({token('string', "'retrying'")});</> },
        { id: 'wait', kind: 'filler' },
        { id: 'comment', kind: 'same', code: comment },
        { id: 'send', kind: 'same', code: call },
      ],
    },
    {
      id: 'modified',
      lines: [
        { id: 'import', kind: 'same', code: imports },
        {
          id: 'tries',
          kind: 'modified',
          code: (
            <>
              {token('keyword', 'const')} tries = {changed(token('number', '5'))}
              {';'}
            </>
          ),
        },
        { id: 'log', kind: 'filler' },
        {
          id: 'wait',
          kind: 'inserted',
          code: (
            <>
              {token('keyword', 'await')} wait({token('number', '500')});
            </>
          ),
        },
        { id: 'comment', kind: 'same', code: comment },
        { id: 'send', kind: 'same', code: call },
      ],
    },
  ];

  return (
    <figure className={styles.preview} aria-label="Preview">
      <div className={styles.window}>
        <div className={styles.sidebar}>
          <p className={styles.heading}>Changed files</p>
          <p className={styles.file} data-selected="true">
            retry.ts
          </p>
          <p className={styles.file}>backoff.ts</p>
          <p className={styles.link} data-active={active('color-accent')}>
            Pull request #412
          </p>
        </div>
        <div
          className={styles.diff}
          data-active={active('color-bg-editor')}
          style={
            {
              '--preview-foreground': theme.editor['editor.foreground'],
              '--preview-line-number': theme.editor['editorLineNumber.foreground'],
              '--preview-fill': theme.editor['diffEditor.diagonalFill'],
              '--preview-line-height': `${Math.round(font.size * 1.54)}px`,
              fontFamily: codeFontStack(font.family),
              fontSize: font.size,
            } as CSSProperties
          }
        >
          {sides.map((side) => (
            <div key={side.id} className={styles.pane}>
              <div className={styles.lines}>
                {numbered(side.lines).map(({ line, number }) => (
                  <div
                    key={line.id}
                    className={styles.line}
                    data-kind={line.kind}
                    data-active={active(LINE_PARTS[line.kind])}
                  >
                    <span className={styles.number}>{number}</span>
                    <span className={styles.code}>{line.code}</span>
                  </div>
                ))}
              </div>
              <div className={styles.ruler}>
                {side.lines.map((line) => (
                  <span
                    key={line.id}
                    className={styles.mark}
                    data-kind={line.kind}
                    data-active={active(MARKER_PARTS[line.kind])}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function numbered(lines: Line[]): { line: Line; number: string }[] {
  let count = 0;
  return lines.map((line) => {
    if (line.kind === 'filler') {
      return { line, number: '' };
    }
    count += 1;
    return { line, number: String(count) };
  });
}
