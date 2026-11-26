export function patientDate(value) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '—';
  const [, year, month, day] = match;
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
  return monthName ? `${year}-${monthName}-${day}` : '—';
}

export function appointmentTime(record) {
  const match = record.scheduled_at?.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return '—';
  const [, date, hour, minute] = match;
  return `${date} ${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`;
}

export function callTime(value, timeZone) {
  if (!value) return '—';
  const date = new Date(value + (/(Z|[+-]\d{2}:\d{2})$/.test(value) ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}
