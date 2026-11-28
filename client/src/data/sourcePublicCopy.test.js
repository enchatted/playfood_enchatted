import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { containsInternalNote } from '../../test-fixtures/public-copy.js';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../public/source.html', import.meta.url), 'utf8');
const data = html.slice(html.indexOf('const RHEA ='), html.indexOf('function get(name)'));
const { sources, why } = vm.runInNewContext(`${data}; ({ sources: SOURCES, why: WHY })`);

describe('source viewer contains public explanations and citations', () => {
  it('does not render internal review history or unavailable repository paths', () => {
    const visible = [...Object.values(sources).flatMap((source) => source.pages), ...Object.values(why)];
    expect(visible.filter(containsInternalNote)).toEqual([]);
  });

  it('retains the limitation on the approved residual-waste example', () => {
    const manual = sources['ypen-home-composting'].pages.join(' ');
    expect(manual).toContain('δεν φέρει σαφή σήμανση ότι είναι βιοαποδομήσιμη');
    expect(manual).toContain('not a general rule');
  });
});
