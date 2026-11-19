const AUTOMATION_USER_AGENT =
  /bot|crawl|spider|slurp|headless|phantom|lighthouse|prerender|curl|wget|python|httpclient|meta-externalagent|meta-externalfetcher|go-http-client/i;

export function ignoreAnonymousAnalytics(headers: Headers): boolean {
  return (
    headers.get('x-readfox-engaged') !== '1' ||
    AUTOMATION_USER_AGENT.test(headers.get('user-agent') ?? '')
  );
}
