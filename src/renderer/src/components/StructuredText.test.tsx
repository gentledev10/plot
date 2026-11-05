import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';
import { StructuredText } from './StructuredText';

describe('StructuredText', () => {
  it.each([
    ['line separator in an unordered list', '- first\u2028continued', '<ul><li>first</li></ul>'],
    [
      'paragraph separator in an unordered list',
      '- first\u2029continued',
      '<ul><li>first</li></ul>',
    ],
    [
      'line separator in an ordered list',
      '1. first\u2028continued',
      '<ol start="1"><li>first</li></ol>',
    ],
    [
      'paragraph separator in an ordered list',
      '1. first\u2029continued',
      '<ol start="1"><li>first</li></ol>',
    ],
  ])('renders a %s without blocking', async (_name, text, list) => {
    const source = readFileSync('src/renderer/src/components/StructuredText.tsx', 'utf8');
    const { code } = await transformWithOxc(source, 'StructuredText.tsx', {
      jsx: { runtime: 'classic' },
    });
    const script = new Script(
      `${code.replace(/^import styles from .*;$/m, '').replace(/export function /g, 'function ')}
      renderToStaticMarkup(React.createElement(StructuredText, { text }));`,
    );
    // A synchronous parser loop must be interrupted outside the test runner's event loop.
    const html = script.runInNewContext(
      { React, renderToStaticMarkup, styles: { prose: 'prose' }, text },
      { timeout: 200 },
    );
    expect(html).toBe(`<div class="prose">${list}<p>continued</p></div>`);
  });

  it('keeps incomplete list markers and unmatched formatting as literal text', () => {
    const text = '1. \n- \n**unfinished\n`unfinished';
    const { container } = render(<StructuredText text={text} />);
    expect(container.querySelector('ol, ul, strong, code')).toBeNull();
    expect(container).toHaveTextContent('1. - **unfinished `unfinished');
  });

  it('renders inline emphasis and code without interpreting HTML or links', () => {
    const text =
      '**Important** and *uncertain* with `a < b` and <img src=x onerror=alert(1)> [open](javascript:alert(1))';
    const { container } = render(<StructuredText text={text} />);
    expect(screen.getByText('Important').tagName).toBe('STRONG');
    expect(screen.getByText('uncertain').tagName).toBe('EM');
    expect(screen.getByText('a < b').tagName).toBe('CODE');
    expect(container.querySelector('img, a, script')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)> [open](javascript:alert(1))');
  });
});
