export function collectionStatus(data) {
  if (!data) return { warning: false, text: 'Collection diagnostics are unavailable.' };
  const rejected = data.unauthorized + data.invalid + data.rateLimited + data.dailyCap;
  const date = new Date(data.since).toLocaleString('en-GB');
  const accepted = data.accepted
    ? `${data.accepted} accepted requests (including duplicate deliveries).`
    : 'No accepted requests observed yet.';
  const detail = rejected
    ? `${rejected} rejected requests: ${data.unauthorized} authentication, ${data.invalid} invalid event, ${data.rateLimited} rate limit, ${data.dailyCap} daily cap.`
    : 'No rejected requests observed.';
  return { warning: false, text: `Request totals since ${date}: ${accepted} ${detail} These totals cover all periods and languages and can include installation checks or staff tests. Past rejections alone do not establish lost game activity. Node counters reset on server restart; PHP counters persist across restarts. These counters cannot detect events that never reached the server.` };
}
