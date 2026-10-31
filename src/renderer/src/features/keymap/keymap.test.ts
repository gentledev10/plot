import { describe, expect, it } from 'vitest';
import {
  assignStroke,
  commandsByStroke,
  findConflict,
  parseOverrides,
  removeStroke,
  resetCommand,
  resolveBindings,
} from './keymap';

describe('resolveBindings', () => {
  it('uses the defaults until a command is customized', () => {
    const bindings = resolveBindings({ 'diff.nextFile': ['Alt+Meta+ArrowRight'] });
    expect(bindings['diff.nextDifference']).toEqual(['F7']);
    expect(bindings['diff.nextFile']).toEqual(['Alt+Meta+ArrowRight']);
    expect(bindings['review.generate']).toEqual([]);
  });

  it('finds the command for a stroke', () => {
    const commands = commandsByStroke(resolveBindings({}));
    expect(commands.get('Shift+F7')).toBe('diff.previousDifference');
    expect(commands.get('Meta+K')).toBeUndefined();
  });
});

describe('assignStroke', () => {
  it('adds a shortcut next to the existing ones', () => {
    const overrides = assignStroke({}, 'diff.nextDifference', 'Alt+Meta+ArrowDown');
    expect(resolveBindings(overrides)['diff.nextDifference']).toEqual(['F7', 'Alt+Meta+ArrowDown']);
  });

  it('takes the shortcut away from the command that had it', () => {
    const overrides = assignStroke({}, 'review.generate', 'Meta+2');
    const bindings = resolveBindings(overrides);
    expect(bindings['review.generate']).toEqual(['Meta+2']);
    expect(bindings['view.toggleReview']).toEqual([]);
    expect(findConflict(bindings, 'Meta+2', 'review.generate')).toBeUndefined();
  });

  it('stores only what differs from the defaults', () => {
    const removed = removeStroke({}, 'diff.nextDifference', 'F7');
    expect(removed).toEqual({ 'diff.nextDifference': [] });
    expect(assignStroke(removed, 'diff.nextDifference', 'F7')).toEqual({});
  });
});

describe('resetCommand', () => {
  it('restores the defaults and frees them from other commands', () => {
    let overrides = assignStroke({}, 'review.generate', 'Meta+2');
    overrides = resetCommand(overrides, 'view.toggleReview');
    const bindings = resolveBindings(overrides);
    expect(bindings['view.toggleReview']).toEqual(['Meta+2']);
    expect(bindings['review.generate']).toEqual([]);
  });
});

describe('parseOverrides', () => {
  it('keeps valid shortcuts for known commands', () => {
    expect(
      parseOverrides({ 'diff.nextFile': ['Meta+Alt+ArrowRight'], 'diff.previousFile': [] }),
    ).toEqual({ 'diff.nextFile': ['Alt+Meta+ArrowRight'], 'diff.previousFile': [] });
  });

  it('drops unknown commands, invalid shortcuts, and duplicates', () => {
    expect(
      parseOverrides({
        'removed.command': ['Meta+K'],
        'diff.nextFile': ['Meta+K', 'Meta+K', 'Hyper+K', 42],
        'diff.previousFile': 'Meta+J',
      }),
    ).toEqual({ 'diff.nextFile': ['Meta+K'] });
  });

  it('rejects stored values that are not an object', () => {
    expect(parseOverrides(['F7'])).toBeUndefined();
    expect(parseOverrides('F7')).toBeUndefined();
    expect(parseOverrides(null)).toBeUndefined();
  });
});
