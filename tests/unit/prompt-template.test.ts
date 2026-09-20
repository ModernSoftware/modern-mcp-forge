import { describe, expect, test } from 'bun:test';
import { renderPromptTemplate } from '$lib/server/project/prompt-source-service';

describe('renderPromptTemplate', () => {
  test('replaces known placeholders', () => {
    expect(
      renderPromptTemplate(
        'Review {{ language }} code for {{focus}}.',
        {
          language: 'TypeScript',
          focus: 'security'
        }
      )
    ).toBe('Review TypeScript code for security.');
  });

  test('keeps unknown placeholders visible', () => {
    expect(
      renderPromptTemplate('Hello {{name}} {{missing}}', { name: 'Diego' })
    ).toBe('Hello Diego {{missing}}');
  });

  test('supports underscores and hyphens in placeholder names', () => {
    expect(
      renderPromptTemplate('{{first_name}}/{{second-name}}', {
        first_name: 'A',
        'second-name': 'B'
      })
    ).toBe('A/B');
  });

  test('does not interpret unrelated braces', () => {
    expect(renderPromptTemplate('{name} {{{name}}}', { name: 'A' })).toBe('{name} {A}');
  });
});
