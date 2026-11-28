import { describe, it, expect } from 'vitest';
import { watchVisitTiming } from './visitTiming.js';

function visit() {
  let time = 0;
  const target = new EventTarget();
  const events = [];
  const cleanup = watchVisitTiming({ target, now: () => time,
    send: (type, fields) => events.push({ type, ...fields }) });
  const hide = (persisted = false) => {
    const event = new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: persisted });
    target.dispatchEvent(event);
  };
  return { target, events, cleanup, hide, at: value => { time = value; } };
}

describe('elapsed visit timing', () => {
  it('sends elapsed seconds once even if pagehide is repeated', () => {
    const run = visit();
    run.at(12_400);
    run.hide();
    run.at(30_000);
    run.hide();
    expect(run.events).toEqual([{ type: 'session_end', duration_s: 12 }]);
  });
  it('does not end a cached page; restoration preserves the original start', () => {
    const run = visit();
    run.at(10_000);
    run.hide(true);
    expect(run.events).toEqual([]);
    run.target.dispatchEvent(new Event('pageshow'));
    run.at(60_000);
    run.hide();
    expect(run.events).toEqual([{ type: 'session_end', duration_s: 60 }]);
  });
  it('does not pretend hidden or idle time is active play time', () => {
    const run = visit();
    run.target.dispatchEvent(new Event('visibilitychange'));
    run.at(90_000);
    run.hide();
    expect(run.events).toEqual([{ type: 'session_end', duration_s: 90 }]);
  });
  it('cleanup does not invent an exit and detaches the listener', () => {
    const run = visit();
    run.cleanup();
    run.hide();
    expect(run.events).toEqual([]);
  });
});
