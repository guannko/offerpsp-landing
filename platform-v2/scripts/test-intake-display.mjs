import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chronologicalIntakeEvents, intakeClock, intakeDestination, intakeEventText, intakeNow } from '../src/lib/intakeDisplay.ts';

test('history is chronological without mutating the newest-first snapshot', () => {
  const events = [{ id:'later',created_at:'2026-09-16T19:00:00Z' },{ id:'earlier',created_at:'2026-09-16T18:00:00Z' }];
  assert.deepEqual(chronologicalIntakeEvents(events).map(e=>e.id), ['earlier','later']);
  assert.equal(events[0].id,'later');
});
test('clock uses Cyprus including date rollover and never invents missing times', () => {
  assert.deepEqual(intakeClock('2026-09-16T22:30:00Z'), {day:'17.09.2026',time:'01:30:00'});
  assert.equal(intakeClock(null),null); assert.equal(intakeClock('invalid'),null);
});
test('attention links keep the exact merchant and use implemented tabs', () => {
  const id='34568765-2c28-42ad-9e1a-ab294f5ff132';
  for (const [key,tab] of Object.entries({task:'tasks',screening:'compliance',decision:'compliance',matching:'matching',email:'communications',workspace:'preview'})) {
    assert.equal(intakeDestination(key,id).href,`/merchants/${id}?tab=${tab}`);
  }
  assert.equal(intakeDestination('telegram',id),null);
  assert.equal(intakeDestination('callbacks',id),null);
});
test('archive and expired processing do not look like successful completion', () => {
  assert.equal(intakeNow({lead:{record_state:'archived'}}).title,'Заявка в архиве');
  const s={lead:{record_state:'active',status:'new'},actions:[],observed_at:'2026-09-16T20:00:00Z',screening:{status:'screening',lease_until:'2026-09-16T19:00:00Z'}};
  assert.equal(intakeNow(s).title,'Проверка не завершена вовремя');
});
test('translated events preserve actual receipt and unknown event title', () => {
  assert.equal(intakeEventText({activity_type:'telegram_intake_action',detail:'Nothing sent'}).detail,'Nothing sent');
  assert.equal(intakeEventText({activity_type:'custom',title:'Original audit event'}).title,'Original audit event');
});
