export function researchCsrfToken() {
  const name = 'hn_research_csrf=';
  return (
    document.cookie
      .split('; ')
      .find((part) => part.startsWith(name))
      ?.slice(name.length) ?? ''
  );
}

export function researchHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('x-hydronexus-csrf', researchCsrfToken());
  return headers;
}
