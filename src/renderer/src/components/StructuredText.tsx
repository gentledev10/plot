import type { ReactNode } from 'react';
import styles from './StructuredText.module.css';

export function InlineText({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, index) => {
    const key = index;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/** A deliberately small text-only format; never interprets HTML or links. */
export function StructuredText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
  let index = 0;
  while (index < lines.length) {
    if (!lines[index]?.trim()) {
      index += 1;
      continue;
    }
    const marker = /^\s*(?:([-+*]) |(\d+)[.)] )(.+)$/.exec(lines[index] ?? '');
    const start = index;
    if (marker) {
      const ordered = marker[2] !== undefined;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^\s*(?:([-+*]) |(\d+)[.)] )(.+)$/.exec(lines[index] ?? '');
        if (!item || (item[2] !== undefined) !== ordered) break;
        items.push(
          <li key={index}>
            <InlineText text={item[3] ?? ''} />
          </li>,
        );
        index += 1;
      }
      blocks.push(
        ordered ? (
          <ol key={start} start={Number(marker[2])}>
            {items}
          </ol>
        ) : (
          <ul key={start}>{items}</ul>
        ),
      );
    } else {
      const paragraph: string[] = [];
      while (
        index < lines.length &&
        lines[index]?.trim() &&
        !/^\s*(?:[-+*] |\d+[.)] ).+/.test(lines[index] ?? '')
      ) {
        paragraph.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push(
        <p key={start}>
          <InlineText text={paragraph.join('\n')} />
        </p>,
      );
    }
  }
  return <div className={`${styles.prose}${className ? ` ${className}` : ''}`}>{blocks}</div>;
}
