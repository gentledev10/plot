import { describe, expect, it } from 'vitest';
import { createTranslator, korean } from './translations';

describe('user-facing translations', () => {
  it.each([
    ['Review changes', '변경 내용 확인하기'],
    ['Custom steps for the whole PR', '전체 PR에 대한 사용자 지정 단계'],
    ['Not modeled', '모델에 포함되지 않음'],
    ['Dependency failure', '의존 대상 오류'],
    ['At a glance', '한눈에 보기'],
    ['Could not load {value0}', '불러올 수 없습니다: {value0}'],
    ['Could not open {value0}', '열 수 없습니다: {value0}'],
    ['Pull request scope', '풀 리퀘스트 표시 범위'],
    ['Open folder', '폴더 열기'],
    [
      'These apply while macOS uses this appearance.',
      'macOS가 이 화면 모드를 사용하는 동안 적용됩니다.',
    ],
    [
      'Give each custom step a title or instructions before generating.',
      '리뷰를 생성하기 전에 각 사용자 지정 단계의 제목이나 요청 내용을 입력해 주세요.',
    ],
    [
      'The AI overview did not include every custom step. Generate it again.',
      'AI 리뷰에 일부 사용자 지정 단계가 빠졌습니다. 다시 생성해 주세요.',
    ],
    [
      'Order, titles of built-in steps and visibility update saved reviews immediately. Instructions, detail and custom steps apply when you generate again. Hidden steps are still analyzed.',
      '순서, 기본 단계의 제목, 표시 여부는 저장된 리뷰에 바로 적용됩니다. 지침·분량·사용자 지정 단계 변경은 리뷰를 다시 생성할 때 반영됩니다. 숨긴 단계도 분석에는 포함됩니다.',
    ],
    [
      'Add up to {count} custom steps. Changes never start an AI analysis automatically.',
      '사용자 지정 단계를 최대 {count}개 추가할 수 있습니다. 구성을 바꿔도 AI 분석이 자동으로 실행되지 않습니다.',
    ],
    [
      'Your installed Codex returned only retired models for ChatGPT sign-in. Update Codex, then reload models.',
      '설치된 Codex가 ChatGPT 로그인에서 지원이 종료된 모델만 반환했습니다. Codex를 업데이트한 뒤 모델 목록을 다시 불러와 주세요.',
    ],
  ])('uses precise Korean for "%s"', (source, expected) => {
    expect(createTranslator('ko')(source)).toBe(expected);
    expect(createTranslator('en')(source)).toBe(source);
  });

  it('preserves every interpolation token in Korean translations', () => {
    const tokens = (text: string) =>
      [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
    for (const [source, translated] of Object.entries(korean)) {
      expect(tokens(translated), source).toEqual(tokens(source));
    }
  });

  it('keeps the open pull request state separate from the folder picker action', () => {
    const t = createTranslator('ko');
    expect(t('Open')).toBe('열림');
    expect(t('Open folder')).not.toBe(t('Open'));
  });
});
